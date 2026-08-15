import 'dotenv/config';

import { DEFAULT_API_PORT } from '@zhishu/shared';

import { createApp } from './app';
import { ensureStorageDir, getPort, getStorageDir } from './config';
import { prisma } from './lib/prisma';
import { ensureRootDirectory } from './lib/root-directory';
import { LocalStorageAdapter } from './storage/local-storage-adapter';

const storageDir = ensureStorageDir(getStorageDir());
const storage = new LocalStorageAdapter(storageDir);

await ensureRootDirectory(prisma);

const app = createApp({ prisma, storage });
const port = getPort(DEFAULT_API_PORT);

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
  console.log(`[api] storage dir: ${storageDir}`);
});
