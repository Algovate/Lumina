import { useState } from 'react';
import type { Folder } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface FolderTreeProps {
  folders: Folder[];
  currentPath: string;
  onFolderSelect: (path: string) => void;
  onFolderCreate?: (parentPath: string, folderName: string) => void;
  onFolderDelete?: (path: string) => void;
}

export const FolderTree = ({
  folders,
  currentPath,
  onFolderSelect,
  onFolderCreate,
  onFolderDelete,
}: FolderTreeProps) => {
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  const handleFolderClick = (path: string) => {
    onFolderSelect(path);
  };

  const handleDeleteClick = (e: React.MouseEvent, path: string, name: string) => {
    e.stopPropagation();
    setDeleteTarget({ path, name });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onFolderDelete?.(deleteTarget.path);
      setDeleteTarget(null);
    }
  };

  const renderFolder = (folder: Folder, level: number = 0) => {
    const isActive = currentPath === folder.path;
    const indent = level * 20;

    return (
      <div key={folder.path} className="mb-1">
        <div
          className={`flex items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-100 ${
            isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => handleFolderClick(folder.path)}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span className="flex-1 truncate">{folder.name}</span>
          {onFolderDelete && folder.path !== '' && (
            <button
              onClick={(e) => handleDeleteClick(e, folder.path, folder.name)}
              className="ml-2 text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
              aria-label={`删除文件夹 ${folder.name}`}
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
            </button>
          )}
        </div>
        {folder.children && folder.children.length > 0 && (
          <div className="ml-4">
            {folder.children.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">文件夹</h3>
        {onFolderCreate && (
          <button
            onClick={() => {
              const folderName = prompt('请输入文件夹名称:');
              if (folderName) {
                onFolderCreate(currentPath, folderName);
              }
            }}
            className="text-blue-500 hover:text-blue-700 text-sm"
          >
            + 新建
          </button>
        )}
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {/* Root folder */}
        <div
          className={`flex items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-100 mb-1 ${
            currentPath === '' ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
          }`}
          onClick={() => handleFolderClick('')}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          <span>全部图片</span>
        </div>
        {folders.map((folder) => renderFolder(folder))}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title="确认删除文件夹"
          message={`确定要删除文件夹 "${deleteTarget.name}" 吗？\n\n警告：删除文件夹将同时删除其中的所有图片和子文件夹。\n此操作无法撤销。`}
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

