/* data/resources.js — Model: Resource { id, levelId, subject, unit, title, type, file (مسار PDF|null), date }
   المسار: المستوى ← المادة ← الوحدة ← المورد ← PDF.  TODO: ضع الملفات في assets/files/ وأدخل المسار في file. */
RAZI.resourceTypes = ["درس", "تمرين", "فرض", "ملخص", "وثيقة", "PDF"];
RAZI.resources = (() => {
  const out = []; let i = 0;
  RAZI.schedule.levels.forEach(l => RAZI.subjects.forEach(s => ["درس", "تمرين", "فرض"].forEach((t, k) =>
    out.push({ id: "r" + (++i), status: "published", levelId: l.id, subject: s, unit: "الوحدة 1 (تجريبية)", title: `${t} تجريبي – ${s}`, type: t, file: null, date: D(k + i % 7), demo: true }))));
  return out;
})();
