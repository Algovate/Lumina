import { useState, useEffect, useRef } from 'react';
import type { S3Image } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { TagManager } from './TagManager';
import { s3Service } from '../services/s3Service';
import { SLIDESHOW_CONSTANTS } from '../constants';

interface ImagePreviewProps {
  image: S3Image | null;
  images: S3Image[];
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onDelete?: (image: S3Image) => void;
  onImageUpdate?: (image: S3Image) => void;
}

export const ImagePreview = ({
  image,
  images,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  onDelete,
  onImageUpdate,
}: ImagePreviewProps) => {
  const [slideshowMode, setSlideshowMode] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState<number>(SLIDESHOW_CONSTANTS.DEFAULT_INTERVAL);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [transitionState, setTransitionState] = useState<'idle' | 'transitioning'>('idle');
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'previous'>('next');
  const [transitionType, setTransitionType] = useState<'fade' | 'slide' | 'zoom'>('fade');
  const [previousImage, setPreviousImage] = useState<S3Image | null>(null);
  const [downloading, setDownloading] = useState(false);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 计算当前索引和导航状态（必须在 hooks 之后，但在早期返回之前）
  const currentIndex = isOpen && image ? images.findIndex((img) => img.key === image.key) : -1;
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1;
  const hasPrevious = currentIndex > 0;

  // 获取应该使用的图片 URL（幻灯片模式下优先使用预览图）
  const getImageUrl = (img: S3Image | null): string | undefined => {
    if (!img) return undefined;
    // 在幻灯片模式下，优先使用预览图（如果存在）
    if (slideshowMode && img.previewUrl) {
      return img.previewUrl;
    }
    // 否则使用原图
    return img.url;
  };

  // 幻灯片模式自动播放
  useEffect(() => {
    // 清除之前的计时器
    if (slideshowTimerRef.current) {
      clearInterval(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }

    // 如果幻灯片模式开启且还有下一张图片，设置新的计时器
    if (slideshowMode && isOpen && hasNext && transitionState === 'idle') {
      slideshowTimerRef.current = setInterval(() => {
        if (transitionState === 'idle') {
          handleNext();
        }
      }, slideshowInterval);
    }

    // 清理函数
    return () => {
      if (slideshowTimerRef.current) {
        clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
    };
  }, [slideshowMode, isOpen, hasNext, slideshowInterval, currentIndex, onNext]);

  // 关闭时停止幻灯片
  useEffect(() => {
    if (!isOpen) {
      setSlideshowMode(false);
      setTransitionState('idle');
      setPreviousImage(null);
      setShowTagEditor(false);
    }
  }, [isOpen]);

  // 加载可用标签
  useEffect(() => {
    if (isOpen && showTagEditor) {
      const loadTags = async () => {
        try {
          const allTags = await s3Service.getAllTags();
          setAvailableTags(allTags.map((t) => t.tag));
        } catch (error) {
          console.error('Error loading tags:', error);
        }
      };
      loadTags();
    }
  }, [isOpen, showTagEditor]);

  // 当图片变化时，更新编辑中的标签
  useEffect(() => {
    if (image) {
      setEditingTags(image.tags || []);
    }
  }, [image?.key]);

  // 保存标签
  const handleSaveTags = async () => {
    if (!image) return;

    setSavingTags(true);
    try {
      const updatedTags = await s3Service.updateImageTags(image.key, editingTags);
      const updatedImage = { ...image, tags: updatedTags };
      onImageUpdate?.(updatedImage);
      setShowTagEditor(false);
    } catch (error) {
      console.error('Error saving tags:', error);
      alert('保存标签失败，请重试');
    } finally {
      setSavingTags(false);
    }
  };

  // 图片预加载
  useEffect(() => {
    if (!isOpen || !image || currentIndex < 0) return;

    // 预加载下一张图片
    if (hasNext) {
      const nextImage = images[currentIndex + 1];
      if (nextImage?.url) {
        const nextImg = new Image();
        nextImg.src = nextImage.url;
      }
    }

    // 预加载上一张图片
    if (hasPrevious) {
      const prevImage = images[currentIndex - 1];
      if (prevImage?.url) {
        const prevImg = new Image();
        prevImg.src = prevImage.url;
      }
    }
  }, [isOpen, image, currentIndex, hasNext, hasPrevious, images]);

  // 检测图片切换，触发过渡动画
  useEffect(() => {
    if (!isOpen || !image) return;

    // 如果图片发生变化，触发过渡
    if (previousImage && previousImage.key !== image.key) {
      // 使用 requestAnimationFrame 确保 DOM 更新后再触发动画
      requestAnimationFrame(() => {
        setTransitionState('transitioning');
      });
      
      // 过渡动画完成后重置状态
      const timer = setTimeout(() => {
        setTransitionState('idle');
        setPreviousImage(image);
      }, 600); // 过渡时间（稍长于 CSS transition duration）

      return () => clearTimeout(timer);
    } else if (!previousImage) {
      // 首次加载
      setPreviousImage(image);
    }
  }, [image?.key, isOpen, previousImage?.key]);

  // 早期返回必须在所有 hooks 之后
  if (!isOpen || !image) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft' && hasPrevious) {
      setTransitionDirection('previous');
      onPrevious();
    } else if (e.key === 'ArrowRight' && hasNext) {
      setTransitionDirection('next');
      onNext();
    } else if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      setSlideshowMode(!slideshowMode);
    }
  };

  const toggleSlideshow = () => {
    setSlideshowMode(!slideshowMode);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!image || !image.url) {
      return;
    }

    setDownloading(true);
    try {
      await s3Service.downloadImage(image.url, image.name);
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('下载失败，请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  const handleNext = () => {
    setTransitionDirection('next');
    onNext();
  };

  const handlePrevious = () => {
    setTransitionDirection('previous');
    onPrevious();
  };

  // 获取过渡动画类名
  const getTransitionClasses = () => {
    const baseClasses = 'transition-all duration-500 ease-in-out';
    
    if (transitionState === 'idle') {
      return `${baseClasses} opacity-100 scale-100`;
    }

    switch (transitionType) {
      case 'fade':
        return `${baseClasses} ${transitionState === 'transitioning' ? 'opacity-0' : 'opacity-100'}`;
      
      case 'slide':
        return `${baseClasses} ${transitionState === 'transitioning' ? 'opacity-0' : 'opacity-100'}`;
      
      case 'zoom':
        return `${baseClasses} ${transitionState === 'transitioning' ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`;
      
      default:
        return baseClasses;
    }
  };

  // 获取滑动动画样式
  const getSlideStyle = () => {
    if (transitionType !== 'slide' || transitionState !== 'transitioning') {
      return {};
    }
    
    return {
      transform: transitionDirection === 'next' 
        ? 'translateX(100%)' 
        : 'translateX(-100%)',
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Control buttons */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        {/* Slideshow toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSlideshow();
          }}
          className={`p-2 rounded-lg transition-colors ${
            slideshowMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
          }`}
          aria-label={slideshowMode ? '停止幻灯片' : '开始幻灯片'}
          title={slideshowMode ? '停止幻灯片 (空格键)' : '开始幻灯片 (空格键)'}
        >
          {slideshowMode ? (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </button>

        {/* Slideshow controls */}
        {slideshowMode && (
          <div className="flex items-center gap-2 bg-black bg-opacity-50 rounded-lg px-3 py-2">
            <label className="text-white text-sm">间隔:</label>
            <select
              value={slideshowInterval}
              onChange={(e) => {
                e.stopPropagation();
                setSlideshowInterval(Number(e.target.value));
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white text-gray-900 text-sm rounded px-2 py-1"
            >
              <option value={1000}>1秒</option>
              <option value={2000}>2秒</option>
              <option value={3000}>3秒</option>
              <option value={5000}>5秒</option>
              <option value={10000}>10秒</option>
            </select>
          </div>
        )}

        {/* Transition type selector */}
        <div className="flex items-center gap-2 bg-black bg-opacity-50 rounded-lg px-3 py-2">
          <label className="text-white text-sm">过渡:</label>
          <select
            value={transitionType}
            onChange={(e) => {
              e.stopPropagation();
              setTransitionType(e.target.value as 'fade' | 'slide' | 'zoom');
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-gray-900 text-sm rounded px-2 py-1"
          >
            <option value="fade">淡入淡出</option>
            <option value="slide">滑动</option>
            <option value="zoom">缩放</option>
          </select>
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading || !image?.url}
          className="p-2 bg-black bg-opacity-50 text-white hover:bg-opacity-70 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="下载图片"
          title="下载原图"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 bg-black bg-opacity-50 text-white hover:bg-opacity-70 rounded-lg transition-colors"
          aria-label="关闭"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Previous button */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevious();
          }}
          className="absolute left-4 text-white hover:text-gray-300 z-10"
          aria-label="上一张"
          disabled={transitionState === 'transitioning'}
        >
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 text-white hover:text-gray-300 z-10"
          aria-label="下一张"
          disabled={transitionState === 'transitioning'}
        >
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Image with transition */}
      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        {getImageUrl(image) ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Previous image (for slide transition) */}
            {transitionType === 'slide' && previousImage && previousImage.key !== image.key && transitionState === 'transitioning' && (
              <img
                src={getImageUrl(previousImage) || previousImage.url}
                alt={previousImage.name}
                className="absolute max-w-full max-h-[90vh] object-contain transition-transform duration-500 ease-in-out"
                style={{
                  transform: transitionDirection === 'next' 
                    ? 'translateX(-100%)' 
                    : 'translateX(100%)',
                }}
              />
            )}
            
            {/* Current image */}
            <img
              ref={imageRef}
              src={getImageUrl(image) || image.url}
              alt={image.name}
              className={`max-w-full max-h-[90vh] object-contain ${getTransitionClasses()}`}
              style={getSlideStyle()}
            />
          </div>
        ) : (
          <div className="text-white text-center">
            <p>无法加载图片</p>
          </div>
        )}
      </div>

      {/* Image info */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-4xl mx-auto">
          {!showTagEditor ? (
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <p className="font-medium">{image.name}</p>
                <p className="text-sm text-gray-300 mt-1">
                  {new Date(image.lastModified).toLocaleString()} •{' '}
                  {(image.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {/* Tags display */}
                {image.tags && image.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {image.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTagEditor(true);
                  }}
                  className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  title="编辑标签"
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
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  标签
                </button>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
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
                    删除
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">编辑标签</h3>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTagEditor(false);
                      setEditingTags(image.tags || []);
                    }}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded transition-colors text-sm"
                    disabled={savingTags}
                  >
                    取消
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveTags();
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-sm flex items-center gap-2"
                    disabled={savingTags}
                  >
                    {savingTags ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                </div>
              </div>
              <TagManager
                tags={editingTags}
                onChange={setEditingTags}
                availableTags={availableTags}
                placeholder="输入标签，按回车或逗号添加"
              />
            </div>
          )}
        </div>
      </div>

      {/* Image counter and slideshow indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-3">
        <div className="bg-black bg-opacity-50 text-white text-sm px-3 py-2 rounded-lg">
          {currentIndex + 1} / {images.length}
        </div>
        {slideshowMode && (
          <div className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span>幻灯片播放中</span>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && image && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="确认删除"
          message={`确定要删除图片 "${image.name}" 吗？\n此操作无法撤销。`}
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete?.(image);
            onClose();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};

