-- Migration 20: Secure Device Binding RPC
-- Problem: supervisors could clear localStorage and re-trigger auto-binding from the client,
--          effectively bypassing device-lock enforcement.
-- Fix: a SECURITY DEFINER function that only binds when device_id IS NULL (first-time only).
--      Direct client UPDATE on device_id continues to work for admins (their RLS grants it).
--
-- Apply in Supabase SQL Editor.  Requires no data changes; safe to run on live DB.

CREATE OR REPLACE FUNCTION public.mdn_bind_device_v1(
  p_supervisor_id uuid,
  p_device_id     text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.supervisors
  SET    device_id = p_device_id
  WHERE  id        = p_supervisor_id
    AND  user_id   = auth.uid()    -- caller must own this row
    AND  device_id IS NULL         -- only first-time binding; re-binding requires admin reset
    AND  is_active = true;
  RETURN FOUND;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.mdn_bind_device_v1(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mdn_bind_device_v1(uuid, text) FROM anon;

COMMENT ON FUNCTION public.mdn_bind_device_v1 IS
  'Bind device_id to a supervisor on first login. Fails silently if already bound.';
