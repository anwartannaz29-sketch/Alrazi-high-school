-- 004_institution_profiles.sql — إحصائيات المؤسسة + الأقسام والمسالك + فئات وملفات الأطر + حاوية صور خاصة.
-- يُنفَّذ يدويًا في Supabase → SQL Editor (لم يُنفَّذ آليًا على قاعدتك). آمن لإعادة التشغيل. لا يعدّل 001/002/003 ولا يحذف أي بيانات.
-- يعتمد على: public.is_admin() (001) و public.tg_base_defaults() (002). جدول teachers القديم يبقى كما هو (يستعمله استعمال الزمن).

-- ================= إحصائيات المؤسسة (أرقام رسمية يدخلها المسؤول؛ لا تُحسب آليًا) =================
create table if not exists public.school_statistics (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'custom' check (kind in ('students','classes','staff','custom')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  label_fr text check (char_length(label_fr) <= 80),
  value integer not null check (value between 0 and 100000),
  as_of date check (as_of is null or as_of between date '2000-01-01' and date '2100-01-01'),
  official_confirmed boolean not null default false,
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint school_statistics_published_confirmed check (status <> 'published' or official_confirmed)
);
create unique index if not exists school_statistics_kind_uidx on public.school_statistics (kind) where kind <> 'custom' and status <> 'archived';

-- ================= الأقسام والمسالك =================
create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  level text not null check (char_length(btrim(level)) between 1 and 60),
  level_fr text check (char_length(level_fr) <= 60),
  track text check (char_length(track) <= 80),
  track_fr text check (char_length(track_fr) <= 80),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  name_fr text check (char_length(name_fr) <= 80),
  code text check (char_length(code) <= 20),
  description text check (char_length(description) <= 600),
  description_fr text check (char_length(description_fr) <= 600),
  students_count integer check (students_count is null or students_count between 0 and 500),
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index if not exists school_classes_level_name_uidx on public.school_classes (lower(btrim(level)), lower(btrim(name))) where status <> 'archived';

-- ================= فئات الأطر =================
create table if not exists public.staff_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  name_fr text check (char_length(name_fr) <= 60),
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index if not exists staff_categories_name_uidx on public.staff_categories (lower(btrim(name))) where status <> 'archived';
-- فئات هيكلية ذكرها طلب المشروع (ليست بيانات أشخاص). تُضاف مرة واحدة فقط إذا كان الجدول فارغًا، ويعدّلها المسؤول بحرية.
insert into public.staff_categories (name, name_fr, sort_order, status)
select v.n, v.f, v.o, 'published' from (values
  ('الإدارة التربوية','Administration pédagogique',10), ('الأطر التربوية','Personnel pédagogique',20),
  ('الأطر الإدارية','Personnel administratif',30), ('أطر الدعم','Personnel de soutien',40)) v(n,f,o)
where not exists (select 1 from public.staff_categories);

-- ================= ملفات الأطر =================
-- الصورة: مسار داخل الحاوية الخاصة staff-photos فقط ({id}/profile-{timestamp}.webp) — لا صور مضمّنة داخل القاعدة ولا رابط عام دائم.
create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  job_title text check (char_length(job_title) <= 100), job_title_fr text check (char_length(job_title_fr) <= 100),
  specialty text check (char_length(specialty) <= 100), specialty_fr text check (char_length(specialty_fr) <= 100),
  category_id uuid references public.staff_categories(id) on delete restrict,
  department text check (char_length(department) <= 100), department_fr text check (char_length(department_fr) <= 100),
  bio text check (char_length(bio) <= 1200), bio_fr text check (char_length(bio_fr) <= 1200),
  photo_path text,
  consent_confirmed boolean not null default false,
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint staff_photo_path_shape check (photo_path is null or photo_path ~ ('^' || id::text || '/profile-[0-9]{10,14}\.webp$')),
  constraint staff_published_consent check (status <> 'published' or consent_confirmed),
  constraint staff_published_has_category check (status <> 'published' or category_id is not null)
);
create index if not exists staff_profiles_category_idx on public.staff_profiles (category_id);

-- ================= طوابع + فهارس + RLS =================
do $$
declare t text;
begin
  foreach t in array array['school_statistics','school_classes','staff_categories','staff_profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_defaults', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_base_defaults()', t || '_defaults', t);
    execute format('create index if not exists %I on public.%I (status, sort_order)', t || '_status_sort_idx', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (status = ''published'')', t || '_public_read', t);
  end loop;
end $$;

-- ================= حاوية الصور الخاصة staff-photos =================
-- خاصة (public=false): لا رابط عام دائم. الزائر يحصل على روابط موقّعة قصيرة العمر فقط لصور الملفات المنشورة (سياسة SELECT أدناه).
-- الحاوية نفسها تفرض على الخادم: WebP فقط وحدّ 512KB (الهدف 100–180KB). الرفع/الحذف للمسؤول فقط ومسار الملف محكوم بنمط {uuid}/profile-{timestamp}.webp.
do $$
begin
  if to_regclass('storage.buckets') is null then raise notice 'storage غير متوفر: أنشئ الحاوية staff-photos يدويًا (خاصة، webp، 512KB)'; return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('staff-photos', 'staff-photos', false, 524288, array['image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 524288, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists staff_photos_select on storage.objects;
  create policy staff_photos_select on storage.objects for select to anon, authenticated using (
    bucket_id = 'staff-photos' and (public.is_admin() or exists (
      select 1 from public.staff_profiles p where p.status = 'published' and p.consent_confirmed and p.photo_path = storage.objects.name)));
  drop policy if exists staff_photos_admin_insert on storage.objects;
  create policy staff_photos_admin_insert on storage.objects for insert to authenticated with check (
    bucket_id = 'staff-photos' and public.is_admin() and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile-[0-9]{10,14}\.webp$');
  drop policy if exists staff_photos_admin_delete on storage.objects;
  create policy staff_photos_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'staff-photos' and public.is_admin());
  -- لا سياسة UPDATE عمدًا: الاستبدال = رفع ملف جديد بمسار جديد ثم حذف القديم بعد نجاح الحفظ.
end $$;
