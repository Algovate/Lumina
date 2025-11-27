import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// 支持的图片格式
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const THUMBNAIL_PREFIX = 'thumbnails/';
export const THUMBNAIL_SIZE = 200;

/**
 * 检查文件是否为图片
 */
export function isImageFile(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some(ext => lowerKey.endsWith(ext));
}

/**
 * 检查是否为缩略图文件（避免递归处理）
 */
export function isThumbnailFile(key: string): boolean {
  return key.startsWith(THUMBNAIL_PREFIX);
}

/**
 * 生成缩略图路径
 */
export function getThumbnailKey(originalKey: string): string {
  return `${THUMBNAIL_PREFIX}${originalKey}`;
}

/**
 * 检查缩略图是否已存在
 */
export async function thumbnailExists(
  s3Client: S3Client,
  bucketName: string,
  thumbnailKey: string
): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: thumbnailKey,
    }));
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * 为单个图片生成缩略图
 */
export async function generateThumbnail(
  s3Client: S3Client,
  bucketName: string,
  imageKey: string
): Promise<{ success: boolean; thumbnailKey?: string; error?: string }> {
  // 跳过缩略图文件，避免递归处理
  if (isThumbnailFile(imageKey)) {
    return { success: false, error: 'Skipping thumbnail file' };
  }

  // 只处理图片文件
  if (!isImageFile(imageKey)) {
    return { success: false, error: 'Not an image file' };
  }

  const thumbnailKey = getThumbnailKey(imageKey);

  // 检查缩略图是否已存在
  if (await thumbnailExists(s3Client, bucketName, thumbnailKey)) {
    return { success: false, error: 'Thumbnail already exists', thumbnailKey };
  }

  try {
    // 下载原图
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: imageKey,
    });

    const response = await s3Client.send(getObjectCommand);
    
    if (!response.Body) {
      throw new Error('Empty response body');
    }

    // 将流转换为 Buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const imageBuffer = Buffer.concat(chunks);

    // 使用 Sharp 生成缩略图
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 上传缩略图到 S3
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000', // 1 year cache
      Metadata: {
        'original-key': imageKey,
        'thumbnail-size': `${THUMBNAIL_SIZE}x${THUMBNAIL_SIZE}`,
      },
    });

    await s3Client.send(putObjectCommand);
    return { success: true, thumbnailKey };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

