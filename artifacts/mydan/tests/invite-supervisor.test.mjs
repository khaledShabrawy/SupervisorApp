import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the checked-in Edge Function with an in-memory SDK; no Supabase service is contacted.
const source = readFileSync(new URL('../../../supabase/functions/invite-supervisor/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function handler({ resetError = false, permissionsError = false, origin = "https://mydan.digityoucan.com" } = {}) {
  let serve;
  const saved = [];
  const delivery = [];
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-user' } } }),
      resetPasswordForEmail: async (email, options) => { delivery.push(options); return { error: resetError ? new Error('Mail unavailable') : null }; },
      admin: {
        getUserById: async () => ({ data: { user: { email: 'synthetic@example.invalid' } } }),
        inviteUserByEmail: async () => ({ data: { user: { id: 'new-user' } }, error: null }),
        generateLink: () => { throw new Error('Generating a link does not send it'); },
      },
    },
    from(table) {
      let operation;
      const query = {
        select() { return query; }, eq() { return query; },
        insert() { operation = 'insert'; return query; },
        upsert(rows) { saved.push(...rows); return Promise.resolve({ error: permissionsError ? new Error('Denied') : null }); },
        maybeSingle: async () => ({ data: table === 'companies'
          ? { is_active: true, max_supervisors: null }
          : { id: 'supervisor', user_id: 'target-user', company_id: 'company', role: 'admin', is_active: true }, error: null }),
        single: async () => ({ data: { id: 'new-supervisor' }, error: null }),
        then(resolve, reject) { return Promise.resolve({ error: null, operation }).then(resolve, reject); },
      };
      return query;
    },
  };
  vm.runInNewContext(compiled, {
    Deno: { env: { get: name => name === 'ALLOWED_ORIGIN' ? origin : 'synthetic' }, serve: fn => { serve = fn; } },
    createClient: () => admin, Response, URL, console,
  });
  return { invoke: body => serve(new Request('https://review.invalid/invite', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })), saved, delivery };
}

test('resend failure reports delivery failure rather than claiming a generated link was sent', async () => {
  const f = handler({ resetError: true });
  const response = await f.invoke({ action: 'resend_invite', supervisor_id: 'supervisor' });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error_ar, /تعذر إرسال/);
});

test('invites persist all screen grants explicitly and default missing grants to disabled', async () => {
  const f = handler();
  const response = await f.invoke({ email: 'synthetic@example.invalid', full_name: 'Synthetic User', permissions: { new_visit: true } });
  assert.equal(response.status, 200);
  assert.equal(f.saved.length, 7);
  assert.equal(f.saved.find(row => row.screen_key === 'new_visit').is_enabled, true);
  assert.equal(f.saved.find(row => row.screen_key === 'field_survey').is_enabled, false);
});

test('permission persistence failure is surfaced to the administrator', async () => {
  const f = handler({ permissionsError: true });
  const response = await f.invoke({ email: 'synthetic@example.invalid', full_name: 'Synthetic User' });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error_ar, /تعذر حفظ صلاحياته/);
});

test('recovery redirects honor the configured app origin and reject unrelated origins', async () => {
  const f = handler({ origin: 'https://staging.example.test' });
  const response = await f.invoke({ action: 'resend_invite', supervisor_id: 'supervisor', redirect_to: 'https://staging.example.test/set-password' });
  assert.equal(response.status, 200);
  assert.equal(f.delivery[0].redirectTo, 'https://staging.example.test/set-password');
  await f.invoke({ action: 'resend_invite', supervisor_id: 'supervisor', redirect_to: 'https://unrelated.example.test/set-password' });
  assert.equal(f.delivery[1].redirectTo, undefined);
});
