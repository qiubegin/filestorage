export interface StorageAdapter {
  save(storageKey: string, content: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export class StorageNotFoundError extends Error {
  constructor(public readonly storageKey: string) {
    super(`Storage entry not found: ${storageKey}`);
    this.name = 'StorageNotFoundError';
  }
}
