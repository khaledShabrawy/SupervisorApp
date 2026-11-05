import { withClientCors } from '../_shared/client-cors.ts';
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors';
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
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { encodeBase64, verifiedTokenSession } from "../_shared/encoding.ts";
import { z } from "npm:zod@3.25.76";

const PHOTO_BUCKET = "shelf-photos";
const CANDIDATE_GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL"),
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter(Boolean) as string[];

const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const cors = sdkCorsHeaders;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Field names under target_brand_metrics / competitor_metrics are read by the
// Power BI views (vw_perfect_store_index) and frontend — keep them stable.
const AuditSchema = z.object({
  audit_summary_ar: z.string(),
  score: z.number().min(0).max(100),
  target_brand_metrics: z.object({
    brand_present: z.boolean(),
    facings: z.number().int().min(0),
    share_of_shelf_percentage: z.number().min(0).max(100),
    out_of_stock: z.boolean(),
    oos_items: z.array(z.string()),
  }),
  competitor_metrics: z.object({
    competitor_presence_detected: z.boolean(),
    competitor_share_pct: z.number().min(0).max(100),
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

function storagePath(photoUrl: string): string {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = photoUrl.indexOf(marker);
  return decodeURIComponent(i >= 0 ? photoUrl.slice(i + marker.length).split("?")[0] : photoUrl);
}

/** Analyze shelf using Google Gemini Flash API with automatic multi-model fallback */
async function callGemini(apiKey: string, base64Data: string, mediaType: string, brand: string, competitors: string): Promise<{ result: AuditResult; model: string }> {
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(40_000),
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
    } catch (err: any) {
      console.warn("Shelf provider attempt failed");
      lastError = err;
    }
  }

  throw lastError ?? new Error("All candidate Gemini models failed");
}

/** Fallback to Anthropic Claude Vision if ANTHROPIC_API_KEY is configured */
async function callAnthropic(apiKey: string, base64Data: string, mediaType: MediaType, brand: string, competitors: string): Promise<AuditResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', signal:AbortSignal.timeout(60_000),
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:4000,system:SYSTEM,messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:mediaType,data:base64Data}},{type:'text',text:`Target brand: ${brand}. Competitors: ${competitors}. Return only JSON with audit_summary_ar, score, target_brand_metrics (brand_present, facings, share_of_shelf_percentage, out_of_stock, oos_items), competitor_metrics (competitor_presence_detected, competitor_share_pct, brands_detected), posm_present, price_tag_visible, issues, recommendations and detailed_report (brand_analysis, competitor_analysis, display_quality, action_priority).`}
    ]}]}),
  });
  if(!response.ok) throw new Error('Analysis provider rejected the request');
  const output=await response.json();
  const text=output.content?.find((part:{type:string;text?:string})=>part.type==='text')?.text;
  if(output.stop_reason==='refusal' || !text) throw new Error('Provider returned no measurement');
  return AuditSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/i,'')));

}

Deno.serve(withClientCors(async (req) => {
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

  let path: string;
  try { path = storagePath(audit.photo_url); } catch { return json(400,{error:'Invalid photo path'}); }
  if (!path.startsWith(`${audit.company_id}/${audit.supervisor_id}/`)) return json(400,{error:'Invalid photo owner path'});
  const sid=verifiedTokenSession(token!);
  if(!sid) return json(403,{error:'Session identity required'});
  const claim = await admin.rpc('mdn_claim_analysis_job_v1', {p_user_id:auth.user.id,
    p_session_id:sid,p_resource_type:'shelf_audit',p_resource_id:audit.id});
  if(claim.error || !claim.data) return json(claim.error?.code==='23505'?409:claim.error?.code==='54000'?429:403,{error:'Analysis could not be authorized or reserved'});
  const jobId=claim.data;

  const fail = async (status:number,error:string) => {
    const result=await admin.rpc('mdn_finish_analysis_job_v1',{p_job_id:jobId,p_success:false});
    if(result.error) console.error('Could not finalize shelf failure',jobId);
    return json(status,{error});
  };

  try {
    // 3) Brand settings come from the company's own row.
    const { data: settings } = await admin.from("app_settings")
      .select("target_brand_name,competitor_brands,ai_audit_enabled").eq("company_id", audit.company_id).maybeSingle();
    if (!settings || settings.ai_audit_enabled !== true) return await fail(403, "AI audit disabled for company");
    const brand = settings?.target_brand_name || "العلامة المستهدفة";
    const competitors = (settings?.competitor_brands ?? []).join("، ") || "المنافسون";

    // 4) Download photo from private storage
    const { data: blob, error: dlError } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 10MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const base64Data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 5) Execute analysis: Primary is Gemini Flash Vision, fallback is Anthropic
    let result: AuditResult;
    let modelUsed: string;
    let engine: 'google-gemini' | 'anthropic' = 'anthropic';

    if (geminiKey) {
      try {
        const geminiRes = await callGemini(geminiKey, base64Data, mediaType, brand, competitors);
        result = geminiRes.result;
        modelUsed = geminiRes.model; engine = 'google-gemini';
      } catch (geminiErr) {
        console.warn("Primary shelf provider failed");
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
    const { data: saved,error: updateError }=await admin.rpc('mdn_finish_analysis_job_v1',{
      p_job_id:jobId,p_success:true,p_result:{...result,score,model:modelUsed,engine},
    });
    if(updateError || saved!==true) return await fail(500,'Could not confirm persisted analysis');

    return json(200, {
      success: true,
      audit_id: audit.id,
      score,
      summary: result.audit_summary_ar,
      model: modelUsed
    });
  } catch (err: any) {
    console.error("Shelf analysis failed",jobId);
    return await fail(500, "فشل تحليل الرف — يرجى المحاولة مرة أخرى");
  }
},Deno.env.get('ALLOWED_ORIGIN') ?? 'https://mydan.digityoucan.com',sdkCorsHeaders));
