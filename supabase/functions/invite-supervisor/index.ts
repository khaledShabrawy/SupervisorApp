// invite-supervisor — admin-only email invite, resend invite, and manual password set.
// service_role stays here; the browser never sees it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const err = (status: number, error_ar: string) => reply(status, { error_ar });

const ROLES = ["supervisor", "senior_supervisor", "branch_manager", "admin"];
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
  if (!caller?.is_active || !["admin", "super_admin"].includes(caller.role)) return err(403, "هذه العمليات للمدراء فقط.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "طلب غير صالح."); }
  const action = String(body.action ?? "invite");
  const companyId = caller.company_id;

  // -------------------------------------------------------------
  // ACTION: SET PASSWORD MANUALLY FROM BACKOFFICE
  // -------------------------------------------------------------
  if (action === "set_password") {
    const supervisorId = String(body.supervisor_id ?? "").trim();
    const newPassword = String(body.new_password ?? "").trim();
    const forceChange = Boolean(body.force_change ?? false);

    if (!supervisorId) return err(400, "معرّف المستخدم مطلوب.");
    if (!newPassword || newPassword.length < 8) return err(400, "كلمة المرور يجب ألا تقل عن 8 أحرف.");

    const { data: targetSup, error: supErr } = await admin.from("supervisors")
      .select("id,user_id,full_name,role").eq("id", supervisorId).eq("company_id", companyId).maybeSingle();
    if (supErr || !targetSup) return err(404, "المستخدم غير موجود.");
    if (targetSup.role === "super_admin" && caller.role !== "super_admin") {
      return err(403, "لا يمكن تغيير كلمة مرور مدير النظام الأعلى.");
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(targetSup.user_id, {
      password: newPassword,
    });
    if (updateErr) return err(500, `تعذر تعيين كلمة المرور: ${updateErr.message}`);

    await admin.from("supervisors").update({
      force_password_change: forceChange,
      password_changed_at: new Date().toISOString(),
    }).eq("id", supervisorId);

    await admin.from("audit_logs").insert({
      company_id: companyId,
      table_name: "supervisors",
      action: "UPDATE",
      performed_by: auth.user.id,
      new_data: { supervisor_id: supervisorId, action: "set_password_manual", force_change: forceChange },
    }).then(({ error }) => error && console.warn("audit log skipped", error.message));

    return reply(200, { success: true, message: "تم تعيين كلمة المرور بنجاح." });
  }

  // -------------------------------------------------------------
  // ACTION: RESEND INVITATION LINK
  // -------------------------------------------------------------
  if (action === "resend_invite") {
    const supervisorId = String(body.supervisor_id ?? "").trim();
    const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;

    if (!supervisorId) return err(400, "معرّف المستخدم مطلوب.");
    const { data: targetSup, error: supErr } = await admin.from("supervisors")
      .select("id,user_id,full_name,email").eq("id", supervisorId).eq("company_id", companyId).maybeSingle();
    if (supErr || !targetSup) return err(404, "المستخدم غير موجود.");

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(targetSup.user_id);
    const targetEmail = authUser?.user?.email || targetSup.email;
    if (!targetEmail) return err(400, "البريد الإلكتروني غير متوفر لهذا المستخدم.");

    // Generate fresh invite or recovery link and send via Supabase auth
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(targetEmail, {
      redirectTo,
    });
    if (resetErr) {
      // Fallback: generate link
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo },
      });
      if (linkErr) return err(500, "تعذر إنشاء رابط الدعوة الجديد.");
      return reply(200, { success: true, link: linkData.properties?.action_link, message: "تم إنشاء رابط استعادة جديد بنجاح." });
    }

    await admin.from("audit_logs").insert({
      company_id: companyId,
      table_name: "supervisors",
      action: "UPDATE",
      performed_by: auth.user.id,
      new_data: { supervisor_id: supervisorId, action: "resend_invite", email: targetEmail },
    }).then(({ error }) => error && console.warn("audit log skipped", error.message));

    return reply(200, { success: true, message: "تم إرسال رابط التفعيل والدعوة الجديد إلى البريد بنجاح." });
  }

  // -------------------------------------------------------------
  // ACTION: INVITE NEW SUPERVISOR (DEFAULT)
  // -------------------------------------------------------------
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const role = String(body.role ?? "supervisor");
  const branchId = body.branch_id ? String(body.branch_id) : null;
  const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "البريد الإلكتروني غير صالح.");
  if (!fullName || fullName.length > 120) return err(400, "الاسم مطلوب.");
  if (!ROLES.includes(role)) return err(400, "دور غير مسموح.");

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
    return err(exists ? 409 : 502, exists ? "هذا البريد مسجّل بالفعل. يمكنك إعادة إرسال الرابط أو تعيين كلمة المرور له." : "تعذر إرسال بريد الدعوة.");
  }

  const { data: sup, error: insertError } = await admin.from("supervisors").insert({
    user_id: invited.user.id, full_name: fullName, phone, role, branch_id: branchId, company_id: companyId, is_active: true,
  }).select("id").single();
  if (insertError || !sup) {
    await admin.auth.admin.deleteUser(invited.user.id);
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
