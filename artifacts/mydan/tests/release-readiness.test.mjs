import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProjectConfig, releaseConfig } from '../../../scripts/lib/release-config.mjs';
import { checkStaging } from '../../../scripts/testing/staging-readiness.mjs';
const ref = 'abcdefghijklmnopqrst';
const env = { STAGING_SUPABASE_PROJECT_REF: ref, STAGING_SUPABASE_URL: `https://${ref}.supabase.co`, STAGING_SUPABASE_ANON_KEY: 'sb_publishable_synthetic', STAGING_SUPERVISOR_ACCESS_TOKEN: 'supervisor', STAGING_ADMIN_ACCESS_TOKEN: 'admin', STAGING_OTHER_TENANT_ACCESS_TOKEN: 'other' };
function api({ leak = false, empty = false } = {}) {
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    const u = new URL(url); const token = options.headers.Authorization.slice(7);
    let body;
    if (u.pathname === '/auth/v1/settings') body = {};
    else if (u.pathname === '/auth/v1/user') body = { id: token };
    else if (u.searchParams.has('user_id')) body = [{ id: token, user_id: token, company_id: token === 'other' ? 'company-b' : 'company-a', role: token === 'admin' ? 'admin' : 'supervisor', is_active: true }];
    else if (u.searchParams.get('limit') === '0') body = [];
    else if (u.searchParams.has('supervisor_id')) body = [{ screen_key: 'new_visit', is_enabled: true }];
    else if (u.searchParams.has('company_id')) body = empty ? [] : [{ id: 'foreign-row' }];
    else body = leak ? [{ id: 'foreign-row' }] : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
test('release config rejects mismatched projects, server keys, missing credentials and implicit targets', () => {
  const valid = { SUPABASE_PROJECT_REF: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' };
  assert.equal(publicProjectConfig(valid).projectRef, ref);
  assert.throws(() => publicProjectConfig({ ...valid, VITE_SUPABASE_URL: 'https://other.supabase.co' }));
  assert.throws(() => publicProjectConfig({ ...valid, VITE_SUPABASE_ANON_KEY: 'sb_secret_synthetic' }));
  assert.throws(() => releaseConfig(valid, 'production'));
  assert.throws(() => releaseConfig(valid));
});
test('staging readiness exercises existing rows with only GET requests', async () => {
  const result = await checkStaging(env, api());
  assert.equal(result.status, 'passed');
  assert.equal(result.checks.filter(c => c.name.includes('cross-tenant')).length, 6);
});
test('empty fixtures are incomplete rather than falsely passing isolation checks', async () => {
  const result = await checkStaging(env, api({ empty: true }));
  assert.equal(result.status, 'incomplete');
  assert.equal(result.checks.filter(c => c.status === 'skipped').length, 6);
});
test('staging readiness detects a cross-tenant row and fails on unavailable identities', async () => {
  await assert.rejects(checkStaging(env, api({ leak: true })), /Cross-tenant/);
  await assert.rejects(checkStaging({ ...env, STAGING_ADMIN_ACCESS_TOKEN: '' }, api()), /STAGING_ADMIN_ACCESS_TOKEN/);
});

test('release plan deploys only the reviewed function without schema changes or disabled verification', async () => {
  const { deploymentPlan, verifyPublicConnection } = await import('../../../scripts/deploy/release.mjs');
  const config = { url: `https://${ref}.supabase.co`, key: 'sb_publishable_synthetic', projectRef: ref, pagesProject: 'mydan-staging', branch: 'staging' };
  const plan = deploymentPlan(config);
  const commands = JSON.stringify(plan);
  assert.match(commands, /invite-supervisor/);
  assert.match(commands, /--remote=/);
  assert.doesNotMatch(commands, /--no-verify-jwt|--prune|db push|migration|secrets set/);
  await verifyPublicConnection(config, async () => new Response('{}', { status: 200 }));
  await assert.rejects(verifyPublicConnection(config, async () => new Response('{}', { status: 401 })), /verification failed/);
});

test('Cloudflare preflight verifies the selected project and its real production branch', async () => {
  const { verifyCloudflareProject } = await import('../../../scripts/deploy/release.mjs');
  const config = { target: 'production', pagesProject: 'mydan', branch: 'main' };
  const credentials = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic' };
  const request = async () => new Response(JSON.stringify({ success: true, result: { name: 'mydan', production_branch: 'release' } }));
  assert.equal(await verifyCloudflareProject(credentials, config, request), 'release');
  await assert.rejects(verifyCloudflareProject(credentials, config, async () => new Response('{}', { status: 403 })), /verification failed/);
  await assert.rejects(verifyCloudflareProject(credentials, { ...config, target: 'staging', branch: 'release' }, request), /configured as production/);
});


test('deployment rejects an incomplete server contract and uses a read-only catalog query', async () => {
  const { verifyServerContract } = await import('../../../scripts/deploy/release.mjs');
  const config = { projectRef: ref };
  const credentials = { SUPABASE_ACCESS_TOKEN: 'synthetic' };
  await verifyServerContract(credentials, config, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.read_only, true);
    assert.match(body.query, /^select /);
    assert.doesNotMatch(body.query.replace(/'(?:''|[^'])*'/g, "''"), /\b(?:ALTER|CREATE|DROP|UPDATE|DELETE)\b/i);
    return new Response('[{"ready":true}]');
  });
  await assert.rejects(verifyServerContract(credentials, config, async () => new Response('[{"ready":false}]')), /contract is incomplete/);
  await assert.rejects(verifyServerContract(credentials, config, async () => new Response('{}', { status: 403 })), /verification failed/);
});
