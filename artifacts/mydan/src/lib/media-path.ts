/** Accept paths, or legacy URLs belonging to this project's exact storage bucket. */
export function mediaPath(value: string, projectUrl: string, bucket: string): string {
  let path = value;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.origin !== new URL(projectUrl).origin) throw new Error('Untrusted media origin');
    const prefix = `/storage/v1/object/`;
    if (!url.pathname.startsWith(prefix)) throw new Error('Invalid media URL');
    const rest = url.pathname.slice(prefix.length).replace(/^(public|sign|authenticated)\//, '');
    if (!rest.startsWith(`${bucket}/`)) throw new Error('Unexpected media bucket');
    path = decodeURIComponent(rest.slice(bucket.length + 1));
  }
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..') || /[?#\u0000-\u001f]/.test(path)) {
    throw new Error('Invalid media object path');
  }
  return path;
}
