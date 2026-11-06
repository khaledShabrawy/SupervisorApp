import { pathToFileURL } from 'node:url';
import { publicProjectConfig } from '../lib/release-config.mjs';

const schemas = {
  supervisors: 'id,user_id,company_id,role,is_active,device_id,force_password_change,supervisor_code',
  companies: 'id,is_active,expires_at',
  app_settings: 'id,company_id,app_name,geofence_radius_m,ai_audit_enabled',
  customers: 'id,company_id,name,latitude,longitude',
  visits: 'id,company_id,supervisor_id,customer_id,status,geo_distance',
  supervisor_permissions: 'id,company_id,supervisor_id,screen_key,is_enabled',
};

/** Read-only acceptance checks. No accounts, fixtures, policies or production rows are modified. */
export async function checkStaging(env, request = fetch) {
  const config = publicProjectConfig(env, { prefix: 'STAGING_', projectRef: env.STAGING_SUPABASE_PROJECT_REF });
  const roles = ['SUPERVISOR', 'ADMIN', 'OTHER_TENANT'];
  for (const role of roles) if (!env[`STAGING_${role}_ACCESS_TOKEN`]) throw new Error(`Missing STAGING_${role}_ACCESS_TOKEN.`);
  const checks = [];
  async function get(resource, token) {
    const response = await request(config.url + resource, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new Error(`Staging request failed (${response.status}) at ${resource.split('?')[0]}.`);
    return response.json();
  }
  await get('/auth/v1/settings'); checks.push({ name: 'public-key/project pairing', status: 'passed' });
  const profiles = {};
  for (const role of roles) {
    const token = env[`STAGING_${role}_ACCESS_TOKEN`];
    const user = await get('/auth/v1/user', token);
    if (!user?.id) throw new Error(`Invalid ${role} test identity.`);
    const rows = await get(`/rest/v1/supervisors?select=id,user_id,company_id,role,is_active&user_id=eq.${encodeURIComponent(user.id)}&limit=2`, token);
    if (rows.length !== 1 || rows[0].user_id !== user.id || !rows[0].is_active || !rows[0].company_id) throw new Error(`Invalid ${role} supervisor profile.`);
    profiles[role] = rows[0];
    checks.push({ name: `${role.toLowerCase()} authentication/profile`, status: 'passed' });
  }
  if (!['admin','super_admin'].includes(profiles.ADMIN.role) || profiles.SUPERVISOR.role !== 'supervisor') throw new Error('Dedicated admin and supervisor test roles are required.');
  if (profiles.ADMIN.company_id !== profiles.SUPERVISOR.company_id || profiles.OTHER_TENANT.company_id === profiles.SUPERVISOR.company_id) throw new Error('Test identities must cover one shared company and a distinct second company.');
  if (new Set(Object.values(profiles).map(p => p.user_id)).size !== 3) throw new Error('Use three distinct test identities.');
  for (const [table, columns] of Object.entries(schemas)) {
    await get(`/rest/v1/${table}?select=${columns}&limit=0`, env.STAGING_ADMIN_ACCESS_TOKEN);
    checks.push({ name: `${table} required columns`, status: 'passed' });
  }
  const grants = await get(`/rest/v1/supervisor_permissions?select=screen_key,is_enabled&supervisor_id=eq.${encodeURIComponent(profiles.SUPERVISOR.id)}`, env.STAGING_SUPERVISOR_ACCESS_TOKEN);
  if (!grants.some(row => row.screen_key === 'new_visit' && row.is_enabled === true)) throw new Error('The test supervisor needs an explicit new_visit grant.');
  checks.push({ name: 'explicit supervisor screen grant', status: 'passed' });
  for (const table of ['supervisors','customers','visits','app_settings','supervisor_permissions']) {
    const sample = await get(`/rest/v1/${table}?select=id&company_id=eq.${encodeURIComponent(profiles.OTHER_TENANT.company_id)}&limit=1`, env.STAGING_OTHER_TENANT_ACCESS_TOKEN);
    if (!sample.length) { checks.push({ name: `${table} cross-tenant read isolation`, status: 'skipped', reason: 'A synthetic fixture is required in the second company.' }); continue; }
    const visible = await get(`/rest/v1/${table}?select=id&id=eq.${encodeURIComponent(sample[0].id)}&limit=1`, env.STAGING_SUPERVISOR_ACCESS_TOKEN);
    if (visible.length) throw new Error(`Cross-tenant data exposure in ${table}.`);
    checks.push({ name: `${table} cross-tenant read isolation`, status: 'passed' });
  }
  // Orders are deliberately retired. A successful empty response would still
  // prove the client has SELECT privileges, so it must never count as denial.
  // Authenticated identities were verified above; a later 401 may be an expired
  // session and is not accepted as a permission test. PostgREST maps SQL 42501
  // to 401 for an anonymous caller and 403 for an authenticated caller.
  for (const role of [...roles, 'ANONYMOUS']) {
    const token = role === 'ANONYMOUS' ? null : env[`STAGING_${role}_ACCESS_TOKEN`];
    const response = await request(`${config.url}/rest/v1/orders?select=id&limit=0`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    const expectedStatus = role === 'ANONYMOUS' ? 401 : 403;
    if (response.status !== expectedStatus || body?.code !== '42501') {
      throw new Error(`Retired sales access denial was not verified for ${role.toLowerCase()} (HTTP ${response.status}).`);
    }
    checks.push({ name: `${role.toLowerCase()} retired sales read denied`, status: 'passed' });
  }
  return { status: checks.some(c => c.status === 'skipped') ? 'incomplete' : 'passed', checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkStaging(process.env);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'blocked', reason: error.message }));
    process.exitCode = 1;
  }
}
