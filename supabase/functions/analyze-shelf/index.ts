// analyze-shelf v3 — Claude Vision shelf audit (PSS score).
//
// Secrets (Dashboard → Edge Functions → Secrets), never in code:
//   ANTHROPIC_API_KEY   required
//   CLAUDE_MODEL        optional, defaults to claude-sonnet-4-6
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// Body: { audit_id }. Everything else (photo, brands, ownership) is read
// server-side so a caller cannot point the function at another tenant's row
// or at an arbitrary URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod@3";

const PHOTO_BUCKET = "shelf-photos";
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // API limit per image
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Field names under target_brand_metrics / competitor_metrics are read by the
// Power BI views (vw_perfect_store_index) — keep them stable.
const AuditSchema = z.object({
  audit_summary_ar: z.string(),
  score: z.number(),
  target_brand_metrics: z.object({
    brand_present: z.boolean(),
    facings: z.number(),
    share_of_shelf_percentage: z.number(),
    out_of_stock: z.boolean(),
    oos_items: z.array(z.string()),
  }),
  competitor_metrics: z.object({
    competitor_presence_detected: z.boolean(),
    competitor_share_pct: z.number(),
    brands_detected: z.array(z.string()),
  }),
  posm_present: z.boolean(),
  price_tag_visible: z.boolean(),
  issues: z.array(z.string()),
  recommendations: z.array(z.string()),
  detailed_report: z.object({
    brand_analysis: z.string(),
    competitor_analysis: z.string(),
    display_quality: z.string(),
    action_priority: z.string(),
  }),
});

const SYSTEM = `أنت خبير مراجعة رفوف متاجر FMCG في السوق المصري. تحلل صورة الرف وتقيّم التوزيع والعرض التجاري.
اكتب كل النصوص بالعربية وبمصطلحات تجارية احترافية (Facings, Share of Shelf, OOS, POSM).
score هو Perfect Store Score من 0 إلى 100. النسب المئوية من 0 إلى 100.
إذا لم تكن الصورة لرف متجر، أعطِ score = 0 واذكر ذلك في الملخص.`;

function storagePath(photoUrl: string): string {
  // Older rows stored a full public URL; current rows store the object path.
  const marker = `/${PHOTO_BUCKET}/`;
  const i = photoUrl.indexOf(marker);
  return decodeURIComponent(i >= 0 ? photoUrl.slice(i + marker.length).split("?")[0] : photoUrl);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "ANTHROPIC_API_KEY secret is not set" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) Caller identity (gateway already verified the JWT signature).
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json(401, { error: "unauthorized" });

  const { data: caller } = await admin.from("supervisors")
    .select("id,company_id,role,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active) return json(403, { error: "inactive or unknown supervisor" });

  // 2) Audit must belong to the caller (or the caller is an admin of that company).
  let auditId: unknown;
  try { ({ audit_id: auditId } = await req.json()); } catch { /* handled below */ }
  if (typeof auditId !== "string") return json(400, { error: "audit_id is required" });

  const { data: audit } = await admin.from("shelf_audit")
    .select("id,company_id,supervisor_id,photo_url,status").eq("id", auditId).maybeSingle();
  const isAdmin = ["admin", "super_admin"].includes(caller.role);
  if (!audit || audit.company_id !== caller.company_id || (!isAdmin && audit.supervisor_id !== caller.id)) {
    return json(404, { error: "audit not found" });
  }
  if (!audit.photo_url) return json(400, { error: "audit has no photo" });
  if (audit.status === "processing") return json(409, { error: "analysis already running" });

  const path = storagePath(audit.photo_url);
  if (!path.startsWith(`${audit.company_id}/`)) return json(400, { error: "photo outside company folder" });

  const fail = async (status: number, error: string) => {
    await admin.from("shelf_audit").update({ status: "failed" }).eq("id", audit.id);
    return json(status, { error });
  };
  await admin.from("shelf_audit").update({ status: "processing" }).eq("id", audit.id);

  try {
    // 3) Brand settings come from the company's own row.
    const { data: settings } = await admin.from("app_settings")
      .select("target_brand_name,competitor_brands,ai_audit_enabled").eq("company_id", audit.company_id).maybeSingle();
    if (settings && settings.ai_audit_enabled === false) return await fail(403, "AI audit disabled for company");
    const brand = settings?.target_brand_name || "العلامة المستهدفة";
    const competitors = (settings?.competitor_brands ?? []).join("، ") || "المنافسون";

    // 4) Private bucket → download and send inline (Claude cannot fetch it by URL).
    const { data: blob, error: dlError } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 5MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: `العلامة المستهدفة: ${brand}\nالمنافسون المتوقعون: ${competitors}\nحلل الرف.` },
        ],
      }],
      output_config: { format: zodOutputFormat(AuditSchema) },
    });

    if (response.stop_reason === "refusal") return await fail(422, "model declined to analyze this photo");
    const result = response.parsed_output;
    if (!result) return await fail(502, "model returned an unparseable result");

    const score = Math.max(0, Math.min(100, Math.round(result.score))); // table CHECK 0..100
    const { error: updateError } = await admin.from("shelf_audit").update({
      audit_summary_ar: result.audit_summary_ar,
      audit_score: score,
      ai_detailed_report: { ...result, score, model: MODEL },
      status: "completed",
      audited_at: new Date().toISOString(),
    }).eq("id", audit.id);
    if (updateError) return await fail(500, "could not save result");

    return json(200, { success: true, audit_id: audit.id, score, summary: result.audit_summary_ar });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return await fail(429, "AI service busy, retry shortly");
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic error", err.status, err.message);
      return await fail(502, "AI service error");
    }
    console.error("analyze-shelf error", err);
    return await fail(500, "internal error");
  }
});
