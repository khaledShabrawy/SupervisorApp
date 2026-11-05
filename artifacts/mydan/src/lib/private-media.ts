import { supabase, SUPABASE_URL } from './supabase';
import { mediaPath } from './media-path';
export async function signedMedia(bucket: string, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const path = mediaPath(value, SUPABASE_URL, bucket);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error('تعذر تحميل الملف الخاص. أعد المحاولة.');
  return data.signedUrl;
}
/** External training links are explicit HTTPS links, never executable schemes. */
export async function trainingMedia(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https:/i.test(value) && new URL(value).origin !== new URL(SUPABASE_URL).origin) return new URL(value).href;
  return signedMedia('training-materials', value);
}
