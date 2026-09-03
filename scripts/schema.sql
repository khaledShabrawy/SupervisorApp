-- ============================================================
--  Mydan — Full Database Schema
--  Run this in: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ── supervisors ──────────────────────────────────────────────
create table if not exists public.supervisors (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text        not null,
  email         text        not null unique,
  phone         text,
  branch        text,
  region        text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ── customers ────────────────────────────────────────────────
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  type          text        not null,   -- e.g. سوبر ماركت / بقالة
  address       text,
  latitude      float8      not null default 0,
  longitude     float8      not null default 0,
  phone         text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ── visits ───────────────────────────────────────────────────
create table if not exists public.visits (
  id             uuid primary key default gen_random_uuid(),
  supervisor_id  uuid        not null references public.supervisors(id),
  customer_id    uuid        not null references public.customers(id),
  status         text        not null,   -- متعامل / غير متعامل / غير موجود
  latitude       float8,
  longitude      float8,
  geo_distance   float8,
  on_beat        boolean     default true,
  visit_date     timestamptz not null default now(),
  notes          text,
  created_at     timestamptz not null default now()
);

-- ── products ─────────────────────────────────────────────────
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  category      text        not null,
  sku           text,
  unit          text,
  price         float8,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ── orders ───────────────────────────────────────────────────
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid        not null references public.visits(id),
  supervisor_id uuid        not null references public.supervisors(id),
  customer_id   uuid        not null references public.customers(id),
  product_id    uuid        not null references public.products(id),
  quantity      int         not null default 1,
  status        text        not null default 'pending',
  created_at    timestamptz not null default now()
);

-- ── shelf_audit ──────────────────────────────────────────────
create table if not exists public.shelf_audit (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid        not null references public.visits(id),
  product_id     uuid        not null references public.products(id),
  is_present     boolean     not null default false,
  quantity       int         not null default 0,
  photo_url      text,
  ai_analysis    jsonb,
  display_order  text,
  audit_summary_ar text,
  created_at     timestamptz not null default now()
);

-- ── competitor_products ───────────────────────────────────────
create table if not exists public.competitor_products (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid        not null references public.visits(id),
  brand_name    text        not null,
  product_name  text        not null,
  quantity      int         not null default 0,
  photo_url     text,
  created_at    timestamptz not null default now()
);

-- ── targets ──────────────────────────────────────────────────
create table if not exists public.targets (
  id             uuid primary key default gen_random_uuid(),
  supervisor_id  uuid        not null references public.supervisors(id),
  target_date    date        not null,
  visits_target  int         not null default 10,
  orders_target  int         not null default 5,
  created_at     timestamptz not null default now(),
  unique (supervisor_id, target_date)
);

-- ── RLS: allow authenticated users to access their own data ──
alter table public.supervisors       enable row level security;
alter table public.customers         enable row level security;
alter table public.visits            enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.shelf_audit       enable row level security;
alter table public.competitor_products enable row level security;
alter table public.targets           enable row level security;

-- supervisors: read own row
create policy "supervisor_select_own" on public.supervisors
  for select using (auth.uid() = id);

-- customers: all authenticated
create policy "customers_select_all" on public.customers
  for select using (auth.role() = 'authenticated');

-- products: all authenticated
create policy "products_select_all" on public.products
  for select using (auth.role() = 'authenticated');

-- visits: own rows
create policy "visits_all_own" on public.visits
  for all using (supervisor_id = auth.uid());

-- orders: own rows
create policy "orders_all_own" on public.orders
  for all using (supervisor_id = auth.uid());

-- shelf_audit: via own visits
create policy "shelf_audit_all_own" on public.shelf_audit
  for all using (
    visit_id in (select id from public.visits where supervisor_id = auth.uid())
  );

-- competitor_products: via own visits
create policy "competitor_products_all_own" on public.competitor_products
  for all using (
    visit_id in (select id from public.visits where supervisor_id = auth.uid())
  );

-- targets: own rows
create policy "targets_select_own" on public.targets
  for select using (supervisor_id = auth.uid());

-- ============================================================
--  Demo supervisor row  (matches the auth user created by script)
-- ============================================================
insert into public.supervisors (id, full_name, email, branch, region, is_active)
values (
  '4f3d2bd8-b97b-47c0-8168-01f23fb87f84',
  'مندوب تجريبي',
  'demo@mydan.app',
  'فرع العرض التجريبي',
  'المنطقة الوسطى',
  true
)
on conflict (id) do nothing;

-- ── Sample customers (for testing) ───────────────────────────
insert into public.customers (name, type, address, latitude, longitude) values
  ('سوبر ماركت النور',    'سوبر ماركت', 'شارع الملك فهد، الرياض',   24.7136,  46.6753),
  ('بقالة الأمل',          'بقالة',       'حي النزهة، جدة',            21.5433,  39.1728),
  ('هايبر الرياض',         'هايبر ماركت', 'طريق الدائري، الرياض',     24.6877,  46.7219),
  ('محل الفرحان',          'بقالة',       'شارع التحلية، الدمام',      26.4207,  50.0888),
  ('ميني ماركت السلام',   'ميني ماركت',  'حي السلامة، الرياض',        24.7453,  46.6291)
on conflict do nothing;

-- ── Sample products ───────────────────────────────────────────
insert into public.products (name, category, sku, unit, price, is_active) values
  ('عصير برتقال 1 لتر',   'عصائر',    'JC-001', 'كرتون', 48.00,  true),
  ('مياه معدنية 500مل',    'مياه',     'WA-001', 'كرتون', 24.00,  true),
  ('حليب كامل الدسم 1L',   'ألبان',    'ML-001', 'كرتون', 62.00,  true),
  ('شيبس ملح 50جم',        'مقرمشات',  'SN-001', 'كرتون', 36.00,  true),
  ('شوكولاتة حليب 100جم',  'حلويات',   'CH-001', 'كرتون', 55.00,  true),
  ('مشروب طاقة 250مل',     'مشروبات',  'EN-001', 'كرتون', 90.00,  true),
  ('كاتشب طماطم 500جم',    'صلصات',    'KC-001', 'كرتون', 42.00,  true),
  ('زيت دوار الشمس 1.5L',  'زيوت',     'OL-001', 'كرتون', 75.00,  true)
on conflict do nothing;

-- ── Target for demo user (today) ─────────────────────────────
insert into public.targets (supervisor_id, target_date, visits_target, orders_target)
values (
  '4f3d2bd8-b97b-47c0-8168-01f23fb87f84',
  current_date,
  8,
  4
)
on conflict (supervisor_id, target_date) do nothing;

-- ── Add perfect_store_score to visits (safe to run even if column exists) ──
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS perfect_store_score int;

-- ── Async shelf-audit result from n8n / Supabase Realtime ─────
ALTER TABLE public.shelf_audit
  ADD COLUMN IF NOT EXISTS audit_summary_ar text;
