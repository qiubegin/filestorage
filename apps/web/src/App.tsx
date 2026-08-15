import { FolderOpen } from 'lucide-react';

import { ToastProvider } from '@/components/toast';
import { Workspace } from '@/components/workspace';

export default function App() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
            <FolderOpen className="h-5 w-5" />
            <span className="font-semibold">Web 文件仓库</span>
            <span className="ml-auto text-xs text-muted-foreground">文件工作台</span>
          </div>
        </header>
        <Workspace />
        <footer className="border-t py-4">
          <div className="mx-auto w-full max-w-5xl px-4 text-sm text-muted-foreground">
            React + Vite + Tailwind CSS + shadcn/ui + TanStack Query · Express + Prisma + SQLite
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}