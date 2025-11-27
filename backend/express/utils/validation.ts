import { S3_CONSTANTS, TAG_CONSTANTS } from '../constants';

/**
 * Validates S3 key to prevent path traversal attacks
 * @param key - The S3 key to validate
 * @returns true if valid, throws error if invalid
 */
export function validateS3Key(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid key: key must be a non-empty string');
  }

  // Prevent path traversal attacks
  if (key.includes('..') || key.includes('//') || key.startsWith('/')) {
    throw new Error('Invalid key: path traversal detected');
  }

  // Prevent null bytes
  if (key.includes('\0')) {
    throw new Error('Invalid key: null bytes not allowed');
  }

  // S3 keys should not exceed maximum length
  if (key.length > S3_CONSTANTS.MAX_KEY_LENGTH) {
    throw new Error(`Invalid key: key length exceeds maximum (${S3_CONSTANTS.MAX_KEY_LENGTH} characters)`);
  }

  // Prevent control characters (except newline, tab, carriage return)
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(key)) {
    throw new Error('Invalid key: control characters not allowed');
  }
}

/**
 * Validates and sanitizes S3 prefix (for folder paths)
 * @param prefix - The S3 prefix to validate
 * @returns Sanitized prefix
 */
export function validateS3Prefix(prefix: string): string {
  if (!prefix) {
    return '';
  }

  if (typeof prefix !== 'string') {
    throw new Error('Invalid prefix: must be a string');
  }

  // Remove leading/trailing slashes and normalize
  let sanitized = prefix.trim().replace(/^\/+|\/+$/g, '');

  // Prevent path traversal
  if (sanitized.includes('..') || sanitized.includes('//')) {
    throw new Error('Invalid prefix: path traversal detected');
  }

  // Add trailing slash if not empty
  if (sanitized && !sanitized.endsWith('/')) {
    sanitized += '/';
  }

  return sanitized;
}

/**
 * Validates that tags array contains only valid strings
 * @param tags - Array of tags to validate
 * @returns Validated tags array
 */
export function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    throw new Error('Tags must be an array');
  }

  return tags.map((tag, index) => {
    if (typeof tag !== 'string') {
      throw new Error(`Tag at index ${index} must be a string`);
    }
    if (tag.length > TAG_CONSTANTS.MAX_TAG_LENGTH) {
      throw new Error(`Tag at index ${index} exceeds maximum length (${TAG_CONSTANTS.MAX_TAG_LENGTH} characters)`);
    }
    return tag.trim();
  }).filter(tag => tag.length > 0);
}

