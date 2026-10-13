// discover-customers v1 — Claude Vision field survey (AI customer discovery).
//
// Secrets (Dashboard → Edge Functions → Secrets), never in code:
//   ANTHROPIC_API_KEY   required
//   CLAUDE_MODEL        optional, defaults to claude-sonnet-4-6
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// Body: { survey_id }
// Photo lives in the 'survey-photos' private bucket under path
//   {company_id}/{supervisor_id}/{uuid}.ext
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod@3";

const SURVEY_BUCKET = "survey-photos";
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "ANTHROPIC_API_KEY secret is not set" });

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
  if (survey.status === "processing") return json(409, { error: "analysis already running" });

  const fail = async (status: number, error: string) => {
    await admin.from("field_surveys").update({ status: "failed" }).eq("id", survey.id);
    return json(status, { error });
  };
  await admin.from("field_surveys").update({ status: "processing" }).eq("id", survey.id);

  try {
    // 3) Download photo from private bucket
    const { data: blob, error: dlError } = await admin.storage.from(SURVEY_BUCKET).download(survey.photo_url);
    if (dlError || !blob) return await fail(404, "photo not found in storage");
    if (blob.size > MAX_IMAGE_BYTES) return await fail(413, "photo larger than 5MB");
    const mediaType = (MEDIA_TYPES as readonly string[]).includes(blob.type) ? blob.type as MediaType : "image/jpeg";
    const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 4) Ask Claude Vision
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: "حلل الصورة واكتشف جميع المحلات التجارية المرئية." },
        ],
      }],
      output_config: { format: zodOutputFormat(SurveySchema) },
    });

    if (response.stop_reason === "refusal") return await fail(422, "model declined to analyze this photo");
    const result = response.parsed_output;
    if (!result) return await fail(502, "model returned an unparseable result");

    await admin.from("field_surveys").update({
      stores_found: result.stores_found,
      ai_raw_result: result,
      status: "completed",
    }).eq("id", survey.id);

    return json(200, {
      success: true,
      survey_id: survey.id,
      stores_found: result.stores_found,
      stores: result.stores,
      summary_ar: result.summary_ar,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return await fail(429, "AI service busy, retry shortly");
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic error", err.status, err.message);
      return await fail(502, "AI service error");
    }
    console.error("discover-customers error", err);
    return await fail(500, "internal error");
  }
});
