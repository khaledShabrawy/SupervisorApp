export function encodeBase64(bytes:Uint8Array):string {
  let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
/** Use only after Auth.getUser has validated the very same bearer token. */
export function verifiedTokenSession(token:string):string|null {
  try {
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return typeof payload.session_id==='string' ? payload.session_id : null;
  } catch { return null; }
}
