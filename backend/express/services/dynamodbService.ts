import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  UpdateCommand,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { DYNAMODB_CONSTANTS, type SortBy, type SortOrder } from '../constants';
import { logger } from '../utils/logger';
import type { S3ImageResponse } from '../types/api';

/** DynamoDB key type for pagination */
type DynamoDBKey = Record<string, NativeAttributeValue>;

/** Expression attribute value types based on ImageMetadata fields */
type ExpressionValue = string | number | string[] | undefined;

// Initialize DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || DYNAMODB_CONSTANTS.TABLE_NAME;

/**
 * Image metadata item structure in DynamoDB
 */
export interface ImageMetadata {
  key: string; // Partition key
  name: string;
  size: number;
  lastModified: number; // Unix timestamp
  tags?: string[];
  tagCount: number;
  folder: string; // For GSI partition key
  thumbnailUrl?: string;
  previewUrl?: string;
  updatedAt: number; // Unix timestamp
}

/**
 * Create or update image metadata
 */
export async function createImageMetadata(metadata: ImageMetadata): Promise<void> {
  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...metadata,
        updatedAt: Date.now(),
      },
    });
    await docClient.send(command);
  } catch (error) {
    logger.error(`Error creating image metadata for ${metadata.key}:`, error);
    throw error;
  }
}

/**
 * Update image metadata (partial update)
 */
export async function updateImageMetadata(
  key: string,
  updates: Partial<Omit<ImageMetadata, 'key' | 'updatedAt'>>
): Promise<void> {
  try {
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, ExpressionValue> = {};

    Object.entries(updates).forEach(([field, value]) => {
      const nameKey = `#${field}`;
      const valueKey = `:${field}`;
      updateExpression.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = value;
    });

    // Always update updatedAt
    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = Date.now();

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { key },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await docClient.send(command);
  } catch (error) {
    logger.error(`Error updating image metadata for ${key}:`, error);
    throw error;
  }
}

/**
 * Get image metadata by key
 */
export async function getImageMetadata(key: string): Promise<ImageMetadata | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { key },
    });
    const response = await docClient.send(command);
    return (response.Item as ImageMetadata) || null;
  } catch (error) {
    logger.error(`Error getting image metadata for ${key}:`, error);
    throw error;
  }
}

/**
 * Delete image metadata
 */
export async function deleteImageMetadata(key: string): Promise<void> {
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { key },
    });
    await docClient.send(command);
  } catch (error) {
    logger.error(`Error deleting image metadata for ${key}:`, error);
    throw error;
  }
}

/**
 * List images with sorting and pagination
 */
export async function listImagesWithSort(
  folder: string = '',
  sortBy: SortBy = 'date',
  sortOrder: SortOrder = 'desc',
  limit: number = DYNAMODB_CONSTANTS.DEFAULT_PAGE_SIZE,
  lastEvaluatedKey?: DynamoDBKey
): Promise<{
  items: ImageMetadata[];
  lastEvaluatedKey?: DynamoDBKey;
}> {
  try {
    // Determine which GSI to use based on sortBy
    let indexName: string;
    let sortKey: string;

    switch (sortBy) {
      case 'name':
        indexName = DYNAMODB_CONSTANTS.GSI_NAME;
        sortKey = 'name';
        break;
      case 'date':
        indexName = DYNAMODB_CONSTANTS.GSI_DATE;
        sortKey = 'lastModified';
        break;
      case 'size':
        indexName = DYNAMODB_CONSTANTS.GSI_SIZE;
        sortKey = 'size';
        break;
      case 'tags':
        indexName = DYNAMODB_CONSTANTS.GSI_TAGS;
        sortKey = 'tagCount';
        break;
      default:
        indexName = DYNAMODB_CONSTANTS.GSI_DATE;
        sortKey = 'lastModified';
    }

    // For ascending order, we need to scan forward
    // For descending order, we scan forward but reverse the results
    // DynamoDB doesn't support reverse scan, so we'll query forward and reverse if needed
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: indexName,
      KeyConditionExpression: '#folder = :folder',
      ExpressionAttributeNames: {
        '#folder': 'folder',
      },
      ExpressionAttributeValues: {
        ':folder': folder,
      },
      ScanIndexForward: sortOrder === 'asc', // true for ascending, false for descending
      Limit: limit,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await docClient.send(command);

    return {
      items: (response.Items as ImageMetadata[]) || [],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  } catch (error) {
    logger.error(`Error listing images with sort (${sortBy}, ${sortOrder}):`, error);
    throw error;
  }
}

/**
 * Batch write image metadata
 */
export async function batchWriteImageMetadata(
  items: ImageMetadata[]
): Promise<void> {
  try {
    // DynamoDB batch write limit is 25 items
    const batchSize = DYNAMODB_CONSTANTS.BATCH_WRITE_SIZE;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const writeRequests = batch.map((item) => ({
        PutRequest: {
          Item: {
            ...item,
            updatedAt: Date.now(),
          },
        },
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: writeRequests,
        },
      });

      await docClient.send(command);
    }
  } catch (error) {
    logger.error('Error batch writing image metadata:', error);
    throw error;
  }
}

/**
 * Convert S3ImageResponse to ImageMetadata
 */
export function s3ImageToMetadata(
  image: S3ImageResponse,
  folder: string = ''
): ImageMetadata {
  return {
    key: image.key,
    name: image.name,
    size: image.size,
    lastModified: image.lastModified instanceof Date
      ? image.lastModified.getTime()
      : new Date(image.lastModified).getTime(),
    tags: image.tags || [],
    tagCount: (image.tags || []).length,
    folder: folder || image.folder || '',
    thumbnailUrl: image.thumbnailUrl,
    previewUrl: image.previewUrl,
    updatedAt: Date.now(),
  };
}

/**
 * Convert ImageMetadata to S3ImageResponse
 */
export function metadataToS3Image(metadata: ImageMetadata, url: string): S3ImageResponse {
  return {
    key: metadata.key,
    name: metadata.name,
    size: metadata.size,
    lastModified: new Date(metadata.lastModified),
    url,
    thumbnailUrl: metadata.thumbnailUrl,
    previewUrl: metadata.previewUrl,
    folder: metadata.folder || undefined,
    tags: metadata.tags || [],
  };
}

/**
 * Get all unique tags with their usage counts from DynamoDB
 * This is much more efficient than scanning S3 objects individually
 */
export async function getAllTagsFromDynamoDB(): Promise<{ tag: string; count: number }[]> {
  try {
    const tagCounts: Record<string, number> = {};
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    // Scan the table with projection to only get tags (minimizes data transfer)
    do {
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'tags',
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await docClient.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          const tags = item.tags as string[] | undefined;
          if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    // Convert to array format and sort by usage count (descending)
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    logger.error('Error getting all tags from DynamoDB:', error);
    throw error;
  }
}
