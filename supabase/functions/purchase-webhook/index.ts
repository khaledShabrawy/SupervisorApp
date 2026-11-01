// purchase-webhook — receives WooCommerce order.created webhooks and provisions
// a new company + admin account automatically.
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
//   WC_WEBHOOK_SECRET         — WooCommerce webhook secret key (Settings → Advanced → Webhooks)
//   APP_URL                   — e.g. https://mydan.digityoucan.com
//
// WooCommerce webhook delivery: Settings → Advanced → Webhooks → Add webhook
//   Topic: Order created
//   Delivery URL: https://<project>.supabase.co/functions/v1/purchase-webhook
//   Secret: <WC_WEBHOOK_SECRET value>
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ── Plan → license mapping ──────────────────────────────────────────────────
const PLAN_MAP: Record<string, { licenseType: "standard" | "pro" | "enterprise"; maxSupervisors: number }> = {
  starter:    { licenseType: "standard",   maxSupervisors: 5   },
  growth:     { licenseType: "pro",        maxSupervisors: 25  },
  enterprise: { licenseType: "enterprise", maxSupervisors: 999 },
};

// Detect plan from WooCommerce product name / slug
function detectPlan(productName: string): keyof typeof PLAN_MAP {
  const lower = productName.toLowerCase();
  if (lower.includes("enterprise")) return "enterprise";
  if (lower.includes("growth"))     return "growth";
  return "starter";
}

// Generate a random license key
function genLicenseKey(): string {
  const seg = () => Math.random().toString(36).substring(2, 7).toUpperCase();
  return `MYDAN-${seg()}-${seg()}-${seg()}`;
}

// Verify WooCommerce HMAC-SHA256 signature
async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return expected === signature;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const wcSecret = Deno.env.get("WC_WEBHOOK_SECRET");
  if (!wcSecret) {
    console.error("[purchase-webhook] WC_WEBHOOK_SECRET not configured — rejecting request");
    return reply(401, { error: "Webhook secret not configured" });
  }
  const sig = req.headers.get("x-wc-webhook-signature") ?? "";
  if (!sig || !(await verifySignature(wcSecret, rawBody, sig))) {
    console.error("[purchase-webhook] invalid signature");
    return reply(401, { error: "Invalid webhook signature" });
  }

  let order: Record<string, unknown>;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "Invalid JSON payload" });
  }

  // Only process completed or processing orders
  const orderStatus = String(order.status ?? "");
  if (!["completed", "processing"].includes(orderStatus)) {
    console.log("[purchase-webhook] skipping status:", orderStatus);
    return reply(200, { skipped: true, status: orderStatus });
  }

  // ── Extract customer details from WooCommerce order ─────────────────────
  const billing = (order.billing ?? {}) as Record<string, string>;
  const email      = (billing.email  ?? "").trim().toLowerCase();
  const firstName  = (billing.first_name ?? "").trim();
  const lastName   = (billing.last_name  ?? "").trim();
  const fullName   = [firstName, lastName].filter(Boolean).join(" ") || "Admin";
  const phone      = (billing.phone ?? "").trim() || null;
  const companyName = (billing.company ?? fullName + " Company").trim();
  const country    = (billing.country ?? "EG").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("[purchase-webhook] missing/invalid email in order", order.id);
    return reply(400, { error: "Valid billing email is required" });
  }

  // ── Detect purchased plan ────────────────────────────────────────────────
  const lineItems = (order.line_items ?? []) as Array<{ name?: string; product_id?: number }>;
  const firstProduct = lineItems[0]?.name ?? "starter";
  const planKey  = detectPlan(firstProduct);
  const plan     = PLAN_MAP[planKey];
  const licenseKey = genLicenseKey();
  const appUrl   = Deno.env.get("APP_URL") ?? "https://mydan.digityoucan.com";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Idempotency: check if this WooCommerce order was already processed ───
  const orderId = String(order.id ?? "");
  if (orderId) {
    const { data: existing } = await admin
      .from("companies")
      .select("id")
      .eq("license_key", `WC-${orderId}`)
      .maybeSingle();
    if (existing) {
      console.log("[purchase-webhook] order already processed:", orderId);
      return reply(200, { already_processed: true, company_id: existing.id });
    }
  }

  // ── 1. Create company ────────────────────────────────────────────────────
  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({
      name:            companyName,
      contact_email:   email,
      contact_phone:   phone,
      country:         country,
      license_key:     orderId ? `WC-${orderId}` : licenseKey,
      license_type:    plan.licenseType,
      max_supervisors: plan.maxSupervisors,
      is_active:       true,
      activated_at:    new Date().toISOString(),
    })
    .select("id")
    .single();

  if (companyError || !company) {
    console.error("[purchase-webhook] company insert failed:", companyError?.message);
    return reply(500, { error: "Failed to create company account" });
  }

  // ── 2. Create admin user and send invite email ───────────────────────────
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/set-password`,
    data: {
      full_name:  fullName,
      company_id: company.id,
      role:       "admin",
    },
  });

  if (inviteError || !invited.user) {
    const alreadyExists = /already|registered|exists/i.test(inviteError?.message ?? "");
    if (!alreadyExists) {
      // Roll back company creation
      await admin.from("companies").delete().eq("id", company.id);
      console.error("[purchase-webhook] invite failed:", inviteError?.message);
      return reply(502, { error: "Failed to send activation email" });
    }
    // User exists — look up their supervisor record
    const { data: existingSup } = await admin
      .from("supervisors")
      .select("id,company_id")
      .eq("company_id", company.id)
      .limit(1)
      .maybeSingle();
    if (existingSup) {
      return reply(200, { company_id: company.id, supervisor_id: existingSup.id, reused: true });
    }
  }

  const userId = invited?.user?.id;
  if (!userId) {
    return reply(500, { error: "Could not determine user ID" });
  }

  // ── 3. Create supervisor record with admin role ──────────────────────────
  const { data: supervisor, error: supError } = await admin
    .from("supervisors")
    .insert({
      user_id:    userId,
      full_name:  fullName,
      phone:      phone,
      role:       "admin",
      company_id: company.id,
      is_active:  true,
    })
    .select("id")
    .single();

  if (supError || !supervisor) {
    // Don't roll back — user is already created; the admin can fix manually
    console.error("[purchase-webhook] supervisor insert failed:", supError?.message);
    return reply(500, { error: "Company created but profile insert failed", company_id: company.id });
  }

  // ── 4. Audit log ─────────────────────────────────────────────────────────
  await admin.from("audit_logs").insert({
    company_id:   company.id,
    table_name:   "companies",
    action:       "INSERT",
    performed_by: userId,
    new_data: {
      source:       "woocommerce_webhook",
      order_id:     orderId,
      plan:         planKey,
      license_type: plan.licenseType,
      max_supervisors: plan.maxSupervisors,
      email,
    },
  }).then(({ error }) => error && console.warn("[purchase-webhook] audit log skipped:", error.message));

  console.log(`[purchase-webhook] ✓ provisioned company=${company.id} plan=${planKey} email=${email}`);
  return reply(200, {
    company_id:    company.id,
    supervisor_id: supervisor.id,
    plan:          planKey,
    max_supervisors: plan.maxSupervisors,
    activation_email_sent: true,
  });
});
