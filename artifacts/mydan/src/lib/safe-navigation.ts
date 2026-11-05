/** Notification actions may navigate only to an app-relative absolute path. */
export function safeAppPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let decoded = value;
  try {
    for (let i = 0; i < 4; i++) {
      if (!/^\/(?!\/)/.test(decoded) || /[\\\u0000-\u0020\u007f]/.test(decoded)) return null;
      const next = decodeURIComponent(decoded);
      if (next === decoded) return value;
      decoded = next;
    }
  } catch { return null; }
  return null;
}
