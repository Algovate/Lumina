import { UploadZone } from './UploadZone';
import type { UploadProgress } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: File[]) => void;
  uploadProgress?: UploadProgress[];
  currentFolder?: string;
  disabled?: boolean;
}

export const UploadModal = ({
  isOpen,
  onClose,
  onFilesSelected,
  uploadProgress,
  currentFolder,
  disabled,
}: UploadModalProps) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">上传图片</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
            aria-label="关闭"
          >
            <svg 
              className="h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
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
        
        <UploadZone
          onFilesSelected={onFilesSelected}
          uploadProgress={uploadProgress}
          currentFolder={currentFolder}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
