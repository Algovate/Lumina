/**
 * S3 Configuration Constants
 */
export const S3_CONSTANTS = {
  // Presigned URL expiration time (in seconds)
  PRESIGNED_URL_EXPIRATION: 3600, // 1 hour
  
  // Maximum presigned URL expiration (in seconds)
  MAX_PRESIGNED_URL_EXPIRATION: 3600, // 1 hour
  
  // Batch size for processing S3 objects
  BATCH_SIZE: 10,
  
  // Maximum S3 key length
  MAX_KEY_LENGTH: 1024,
} as const;

/**
 * Rate Limiting Constants
 */
export const RATE_LIMIT_CONSTANTS = {
  // Time window for rate limiting (in milliseconds)
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  
  // Maximum requests per window
  MAX_REQUESTS: 100,
} as const;

/**
 * Tag Constants
 */
export const TAG_CONSTANTS = {
  // Maximum tag length
  MAX_TAG_LENGTH: 50,
} as const;

