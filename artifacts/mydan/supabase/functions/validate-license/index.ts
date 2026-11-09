import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ valid: false, reason: 'missing_auth' }, 401);

    // Verify the caller's identity using their JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ valid: false, reason: 'invalid_token' }, 401);

    // Privileged queries via service_role (never reaches the client)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: sup, error: supErr } = await admin
      .from('supervisors')
      .select('company_id, is_active, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (supErr || !sup) return json({ valid: false, reason: 'no_supervisor_profile' }, 403);

    // super_admin is exempt from all license restrictions
    if (sup.role === 'super_admin') return json({ valid: true, isSuperAdmin: true });

    const { data: co, error: coErr } = await admin
      .from('companies')
      .select('id, name, is_active, expires_at, max_supervisors, license_type')
      .eq('id', sup.company_id)
      .maybeSingle();

    if (coErr || !co) return json({ valid: false, reason: 'company_not_found' }, 403);

    if (!co.is_active) {
      return json({ valid: false, reason: 'company_inactive', companyName: co.name });
    }

    const daysRemaining = co.expires_at
      ? Math.ceil((new Date(co.expires_at).getTime() - Date.now()) / 86_400_000)
      : null;

    if (daysRemaining !== null && daysRemaining <= 0) {
      return json({
        valid: false,
        reason: 'license_expired',
        companyName: co.name,
        expiresAt: co.expires_at,
        daysRemaining,
      });
    }

    const { count } = await admin
      .from('supervisors')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', sup.company_id)
      .eq('is_active', true);

    return json({
      valid: true,
      companyName: co.name,
      licenseType: co.license_type,
      daysRemaining,
      maxSupervisors: co.max_supervisors ?? 10,
      activeSupervisors: count ?? 0,
      expiresAt: co.expires_at,
    });
  } catch (err) {
    console.error('validate-license error:', err);
    return json({ valid: false, reason: 'server_error' }, 500);
  }
});
