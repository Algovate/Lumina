import { useState, useEffect, useCallback } from 'react';
import type { S3Image } from '../types';
import { s3Service } from '../services/s3Service';

interface UseS3ImagesOptions {
  enabled?: boolean;
}

export const useS3Images = (folderPath: string = '', options: UseS3ImagesOptions = {}) => {
  const { enabled = true } = options;
  const [images, setImages] = useState<S3Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    // 如果未启用（未认证），不加载
    if (!enabled) {
      setLoading(false);
      setImages([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const fetchedImages = await s3Service.listImages(folderPath);
      setImages(fetchedImages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载图片失败';
      // 如果是未授权错误，不显示错误（因为会显示登录界面）
      if (!errorMessage.includes('未授权')) {
        setError(errorMessage);
      }
      // Error is already handled in setError
    } finally {
      setLoading(false);
    }
  }, [folderPath, enabled]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const refreshImages = useCallback(() => {
    loadImages();
  }, [loadImages]);

  return { images, loading, error, refreshImages };
};

