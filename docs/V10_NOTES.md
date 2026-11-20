# V10 — ما تغيّر وما عليك فعله

## الاسم
`package.json` ← `razi-school-v10` / `10.0.0`. (اسم مشروع Vercel والمستودع لا يتغيران من الكود؛ غيّرهما يدويًا إن أردت من Settings.)

## 1) Web Push خارج الموقع والمتصفح
الأساس موجود من V8 (`service-worker.js`, `api/push-send.js`, `api/push-subscription.js`, ترحيل `003_notifications.sql`). في V10:
- مدة بقاء الرسالة لدى خدمة الـ Push صارت **7 أيام** (كانت يومًا): الجهاز المطفأ أو دون إنترنت يستلمها عند عودته.
- `pushsubscriptionchange` في الـ Service Worker: إعادة الاشتراك تلقائيًا إن بدّل المتصفح الاشتراك، فلا يتوقف الوصول بصمت.
- `manifest.webmanifest` فيه `id` وفئة تعليمية لتحسين التثبيت.

**شروط لا يتجاوزها الكود:** VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY وVAPID_SUBJECT في Vercel + تنفيذ الترحيل 003 + إعادة النشر.
أندرويد: يصل والمتصفح مغلق. iPhone: بعد «إضافة إلى الشاشة الرئيسية» فقط (iOS 16.4+). حاسوب: يلزم أن يكون المتصفح يعمل في الخلفية. المستخدم الذي رفض الإذن لا يصله شيء.

## 2) الظهور في البحث
`scripts/build-config.js` يولّد عند البناء (يلزم `SITE_URL` أو دومين Vercel الإنتاجي):
- `sitemap.xml` (4 صفحات عامة + lastmod) و`robots.txt` (يمنع /admin/ و/api/ ويشير للـ sitemap).
- `canonical` و`og:url` و`og:site_name` وJSON-LD من نوع WebSite، وتحويل `og:image` إلى رابط مطلق. المصدر يبقى نظيفًا (الحقن وقت البناء فقط).
- وسما التحقق `GOOGLE_SITE_VERIFICATION` و`BING_SITE_VERIFICATION` (اختياريان، يُنظَّفان).

**خطواتك بعد النشر:** 1) ضع `SITE_URL` (يُفضَّل دومين خاص) في Vercel وأعد النشر. 2) Google Search Console ← أضف الموقع ← تحقق (أو ضع الرمز في المتغير أعلاه) ← قدّم `/sitemap.xml`. 3) Bing Webmaster Tools بالمثل. الفهرسة تستغرق أيامًا إلى أسابيع ولا يضمنها أي كود.
ملاحظة: الأخبار والإعلانات تُحمَّل من Supabase بالجافاسكربت داخل الصفحة نفسها، ولا روابط مستقلة لكل خبر؛ لذلك الفهرسة تخص الصفحات الأربع فقط.

## الاختبارات (شُغّلت فعلًا)
build 31/31 · push 78/78 · assistant 47/47 · notifications-ui · assistant-ui 12/12 · design-lint · contrast ✔.
e2e وe2e_cms: نفس الإخفاقات تظهر على حزمة V8 الأصلية في هذه البيئة (ribbon وزر active وحذف المعرض/رفع الصورة)، لم يسببها V10 ولم أعالجها.
لم يُختبر: Push حقيقي، Supabase حي، Search Console.
