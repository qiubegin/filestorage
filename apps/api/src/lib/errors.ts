import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express 4 不会自动捕获 async 路由的 rejected promise，需要显式转发给错误中间件
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.path}` },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: '单文件大小超过限制（最大 50MB）' } });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({ error: { code: 'TOO_MANY_FILES', message: '单次最多上传 20 个文件' } });
      return;
    }
    res.status(400).json({ error: { code: 'MULTIPART_ERROR', message: `上传请求无效: ${err.code}` } });
    return;
  }
  if (isPrismaError(err) && err.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: '资源已存在（唯一约束冲突）' } });
    return;
  }
  if (isPrismaError(err) && err.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '目标资源不存在' } });
    return;
  }
  if (isBodyParseError(err)) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求体不是合法的 JSON' } });
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
}

function isPrismaError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
