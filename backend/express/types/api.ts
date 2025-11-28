export interface S3ImageResponse {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  url: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  folder?: string;
  tags: string[];
}

export interface FolderResponse {
  name: string;
  path: string;
}

export interface ShareCreateRequest {
  imageKey: string;
  expiresInDays?: number;
}

export interface ShareCreateResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: number;
}

export interface ShareInfoResponse {
  imageKey: string;
  imageUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  name: string;
  size: number;
  lastModified: Date;
  tags: string[];
}

