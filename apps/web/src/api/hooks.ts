import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './client';
import type { DirectoryContent, TreeResponse, UploadResponse, VersionsResponse } from './types';

export const directoryContentKey = (directoryId: string) => ['directory-content', directoryId] as const;
export const directoryTreeKey = ['directory-tree'] as const;

export function useDirectoryContent(directoryId: string) {
  return useQuery({
    queryKey: directoryContentKey(directoryId),
    queryFn: () => apiRequest<DirectoryContent>(`/api/directories/${directoryId}/content`),
  });
}

export function useDirectoryTree() {
  return useQuery({
    queryKey: directoryTreeKey,
    queryFn: () => apiRequest<TreeResponse>('/api/directories/tree'),
  });
}

export function useCreateDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; parentId: string }) =>
      apiRequest('/api/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: directoryContentKey(variables.parentId) });
      void queryClient.invalidateQueries({ queryKey: directoryTreeKey });
    },
  });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { directoryId: string; files: File[] }) => {
      const form = new FormData();
      form.append('directoryId', input.directoryId);
      for (const file of input.files) {
        form.append('files', file);
      }
      return apiRequest<UploadResponse>('/api/files/upload', { method: 'POST', body: form });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: directoryContentKey(variables.directoryId) });
    },
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fileId: string; targetDirectoryId: string }) =>
      apiRequest(`/api/files/${input.fileId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDirectoryId: input.targetDirectoryId }),
      }),
    onSuccess: () => {
      // 源与目标目录都可能变化，统一刷新目录内容与目录树
      void queryClient.invalidateQueries({ queryKey: ['directory-content'] });
      void queryClient.invalidateQueries({ queryKey: directoryTreeKey });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => apiRequest(`/api/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['directory-content'] });
    },
  });
}

export function useDeleteDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (directoryId: string) => apiRequest(`/api/directories/${directoryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['directory-content'] });
      void queryClient.invalidateQueries({ queryKey: directoryTreeKey });
    },
  });
}

export function useFileVersions(fileId: string | null) {
  return useQuery({
    queryKey: ['file-versions', fileId],
    queryFn: () => apiRequest<VersionsResponse>(`/api/files/${fileId}/versions`),
    enabled: fileId !== null,
  });
}
