/**
 * Migration script to populate DynamoDB with existing S3 image metadata
 * 
 * Usage:
 *   ts-node scripts/migrate-to-dynamodb.ts [prefix]
 * 
 * This script scans all images in S3 and creates corresponding entries in DynamoDB.
 */

import dotenv from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { batchWriteImageMetadata, s3ImageToMetadata } from '../services/dynamodbService';
import { S3_CONSTANTS } from '../constants';
import { logger } from '../utils/logger';
import type { S3ImageResponse } from '../types/api';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';
const THUMBNAIL_PREFIX = 'thumbnails/';
const PREVIEW_PREFIX = 'previews/';

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
      return [];
    }
  } catch (error) {
    return [];
  }
}

/**
 * Check if thumbnail exists
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
    return false;
  }
}

/**
 * Check if preview exists
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
    return false;
  }
}

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
 * Process a batch of S3 objects
 */
async function processBatch(
  objects: Array<{ Key?: string; Size?: number; LastModified?: Date }>,
  prefix: string
): Promise<S3ImageResponse[]> {
  const images: S3ImageResponse[] = [];
  const batchSize = S3_CONSTANTS.BATCH_SIZE;

  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (object) => {
        if (object.Key && !object.Key.endsWith('/') && 
            !object.Key.startsWith(THUMBNAIL_PREFIX) && 
            !object.Key.startsWith(PREVIEW_PREFIX)) {
          try {
            const tags = await getObjectTags(object.Key);
            
            // Check for thumbnail and preview
            const thumbnailKey = getThumbnailKey(object.Key);
            const previewKey = getPreviewKey(object.Key);
            const hasThumbnail = await thumbnailExists(thumbnailKey);
            const hasPreview = await previewExists(previewKey);

            const image: S3ImageResponse = {
              key: object.Key,
              name: object.Key.split('/').pop() || object.Key,
              size: object.Size || 0,
              lastModified: object.LastModified || new Date(),
              url: '', // URL will be generated on demand
              thumbnailUrl: hasThumbnail ? `thumbnails/${object.Key}` : undefined,
              previewUrl: hasPreview ? `previews/${object.Key}` : undefined,
              folder: prefix || undefined,
              tags,
            };

            images.push(image);
          } catch (error) {
            logger.error(`Error processing ${object.Key}:`, error);
          }
        }
      })
    );
  }

  return images;
}

/**
 * Main migration function
 */
async function migrate(prefix: string = '') {
  if (!BUCKET_NAME) {
    logger.error('S3_BUCKET not configured');
    process.exit(1);
  }

  logger.info(`Starting migration for prefix: ${prefix || '(root)'}`);
  
  let continuationToken: string | undefined;
  let totalProcessed = 0;
  let totalMigrated = 0;

  do {
    try {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents && response.Contents.length > 0) {
        logger.info(`Processing batch of ${response.Contents.length} objects...`);
        
        const images = await processBatch(response.Contents, prefix);
        totalProcessed += response.Contents.length;

        if (images.length > 0) {
          try {
            await batchWriteImageMetadata(
              images.map((img) => s3ImageToMetadata(img, prefix))
            );
            totalMigrated += images.length;
            logger.info(`Migrated ${images.length} images (Total: ${totalMigrated})`);
          } catch (error) {
            logger.error('Error batch writing to DynamoDB:', error);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } catch (error) {
      logger.error('Error during migration:', error);
      break;
    }
  } while (continuationToken);

  logger.info(`Migration completed. Processed: ${totalProcessed}, Migrated: ${totalMigrated}`);
}

// Run migration
const prefix = process.argv[2] || '';
migrate(prefix)
  .then(() => {
    logger.info('Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration script failed:', error);
    process.exit(1);
  });

