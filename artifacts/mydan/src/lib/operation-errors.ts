/** Only transport/server failures are queued. Validation and authorization failures stay visible. */
export function mayRetryOffline(error: { code?: string; message?: string } | null, status?: number): boolean {
  if (!error) return false;
  if (status !== undefined && status >= 400 && status < 500) return status === 408;
  if (status !== undefined && (status === 0 || status >= 500)) return true;
  return !error.code && /fetch|network|connection|timeout|aborted/i.test(error.message ?? '');
}
