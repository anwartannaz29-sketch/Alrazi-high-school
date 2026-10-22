/* data/site.js — إعدادات الموقع، الصور، النصوص. يُحمّل أولًا. كل البيانات مجمّعة في window.RAZI */
window.RAZI = window.RAZI || {};
/* دالة مساعدة للبيانات التجريبية فقط: تاريخ قبل n يوم. TODO: احذفها عند إدخال تواريخ حقيقية */
const D = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

RAZI.site = {
  nameAr: "الثانوية التأهيلية الرازي", nameFr: "Lycée Qualifiant Al-Razi",
  city: "تارجيست", province: "إقليم الحسيمة", country: "المغرب",
  mapsLink: "https://maps.app.goo.gl/ifFLYfBmavofSJ8B9",
  mapsEmbed: null,   // TODO: src من Google Maps → مشاركة → تضمين خريطة
  phone: null,       // TODO: الهاتف الرسمي
  email: null,       // TODO: البريد الرسمي
  facebook: null,    // TODO: تأكيد رابط Facebook الرسمي
  website: null,     // TODO
  demoNotice: "بيانات تجريبية — سيتم استبدالها بمحتوى المؤسسة الرسمي"
};

/* نظام الصور: كل صورة تُعرَّف مرة واحدة هنا ثم تُستعمل بالمعرّف (id) في أي مكان.
   file → assets/images/{file}-{480|960|1600}.webp   |  mobile → نسخة مقصوصة للهاتف (اختياري)
   pos / posM → object-position لسطح المكتب / الهاتف   |  bg → لون التحميل */
RAZI.images = {
  entrance:  { file: "entrance",         alt: "المدخل الرئيسي للثانوية التأهيلية الرازي", w: 1600, h: 1200, bg: "#74838f", pos: "50% 55%" },
  courtyard: { file: "courtyard",        alt: "ساحة المؤسسة وواجهة الأقسام",             w: 1600, h: 1200, bg: "#5f6463", pos: "50% 40%" },
  gardenHeart: { file: "garden-heart",   alt: "حديقة المؤسسة ونافورة على شكل قلوب",       w: 1600, h: 1200, bg: "#8f9870", pos: "50% 60%", mobile: "hero-m" },
  gardenPink:  { file: "garden-pink-curb", alt: "حديقة المؤسسة وممرها المرصوف",            w: 1600, h: 1200, bg: "#76755f", pos: "50% 45%" }
};

RAZI.nav = [
  { id: "top", ar: "الرئيسية", fr: "Accueil", icon: "home" },
  { id: "about", ar: "المؤسسة", fr: "L'établissement", icon: "school" },
  { id: "news", ar: "الأخبار", fr: "Actualités", icon: "news" },
  { id: "life", ar: "الحياة المدرسية", fr: "Vie scolaire", icon: "star" },
  { id: "resources", ar: "الدروس والموارد", fr: "Cours et ressources", icon: "book" },
  { id: "schedule", ar: "استعمال الزمن", fr: "Emploi du temps", icon: "clock" },
  { id: "teachers", ar: "الأساتذة", fr: "Enseignants", icon: "users" },
  { id: "gallery", ar: "المعرض", fr: "Galerie", icon: "image" },
  { id: "contact", ar: "التواصل", fr: "Contact", icon: "pin" }
];
/* عناصر شريط الهاتف السفلي (الباقي في "المزيد") */
RAZI.bottomNav = ["top", "news", "resources", "schedule"];

/* TODO: ترجمة فرنسية كاملة لاحقًا. المفاتيح الناقصة تعود للعربية. */
RAZI.i18n = {
  ar: { heroTitle: "هنا تُبنى المعرفة، ويُصنع المستقبل", heroDesc: "الثانوية التأهيلية الرازي بتارجيست، فضاء للتعلّم والطموح وتنمية القدرات.", svcTitle: "الخدمات المدرسية", aboutMore: "اعرف أكثر عن المؤسسة", more: "المزيد", close: "إغلاق", heroKicker: "تارجيست · إقليم الحسيمة", heroTag: "فضاء للتعلم، الإبداع، والتميز", heroBtn1: "اكتشف مؤسستنا", heroBtn2: "الخدمات المدرسية", soon: "سيتم تحديث المعلومات قريبًا", readMore: "اقرأ المزيد", share: "مشاركة", copied: "تم نسخ الرابط", demo: "تجريبي" },
  fr: { heroTitle: "Ici se construit le savoir, ici se façonne l'avenir", heroDesc: "Lycée Qualifiant Al-Razi à Targuist, un espace d'apprentissage, d'ambition et de développement des compétences.", svcTitle: "Services scolaires", aboutMore: "En savoir plus sur l'établissement", more: "Plus", close: "Fermer", heroKicker: "Targuist · Province d'Al Hoceïma", heroTag: "Un espace d'apprentissage, de créativité et d'excellence", heroBtn1: "Découvrir notre établissement", heroBtn2: "Services scolaires", soon: "Informations bientôt disponibles", readMore: "Lire la suite", share: "Partager", copied: "Lien copié", demo: "Démo" }
};

/* إحصائيات المؤسسة — لا تُعرض إلا الأرقام الموثقة.
   Model: { label, value, source, confirmed: true }  — TODO: أضف فقط أرقامًا رسمية معتمدة (مثال: {label:"عدد الأقسام", value:..., source:"مذكرة رسمية", confirmed:true}) */
RAZI.stats = [];
