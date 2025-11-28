import { UploadZone } from './UploadZone';
import type { UploadProgress } from '../types';

interface UploadPageProps {
    onFilesSelected: (files: File[]) => void;
    uploadProgress?: UploadProgress[];
    currentFolder?: string;
    disabled?: boolean;
}

export const UploadPage = ({
    onFilesSelected,
    uploadProgress,
    currentFolder,
    disabled,
}: UploadPageProps) => {
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">上传图片</h2>
                <p className="mt-1 text-sm text-gray-500">
                    将图片上传到 {currentFolder ? `文件夹 "${currentFolder}"` : '根目录'}
                </p>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <UploadZone
                    onFilesSelected={onFilesSelected}
                    uploadProgress={uploadProgress}
                    currentFolder={currentFolder}
                    disabled={disabled}
                />
            </div>

            <div className="mt-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">上传说明</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-600 text-sm">
                    <li>支持 JPG, PNG, GIF 等常见图片格式。</li>
                    <li>单次可选择多张图片进行批量上传。</li>
                    <li>上传过程中请勿关闭页面。</li>
                </ul>
            </div>
        </div>
    );
};
