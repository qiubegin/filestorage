import fs from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from './test/helpers';
import { createApp } from './app';
import { getStorageDir } from './config';
import { ensureRootDirectory } from './lib/root-directory';
import { LocalStorageAdapter } from './storage/local-storage-adapter';
import type { StorageAdapter } from './storage/storage-adapter';

// 合法 cuid 格式但数据库中不存在的 ID（c + 24 个字符）
const MISSING_ID = `c${'0'.repeat(24)}`;

async function uploadFile(
  app: TestContext['app'],
  directoryId: string,
  filename: string,
  content: string,
  mimeType = 'text/plain',
) {
  return request(app)
    .post('/api/files/upload')
    .field('directoryId', directoryId)
    .attach('files', Buffer.from(content), { filename, contentType: mimeType });
}

async function createDirectory(app: TestContext['app'], name: string, parentId: string) {
  const res = await request(app).post('/api/directories').send({ name, parentId });
  expect(res.status).toBe(201);
  return res.body as { id: string; name: string; parentId: string };
}

describe('文件 API：上传与版本', () => {
  let ctx: TestContext;
  const rootId = 'root';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('首次上传生成 v1 且仅一条逻辑文件', async () => {
    const res = await uploadFile(ctx.app, rootId, 'report.txt', 'hello v1');
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ status: 'created', version: 1 });

    const files = await ctx.prisma.file.findMany({
      where: { directoryId: rootId, name: 'report.txt' },
      include: { versions: true },
    });
    expect(files).toHaveLength(1);
    expect(files[0].versions).toHaveLength(1);
    expect(files[0].versions[0].version).toBe(1);
  });

  it('同目录同名再次上传只新增版本 v2', async () => {
    const res = await uploadFile(ctx.app, rootId, 'report.txt', 'hello v2');
    expect(res.body.results[0]).toMatchObject({ status: 'versioned', version: 2 });

    const files = await ctx.prisma.file.findMany({
      where: { directoryId: rootId, name: 'report.txt' },
      include: { versions: true },
    });
    expect(files).toHaveLength(1);
    expect(files[0].versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it('下载最新版本与指定历史版本，内容真实正确', async () => {
    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: rootId, name: 'report.txt' } },
    });
    expect(file).not.toBeNull();

    const latest = await request(ctx.app).get(`/api/files/${file!.id}/download`);
    expect(latest.status).toBe(200);
    expect(latest.text).toBe('hello v2');

    const v1 = await request(ctx.app).get(`/api/files/${file!.id}/download?version=1`);
    expect(v1.status).toBe(200);
    expect(v1.text).toBe('hello v1');
  });

  it('版本列表按版本号倒序返回', async () => {
    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: rootId, name: 'report.txt' } },
    });
    const res = await request(ctx.app).get(`/api/files/${file!.id}/versions`);
    expect(res.status).toBe(200);
    expect(res.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(res.body.versions[0].size).toBe('hello v2'.length);
  });

  it('不同目录允许同名文件', async () => {
    const other = await createDirectory(ctx.app, 'other-dir', rootId);
    const a = await uploadFile(ctx.app, rootId, 'shared.txt', 'root copy');
    const b = await uploadFile(ctx.app, other.id, 'shared.txt', 'other copy');
    expect(a.body.results[0].status).toBe('created');
    expect(b.body.results[0].status).toBe('created');

    const count = await ctx.prisma.file.count({ where: { name: 'shared.txt' } });
    expect(count).toBe(2);
  });

  it('目录内容仅展示最新版本信息', async () => {
    const res = await request(ctx.app).get(`/api/directories/${rootId}/content`);
    const entry = res.body.files.find((f: { name: string }) => f.name === 'report.txt');
    expect(entry.latestVersion).toBe(2);
    expect(entry.size).toBe('hello v2'.length);
    expect(entry.mimeType).toBe('text/plain');
  });
});

describe('文件 API：移动', () => {
  let ctx: TestContext;
  const rootId = 'root';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('移动后源目录不可见、目标可见、历史与内容不变', async () => {
    const src = await createDirectory(ctx.app, 'move-src', rootId);
    const dst = await createDirectory(ctx.app, 'move-dst', rootId);
    await uploadFile(ctx.app, src.id, 'moveme.txt', 'm1');
    await uploadFile(ctx.app, src.id, 'moveme.txt', 'm2');

    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: src.id, name: 'moveme.txt' } },
    });
    const moveRes = await request(ctx.app).post(`/api/files/${file!.id}/move`).send({ targetDirectoryId: dst.id });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body).toMatchObject({ fileId: file!.id, directoryId: dst.id });

    const srcContent = await request(ctx.app).get(`/api/directories/${src.id}/content`);
    expect(srcContent.body.files.map((f: { id: string }) => f.id)).not.toContain(file!.id);

    const dstContent = await request(ctx.app).get(`/api/directories/${dst.id}/content`);
    const entry = dstContent.body.files.find((f: { id: string }) => f.id === file!.id);
    expect(entry.latestVersion).toBe(2);

    const latest = await request(ctx.app).get(`/api/files/${file!.id}/download`);
    expect(latest.text).toBe('m2');
    const v1 = await request(ctx.app).get(`/api/files/${file!.id}/download?version=1`);
    expect(v1.text).toBe('m1');

    const versions = await request(ctx.app).get(`/api/files/${file!.id}/versions`);
    expect(versions.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it('移动到存在同名文件的目标目录返回 409，且双方数据不变', async () => {
    const src = await createDirectory(ctx.app, 'conflict-src', rootId);
    const dst = await createDirectory(ctx.app, 'conflict-dst', rootId);
    await uploadFile(ctx.app, src.id, 'conflict.txt', 'source content');
    await uploadFile(ctx.app, dst.id, 'conflict.txt', 'target content');

    const srcFile = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: src.id, name: 'conflict.txt' } },
    });
    const dstFile = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: dst.id, name: 'conflict.txt' } },
    });

    const res = await request(ctx.app).post(`/api/files/${srcFile!.id}/move`).send({ targetDirectoryId: dst.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    // 源目录仍可见、目标目录同名文件仍存在、版本数不变
    const srcContent = await request(ctx.app).get(`/api/directories/${src.id}/content`);
    expect(srcContent.body.files.map((f: { id: string }) => f.id)).toContain(srcFile!.id);
    const dstContent = await request(ctx.app).get(`/api/directories/${dst.id}/content`);
    expect(dstContent.body.files.map((f: { id: string }) => f.id)).toContain(dstFile!.id);
    expect(await ctx.prisma.fileVersion.count({ where: { fileId: srcFile!.id } })).toBe(1);
    expect(await ctx.prisma.fileVersion.count({ where: { fileId: dstFile!.id } })).toBe(1);

    const dl = await request(ctx.app).get(`/api/files/${srcFile!.id}/download`);
    expect(dl.text).toBe('source content');
  });

  it('移动目标目录不存在返回 404', async () => {
    const src = await createDirectory(ctx.app, 'mv-404', rootId);
    await uploadFile(ctx.app, src.id, 'm.txt', 'm');
    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: src.id, name: 'm.txt' } },
    });
    const res = await request(ctx.app).post(`/api/files/${file!.id}/move`).send({ targetDirectoryId: MISSING_ID });
    expect(res.status).toBe(404);
  });
});

describe('文件 API：删除与物理文件验证', () => {
  let ctx: TestContext;
  const rootId = 'root';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('删除后版本元数据清除，且存储目录中对应 storageKey 物理文件不存在', async () => {
    const dir = await createDirectory(ctx.app, 'del-dir', rootId);
    await uploadFile(ctx.app, dir.id, 'del.txt', 'd1');
    await uploadFile(ctx.app, dir.id, 'del.txt', 'd2');

    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: dir.id, name: 'del.txt' } },
      include: { versions: true },
    });
    expect(file!.versions).toHaveLength(2);

    // 从数据库直接读取 storageKey（API 不返回该字段）
    const storageKeys = file!.versions.map((v) => v.storageKey);
    for (const key of storageKeys) {
      expect(fs.existsSync(path.join(ctx.storageDir, key))).toBe(true);
    }

    const res = await request(ctx.app).delete(`/api/files/${file!.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, deletedVersions: 2 });

    expect(await ctx.prisma.file.findUnique({ where: { id: file!.id } })).toBeNull();
    expect(await ctx.prisma.fileVersion.count({ where: { fileId: file!.id } })).toBe(0);

    // 关键验证：物理文件必须已从存储目录删除
    for (const key of storageKeys) {
      expect(fs.existsSync(path.join(ctx.storageDir, key))).toBe(false);
    }
  });
});

describe('文件 API：错误语义与安全', () => {
  let ctx: TestContext;
  const rootId = 'root';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('上传到不存在的目录返回 404', async () => {
    const res = await uploadFile(ctx.app, MISSING_ID, 'x.txt', 'x');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('无文件上传返回 400', async () => {
    const res = await request(ctx.app).post('/api/files/upload').field('directoryId', rootId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILES');
  });

  it('非法 directoryId 返回 400', async () => {
    const res = await uploadFile(ctx.app, 'not-an-id', 'x.txt', 'x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('文件不存在时 versions/download/move/delete 返回 404', async () => {
    const versions = await request(ctx.app).get(`/api/files/${MISSING_ID}/versions`);
    expect(versions.status).toBe(404);
    const download = await request(ctx.app).get(`/api/files/${MISSING_ID}/download`);
    expect(download.status).toBe(404);
    const move = await request(ctx.app).post(`/api/files/${MISSING_ID}/move`).send({ targetDirectoryId: rootId });
    expect(move.status).toBe(404);
    const del = await request(ctx.app).delete(`/api/files/${MISSING_ID}`);
    expect(del.status).toBe(404);
  });

  it('版本不存在或 version 参数非法返回明确错误', async () => {
    const dir = await createDirectory(ctx.app, 'ver-err', rootId);
    await uploadFile(ctx.app, dir.id, 'v.txt', 'v1');
    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: dir.id, name: 'v.txt' } },
    });

    const missing = await request(ctx.app).get(`/api/files/${file!.id}/download?version=99`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('VERSION_NOT_FOUND');

    const invalid = await request(ctx.app).get(`/api/files/${file!.id}/download?version=abc`);
    expect(invalid.status).toBe(400);
  });

  it('单次超过 20 个文件返回 400', async () => {
    let req = request(ctx.app).post('/api/files/upload').field('directoryId', rootId);
    for (let i = 0; i < 21; i += 1) {
      req = req.attach('files', Buffer.from(`f${i}`), { filename: `f${i}.txt` });
    }
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_FILES');
  });

  it('路径分隔符文件名被净化，不产生含分隔符的逻辑文件名', async () => {
    const res = await uploadFile(ctx.app, rootId, '../evil.txt', 'x');
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('created');
    expect(res.body.results[0].originalName).toBe('evil.txt');
    const names = (await ctx.prisma.file.findMany({ where: { directoryId: rootId } })).map((f) => f.name);
    expect(names).not.toContain('../evil.txt');
  });
});

describe('名称校验单元验证（validateEntryName）', () => {
  it('拒绝空、超长、含路径分隔符与空字符的名称', async () => {
    const { validateEntryName } = await import('./lib/validation');
    expect(() => validateEntryName('')).toThrow();
    expect(() => validateEntryName('   ')).toThrow();
    expect(() => validateEntryName('a/b')).toThrow();
    expect(() => validateEntryName('a\\b')).toThrow();
    expect(() => validateEntryName(`a\u0000b`)).toThrow();
    expect(() => validateEntryName('x'.repeat(256))).toThrow();
    expect(validateEntryName('  ok.txt  ')).toBe('ok.txt');
  });
});

describe('文件 API：中文文件名与数据持久化', () => {
  let ctx: TestContext;
  const rootId = 'root';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('中文文件名不乱码，下载头正确编码', async () => {
    const chineseName = '中文 报告.txt';
    const res = await uploadFile(ctx.app, rootId, chineseName, '中文内容');
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('created');
    expect(res.body.results[0].originalName).toBe(chineseName);

    const file = await ctx.prisma.file.findFirst({ where: { name: chineseName } });
    expect(file).not.toBeNull();

    const dl = await request(ctx.app).get(`/api/files/${file!.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.text).toBe('中文内容');
    expect(dl.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(chineseName)}`);
  });

  it('重建 Prisma 连接后目录、版本元数据与文件内容仍可读取', async () => {
    const dir = await createDirectory(ctx.app, 'persist-dir', rootId);
    await uploadFile(ctx.app, dir.id, 'persist.txt', 'keep me');
    const file = await ctx.prisma.file.findUnique({
      where: { directoryId_name: { directoryId: dir.id, name: 'persist.txt' } },
      include: { versions: true },
    });

    const fresh = new PrismaClient();
    try {
      const directory = await fresh.directory.findUnique({ where: { id: dir.id } });
      expect(directory).not.toBeNull();
      const persisted = await fresh.file.findUnique({
        where: { id: file!.id },
        include: { versions: true },
      });
      expect(persisted!.versions).toHaveLength(1);
      expect(persisted!.versions[0].version).toBe(1);
      const content = await ctx.storage.read(persisted!.versions[0].storageKey);
      expect(content.toString('utf8')).toBe('keep me');
    } finally {
      await fresh.$disconnect();
    }
  });
});

describe('文件 API：物理删除失败边界', () => {
  it('物理文件删除失败时返回明确错误，且符合先删元数据、再删物理文件的边界', async () => {
    const prisma = new PrismaClient();
    await ensureRootDirectory(prisma);
    const baseStorage = new LocalStorageAdapter(getStorageDir());
    const failKeys = new Set<string>();
    const failingStorage: StorageAdapter = {
      save: (key, content) => baseStorage.save(key, content),
      read: (key) => baseStorage.read(key),
      delete: async (key) => {
        if (failKeys.has(key)) {
          throw new Error('模拟物理删除失败');
        }
        await baseStorage.delete(key);
      },
    };
    const app = createApp({ prisma, storage: failingStorage });

    try {
      const uploadRes = await uploadFile(app, 'root', 'fail-del.txt', 'f1');
      expect(uploadRes.body.results[0].status).toBe('created');
      const uploadRes2 = await uploadFile(app, 'root', 'fail-del.txt', 'f2');
      expect(uploadRes2.body.results[0].status).toBe('versioned');

      const file = await prisma.file.findUnique({
        where: { directoryId_name: { directoryId: 'root', name: 'fail-del.txt' } },
        include: { versions: { orderBy: { version: 'asc' } } },
      });
      expect(file!.versions).toHaveLength(2);
      const [key1, key2] = file!.versions.map((v) => v.storageKey);
      expect(fs.existsSync(path.join(getStorageDir(), key1))).toBe(true);
      expect(fs.existsSync(path.join(getStorageDir(), key2))).toBe(true);

      // 让第二个版本的物理文件删除失败
      failKeys.add(key2);
      const res = await request(app).delete(`/api/files/${file!.id}`);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('STORAGE_DELETE_FAILED');

      // 元数据已按“先删元数据”顺序删除
      expect(await prisma.file.findUnique({ where: { id: file!.id } })).toBeNull();
      expect(await prisma.fileVersion.count({ where: { fileId: file!.id } })).toBe(0);
      // 第一个物理文件已删，失败的第二个物理文件保留
      expect(fs.existsSync(path.join(getStorageDir(), key1))).toBe(false);
      expect(fs.existsSync(path.join(getStorageDir(), key2))).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});