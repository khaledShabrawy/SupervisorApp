// analyze-shelf v4 — Google Gemini Flash API (Primary & Free) with Claude Vision Fallback.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY      recommended (Free tier: 15 RPM / 1,500 RPD at https://aistudio.google.com/)
//   GEMINI_MODEL        optional, defaults to gemini-2.5-flash (or gemini-1.5-flash / gemini-2.0-flash)
//   ANTHROPIC_API_KEY   optional fallback
//   CLAUDE_MODEL        optional fallback, defaults to claude-sonnet-4-6
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
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://mydan.digityoucan.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Field names under target_brand_metrics / competitor_metrics are read by the
// Power BI views (vw_perfect_store_index) and frontend — keep them stable.
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

type AuditResult = z.infer<typeof AuditSchema>;

const SYSTEM = `أنت خبير مراجعة رفوف متاجر FMCG في السوق المصري. تحلل صورة الرف وتقيّم التوزيع والعرض التجاري.
اكتب كل النصوص بالعربية وبمصطلحات تجارية احترافية (Facings, Share of Shelf, OOS, POSM).
score هو Perfect Store Score من 0 إلى 100. النسب المئوية من 0 إلى 100.
إذا لم تكن الصورة لرف متجر، أعطِ score = 0 واذكر ذلك في الملخص.`;

function storagePath(photoUrl: string): string {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = photoUrl.indexOf(marker);
  return decodeURIComponent(i >= 0 ? photoUrl.slice(i + marker.length).split("?")[0] : photoUrl);
}

/** Analyze shelf using Google Gemini Flash API (Free Tier available) */
async function callGemini(apiKey: string, base64Data: string, mediaType: string, brand: string, competitors: string): Promise<AuditResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `${SYSTEM}

العلامة المستهدفة: ${brand}
المنافسون المتوقعون: ${competitors}
حلل الرف بدقة شديدة واستخرج مقاييس التواجد والحصة والواجهات (Facings).

يجب أن يكون الرد كائن JSON صالح فقط دون أي نص إضافي أو علامات markdown، ومطابق تماماً للهيكل التالي:
{
  "audit_summary_ar": "ملخص شامل لحالة الرف بالعربية",
  "score": 85,
  "target_brand_metrics": {
    "brand_present": true,
    "facings": 12,
    "share_of_shelf_percentage": 40.0,
    "out_of_stock": false,
    "oos_items": []
  },
  "competitor_metrics": {
    "competitor_presence_detected": true,
    "competitor_share_pct": 60.0,
    "brands_detected": ["منافس 1", "منافس 2"]
  },
  "posm_present": true,
  "price_tag_visible": true,
  "issues": ["ملاحظة 1"],
  "recommendations": ["توصية 1"],
  "detailed_report": {
    "brand_analysis": "تحليل تفصيلي لمظهر وتواجد العلامة",
    "competitor_analysis": "تحليل هجوم وتواجد المنافسين",
    "display_quality": "تقييم جودة وترتيب العرض",
    "action_priority": "عالية / متوسطة / منخفضة"
  }
}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Data } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API HTTP ${resp.status}: ${errText}`);
  }

  const jsonResp = await resp.json();
  const rawText = jsonResp?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned empty or blocked output");

  const cleanJson = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '');
  const parsed = JSON.parse(cleanJson);
  return AuditSchema.parse(parsed);
}

/** Fallback to Anthropic Claude Vision if ANTHROPIC_API_KEY is configured */
async function callAnthropic(apiKey: string, base64Data: string, mediaType: MediaType, brand: string, competitors: string): Promise<AuditResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
        { type: "text", text: `العلامة المستهدفة: ${brand}\nالمنافسون المتوقعون: ${competitors}\nحلل الرف.` },
      ],
    }],
    output_config: { format: zodOutputFormat(AuditSchema) },
  });

  if (response.stop_reason === "refusal") throw new Error("model declined to analyze this photo");
  if (!response.parsed_output) throw new Error("model returned unparseable output");
  return response.parsed_output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!geminiKey && !anthropicKey) {
    return json(500, {
      error: "لم يتم ضبط مفتاح الذكاء الاصطناعي. يرجى إضافة GEMINI_API_KEY (مجاني من https://aistudio.google.com/) في Supabase Secrets."
    });
  }

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

  // Rate limiting: daily cap + concurrent cap per company + hourly cap per supervisor.
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const maxPerDay     = parseInt(Deno.env.get("MAX_AUDITS_PER_DAY")       ?? "100", 10);
  const maxConcurrent = parseInt(Deno.env.get("MAX_CONCURRENT_AUDITS")    ?? "5",   10);
  const maxPerHour    = parseInt(Deno.env.get("MAX_AUDITS_PER_HOUR_USER") ?? "20",  10);
  const [{ count: todayCompleted }, { count: inFlight }, { count: userHourly }] = await Promise.all([
    admin.from("shelf_audit")
      .select("id", { count: "exact", head: true })
      .eq("company_id", caller.company_id)
      .eq("status", "completed")
      .gte("audited_at", todayStart.toISOString()),
    admin.from("shelf_audit")
      .select("id", { count: "exact", head: true })
      .eq("company_id", caller.company_id)
      .eq("status", "processing"),
    admin.from("shelf_audit")
      .select("id", { count: "exact", head: true })
      .eq("supervisor_id", caller.id)
      .gte("audited_at", oneHourAgo),
  ]);
  if ((userHourly ?? 0) >= maxPerHour)
    return json(429, { error: `تجاوزت الحد المسموح به لتحليلات الذكاء الاصطناعي (${maxPerHour} تحليل/ساعة). يرجى الانتظار قليلاً.` });
  if ((todayCompleted ?? 0) >= maxPerDay)
    return json(429, { error: `تم تجاوز الحد اليومي لتحليلات الذكاء الاصطناعي (${maxPerDay} تحليل/يوم). يُجدَّد عند منتصف الليل.` });
  if ((inFlight ?? 0) >= maxConcurrent)
    return json(429, { error: `يوجد ${inFlight} تحليلات قيد المعالجة حالياً. يرجى الانتظار قليلاً.` });

  const path = storagePath(audit.photo_url);
  if (!path.startsWith(`${audit.company_id}/`)) return json(400, { error: "photo outside company folder" });

  const fail = async (status: number, error: string) => {
    await admin.from("shelf_audit").update({ status: "failed" }).eq("id", audit.id);
    return json(status, { error });
  };

  // Atomic claim: UPDATE only succeeds when status is not already 'processing' or 'completed'.
  // This eliminates the TOCTOU race where concurrent requests both pass the status check
  // and then both proceed to run the AI analysis.
  const { count: claimedCount } = await admin.from("shelf_audit")
    .update({ status: "processing" })
    .eq("id", audit.id)
    .not("status", "in", "(processing,completed)")
    .select("id", { count: "exact", head: true });
  if (!claimedCount) {
    const { data: cur } = await admin.from("shelf_audit").select("status").eq("id", audit.id).maybeSingle();
    const msg = cur?.status === "completed" ? "audit already analyzed" : "analysis already running";
    return json(409, { error: msg });
  }

  try {
    // 3) Brand settings come from the company's own row.
    const { data: settings } = await admin.from("app_settings")
      .select("target_brand_name,competitor_brands,ai_audit_enabled").eq("company_id", audit.company_id).maybeSingle();
    if (settings && settings.ai_audit_enabled === false) return await fail(403, "AI audit disabled for company");
    const brand = settings?.target_brand_name || "العلامة المستهدفة";
    const competitors = (settings?.competitor_brands ?? []).join("، ") || "المنافسون";

    // 4) Download photo from private storage
    const { data: blob, error: dlError } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 10MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const base64Data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 5) Execute analysis: Primary is Gemini Flash (Free), fallback is Anthropic
    let result: AuditResult;
    let modelUsed: string;

    if (geminiKey) {
      try {
        result = await callGemini(geminiKey, base64Data, mediaType, brand, competitors);
        modelUsed = GEMINI_MODEL;
      } catch (geminiErr) {
        console.warn("Gemini Flash failed, attempting fallback if available:", geminiErr);
        if (anthropicKey) {
          result = await callAnthropic(anthropicKey, base64Data, mediaType, brand, competitors);
          modelUsed = CLAUDE_MODEL;
        } else {
          throw geminiErr;
        }
      }
    } else {
      result = await callAnthropic(anthropicKey!, base64Data, mediaType, brand, competitors);
      modelUsed = CLAUDE_MODEL;
    }

    const score = Math.max(0, Math.min(100, Math.round(result.score)));
    const { error: updateError } = await admin.from("shelf_audit").update({
      audit_summary_ar: result.audit_summary_ar,
      audit_score: score,
      ai_detailed_report: { ...result, score, model: modelUsed, engine: geminiKey ? "google-gemini" : "anthropic" },
      status: "completed",
      audited_at: new Date().toISOString(),
    }).eq("id", audit.id);

    if (updateError) return await fail(500, "could not save result to database");

    return json(200, {
      success: true,
      audit_id: audit.id,
      score,
      summary: result.audit_summary_ar,
      model: modelUsed
    });
  } catch (err: any) {
    console.error("analyze-shelf error:", err);
    const msg = err?.message || "internal error";
    return await fail(500, msg);
  }
});
