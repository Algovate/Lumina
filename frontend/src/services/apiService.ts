import type { PresignedUrlResponse } from '../types';
import { getApiUrl } from '../utils/config';

export interface PresignedUrlRequest {
  operation: 'get' | 'put' | 'delete';
  key: string;
  contentType?: string;
  expiresIn?: number; // in seconds, default 3600
}

export const apiService = {
  async getPresignedUrl(request: PresignedUrlRequest): Promise<PresignedUrlResponse> {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    return response.json();
  },
};

