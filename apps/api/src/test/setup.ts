import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll } from 'vitest';

// 每个测试 worker 使用独立的临时数据库与独立存储目录，避免污染开发库/开发存储
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zhishu-api-test-'));
process.env.DATABASE_URL = `file:${testRoot.replace(/\\/g, '/')}/test.db`;
process.env.STORAGE_DIR = path.join(testRoot, 'storage');

try {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'pipe',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `prisma migrate deploy 退出码 ${result.status}`);
  }
} catch (err) {
  console.error('[test-setup] 测试库迁移失败:', err);
  throw err;
}

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});
