import { useState, useEffect } from 'react';
import { s3Service } from '../services/s3Service';
import type { TagInfo } from '../types';

interface TagListProps {
  onTagClick?: (tag: string) => void;
  selectedTags?: string[];
  viewMode?: 'list' | 'cloud';
}

export const TagList = ({
  onTagClick,
  selectedTags = [],
  viewMode = 'list',
}: TagListProps) => {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const allTags = await s3Service.getAllTags();
      setTags(allTags);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载标签失败';
      setError(errorMessage);
      console.error('Error loading tags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-sm">加载标签中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 text-sm">
        <p>{error}</p>
        <button
          onClick={loadTags}
          className="mt-2 text-blue-600 hover:text-blue-800 underline"
        >
          重试
        </button>
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        暂无标签
      </div>
    );
  }

  // 计算标签云的大小范围
  const maxCount = Math.max(...tags.map((t) => t.count));
  const minCount = Math.min(...tags.map((t) => t.count));
  const countRange = maxCount - minCount || 1;

  const getTagSize = (count: number) => {
    if (viewMode === 'cloud') {
      // 标签云：根据使用次数设置字体大小
      const size = 0.75 + ((count - minCount) / countRange) * 0.75; // 0.75rem 到 1.5rem
      return `${size}rem`;
    }
    return undefined;
  };

  const getTagWeight = (count: number) => {
    if (viewMode === 'cloud') {
      // 使用次数越多，字体越粗
      if (count === maxCount) return 'font-bold';
      if (count > minCount + countRange * 0.6) return 'font-semibold';
      return 'font-normal';
    }
    return 'font-normal';
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-700">标签</h3>
        <button
          onClick={loadTags}
          className="text-xs text-blue-600 hover:text-blue-800"
          title="刷新标签列表"
        >
          刷新
        </button>
      </div>

      {viewMode === 'cloud' ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tagInfo) => {
            const isSelected = selectedTags.includes(tagInfo.tag);
            return (
              <button
                key={tagInfo.tag}
                onClick={() => onTagClick?.(tagInfo.tag)}
                className={`px-2 py-1 rounded-md transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{ fontSize: getTagSize(tagInfo.count) }}
                title={`${tagInfo.tag} (${tagInfo.count} 张图片)`}
              >
                <span className={getTagWeight(tagInfo.count)}>
                  {tagInfo.tag}
                </span>
                <span className="ml-1 text-xs opacity-75">
                  ({tagInfo.count})
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {tags.map((tagInfo) => {
            const isSelected = selectedTags.includes(tagInfo.tag);
            return (
              <button
                key={tagInfo.tag}
                onClick={() => onTagClick?.(tagInfo.tag)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex justify-between items-center ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={`${tagInfo.tag} (${tagInfo.count} 张图片)`}
              >
                <span className="text-sm">{tagInfo.tag}</span>
                <span className="text-xs opacity-75">{tagInfo.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

