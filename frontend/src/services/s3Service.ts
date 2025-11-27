import type { S3Image, Folder, TagInfo, PaginatedImageResponse } from '../types';
import { getApiUrl } from '../utils/config';
import { authService } from './authService';
import { logger } from '../utils/logger';

class S3Service {
  private apiUrl: string;

  constructor() {
    this.apiUrl = getApiUrl();
  }

  /**
   * 获取认证头
   */
  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await authService.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  /**
   * List images with pagination support
   * Returns paginated response with metadata about whether there are more pages
   */
  async listImagesPaginated(
    prefix: string = '',
    maxKeys?: number,
    continuationToken?: string
  ): Promise<PaginatedImageResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams({ prefix: encodeURIComponent(prefix) });
      if (maxKeys) params.append('maxKeys', maxKeys.toString());
      if (continuationToken) params.append('continuationToken', continuationToken);
      
      const response = await fetch(`${this.apiUrl}/s3/list?${params.toString()}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to list images: ${response.statusText}`);
      }

      const data: PaginatedImageResponse = await response.json();
      
      // 确保每个图片都有 URL
      for (const image of data.images || []) {
        if (!image.url) {
          try {
            image.url = await this.getPresignedUrl(image.key);
          } catch (error) {
            logger.error(`Failed to get presigned URL for ${image.key}:`, error);
          }
        }
      }
      
      return data;
    } catch (error) {
      logger.error('Error listing images:', error);
      throw error;
    }
  }

  /**
   * List all images in the bucket, optionally filtered by prefix (folder)
   * Note: This method loads all images by fetching multiple pages if needed
   * For better performance with large buckets, use listImagesPaginated instead
   */
  async listImages(prefix: string = '', maxKeys?: number, continuationToken?: string): Promise<S3Image[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams({ prefix: encodeURIComponent(prefix) });
      if (maxKeys) params.append('maxKeys', maxKeys.toString());
      if (continuationToken) params.append('continuationToken', continuationToken);
      
      const response = await fetch(`${this.apiUrl}/s3/list?${params.toString()}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to list images: ${response.statusText}`);
      }

      const data: PaginatedImageResponse = await response.json();
      let images = data.images || [];
      
      // If there are more pages and no maxKeys limit, fetch all pages
      // This maintains backward compatibility but can be optimized for large buckets
      if (data.isTruncated && data.nextContinuationToken && !maxKeys) {
        const nextPageImages = await this.listImages(prefix, undefined, data.nextContinuationToken);
        images = [...images, ...nextPageImages];
      }
      
      // 确保每个图片都有 URL
      for (const image of images) {
        if (!image.url) {
          try {
            image.url = await this.getPresignedUrl(image.key);
          } catch (error) {
            logger.error(`Failed to get presigned URL for ${image.key}:`, error);
          }
        }
      }
      
      return images;
    } catch (error) {
      logger.error('Error listing images:', error);
      throw error;
    }
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadFile(file: File, key: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      // 先获取预签名 URL
      const headers = await this.getAuthHeaders();
      const presignResponse = await fetch(`${this.apiUrl}/s3/presign-upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key,
          contentType: file.type,
        }),
      });

      if (!presignResponse.ok) {
        if (presignResponse.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to get presigned URL: ${presignResponse.statusText}`);
      }

      const { url } = await presignResponse.json();

      // 使用预签名 URL 上传文件
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 204) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', file.type);
        // 设置缓存控制头（图片文件：1年缓存，其他文件：1小时缓存）
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
        const cacheControl = isImage 
          ? 'max-age=31536000, public' 
          : 'max-age=3600, public';
        xhr.setRequestHeader('Cache-Control', cacheControl);
        xhr.send(file);
      });
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/delete`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to delete file: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Move/copy file to a new location (for organizing)
   */
  async moveFile(oldKey: string, newKey: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/move`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          oldKey,
          newKey,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to move file: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error moving file:', error);
      throw error;
    }
  }

  /**
   * List folders (prefixes) in the bucket
   */
  async listFolders(prefix: string = ''): Promise<Folder[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/folders?prefix=${encodeURIComponent(prefix)}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to list folders: ${response.statusText}`);
      }

      const data = await response.json();
      return data.folders || [];
    } catch (error) {
      logger.error('Error listing folders:', error);
      throw error;
    }
  }

  /**
   * Create a folder (by creating an empty object with trailing slash)
   */
  async createFolder(path: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/folder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to create folder: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Delete a folder (delete all objects with the prefix)
   */
  async deleteFolder(path: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/folder`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to delete folder: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Download an image file
   * @param imageUrl The URL of the image to download (should be the original image URL)
   * @param fileName The filename to use for the downloaded file
   */
  async downloadImage(imageUrl: string, fileName: string): Promise<void> {
    try {
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      
      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      logger.error('Error downloading image:', error);
      throw error;
    }
  }

  /**
   * Get presigned URL for viewing an image
   */
  async getPresignedUrl(key: string): Promise<string> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operation: 'get',
          key,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to get presigned URL: ${response.statusText}`);
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      logger.error('Error getting presigned URL:', error);
      throw error;
    }
  }

  /**
   * Get tags for a specific image
   */
  async getImageTags(key: string): Promise<string[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/image/${encodeURIComponent(key)}/tags`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to get image tags: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      logger.error('Error getting image tags:', error);
      throw error;
    }
  }

  /**
   * Update tags for a specific image
   */
  async updateImageTags(key: string, tags: string[]): Promise<string[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/image/${encodeURIComponent(key)}/tags`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tags }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to update image tags: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      logger.error('Error updating image tags:', error);
      throw error;
    }
  }

  /**
   * Get all tags with their usage counts
   */
  async getAllTags(): Promise<TagInfo[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/s3/tags`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        throw new Error(`Failed to get tags: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      logger.error('Error getting all tags:', error);
      throw error;
    }
  }
}

export const s3Service = new S3Service();
