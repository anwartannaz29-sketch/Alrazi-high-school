-- 002_cms_timetable.sql — نظام استعمال الزمن + أقسام المحتوى + إعدادات الموقع + تخزين الملفات
-- إضافي فقط: لا يعدّل ولا يحذف جداول أو سياسات 001. آمن لإعادة التشغيل. التراجع: supabase/rollbacks/002_rollback.sql
-- يتطلب تنفيذ 001_initial_schema.sql أولًا (admin_users + is_admin()).
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'نفّذ 001_initial_schema.sql أولًا (الدالة is_admin() غير موجودة).';
  end if;
end $$;

-- ================= دالة مشتركة للطوابع =================
create or replace function public.tg_base_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := auth.uid();
  else new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;

-- ================= استعمال الزمن =================
-- days: أرقام الأيام ISO (1=الاثنين … 7=الأحد). لكل جدول شبكة حصصه الخاصة (أوقات واستراحات).
create table if not exists public.timetables (
  id           uuid primary key default gen_random_uuid(),
  school_year  text not null check (school_year ~ '^\d{4}-\d{4}$'),
  level        text not null check (char_length(btrim(level)) between 1 and 60),
  class_name   text not null check (char_length(btrim(class_name)) between 1 and 60),
  days         smallint[] not null default '{1,2,3,4,5,6}' check (days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(days) between 1 and 7),
  notes        text check (char_length(notes) <= 1000),
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);
create unique index if not exists timetables_one_published on public.timetables (school_year, level, class_name) where status = 'published';
create index if not exists timetables_lookup on public.timetables (status, school_year, level, class_name);

create or replace function public.tg_timetables()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := auth.uid();
  else new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now();
  new.level := btrim(new.level); new.class_name := btrim(new.class_name);
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists timetables_defaults on public.timetables;
create trigger timetables_defaults before insert or update on public.timetables for each row execute function public.tg_timetables();

create table if not exists public.timetable_periods (
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  slot_no      smallint not null check (slot_no between 1 and 20),
  label        text check (char_length(label) <= 40),
  starts_at    time not null,
  ends_at      time not null,
  is_break     boolean not null default false,
  primary key (timetable_id, slot_no),
  constraint period_time_order check (ends_at > starts_at)
);
-- التداخل يُفحص عند نهاية العملية (constraint trigger مؤجَّل) كي تنجح تعديلات أوقات عدة حصص دفعة واحدة.
create or replace function public.tg_period_overlap()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.timetable_periods p where p.timetable_id = new.timetable_id and p.slot_no <> new.slot_no and p.starts_at < new.ends_at and new.starts_at < p.ends_at) then
    raise exception 'الحصص متداخلة زمنيًا' using errcode = '23514';
  end if;
  return null;
end $$;
-- لا يمكن تحويل حصة فيها مادة إلى استراحة (تُنشأ الدالة هنا وتشير إلى الجدول التالي عند التنفيذ فقط)
create or replace function public.tg_period_break_guard()
returns trigger language plpgsql as $$
begin
  if new.is_break and not old.is_break and exists (select 1 from public.timetable_entries e where e.timetable_id = new.timetable_id and e.slot_no = new.slot_no) then
    raise exception 'لا يمكن جعل حصة تحتوي مادة استراحة' using errcode = '23514';
  end if;
  return new;
end $$;

create table if not exists public.timetable_entries (
  timetable_id uuid not null,
  day          smallint not null check (day between 1 and 7),
  slot_no      smallint not null,
  subject      text not null check (char_length(btrim(subject)) between 1 and 80),
  teacher_name text check (char_length(teacher_name) <= 100),
  room         text check (char_length(room) <= 40),
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (timetable_id, day, slot_no),
  foreign key (timetable_id, slot_no) references public.timetable_periods(timetable_id, slot_no) on update cascade on delete cascade
);
create index if not exists timetable_entries_teacher on public.timetable_entries (lower(teacher_name)) where teacher_name is not null;

drop trigger if exists period_checks on public.timetable_periods;
drop trigger if exists period_overlap on public.timetable_periods;
create constraint trigger period_overlap after insert or update on public.timetable_periods deferrable initially deferred for each row execute function public.tg_period_overlap();
drop trigger if exists period_break_guard on public.timetable_periods;
create trigger period_break_guard before update on public.timetable_periods for each row execute function public.tg_period_break_guard();

create or replace function public.tg_entry_checks()
returns trigger language plpgsql as $$
declare per public.timetable_periods; tt public.timetables;
begin
  select * into per from public.timetable_periods where timetable_id = new.timetable_id and slot_no = new.slot_no;
  if per.is_break then raise exception 'لا يمكن وضع مادة في فترة استراحة' using errcode = '23514'; end if;
  select * into tt from public.timetables where id = new.timetable_id;
  if not (new.day = any(tt.days)) then raise exception 'اليوم غير ضمن أيام الدراسة لهذا الجدول' using errcode = '23514'; end if;
  new.subject := btrim(new.subject); new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists entry_checks on public.timetable_entries;
create trigger entry_checks before insert or update on public.timetable_entries for each row execute function public.tg_entry_checks();

-- عند حذف يوم من أيام الجدول تُحذف حصصه
create or replace function public.tg_timetable_days()
returns trigger language plpgsql as $$
begin
  if new.days is distinct from old.days then
    delete from public.timetable_entries where timetable_id = new.id and not (day = any(new.days));
  end if;
  return null;
end $$;
drop trigger if exists timetable_days on public.timetables;
create trigger timetable_days after update of days on public.timetables for each row execute function public.tg_timetable_days();

-- نشر ذري: يؤرشف المنشور السابق لنفس (السنة، المستوى، القسم) وينشر الجدول. للمسؤول فقط.
create or replace function public.publish_timetable(p_id uuid)
returns public.timetables language plpgsql security definer set search_path = public as $$
declare t public.timetables;
begin
  if not public.is_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select * into t from public.timetables where id = p_id for update;
  if not found then raise exception 'الجدول غير موجود' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.timetable_entries where timetable_id = p_id) then
    raise exception 'لا يمكن نشر جدول بلا حصص' using errcode = '23514';
  end if;
  update public.timetables set status = 'archived' where school_year = t.school_year and level = t.level and class_name = t.class_name and status = 'published' and id <> p_id;
  update public.timetables set status = 'published', published_at = now() where id = p_id returning * into t;
  return t;
end $$;
revoke all on function public.publish_timetable(uuid) from public, anon;
grant execute on function public.publish_timetable(uuid) to authenticated;

-- تعارضات الأستاذ/القاعة مع جداول أخرى (غير مؤرشفة) في نفس السنة واليوم والوقت. للمسؤول فقط. للتنبيه لا للمنع.
create or replace function public.timetable_conflicts(p_id uuid)
returns table (kind text, c_day smallint, c_slot smallint, c_level text, c_class text, c_value text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return query
  with me as (
    select e.day d, e.slot_no s, e.teacher_name tn, e.room rm, p.starts_at a, p.ends_at b, t.school_year y
    from public.timetable_entries e join public.timetable_periods p on p.timetable_id = e.timetable_id and p.slot_no = e.slot_no
    join public.timetables t on t.id = e.timetable_id where e.timetable_id = p_id),
  oth as (
    select e.day d, e.teacher_name tn, e.room rm, p.starts_at a, p.ends_at b, t.school_year y, t.level lv, t.class_name cn
    from public.timetable_entries e join public.timetable_periods p on p.timetable_id = e.timetable_id and p.slot_no = e.slot_no
    join public.timetables t on t.id = e.timetable_id where e.timetable_id <> p_id and t.status <> 'archived')
  select 'teacher'::text, me.d, me.s, oth.lv, oth.cn, me.tn from me join oth on oth.y = me.y and oth.d = me.d and oth.a < me.b and me.a < oth.b
    where nullif(btrim(me.tn), '') is not null and lower(btrim(oth.tn)) = lower(btrim(me.tn))
  union all
  select 'room'::text, me.d, me.s, oth.lv, oth.cn, me.rm from me join oth on oth.y = me.y and oth.d = me.d and oth.a < me.b and me.a < oth.b
    where nullif(btrim(me.rm), '') is not null and lower(btrim(oth.rm)) = lower(btrim(me.rm));
end $$;
revoke all on function public.timetable_conflicts(uuid) from public, anon;
grant execute on function public.timetable_conflicts(uuid) to authenticated;

-- ================= أقسام المحتوى =================
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  subject text check (char_length(subject) <= 80), role text check (char_length(role) <= 80),
  photo_url text, sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  level text not null check (char_length(btrim(level)) between 1 and 60),
  subject text check (char_length(subject) <= 80), unit text check (char_length(unit) <= 120),
  kind text not null default 'درس' check (kind in ('درس','تمرين','فرض','ملخص','وثيقة','أخرى')),
  file_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
  constraint resources_published_has_file check (status <> 'published' or file_url is not null)
);
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text check (char_length(title) <= 200),
  category text not null default 'المؤسسة' check (category in ('المؤسسة','أنشطة','رياضة','ثقافة','احتفالات','مسابقات')),
  image_url text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  icon text not null default 'users' check (icon in ('book','ball','leaf','palette','flask','users','trophy','star')),
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'مشاركات' check (kind in ('جوائز','مسابقات','نتائج','مشاريع','تكريمات','مشاركات')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 2000), achieved_on date, image_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'ثقافية' check (kind in ('ثقافية','رياضية','علمية','بيئية','فنية','مسابقات')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 1000),
  sort_order int not null default 0 check (sort_order between -9999 and 9999),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);

-- https فقط لروابط الصور/الملفات (يشمل روابط Supabase Storage)
do $$
declare r record;
begin
  for r in select * from (values ('teachers','photo_url'),('resources','file_url'),('gallery_items','image_url'),('achievements','image_url')) v(t, c) loop
    execute format('alter table public.%I drop constraint if exists %I', r.t, r.t || '_' || r.c || '_https');
    execute format('alter table public.%I add constraint %I check (%I is null or (%I ~* ''^https://[^\s"''''<>]+$'' and char_length(%I) <= 2000))', r.t, r.t || '_' || r.c || '_https', r.c, r.c, r.c);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teachers','resources','gallery_items','clubs','achievements','activities'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_defaults', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_base_defaults()', t || '_defaults', t);
    execute format('create index if not exists %I on public.%I (status, created_at desc)', t || '_status_idx', t);
  end loop;
end $$;

-- ================= إعدادات الموقع (مفاتيح مسموحة فقط) =================
create table if not exists public.site_settings (
  key text primary key check (key in ('phone','email','address','facebook','instagram','youtube','website','maps_embed_url','about_text')),
  value text not null check (char_length(value) <= 4000),
  updated_at timestamptz not null default now()
);
create or replace function public.tg_site_settings()
returns trigger language plpgsql as $$
begin
  new.value := btrim(new.value); new.updated_at := now();
  if new.key in ('facebook','instagram','youtube','website','maps_embed_url') and new.value !~* '^https://[^\s"''<>]+$' then raise exception 'الرابط يجب أن يبدأ بـ https://' using errcode = '23514'; end if;
  if new.key = 'email' and new.value !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'بريد إلكتروني غير صالح' using errcode = '23514'; end if;
  if new.key = 'phone' and new.value !~ '^[0-9+()\s.-]{6,25}$' then raise exception 'رقم هاتف غير صالح' using errcode = '23514'; end if;
  return new;
end $$;
drop trigger if exists site_settings_check on public.site_settings;
create trigger site_settings_check before insert or update on public.site_settings for each row execute function public.tg_site_settings();

-- ================= الصلاحيات + RLS =================
do $$
declare t text;
begin
  foreach t in array array['timetables','timetable_periods','timetable_entries','teachers','resources','gallery_items','clubs','achievements','activities','site_settings'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
  foreach t in array array['teachers','resources','gallery_items','clubs','achievements','activities'] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (status = ''published'')', t || '_public_read', t);
  end loop;
end $$;
drop policy if exists timetables_public_read on public.timetables;
create policy timetables_public_read on public.timetables for select to anon, authenticated using (status = 'published');
drop policy if exists timetable_periods_public_read on public.timetable_periods;
create policy timetable_periods_public_read on public.timetable_periods for select to anon, authenticated
  using (exists (select 1 from public.timetables t where t.id = timetable_id and t.status = 'published'));
drop policy if exists timetable_entries_public_read on public.timetable_entries;
create policy timetable_entries_public_read on public.timetable_entries for select to anon, authenticated
  using (exists (select 1 from public.timetables t where t.id = timetable_id and t.status = 'published'));
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select to anon, authenticated using (true);

-- ================= تخزين الصور والملفات =================
-- حاوية عامة للقراءة؛ الكتابة/الحذف للمسؤول فقط؛ الأنواع والحجم مقيّدة في الحاوية نفسها (10MB).
do $$
begin
  if to_regclass('storage.buckets') is null then raise notice 'storage غير متوفر: أنشئ الحاوية media يدويًا'; return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
  on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists media_admin_insert on storage.objects;
  create policy media_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
  drop policy if exists media_admin_update on storage.objects;
  create policy media_admin_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
  drop policy if exists media_admin_delete on storage.objects;
  create policy media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
end $$;
