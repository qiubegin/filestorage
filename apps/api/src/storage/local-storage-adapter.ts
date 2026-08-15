import fs from 'node:fs';
import path from 'node:path';

import type { StorageAdapter } from './storage-adapter';
import { StorageNotFoundError } from './storage-adapter';

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private resolve(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error(`[storage] 非法 storageKey: ${storageKey}`);
    }
    const resolved = path.resolve(this.baseDir, storageKey);
    if (!resolved.startsWith(this.baseDir + path.sep)) {
      throw new Error(`[storage] storageKey 越界: ${storageKey}`);
    }
    return resolved;
  }

  async save(storageKey: string, content: Buffer): Promise<void> {
    await fs.promises.writeFile(this.resolve(storageKey), content);
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await fs.promises.readFile(this.resolve(storageKey));
    } catch (err) {
      if (isEnoent(err)) {
        throw new StorageNotFoundError(storageKey);
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolve(storageKey));
    } catch (err) {
      if (isEnoent(err)) {
        throw new StorageNotFoundError(storageKey);
      }
      throw err;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
