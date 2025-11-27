import express from 'express';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { validateS3Key, validateTags } from '../utils/validation';
import { getErrorMessage } from '../types/errors';
import { S3_CONSTANTS } from '../constants';
import { logger } from '../utils/logger';

const router = express.Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';

/**
 * Normalize tags: convert to lowercase, trim, deduplicate
 */
function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    )
  );
}

/**
 * Serialize tags array to JSON string
 */
function serializeTags(tags: string[]): string {
  return JSON.stringify(normalizeTags(tags));
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
      return Array.isArray(tags) ? normalizeTags(tags) : [];
    } catch (error) {
      logger.error('Error parsing tags from metadata:', error);
      return [];
    }
  } catch (error) {
    logger.error(`Error getting tags for ${key}:`, error);
    return [];
  }
}

// Get tags for a specific image
router.get('/image/:key/tags', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

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

    const tags = await getObjectTags(key);
    res.json({ tags });
  } catch (error) {
    logger.error('Error getting image tags:', error);
    res.status(500).json({ error: 'Failed to get image tags' });
  }
});

// Update tags for a specific image
router.put('/image/:key/tags', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const { tags } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Missing required field: key' });
    }

    // Validate S3 key
    try {
      validateS3Key(key);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    // Validate tags
    let validatedTags: string[];
    try {
      validatedTags = validateTags(tags);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid tags' });
    }

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    // Normalize tags
    const normalizedTags = normalizeTags(validatedTags);

    // Get current object metadata and content type
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const headResponse = await s3Client.send(headCommand);

    // Get object content
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const getResponse = await s3Client.send(getCommand);
    const body = await getResponse.Body?.transformToByteArray();

    if (!body) {
      return res.status(500).json({ error: 'Failed to read object body' });
    }

    // Prepare new metadata (preserve existing metadata, update tags)
    const existingMetadata = headResponse.Metadata || {};
    const newMetadata: Record<string, string> = { ...existingMetadata };
    newMetadata['tags'] = serializeTags(normalizedTags);

    // Use CopyObjectCommand to update metadata (S3 doesn't support direct metadata updates)
    const copyCommand = new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${key}`,
      Key: key,
      Metadata: newMetadata,
      MetadataDirective: 'REPLACE',
      ContentType: headResponse.ContentType || 'application/octet-stream',
    });

    await s3Client.send(copyCommand);

    res.json({ success: true, tags: normalizedTags });
  } catch (error) {
    logger.error('Error updating image tags:', error);
    res.status(500).json({ error: 'Failed to update image tags' });
  }
});

// Get all tags with usage counts
router.get('/tags', async (req, res) => {
  try {
    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const tagCounts: Record<string, number> = {};
    let continuationToken: string | undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);

      if (response.Contents) {
        // Batch get tags (limit concurrency to avoid too many requests)
        const batchSize = S3_CONSTANTS.BATCH_SIZE;
        for (let i = 0; i < response.Contents.length; i += batchSize) {
          const batch = response.Contents.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (object) => {
              if (object.Key && !object.Key.endsWith('/')) {
                try {
                  const tags = await getObjectTags(object.Key);
                  tags.forEach((tag) => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                  });
                } catch (error) {
                  logger.error(`Error getting tags for ${object.Key}:`, error);
                }
              }
            })
          );
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Convert to array format and sort by usage count
    const tags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ tags });
  } catch (error: unknown) {
    logger.error('Error getting all tags:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to get tags',
      details: errorMessage,
    });
  }
});

export default router;

