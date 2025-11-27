import { useState, useCallback } from 'react';
import type { UploadProgress } from '../types';
import { s3Service } from '../services/s3Service';

export const useImageUpload = (currentFolder: string = '') => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);

  const uploadFiles = useCallback(
    async (files: File[], onComplete?: () => void) => {
      const progressList: UploadProgress[] = files.map((file) => ({
        file,
        progress: 0,
        status: 'pending',
      }));

      setUploadProgress(progressList);

      const uploadPromises = files.map(async (file, index) => {
        try {
          // Generate unique key for the file
          const timestamp = Date.now();
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const key = currentFolder
            ? `${currentFolder}${timestamp}_${sanitizedName}`
            : `${timestamp}_${sanitizedName}`;

          // Update status to uploading
          setUploadProgress((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], status: 'uploading' };
            return updated;
          });

          // Upload file with progress tracking
          await s3Service.uploadFile(file, key, (progress) => {
            setUploadProgress((prev) => {
              const updated = [...prev];
              updated[index] = { ...updated[index], progress };
              return updated;
            });
          });

          // Update status to success
          setUploadProgress((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], status: 'success', progress: 100 };
            return updated;
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '上传失败';
          setUploadProgress((prev) => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              status: 'error',
              error: errorMessage,
            };
            return updated;
          });
        }
      });

      await Promise.all(uploadPromises);

      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress([]);
        if (onComplete) {
          onComplete();
        }
      }, 2000);
    },
    [currentFolder]
  );

  const clearProgress = useCallback(() => {
    setUploadProgress([]);
  }, []);

  return { uploadFiles, uploadProgress, clearProgress };
};

