/* data/schedule.js — Model: ScheduleEntry { levelId, classId, day, slot, subject, teacherId, room }
   TODO: المستويات والأقسام والتوقيت تجريبية. تُولَّد الحصص هنا آليًا للعرض فقط. */
(() => {
  const levels = [{ id: "tc", name: "الجذع المشترك" }, { id: "b1", name: "الأولى باكالوريا" }, { id: "b2", name: "الثانية باكالوريا" }];
  const classes = levels.flatMap(l => [1, 2].map(n => ({ id: `${l.id}-${n}`, levelId: l.id, name: `القسم ${n}` })));
  const days = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const slots = ["08:00 – 09:00", "09:00 – 10:00", "10:00 – 11:00", "11:00 – 12:00"].map((time, i) => ({ n: i + 1, time }));
  const subj = ["الرياضيات", "الفيزياء والكيمياء", "اللغة العربية", "اللغة الفرنسية"];
  const entries = [];
  classes.forEach((c, ci) => days.forEach((d, di) => slots.forEach((s, si) => {
    const k = (ci + di + si) % subj.length;
    entries.push({ levelId: c.levelId, classId: c.id, day: d, slot: s.n, subject: subj[k], teacherId: "t" + (k + 1), room: "قاعة " + (si + 1) });
  })));
  RAZI.schedule = { levels, classes, days, slots, entries, demo: true };
  RAZI.subjects = subj;
})();
