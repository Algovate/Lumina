import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '../types';
import { s3Service } from '../services/s3Service';

interface UseFoldersOptions {
  enabled?: boolean;
}

export const useFolders = (options: UseFoldersOptions = {}) => {
  const { enabled = true } = options;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async (prefix: string = '') => {
    // 如果未启用（未认证），不加载
    if (!enabled) {
      setLoading(false);
      setFolders([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const fetchedFolders = await s3Service.listFolders(prefix);
      setFolders(fetchedFolders);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载文件夹失败';
      // 如果是未授权错误，不显示错误（因为会显示登录界面）
      if (!errorMessage.includes('未授权')) {
        setError(errorMessage);
      }
      console.error('Error loading folders:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const createFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      try {
        const newPath = parentPath
          ? `${parentPath}${folderName}/`
          : `${folderName}/`;
        await s3Service.createFolder(newPath);
        await loadFolders();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '创建文件夹失败';
        setError(errorMessage);
        throw err;
      }
    },
    [loadFolders]
  );

  const deleteFolder = useCallback(
    async (path: string) => {
      try {
        await s3Service.deleteFolder(path);
        await loadFolders();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '删除文件夹失败';
        setError(errorMessage);
        throw err;
      }
    },
    [loadFolders]
  );

  const refreshFolders = useCallback(() => {
    loadFolders();
  }, [loadFolders]);

  return {
    folders,
    loading,
    error,
    createFolder,
    deleteFolder,
    refreshFolders,
  };
};

