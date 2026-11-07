import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { releaseConfig } from '../lib/release-config.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));

export function deploymentEnvironment(target, env) {
  if (!['staging', 'production'].includes(target)) throw new Error('Select staging or production explicitly.');
  const targets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url), 'utf8'));
  const merged = { ...env };
  for (const [name, value] of Object.entries(targets[target] ?? {})) if (!merged[name]) merged[name] = value;
  return merged;
}

export function deploymentPlan(config) {
  return [
    ['corepack', ['pnpm', 'run', 'typecheck']],
    ['corepack', ['pnpm', 'test']],
    ['corepack', ['pnpm', 'run', 'build']],
    ['npx', ['--yes', '--package=supabase@3.0.0', 'supabase', 'functions', 'deploy', 'invite-supervisor', 'analyze-shelf', 'discover-customers', 'push-notify', `--remote=${config.projectRef}`, '--use-api', '--yes']],
    ['npx', ['--yes', '--package=wrangler@4.158.0', 'wrangler', 'pages', 'deploy', 'artifacts/mydan/dist/public', '--project-name', config.pagesProject, '--branch', config.branch]],
  ];
}

export async function verifyPublicConnection(config, request = fetch) {
  const response = await request(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.key }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Public Supabase key/project verification failed (HTTP ${response.status}).`);
}

export async function verifyCloudflareProject(env, config, request = fetch) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${config.pagesProject}`;
  const response = await request(endpoint, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Cloudflare project verification failed (HTTP ${response.status}).`);
  const body = await response.json();
  const branch = body.result?.production_branch;
  if (!body.success || body.result?.name !== config.pagesProject || typeof branch !== 'string' || !branch || /[\r\n]/.test(branch)) {
    throw new Error('Cloudflare returned an unexpected project configuration.');
  }
  if (config.target === 'production' && body.result.source?.type === 'github' && body.result.source.config?.production_deployments_enabled !== false) throw new Error('Disable automatic production Git deployments before using the gated release path.');
  if (config.target === 'staging' && branch === config.branch) throw new Error('The staging branch is configured as production in this Pages project.');
  return config.target === 'production' ? branch : config.branch;
}

export async function verifyAuthOrigin(env, config, request = fetch) {
  const raw = env.APP_ORIGIN || (config.target === 'production' ? 'https://mydan.digityoucan.com' : '');
  let origin;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /(^|\.)netlify\.(app|com)$/i.test(url.hostname)) throw new Error();
    origin = url.origin;
  } catch { throw new Error('Configure an explicit HTTPS APP_ORIGIN on the current hosting platform.'); }
  const response = await request(`https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Auth origin verification failed (HTTP ${response.status}).`);
  const body = await response.json();
  const allowed = typeof body.uri_allow_list === 'string' ? body.uri_allow_list.split(',').map(value => value.trim()).filter(Boolean) : [];
  let siteOrigin;
  try {
    const site = new URL(body.site_url);
    if (site.pathname !== '/' || site.search || site.hash || site.username || site.password) throw new Error();
    siteOrigin = site.origin;
    for (const value of allowed) if (/(^|\.)netlify\.(app|com)$/i.test(new URL(value).hostname)) throw new Error();
  } catch { throw new Error('Auth still references a retired or invalid origin.'); }
  if (siteOrigin !== origin || !allowed.some(value => [origin+'/**',origin+'/set-password'].includes(value))) throw new Error('Auth Site URL or recovery redirects do not match APP_ORIGIN.');
}

export async function verifyServerContract(env, config, request = fetch) {
  // Catalog SELECT only. Never apply the proposal automatically during deployment.
  const query = `select (
    to_regprocedure('public.mdn_bind_device_v1(uuid,text)') is not null
    and to_regprocedure('public.admin_update_supervisor(uuid,text,uuid,text,text,boolean,text,boolean,boolean)') is not null
    and exists (select 1 from pg_trigger where tgname = 'mydan_password_changed'
      and tgrelid = 'auth.users'::regclass and not tgisinternal and tgenabled = 'O')
    and to_regprocedure('public.mdn_save_visit_task_v1(uuid,uuid,text,text,boolean)') is not null
    and to_regprocedure('public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)') is not null
    and to_regprocedure('public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid)') is not null
    and has_function_privilege('authenticated',to_regprocedure('public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)'),'EXECUTE') is false
    and has_function_privilege('authenticated',to_regprocedure('public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid)'),'EXECUTE') is false
    and has_function_privilege('service_role',to_regprocedure('public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)'),'EXECUTE') is true
    and has_table_privilege('authenticated',to_regclass('public.mdn_ai_attempts_v1'),'SELECT') is false
    and not has_table_privilege('authenticated','public.visit_tasks','INSERT')
    and not has_table_privilege('authenticated','public.visit_tasks','DELETE')
    and not has_column_privilege('authenticated','public.visit_tasks','visit_id','UPDATE')
    and exists (select 1 from pg_trigger where tgname='mdn_visit_client_transition' and tgrelid='public.visits'::regclass and not tgisinternal and tgenabled='O')
    and not exists (select 1 from pg_policies where schemaname='public'
      and (tablename='field_surveys' and policyname='field_surveys_tenant'
        or tablename='survey_responses' and policyname='survey_responses_own'
        or tablename='visits' and policyname='visits_own'))
    and exists (select 1 from pg_policies where schemaname='public' and tablename='field_surveys' and policyname='mdn_field_surveys_update_v1')
    and exists (select 1 from pg_policies where schemaname='public' and tablename='survey_responses' and policyname='mdn_survey_responses_update_v1')
    and not has_table_privilege('authenticated','public.orders','SELECT')
    and not has_table_privilege('anon','public.orders','SELECT')
    and not has_function_privilege('authenticated','public.manager_set_order_status(uuid,text)','EXECUTE')
    and not has_column_privilege('authenticated','public.supervisors','branch_id','UPDATE')
    and not has_column_privilege('authenticated','public.supervisors','device_id','UPDATE')
    and not has_table_privilege('authenticated','public.supervisors','DELETE')
    and not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'orders' and policyname = 'orders_company_all')
  ) as ready`;
  const response = await request(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Server contract verification failed (HTTP ${response.status}).`);
  const rows = await response.json();
  if (rows?.[0]?.ready !== true) throw new Error('Server contract is incomplete; review and test the database proposal before deployment.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = process.argv[process.argv.indexOf('--target') + 1];
    const env = deploymentEnvironment(target, process.env);
    const applying = process.argv.includes('--apply');
    // The public target and commands are reviewable even before credentials are supplied.
    const config = applying ? releaseConfig(env, target) : {
      target, projectRef: env.SUPABASE_PROJECT_REF, pagesProject: env.CLOUDFLARE_PAGES_PROJECT,
      branch: target === 'production' ? 'main' : 'staging',
    };
    if (!config.projectRef || !config.pagesProject) throw new Error('Configure the selected deployment target first.');
    const plan = deploymentPlan(config);
    if (!applying) {
      console.log(JSON.stringify({ status: 'plan-only', target, projectRef: config.projectRef, pagesProject: config.pagesProject, commands: plan }, null, 2));
    } else {
      // Check endpoint/key pairing before compiling or changing a hosted service.
      await verifyPublicConnection(config);
      await verifyAuthOrigin(env, config);
      await verifyServerContract(env, config);
      config.branch = await verifyCloudflareProject(env, config);
      for (const [command, args] of deploymentPlan(config)) {
        const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...env, CI: 'true', COREPACK_HOME: env.COREPACK_HOME || fileURLToPath(new URL('../../.cache/corepack', import.meta.url)), npm_config_cache: env.npm_config_cache || fileURLToPath(new URL('../../.cache/npm', import.meta.url)) } });
        if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed; deployment stopped.`);
      }
      console.log(JSON.stringify({ status: 'deployed', target, projectRef: config.projectRef, pagesProject: config.pagesProject }));
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'blocked', reason: error.message }));
    process.exitCode = 1;
  }
}
