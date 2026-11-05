/** A comparison token only. The server verifies JWTs; decoding grants no authority. */
export function sessionIdentity(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const payload=JSON.parse(atob(accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return typeof payload.session_id==='string' ? payload.session_id : accessToken;
  } catch { return accessToken; }
}
