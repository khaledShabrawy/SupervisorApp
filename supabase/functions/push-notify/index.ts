// Supabase Edge Function — Web Push Notifications (VAPID)
// Env secrets required (Settings → Edge Functions → Secrets):
//   VAPID_PRIVATE_KEY   — base64url-encoded 32-byte P-256 scalar
//   SUPABASE_URL        — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_SUBJECT = 'mailto:admin@mydan.app';
const VAPID_PUBLIC  = 'BEJuGXGBkQ9jvLb5DEh-dY3jsVsRGWHDbHrAXJamefa8izvXCRyH0QqK7YB1Xt68WoHS7v25ie8_gGYDvae-sAM';

// ── Utility: base64url helpers ─────────────────────────────────────────────
function b64urlToUint8(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function uint8ToB64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── VAPID JWT ──────────────────────────────────────────────────────────────
async function buildVapidJwt(audience: string, privateKeyB64: string): Promise<string> {
  const header  = uint8ToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = uint8ToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID_SUBJECT,
  })));
  const sigInput = `${header}.${payload}`;
  const privKey = await crypto.subtle.importKey(
    'raw', b64urlToUint8(privateKeyB64),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    privKey, new TextEncoder().encode(sigInput));
  return `${sigInput}.${uint8ToB64url(new Uint8Array(sig))}`;
}

// ── Encrypt payload for Web Push (ECDH + AES-128-GCM) ─────────────────────
async function encryptPayload(
  body: string, p256dhB64: string, authB64: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; localPub: Uint8Array }> {
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'],
  );
  const localPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );
  const remotePub = await crypto.subtle.importKey(
    'raw', b64urlToUint8(p256dhB64), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePub }, serverKeyPair.privateKey, 256,
  );
  const authSecret = b64urlToUint8(authB64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF expand
  const hkdf = async (ikm: ArrayBuffer, salt2: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt2, info }, k, len * 8,
    ));
  };
  const prk = await hkdf(sharedSecret, authSecret,
    new TextEncoder().encode('Content-Encoding: auth\0'), 32);
  const context = new Uint8Array([
    ...new TextEncoder().encode('P-256\0'),
    0, 65, ...b64urlToUint8(p256dhB64),
    0, 65, ...localPubRaw,
  ]);
  const cek = await hkdf(prk, salt,
    new Uint8Array([...new TextEncoder().encode('Content-Encoding: aesgcm\0'), ...context]), 16);
  const nonce = await hkdf(prk, salt,
    new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce\0'), ...context]), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plaintext = new TextEncoder().encode(body);
  const padded = new Uint8Array(2 + plaintext.length);
  padded.set(plaintext, 2);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded),
  );
  return { ciphertext, salt, localPub: localPubRaw };
}

// ── Send one push ──────────────────────────────────────────────────────────
async function sendOne(
  endpoint: string, p256dh: string, auth: string,
  title: string, body: string, privateKey: string,
): Promise<{ ok: boolean; status: number }> {
  const origin = new URL(endpoint).origin;
  const jwt = await buildVapidJwt(origin, privateKey);
  const { ciphertext, salt, localPub } = await encryptPayload(
    JSON.stringify({ title, body }), p256dh, auth,
  );
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:     `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      'Content-Type':    'application/octet-stream',
      'Content-Encoding':'aesgcm',
      Encryption:        `salt=${uint8ToB64url(salt)}`,
      'Crypto-Key':      `dh=${uint8ToB64url(localPub)};p256ecdsa=${VAPID_PUBLIC}`,
      TTL:               '86400',
    },
    body: ciphertext,
  });
  return { ok: res.ok, status: res.status };
}

// ── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey' } });

  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!privateKey) return new Response('VAPID_PRIVATE_KEY not set', { status: 500 });

  const { supervisorIds, title, body } = await req.json() as {
    supervisorIds: string[]; title: string; body: string;
  };
  if (!supervisorIds?.length || !title || !body)
    return new Response('bad request', { status: 400 });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('supervisor_id', supervisorIds);

  if (!subs?.length)
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  const results = await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      sendOne(s.endpoint, s.p256dh, s.auth, title, body, privateKey)),
  );
  const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;

  return new Response(JSON.stringify({ sent, total: subs.length }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
