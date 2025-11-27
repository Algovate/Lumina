export interface S3ImageResponse {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  url: string;
  folder?: string;
  tags: string[];
}

export interface FolderResponse {
  name: string;
  path: string;
}

