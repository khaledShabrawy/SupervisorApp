import { withClientCors } from '../_shared/client-cors.ts';
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors';
// discover-customers v2 — Google Gemini Flash API (Primary & Free) with Claude Vision Fallback.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY      recommended (Free tier at https://aistudio.google.com/)
//   GEMINI_MODEL        optional, defaults to gemini-2.5-flash
//   ANTHROPIC_API_KEY   optional fallback
//   CLAUDE_MODEL        optional fallback, defaults to claude-sonnet-4-6
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// Body: { survey_id }
// Photo lives in the 'survey-photos' private bucket under path
//   {company_id}/{supervisor_id}/{uuid}.ext
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { encodeBase64, verifiedTokenSession } from "../_shared/encoding.ts";
import { z } from "npm:zod@3.25.76";

const SURVEY_BUCKET = "survey-photos";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const cors = sdkCorsHeaders;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Store types must match CUST_TYPES in the frontend (AdminSections.tsx)
const VALID_TYPES = ["بقالة", "سوبرماركت", "هايبرماركت", "كيوسك", "محل جملة", "ضيافة", "أخرى"] as const;

const SurveySchema = z.object({
  summary_ar: z.string(),
  stores_found: z.number().int().min(0),
  stores: z.array(z.object({
    name: z.string(),
    type: z.enum(VALID_TYPES),
    estimated_size: z.enum(["small", "medium", "large"]),
    position_note: z.string(),
  })),
});

type SurveyResult = z.infer<typeof SurveySchema>;

const SYSTEM = `أنت خبير في تحليل الشوارع التجارية ورسم خرائط نقاط البيع في السوق المصري.
مهمتك: تحليل صورة أو فيديو يُظهر صفاً من المحلات التجارية، واكتشاف أكبر عدد ممكن من العملاء المحتملين.

قواعد:
- حدد كل محل ظاهر في الصورة حتى لو كانت الصورة جزئية.
- اقرأ اسم المحل من اللافتة إن كانت مرئية. إن لم تكن مرئية، ضع وصفاً مختصراً مثل "بقالة الركن".
- صنّف نوع كل محل من القائمة المحددة فقط: بقالة، سوبرماركت، هايبرماركت، كيوسك، محل جملة، ضيافة، أخرى.
- estimated_size: small (أقل من 30م²) / medium (30-150م²) / large (أكبر من 150م²).
- position_note: وصف موضع المحل في الصورة مثل "أول يمين" أو "المنتصف".
- اكتب كل النصوص بالعربية.
- إذا لم تظهر أي محلات في الصورة، أعطِ stores_found = 0 ومصفوفة فارغة.`;

/** Call Google Gemini Flash API */
async function callGemini(apiKey: string, base64Data: string, mediaType: string): Promise<SurveyResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `${SYSTEM}

حلل الصورة المرفقة واكتشف جميع المحلات التجارية ونقاط البيع المرئية.

يجب أن يكون الرد كائن JSON صالح فقط دون أي نص إضافي أو علامات markdown، ومطابق تماماً للهيكل التالي:
{
  "summary_ar": "ملخص تحليلي للمحلات المكتشفة بالعربية",
  "stores_found": 3,
  "stores": [
    {
      "name": "اسم المحل من اللافتة",
      "type": "سوبرماركت",
      "estimated_size": "medium",
      "position_note": "أول يمين الشارع"
    }
  ]
}`;

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
    throw new Error(`Gemini API HTTP ${resp.status}: ${errText}`);
  }

  const jsonResp = await resp.json();
  const rawText = jsonResp?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned empty or blocked output");

  const cleanJson = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '');
  const parsed = JSON.parse(cleanJson);
  return SurveySchema.parse(parsed);
}

/** Fallback to Anthropic Claude Vision */
async function callAnthropic(apiKey: string, base64Data: string, mediaType: MediaType): Promise<SurveyResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', signal:AbortSignal.timeout(60_000),
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:4000,system:SYSTEM,messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:mediaType,data:base64Data}},{type:'text',text:"Return only JSON with stores_found, stores (each with name, type, estimated_size (small/medium/large), position_note), summary_ar. Do not invent invisible stores."}
    ]}]}),
  });
  if(!response.ok) throw new Error('Analysis provider rejected the request');
  const output=await response.json();
  const text=output.content?.find((part:{type:string;text?:string})=>part.type==='text')?.text;
  if(output.stop_reason==='refusal' || !text) throw new Error('Provider returned no measurement');
  return SurveySchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/i,'')));

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Verify caller identity
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json(401, { error: "unauthorized" });

  const { data: caller } = await admin.from("supervisors")
    .select("id,company_id,role,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.is_active) return json(403, { error: "inactive or unknown supervisor" });

  // 2) Validate survey ownership
  let surveyId: unknown;
  try { ({ survey_id: surveyId } = await req.json()); } catch { /* handled below */ }
  if (typeof surveyId !== "string") return json(400, { error: "survey_id is required" });

  const { data: survey } = await admin.from("field_surveys")
    .select("id,company_id,supervisor_id,photo_url,status").eq("id", surveyId).maybeSingle();
  const isAdmin = ["admin", "super_admin"].includes(caller.role);
  if (
    !survey ||
    survey.company_id !== caller.company_id ||
    (!isAdmin && survey.supervisor_id !== caller.id)
  ) return json(404, { error: "survey not found" });
  if (!survey.photo_url) return json(400, { error: "survey has no photo" });
  if (!survey.photo_url.startsWith(`${caller.company_id}/${survey.supervisor_id}/`)) {
    return json(403, { error: "photo path does not belong to your company" });
  }
  const sid=verifiedTokenSession(token!);
  if(!sid) return json(403,{error:'Session identity required'});
  const claim=await admin.rpc('mdn_claim_analysis_job_v1',{p_user_id:auth.user.id,
    p_session_id:sid,p_resource_type:'field_surveys',p_resource_id:survey.id});
  if(claim.error || !claim.data) return json(claim.error?.code==='23505'?409:claim.error?.code==='54000'?429:403,{error:'Analysis could not be authorized or reserved'});
  const jobId=claim.data;
  const fail=async(status:number,error:string)=>{
    const result=await admin.rpc('mdn_finish_analysis_job_v1',{p_job_id:jobId,p_success:false});
    if(result.error) console.error('Could not finalize discovery failure',jobId);
    return json(status,{error});
  };

  try {
    // 3) Download photo from private bucket
    const { data: blob, error: dlError } = await admin.storage.from(SURVEY_BUCKET).download(survey.photo_url);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 10MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const base64Data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 4) Execute AI Discovery: Primary is Gemini Flash, Fallback is Anthropic
    let result: SurveyResult;
    let modelUsed: string;
    let engine: 'google-gemini' | 'anthropic' = 'anthropic';

    if (geminiKey) {
      try {
        result = await callGemini(geminiKey, base64Data, mediaType);
        modelUsed = GEMINI_MODEL; engine = 'google-gemini';
      } catch (geminiErr) {
        console.warn("Primary discovery provider failed");
        if (anthropicKey) {
          result = await callAnthropic(anthropicKey, base64Data, mediaType);
          modelUsed = CLAUDE_MODEL;
        } else {
          throw geminiErr;
        }
      }
    } else {
      result = await callAnthropic(anthropicKey!, base64Data, mediaType);
      modelUsed = CLAUDE_MODEL;
    }

    const saved=await admin.rpc('mdn_finish_analysis_job_v1',{p_job_id:jobId,p_success:true,p_result:{...result,model:modelUsed,engine}});
    if(saved.error || saved.data!==true) return await fail(500,'Could not confirm persisted discovery');

    return json(200, {
      success: true,
      survey_id: survey.id,
      stores_found: result.stores_found,
      stores: result.stores,
      summary_ar: result.summary_ar,
      model: modelUsed,
    });
  } catch (err: any) {
    console.error("Discovery failed",jobId);
    return await fail(500, "Could not complete discovery");
  }
},Deno.env.get('ALLOWED_ORIGIN') ?? 'https://mydan.digityoucan.com',sdkCorsHeaders));
