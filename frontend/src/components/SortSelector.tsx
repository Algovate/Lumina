import { useState } from 'react';

export type SortBy = 'name' | 'date' | 'size' | 'tags';
export type SortOrder = 'asc' | 'desc';

interface SortSelectorProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy, sortOrder: SortOrder) => void;
}

const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'name', label: '按名称' },
  { value: 'date', label: '按日期' },
  { value: 'size', label: '按大小' },
  { value: 'tags', label: '按标签数量' },
];

export const SortSelector = ({ sortBy, sortOrder, onSortChange }: SortSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSortByChange = (newSortBy: SortBy) => {
    onSortChange(newSortBy, sortOrder);
    setIsOpen(false);
  };

  const handleSortOrderToggle = () => {
    onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const currentSortLabel = sortOptions.find((opt) => opt.value === sortBy)?.label || '按日期';
  const orderIcon = sortOrder === 'asc' ? '↑' : '↓';

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2"
        >
          <span>排序: {currentSortLabel}</span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <button
          onClick={handleSortOrderToggle}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          title={sortOrder === 'asc' ? '升序' : '降序'}
        >
          {orderIcon}
        </button>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSortByChange(option.value)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                  sortBy === option.value
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

