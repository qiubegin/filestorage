import fs from 'node:fs';
import path from 'node:path';

export function getPort(fallback: number): number {
  const raw = process.env.PORT;
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStorageDir(): string {
  return process.env.STORAGE_DIR ?? './storage';
}

export function ensureStorageDir(dir: string): string {
  const resolved = path.resolve(process.cwd(), dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}
