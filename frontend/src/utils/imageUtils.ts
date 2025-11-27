import type { S3Image } from '../types';

/**
 * Filter images by search query and tags
 */
export const filterImages = (
  images: S3Image[],
  query: string,
  selectedTags: string[] = []
): S3Image[] => {
  let filtered = images;

  // Filter by tags (AND logic - image must have all selected tags)
  if (selectedTags.length > 0) {
    filtered = filtered.filter((image) => {
      const imageTags = (image.tags || []).map((tag) => tag.toLowerCase());
      return selectedTags.every((selectedTag) =>
        imageTags.includes(selectedTag.toLowerCase())
      );
    });
  }

  // Filter by search query
  if (!query.trim()) {
    return filtered;
  }

  const lowerQuery = query.toLowerCase();

  // Check if query contains tag: prefix
  if (lowerQuery.startsWith('tag:')) {
    const tagQuery = lowerQuery.substring(4).trim();
    return filtered.filter((image) => {
      const imageTags = (image.tags || []).map((tag) => tag.toLowerCase());
      return imageTags.some((tag) => tag.includes(tagQuery));
    });
  }

  // Regular search (by name and tags)
  return filtered.filter((image) => {
    const nameMatch = image.name.toLowerCase().includes(lowerQuery);
    const tagMatch = (image.tags || []).some((tag) =>
      tag.toLowerCase().includes(lowerQuery)
    );
    return nameMatch || tagMatch;
  });
};

/**
 * Format file size to human readable string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Check if file is an image
 */
export const isImageFile = (fileName: string): boolean => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const lowerFileName = fileName.toLowerCase();
  return imageExtensions.some((ext) => lowerFileName.endsWith(ext));
};

