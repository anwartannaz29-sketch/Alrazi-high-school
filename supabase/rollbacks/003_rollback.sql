-- 003_rollback.sql — يُنفَّذ يدويًا فقط عند الحاجة. يحذف ما أضافه 003 (وبيانات الإشعارات والاشتراكات!). لا يمس 001 ولا 002 (عدا العمود notify).
-- خذ نسخة احتياطية (Export CSV) قبل التنفيذ.
drop trigger if exists notify_announcements on public.announcements;
drop trigger if exists notify_news on public.news;
drop trigger if exists notify_timetables on public.timetables;
drop trigger if exists notify_resources on public.resources;
drop function if exists public.tg_notify_source();
drop function if exists public.register_push_subscription(text,text,text,text), public.remove_push_subscription(text), public.admin_push_count(),
  public.admin_claim_push(uuid), public.admin_unclaim_push(uuid), public.admin_list_push_subscriptions(integer), public.admin_prune_push_subscriptions(uuid[]);
drop table if exists public.push_subscriptions cascade;
drop table if exists public.notifications cascade;
drop function if exists public.tg_notifications_defaults();
-- اختياري (يحذف العمود وقيم الإعلانات فيه):
-- alter table public.announcements drop column if exists notify;
