import { useState, useEffect, useCallback, useRef } from 'react';
import type { S3Image } from '../types';
import { s3Service } from '../services/s3Service';
import { IMAGE_CONSTANTS } from '../constants';

interface UseS3ImagesOptions {
  enabled?: boolean;
}

export const useS3Images = (folderPath: string = '', options: UseS3ImagesOptions = {}) => {
  const { enabled = true } = options;
  const [images, setImages] = useState<S3Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null);
  
  // Use ref to track current folder path to detect changes
  const currentFolderPathRef = useRef<string>(folderPath);

  const loadImages = useCallback(async (isLoadMore: boolean = false, token?: string | null) => {
    // 如果未启用（未认证），不加载
    if (!enabled) {
      setLoading(false);
      setLoadingMore(false);
      setImages([]);
      setError(null);
      setHasMore(false);
      setNextContinuationToken(null);
      return;
    }

    // 如果文件夹路径改变，重置状态
    if (currentFolderPathRef.current !== folderPath) {
      currentFolderPathRef.current = folderPath;
      if (isLoadMore) {
        // 如果是在加载更多时文件夹改变了，不应该继续
        return;
      }
      setImages([]);
      setNextContinuationToken(null);
      setHasMore(false);
    }

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await s3Service.listImagesPaginated(
        folderPath,
        IMAGE_CONSTANTS.IMAGES_PER_PAGE,
        isLoadMore ? (token || undefined) : undefined
      );

      if (isLoadMore) {
        // 追加新图片到现有列表
        setImages((prev) => [...prev, ...(data.images || [])]);
      } else {
        // 替换现有图片列表
        setImages(data.images || []);
      }

      setHasMore(data.isTruncated || false);
      setNextContinuationToken(data.nextContinuationToken || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载图片失败';
      // 如果是未授权错误，不显示错误（因为会显示登录界面）
      if (!errorMessage.includes('未授权')) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [folderPath, enabled]);

  useEffect(() => {
    // 当文件夹路径改变时，重置并重新加载
    if (currentFolderPathRef.current !== folderPath) {
      currentFolderPathRef.current = folderPath;
      setImages([]);
      setNextContinuationToken(null);
      setHasMore(false);
    }
    loadImages(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath, enabled]); // loadImages 的依赖项已经包含 folderPath 和 enabled，所以这里不需要添加

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && nextContinuationToken) {
      loadImages(true, nextContinuationToken);
    }
  }, [loadingMore, hasMore, nextContinuationToken, loadImages]);

  const refreshImages = useCallback(() => {
    // 刷新时重置分页状态
    setNextContinuationToken(null);
    setHasMore(false);
    loadImages(false);
  }, [loadImages]);

  return { 
    images, 
    loading, 
    loadingMore,
    error, 
    hasMore,
    loadMore,
    refreshImages 
  };
};

