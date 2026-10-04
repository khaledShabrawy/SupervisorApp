import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateSupervisor, loadSupervisorProfile, canAccessRoute, shouldIgnoreAuthEvent, signInErrorMessage,
  type AuthState, type ProfileResult,
} from '../lib/auth-policy.ts';
import { createAuthCoordinator } from '../lib/auth-coordinator.ts';
import { authenticateSupervisor } from '../lib/auth-sign-in.ts';
import { validateSupabaseConfiguration } from '../lib/supabase-config.ts';

// Synthetic fixtures only: no credentials, network requests, or database writes.
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const PROFILE = {
  id: USER, full_name: 'مشرف اختبار', phone: null, branch: null,
  role: 'supervisor', is_active: true, created_at: '2026-01-01T00:00:00Z',
};
const URL = 'https://fixture.supabase.co';
const PUBLIC_KEY = 'sb_publishable_local_test_fixture';
const jwtFixture = (role: string) => [
  Buffer.from('{}').toString('base64url'),
  Buffer.from(JSON.stringify({ role })).toString('base64url'),
  'fixture-signature',
].join('.');

for (const [name, url, key] of [
  ['missing URL', '', PUBLIC_KEY],
  ['missing key', URL, ''],
  ['bad URL', 'not-a-url', PUBLIC_KEY],
  ['HTTP URL', 'http://fixture.supabase.co', PUBLIC_KEY],
  ['URL credentials', 'https://fixture:fixture@fixture.supabase.co', PUBLIC_KEY],
  ['URL path', `${URL}/rest/v1`, PUBLIC_KEY],
  ['URL query', `${URL}?fixture=1`, PUBLIC_KEY],
  ['secret key', URL, 'sb_secret_local_test_fixture'],
  ['service role JWT', URL, jwtFixture('service_role')],
  ['authenticated JWT', URL, jwtFixture('authenticated')],
  ['malformed JWT', URL, 'fixture.fixture.fixture'],
  ['arbitrary key', URL, 'not-a-public-key'],
]) {
  test(`configuration denies ${name}`, () => {
    const result = validateSupabaseConfiguration(url, key);
    assert.equal(result.isValid, false);
    assert.ok(result.message);
    if (key) assert.ok(!result.message.includes(key));
  });
}

test('configuration accepts publishable key with surrounding whitespace', () => {
  assert.equal(validateSupabaseConfiguration(` ${URL} `, ` ${PUBLIC_KEY} `).isValid, true);
});
test('configuration accepts legacy anon JWT only', () => {
  assert.equal(validateSupabaseConfiguration(URL, jwtFixture('anon')).isValid, true);
});
test('active profile with nullable SQL fields is accepted', () => {
  assert.deepEqual(evaluateSupervisor(PROFILE, USER), { supervisor: PROFILE, issue: null });
});
test('missing profile denies access with a specific message', () => {
  assert.equal(evaluateSupervisor(null, USER).issue?.code, 'missing_profile');
});
test('inactive profile denies access', () => {
  assert.equal(evaluateSupervisor({ ...PROFILE, is_active: false }, USER).issue?.code, 'inactive');
});
test('unknown active status denies access', () => {
  assert.equal(evaluateSupervisor({ ...PROFILE, is_active: null }, USER).issue?.code, 'inactive');
});
test('profile from another auth identity denies access', () => {
  assert.equal(evaluateSupervisor(PROFILE, OTHER).issue?.code, 'invalid_profile');
});
test('unknown role denies access instead of assuming supervisor permissions', () => {
  assert.equal(evaluateSupervisor({ ...PROFILE, role: 'unverified-role' }, USER).issue?.code, 'unknown_role');
});
test('malformed profile denies access', () => {
  assert.equal(evaluateSupervisor({ ...PROFILE, full_name: null }, USER).issue?.code, 'invalid_profile');
});
test('RLS recursion is reported without exposing raw database messages', async () => {
  const result = await loadSupervisorProfile(USER, async () => ({
    data: PROFILE, error: { code: '42P17', message: 'fixture private database detail' },
  }));
  assert.equal(result.supervisor, null);
  assert.equal(result.issue?.code, 'rls');
  assert.ok(!result.issue?.message.includes('fixture private'));
});
test('permission query failure cannot authorize a returned row', async () => {
  const result = await loadSupervisorProfile(USER, async () => ({
    data: PROFILE, error: { code: '42501' },
  }));
  assert.equal(result.supervisor, null);
  assert.equal(result.issue?.code, 'profile');
});
test('network failure remains fail closed', async () => {
  const result = await loadSupervisorProfile(USER, async () => { throw new Error('fixture transport error'); });
  assert.equal(result.supervisor, null);
  assert.equal(result.issue?.code, 'profile');
});
test('query success without profile remains fail closed', async () => {
  const result = await loadSupervisorProfile(USER, async () => ({ data: null, error: null }));
  assert.equal(result.issue?.code, 'missing_profile');
});
test('field routes require a validated active profile and authenticated state', () => {
  for (const status of ['loading', 'blocked', 'signed_out'] as const) {
    assert.equal(canAccessRoute(status, PROFILE, 'field'), false);
  }
  assert.equal(canAccessRoute('authenticated', null, 'field'), false);
  assert.equal(canAccessRoute('authenticated', PROFILE, 'field'), true);
});
test('admin route denies a supervisor and allows only an active known admin', () => {
  assert.equal(canAccessRoute('authenticated', PROFILE, 'admin'), false);
  assert.equal(canAccessRoute('authenticated', { ...PROFILE, role: 'admin' }, 'admin'), true);
  assert.equal(canAccessRoute('authenticated', { ...PROFILE, role: 'admin', is_active: false }, 'admin'), false);
  assert.equal(canAccessRoute('authenticated', { ...PROFILE, role: 'unverified-role' }, 'field'), false);
});
test('credential and rate-limit errors are Arabic and explicit', () => {
  assert.match(signInErrorMessage({ code: 'invalid_credentials' }), /غير صحيحة/);
  assert.match(signInErrorMessage({ code: 'email_not_confirmed' }), /غير مؤكّد/);
  assert.match(signInErrorMessage({ code: 'over_request_rate_limit' }), /محاولات كثيرة/);
  assert.match(signInErrorMessage({ code: 'unrecognized' }), /تعذر/);
  assert.match(signInErrorMessage({ message: 'Invalid login credentials' }), /غير صحيحة/);
});
test('credential-failure SDK sign-out cannot erase the pending error', () => {
  const signedOut: AuthState = { status: 'signed_out', supervisor: null, issue: null };
  assert.equal(shouldIgnoreAuthEvent('SIGNED_OUT', true, signedOut, null, null), true);
  assert.equal(shouldIgnoreAuthEvent('SIGNED_OUT', false, signedOut, null, null), false);
});
test('a sign-out for an identified profile is not ignored', () => {
  const loading: AuthState = { status: 'loading', supervisor: null, issue: null };
  assert.equal(shouldIgnoreAuthEvent('SIGNED_OUT', true, loading, USER, null), false);
});
test('same-user token refresh does not unmount a validated screen', () => {
  const ready: AuthState = { status: 'authenticated', supervisor: PROFILE, issue: null };
  assert.equal(shouldIgnoreAuthEvent('TOKEN_REFRESHED', false, ready, USER, USER), true);
  assert.equal(shouldIgnoreAuthEvent('USER_UPDATED', false, ready, USER, USER), false);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
function coordinator(loadProfile: (id: string) => Promise<ProfileResult>) {
  const changes: AuthState[] = [];
  let identityChanges = 0;
  const controller = createAuthCoordinator({
    loadProfile, onChange: (state) => changes.push(state),
    onIdentityChange: () => { identityChanges += 1; },
  });
  return { controller, changes, identityChanges: () => identityChanges };
}
test('coordinator blocks routes while profile loading and authorizes after validation', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  const pending = fixture.controller.accept(USER);
  assert.equal(fixture.controller.getState().status, 'loading');
  assert.equal(fixture.controller.getState().supervisor, null);
  await pending;
  assert.equal(fixture.controller.getState().status, 'authenticated');
});
test('logout invalidates a profile response still in flight', async () => {
  const response = deferred<ProfileResult>();
  const fixture = coordinator(() => response.promise);
  const pending = fixture.controller.accept(USER);
  await tick();
  await fixture.controller.accept(null);
  response.resolve(evaluateSupervisor(PROFILE, USER));
  await pending;
  assert.equal(fixture.controller.getState().status, 'signed_out');
  assert.equal(fixture.controller.getState().supervisor, null);
});
test('switching users ignores the previous user response', async () => {
  const oldResponse = deferred<ProfileResult>();
  const newResponse = deferred<ProfileResult>();
  const fixture = coordinator((id) => id === USER ? oldResponse.promise : newResponse.promise);
  const oldPending = fixture.controller.accept(USER);
  await tick();
  const newPending = fixture.controller.accept(OTHER);
  await tick();
  newResponse.resolve(evaluateSupervisor({ ...PROFILE, id: OTHER }, OTHER));
  await newPending;
  oldResponse.resolve(evaluateSupervisor(PROFILE, USER));
  await oldPending;
  assert.equal(fixture.controller.getState().supervisor?.id, OTHER);
});
test('profile failure clears authorization and retry can restore it', async () => {
  let fails = true;
  const fixture = coordinator(async () => fails
    ? { supervisor: null, issue: { code: 'rls', message: 'اختبار RLS' } }
    : evaluateSupervisor(PROFILE, USER));
  await fixture.controller.accept(USER);
  assert.equal(fixture.controller.getState().status, 'blocked');
  assert.equal(fixture.controller.getState().supervisor, null);
  fails = false;
  await fixture.controller.accept(USER);
  assert.equal(fixture.controller.getState().status, 'authenticated');
});
test('unmounted coordinator ignores pending responses', async () => {
  const response = deferred<ProfileResult>();
  const fixture = coordinator(() => response.promise);
  const pending = fixture.controller.accept(USER);
  await tick();
  const before = fixture.changes.length;
  fixture.controller.dispose();
  response.resolve(evaluateSupervisor(PROFILE, USER));
  await pending;
  assert.equal(fixture.changes.length, before);
});
test('cache invalidation happens on identity changes, not same-user retries', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  await fixture.controller.accept(USER);
  await fixture.controller.accept(USER);
  assert.equal(fixture.identityChanges(), 1);
  await fixture.controller.accept(null);
  assert.equal(fixture.identityChanges(), 2);
});
test('an outstanding credential-operation ticket is invalidated by logout', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  await fixture.controller.accept(null);
  const ticket = fixture.controller.getVersion();
  await fixture.controller.accept(null);
  assert.notEqual(fixture.controller.getVersion(), ticket);
  assert.equal(fixture.controller.getState().status, 'signed_out');
});
test('credential failure reports invalid credentials, not a changed session', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  await assert.rejects(authenticateSupervisor(fixture.controller, async () => ({
    data: { user: null, session: null }, error: { code: 'invalid_credentials' },
  })), /غير صحيحة/);
  assert.match(fixture.controller.getState().issue?.message ?? '', /غير صحيحة/);
  assert.equal(fixture.controller.getState().status, 'blocked');
});
test('credential transport rejection is safe and fail closed', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  await assert.rejects(authenticateSupervisor(fixture.controller, async () => {
    throw new Error('fixture raw transport details');
  }), /تعذر تسجيل الدخول/);
  assert.equal(fixture.controller.getState().supervisor, null);
});
test('successful credentials do not bypass RLS profile failure', async () => {
  const fixture = coordinator(async () => loadSupervisorProfile(USER, async () => ({
    data: null, error: { code: '42P17' },
  })));
  await assert.rejects(authenticateSupervisor(fixture.controller, async () => ({
    data: { user: { id: USER }, session: {} }, error: null,
  })), /سياسات الوصول/);
  assert.equal(fixture.controller.getState().issue?.code, 'rls');
});
test('successful credentials wait for the validated supervisor', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  await authenticateSupervisor(fixture.controller, async () => ({
    data: { user: { id: USER }, session: {} }, error: null,
  }));
  assert.equal(fixture.controller.getState().status, 'authenticated');
});
test('logout while credentials are pending prevents the late response from signing in', async () => {
  const fixture = coordinator(async () => evaluateSupervisor(PROFILE, USER));
  const credentials = deferred<{
    data: { user: { id: string }; session: object }; error: null;
  }>();
  const pending = authenticateSupervisor(fixture.controller, () => credentials.promise);
  const assertion = assert.rejects(pending, /تغيّرت جلسة/);
  await fixture.controller.accept(null);
  credentials.resolve({ data: { user: { id: USER }, session: {} }, error: null });
  await assertion;
  assert.equal(fixture.controller.getState().status, 'signed_out');
});