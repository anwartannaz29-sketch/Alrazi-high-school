-- 002_rollback.sql — يُنفَّذ يدويًا فقط عند الحاجة. يحذف ما أضافه 002 (وبياناته!). لا يمس 001 (news / announcements / admin_users).
-- خذ نسخة احتياطية (Export CSV) قبل التنفيذ.
drop function if exists public.publish_timetable(uuid);
drop function if exists public.timetable_conflicts(uuid);
drop table if exists public.timetable_entries, public.timetable_periods, public.timetables cascade;
drop table if exists public.teachers, public.resources, public.gallery_items, public.clubs, public.achievements, public.activities, public.site_settings cascade;
drop function if exists public.tg_timetables(), public.tg_period_checks(), public.tg_period_overlap(), public.tg_period_break_guard(), public.tg_entry_checks(), public.tg_timetable_days(), public.tg_site_settings(), public.tg_base_defaults();
-- الحاوية media والملفات المرفوعة: احذفها من لوحة Supabase ← Storage إن أردت.
