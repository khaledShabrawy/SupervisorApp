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
    // Only service_role or cron invocations are allowed (no user JWT required)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thresholds = [14, 7, 3, 1];
    let totalInserted = 0;
    const summary: Array<{ company: string; daysLeft: number; inserted: number }> = [];

    for (const days of thresholds) {
      const targetDate = new Date(today);
      targetDate.setUTCDate(targetDate.getUTCDate() + days);
      const targetISO = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Find companies expiring on exactly this target date
      const { data: companies, error: coErr } = await admin
        .from('companies')
        .select('id, name, expires_at')
        .eq('is_active', true)
        .gte('expires_at', targetISO + 'T00:00:00Z')
        .lt('expires_at', targetISO + 'T23:59:59Z');

      if (coErr) {
        console.error(`Error fetching companies for threshold ${days}d:`, coErr);
        continue;
      }

      for (const company of (companies ?? [])) {
        // Build Arabic notification text
        let titleAr: string;
        let bodyAr: string;
        const expiryFormatted = new Date(company.expires_at).toLocaleDateString('ar-EG');

        if (days === 1) {
          titleAr = '🚨 الاشتراك ينتهي غداً!';
          bodyAr  = `ينتهي اشتراك شركة ${company.name} غداً (${expiryFormatted}). يرجى التواصل الفوري مع إدارة المنصة لتجديد الترخيص وتفادي إيقاف الخدمة عن المشرفين.`;
        } else if (days === 3) {
          titleAr = '🔴 الاشتراك ينتهي خلال 3 أيام';
          bodyAr  = `تنبيه عاجل: ينتهي اشتراك شركة ${company.name} خلال 3 أيام (${expiryFormatted}). بادر بالتجديد الآن لضمان استمرارية الخدمة.`;
        } else if (days === 7) {
          titleAr = '⚠️ الاشتراك ينتهي خلال أسبوع';
          bodyAr  = `ينتهي اشتراك شركة ${company.name} خلال 7 أيام (${expiryFormatted}). يرجى التواصل مع إدارة المنصة لتجديد باقة الاشتراك.`;
        } else {
          titleAr = '🔔 تنبيه مبكر: الاشتراك ينتهي خلال 14 يوماً';
          bodyAr  = `تنبيه مبكر: ينتهي اشتراك شركة ${company.name} خلال 14 يوماً (${expiryFormatted}). يُنصح ببدء إجراءات التجديد مع إدارة المنصة.`;
        }

        // Fetch eligible supervisors (admin, branch_manager, senior_supervisor, super_admin)
        const { data: supervisors, error: supErr } = await admin
          .from('supervisors')
          .select('id, company_id')
          .eq('company_id', company.id)
          .eq('is_active', true)
          .in('role', ['admin', 'branch_manager', 'senior_supervisor', 'super_admin']);

        if (supErr || !supervisors) {
          console.error(`Error fetching supervisors for company ${company.id}:`, supErr);
          continue;
        }

        // Check existing notifications today to avoid duplicates
        const todayStr = today.toISOString().split('T')[0];
        const { data: existing } = await admin
          .from('notifications')
          .select('supervisor_id')
          .eq('company_id', company.id)
          .eq('type', 'system')
          .eq('title_ar', titleAr)
          .gte('created_at', todayStr + 'T00:00:00Z')
          .lt('created_at', todayStr + 'T23:59:59Z');

        const alreadyNotified = new Set((existing ?? []).map((n: { supervisor_id: string }) => n.supervisor_id));

        const toInsert = supervisors
          .filter((s: { id: string }) => !alreadyNotified.has(s.id))
          .map((s: { id: string; company_id: string }) => ({
            company_id:    s.company_id,
            supervisor_id: s.id,
            type:          'system',
            title_ar:      titleAr,
            body_ar:       bodyAr,
            action_url:    '/admin',
            is_read:       false,
          }));

        if (toInsert.length > 0) {
          const { error: insertErr } = await admin
            .from('notifications')
            .insert(toInsert);

          if (insertErr) {
            console.error(`Error inserting notifications for company ${company.id}:`, insertErr);
          } else {
            totalInserted += toInsert.length;
            summary.push({ company: company.name, daysLeft: days, inserted: toInsert.length });
          }
        }
      }
    }

    console.log(`notify-expiring-licenses: ${totalInserted} notifications inserted`, summary);
    return json({ ok: true, inserted: totalInserted, summary });

  } catch (err) {
    console.error('notify-expiring-licenses error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
