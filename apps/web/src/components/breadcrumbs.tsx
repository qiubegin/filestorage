import * as React from 'react';

import { ChevronRight, Folder } from 'lucide-react';

import type { DirectorySummary } from '@/api/types';
import { Button } from '@/components/ui/button';

export function Breadcrumbs({
  chain,
  onNavigate,
}: {
  chain: DirectorySummary[];
  onNavigate: (directoryId: string) => void;
}) {
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm" aria-label="当前路径">
      {chain.map((directory, index) => {
        const isLast = index === chain.length - 1;
        return (
          <React.Fragment key={directory.id}>
            {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {isLast ? (
              <span className="flex shrink-0 items-center gap-1 font-medium">
                <Folder className="h-4 w-4 text-amber-500" />
                {directory.name}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                onClick={() => onNavigate(directory.id)}
              >
                <Folder className="h-4 w-4 text-amber-500" />
                {directory.name}
              </Button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
