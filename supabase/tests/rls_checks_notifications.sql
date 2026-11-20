-- rls_checks_notifications.sql — يُنفَّذ يدويًا في SQL Editor بعد 003 (لم يُنفَّذ آليًا في هذا المستودع). transaction ثم rollback.
begin;
  insert into public.notifications (title, status, publish_at, expires_at) values
    ('n-pub','published', now() - interval '1 hour', null), ('n-draft','draft', now() - interval '1 hour', null),
    ('n-expired','published', now() - interval '2 days', now() - interval '1 day'), ('n-future','published', now() + interval '1 day', null),
    ('n-arch','archived', now() - interval '1 hour', null);
  insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/test-endpoint-1', repeat('A',43), repeat('B',22));

  set local role anon;
  select 'anon: only active published notifications (expect 1)' as test, count(*) from public.notifications;
  -- select * from public.push_subscriptions;                                 -- يجب أن يفشل: permission denied
  -- insert into public.notifications (title) values ('x');                   -- يجب أن يفشل: permission denied
  -- update public.notifications set title = 'x';                             -- يجب أن يفشل: permission denied
  -- select public.admin_push_count();                                        -- يجب أن يفشل: permission denied
  select 'anon: remove unknown endpoint → false' as test, public.remove_push_subscription('https://fcm.googleapis.com/fcm/send/nope');
  reset role;

  -- دور مسجّل لكنه ليس مشرفًا: غيّر UUID إلى مستخدم غير مسؤول
  -- select set_config('request.jwt.claims', '{"sub":"<NON_ADMIN_UUID>","role":"authenticated"}', true); set local role authenticated;
  -- select public.admin_claim_push((select id from public.notifications where title = 'n-pub'));   -- يجب أن يفشل: forbidden

  -- عدم التكرار: إعلان يُنشر ثم يُعدَّل ⇒ إشعار واحد فقط
  insert into public.announcements (title, status) values ('ann-1','draft');
  update public.announcements set status = 'published' where title = 'ann-1';
  update public.announcements set content = 'edited', status = 'published' where title = 'ann-1';
  update public.announcements set status = 'archived' where title = 'ann-1';
  update public.announcements set status = 'published' where title = 'ann-1';
  select 'one notification per announcement after publish/edit/republish (expect 1)' as test, count(*) from public.notifications where source_type = 'announcement' and title = 'ann-1';
  insert into public.announcements (title, status, notify) values ('ann-quiet','published', false);
  select 'announcement with notify=false creates none (expect 0)' as test, count(*) from public.notifications where title = 'ann-quiet';
rollback;
