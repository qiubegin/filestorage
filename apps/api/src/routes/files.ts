import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';

import { ApiError, asyncHandler } from '../lib/errors';
import { assertEntityId, validateEntryName } from '../lib/validation';
import type { StorageAdapter } from '../storage/storage-adapter';
import { StorageNotFoundError } from '../storage/storage-adapter';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_COUNT = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILE_COUNT },
});

interface UploadResult {
  originalName: string;
  status: 'created' | 'versioned' | 'failed';
  fileId?: string;
  version?: number;
  error?: string;
}

interface SaveVersionParams {
  directoryId: string;
  name: string;
  storageKey: string;
  size: number;
  mimeType: string;
}

type SaveOutcome = { status: 'created' | 'versioned'; fileId: string; version: number };

export function createFilesRouter(prisma: PrismaClient, storage: StorageAdapter): Router {
  const router = Router();

  router.post('/upload', upload.array('files', MAX_FILE_COUNT), asyncHandler(async (req, res) => {
    const directoryId = assertEntityId(req.body?.directoryId);
    const directory = await prisma.directory.findUnique({ where: { id: directoryId } });
    if (!directory) {
      throw new ApiError(404, 'NOT_FOUND', '目标目录不存在');
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new ApiError(400, 'NO_FILES', '未收到任何文件');
    }

    const results: UploadResult[] = [];
    for (const file of files) {
      const originalName = decodeMultipartName(file.originalname);
      try {
        const name = validateEntryName(originalName);
        const storageKey = randomUUID();
        await storage.save(storageKey, file.buffer);
        try {
          const outcome = await saveFileVersion(prisma, {
            directoryId,
            name,
            storageKey,
            size: file.size,
            mimeType: file.mimetype || 'application/octet-stream',
          });
          results.push({
            originalName,
            status: outcome.status,
            fileId: outcome.fileId,
            version: outcome.version,
          });
        } catch (dbErr) {
          // 元数据创建失败：尽力删除刚写入的物理文件，避免孤儿文件
          await storage.delete(storageKey).catch((cleanupErr) => {
            console.error(`[api] 清理孤儿物理文件失败: ${storageKey}`, cleanupErr);
          });
          throw dbErr;
        }
      } catch (err) {
        results.push({
          originalName,
          status: 'failed',
          error: err instanceof ApiError ? err.message : '服务器错误',
        });
      }
    }
    res.json({ results });
  }));

  router.get('/:fileId/versions', asyncHandler(async (req, res) => {
    const fileId = assertEntityId(req.params.fileId);
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new ApiError(404, 'NOT_FOUND', '文件不存在');
    }
    const versions = await prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { version: 'desc' },
    });
    res.json({
      file: { id: file.id, name: file.name, directoryId: file.directoryId },
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        size: v.size,
        mimeType: v.mimeType,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  }));

  router.get('/:fileId/download', asyncHandler(async (req, res) => {
    const fileId = assertEntityId(req.params.fileId);
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new ApiError(404, 'NOT_FOUND', '文件不存在');
    }

    const versionParam = req.query.version;
    let fileVersion;
    if (versionParam !== undefined) {
      const version = Number(versionParam);
      if (!Number.isInteger(version) || version < 1) {
        throw new ApiError(400, 'INVALID_VERSION', 'version 必须是正整数');
      }
      fileVersion = await prisma.fileVersion.findUnique({
        where: { fileId_version: { fileId, version } },
      });
      if (!fileVersion) {
        throw new ApiError(404, 'VERSION_NOT_FOUND', '文件版本不存在');
      }
    } else {
      fileVersion = await prisma.fileVersion.findFirst({
        where: { fileId },
        orderBy: { version: 'desc' },
      });
      if (!fileVersion) {
        throw new ApiError(404, 'NOT_FOUND', '文件没有可用版本');
      }
    }

    let content: Buffer;
    try {
      content = await storage.read(fileVersion.storageKey);
    } catch (err) {
      if (err instanceof StorageNotFoundError) {
        throw new ApiError(500, 'STORAGE_MISSING', `物理文件缺失（storageKey: ${fileVersion.storageKey}）`);
      }
      throw err;
    }

    res.setHeader('Content-Type', fileVersion.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Content-Length', String(content.length));
    res.send(content);
  }));

  router.post('/:fileId/move', asyncHandler(async (req, res) => {
    const fileId = assertEntityId(req.params.fileId);
    const targetDirectoryId = assertEntityId(req.body?.targetDirectoryId);

    await prisma.$transaction(async (tx) => {
      const file = await tx.file.findUnique({ where: { id: fileId } });
      if (!file) {
        throw new ApiError(404, 'NOT_FOUND', '文件不存在');
      }
      if (file.directoryId === targetDirectoryId) {
        return;
      }
      const target = await tx.directory.findUnique({ where: { id: targetDirectoryId } });
      if (!target) {
        throw new ApiError(404, 'NOT_FOUND', '目标目录不存在');
      }
      const conflict = await tx.file.findUnique({
        where: { directoryId_name: { directoryId: targetDirectoryId, name: file.name } },
      });
      if (conflict) {
        throw new ApiError(409, 'CONFLICT', '目标目录已存在同名文件');
      }
      await tx.file.update({
        where: { id: fileId },
        data: { directoryId: targetDirectoryId, updatedAt: new Date() },
      });
    });

    res.json({ fileId, directoryId: targetDirectoryId });
  }));

  router.delete('/:fileId', asyncHandler(async (req, res) => {
    const fileId = assertEntityId(req.params.fileId);
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { versions: true },
    });
    if (!file) {
      throw new ApiError(404, 'NOT_FOUND', '文件不存在');
    }

    // 1. 事务内删除元数据（File 删除级联删除 FileVersion）
    await prisma.$transaction(async (tx) => {
      await tx.file.delete({ where: { id: fileId } });
    });

    // 2. 事务提交后删除物理文件；失败不得伪装成功
    const failedKeys: string[] = [];
    for (const version of file.versions) {
      try {
        await storage.delete(version.storageKey);
      } catch (err) {
        if (err instanceof StorageNotFoundError) {
          console.warn(`[api] 物理文件已缺失，跳过删除: ${version.storageKey}`);
          continue;
        }
        failedKeys.push(version.storageKey);
      }
    }
    if (failedKeys.length > 0) {
      console.error(`[api] 物理文件删除失败: ${failedKeys.join(', ')}`);
      throw new ApiError(
        500,
        'STORAGE_DELETE_FAILED',
        `文件元数据已删除，但 ${failedKeys.length} 个物理文件删除失败（storageKey: ${failedKeys.join(', ')}）`,
      );
    }

    res.json({ fileId, deleted: true, deletedVersions: file.versions.length });
  }));

  return router;
}

async function saveFileVersion(prisma: PrismaClient, params: SaveVersionParams): Promise<SaveOutcome> {
  const existing = await prisma.file.findUnique({
    where: { directoryId_name: { directoryId: params.directoryId, name: params.name } },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  if (!existing) {
    try {
      const file = await prisma.file.create({
        data: {
          name: params.name,
          directoryId: params.directoryId,
          versions: {
            create: {
              version: 1,
              storageKey: params.storageKey,
              size: params.size,
              mimeType: params.mimeType,
            },
          },
        },
      });
      return { status: 'created', fileId: file.id, version: 1 };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'CONFLICT', '同名文件并发上传冲突，请重试');
      }
      throw err;
    }
  }

  const nextVersion = existing.versions[0].version + 1;
  try {
    await prisma.fileVersion.create({
      data: {
        fileId: existing.id,
        version: nextVersion,
        storageKey: params.storageKey,
        size: params.size,
        mimeType: params.mimeType,
      },
    });
    await prisma.file.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
    return { status: 'versioned', fileId: existing.id, version: nextVersion };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'CONFLICT', '同名文件并发上传冲突，请重试');
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}

// multer/busboy 按 latin1 解析 multipart 文件名，UTF-8 中文会变成乱码；检测并修复
function decodeMultipartName(raw: string): string {
  if (/[\u0080-\u00ff]/.test(raw) && !/[\u4e00-\u9fff]/.test(raw)) {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd')) {
      return decoded;
    }
  }
  return raw;
}
