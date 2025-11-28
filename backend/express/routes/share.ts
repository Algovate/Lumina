import express from 'express';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateS3Key } from '../utils/validation';
import { getErrorMessage } from '../types/errors';
import { S3_CONSTANTS } from '../constants';
import { logger } from '../utils/logger';
import {
  createShareToken,
  getShareInfo,
  deleteShareToken,
} from '../services/shareService';
import {
  getImageMetadata,
  metadataToS3Image,
} from '../services/dynamodbService';

const router = express.Router();

// Initialize S3 client and bucket name from environment
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';
const THUMBNAIL_PREFIX = 'thumbnails/';
const PREVIEW_PREFIX = 'previews/';

/**
 * Get thumbnail key for an image
 */
function getThumbnailKey(originalKey: string): string {
  return `${THUMBNAIL_PREFIX}${originalKey}`;
}

/**
 * Get preview key for an image
 */
function getPreviewKey(originalKey: string): string {
  return `${PREVIEW_PREFIX}${originalKey}`;
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
    logger.error(`Error checking thumbnail existence for ${thumbnailKey}:`, error);
    return false;
  }
}

/**
 * Check if preview exists for an image
 */
async function previewExists(previewKey: string): Promise<boolean> {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: previewKey,
    });
    await s3Client.send(headCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    logger.error(`Error checking preview existence for ${previewKey}:`, error);
    return false;
  }
}

/**
 * Create a share link for an image
 * POST /api/share/create
 * Requires authentication (middleware should be applied in server.ts)
 */
router.post('/create', async (req, res, next) => {
  try {
    const { imageKey, expiresInDays } = req.body;

    if (!imageKey) {
      return res.status(400).json({ error: 'Missing required field: imageKey' });
    }

    // Validate S3 key
    try {
      validateS3Key(imageKey);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid key' });
    }

    // Verify image exists
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: imageKey,
      });
      await s3Client.send(headCommand);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Image not found' });
      }
      throw error;
    }

    // Get user ID from request (set by auth middleware)
    const userId = (req as any).user?.sub || undefined;

    // Create share token
    const shareToken = await createShareToken(
      imageKey,
      expiresInDays,
      userId
    );

    // Get share info to return expiresAt
    const shareInfo = await getShareInfo(shareToken);
    if (!shareInfo) {
      return res.status(500).json({ error: 'Failed to retrieve share information' });
    }

    // Generate share URL (frontend will construct the full URL)
    const shareUrl = `/share/${shareToken}`;

    res.json({
      shareToken,
      shareUrl,
      expiresAt: shareInfo.expiresAt,
    });
  } catch (error: unknown) {
    logger.error('Error creating share:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to create share',
      details: errorMessage,
    });
  }
});

/**
 * Get share information and image details
 * GET /api/share/:token
 * Public endpoint (no authentication required)
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Missing share token' });
    }

    // Get share info
    const shareInfo = await getShareInfo(token);
    if (!shareInfo) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    // Verify image still exists
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: shareInfo.imageKey,
      });
      await s3Client.send(headCommand);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Image not found' });
      }
      throw error;
    }

    // Try to get image metadata from DynamoDB
    let imageMetadata = null;
    try {
      imageMetadata = await getImageMetadata(shareInfo.imageKey);
    } catch (error) {
      // If metadata doesn't exist, we'll construct from S3 object
      logger.debug(`No metadata found for ${shareInfo.imageKey}, will use S3 object info`);
    }

    // Generate presigned URLs
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: shareInfo.imageKey,
    });
    const imageUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION,
    });

    // Get thumbnail URL if available
    let thumbnailUrl: string | undefined;
    const thumbnailKey = getThumbnailKey(shareInfo.imageKey);
    if (await thumbnailExists(thumbnailKey)) {
      const thumbnailCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: thumbnailKey,
      });
      thumbnailUrl = await getSignedUrl(s3Client, thumbnailCommand, {
        expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION,
      });
    }

    // Get preview URL if available
    let previewUrl: string | undefined;
    const previewKey = getPreviewKey(shareInfo.imageKey);
    if (await previewExists(previewKey)) {
      const previewCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: previewKey,
      });
      previewUrl = await getSignedUrl(s3Client, previewCommand, {
        expiresIn: S3_CONSTANTS.PRESIGNED_URL_EXPIRATION,
      });
    }

    // Get S3 object metadata for fallback
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: shareInfo.imageKey,
    });
    const s3Object = await s3Client.send(headCommand);

    // Construct response
    const imageName = shareInfo.imageKey.split('/').pop() || shareInfo.imageKey;
    const imageSize = s3Object.ContentLength || 0;
    const lastModified = s3Object.LastModified || new Date();

    res.json({
      imageKey: shareInfo.imageKey,
      imageUrl,
      thumbnailUrl,
      previewUrl,
      name: imageName,
      size: imageSize,
      lastModified,
      tags: imageMetadata?.tags || [],
    });
  } catch (error: unknown) {
    logger.error('Error getting share info:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to get share information',
      details: errorMessage,
    });
  }
});

/**
 * Delete a share link
 * DELETE /api/share/:token
 * Requires authentication
 */
router.delete('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Missing share token' });
    }

    // Get share info to verify it exists
    const shareInfo = await getShareInfo(token);
    if (!shareInfo) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Optional: Verify user owns the share (if createdBy is set)
    const userId = (req as any).user?.sub;
    if (shareInfo.createdBy && userId && shareInfo.createdBy !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this share' });
    }

    // Delete share token
    await deleteShareToken(token);

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error deleting share:', error);
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to delete share',
      details: errorMessage,
    });
  }
});

export default router;

