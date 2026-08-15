export interface DirectorySummary {
  id: string;
  name: string;
  parentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileSummary {
  id: string;
  name: string;
  latestVersion: number;
  size: number;
  mimeType: string;
  updatedAt: string;
}

export interface DirectoryContent {
  directory: DirectorySummary;
  subdirectories: DirectorySummary[];
  files: FileSummary[];
}

export interface TreeResponse {
  directories: DirectorySummary[];
}

export interface UploadResult {
  originalName: string;
  status: 'created' | 'versioned' | 'failed';
  fileId?: string;
  version?: number;
  error?: string;
}

export interface UploadResponse {
  results: UploadResult[];
}

export interface VersionInfo {
  id: string;
  version: number;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface VersionsResponse {
  file: { id: string; name: string; directoryId: string };
  versions: VersionInfo[];
}
