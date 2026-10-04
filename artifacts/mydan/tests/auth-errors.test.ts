import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { signInErrorMessage } from '../src/lib/auth-errors.ts';
import { requireExactCount } from '../src/lib/policy.ts';

for (const [name, body, extraHeaders] of [
  ['modern auth API', { code: 'invalid_credentials', message: 'Invalid login credentials' },
    { 'x-supabase-api-version': '2024-01-01' }],
  ['auth response without version header', { code: 'invalid_credentials', message: 'Invalid login credentials' }, {}],
  ['legacy auth API', { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, {}],
] as const) {
  test(`actual Supabase SDK maps ${name} to the specific Arabic error`, async () => {
    const client = createClient('https://fixture.invalid', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async () => new Response(JSON.stringify(body), {
        status: 400, headers: { 'Content-Type': 'application/json', ...extraHeaders },
      }) },
    });
    const { error } = await client.auth.signInWithPassword({ email: 'fixture@example.invalid', password: 'synthetic-password' });
    assert.ok(error);
    assert.equal(signInErrorMessage(error), 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    assert.equal((await client.auth.getSession()).data.session, null);
  });
}
test('connection, invalid API key and unrelated failures are not mislabeled as wrong password', () => {
  for (const message of ['Failed to fetch', 'Invalid API key', 'Email not confirmed']) {
    assert.equal(signInErrorMessage({ message }), 'تعذر تسجيل الدخول. تحقق من الاتصال وبيانات الحساب.');
  }
});
for (const count of [0, 3]) {
  test(`actual Supabase SDK parses HEAD count ${count} without substituting a missing value`, async () => {
    const client = createClient('https://fixture.invalid', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async () => new Response(null, {
        status: 200, headers: { 'Content-Range': `*/${count}` },
      }) },
    });
    const response = await client.from('supervisors').select('id', { count: 'exact', head: true });
    assert.equal(response.error, null);
    assert.equal(requireExactCount(response.count), count);
  });
}