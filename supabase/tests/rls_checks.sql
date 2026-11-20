-- rls_checks.sql — يُنفَّذ يدويًا في SQL Editor بعد الترحيل (لم يُنفَّذ آليًا في هذا المستودع).
-- كل فحص يجب أن يعطي النتيجة المكتوبة. يتم داخل transaction ثم rollback فلا يبقى شيء.
begin;
  -- بيانات اختبار (بدور postgres)
  insert into public.news (title, status) values ('t-draft','draft'), ('t-pub','published'), ('t-arch','archived');
  insert into public.announcements (title, status, end_at) values ('a-pub','published', now() + interval '1 day'), ('a-expired','published', now() - interval '1 day'), ('a-draft','draft', null);

  set local role anon;
  select 'anon: published news only (expect 1)' as test, count(*) from public.news;
  select 'anon: live announcements only (expect 1)' as test, count(*) from public.announcements;
  -- select * from public.admin_users;   -- فكّ التعليق: يجب أن يفشل
  -- insert into public.news (title) values ('x');   -- يجب أن يفشل: permission denied

  reset role;
  -- مستخدم عادي (ليس في admin_users): غيّر UUID إلى أي مستخدم غير مسؤول
  -- select set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
  -- set local role authenticated;
  -- insert into public.news (title) values ('x');   -- يجب أن يفشل: violates row-level security
  -- select count(*) from public.news;               -- يجب أن يعطي 1 فقط (المنشور)
rollback;
