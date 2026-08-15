import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';

import { ApiError, asyncHandler } from '../lib/errors';
import { ROOT_DIRECTORY_ID } from '../lib/root-directory';
import { assertEntityId, validateEntryName } from '../lib/validation';

export function createDirectoriesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/tree', asyncHandler(async (_req, res) => {
    const directories = await prisma.directory.findMany({ orderBy: { name: 'asc' } });
    res.json({
      directories: directories.map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    });
  }));

  router.get('/:id/content', asyncHandler(async (req, res) => {
    const id = assertEntityId(req.params.id);
    const directory = await prisma.directory.findUnique({ where: { id } });
    if (!directory) {
      throw new ApiError(404, 'NOT_FOUND', '目录不存在');
    }
    const [subdirectories, files] = await Promise.all([
      prisma.directory.findMany({ where: { parentId: id, id: { not: id } }, orderBy: { name: 'asc' } }),
      prisma.file.findMany({
        where: { directoryId: id },
        orderBy: { name: 'asc' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      }),
    ]);
    res.json({
      directory: {
        id: directory.id,
        name: directory.name,
        parentId: directory.parentId,
        createdAt: directory.createdAt.toISOString(),
        updatedAt: directory.updatedAt.toISOString(),
      },
      subdirectories: subdirectories.map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      files: files.map((f) => {
        const latest = f.versions[0];
        return {
          id: f.id,
          name: f.name,
          latestVersion: latest.version,
          size: latest.size,
          mimeType: latest.mimeType,
          updatedAt: f.updatedAt.toISOString(),
        };
      }),
    });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const name = validateEntryName(req.body?.name);
    const parentId = assertEntityId(req.body?.parentId);
    const parent = await prisma.directory.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new ApiError(404, 'NOT_FOUND', '父目录不存在');
    }
    let directory;
    try {
      directory = await prisma.directory.create({
        data: { id: randomUUID(), name, parentId },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'CONFLICT', '同级目录已存在同名目录');
      }
      throw err;
    }
    res.status(201).json({
      id: directory.id,
      name: directory.name,
      parentId: directory.parentId,
      createdAt: directory.createdAt.toISOString(),
      updatedAt: directory.updatedAt.toISOString(),
    });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = assertEntityId(req.params.id);
    if (id === ROOT_DIRECTORY_ID) {
      throw new ApiError(400, 'ROOT_DIRECTORY', '根目录不可删除');
    }

    await prisma.$transaction(async (tx) => {
      const directory = await tx.directory.findUnique({
        where: { id },
        include: { _count: { select: { children: true, files: true } } },
      });
      if (!directory) {
        throw new ApiError(404, 'NOT_FOUND', '目录不存在');
      }
      if (directory._count.children > 0 || directory._count.files > 0) {
        throw new ApiError(409, 'NOT_EMPTY', '目录非空，无法删除');
      }
      await tx.directory.delete({ where: { id } });
    });

    res.status(204).end();
  }));

  return router;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}
