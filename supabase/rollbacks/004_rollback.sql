-- 004_rollback.sql — يدويًا فقط. يحذف جداول 004 وبياناتها (خذ نسخة CSV قبل ذلك). لا يمس 001/002/003.
-- حاوية staff-photos وملفاتها لا تُحذف من SQL (احذفها من Storage يدويًا إن أردت).
drop policy if exists staff_photos_select on storage.objects;
drop policy if exists staff_photos_admin_insert on storage.objects;
drop policy if exists staff_photos_admin_delete on storage.objects;
drop table if exists public.staff_profiles, public.staff_categories, public.school_classes, public.school_statistics cascade;
