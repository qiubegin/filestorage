import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from './test/helpers';

// 合法 cuid 格式但数据库中不存在的 ID（c + 24 个字符）
const MISSING_ID = `c${'0'.repeat(24)}`;

describe('目录 API', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('根目录存在且 parentId 指向自身', async () => {
    const res = await request(ctx.app).get('/api/directories/root/content');
    expect(res.status).toBe(200);
    expect(res.body.directory).toMatchObject({ id: 'root', parentId: 'root' });
    expect(res.body.subdirectories).toEqual([]);
    expect(res.body.files).toEqual([]);
  });

  it('创建三级目录', async () => {
    const a = await request(ctx.app).post('/api/directories').send({ name: 'dir-a', parentId: 'root' });
    expect(a.status).toBe(201);

    const b = await request(ctx.app).post('/api/directories').send({ name: 'dir-b', parentId: a.body.id });
    expect(b.status).toBe(201);

    const c = await request(ctx.app).post('/api/directories').send({ name: 'dir-c', parentId: b.body.id });
    expect(c.status).toBe(201);

    const content = await request(ctx.app).get(`/api/directories/${a.body.id}/content`);
    expect(content.body.subdirectories.map((d: { name: string }) => d.name)).toContain('dir-b');

    const tree = await request(ctx.app).get('/api/directories/tree');
    const ids = tree.body.directories.map((d: { id: string }) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['root', a.body.id, b.body.id, c.body.id]));
  });

  it('同父目录同名目录返回 409', async () => {
    const first = await request(ctx.app).post('/api/directories').send({ name: 'dup', parentId: 'root' });
    expect(first.status).toBe(201);

    const second = await request(ctx.app).post('/api/directories').send({ name: 'dup', parentId: 'root' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('不同父目录允许同名目录', async () => {
    const p1 = await request(ctx.app).post('/api/directories').send({ name: 'p1', parentId: 'root' });
    const p2 = await request(ctx.app).post('/api/directories').send({ name: 'p2', parentId: 'root' });
    const c1 = await request(ctx.app).post('/api/directories').send({ name: 'same', parentId: p1.body.id });
    const c2 = await request(ctx.app).post('/api/directories').send({ name: 'same', parentId: p2.body.id });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);
  });

  it('父目录不存在返回 404', async () => {
    const res = await request(ctx.app).post('/api/directories').send({ name: 'x', parentId: MISSING_ID });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('目录名与 ID 校验', async () => {
    const empty = await request(ctx.app).post('/api/directories').send({ name: '   ', parentId: 'root' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('INVALID_NAME');

    const slash = await request(ctx.app).post('/api/directories').send({ name: 'a/b', parentId: 'root' });
    expect(slash.status).toBe(400);

    const backslash = await request(ctx.app).post('/api/directories').send({ name: 'a\\b', parentId: 'root' });
    expect(backslash.status).toBe(400);

    const long = await request(ctx.app).post('/api/directories').send({ name: 'x'.repeat(256), parentId: 'root' });
    expect(long.status).toBe(400);

    const badId = await request(ctx.app).get('/api/directories/not-an-id/content');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('INVALID_ID');
  });

  it('目录不存在时 content 返回 404', async () => {
    const res = await request(ctx.app).get(`/api/directories/${MISSING_ID}/content`);
    expect(res.status).toBe(404);
  });

  it('删除空目录成功，返回 204 无响应体', async () => {
    const created = await request(ctx.app).post('/api/directories').send({ name: 'to-delete', parentId: 'root' });
    expect(created.status).toBe(201);

    const res = await request(ctx.app).delete(`/api/directories/${created.body.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await ctx.prisma.directory.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it('根目录不可删除，返回 400', async () => {
    const res = await request(ctx.app).delete('/api/directories/root');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROOT_DIRECTORY');
  });

  it('删除不存在的目录返回 404', async () => {
    const res = await request(ctx.app).delete(`/api/directories/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it('删除含子目录的非空目录返回 409', async () => {
    const parent = await request(ctx.app).post('/api/directories').send({ name: 'non-empty-dir', parentId: 'root' });
    expect(parent.status).toBe(201);
    await request(ctx.app).post('/api/directories').send({ name: 'child', parentId: parent.body.id });

    const res = await request(ctx.app).delete(`/api/directories/${parent.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_EMPTY');
    expect(await ctx.prisma.directory.findUnique({ where: { id: parent.body.id } })).not.toBeNull();
  });

  it('删除含文件的非空目录返回 409', async () => {
    const dir = await request(ctx.app).post('/api/directories').send({ name: 'non-empty-files', parentId: 'root' });
    expect(dir.status).toBe(201);
    await request(ctx.app)
      .post('/api/files/upload')
      .field('directoryId', dir.body.id)
      .attach('files', Buffer.from('x'), { filename: 'a.txt' });

    const res = await request(ctx.app).delete(`/api/directories/${dir.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_EMPTY');
  });
});
