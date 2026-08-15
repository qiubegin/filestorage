import { ApiError } from './errors';

const INVALID_NAME_CHARS = /[/\\]/;
// root、Prisma cuid、UUID v4
const ENTITY_ID_PATTERN = /^(root|c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function validateEntryName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_NAME', '名称必须是字符串');
  }
  const name = value.trim();
  if (name.length === 0) {
    throw new ApiError(400, 'INVALID_NAME', '名称不能为空');
  }
  if (name.length > 255) {
    throw new ApiError(400, 'INVALID_NAME', '名称不能超过 255 个字符');
  }
  if (INVALID_NAME_CHARS.test(name) || name.includes('\u0000')) {
    throw new ApiError(400, 'INVALID_NAME', '名称不能包含 /、\\ 或空字符');
  }
  return name;
}

export function assertEntityId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64 || !ENTITY_ID_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_ID', 'ID 格式无效');
  }
  return value;
}
