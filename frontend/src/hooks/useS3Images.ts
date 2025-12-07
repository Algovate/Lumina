import { useState, useEffect, useCallback, useRef } from 'react';
import type { S3Image } from '../types';
import { s3Service } from '../services/s3Service';
import { IMAGE_CONSTANTS } from '../constants';
import type { SortBy, SortOrder } from '../components/SortSelector';

interface UseS3ImagesOptions {
  enabled?: boolean;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
}

export const useS3Images = (folderPath: string = '', options: UseS3ImagesOptions = {}) => {
  const { enabled = true, sortBy = 'date', sortOrder = 'desc' } = options;
  const [images, setImages] = useState<S3Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null);

  // Use refs to track current folder path and sort options to detect changes
  const currentFolderPathRef = useRef<string>(folderPath);
  const currentSortByRef = useRef<SortBy>(sortBy);
  const currentSortOrderRef = useRef<SortOrder>(sortOrder);

  /**
   * Check if folder or sort options have changed and update refs
   * @returns Object indicating what changed
   */
  const checkAndUpdateRefs = useCallback(() => {
    const folderChanged = currentFolderPathRef.current !== folderPath;
    const sortChanged = currentSortByRef.current !== sortBy || currentSortOrderRef.current !== sortOrder;

    // Update refs to current values
    if (folderChanged) {
      currentFolderPathRef.current = folderPath;
    }
    if (sortChanged) {
      currentSortByRef.current = sortBy;
      currentSortOrderRef.current = sortOrder;
    }

    return { folderChanged, sortChanged, anyChanged: folderChanged || sortChanged };
  }, [folderPath, sortBy, sortOrder]);

  /**
   * Reset pagination state when folder or sort changes
   */
  const resetPaginationState = useCallback(() => {
    setImages([]);
    setNextContinuationToken(null);
    setHasMore(false);
  }, []);

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

    // Check for changes and reset if needed
    const { anyChanged } = checkAndUpdateRefs();
    if (anyChanged) {
      if (isLoadMore) {
        // 如果是在加载更多时文件夹或排序改变了，不应该继续
        return;
      }
      resetPaginationState();
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
        isLoadMore ? (token || undefined) : undefined,
        sortBy,
        sortOrder
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
  }, [folderPath, enabled, sortBy, sortOrder, checkAndUpdateRefs, resetPaginationState]);

  // Load images when dependencies change
  useEffect(() => {
    loadImages(false);
  }, [loadImages]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && nextContinuationToken) {
      loadImages(true, nextContinuationToken);
    }
  }, [loadingMore, hasMore, nextContinuationToken, loadImages]);

  const refreshImages = useCallback(() => {
    // 刷新时重置分页状态
    resetPaginationState();
    loadImages(false);
  }, [loadImages, resetPaginationState]);

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
