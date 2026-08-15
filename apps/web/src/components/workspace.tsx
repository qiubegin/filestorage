import * as React from 'react';

import { FileText, Folder, FolderInput, FolderPlus, History, Loader2, Trash2, Upload } from 'lucide-react';

import { errorMessage } from '@/api/error';
import {
  useDeleteDirectory,
  useDeleteFile,
  useDirectoryContent,
  useDirectoryTree,
} from '@/api/hooks';
import type { DirectorySummary, FileSummary } from '@/api/types';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ConfirmDialog, type ConfirmTarget } from '@/components/confirm-dialog';
import { MoveDialog } from '@/components/move-dialog';
import { NewDirectoryDialog } from '@/components/new-directory-dialog';
import { useToast } from '@/components/toast';
import { UploadDialog } from '@/components/upload-dialog';
import { VersionDialog } from '@/components/version-dialog';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatSize } from '@/lib/format';
import { buildBreadcrumbChain } from '@/lib/navigation';

export function Workspace() {
  const [currentDirectoryId, setCurrentDirectoryId] = React.useState('root');
  const content = useDirectoryContent(currentDirectoryId);
  const tree = useDirectoryTree();
  const deleteFile = useDeleteFile();
  const deleteDirectory = useDeleteDirectory();
  const toast = useToast();

  const [newDirOpen, setNewDirOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [versionFile, setVersionFile] = React.useState<FileSummary | null>(null);
  const [moveFile, setMoveFile] = React.useState<FileSummary | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<ConfirmTarget | null>(null);

  const chain = React.useMemo(
    () => buildBreadcrumbChain(tree.data?.directories, content.data?.directory, currentDirectoryId),
    [tree.data, content.data, currentDirectoryId],
  );

  const deletePending = deleteFile.isPending || deleteDirectory.isPending;

  const handleDeleteConfirm = () => {
    if (!confirmTarget) {
      return;
    }
    const mutation = confirmTarget.kind === 'file' ? deleteFile : deleteDirectory;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.push('success', `已删除${confirmTarget.kind === 'file' ? '文件' : '文件夹'}「${confirmTarget.name}」`);
        setConfirmTarget(null);
      },
      onError: (err) => {
        toast.push('error', errorMessage(err));
        setConfirmTarget(null);
      },
    });
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs chain={chain} onNavigate={setCurrentDirectoryId} />
        <div className="flex gap-2">
          <Button onClick={() => setNewDirOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            新建文件夹
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" />
            上传文件
          </Button>
        </div>
      </div>

      {content.isPending && (
        <div className="flex items-center justify-center gap-2 rounded-lg border py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载中…
        </div>
      )}

      {content.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center">
          <p className="text-sm text-red-700">加载失败：{errorMessage(content.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void content.refetch()}>
            重试
          </Button>
        </div>
      )}

      {content.data && content.data.subdirectories.length === 0 && content.data.files.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Folder className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">此目录为空</p>
          <p className="mt-1 text-xs">可以新建文件夹或上传文件</p>
        </div>
      )}

      {content.data && (content.data.subdirectories.length > 0 || content.data.files.length > 0) && (
        <div className="overflow-hidden rounded-lg border">
          <div className="hidden border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
            <span className="flex-1">名称</span>
            <span className="w-56">信息</span>
            <span className="w-56 text-right">操作</span>
          </div>
          {content.data.subdirectories.map((directory) => (
            <DirectoryRow
              key={directory.id}
              directory={directory}
              onOpen={setCurrentDirectoryId}
              onDelete={() =>
                setConfirmTarget({ kind: 'directory', id: directory.id, name: directory.name })
              }
            />
          ))}
          {content.data.files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              onVersions={() => setVersionFile(file)}
              onMove={() => setMoveFile(file)}
              onDelete={() => setConfirmTarget({ kind: 'file', id: file.id, name: file.name })}
            />
          ))}
        </div>
      )}

      <NewDirectoryDialog
        open={newDirOpen}
        onClose={() => setNewDirOpen(false)}
        parentId={currentDirectoryId}
      />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} directoryId={currentDirectoryId} />
      <VersionDialog file={versionFile} onClose={() => setVersionFile(null)} />
      <MoveDialog
        file={moveFile}
        currentDirectoryId={currentDirectoryId}
        onClose={() => setMoveFile(null)}
      />
      <ConfirmDialog
        target={confirmTarget}
        pending={deletePending}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </main>
  );
}

function DirectoryRow({
  directory,
  onOpen,
  onDelete,
}: {
  directory: DirectorySummary;
  onOpen: (directoryId: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/40">
      <button type="button" className="flex flex-1 items-center gap-3 text-left" onClick={() => onOpen(directory.id)}>
        <Folder className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <div className="truncate font-medium">{directory.name}</div>
          <div className="text-xs text-muted-foreground">文件夹</div>
        </div>
      </button>
      <div className="w-56 shrink-0 text-xs text-muted-foreground">{formatDateTime(directory.updatedAt)}</div>
      <div className="flex w-56 shrink-0 justify-end">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </div>
  );
}

function FileRow({
  file,
  onVersions,
  onMove,
  onDelete,
}: {
  file: FileSummary;
  onVersions: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/40">
      <div className="flex flex-1 items-center gap-3">
        <FileText className="h-5 w-5 shrink-0 text-sky-500" />
        <div className="min-w-0">
          <div className="truncate font-medium">{file.name}</div>
          <div className="text-xs text-muted-foreground">文件 · 最新 v{file.latestVersion}</div>
        </div>
      </div>
      <div className="w-56 shrink-0 text-xs text-muted-foreground">
        {formatSize(file.size)} · {formatDateTime(file.updatedAt)}
      </div>
      <div className="flex w-56 shrink-0 items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onVersions}>
          <History className="h-4 w-4" />
          版本
        </Button>
        <Button variant="ghost" size="sm" onClick={onMove}>
          <FolderInput className="h-4 w-4" />
          移动
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={`/api/files/${file.id}/download`}>
            下载
          </a>
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </div>
  );
}
