// analyze-shelf v5 — Google Gemini Flash Vision with Multi-Model Fallback and Claude Vision Backup.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY      recommended (Free tier: 15 RPM / 1,500 RPD at https://aistudio.google.com/)
//   GEMINI_MODEL        optional, defaults to [gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash]
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
import { createAiBudget, AiBudgetError, AI_PROVIDER_TIMEOUT_MS, type AiBudget } from "../_shared/ai-budget.ts";

const PHOTO_BUCKET = "shelf-photos";
const CANDIDATE_GEMINI_MODELS = [...new Set([
  Deno.env.get("GEMINI_MODEL"),
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter(Boolean) as string[])];

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

const SYSTEM = `أنت خبير تدقيق ومراجعة رفوف متاجر السلع الاستهلاكية (FMCG Perfect Store Auditor) في السوق المصري والشرق الأوسط.
تقوم بتحليل صورة الرف بدقة هندسية واستخراج المقاييس التجارية الأساسية:
1. الواجهات (Facings): احسب عدد الواجهات الأفقية المستقلة المعروضة لكل منتج.
2. حصة الرف (Share of Shelf %): النسبة المئوية لمساحة واجهات علامتنا مقارنة بإجمالي واجهات الرف المرئية (علامتنا + المنافسون). يجب أن يكون مجموع حصة علامتنا + حصة المنافسين = 100%.
3. نواقص المخزون (Out of Stock / OOS): رصد أي فراغات فارغة (Empty Slots) أو نفاد لأصناف العلامة، وذكر أسماء الأصناف الناقصة في oos_items.
4. المنافسون (Competitors): رصد أسماء العلامات التجارية المنافسة المعروضة وحصتها الإجمالية.
5. المواد الإعلانية وبطاقات الأسعار (POSM & Price Tags): التحقق من وجود بطاقات أسعار واضحة ومواد ترويجية (Wobblers, Posters, Shelf Talkers).
6. التقرير التفصيلي: صياغة نقد تجاري احترافي دقيق وواقعي بالعربية لأداء الرف وأولويات التحرك.
score هو تقييم المتجر النموذجي (Perfect Store Score) من 0 إلى 100 (يعتمد على توافر المنتجات + الحصة السوقية + ترتيب العرض + وضوح الأسعار).
إذا لم تكن الصورة لرف متجر FMCG، أعطِ score = 0 مع توضيح ذلك في الملخص.`;

function storagePath(photoUrl: unknown): string | null {
  if (typeof photoUrl !== "string" || /[\\\u0000-\u0020\u007f-\u009f]/.test(photoUrl)) return null;
  let path = photoUrl;
  if (/^https?:\/\//i.test(photoUrl)) {
    try {
      if (new URL(photoUrl).origin !== new URL(Deno.env.get("SUPABASE_URL")!).origin) return null;
    } catch { return null; }
    const marker = `/${PHOTO_BUCKET}/`;
    const index = photoUrl.indexOf(marker);
    if (index < 0) return null;
    // Legacy signed/public URLs may contain a URL query. It is not part of the key.
    path = photoUrl.slice(index + marker.length).split("?")[0];
  }
  // Storage SDK builds a URL from this key. Fetch normalizes dot segments and
  // backslashes, so checking a tenant prefix alone is insufficient.
  if (!path || /[%\\?#\u0000-\u0020\u007f-\u009f]/.test(path)) return null;
  if (path.split("/").some(part => !part || part === "." || part === "..")) return null;
  return path;
}

/** Analyze shelf using Google Gemini Flash API with automatic multi-model fallback */
async function callGemini(apiKey: string, base64Data: string, mediaType: string, brand: string, competitors: string, budget: AiBudget): Promise<{ result: AuditResult; model: string }> {
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

  let lastError: Error | null = null;
  for (const model of CANDIDATE_GEMINI_MODELS) {
    try {
      return await budget.run("google-gemini", async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS),
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
          throw new Error(`Gemini ${model} HTTP ${resp.status}: ${errText}`);
        }

        const jsonResp = await resp.json();
        const rawText = jsonResp?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error(`Gemini ${model} returned empty or blocked output`);

        const cleanJson = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '');
        const parsed = JSON.parse(cleanJson);
        return { result: AuditSchema.parse(parsed), model };
      });
    } catch (err: any) {
      if (err instanceof AiBudgetError) throw err;
      console.warn(`[analyze-shelf] Gemini model ${model} attempt failed`);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All candidate Gemini models failed");
}

/** Fallback to Anthropic Claude Vision if ANTHROPIC_API_KEY is configured */
async function callAnthropic(apiKey: string, base64Data: string, mediaType: MediaType, brand: string, competitors: string, budget: AiBudget): Promise<AuditResult> {
  return budget.run("anthropic", async () => {
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: AI_PROVIDER_TIMEOUT_MS });
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
  });
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

  // Authorization/configuration failures must not enable a billable AI action.
  const { data: settings, error: settingsError } = await admin.from("app_settings")
    .select("target_brand_name,competitor_brands,ai_audit_enabled").eq("company_id", audit.company_id).maybeSingle();
  if (settingsError || !settings) return json(503, { error: "تعذر التحقق من إعدادات التحليل. أعد المحاولة لاحقًا." });
  if (settings.ai_audit_enabled !== true) return json(403, { error: "AI audit disabled for company" });
  const brand = settings.target_brand_name || "العلامة المستهدفة";
  const competitors = (settings.competitor_brands ?? []).join("، ") || "المنافسون";

  let budget: AiBudget;
  try {
    budget = createAiBudget(admin, { companyId: caller.company_id, supervisorId: caller.id, operation: "analyze-shelf", recordId: audit.id });
  } catch (error) {
    return json(503, { error: error instanceof AiBudgetError ? error.message : "تعذر التحقق من حدود التحليل." });
  }

  const path = storagePath(audit.photo_url);
  if (!path || !path.startsWith(`${audit.company_id}/`)) return json(400, { error: "photo outside company folder" });

  const fail = async (status: number, error: string) => {
    await admin.from("shelf_audit").update({ status: "failed" })
      .eq("id", audit.id).eq("company_id", caller.company_id).eq("status", "processing");
    return json(status, { error });
  };

  const { data: claimed, error: claimError } = await admin.from("shelf_audit")
    .update({ status: "processing" }).eq("id", audit.id).eq("company_id", caller.company_id)
    .in("status", ["pending", "failed"]).select("id").maybeSingle();
  if (claimError) return json(503, { error: "تعذر بدء التحليل. أعد المحاولة لاحقًا." });
  if (!claimed || claimed.id !== audit.id) return json(409, { error: "audit state changed or analysis already running" });

  try {
    // 4) Download photo from private storage
    const { data: blob, error: dlError } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 10MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const base64Data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 5) Execute analysis: Primary is Gemini Flash Vision, fallback is Anthropic
    let result: AuditResult;
    let modelUsed: string;
    let engineUsed: string;

    if (geminiKey) {
      try {
        const geminiRes = await callGemini(geminiKey, base64Data, mediaType, brand, competitors, budget);
        result = geminiRes.result;
        modelUsed = geminiRes.model;
        engineUsed = "google-gemini";
      } catch (geminiErr) {
        if (geminiErr instanceof AiBudgetError) throw geminiErr;
        console.warn("Gemini Flash failed; considering a separately budgeted fallback");
        if (anthropicKey) {
          result = await callAnthropic(anthropicKey, base64Data, mediaType, brand, competitors, budget);
          modelUsed = CLAUDE_MODEL;
          engineUsed = "anthropic";
        } else {
          throw geminiErr;
        }
      }
    } else {
      result = await callAnthropic(anthropicKey!, base64Data, mediaType, brand, competitors, budget);
      modelUsed = CLAUDE_MODEL;
      engineUsed = "anthropic";
    }

    const score = Math.max(0, Math.min(100, Math.round(result.score)));
    const { data: saved, error: updateError } = await admin.from("shelf_audit").update({
      audit_summary_ar: result.audit_summary_ar,
      audit_score: score,
      ai_detailed_report: { ...result, score, model: modelUsed, engine: engineUsed },
      status: "completed",
      audited_at: new Date().toISOString(),
    }).eq("id", audit.id).eq("company_id", caller.company_id).eq("status", "processing").select("id").maybeSingle();

    if (updateError || !saved || saved.id !== audit.id) return await fail(500, "could not save result to database");

    if (result.target_brand_metrics?.out_of_stock || (result.target_brand_metrics?.oos_items && result.target_brand_metrics.oos_items.length > 0)) {
      const oosList = (result.target_brand_metrics.oos_items ?? []).join('، ') || brand;
      await admin.from('notifications').insert({
        company_id: audit.company_id,
        supervisor_id: audit.supervisor_id,
        type: 'oos_critical',
        title_ar: 'إنذار: نقص حاد في بضاعة الرف (OOS) 🚨',
        body_ar: `رصد نقص أصناف (${oosList}) لعلامة ${brand} في تدقيق الرف. يرجى المتابعة العاجلة.`,
        is_read: false,
      }).catch(() => {});
    }

    return json(200, {
      success: true,
      audit_id: audit.id,
      score,
      summary: result.audit_summary_ar,
      model: modelUsed
    });
  } catch (err: any) {
    if (err instanceof AiBudgetError) return await fail(err.status, err.message);
    console.error("[analyze-shelf] provider or processing failure");
    return await fail(500, "فشل تحليل الرف — يرجى المحاولة مرة أخرى");
  }
});
