import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { UploadProgress } from '../types';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  uploadProgress?: UploadProgress[];
  currentFolder?: string;
  disabled?: boolean;
}

export const UploadZone = ({
  onFilesSelected,
  uploadProgress,
  currentFolder,
  disabled,
}: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getTotalProgress = (): number => {
    if (!uploadProgress || uploadProgress.length === 0) return 0;
    const total = uploadProgress.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(total / uploadProgress.length);
  };

  const hasActiveUploads = uploadProgress && uploadProgress.some(
    (item) => item.status === 'uploading' || item.status === 'pending'
  );

  return (
    <div className="mb-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="text-lg font-medium text-gray-700 mb-2">
          {isDragging ? '松开以上传图片' : '拖拽图片到这里或点击选择'}
        </p>
        <p className="text-sm text-gray-500">
          支持 JPG、PNG、GIF 等图片格式
        </p>
        {currentFolder && (
          <p className="text-xs text-gray-400 mt-2">
            将上传到: {currentFolder}
          </p>
        )}
      </div>

      {/* Upload progress */}
      {hasActiveUploads && uploadProgress && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              上传进度: {getTotalProgress()}%
            </span>
            <span className="text-xs text-gray-500">
              {uploadProgress.filter((p) => p.status === 'success').length} / {uploadProgress.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getTotalProgress()}%` }}
            />
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {uploadProgress.map((progress, index) => (
              <div key={index} className="text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="truncate flex-1">{progress.file.name}</span>
                  <span className="ml-2">
                    {progress.status === 'success' && '✓'}
                    {progress.status === 'error' && '✗'}
                    {progress.status === 'uploading' && `${Math.round(progress.progress)}%`}
                    {progress.status === 'pending' && '等待中...'}
                  </span>
                </div>
                {progress.error && (
                  <p className="text-red-500 text-xs mt-1">{progress.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

