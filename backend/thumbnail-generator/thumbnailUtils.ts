import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// 支持的图片格式
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const THUMBNAIL_PREFIX = 'thumbnails/';
export const THUMBNAIL_SIZE = 200;
export const PREVIEW_PREFIX = 'previews/';
export const PREVIEW_MAX_WIDTH = 1920;
export const PREVIEW_MAX_HEIGHT = 1080;
export const PREVIEW_QUALITY = 85;

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
 * 检查是否为预览图文件（避免递归处理）
 */
export function isPreviewFile(key: string): boolean {
  return key.startsWith(PREVIEW_PREFIX);
}

/**
 * 检查是否为生成的图片文件（缩略图或预览图）
 */
export function isGeneratedImageFile(key: string): boolean {
  return isThumbnailFile(key) || isPreviewFile(key);
}

/**
 * 生成缩略图路径
 */
export function getThumbnailKey(originalKey: string): string {
  return `${THUMBNAIL_PREFIX}${originalKey}`;
}

/**
 * 生成预览图路径
 */
export function getPreviewKey(originalKey: string): string {
  return `${PREVIEW_PREFIX}${originalKey}`;
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
 * 检查预览图是否已存在
 */
export async function previewExists(
  s3Client: S3Client,
  bucketName: string,
  previewKey: string
): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: previewKey,
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

/**
 * 为单个图片生成预览图（中等尺寸，用于幻灯片）
 */
export async function generatePreview(
  s3Client: S3Client,
  bucketName: string,
  imageKey: string
): Promise<{ success: boolean; previewKey?: string; error?: string }> {
  // 跳过生成的图片文件，避免递归处理
  if (isGeneratedImageFile(imageKey)) {
    return { success: false, error: 'Skipping generated image file' };
  }

  // 只处理图片文件
  if (!isImageFile(imageKey)) {
    return { success: false, error: 'Not an image file' };
  }

  const previewKey = getPreviewKey(imageKey);

  // 检查预览图是否已存在
  if (await previewExists(s3Client, bucketName, previewKey)) {
    return { success: false, error: 'Preview already exists', previewKey };
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

    // 获取原图尺寸
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || PREVIEW_MAX_WIDTH;
    const originalHeight = metadata.height || PREVIEW_MAX_HEIGHT;

    // 计算缩放后的尺寸，保持宽高比
    let targetWidth = PREVIEW_MAX_WIDTH;
    let targetHeight = PREVIEW_MAX_HEIGHT;
    
    if (originalWidth <= PREVIEW_MAX_WIDTH && originalHeight <= PREVIEW_MAX_HEIGHT) {
      // 如果原图已经小于预览图尺寸，使用原图尺寸
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    } else {
      // 计算缩放比例，保持宽高比
      const widthRatio = PREVIEW_MAX_WIDTH / originalWidth;
      const heightRatio = PREVIEW_MAX_HEIGHT / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);
      
      targetWidth = Math.round(originalWidth * ratio);
      targetHeight = Math.round(originalHeight * ratio);
    }

    // 使用 Sharp 生成预览图
    const previewBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside', // 保持宽高比，确保图片完全在目标尺寸内
        withoutEnlargement: true, // 如果原图更小，不放大
      })
      .jpeg({ quality: PREVIEW_QUALITY })
      .toBuffer();

    // 上传预览图到 S3
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: previewKey,
      Body: previewBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000', // 1 year cache
      Metadata: {
        'original-key': imageKey,
        'preview-size': `${targetWidth}x${targetHeight}`,
        'original-size': `${originalWidth}x${originalHeight}`,
      },
    });

    await s3Client.send(putObjectCommand);
    return { success: true, previewKey };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 为单个图片同时生成缩略图和预览图
 */
export async function generateThumbnailAndPreview(
  s3Client: S3Client,
  bucketName: string,
  imageKey: string
): Promise<{
  thumbnail: { success: boolean; thumbnailKey?: string; error?: string };
  preview: { success: boolean; previewKey?: string; error?: string };
}> {
  // 并行生成缩略图和预览图
  const [thumbnailResult, previewResult] = await Promise.all([
    generateThumbnail(s3Client, bucketName, imageKey),
    generatePreview(s3Client, bucketName, imageKey),
  ]);

  return {
    thumbnail: thumbnailResult,
    preview: previewResult,
  };
}

