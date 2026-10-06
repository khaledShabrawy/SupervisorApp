-- Demo seed (C-9): brings customers to 10 and extends the beat plan + targets for the
-- demo supervisor. Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
-- Company:    a0000000-0000-0000-0000-000000000001
-- Supervisor: c1111111-1111-1111-1111-111111111111 (role = supervisor)

BEGIN;

-- 5 more customers in Alexandria (existing d1..d5 are kept).
INSERT INTO public.customers (id, name, type, customer_type, owner_name, phone, address, latitude, longitude, is_active, company_id, supervisor_id)
VALUES
  ('d6000000-0000-0000-0000-000000000006', 'سوبر ماركت الأمانة',  'سوبر ماركت', 'سوبر ماركت', 'محمد علي',     '01000000006', 'سموحة - شارع فوزي معاذ',  31.2156, 29.9450, true, 'a0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111'),
  ('d7000000-0000-0000-0000-000000000007', 'بقالة الحاج سعيد',    'بقالة',      'بقالة',      'سعيد إبراهيم', '01000000007', 'سيدي بشر - شارع خالد بن الوليد', 31.2601, 29.9858, true, 'a0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111'),
  ('d8000000-0000-0000-0000-000000000008', 'ميني ماركت النور',    'ميني ماركت', 'ميني ماركت', 'أحمد حسن',     '01000000008', 'ميامي - شارع جمال عبد الناصر', 31.2697, 30.0047, true, 'a0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111'),
  ('d9000000-0000-0000-0000-000000000009', 'هايبر الإسكندرية',    'هايبر ماركت','هايبر ماركت','شركة الإسكندرية','01000000009', 'سان ستيفانو - طريق الكورنيش', 31.2447, 29.9672, true, 'a0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111'),
  ('da000000-0000-0000-0000-00000000000a', 'كافيه البحر',         'كافيه',      'كافيه',      'كريم محمود',   '01000000010', 'المنشية - ميدان التحرير',   31.1979, 29.8945, true, 'a0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Beat plan for the rest of the demo week (reuses the status value already in use).
INSERT INTO public.beat_plans (supervisor_id, plan_date, day_of_week, customer_id, customer_ids_ordered, status, company_id)
SELECT 'c1111111-1111-1111-1111-111111111111', d.plan_date, EXTRACT(DOW FROM d.plan_date)::int,
       d.ids[1], d.ids,
       (SELECT status FROM public.beat_plans WHERE supervisor_id = 'c1111111-1111-1111-1111-111111111111' LIMIT 1),
       'a0000000-0000-0000-0000-000000000001'
FROM (VALUES
  ('2026-10-09'::date, ARRAY['d6000000-0000-0000-0000-000000000006','d7000000-0000-0000-0000-000000000007']::uuid[]),
  ('2026-10-10'::date, ARRAY['d8000000-0000-0000-0000-000000000008','d9000000-0000-0000-0000-000000000009']::uuid[]),
  ('2026-10-11'::date, ARRAY['da000000-0000-0000-0000-00000000000a','d1000000-0000-0000-0000-000000000001']::uuid[])
) AS d(plan_date, ids)
WHERE NOT EXISTS (
  SELECT 1 FROM public.beat_plans b
  WHERE b.supervisor_id = 'c1111111-1111-1111-1111-111111111111' AND b.plan_date = d.plan_date
);

-- November target (October already exists). Visit/audit goals only — no sales fields.
INSERT INTO public.targets (supervisor_id, target_date, month, year, visits_target, audit_target, company_id)
SELECT 'c1111111-1111-1111-1111-111111111111', '2026-11-01', 11, 2026, 60, 30, 'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.targets
  WHERE supervisor_id = 'c1111111-1111-1111-1111-111111111111' AND month = 11 AND year = 2026
);

COMMIT;

-- Verify:
-- SELECT count(*) FROM public.customers WHERE company_id = 'a0000000-0000-0000-0000-000000000001';  -- expect 10
