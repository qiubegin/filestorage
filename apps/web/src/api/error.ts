export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : '操作失败，请重试';
}
