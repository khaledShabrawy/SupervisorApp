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

type DiscoveredStore = {
  name: string;
  type: string;
  estimated_size: 'small' | 'medium' | 'large';
  position_note: string;
};

type AiResult = {
  stores: DiscoveredStore[];
  summary_ar: string;
};

async function callClaudeVision(imageBase64: string, mimeType: string): Promise<AiResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const prompt = `أنت محلل ميداني متخصص في قطاع السلع الاستهلاكية (FMCG). حلل هذه الصورة وحدد جميع المحلات والكيوسكات ونقاط البيع المرئية.

لكل محل مكتشف، أعطني:
- name: اسم المحل أو وصف مختصر (مثل: بقالة الأمين، كيوسك رقم 1)
- type: نوع المحل من القائمة التالية بالضبط: بقالة، سوبرماركت، هايبرماركت، كيوسك، محل جملة، ضيافة، أخرى
- estimated_size: الحجم التقريبي، اختر إحدى هذه القيم بالضبط: small، medium، large
- position_note: ملاحظة عن موقع المحل في الصورة بالعربية (مثل: يسار الصورة، المركز، الطابق الأرضي)

أجب فقط بـ JSON صالح بهذا الشكل بالضبط، لا تضف أي نص قبله أو بعده:
{
  "stores": [
    {
      "name": "...",
      "type": "...",
      "estimated_size": "small|medium|large",
      "position_note": "..."
    }
  ],
  "summary_ar": "ملخص عربي مختصر لما تم اكتشافه (جملة واحدة)"
}

إذا لم تجد أي محلات في الصورة، أعد: {"stores": [], "summary_ar": "لم يُكتشف أي محل في الصورة"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText: string = data?.content?.[0]?.text ?? '';

  // Extract JSON from the response (Claude sometimes wraps it in markdown)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned no JSON block');

  const parsed: AiResult = JSON.parse(jsonMatch[0]);

  // Validate & sanitize stores array
  const VALID_SIZES = new Set(['small', 'medium', 'large']);
  const stores: DiscoveredStore[] = (parsed.stores ?? [])
    .filter((s): s is DiscoveredStore => typeof s === 'object' && s !== null)
    .map((s) => ({
      name: String(s.name ?? '').trim() || 'محل غير محدد الاسم',
      type: String(s.type ?? 'أخرى').trim() || 'أخرى',
      estimated_size: VALID_SIZES.has(s.estimated_size) ? s.estimated_size : 'medium',
      position_note: String(s.position_note ?? '').trim() || '',
    }));

  return {
    stores,
    summary_ar: String(parsed.summary_ar ?? '').trim() || `تم اكتشاف ${stores.length} محل`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let surveyId: string | undefined;

  try {
    // --- Auth: verify caller JWT ---
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'missing_auth' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'invalid_token' }, 401);

    // --- Parse body ---
    const body = await req.json();
    surveyId = body?.survey_id;
    if (!surveyId) return json({ error: 'survey_id required' }, 400);

    // --- Load survey record ---
    const { data: survey, error: surveyErr } = await admin
      .from('field_surveys')
      .select('id, company_id, supervisor_id, photo_url, status')
      .eq('id', surveyId)
      .maybeSingle();

    if (surveyErr || !survey) return json({ error: 'survey_not_found' }, 404);

    // Verify the caller owns this survey via their supervisor profile
    const { data: sup } = await admin
      .from('supervisors')
      .select('id, company_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sup || sup.id !== survey.supervisor_id) {
      return json({ error: 'forbidden' }, 403);
    }

    if (!survey.photo_url) return json({ error: 'no_photo' }, 400);

    // --- Mark as processing ---
    await admin
      .from('field_surveys')
      .update({ status: 'processing' })
      .eq('id', surveyId);

    // --- Download photo from storage ---
    const { data: fileData, error: dlErr } = await admin.storage
      .from('survey-photos')
      .download(survey.photo_url);

    if (dlErr || !fileData) {
      await admin.from('field_surveys').update({ status: 'failed' }).eq('id', surveyId);
      return json({ error: 'photo_download_failed', detail: dlErr?.message }, 500);
    }

    // Convert Blob → base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const imageBase64 = btoa(binary);

    // Detect MIME type from path extension
    const ext = survey.photo_url.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    };
    const mimeType = mimeMap[ext] ?? 'image/jpeg';

    // --- Call Claude Vision ---
    const aiResult = await callClaudeVision(imageBase64, mimeType);

    // --- Persist results ---
    await admin.from('field_surveys').update({
      status: 'completed',
      stores_found: aiResult.stores.length,
      ai_raw_result: aiResult,
    }).eq('id', surveyId);

    return json({ success: true, stores_found: aiResult.stores.length, stores: aiResult.stores });

  } catch (err) {
    console.error('discover-customers error:', err);
    // Mark as failed so the UI can show a retry button
    if (surveyId) {
      await admin.from('field_surveys').update({ status: 'failed' }).eq('id', surveyId).catch(() => {});
    }
    return json({ error: 'server_error', detail: String(err) }, 500);
  }
});
