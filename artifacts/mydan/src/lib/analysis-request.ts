/** Remote analysis is authoritative. A failed request must never manufacture measurements. */
export async function requestAnalysis(input: {
  projectUrl: string;
  endpoint: string;
  token: string;
  body: Record<string, string>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<void> {
  if (new URL(input.endpoint).origin !== new URL(input.projectUrl).origin) {
    throw new Error('عنوان خدمة التحليل غير متطابق مع مشروع Supabase.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 90_000);
  try {
    const response = await (input.fetcher ?? fetch)(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}` },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    // A request already claimed/completed by the server is recovered through the result query.
    if (response.status === 409) return;
    if (response.ok) {
      const result = await response.json().catch(() => null);
      const idKey = 'audit_id' in input.body ? 'audit_id' : 'survey_id' in input.body ? 'survey_id' : null;
      if (!result || result.success !== true || !idKey || result[idKey] !== input.body[idKey]) {
        throw new Error('استجابة خدمة التحليل غير صالحة. تحقق من النتيجة قبل إعادة المحاولة.');
      }
      return;
    }
    if (response.status === 429) throw new Error('تم بلوغ حد التحليل المسموح. انتظر ثم أعد المحاولة.');
    if (response.status === 401 || response.status === 403) throw new Error('لا تملك صلاحية تشغيل التحليل أو أن الخدمة غير مفعّلة.');
    throw new Error('تعذر تشغيل التحليل. لم تُنشأ نتيجة بديلة؛ أعد المحاولة لاحقاً.');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('انتهت مهلة الطلب. قد يستمر التحليل على الخادم؛ تحقق من النتيجة قبل إعادة المحاولة.');
    }
    if (error instanceof TypeError) throw new Error('تعذر الاتصال بخدمة التحليل. تحقق من الشبكة ثم أعد المحاولة.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
