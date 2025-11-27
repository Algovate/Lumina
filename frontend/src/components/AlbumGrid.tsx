import type { S3Image } from '../types';
import { ImageCard } from './ImageCard';

interface AlbumGridProps {
  images: S3Image[];
  onImageClick: (image: S3Image) => void;
  onImageDelete?: (image: S3Image) => void;
  onTagClick?: (tag: string) => void;
  selectedImages?: Set<string>;
  loading?: boolean;
}

export const AlbumGrid = ({
  images,
  onImageClick,
  onImageDelete,
  onTagClick,
  selectedImages,
  loading,
}: AlbumGridProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-gray-500">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
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
          <p className="text-lg">暂无图片</p>
          <p className="text-sm mt-2">上传一些图片开始使用吧</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
      {images.map((image) => (
        <ImageCard
          key={image.key}
          image={image}
          onClick={() => onImageClick(image)}
          onDelete={onImageDelete ? () => onImageDelete(image) : undefined}
          onTagClick={onTagClick}
          isSelected={selectedImages?.has(image.key)}
        />
      ))}
    </div>
  );
};

