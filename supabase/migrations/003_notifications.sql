-- 003_notifications.sql — مركز إشعارات الرازي (RAZI NOTIFICATIONS). إضافي بالكامل: لا يعدّل 001 ولا 002 (إلا بإضافة عمود notify إلى announcements).
-- يُنفَّذ يدويًا في Supabase → SQL Editor. آمن لإعادة التشغيل (if not exists / create or replace / drop policy if exists).
-- يعتمد على public.is_admin() من 001 وعلى جداول news / announcements / timetables / resources.

-- ========== 1) جدول الإشعارات (قراءة عامة للمنشور الفعّال غير المنتهي فقط) ==========
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  summary     text check (char_length(summary) <= 500),
  title_fr    text check (char_length(title_fr) <= 200),
  summary_fr  text check (char_length(summary_fr) <= 500),
  category    text not null default 'general' check (category in ('announcement','news','timetable','resource','activity','general')),
  priority    text not null default 'normal' check (priority in ('normal','high','urgent')),
  -- وجهة داخلية معروفة أو رابط https موثوق فقط
  target_url  text not null default 'index.html' check (
    target_url ~ '^(index|about|privacy|assistant|notifications)\.html(#[a-z0-9-]{1,40})?$' or target_url ~ '^https://[^\s<>"'']{4,500}$'),
  status      text not null default 'draft' check (status in ('draft','published','archived')),
  publish_at  timestamptz not null default now(),           -- يمكن جدولته مستقبلًا
  expires_at  timestamptz,
  source_type text check (source_type in ('announcement','news','timetable','resource')),
  source_id   uuid,
  push_sent_at timestamptz,                                  -- يُضبط فقط عبر admin_claim_push (حارس عدم التكرار)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  constraint notifications_period_valid check (expires_at is null or expires_at > publish_at),
  constraint notifications_source_pair check ((source_type is null) = (source_id is null))
);
-- إشعار واحد فقط لكل سجل مصدر: تعديل السجل المنشور أو إعادة نشره لا يُنتج إشعارًا ثانيًا
create unique index if not exists notifications_source_once on public.notifications (source_type, source_id) where source_type is not null;
create index if not exists notifications_feed on public.notifications (status, publish_at desc);

create or replace function public.tg_notifications_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.push_sent_at := null;
  else
    new.created_at := old.created_at; new.created_by := old.created_by;
    if coalesce(current_setting('razi.push_claim', true), '') <> '1' then new.push_sent_at := old.push_sent_at; end if;   -- لا تعديل مباشر لحارس الـ Push
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists notifications_defaults on public.notifications;
create trigger notifications_defaults before insert or update on public.notifications for each row execute function public.tg_notifications_defaults();

alter table public.notifications enable row level security;
drop policy if exists notifications_public_read on public.notifications;
create policy notifications_public_read on public.notifications for select to anon, authenticated
  using (status = 'published' and publish_at <= now() and (expires_at is null or expires_at > now()));
drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to anon;
grant select, insert, update, delete on public.notifications to authenticated;   -- القيود الفعلية في RLS (is_admin)

-- ========== 2) اشتراكات Web Push (خاصة تمامًا: لا سياسة قراءة لأي دور) ==========
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique check (char_length(endpoint) <= 2048 and endpoint ~ '^https://[^\s]{10,}$'),
  p256dh       text not null check (p256dh ~ '^[A-Za-z0-9_-]{20,200}$'),
  auth         text not null check (auth ~ '^[A-Za-z0-9_-]{10,64}$'),
  lang         text not null default 'ar' check (lang in ('ar','fr')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;      -- بلا أي policy ⇒ لا قراءة ولا كتابة مباشرة لأي دور عميل
revoke all on public.push_subscriptions from anon, authenticated;

-- ========== 3) دوال محكومة (security definer) ==========
-- تسجيل اشتراك: تحقق صارم (يتولاه CHECK أيضًا) + سقف إجمالي. المتصفح يمر عبر /api/push-subscription (يتحقق ويحدّ الطلبات).
-- ملاحظة صريحة: الدالة قابلة للاستدعاء بمفتاح anon مباشرة (بدون service-role لا يمكن حصرها بالخادم)؛ الحماية: قيود CHECK + سقف 20000 + لا قراءة/تعديل لاشتراك غيرك.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'ar')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lang is null or p_lang not in ('ar','fr') then p_lang := 'ar'; end if;
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint)
     and (select count(*) from public.push_subscriptions) >= 20000 then raise exception 'subscription_limit'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, lang) values (p_endpoint, p_p256dh, p_auth, p_lang)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, last_seen_at = now();
end $$;

-- إلغاء اشتراك: يملك الصلاحية من يعرف رابط endpoint الخاص به (سرّ عشوائي طويل)؛ لا يمكن حذف اشتراك الغير دون معرفته.
create or replace function public.remove_push_subscription(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.push_subscriptions where endpoint = p_endpoint; get diagnostics n = row_count; return n > 0;
end $$;

-- عدد الاشتراكات (للمشرف فقط)
create or replace function public.admin_push_count()
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::int from public.push_subscriptions);
end $$;

-- «حجز» الإرسال لإشعار: ينجح مرة واحدة فقط لكل إشعار منشور فعّال (idempotency). يعيد بيانات الإشعار أو null إن سبق الإرسال/غير صالح.
create or replace function public.admin_claim_push(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.notifications;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('razi.push_claim', '1', true);
  update public.notifications set push_sent_at = now()
   where id = p_id and status = 'published' and push_sent_at is null and publish_at <= now() and (expires_at is null or expires_at > now())
   returning * into r;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'title', r.title, 'summary', r.summary, 'title_fr', r.title_fr, 'summary_fr', r.summary_fr, 'target_url', r.target_url, 'priority', r.priority);
end $$;

-- إلغاء الحجز عند فشل كامل (0 وصول) للسماح بإعادة محاولة صريحة من المشرف
create or replace function public.admin_unclaim_push(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('razi.push_claim', '1', true);
  update public.notifications set push_sent_at = null where id = p_id;
end $$;

-- قائمة الاشتراكات للإرسال + حذف المنتهية (للمشرف فقط)
create or replace function public.admin_list_push_subscriptions(p_limit integer default 3000)
returns table (id uuid, endpoint text, p256dh text, auth text, lang text) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select s.id, s.endpoint, s.p256dh, s.auth, s.lang from public.push_subscriptions s order by s.created_at limit least(greatest(p_limit, 1), 5000);
end $$;
create or replace function public.admin_prune_push_subscriptions(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.push_subscriptions where id = any(p_ids); get diagnostics n = row_count; return n;
end $$;

revoke all on function public.register_push_subscription(text,text,text,text), public.remove_push_subscription(text), public.admin_push_count(),
  public.admin_claim_push(uuid), public.admin_unclaim_push(uuid), public.admin_list_push_subscriptions(integer), public.admin_prune_push_subscriptions(uuid[]) from public;
grant execute on function public.register_push_subscription(text,text,text,text), public.remove_push_subscription(text) to anon, authenticated;
grant execute on function public.admin_push_count(), public.admin_claim_push(uuid), public.admin_unclaim_push(uuid), public.admin_list_push_subscriptions(integer), public.admin_prune_push_subscriptions(uuid[]) to authenticated;

-- ========== 4) إنشاء إشعارات تلقائية عند «حدث نشر» فقط ==========
-- إعلان: عمود اختياري لإيقاف الإشعار لإعلان معيّن (الافتراضي: نعم)
alter table public.announcements add column if not exists notify boolean not null default true;

create or replace function public.tg_notify_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0]; v_title text; v_sum text; v_tfr text; v_sfr text; v_cat text; v_pri text := 'normal'; v_url text; v_pub timestamptz := now(); v_exp timestamptz;
begin
  if new.status is distinct from 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;   -- تعديل سجل منشور: لا إشعار
  if k = 'announcement' then
    if not new.notify then return new; end if;
    v_title := new.title; v_sum := left(new.content, 200); v_cat := 'announcement'; v_url := 'index.html#announcements';
    if new.pinned or new.type in ('تنبيه','تغيير') then v_pri := 'high'; end if;
    v_pub := coalesce(new.start_at, now()); v_exp := new.end_at;
  elsif k = 'news' then
    v_title := new.title; v_sum := coalesce(nullif(new.excerpt, ''), left(new.content, 200)); v_cat := 'news'; v_url := 'index.html#news';
    if new.featured then v_pri := 'high'; end if;
    v_pub := coalesce(new.published_at, now());
  elsif k = 'timetable' then
    v_title := 'تحديث استعمال الزمن: ' || new.level || ' ' || new.class_name; v_sum := 'تم نشر استعمال الزمن للموسم ' || new.school_year;
    v_tfr := 'Emploi du temps mis à jour : ' || new.level || ' ' || new.class_name; v_sfr := 'Emploi du temps publié pour l''année ' || new.school_year;
    v_cat := 'timetable'; v_url := 'index.html#schedule';
  elsif k = 'resource' then
    v_title := 'مورد جديد: ' || new.title; v_sum := new.level || coalesce(' · ' || new.subject, ''); v_cat := 'resource'; v_url := 'index.html#resources';
    v_tfr := 'Nouvelle ressource : ' || new.title;
  else return new; end if;
  if v_exp is not null and v_exp <= v_pub then return new; end if;
  insert into public.notifications (title, summary, title_fr, summary_fr, category, priority, target_url, status, publish_at, expires_at, source_type, source_id)
  values (left(v_title, 200), nullif(v_sum, ''), left(v_tfr, 200), left(v_sfr, 500), v_cat, v_pri, v_url, 'published', v_pub, v_exp, k, new.id)
  on conflict (source_type, source_id) where source_type is not null do nothing;
  return new;
end $$;
drop trigger if exists notify_announcements on public.announcements;
create trigger notify_announcements after insert or update of status on public.announcements for each row execute function public.tg_notify_source('announcement');
drop trigger if exists notify_news on public.news;
create trigger notify_news after insert or update of status on public.news for each row execute function public.tg_notify_source('news');
drop trigger if exists notify_timetables on public.timetables;
create trigger notify_timetables after insert or update of status on public.timetables for each row execute function public.tg_notify_source('timetable');
drop trigger if exists notify_resources on public.resources;
create trigger notify_resources after insert or update of status on public.resources for each row execute function public.tg_notify_source('resource');
-- ملاحظة: لا يُرسَل Push تلقائيًا من هذه المشغّلات أبدًا؛ الإرسال قرار صريح من المشرف (api/push-send).
