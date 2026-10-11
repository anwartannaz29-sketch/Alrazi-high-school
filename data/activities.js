/* data/activities.js — الأنشطة، الأندية، الأحداث، الإنجازات، المرافق */
/* Model: Activity { id, kind, title, text, icon } */
RAZI.activities = [
  { id: "ac1", kind: "ثقافية", title: "الأنشطة الثقافية", icon: "book", text: "قراءة ومسرح وملتقيات فكرية.", demo: true },
  { id: "ac2", kind: "رياضية", title: "الأنشطة الرياضية", icon: "ball", text: "رياضات جماعية وفردية.", demo: true },
  { id: "ac3", kind: "علمية", title: "الأنشطة العلمية", icon: "flask", text: "تجارب ومشاريع علمية.", demo: true },
  { id: "ac4", kind: "بيئية", title: "الأنشطة البيئية", icon: "leaf", text: "حملات توعية ومبادرات بيئية.", demo: true },
  { id: "ac5", kind: "فنية", title: "الأنشطة الفنية", icon: "palette", text: "رسم وموسيقى وتعبير إبداعي.", demo: true },
  { id: "ac6", kind: "مسابقات", title: "المسابقات", icon: "trophy", text: "مسابقات داخلية وخارجية.", demo: true }
];
/* Model: Club { id, name, text, icon } — TODO: تأكيد أسماء الأندية رسميًا (الأسماء الحالية تجريبية) */
RAZI.clubs = [
  { id: "c1", name: "نادي البيئة", icon: "leaf", text: "وصف تجريبي.", demo: true },
  { id: "c2", name: "النادي الثقافي", icon: "book", text: "وصف تجريبي.", demo: true },
  { id: "c3", name: "النادي الرياضي", icon: "ball", text: "وصف تجريبي.", demo: true },
  { id: "c4", name: "النادي العلمي", icon: "flask", text: "وصف تجريبي.", demo: true },
  { id: "c5", name: "نادي المواطنة", icon: "users", text: "وصف تجريبي.", demo: true }
];
/* Model: Event { id, title, date, place } — لـ "أقرب نشاط" */
RAZI.events = [{ id: "e1", status: "published", title: "نشاط قادم (تجريبي)", date: D(-4), place: "المؤسسة", demo: true }];
/* Model: Achievement { id, kind, title, text, date, image } — TODO: لا تُنشر إلا بعد التوثيق الرسمي */
RAZI.achievementKinds = [
  { kind: "جوائز", icon: "trophy" }, { kind: "مسابقات", icon: "star" }, { kind: "نتائج", icon: "chart" },
  { kind: "مشاريع", icon: "flask" }, { kind: "تكريمات", icon: "award" }, { kind: "مشاركات", icon: "users" }
];
RAZI.achievements = [];
/* Model: Facility { id, name, text, image|null, confirmed } — TODO: تأكيد المرافق الموجودة فعلًا */
RAZI.facilities = [
  { id: "f1", name: "الساحة والأقسام", text: "ساحة المؤسسة وواجهة الأقسام.", image: "courtyard", confirmed: true },
  { id: "f2", name: "الحدائق", text: "فضاءات خضراء داخل المؤسسة.", image: "gardenHeart", confirmed: true },
  { id: "f3", name: "المكتبة", text: "قريبًا.", image: null, confirmed: false, demo: true },
  { id: "f4", name: "المختبرات", text: "قريبًا.", image: null, confirmed: false, demo: true },
  { id: "f5", name: "الملاعب", text: "قريبًا.", image: null, confirmed: false, demo: true },
  { id: "f6", name: "القاعات", text: "قريبًا.", image: null, confirmed: false, demo: true }
];
