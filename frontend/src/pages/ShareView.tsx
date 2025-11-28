import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { shareService } from '../services/shareService';
import { s3Service } from '../services/s3Service';
import { logger } from '../utils/logger';
import type { ShareInfo } from '../types';
import logo from '../assets/logo.png';

export const ShareView = () => {
  const { token } = useParams<{ token: string }>();
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (token) {
      loadShareInfo();
    } else {
      setError('无效的分享链接');
      setLoading(false);
    }
  }, [token]);

  const loadShareInfo = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const info = await shareService.getShareInfo(token);
      setShareInfo(info);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载分享信息失败';
      setError(errorMessage);
      logger.error('Failed to load share info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!shareInfo?.imageUrl || !shareInfo?.name) return;

    setDownloading(true);
    try {
      await s3Service.downloadImage(shareInfo.imageUrl, shareInfo.name);
    } catch (err) {
      logger.error('Failed to download image:', err);
      alert('下载失败，请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 text-red-500 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">无法加载分享</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">
              {error.includes('过期') || error.includes('not found')
                ? '此分享链接可能已过期或不存在。'
                : '请检查链接是否正确，或稍后重试。'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!shareInfo) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Lumina Logo" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lumina</h1>
              <p className="text-sm text-gray-500 italic">让回忆在云端发光</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Image */}
          <div className="bg-black bg-opacity-5 flex items-center justify-center p-8">
            {shareInfo.imageUrl ? (
              <img
                src={shareInfo.imageUrl}
                alt={shareInfo.name}
                className="max-w-full max-h-[70vh] object-contain"
                onError={() => {
                  logger.error('Failed to load shared image');
                  setError('无法加载图片');
                }}
              />
            ) : (
              <div className="text-gray-500 text-center">
                <p>无法加载图片</p>
              </div>
            )}
          </div>

          {/* Image Info */}
          <div className="p-6 border-t border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{shareInfo.name}</h2>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <span>
                    <span className="font-medium">大小:</span> {formatFileSize(shareInfo.size)}
                  </span>
                  <span>
                    <span className="font-medium">日期:</span> {formatDate(shareInfo.lastModified)}
                  </span>
                </div>
                {/* Tags */}
                {shareInfo.tags && shareInfo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {shareInfo.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="ml-4">
                <button
                  onClick={handleDownload}
                  disabled={downloading || !shareInfo.imageUrl}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>下载中...</span>
                    </>
                  ) : (
                    <>
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
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      <span>下载</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

