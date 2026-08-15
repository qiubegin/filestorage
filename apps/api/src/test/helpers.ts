import { PrismaClient } from '@prisma/client';

import { createApp } from '../app';
import { getStorageDir } from '../config';
import { ensureRootDirectory } from '../lib/root-directory';
import { LocalStorageAdapter } from '../storage/local-storage-adapter';

export interface TestContext {
  prisma: PrismaClient;
  storage: LocalStorageAdapter;
  storageDir: string;
  app: ReturnType<typeof createApp>;
}

export async function createTestContext(): Promise<TestContext> {
  const prisma = new PrismaClient();
  await ensureRootDirectory(prisma);
  const storageDir = getStorageDir();
  const storage = new LocalStorageAdapter(storageDir);
  const app = createApp({ prisma, storage });
  return { prisma, storage, storageDir, app };
}
