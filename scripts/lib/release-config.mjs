export function publicProjectConfig(env, { prefix = 'VITE_', projectRef = env.SUPABASE_PROJECT_REF } = {}) {
  const url = env[`${prefix}SUPABASE_URL`];
  const key = env[`${prefix}SUPABASE_ANON_KEY`];
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('A valid explicit Supabase project ref is required.');
  if (!url || !key) throw new Error(`Missing ${prefix}SUPABASE_URL or ${prefix}SUPABASE_ANON_KEY.`);
  if (url !== `https://${projectRef}.supabase.co`) throw new Error('Supabase URL does not match the explicitly selected project.');
  if (key.startsWith('sb_secret_')) throw new Error('A server secret cannot be used as a browser key.');
  if (!key.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (claims.role !== 'anon' || (claims.ref && claims.ref !== projectRef)) throw new Error();
    } catch { throw new Error('Use a public anon JWT or publishable Supabase key.'); }
  }
  return { url, key, projectRef };
}

export function releaseConfig(env, target) {
  if (!['staging', 'production'].includes(target)) throw new Error('Select staging or production explicitly.');
  const config = publicProjectConfig(env);
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT']) {
    if (!env[name]) throw new Error(`Missing ${name}. Add it through secure environment settings.`);
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('Invalid Cloudflare account identifier.');
  if (!/^[a-z0-9-]+$/.test(env.CLOUDFLARE_PAGES_PROJECT)) throw new Error('Invalid Cloudflare Pages project name.');
  return { ...config, target, pagesProject: env.CLOUDFLARE_PAGES_PROJECT, branch: target === 'production' ? 'main' : 'staging' };
}
