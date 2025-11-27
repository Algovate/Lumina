import express from 'express';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateS3Key, validateS3Prefix } from '../utils/validation';
import type { S3ImageResponse, FolderResponse } from '../types/api';
import { getErrorMessage } from '../types/errors';
import { S3_CONSTANTS } from '../constants';
import { logger } from '../utils/logger';

const router = express.Router();

// Initialize S3 client and bucket name from environment
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';
const THUMBNAIL_PREFIX = 'thumbnails/';

/**
 * Get thumbnail key for an image
 */
function getThumbnailKey(originalKey: string): string {
  return `${THUMBNAIL_PREFIX}${originalKey}`;
}

/**
 * Check if thumbnail exists for an image
 */
async function thumbnailExists(thumbnailKey: string): Promise<boolean> {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: thumbnailKey,
    });
    await s3Client.send(headCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Log other errors but don't fail
    logger.error(`Error checking thumbnail existence for ${thumbnailKey}:`, error);
    return false;
  }
}

/**
 * Get tags for an S3 object
 */
async function getObjectTags(key: string): Promise<string[]> {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(headCommand);
    
    const metadata = response.Metadata || {};
    const tagsMeta = metadata['x-amz-meta-tags'] || metadata['tags'];
    if (!tagsMeta) return [];
    
    try {
      const tags = JSON.parse(tagsMeta);
      return Array.isArray(tags) ? tags : [];
    } catch (error) {
      logger.error('Error parsing tags from metadata:', error);
      return [];
    }
  } catch (error) {
    logger.error(`Error getting tags for ${key}:`, error);
    return [];
  }
}

// List images
router.get('/list', async (req, res) => {
  try {
    let prefix = (req.query.prefix as string) || '';
    
    // Validate and sanitize prefix
    try {
      prefix = validateS3Prefix(prefix);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prefix' });
    }

    // Pagination parameters
    const maxKeys = Math.min(parseInt(req.query.maxKeys as string) || 100, 1000); // Default 100, max 1000
    const continuationToken = req.query.continuationToken as string | undefined;

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);
    const images: S3ImageResponse[] = [];

    if (response.Contents) {
      // 批量处理图片，获取标签和预签名 URL
      const batchSize = S3_CONSTANTS.BATCH_SIZE;
      for (let i = 0; i < response.Contents.length; i += batchSize) {
        const batch = response.Contents.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (object) => {
            if (object.Key && !object.Key.endsWith('/') && !object.Key.startsWith(THUMBNAIL_PREFIX)) {
              try {
                // 生成预签名 URL
                const getCommand = new GetObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: object.Key,
                });
                const url = await getSignedUrl(s3Client, getCommand, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });

                // 检查并生成缩略图 URL
                let thumbnailUrl: string | undefined;
                const thumbnailKey = getThumbnailKey(object.Key);
                if (await thumbnailExists(thumbnailKey)) {
                  try {
                    const thumbnailCommand = new GetObjectCommand({
                      Bucket: BUCKET_NAME,
                      Key: thumbnailKey,
                    });
                    thumbnailUrl = await getSignedUrl(s3Client, thumbnailCommand, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });
                  } catch (error) {
                    logger.error(`Error generating thumbnail URL for ${thumbnailKey}:`, error);
                    // Continue without thumbnail URL
                  }
                }

                // 获取标签
                const tags = await getObjectTags(object.Key);

                images.push({
                  key: object.Key,
                  name: object.Key.split('/').pop() || object.Key,
                  size: object.Size || 0,
                  lastModified: object.LastModified || new Date(),
                  url,
                  thumbnailUrl,
                  folder: prefix || undefined,
                  tags,
                });
              } catch (error) {
                logger.error(`Error processing image ${object.Key}:`, error);
                // 即使获取标签或预签名 URL 失败，也尝试添加图片（不带标签和 URL）
                try {
                  const getCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: object.Key,
                  });
                  const url = await getSignedUrl(s3Client, getCommand, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });
                  
                  // 尝试获取缩略图 URL
                  let thumbnailUrl: string | undefined;
                  const thumbnailKey = getThumbnailKey(object.Key);
                  if (await thumbnailExists(thumbnailKey)) {
                    try {
                      const thumbnailCommand = new GetObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: thumbnailKey,
                      });
                      thumbnailUrl = await getSignedUrl(s3Client, thumbnailCommand, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });
                    } catch (error) {
                      // Ignore thumbnail URL errors in fallback
                    }
                  }
                  
                  images.push({
                    key: object.Key,
                    name: object.Key.split('/').pop() || object.Key,
                    size: object.Size || 0,
                    lastModified: object.LastModified || new Date(),
                    url,
                    thumbnailUrl,
                    folder: prefix || undefined,
                    tags: [],
                  });
                } catch (fallbackError) {
                  // 如果连预签名 URL 也获取失败，仍然添加图片但标记为需要后续获取 URL
                  logger.error(`Failed to get presigned URL for ${object.Key} even in fallback:`, fallbackError);
                  images.push({
                    key: object.Key,
                    name: object.Key.split('/').pop() || object.Key,
                    size: object.Size || 0,
                    lastModified: object.LastModified || new Date(),
                    url: '', // 空 URL，前端可以稍后通过 presign 端点获取
                    folder: prefix || undefined,
                    tags: [],
                  });
                }
              }
            }
          })
        );
      }
    }

    // Return paginated response
    res.json({
      images,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken || null,
      keyCount: images.length,
    });
  } catch (error: unknown) {
    logger.error('Error listing images:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to list images',
      details: errorMessage,
    });
  }
});

// Get presigned URL (view)
router.post('/presign', async (req, res) => {
  try {
    const { operation, key } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Missing required field: key' });
    }

    // Validate S3 key
    try {
      validateS3Key(key);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });

    res.json({ url });
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// Get upload presigned URL
router.post('/presign-upload', async (req, res) => {
  try {
    const { key, contentType } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Missing required field: key' });
    }

    // Validate S3 key
    try {
      validateS3Key(key);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION });

    res.json({ url });
  } catch (error) {
    logger.error('Error generating upload presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate upload presigned URL' });
  }
});

// Delete file
router.delete('/delete', async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Missing required field: key' });
    }

    // Validate S3 key
    try {
      validateS3Key(key);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    // Delete the original file
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);

    // Also delete the thumbnail if it exists
    const thumbnailKey = getThumbnailKey(key);
    try {
      if (await thumbnailExists(thumbnailKey)) {
        const thumbnailCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: thumbnailKey,
        });
        await s3Client.send(thumbnailCommand);
        logger.info(`Deleted thumbnail: ${thumbnailKey}`);
      }
    } catch (error) {
      // Log error but don't fail the request if thumbnail deletion fails
      logger.error(`Error deleting thumbnail ${thumbnailKey}:`, error);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Move file
router.post('/move', async (req, res) => {
  try {
    const { oldKey, newKey } = req.body;

    if (!oldKey || !newKey) {
      return res.status(400).json({ error: 'Missing required fields: oldKey, newKey' });
    }

    // Validate S3 keys
    try {
      validateS3Key(oldKey);
      validateS3Key(newKey);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    // Copy to new location
    const copyCommand = new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${oldKey}`,
      Key: newKey,
    });

    await s3Client.send(copyCommand);

    // Delete old file
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: oldKey,
    });

    await s3Client.send(deleteCommand);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// List folders
router.get('/folders', async (req, res) => {
  try {
    let prefix = (req.query.prefix as string) || '';
    
    // Validate and sanitize prefix
    try {
      prefix = validateS3Prefix(prefix);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prefix' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);
    const folders: FolderResponse[] = [];

    if (response.CommonPrefixes) {
      for (const prefixObj of response.CommonPrefixes) {
        if (prefixObj.Prefix) {
          // 过滤掉 thumbnails/ 前缀的文件夹
          if (prefixObj.Prefix.startsWith(THUMBNAIL_PREFIX)) {
            continue;
          }
          const folderName = prefixObj.Prefix.replace(prefix, '').replace('/', '');
          folders.push({
            name: folderName,
            path: prefixObj.Prefix,
          });
        }
      }
    }

    res.json({ folders });
  } catch (error: unknown) {
    logger.error('Error listing folders:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to list folders',
      details: errorMessage,
    });
  }
});

// Create folder
router.post('/folder', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'Missing required field: path' });
    }

    // Validate and sanitize path
    let folderKey: string;
    try {
      folderKey = validateS3Prefix(path);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid path' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: folderKey,
    });

    await s3Client.send(command);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Delete folder
router.delete('/folder', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'Missing required field: path' });
    }

    // Validate and sanitize path
    let folderPrefix: string;
    try {
      folderPrefix = validateS3Prefix(path);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid path' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    // 列出文件夹中的所有对象
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: folderPrefix,
    });

    const listResponse = await s3Client.send(listCommand);

    // 删除所有对象
    if (listResponse.Contents) {
      for (const object of listResponse.Contents) {
        if (object.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key,
          });
          await s3Client.send(deleteCommand);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;

