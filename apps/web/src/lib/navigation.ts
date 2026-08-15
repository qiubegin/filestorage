import type { DirectorySummary } from '@/api/types';

export function buildBreadcrumbChain(
  directories: DirectorySummary[] | undefined,
  current: DirectorySummary | undefined,
  currentId: string,
): DirectorySummary[] {
  if (!directories || directories.length === 0) {
    return current ? [current] : [];
  }
  const byId = new Map(directories.map((d) => [d.id, d]));
  const chain: DirectorySummary[] = [];
  const seen = new Set<string>();
  let node = byId.get(currentId) ?? current;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    chain.unshift(node);
    node = node.parentId === node.id ? undefined : byId.get(node.parentId);
  }
  return chain.length > 0 ? chain : current ? [current] : [];
}
