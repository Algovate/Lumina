import type { ShareInfo, ShareResponse } from '../types';
import { getApiUrl } from '../utils/config';
import { authService } from './authService';
import { logger } from '../utils/logger';

class ShareService {
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
   * Create a share link for an image
   * Requires authentication
   */
  async createShare(
    imageKey: string,
    expiresInDays?: number
  ): Promise<ShareResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/share/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageKey,
          expiresInDays,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create share: ${response.statusText}`);
      }

      const data: ShareResponse = await response.json();
      
      // Construct full share URL
      const fullShareUrl = `${window.location.origin}${data.shareUrl}`;
      
      return {
        ...data,
        shareUrl: fullShareUrl,
      };
    } catch (error) {
      logger.error('Error creating share:', error);
      throw error;
    }
  }

  /**
   * Get share information by token
   * Public endpoint (no authentication required)
   */
  async getShareInfo(token: string): Promise<ShareInfo> {
    try {
      const response = await fetch(`${this.apiUrl}/share/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get share info: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        ...data,
        lastModified: new Date(data.lastModified),
      };
    } catch (error) {
      logger.error('Error getting share info:', error);
      throw error;
    }
  }

  /**
   * Delete a share link
   * Requires authentication
   */
  async deleteShare(token: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/share/${token}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('未授权，请重新登录');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete share: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error deleting share:', error);
      throw error;
    }
  }
}

export const shareService = new ShareService();

