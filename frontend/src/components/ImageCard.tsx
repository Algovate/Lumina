import { useState, useEffect } from 'react';
import type { S3Image } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface ImageCardProps {
  image: S3Image;
  onClick: () => void;
  onDelete?: () => void;
  onTagClick?: (tag: string) => void;
  isSelected?: boolean;
}

export const ImageCard = ({ image, onClick, onDelete, onTagClick, isSelected }: ImageCardProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | undefined>(image.thumbnailUrl || image.url);
  const [imageError, setImageError] = useState(false);

  // 当 image 对象更新时，重置 imageSrc
  useEffect(() => {
    setImageSrc(image.thumbnailUrl || image.url);
    setImageError(false);
  }, [image.thumbnailUrl, image.url]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString();
  };

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all duration-200 ${
        isSelected ? 'ring-4 ring-blue-500' : ''
      }`}
      onClick={onClick}
    >
      <div className="aspect-square bg-gray-200 relative">
        {imageSrc && !imageError ? (
          <img
            src={imageSrc}
            alt={image.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => {
              // 如果缩略图加载失败，回退到原图
              if (imageSrc === image.thumbnailUrl && image.url) {
                setImageSrc(image.url);
              } else {
                setImageError(true);
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        
        {/* Menu button */}
        {onDelete && (
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full transition-all"
              aria-label="更多操作"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-lg"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    删除图片
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Image info */}
      <div className="p-3 bg-white">
        <p className="text-sm font-medium text-gray-900 truncate" title={image.name}>
          {image.name}
        </p>
        {/* Tags */}
        {image.tags && image.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {image.tags.slice(0, 2).map((tag) => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
                className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200 transition-colors"
                title={`点击筛选标签: ${tag}`}
              >
                {tag}
              </button>
            ))}
            {image.tags.length > 2 && (
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                +{image.tags.length - 2}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
          <span>{formatFileSize(image.size)}</span>
          <span>{formatDate(image.lastModified)}</span>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="确认删除"
          message={`确定要删除图片 "${image.name}" 吗？\n此操作无法撤销。`}
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete?.();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};

