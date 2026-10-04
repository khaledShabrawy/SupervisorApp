import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const url = SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('إعدادات Supabase غير مكتملة. أضف متغيرات VITE_SUPABASE المطلوبة.');
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storageKey: 'mydan-pwa-auth',
  },
});