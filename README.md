# موقع الرازي V3.1
- محليًا: `python -m http.server 8000`. بدون إعدادات تظهر حالات فارغة. للتجربة: ملف `.env` فيه `RAZI_DEMO=1` ثم `node scripts/build-config.js`.
- النشر: يتطلب `SUPABASE_URL` و`SUPABASE_ANON_KEY` في Vercel وإلا يفشل البناء (عمدًا). التفاصيل: docs/ADMIN_SETUP.md
- الاختبارات: `node tests/build.test.js` · `python tests/e2e.py` · `node tests/supabase.integration.mjs` (مشروع Supabase اختباري)
- نتائج التدقيق: docs/AUDIT_V3.1.md
