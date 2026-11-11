# معمارية البوابة الرقمية — الرازي (V2)

## المبدأ
المؤسسة هي المصدر الرسمي الوحيد للمحتوى. لا يوجد نشر من الزوار.
- **ADMIN** (المؤسسة): إنشاء/تعديل/حذف: الأخبار، الإعلانات، الصور، الملفات، الدروس، استعمال الزمن، الأساتذة، المعرض.
- **VISITOR**: قراءة، مشاهدة، تحميل الملفات المسموحة، مشاركة. (Like/React اختياري لاحقًا، بدون منشورات ولا تعليقات حرة.)

## طبقات المشروع
- `data/*.js` المحتوى (ينتقل إلى قاعدة بيانات/CMS في V7)
- `js/app.js` الواجهة. تقرأ كل شيء عبر `api.list(name)` / `api.obj(name)` فقط. ← عند V7 غيّر محتوى `api` إلى `fetch('/api/...')` دون لمس باقي الكود.
- كل سجل قابل للنشر فيه `status: "published" | "draft"` وتُعرض المنشورات فقط.

## Models (الحقول المقترحة للقاعدة)
| Model | الحقول |
|---|---|
| User | id, name, email, role (ADMIN\|VISITOR), createdAt |
| News | id, status, featured, title, excerpt, body, date, category, image, authorId |
| Post | (عام) id, kind, status, title, body, date — يمكن أن تجمع News/Announcement لاحقًا |
| Announcement | id, status, pinned, type, title, body, date, file |
| Teacher | id, name, subject, role, photo |
| Schedule | levelId, classId, day, slot, subject, teacherId, room |
| Course/Resource | id, levelId, subject, unit, title, type, file, date |
| Activity | id, kind, title, text |
| Club | id, name, text |
| Achievement | id, kind, title, text, date, image (لا تُنشر إلا بعد التوثيق) |
| Gallery | id, category, image, caption |
| Image | id, file, alt, w, h, bg, pos, mobile |

## خارطة الطريق
V2 تصميم+Mobile+بنية المحتوى ← V3 الأخبار/الإعلانات/المعرض ← V4 الأساتذة+استعمال الزمن ← V5 الدروس والموارد ← V6 لوحة `/admin` ← V7 قاعدة بيانات+مصادقة+CMS ← V8/V9 المساعد الذكي.

## الاستعداد للمساعد الذكي (V8+)
المساعد يجيب فقط من محتوى `published` (الإعلانات، استعمال الزمن، الموارد، الأخبار) عبر `api`. لذلك تُبنى الفهرسة (search/embeddings) على نفس الـ Models أعلاه، ولا يُسمح له بمعلومات خارجها.

## ملاحظة SEO
محتوى الأقسام يُرسم بـ JavaScript. قبل الإطلاق الرسمي يُفضَّل Pre-rendering (مثلًا Astro/Vite SSG) في V3 ليراه محرك البحث.


## V8 — المساعد والـ Hero
- `js/assistant.js`: يقرأ المحتوى المنشور فقط (Supabase عند الإعداد، وإلا `RAZI.*` بحسب نفس قواعد `api.list`). نوايا بالكلمات المفتاحية (عربي/فرنسي) → إجابة + المصدر + أزرار تنقّل. لا يجيب خارج نطاق المؤسسة ولا يخترع بيانات. الاستبدال بـ RAG: عوّض `answer(q)` فقط.
- `js/hero.js`: طبقات State → Scene (هندسة الشريط) → Renderer (Canvas 2D) → DOM (متغيرات `--p` للنص والشعار). حلقة rAF واحدة وتتوقف خارج الرؤية.

## مساعد «دليل الرازي» — طبقة Gemini (V8+)
`js/assistant.js` يستدعي `POST /api/assistant` (دالة Vercel في `api/`) عند الإعداد الحي؛ تسترجع الدالة المحتوى **المنشور فقط** من Supabase بمفتاح anon ثم تسأل Gemini من الخادم. المفتاح `GEMINI_API_KEY` لا يصل للمتصفح. تبقى `answer()` المحلية احتياطًا عند تعذّر الخدمة. التفاصيل والإعداد: `docs/GEMINI_ASSISTANT.md`.
