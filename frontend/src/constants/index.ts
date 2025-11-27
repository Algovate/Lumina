/**
 * Application Constants
 */

/**
 * Slideshow Configuration
 */
export const SLIDESHOW_CONSTANTS = {
  // Default slideshow interval (in milliseconds)
  DEFAULT_INTERVAL: 3000, // 3 seconds
} as const;

/**
 * Image Configuration
 */
export const IMAGE_CONSTANTS = {
  // Maximum image size for upload (in bytes)
  // Note: This is a client-side check, actual limits should be enforced server-side
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100 MB
  // Number of images to load per page for infinite scroll
  IMAGES_PER_PAGE: 50,
} as const;

