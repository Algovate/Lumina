import { useState, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import type { S3Image } from './types';
import logo from './assets/logo.png';
import { AlbumGrid } from './components/AlbumGrid';
import { UploadPage } from './components/UploadPage';
import { ShareView } from './pages/ShareView';


import { SearchBar } from './components/SearchBar';
import { FolderTree } from './components/FolderTree';
import { TagList } from './components/TagList';
import { ErrorAlert } from './components/ErrorAlert';
import { LoginForm } from './components/LoginForm';
import { SortSelector, type SortBy, type SortOrder } from './components/SortSelector';

// Lazy load heavy components for code splitting
const ImagePreview = lazy(() => import('./components/ImagePreview').then(module => ({ default: module.ImagePreview })));
import { useS3Images } from './hooks/useS3Images';
import { useImageUpload } from './hooks/useImageUpload';
import { useFolders } from './hooks/useFolders';
import { useAuth } from './hooks/useAuth';
import { filterImages } from './utils/imageUtils';
import { s3Service } from './services/s3Service';

// Main app content (requires authentication)
function AppContent() {
  const { isAuthenticated, user, loading: authLoading, logout } = useAuth();
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<S3Image | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  // 默认收起侧边栏
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [currentView, setCurrentView] = useState<'gallery' | 'upload'>('gallery');



  // 只在已认证时加载数据
  const {
    images,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error: imagesError,
    refreshImages
  } = useS3Images(
    currentFolder,
    { enabled: isAuthenticated, sortBy, sortOrder }
  );
  const { uploadFiles, uploadProgress } = useImageUpload(
    isAuthenticated ? currentFolder : ''
  );
  const { folders, error: foldersError, createFolder, deleteFolder } = useFolders({
    enabled: isAuthenticated,
  });
  const [error, setError] = useState<string | null>(null);

  // Filter images based on search query and selected tags
  const filteredImages = useMemo(() => {
    return filterImages(images, searchQuery, selectedTags);
  }, [images, searchQuery, selectedTags]);

  // Handle image click to open preview
  const handleImageClick = (image: S3Image) => {
    const index = filteredImages.findIndex((img) => img.key === image.key);
    setPreviewIndex(index);
    setPreviewImage(image);
  };

  // Handle preview navigation
  const handleNext = () => {
    if (previewIndex < filteredImages.length - 1) {
      const nextIndex = previewIndex + 1;
      setPreviewIndex(nextIndex);
      setPreviewImage(filteredImages[nextIndex]);
    }
  };

  const handlePrevious = () => {
    if (previewIndex > 0) {
      const prevIndex = previewIndex - 1;
      setPreviewIndex(prevIndex);
      setPreviewImage(filteredImages[prevIndex]);
    }
  };

  // Handle image deletion (confirmation is now handled in components)
  const handleDeleteImage = async (image: S3Image) => {
    try {
      await s3Service.deleteFile(image.key);
      refreshImages();
      // Close preview if deleted image is currently previewed
      if (previewImage?.key === image.key) {
        setPreviewImage(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(`删除失败: ${errorMessage}`);
    }
  };

  // Handle file upload
  const handleFilesSelected = async (files: File[]) => {
    await uploadFiles(files, () => {
      refreshImages();
    });
  };

  // Handle tag click (toggle tag selection)
  const handleTagClick = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  // Handle image update (e.g., after tag edit)
  const handleImageUpdate = (updatedImage: S3Image) => {
    refreshImages();
    // Update preview image if it's the same one
    if (previewImage?.key === updatedImage.key) {
      setPreviewImage(updatedImage);
    }
  };

  // Handle folder operations
  const handleFolderSelect = (path: string) => {
    setCurrentFolder(path);
    setSearchQuery(''); // Clear search when changing folders
    setSelectedTags([]); // Clear tag filter when changing folders
  };

  const handleFolderCreate = async (parentPath: string, folderName: string) => {
    try {
      await createFolder(parentPath, folderName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(`创建文件夹失败: ${errorMessage}`);
    }
  };

  const handleFolderDelete = async (path: string) => {
    try {
      await deleteFolder(path);
      // If deleted folder is current folder, go to root
      if (currentFolder === path) {
        setCurrentFolder('');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(`删除文件夹失败: ${errorMessage}`);
    }
  };

  // Check if S3 is configured
  // 如果正在加载认证状态，显示加载界面
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  // 如果未认证，显示登录界面
  if (!isAuthenticated) {
    return <LoginForm />;
  }

  const s3Bucket = import.meta.env.VITE_S3_BUCKET;
  const isConfigured = !!s3Bucket;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="w-full px-4 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Lumina Logo" className="w-10 h-10 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Lumina</h1>
                <p className="text-sm text-gray-500 italic">让回忆在云端发光</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Upload button moved to sidebar/navigation, but keeping a quick action here if needed, 
                  or removing it to rely solely on sidebar. Let's remove it to force sidebar usage as per plan,
                  OR keep it as a shortcut to switch view. Let's keep it as a shortcut. */}
              <button
                onClick={() => setCurrentView('upload')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="hidden sm:inline">上传图片</span>
              </button>


              {user && (
                <div className="flex items-center gap-2">
                  {user.picture && (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-sm text-gray-700">{user.name}</span>
                </div>
              )}
              <button
                onClick={logout}
                className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                登出
              </button>
            </div>
          </div>
          {!isConfigured && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
              <p className="font-medium">⚠️ 配置提醒</p>
              <p className="text-sm mt-1">
                请配置环境变量。在 <code className="bg-yellow-100 px-1 rounded">frontend/.env</code> 文件中设置：
              </p>
              <ul className="text-sm mt-2 list-disc list-inside space-y-1">
                <li><code>VITE_S3_BUCKET=your-bucket-name</code></li>
                <li><code>VITE_AWS_REGION=us-east-1</code></li>
                <li><code>VITE_COGNITO_USER_POOL_ID=your-user-pool-id</code></li>
                <li><code>VITE_COGNITO_USER_POOL_CLIENT_ID=your-client-id</code></li>
              </ul>
              <p className="text-sm mt-2">
                配置完成后，请重启开发服务器。
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="w-full px-4 lg:px-8 py-6">
        <div className="flex gap-6 relative">
          {/* Sidebar - Folder Tree */}
          <aside
            className={`transition-all duration-300 ease-in-out ${sidebarExpanded
              ? 'w-64 shrink-0'
              : 'w-0 overflow-hidden lg:w-12'
              }`}
          >
            {sidebarExpanded ? (
              <div className="space-y-4">
                {/* Navigation Menu */}
                <nav className="space-y-1">
                  <button
                    onClick={() => setCurrentView('gallery')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${currentView === 'gallery'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    图片库
                  </button>
                  <button
                    onClick={() => setCurrentView('upload')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${currentView === 'upload'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    上传图片
                  </button>
                </nav>
                <div className="border-t border-gray-200 my-2"></div>
                <FolderTree

                  folders={folders}
                  currentPath={currentFolder}
                  onFolderSelect={handleFolderSelect}
                  onFolderCreate={handleFolderCreate}
                  onFolderDelete={handleFolderDelete}
                />
                <div className="bg-white rounded-lg shadow">
                  <TagList
                    onTagClick={handleTagClick}
                    selectedTags={selectedTags}
                    viewMode="list"
                  />
                </div>
              </div>
            ) : (
              // 收缩状态下显示一个简单的图标按钮
              <div className="hidden lg:block w-12">
                <div className="bg-white rounded-lg shadow p-2">
                  <button
                    onClick={() => setSidebarExpanded(true)}
                    className="w-full p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    aria-label="展开侧边栏"
                  >
                    <svg
                      className="w-5 h-5 mx-auto"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* Sidebar Toggle Button - 只在展开时显示 */}
          {sidebarExpanded && (
            <button
              onClick={() => setSidebarExpanded(false)}
              className="absolute top-0 left-64 z-10 bg-white border border-gray-300 rounded-r-lg p-2 shadow-md hover:bg-gray-50 transition-all duration-300"
              aria-label="收起侧边栏"
            >
              <svg
                className="w-5 h-5 text-gray-600"
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

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Error Alerts */}
            {error && (
              <ErrorAlert message={error} onClose={() => setError(null)} />
            )}
            {imagesError && (
              <ErrorAlert message={`加载图片失败: ${imagesError}`} />
            )}
            {foldersError && (
              <ErrorAlert message={`加载文件夹失败: ${foldersError}`} />
            )}

            {/* Mobile Sidebar Toggle Button */}
            {!sidebarExpanded && (
              <button
                onClick={() => setSidebarExpanded(true)}
                className="lg:hidden mb-4 flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                aria-label="展开侧边栏"
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
                <span className="text-sm text-gray-700">文件夹</span>
              </button>
            )}

            {currentView === 'gallery' ? (
              <>
                {/* Search Bar */}
                <SearchBar value={searchQuery} onChange={setSearchQuery} />

                {/* Current Folder Info */}
                {currentFolder && (
                  <div className="mb-4 text-sm text-gray-600">
                    当前文件夹: <span className="font-medium">{currentFolder}</span>
                  </div>
                )}

                {/* Image Count, Filters, and Sort */}
                <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
                  {!loading && (
                    <div className="text-sm text-gray-600">
                      共 {filteredImages.length} 张图片
                      {searchQuery && ` (搜索: "${searchQuery}")`}
                      {selectedTags.length > 0 && (
                        <span className="ml-2">
                          (标签筛选: {selectedTags.map((tag, idx) => (
                            <span key={tag}>
                              <button
                                onClick={() => handleTagClick(tag)}
                                className="text-blue-600 hover:text-blue-800 underline"
                              >
                                {tag}
                              </button>
                              {idx < selectedTags.length - 1 && ', '}
                            </span>
                          ))})
                        </span>
                      )}
                    </div>
                  )}
                  <SortSelector
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(newSortBy, newSortOrder) => {
                      setSortBy(newSortBy);
                      setSortOrder(newSortOrder);
                    }}
                  />
                </div>

                {/* Album Grid */}
                <AlbumGrid
                  images={filteredImages}
                  onImageClick={handleImageClick}
                  onImageDelete={handleDeleteImage}
                  onTagClick={handleTagClick}
                  loading={loading}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                />
              </>
            ) : (
              <UploadPage
                onFilesSelected={handleFilesSelected}
                uploadProgress={uploadProgress}
                currentFolder={currentFolder}
                disabled={loading}
              />
            )}

          </main>
        </div>
      </div>



      {/* Image Preview Modal */}

      {previewImage && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-white">加载中...</div>
          </div>
        }>
          <ImagePreview
            image={previewImage}
            images={filteredImages}
            isOpen={!!previewImage}
            onClose={() => setPreviewImage(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onDelete={handleDeleteImage}
            onImageUpdate={handleImageUpdate}
          />
        </Suspense>
      )}
    </div>
  );
}

// Root App component with routing
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public share route - no authentication required */}
        <Route path="/share/:token" element={<ShareView />} />
        {/* Main app - requires authentication */}
        <Route path="*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
