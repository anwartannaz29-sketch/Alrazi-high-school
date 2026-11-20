-- 001_initial_schema.sql — الأخبار والإعلانات + صلاحيات المسؤول + RLS
-- ينفَّذ من Supabase → SQL Editor (أو supabase db push). لا يحتوي أي بيانات ولا أسرار.

-- ========== 1) المسؤولون ==========
-- جدول يحدد من هو المسؤول. لا توجد أي سياسة كتابة للعملاء، فلا يستطيع أحد منح نفسه الصلاحية.
-- الإضافة تتم فقط من SQL Editor (دور postgres) كما في docs/ADMIN_SETUP.md.
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists admin_users_select_own on public.admin_users;
create policy admin_users_select_own on public.admin_users
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ========== 2) دوال الطوابع الزمنية (دالة لكل جدول) ==========
-- ملاحظة: كانت الدالة المشتركة تشير إلى new.published_at فتفشل مع جدول الإعلانات؛ فُصلت.
create or replace function public.tg_news_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();          -- لا يمكن انتحال الكاتب
  else
    new.created_at := old.created_at;      -- غير قابل للتعديل
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

create or replace function public.tg_announcements_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ========== 3) الأخبار ==========
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  slug         text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  excerpt      text check (char_length(excerpt) <= 500),
  content      text not null default '' check (char_length(content) <= 50000),
  image_url    text,
  category     text check (char_length(category) <= 40),      -- إضافة: تصنيف البطاقة
  featured     boolean not null default false,                -- إضافة: "أهم الأخبار"
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  constraint news_published_has_date check (status <> 'published' or published_at is not null)
);
alter table public.news drop constraint if exists news_image_url_check;
alter table public.news drop constraint if exists news_image_https;
alter table public.news add constraint news_image_https
  check (image_url is null or (image_url ~* '^https://[^\s"''<>]+$' and char_length(image_url) <= 2000));  -- https فقط (http محجوب على المواقع الآمنة)
create index if not exists news_published_idx on public.news (published_at desc) where status = 'published';
create index if not exists news_status_idx    on public.news (status, created_at desc);
drop trigger if exists news_defaults on public.news;
create trigger news_defaults before insert or update on public.news
  for each row execute function public.tg_news_defaults();

-- ========== 4) الإعلانات ==========
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  content    text not null default '' check (char_length(content) <= 5000),
  type       text not null default 'إداري' check (type in ('إداري','موعد','وثيقة','تغيير','تنبيه')),  -- إضافة: نوع الإعلان
  pinned     boolean not null default false,                                                          -- إضافة: تثبيت
  status     text not null default 'draft' check (status in ('draft','published','archived')),
  start_at   timestamptz,
  end_at     timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint announcements_period_valid check (end_at is null or start_at is null or end_at > start_at)
);
create index if not exists announcements_live_idx on public.announcements (start_at, end_at) where status = 'published';
create index if not exists announcements_status_idx on public.announcements (status, created_at desc);
drop trigger if exists announcements_defaults on public.announcements;
create trigger announcements_defaults before insert or update on public.announcements
  for each row execute function public.tg_announcements_defaults();

-- ========== 5) الصلاحيات + RLS ==========
revoke all on public.news, public.announcements from anon, authenticated;
grant select on public.news, public.announcements to anon;
grant select, insert, update, delete on public.news, public.announcements to authenticated;
alter table public.news enable row level security;
alter table public.announcements enable row level security;

drop policy if exists news_public_read on public.news;
create policy news_public_read on public.news for select to anon, authenticated
  using (status = 'published' and published_at <= now());
drop policy if exists news_admin_all on public.news;
create policy news_admin_all on public.news for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements for select to anon, authenticated
  using (status = 'published' and (start_at is null or start_at <= now()) and (end_at is null or end_at > now()));
drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ========== 6) تنظيف ==========
-- الدالة المشتركة القديمة (إن كان الإصدار السابق قد نُفِّذ). تُحذف بعد استبدال الـ triggers أعلاه.
drop function if exists public.tg_content_defaults();
