# مساعد الرازي بواسطة Gemini — الإعداد والبنية

## البنية
`المتصفح → POST /api/assistant {question, lang} → (استرجاع من Supabase بمفتاح anon + RLS) → Gemini (REST من الخادم) → JSON موثَّق → المتصفح`

- `api/assistant.js`: التحقق من الطلب، الحدود، الاستدعاء، التحقق من المخرجات.
- `api/_lib/retrieve.js`: يستعلم عن المحتوى **المنشور فقط** (يرشّح `status=published` في الاستعلام ثم مرة أخرى في الكود فوق RLS)، بسياق مضغوط (≤ 6000 حرف).
- `api/_lib/prompt.js`: تعليمات النظام وصيغة JSON للمخرجات.
- الصيغة: نجاح `{success, answer, sources:[{label,url}], fallback}`؛ فشل `{success:false, code, message, fallback:true}` (الرسالة بلغة الزائر).

## متغيرات Vercel
| المتغير | مطلوب | ملاحظة |
|---|---|---|
| `GEMINI_API_KEY` | نعم (سرّي) | من Google AI Studio. لا يوضع إلا في Vercel. |
| `GEMINI_MODEL` | لا | الافتراضي `gemini-3.5-flash-lite` (تأكد من اسمه الحالي في وثائق Google وعدّله عند الحاجة) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | موجودان | نفسهما؛ مفتاح anon فقط، ويُرفض أي مفتاح سري |
| `ASSISTANT_RATE_LIMIT_PER_MIN`, `ASSISTANT_DAILY_LIMIT`, `ASSISTANT_ALLOWED_ORIGINS`, `GEMINI_MAX_OUTPUT_TOKENS` | لا | حدود وأصول إضافية؛ القيم الافتراضية 6/دقيقة/IP و400/يوم/نسخة |

الخطوات: Vercel ← Project ← Settings ← Environment Variables ← أضف `GEMINI_API_KEY` (Production وPreview) ← أعد النشر. لا تضعه في المستودع أو في `js/config.js`.

## الأمان والخصوصية
- المفتاح في ترويسة `x-goog-api-key` من الخادم فقط؛ لا يصل إلى HTML/JS/config/البناء.
- POST فقط، JSON فقط، جسم ≤ 4KB، سؤال ≤ 500 حرف، فحص Origin (نفس الدومين أو `ASSISTANT_ALLOWED_ORIGINS`)، مهلة Gemini 8 ثوانٍ، بلا إعادة محاولة تلقائية.
- لا تُرسل إلى النموذج: أسماء الأساتذة في الجداول، صور، روابط خريطة، بيانات الإدارة. أسماء الأساتذة (المنشورة) تُرسل فقط عند سؤال عن الأطر.
- لا يُسجَّل نص الأسئلة ولا تُخزَّن المحادثات.
- المخرجات: نص فقط، تُزال الوسوم، وتُحذف كل الروابط عدا روابط من سجلات منشورة (https).
- حدّ الطلبات في ذاكرة النسخة (best-effort في serverless؛ لحماية أقوى استعمل Vercel Firewall/Upstash). تذكّر أن حصص Gemini المجانية محدودة وقد تتغير.
- تنبيه للزوار: لا يُرسلون معلومات شخصية أو خاصة بالتلاميذ (يجب إظهاره في الواجهة).

## الاختبارات
`npm run test:ai` (محاكاة كاملة، لا تستهلك حصة). ضمن `npm run test:all`.
