// Web Push with VAPID ES256 and RFC 8291 aes128gcm payload encryption.
// Required server configuration: VAPID_PRIVATE_KEY (base64url P-256 scalar),
// VAPID_PUBLIC_KEY (matching uncompressed public key), VAPID_SUBJECT (real contact).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptWebPush, MAX_WEB_PUSH_PAYLOAD_BYTES, safePushEndpoint, validateSubscriptionKeys, vapidSigner } from './web-push.ts';

const MAX_RECIPIENTS = 100;
const MAX_SUBSCRIPTIONS = 200;
const SEND_CONCURRENCY = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://mydan.digityoucan.com').split(',').map(value => value.trim());
  const origin = req.headers.get('Origin');
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: 'Origin is not allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return reply(401, { error: 'Unauthorized' });
  const verify = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await verify.auth.getUser();
  if (authError || !auth?.user) return reply(401, { error: 'Unauthorized' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: caller, error: callerError } = await admin.from('supervisors').select('role,company_id,is_active').eq('user_id', auth.user.id).maybeSingle();
  if (callerError || !caller?.is_active || !caller.company_id || !['admin', 'super_admin'].includes(caller.role)) return reply(403, { error: 'Forbidden' });

  let input: unknown;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: 'Invalid request' });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); return reply(413, { error: 'Request too large' }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return reply(400, { error: 'Invalid request' }); }
  const body = input as { supervisorIds?: unknown; title?: unknown; body?: unknown } | null;
  if (!body || !Array.isArray(body.supervisorIds) || !body.supervisorIds.length || body.supervisorIds.length > MAX_RECIPIENTS
    || body.supervisorIds.some(value => typeof value !== 'string' || !UUID.test(value))
    || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160
    || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 2000) {
    return reply(400, { error: 'Invalid notification or recipients' });
  }
  const ids = [...new Set(body.supervisorIds as string[])];
  const payload = new TextEncoder().encode(JSON.stringify({ title: body.title.trim(), body: body.body.trim() }));
  if (payload.length > MAX_WEB_PUSH_PAYLOAD_BYTES) return reply(413, { error: 'Notification too large' });

  // Membership is independently verified. A forged subscription company_id cannot
  // turn a foreign/inactive supervisor ID into a valid recipient.
  const { data: recipients, error: recipientError } = await admin.from('supervisors').select('id').in('id', ids).eq('company_id', caller.company_id).eq('is_active', true);
  if (recipientError || !Array.isArray(recipients)) return reply(503, { error: 'Could not verify recipients' });
  const known = new Set(recipients.map(value => value.id));
  if (ids.some(id => !known.has(id))) return reply(403, { error: 'Recipients are outside the permitted scope' });
  const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions').select('id,supervisor_id,endpoint,p256dh,auth')
    .in('supervisor_id', ids).eq('company_id', caller.company_id).order('id').limit(MAX_SUBSCRIPTIONS + 1);
  if (subscriptionError || !Array.isArray(subscriptions)) return reply(503, { error: 'Could not read subscriptions' });
  if (subscriptions.length > MAX_SUBSCRIPTIONS) return reply(413, { error: 'Choose a smaller recipient group' });
  if (!subscriptions.length) return reply(200, { sent: 0, accepted: 0, total: 0, failed: 0, expired: 0 });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return reply(503, { error: 'Push service is not configured' });
  let sign: (audience: string) => Promise<string>;
  try { sign = await vapidSigner(publicKey, privateKey, subject); }
  catch { return reply(503, { error: 'Push service configuration is invalid' }); }

  let cursor = 0, accepted = 0, failed = 0, expired = 0;
  const endpoints = new Set<string>();
  const unique = subscriptions.filter(subscription => {
    if (endpoints.has(subscription.endpoint)) return false;
    endpoints.add(subscription.endpoint);
    return true;
  });
  async function worker() {
    while (cursor < unique.length) {
      const subscription = unique[cursor++];
      try {
        if (!ids.includes(subscription.supervisor_id)) throw new Error('Invalid subscription scope');
        const endpoint = safePushEndpoint(subscription.endpoint);
        validateSubscriptionKeys(subscription);
        const encrypted = await encryptWebPush(payload, subscription);
        const jwt = await sign(endpoint.origin);
        const response = await fetch(endpoint.href, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `vapid t=${jwt},k=${publicKey}`, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400' },
          body: encrypted as BodyInit,
        });
        if (response.ok) accepted++;
        else {
          failed++;
          if (response.status === 404 || response.status === 410) expired++;
        }
        try { await response.body?.cancel(); } catch { /* Response acceptance is already known. */ }
      } catch { failed++; } // Never log endpoint tokens, subscription keys or VAPID material.
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, unique.length) }, () => worker()));
  // "sent" is kept for API compatibility; both counters mean provider acceptance,
  // not proof that a phone received/displayed the notification.
  return reply(failed ? (accepted ? 207 : 502) : 200, { sent: accepted, accepted, total: unique.length, failed, expired });
});
