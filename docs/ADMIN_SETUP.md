# دليل إعداد نظام إدارة الأخبار والإعلانات (V3)

> قواعد: لا تُرسل كلمات المرور أو المفاتيح السرية في أي محادثة أو ملف. مفتاح **anon** وحده يوضع في الموقع. **service_role** ممنوع تمامًا.
> أسماء القوائم في Supabase/Vercel قد تتغير قليلًا؛ اتبع المعنى.

## 1) إنشاء مشروع Supabase
1. supabase.com ← New project ← اختر الاسم والمنطقة وكلمة مرور قاعدة بيانات قوية (احفظها في مدير كلمات مرور).
2. من **Project Settings ← API** انسخ: **Project URL** و**anon / publishable key** (لا تنسخ service_role).

## 2) تنفيذ الترحيل
**SQL Editor ← New query** ← الصق محتوى `supabase/migrations/001_initial_schema.sql` ← Run.
ينشئ: `admin_users`، `news`، `announcements`، الفهارس، الـ triggers، وسياسات RLS. الترحيل آمن لإعادة التشغيل (حتى لو نفّذت نسخته الأولى: يستبدل الـ triggers المعطوبة ويحذف الدالة القديمة).

## 3) التحقق من RLS
- **Table Editor**: يجب أن يظهر RLS مفعّلًا على الجداول الثلاثة.
- نفّذ `supabase/tests/rls_checks.sql` (يعمل داخل transaction ويتراجع) وطابق النتائج المكتوبة فيه.
- فحص مباشر بمفتاح anon (استبدل القيم): 
  `curl "$SUPABASE_URL/rest/v1/news?select=title,status" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` ← يجب ألا يظهر أي سجل غير `published`.
  `curl -X POST "$SUPABASE_URL/rest/v1/news" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"title":"x"}'` ← يجب أن يفشل (permission denied).

## 4) حساب المسؤول الأول (بأمان)
1. **Authentication ← Sign In / Providers**: عطّل **Allow new users to sign up**. (حتى لو فُتح التسجيل خطأً، لن يملك أي مستخدم جديد صلاحية: الصلاحية مصدرها `admin_users` فقط.)
2. **Authentication ← Users ← Add user ← Create new user**: أدخل بريد المؤسسة وكلمة مرور قوية (تفعيل Auto Confirm).
3. امنحه الصلاحية من **SQL Editor** فقط (لا توجد واجهة أو API تسمح بذلك):
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'ADMIN_EMAIL_HERE';
```
لسحب الصلاحية: `delete from public.admin_users where user_id = '<uuid>';`

## 5) متغيرات البيئة
- **محليًا** (اختياري): انسخ `.env.example` إلى `.env` واملأ القيمتين، ثم `node scripts/build-config.js`. الملف `.env` مُتجاهَل في Git.
- **Vercel**: Project ← Settings ← Environment Variables: `SUPABASE_URL` و`SUPABASE_ANON_KEY` (Production وPreview). عند البناء يشغّل `vercel.json` الأمر `node scripts/build-config.js` فيولّد `js/config.js`. **يفشل البناء** (ولا يُنشر الموقع) إذا غاب أحد المتغيرين، أو كان المفتاح service_role/secret، أو وُجد `RAZI_DEMO=1`.
- إعدادات المشروع في Vercel: Framework = Other، Output Directory = `.` (موجودان في `vercel.json`).

## 5-ب) اختبار RLS الحقيقي (إلزامي قبل الإطلاق)
أنشئ مشروع Supabase **اختباريًا** (أو استعمل نفسه قبل إدخال محتوى حقيقي)، ثم من Authentication ← Add user أنشئ حسابين: مسؤولًا (أضفه إلى `admin_users`) ومستخدمًا عاديًا (لا تضفه). ثم من طرفيتك (القيم تبقى عندك):
```bash
export SUPABASE_URL=... SUPABASE_ANON_KEY=...
export TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=...
node tests/supabase.integration.mjs      # 30 فحصًا: زائر / مستخدم عادي / مسؤول
```
رمز الخروج 0 = نجح، 1 = فشل (لا تُطلق الموقع)، 2 = لم يُنفَّذ لنقص المتغيرات. السكربت ينظّف بياناته (عناوين تبدأ بـ `__rls_test__`).

## 6) العنوان والمسارات
- لوحة الإدارة: `https://دومين-الموقع/admin/` (و`/admin` يُحوَّل إليها عبر `trailingSlash`؛ لم يُتحقق من ذلك على Vercel الحقيقي). غير مفهرسة، مع CSP صارم، وجلستها في `sessionStorage` (تنتهي بإغلاق التبويب).
- Supabase ← Authentication ← URL Configuration: ضع Site URL = دومين الموقع.

## 7) النشر
```bash
git checkout -b v3-admin
git add . && git commit -m "V3: news & announcements admin (Supabase)"
git push origin v3-admin     # Vercel ينشئ رابط Preview للتجربة
```
جرّب رابط Preview أولًا، ثم ادمج في الفرع الرئيسي للنشر على الدومين الحالي.

## 8) الاختبار بعد النشر
1. افتح الموقع: لا ظهور لمحتوى تجريبي في الأخبار/الإعلانات (فارغة حتى تضيف).
2. `/admin/` يعرض تسجيل الدخول فقط؛ كلمة مرور خاطئة ← رسالة عامة.
3. سجّل الدخول ← أضف خبرًا كمسودة ← تأكد أنه لا يظهر في الموقع ← انشره ← يظهر.
4. أضف إعلانًا بفترة عرض منتهية ← لا يظهر.
5. جرّب من الهاتف. افتح Console: لا أخطاء.
6. شغّل فحوص §3 (curl) على الإنتاج.

## 9) الاستعادة
- **الموقع**: Vercel ← Deployments ← اختر النشر السابق ← Promote / Instant Rollback.
- **إيقاف الإدارة فورًا**: `delete from public.admin_users;` (يمنع كل الكتابة).
- **البيانات**: Supabase ← Database ← Backups (حسب الخطة). الترحيل إضافي؛ للتراجع الكامل:
  `drop table public.news, public.announcements, public.admin_users cascade; drop function public.is_admin(), public.tg_content_defaults();`
- نسخ احتياطي يدوي قبل أي تغيير كبير: Table Editor ← Export CSV.

## قرارات تصميم ومخاطر معروفة
- أُضيفت أعمدة فوق الحد الأدنى: `news.category/featured` و`announcements.type/pinned` لإبقاء البطاقات الحالية تعمل.
- لا واجهة خلفية إضافية: المتصفح يتحدث مع Supabase بمفتاح anon وRLS هي خط الدفاع. هذا هو التصميم القياسي في Supabase.
- جلسة المسؤول في localStorage: أي ثغرة XSS تكشفها. لذلك كل نص قادم من القاعدة يُهرَّب والمحتوى نص عادي (بلا HTML). يُنصح لاحقًا بإضافة Content-Security-Policy.
- الصور بروابط خارجية فقط (لا رفع ملفات بعد).
- محتوى الأخبار يُرسم بـ JavaScript (لا SEO كامل لصفحات الأخبار حتى الـ pre-rendering).
- حدود محاولات الدخول تعتمد على إعدادات Supabase Auth الافتراضية.
