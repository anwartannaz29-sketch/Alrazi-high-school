-- rls_checks_institution.sql — يدويًا في SQL Editor بعد 004 (transaction ثم rollback). لم يُنفَّذ آليًا.
begin;
  insert into public.school_statistics (kind,label,value,status,official_confirmed) values ('students','t-pub',10,'published',true),('classes','t-draft',2,'draft',false);
  insert into public.school_classes (level,name,status) values ('L','c-pub','published'),('L','c-draft','draft'),('L','c-arch','archived');
  insert into public.staff_profiles (full_name,category_id,consent_confirmed,status) select 's-pub', id, true, 'published' from public.staff_categories limit 1;
  insert into public.staff_profiles (full_name,status) values ('s-draft','draft');
  set local role anon;
  select 'anon sees only published stats (expect 1)' as test, count(*) from public.school_statistics;
  select 'anon sees only published classes (expect 1)' as test, count(*) from public.school_classes;
  select 'anon sees only published staff (expect 1)' as test, count(*) from public.staff_profiles;
  -- يجب أن تفشل (permission denied): insert into public.staff_profiles (full_name) values ('x');  update public.school_classes set name='x';
  reset role;
  -- يجب أن يفشل (check): نشر ملف بلا موافقة
  -- insert into public.staff_profiles (full_name,status,category_id) select 'bad','published',id from public.staff_categories limit 1;
  -- يجب أن يفشل (check): نشر إحصائية غير مؤكدة
  -- insert into public.school_statistics (label,value,status) values ('bad',1,'published');
rollback;
