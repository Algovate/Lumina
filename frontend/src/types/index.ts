export interface S3Image {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  url?: string;
  thumbnailUrl?: string;
  folder?: string;
  tags?: string[];
}

export interface Folder {
  name: string;
  path: string;
  children?: Folder[];
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface PresignedUrlResponse {
  url: string;
  expiresIn: number;
}

export interface S3Config {
  bucket: string;
  region: string;
  // Note: AWS credentials should never be in frontend code
  // Frontend uses presigned URLs from the backend API
}

export interface TagInfo {
  tag: string;
  count: number;
}

export interface PaginatedImageResponse {
  images: S3Image[];
  isTruncated: boolean;
  nextContinuationToken: string | null;
  keyCount: number;
}

