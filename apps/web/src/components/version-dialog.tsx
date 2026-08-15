import { Download } from 'lucide-react';

import type { FileSummary } from '@/api/types';
import { useFileVersions } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime, formatSize } from '@/lib/format';

export function VersionDialog({
  file,
  onClose,
}: {
  file: FileSummary | null;
  onClose: () => void;
}) {
  const versions = useFileVersions(file?.id ?? null);

  return (
    <Dialog open={file !== null} onOpenChange={(next) => {
      if (!next) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>版本历史：{file?.name}</DialogTitle>
          <DialogDescription>共 {versions.data?.versions.length ?? 0} 个版本，可按版本分别下载。</DialogDescription>
        </DialogHeader>
        {versions.isPending && <p className="text-sm text-muted-foreground">加载中…</p>}
        {versions.isError && <p className="text-sm text-red-600">版本加载失败，请重试。</p>}
        {versions.data && (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {versions.data.versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <div className="font-medium">v{version.version}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatSize(version.size)} · {version.mimeType} · {formatDateTime(version.createdAt)}
                  </div>
                </div>
                <a href={`/api/files/${versions.data.file.id}/download?version=${version.version}`}>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                    下载 v{version.version}
                  </Button>
                </a>
              </div>
            ))}
            {versions.data.versions.length === 0 && (
              <p className="text-sm text-muted-foreground">暂无历史版本。</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
