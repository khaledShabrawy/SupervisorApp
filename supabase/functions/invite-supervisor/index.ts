// invite-supervisor — admin-only email invite (Phase D).
// service_role stays here; the browser never sees it and never sets a password.
// Body: { email, full_name, phone?, role, branch_id?, permissions?: Record<screen_key, boolean>, redirect_to }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const err = (status: number, error_ar: string) => reply(status, { error_ar });

const ROLES = ["supervisor", "senior_supervisor", "branch_manager", "admin"]; // never super_admin
const SCREENS = ["new_visit", "shelf_audit", "competitor_products", "my_reports", "notifications", "beat_plan"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err(405, "طريقة غير مسموحة.");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return err(401, "يلزم تسجيل الدخول.");
  const { data: caller } = await admin.from("supervisors")
    .select("id,company_id,role,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active || !["admin", "super_admin"].includes(caller.role)) return err(403, "الدعوات للمدراء فقط.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "طلب غير صالح."); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const role = String(body.role ?? "supervisor");
  const branchId = body.branch_id ? String(body.branch_id) : null;
  const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "البريد الإلكتروني غير صالح.");
  if (!fullName || fullName.length > 120) return err(400, "الاسم مطلوب.");
  if (!ROLES.includes(role)) return err(400, "دور غير مسموح.");

  const companyId = caller.company_id;
  if (branchId) {
    const { data: branch } = await admin.from("branches").select("id").eq("id", branchId).eq("company_id", companyId).maybeSingle();
    if (!branch) return err(400, "الفرع لا ينتمي لشركتك.");
  }

  // License seat limit.
  const { data: company } = await admin.from("companies").select("max_supervisors,is_active").eq("id", companyId).maybeSingle();
  if (company && company.is_active === false) return err(403, "اشتراك الشركة غير نشط.");
  if (company?.max_supervisors) {
    const { count } = await admin.from("supervisors").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("is_active", true);
    if ((count ?? 0) >= company.max_supervisors) return err(409, `تم الوصول للحد الأقصى من المشرفين (${company.max_supervisors}).`);
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo, data: { full_name: fullName, company_id: companyId },
  });
  if (inviteError || !invited.user) {
    const exists = /already|registered|exists/i.test(inviteError?.message ?? "");
    return err(exists ? 409 : 502, exists ? "هذا البريد مسجّل بالفعل." : "تعذر إرسال بريد الدعوة.");
  }

  const { data: sup, error: insertError } = await admin.from("supervisors").insert({
    user_id: invited.user.id, full_name: fullName, phone, role, branch_id: branchId, company_id: companyId, is_active: true,
  }).select("id").single();
  if (insertError || !sup) {
    await admin.auth.admin.deleteUser(invited.user.id); // don't leave an orphan login behind
    return err(500, "تعذر إنشاء ملف المشرف.");
  }

  const perms = (body.permissions ?? {}) as Record<string, unknown>;
  const rows = SCREENS.filter((k) => typeof perms[k] === "boolean")
    .map((k) => ({ supervisor_id: sup.id, company_id: companyId, screen_key: k, is_enabled: perms[k] as boolean }));
  if (rows.length) {
    const { error: permError } = await admin.from("supervisor_permissions").upsert(rows, { onConflict: "supervisor_id,screen_key" });
    if (permError) console.error("permissions upsert failed", permError.message);
  }

  await admin.from("audit_logs").insert({ company_id: companyId, table_name: "supervisors", action: "invite",
    performed_by: auth.user.id, new_data: { supervisor_id: sup.id, email, role, branch_id: branchId } })
    .then(({ error }) => error && console.warn("audit log skipped", error.message));

  return reply(200, { supervisor_id: sup.id });
});
