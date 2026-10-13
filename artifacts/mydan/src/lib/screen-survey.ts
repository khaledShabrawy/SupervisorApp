import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from './supabase';
import { useScope } from './data';
import { notify } from './toast';

const SURVEY_BUCKET = 'survey-photos';
const DISCOVER_ENDPOINT = `${SUPABASE_URL}/functions/v1/discover-customers`;

export type DiscoveredStore = {
  name: string;
  type: string;
  estimated_size: 'small' | 'medium' | 'large';
  position_note: string;
};

export type FieldSurvey = {
  id: string;
  company_id: string;
  supervisor_id: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  stores_found: number;
  ai_raw_result: { stores: DiscoveredStore[]; summary_ar?: string } | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
};

async function currentSession(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) {
    throw new Error('Ø¬ÙØ³Ø© Ø§ÙØ¯Ø®ÙÙ ØºÙØ± ØµØ§ÙØ­Ø©. Ø£Ø¹Ø¯ ØªØ³Ø¬ÙÙ Ø§ÙØ¯Ø®ÙÙ.');
  }
  return data.session;
}

export function useUploadSurveyPhoto() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      latitude,
      longitude,
    }: { file: File; latitude: number | null; longitude: number | null }): Promise<FieldSurvey> => {
      await currentSession(sc.supervisor.user_id);
      if (!file.type.startsWith('image/')) throw new Error('Ø§Ø®ØªØ± ØµÙØ±Ø© ØµØ§ÙØ­Ø©.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Ø­Ø¬Ù Ø§ÙØµÙØ±Ø© Ø£ÙØ¨Ø± ÙÙ 10 ÙÙØ¬Ø§Ø¨Ø§ÙØª.');

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const uid = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const path = `${sc.companyId}/${sc.supervisorId}/${uid}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(SURVEY_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error('ØªØ¹Ø°Ø± Ø±ÙØ¹ ØµÙØ±Ø© Ø§ÙÙØ³Ø­ Ø§ÙÙÙØ¯Ø§ÙÙ. ØªØ­ÙÙ ÙÙ ÙØ¬ÙØ¯ bucket "survey-photos".');

      const { data, error: insertError } = await supabase.from('field_surveys').insert({
        company_id: sc.companyId,
        supervisor_id: sc.supervisorId,
        photo_url: path,
        latitude,
        longitude,
        status: 'pending',
      }).select('*').single();

      if (insertError || !data) {
        await supabase.storage.from(SURVEY_BUCKET).remove([path]);
        throw new Error('ØªØ¹Ø°Ø± Ø¥ÙØ´Ø§Ø¡ Ø³Ø¬Ù Ø§ÙÙØ³Ø­ Ø§ÙÙÙØ¯Ø§ÙÙ.');
      }
      return data as FieldSurvey;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'field-surveys'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useRequestSurveyAnalysis() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async (survey: FieldSurvey) => {
      if (new URL(SUPABASE_URL).origin !== new URL(DISCOVER_ENDPOINT).origin) {
        throw new Error('Ø¹ÙÙØ§Ù Ø®Ø¯ÙØ© Ø§ÙØªØ­ÙÙÙ ØºÙØ± ÙØªØ·Ø§Ø¨Ù ÙØ¹ ÙØ´Ø±ÙØ¹ Supabase.');
      }
      const session = await currentSession(sc.supervisor.user_id);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      try {
        const res = await fetch(DISCOVER_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ survey_id: survey.id }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù Ø§ÙØµÙØ±Ø© ÙØ®Ø¯ÙØ© Ø§ÙØ§ÙØªØ´Ø§Ù. ØªØ­ÙÙ ÙÙ ÙØ´Ø± ÙØ¸ÙÙØ© discover-customers.');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          throw new Error('Ø§ÙØªÙØª ÙÙÙØ© Ø§ÙØ·ÙØ¨. ÙØ¯ ÙØ³ØªÙØ± Ø§ÙØªØ­ÙÙÙØ Ø§ÙØªØ¸Ø± Ø«Ù Ø£Ø¹Ø¯ Ø§ÙÙØ­Ø§ÙÙØ©.');
        if (error instanceof TypeError)
          throw new Error('ØªØ¹Ø°Ø± Ø§ÙØ§ØªØµØ§Ù Ø¨Ø®Ø¯ÙØ© Ø§ÙØ§ÙØªØ´Ø§Ù. ØªØ­ÙÙ ÙÙ Ø§ÙØ§ØªØµØ§Ù Ø¨Ø§ÙØ¥ÙØªØ±ÙØª.');
        throw error;
      } finally { clearTimeout(timer); }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'field-surveys'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useSurveyResult(id: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'field-surveys', 'result', id],
    enabled: !!id,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('field_surveys')
        .select('*').eq('id', id!).eq('company_id', sc.companyId).abortSignal(signal).single();
      if (error || !data) throw new Error('ØªØ¹Ø°Ø± ØªØ­ÙÙÙ ÙØªÙØ¬Ø© Ø§ÙÙØ³Ø­.');
      return data as FieldSurvey;
    },
    refetchInterval: q =>
      q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 4000 : false,
  });
}

export function useSaveProspects() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      survey,
      stores,
    }: { survey: FieldSurvey; stores: { name: string; type: string }[] }) => {
      if (!stores.length) throw new Error('ÙØ§ ØªÙØ¬Ø¯ Ø¹ÙÙØ§Ø¡ ÙØ­ÙØ¸ÙÙ.');
      const rows = stores.map(s => ({
        company_id: sc.companyId,
        supervisor_id: sc.supervisorId,
        name: s.name.trim() || 'Ø¹ÙÙÙ ØºÙØ± ÙØ­Ø¯Ø¯ Ø§ÙØ§Ø³Ù',
        type: s.type,
        latitude: survey.latitude,
        longitude: survey.longitude,
        created_by: sc.supervisorId,
        is_active: true,
        status: 'prospect',
        survey_id: survey.id,
      }));
      const { error } = await supabase.from('customers').insert(rows);
      if (error) throw new Error('ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§ÙØ¹ÙÙØ§Ø¡ Ø§ÙÙØ­ØªÙÙÙÙ: ' + error.message);
      return rows.length;
    },
    onSuccess: count => {
      notify(`ØªÙ Ø­ÙØ¸ ${count} Ø¹ÙÙÙ ÙØ­ØªÙÙ Ø¨ÙØ¬Ø§Ø­`, 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

// Admin: load prospects for a company
export function useAdminProspects() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'customers', 'prospects'],
    enabled: sc.isAdmin,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('customers')
        .select('id,name,customer_type,latitude,longitude,survey_id,created_at,supervisor_id,is_active,status')
        .eq('company_id', sc.companyId)
        .eq('status', 'prospect')
        .order('created_at', { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw new Error('ØªØ¹Ø°Ø± ØªØ­ÙÙÙ Ø§ÙØ¹ÙÙØ§Ø¡ Ø§ÙÙØ­ØªÙÙÙÙ.');
      return data as {
        id: string; name: string; customer_type: string | null;
        latitude: number | null; longitude: number | null;
        survey_id: string | null; created_at: string;
        supervisor_id: string; is_active: boolean; status: string;
      }[];
    },
  });
}

export function useConvertProspect() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'activate' | 'reject' }) => {
      const status = action === 'activate' ? 'active' : 'rejected';
      const is_active = action === 'activate';
      const { error } = await supabase.from('customers').update({ status, is_active })
        .eq('id', id).eq('company_id', sc.companyId).eq('status', 'prospect');
      if (error) throw new Error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙØ« Ø­Ø§ÙØ© Ø§ÙØ¹ÙÙÙ.');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
