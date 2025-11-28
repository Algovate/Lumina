/**
 * S3 Configuration Constants
 */
export const S3_CONSTANTS = {
  // Presigned URL expiration time (in seconds)
  // Increased to 7 days to reduce regeneration frequency and improve caching
  // Note: Longer expiration improves cache efficiency but reduces security if URL is leaked
  PRESIGNED_URL_EXPIRATION: 7 * 24 * 3600, // 7 days
  
  // Maximum presigned URL expiration (in seconds)
  MAX_PRESIGNED_URL_EXPIRATION: 7 * 24 * 3600, // 7 days
  
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

/**
 * DynamoDB Constants
 */
export const DYNAMODB_CONSTANTS = {
  // DynamoDB table name
  TABLE_NAME: 'lumina-images',
  
  // GSI names
  GSI_NAME: 'GSI-name',
  GSI_DATE: 'GSI-date',
  GSI_SIZE: 'GSI-size',
  GSI_TAGS: 'GSI-tags',
  
  // Batch write size (DynamoDB limit is 25)
  BATCH_WRITE_SIZE: 25,
  
  // Query page size
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 1000,
} as const;

/**
 * Sort Options
 */
export type SortBy = 'name' | 'date' | 'size' | 'tags';
export type SortOrder = 'asc' | 'desc';

