-- Push Notification Subscriptions
-- شغّله في Supabase SQL Editor مرة واحدة
-- ثم أضف VAPID_PRIVATE_KEY في Supabase → Settings → Edge Functions → Secrets

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(supervisor_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supervisor_own_subs" ON public.push_subscriptions
  FOR ALL USING (supervisor_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
