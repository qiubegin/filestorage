import type { PrismaClient } from '@prisma/client';
import { API_HEALTH_PATH, type ApiHealthResponse } from '@zhishu/shared';
import express from 'express';

import { errorHandler, notFoundHandler } from './lib/errors';
import { createDirectoriesRouter } from './routes/directories';
import { createFilesRouter } from './routes/files';
import type { StorageAdapter } from './storage/storage-adapter';

export interface AppDeps {
  prisma: PrismaClient;
  storage: StorageAdapter;
}

export function createApp({ prisma, storage }: AppDeps) {
  const app = express();

  app.use(express.json());

  app.get(API_HEALTH_PATH, (_req, res) => {
    const body: ApiHealthResponse = {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  app.use('/api/directories', createDirectoriesRouter(prisma));
  app.use('/api/files', createFilesRouter(prisma, storage));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
