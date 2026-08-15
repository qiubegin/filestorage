import * as React from 'react';

import { Upload } from 'lucide-react';

import { errorMessage } from '@/api/error';
import { useUploadFiles } from '@/api/hooks';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function UploadDialog({
  open,
  onClose,
  directoryId,
}: {
  open: boolean;
  onClose: () => void;
  directoryId: string;
}) {
  const upload = useUploadFiles();
  const toast = useToast();
  const [selected, setSelected] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setSelected([]);
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (selected.length === 0) {
      setError('请先选择要上传的文件');
      return;
    }
    upload.mutate(
      { directoryId, files: selected },
      {
        onSuccess: (data) => {
          const created = data.results.filter((r) => r.status === 'created').length;
          const versioned = data.results.filter((r) => r.status === 'versioned').length;
          const failed = data.results.filter((r) => r.status === 'failed');
          if (failed.length > 0) {
            setError(`${failed.length} 个文件上传失败：${failed.map((f) => f.error).join('；')}`);
          } else {
            toast.push('success', `上传完成：新增 ${created} 个文件${versioned > 0 ? `，${versioned} 个文件生成新版本` : ''}`);
            onClose();
          }
        },
        onError: (err) => {
          setError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && !upload.isPending) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>上传文件</DialogTitle>
          <DialogDescription>可一次选择多个文件；同目录同名文件将自动生成新版本。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
            onChange={(event) => setSelected(Array.from(event.target.files ?? []))}
            disabled={upload.isPending}
          />
          {selected.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {selected.map((file) => (
                <li key={`${file.name}-${file.lastModified}`} className="truncate text-muted-foreground">
                  {file.name}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={upload.isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={upload.isPending}>
            <Upload className="h-4 w-4" />
            {upload.isPending ? `上传中（${selected.length} 个文件）…` : '上传'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
