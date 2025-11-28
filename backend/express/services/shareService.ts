import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { SHARE_CONSTANTS } from '../constants';
import { logger } from '../utils/logger';

// Initialize DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = process.env.SHARES_TABLE_NAME || SHARE_CONSTANTS.SHARES_TABLE_NAME;

/**
 * Share record structure in DynamoDB
 */
export interface ShareRecord {
  shareToken: string; // Partition key
  imageKey: string;
  createdAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
  createdBy?: string; // User ID (optional)
}

/**
 * Generate a secure random token
 */
function generateShareToken(): string {
  const bytes = randomBytes(SHARE_CONSTANTS.TOKEN_BYTES);
  // Convert to base64url (URL-safe base64)
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create a share token for an image
 */
export async function createShareToken(
  imageKey: string,
  expiresInDays: number = SHARE_CONSTANTS.DEFAULT_SHARE_EXPIRY_DAYS,
  createdBy?: string
): Promise<string> {
  try {
    // Validate expiry days
    const validExpiresInDays = Math.min(
      Math.max(1, expiresInDays),
      SHARE_CONSTANTS.MAX_SHARE_EXPIRY_DAYS
    );

    const now = Date.now();
    const expiresAt = now + validExpiresInDays * 24 * 60 * 60 * 1000;

    // Generate unique token
    let shareToken: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      shareToken = generateShareToken();
      attempts++;

      // Check if token already exists (very unlikely but handle it)
      try {
        const existing = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { shareToken },
          })
        );

        if (!existing.Item) {
          break; // Token is unique
        }
      } catch (error) {
        // If table doesn't exist yet, we'll create the record anyway
        // The error will be caught below
        break;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique share token after multiple attempts');
      }
    } while (true);

    // Create share record
    const shareRecord: ShareRecord = {
      shareToken,
      imageKey,
      createdAt: now,
      expiresAt,
      ...(createdBy && { createdBy }),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: shareRecord,
      })
    );

    logger.info(`Created share token for image: ${imageKey}, expires at: ${new Date(expiresAt).toISOString()}`);
    return shareToken;
  } catch (error) {
    logger.error(`Error creating share token for ${imageKey}:`, error);
    throw error;
  }
}

/**
 * Get share information by token
 */
export async function getShareInfo(token: string): Promise<ShareRecord | null> {
  try {
    const response = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { shareToken: token },
      })
    );

    if (!response.Item) {
      return null;
    }

    const shareRecord = response.Item as ShareRecord;

    // Check if expired
    if (shareRecord.expiresAt < Date.now()) {
      logger.info(`Share token ${token} has expired`);
      return null;
    }

    return shareRecord;
  } catch (error) {
    logger.error(`Error getting share info for token ${token}:`, error);
    throw error;
  }
}

/**
 * Delete a share token
 */
export async function deleteShareToken(token: string): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { shareToken: token },
      })
    );

    logger.info(`Deleted share token: ${token}`);
  } catch (error) {
    logger.error(`Error deleting share token ${token}:`, error);
    throw error;
  }
}

