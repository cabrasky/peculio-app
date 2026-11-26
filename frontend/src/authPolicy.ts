export function isSessionRejected(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  return error.status === 401 || error.status === 403;
}

export function shouldClearAccountCache(previous: { id: string } | null, next: { id: string }): boolean {
  return Boolean(previous && previous.id !== next.id);
}
