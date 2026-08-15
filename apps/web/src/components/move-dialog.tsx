import * as React from 'react';

import { Folder, FolderInput } from 'lucide-react';

import { errorMessage } from '@/api/error';
import { useDirectoryTree, useMoveFile } from '@/api/hooks';
import type { DirectorySummary, FileSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface TreeRow {
  directory: DirectorySummary;
  depth: number;
}

function buildTreeRows(directories: DirectorySummary[]): TreeRow[] {
  const byParent = new Map<string, DirectorySummary[]>();
  for (const directory of directories) {
    const list = byParent.get(directory.parentId) ?? [];
    list.push(directory);
    byParent.set(directory.parentId, list);
  }
  const rows: TreeRow[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const directory of byParent.get(parentId) ?? []) {
      // 根目录 parentId 指向自身：作为普通节点展示，但不递归，避免死循环
      rows.push({ directory, depth });
      if (directory.id !== directory.parentId) {
        walk(directory.id, depth + 1);
      }
    }
  };
  walk('root', 0);
  return rows;
}

export function MoveDialog({
  file,
  currentDirectoryId,
  onClose,
}: {
  file: FileSummary | null;
  currentDirectoryId: string;
  onClose: () => void;
}) {
  const tree = useDirectoryTree();
  const move = useMoveFile();
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTargetId(null);
    setError(null);
  }, [file?.id]);

  const rows = buildTreeRows(tree.data?.directories ?? []);

  const submit = () => {
    if (!file || !targetId) {
      setError('请选择目标文件夹');
      return;
    }
    move.mutate(
      { fileId: file.id, targetDirectoryId: targetId },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          setError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Dialog open={file !== null} onOpenChange={(next) => {
      if (!next && !move.isPending) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>移动文件</DialogTitle>
          <DialogDescription>
            将「{file?.name}」移动到目标文件夹，全部版本会随文件迁移。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {tree.isPending && <p className="px-3 py-4 text-sm text-muted-foreground">加载目录树中…</p>}
          {tree.isError && <p className="px-3 py-4 text-sm text-red-600">目录树加载失败。</p>}
          {rows.map(({ directory, depth }) => {
            const isCurrent = directory.id === currentDirectoryId;
            const selected = directory.id === targetId;
            return (
              <button
                key={directory.id}
                type="button"
                disabled={isCurrent}
                onClick={() => setTargetId(directory.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50',
                  selected && 'bg-muted',
                )}
                style={{ paddingLeft: `${12 + depth * 20}px` }}
                title={isCurrent ? '不能移动到当前目录' : undefined}
              >
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="min-w-0 truncate">{directory.name}</span>
                {isCurrent && <span className="ml-auto shrink-0 text-xs text-muted-foreground">当前目录</span>}
                {selected && !isCurrent && <span className="ml-auto shrink-0 text-xs text-primary">已选择</span>}
              </button>
            );
          })}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={move.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={move.isPending || targetId === null}>
            <FolderInput className="h-4 w-4" />
            {move.isPending ? '移动中…' : '移动到此文件夹'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
