/** Standards-based Web Push payloads (RFC 8291/8188) and VAPID (RFC 8292).
 * No subscription endpoint or key may be logged. Payload acceptance by a push
 * provider is not proof that a device displayed the notification.
 */
const encoder = new TextEncoder();
export const MAX_WEB_PUSH_PAYLOAD_BYTES = 3993; // 4096 minus aes128gcm header/tag/delimiter.

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64url(value: string, expectedBytes: number): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 128) {
    throw new Error('Invalid Web Push key');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0)); }
  catch { throw new Error('Invalid Web Push key'); }
  if (bytes.length !== expectedBytes || base64url(bytes) !== value) throw new Error('Invalid Web Push key');
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/** Exact push-service hosts only: caller-controlled URLs cannot become SSRF. */
export function safePushEndpoint(value: string): URL {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error('Invalid push endpoint');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Invalid push endpoint');
  const host = url.hostname;
  const allowed = (host === 'fcm.googleapis.com' && (url.pathname.startsWith('/fcm/send/') || url.pathname.startsWith('/wp/')))
    || (host === 'updates.push.services.mozilla.com' && /^\/wpush\/v[12]\/.+/.test(url.pathname))
    || (host === 'web.push.apple.com' && url.pathname.length > 1)
    || (/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.notify\.windows\.com$/.test(host) && url.pathname.startsWith('/w/'));
  if (!allowed) throw new Error('Unsupported push service');
  return url;
}

export type PushKeys = { p256dh: string; auth: string };
export function validateSubscriptionKeys(keys: PushKeys): void {
  const publicKey = decodeBase64url(keys.p256dh, 65);
  if (publicKey[0] !== 4) throw new Error('Invalid Web Push public key');
  decodeBase64url(keys.auth, 16);
}

/** Import a P-256 private scalar using its matching public coordinates, never raw. */
export async function vapidSigner(publicKeyB64: string, privateKeyB64: string, subject: string) {
  const publicBytes = decodeBase64url(publicKeyB64, 65);
  if (publicBytes[0] !== 4) throw new Error('Invalid VAPID public key');
  decodeBase64url(privateKeyB64, 32);
  let contactValid = /^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(subject);
  if (!contactValid) {
    try {
      const contact = new URL(subject);
      contactValid = contact.protocol === 'https:' && !contact.username && !contact.password && !contact.hash;
    } catch { /* invalid contact */ }
  }
  if (!contactValid) throw new Error('Configure a valid VAPID contact');
  const jwk = { kty: 'EC', crv: 'P-256', x: base64url(publicBytes.slice(1, 33)), y: base64url(publicBytes.slice(33)), d: privateKeyB64, ext: true };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = await crypto.subtle.importKey('raw', publicBytes as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  // Some providers accept a mismatched JWK during import. Verify the pair once.
  const challenge = encoder.encode('Mydan VAPID key-pair validation');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, challenge);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge)) throw new Error('VAPID key pair does not match');
  return async (audience: string): Promise<string> => {
    const header = base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = base64url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: subject })));
    const input = `${header}.${payload}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(input));
    return `${input}.${base64url(new Uint8Array(sig))}`;
  };
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8));
}

/** A single final aes128gcm record, including the RFC 8188 binary header. */
export async function encryptWebPush(payload: Uint8Array, subscription: PushKeys): Promise<Uint8Array> {
  if (payload.length > MAX_WEB_PUSH_PAYLOAD_BYTES) throw new Error('Web Push payload too large');
  validateSubscriptionKeys(subscription);
  const uaPublic = decodeBase64url(subscription.p256dh, 65);
  const auth = decodeBase64url(subscription.auth, 16);
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(shared, auth, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const plaintext = concat(payload, new Uint8Array([2])); // Final record delimiter, no padding.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aes, plaintext as BufferSource));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}
