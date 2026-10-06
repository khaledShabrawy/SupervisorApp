-- Phase C: default checklist for every new visit (visit_tasks was empty, so the
-- Visit Detail checklist never rendered). Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_default_visit_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.visit_tasks (visit_id, company_id, task_type, title_ar, is_mandatory, order_num)
  VALUES
    (NEW.id, NEW.company_id, 'shelf_audit',      'تصوير ومراجعة الرف',     true,  1),
    (NEW.id, NEW.company_id, 'competitor_check', 'رصد منتجات المنافسين',   false, 2),
    (NEW.id, NEW.company_id, 'other',            'التحقق من جودة العرض', false, 3);
  RETURN NEW;
END;
$$;

-- Trigger-only: nobody should call it over the REST API.
REVOKE EXECUTE ON FUNCTION public.create_default_visit_tasks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_visits_default_tasks ON public.visits;
CREATE TRIGGER trg_visits_default_tasks
AFTER INSERT ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.create_default_visit_tasks();

-- Backfill open visits that have no tasks yet.
INSERT INTO public.visit_tasks (visit_id, company_id, task_type, title_ar, is_mandatory, order_num)
SELECT v.id, v.company_id, t.task_type, t.title_ar, t.is_mandatory, t.order_num
FROM public.visits v
CROSS JOIN (VALUES
  ('shelf_audit',      'تصوير ومراجعة الرف',     true,  1),
  ('competitor_check', 'رصد منتجات المنافسين',   false, 2),
  ('other',            'التحقق من جودة العرض', false, 3)
) AS t(task_type, title_ar, is_mandatory, order_num)
WHERE v.status IN ('pending', 'in_progress')
  AND NOT EXISTS (SELECT 1 FROM public.visit_tasks vt WHERE vt.visit_id = v.id);

COMMIT;
