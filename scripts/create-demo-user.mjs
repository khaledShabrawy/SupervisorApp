/**
 * Creates a demo supervisor account via Supabase REST API (no package needed).
 * Run: node scripts/create-demo-user.mjs
 */

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const DEMO_EMAIL    = 'demo@mydan.app';
const DEMO_PASSWORD = 'Mydan@2026';
const trialExpiry   = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${serviceRoleKey}`,
  'apikey': serviceRoleKey,
};

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, data: json };
}

async function run() {
  // ── 1. Create Auth user via Admin API ──────────────────────────────────────
  console.log('Creating auth user…');
  let { ok, data: authData } = await supabaseFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    }),
  });

  let userId;
  if (!ok) {
    if (JSON.stringify(authData).toLowerCase().includes('already registered')) {
      console.log('User exists — fetching ID…');
      const { ok: ok2, data: list } = await supabaseFetch('/auth/v1/admin/users?per_page=1000');
      if (!ok2) { console.error('Cannot list users:', list); process.exit(1); }
      const existing = (list.users ?? list).find(u => u.email === DEMO_EMAIL);
      if (!existing) { console.error('Cannot find existing user'); process.exit(1); }
      userId = existing.id;
    } else {
      console.error('Auth error:', authData);
      process.exit(1);
    }
  } else {
    userId = authData.id;
  }
  console.log('✅ Auth UID:', userId);

  // ── 2. Upsert supervisors row ──────────────────────────────────────────────
  console.log('Creating supervisors row…');
  const { ok: supOk, data: supData } = await supabaseFetch('/rest/v1/supervisors', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: userId,
      full_name: 'مندوب تجريبي',
      email: DEMO_EMAIL,
      branch: 'فرع العرض التجريبي',
      region: 'المنطقة الوسطى',
      is_active: true,
      created_at: new Date().toISOString(),
    }),
  });

  if (!supOk) {
    console.warn('⚠️  supervisors insert failed:', JSON.stringify(supData));
    console.warn('   Add the row manually: Supabase → Table Editor → supervisors');
    console.warn('   id =', userId);
  } else {
    console.log('✅ Supervisors row ready');
  }

  // ── 3. Print result ────────────────────────────────────────────────────────
  const expLabel = new Date(trialExpiry).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  console.log('\n' + '─'.repeat(52));
  console.log('🎉  حساب تجريبي جاهز — 15 يوم');
  console.log('─'.repeat(52));
  console.log('📧  البريد    :', DEMO_EMAIL);
  console.log('🔑  كلمة المرور:', DEMO_PASSWORD);
  console.log('📅  ينتهي في  :', expLabel);
  console.log('─'.repeat(52));
}

run().catch(err => { console.error(err); process.exit(1); });
