import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmTarget {
  kind: 'file' | 'directory';
  id: string;
  name: string;
}

export function ConfirmDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: ConfirmTarget | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isDirectory = target?.kind === 'directory';
  return (
    <Dialog open={target !== null} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确认删除{isDirectory ? '文件夹' : '文件'}</DialogTitle>
          <DialogDescription>
            确定要删除{isDirectory ? '文件夹' : '文件'}「{target?.name}」吗？删除后无法恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
