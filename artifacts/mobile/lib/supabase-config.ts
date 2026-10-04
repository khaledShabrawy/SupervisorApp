export interface SupabaseConfiguration {
  isValid: boolean;
  message: string | null;
}

// This is a local format check, not proof of connectivity or RLS access.
export function validateSupabaseConfiguration(url: string, key: string): SupabaseConfiguration {
  if (!url.trim() || !key.trim()) {
    return {
      isValid: false,
      message: 'إعدادات Supabase غير مكتملة. يلزم رابط المشروع ومفتاح Publishable/anon العام.',
    };
  }

  try {
    const parsed = new URL(url.trim());
    if (
      parsed.protocol !== 'https:' || !parsed.hostname ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== '/' && parsed.pathname !== '')
    ) throw new Error('Invalid URL');
  } catch {
    return { isValid: false, message: 'رابط Supabase غير صالح. يلزم رابط HTTPS للمشروع دون مسارات أو بيانات دخول.' };
  }

  const publicKey = key.trim();
  let allowed = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey);
  if (!allowed && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(publicKey)) {
    try {
      const payload = publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      allowed = decoded.role === 'anon';
    } catch {
      allowed = false;
    }
  }
  return allowed
    ? { isValid: true, message: null }
    : { isValid: false, message: 'مفتاح العميل غير صالح. استخدم Publishable/anon فقط، ولا تستخدم مفتاحًا خادميًا.' };
}