/* data/i18n.js (V8) — الترجمة الفرنسية الكاملة للواجهة.
   المفتاح = النص العربي الأصلي كما في الصفحة؛ القيمة = الفرنسية. أي نص بلا ترجمة يبقى بالعربية (لا ينكسر شيء).
   تُطبَّق على: عناصر data-x (نص) · data-x-ph (placeholder) · data-x-aria (aria-label) · والنصوص الديناميكية عبر X() في app.js.
   محتوى المؤسسة نفسه (عناوين الأخبار وأسماء الأساتذة…) يبقى بلغته الأصلية كما أدخلته الإدارة؛ لا نترجم محتوى رسميًا آليًا. */
window.RAZI = window.RAZI || {};
RAZI.fr = {
  /* عام */
  "تارجيست": "Targuist", "إقليم الحسيمة": "province d'Al Hoceïma", "المغرب": "Maroc", "دليل الرازي — مساعد المعلومات": "Guide Al-Razi — assistant d'information",
  "لا توجد حصص معرّفة بعد": "Aucune séance définie pour le moment", "نُشر اليوم": "Aujourd'hui", "استراحة": "Pause", "الحصة": "Séance",
  "سياسة الخصوصية": "Politique de confidentialité",
  "هذه صيغة أولية تصف السلوك التقني الحالي للموقع، وتُراجَع من إدارة المؤسسة قبل اعتمادها رسميًا.": "Version préliminaire décrivant le fonctionnement technique actuel du site ; elle sera revue par l'administration avant validation officielle.",
  "ما لا يفعله الموقع": "Ce que le site ne fait pas", "لا يستعمل الموقع العام أدوات تحليلات أو تتبّع إعلاني، ولا يطلب من الزائر إنشاء حساب أو إدخال بيانات شخصية.": "Le site public n'utilise ni outils d'analyse ni suivi publicitaire, et ne demande aux visiteurs ni de créer un compte ni de saisir des données personnelles.",
  "ما يُحفظ في متصفحك": "Ce qui est enregistré dans votre navigateur", "يُحفظ محليًا في متصفحك اختيارك للوضع الليلي واللغة فقط، ويمكنك حذفه من إعدادات المتصفح. لا تُرسل هذه القيم إلى أي خادم.": "Seuls votre choix de mode sombre et de langue sont enregistrés localement ; vous pouvez les supprimer dans les paramètres du navigateur. Ces valeurs ne sont envoyées à aucun serveur.",
  "الخدمات التقنية": "Services techniques", "يُستضاف الموقع على Vercel، وتُخزَّن الأخبار والإعلانات في قاعدة بيانات Supabase. وكما هو معتاد في أي موقع، يستقبل مزودو الاستضافة وقاعدة البيانات سجلات تقنية عادية للطلبات (مثل عنوان الشبكة ونوع المتصفح) لأغراض التشغيل والأمان.": "Le site est hébergé sur Vercel et les actualités et annonces sont stockées dans une base Supabase. Comme tout site, les hébergeurs reçoivent des journaux techniques ordinaires (adresse réseau, type de navigateur) à des fins d'exploitation et de sécurité.",
  "لوحة الإدارة": "Espace d'administration", "لوحة الإدارة مخصصة لمسؤول المؤسسة فقط. يجري الدخول عبر Supabase Auth، وتُحفظ جلسة المسؤول في تبويب المتصفح المؤقت وتنتهي بإغلاقه.": "L'espace d'administration est réservé au responsable de l'établissement. L'accès se fait via Supabase Auth ; la session est conservée dans l'onglet et prend fin à sa fermeture.",
  "روابط خارجية": "Liens externes", "عند فتح روابط مثل Google Maps أو صفحات التواصل الاجتماعي تنتقل إلى مواقع تحكمها سياساتها الخاصة.": "En ouvrant des liens comme Google Maps ou les réseaux sociaux, vous quittez ce site pour des services régis par leurs propres politiques.",
  "للاستفسار عن هذه السياسة، استعمل بيانات التواصل في ": "Pour toute question sur cette politique, utilisez les coordonnées de la ", "صفحة التواصل": "page de contact",
  "تخطي إلى المحتوى": "Aller au contenu", "الثانوية التأهيلية الرازي": "Lycée Qualifiant Al-Razi", "تغيير اللغة": "Changer de langue",
  "تبديل الوضع الليلي": "Basculer le mode sombre", "التنقل الرئيسي": "Navigation principale", "التنقل السريع": "Navigation rapide", "القائمة": "Menu", "إغلاق": "Fermer",
  "المزيد": "Plus", "اقرأ المزيد": "Lire la suite", "مشاركة": "Partager", "مشاركة الخبر": "Partager l'article", "تم نسخ الرابط": "Lien copié", "تجريبي": "Démo",
  "قريبًا": "Bientôt", "سيتم تحديث المعلومات قريبًا": "Informations bientôt disponibles", "تحميل": "Télécharger", "تحميل الوثيقة": "Télécharger le document",
  /* Hero */
  "تارجيست، إقليم الحسيمة، المغرب": "Targuist, province d'Al Hoceïma, Maroc",
  "تعلّم.": "Apprendre.", "اكتشف.": "Découvrir.", "ابنِ مستقبلك.": "Construire l'avenir.",
  "مؤسسة تعليمية عمومية في تارجيست، تحتضن أبناء المنطقة وتواكب مسارهم الدراسي.": "Établissement public à Targuist, au service des élèves de la région et de leur parcours scolaire.",
  "اكتشف مؤسستنا": "Découvrir l'établissement", "اتصل بنا": "Nous contacter",
  "مقدمة": "Introduction", "شعار الثانوية التأهيلية الرازي بتقديم ثلاثي الأبعاد": "Logo du lycée Al-Razi en présentation 3D",
  /* أقسام */
  "أهم الأخبار": "À la une", "آخر المستجدات": "Dernières actualités", "الإعلانات": "Annonces", "المعرض": "Galerie", "تصنيف الصور": "Catégories de photos",
  "عن المؤسسة": "À propos", "تقع الثانوية التأهيلية الرازي في تارجيست بإقليم الحسيمة بالمغرب.": "Le Lycée Qualifiant Al-Razi est situé à Targuist, province d'Al Hoceïma, au Maroc.",
  "سيتم نشر التعريف الرسمي بالمؤسسة ورسالتها قريبًا.": "La présentation officielle de l'établissement et de sa mission sera publiée prochainement.",
  "اعرف أكثر عن المؤسسة": "En savoir plus sur l'établissement",
  "الحياة المدرسية": "Vie scolaire", "أندية المؤسسة": "Clubs de l'établissement", "الخدمات المدرسية": "Services scolaires", "إحصائيات المؤسسة": "Chiffres de l'établissement",
  "اليوم في الرازي": "Aujourd'hui à Al-Razi", "الدروس والموارد": "Cours et ressources", "المستوى": "Niveau", "المادة": "Matière", "نوع المورد": "Type de ressource",
  "ابحث عن درس أو تمرين…": "Rechercher un cours ou un exercice…", "بحث في الموارد": "Rechercher dans les ressources", "استعمال الزمن": "Emploi du temps", "القسم": "Classe", "اليوم": "Jour",
  "طباعة / PDF": "Imprimer / PDF", "أساتذة وأطر المؤسسة": "Enseignants et personnel", "ابحث بالاسم…": "Rechercher par nom…", "بحث": "Recherche",
  "إنجازات المؤسسة": "Réalisations de l'établissement", "مرافق المؤسسة": "Équipements de l'établissement", "أين توجد المؤسسة؟": "Où se trouve l'établissement ?",
  "فتح الموقع في Google Maps": "Ouvrir dans Google Maps", "التواصل": "Contact", "روابط التذييل": "Liens du pied de page", "روابط قانونية": "Liens légaux", "سياسة الخصوصية": "Politique de confidentialité",
  "الأخبار": "Actualités", "الأخبار والإعلانات": "Actualités et annonces", "المؤسسة": "L'établissement", "الرئيسية": "Accueil", "الأساتذة": "Enseignants",
  "الثانوية التأهيلية الرازي – الرئيسية": "Lycée Qualifiant Al-Razi – Accueil", "الأخبار والإعلانات الرسمية للمؤسسة": "Actualités et annonces officielles de l'établissement",
  "الأندية والأنشطة": "Clubs et activités", "الإنجازات": "Réalisations", "المؤسسة والتواصل": "L'établissement et contact", "حصص الأقسام حسب المستوى": "Emplois du temps par niveau",
  "دروس وتمارين وملخصات حسب المستوى والمادة": "Cours, exercices et résumés par niveau et matière", "الحياة المدرسية والأندية": "Vie scolaire et clubs", "الجوائز والمشاركات الموثقة": "Prix et participations documentés",
  "معلومات المؤسسة وبيانات التواصل": "Informations et coordonnées de l'établissement",
  /* اليوم */
  "آخر إعلان": "Dernière annonce", "آخر خبر": "Dernière actualité", "أقرب نشاط": "Prochaine activité", "آخر مورد دراسي": "Dernière ressource", "حصص": "Cours du",
  "الأحد": "Dimanche", "الاثنين": "Lundi", "الثلاثاء": "Mardi", "الأربعاء": "Mercredi", "الخميس": "Jeudi", "الجمعة": "Vendredi", "السبت": "Samedi",
  /* حالات فارغة */
  "لا توجد أخبار منشورة حاليًا": "Aucune actualité publiée pour le moment", "ستظهر الأخبار هنا فور نشرها من إدارة المؤسسة.": "Les actualités apparaîtront ici dès leur publication par l'administration.",
  "لا توجد إعلانات حاليًا": "Aucune annonce pour le moment", "تُعرض هنا الإعلانات الرسمية السارية فقط.": "Seules les annonces officielles en vigueur sont affichées ici.",
  "أخبار": "Actualités", "خبر": "Actualité", "خبر مهم": "Important", "أمس": "Hier", "هذا الأسبوع": "Cette semaine", "قبل ذلك": "Plus tôt",
  "تعذّر تحميل": "Impossible de charger", "حاليًا.": "pour le moment.", "إعادة المحاولة": "Réessayer", "الإعلانات_": "les annonces",
  "تُعرض الأنشطة المدرسية هنا عند إضافتها من إدارة المؤسسة.": "Les activités scolaires s'afficheront ici une fois ajoutées par l'administration.", "الأنشطة المدرسية": "Activités scolaires",
  "تُعرض الأندية هنا بعد اعتماد أسمائها رسميًا.": "Les clubs s'afficheront ici une fois leurs noms validés officiellement.",
  "تُنشر هنا الجوائز والمسابقات والنتائج والمشاريع والتكريمات والمشاركات بعد توثيقها رسميًا.": "Prix, concours, résultats, projets, distinctions et participations seront publiés ici après validation officielle.",
  "سيتم النشر بعد التوثيق الرسمي.": "Publication après validation officielle.", "تُعرض المرافق هنا بعد توثيقها بالصور.": "Les équipements seront présentés ici une fois documentés par des photos.", "صورة قريبًا": "Photo bientôt disponible",
  "ستظهر الدروس والتمارين والملخصات هنا مصنفة حسب المستوى والمادة عند نشرها.": "Les cours, exercices et résumés apparaîtront ici, classés par niveau et par matière, dès leur publication.",
  "كل الأنواع": "Tous les types", "كل المواد": "Toutes les matières", "جرّب تغيير الفلتر أو كلمات البحث.": "Essayez de modifier le filtre ou les mots recherchés.", "لا توجد نتائج": "Aucun résultat",
  "درس": "Cours", "تمرين": "Exercice", "فرض": "Devoir", "ملخص": "Résumé", "وثيقة": "Document",
  "سيظهر استعمال الزمن هنا بعد اعتماده رسميًا من الإدارة.": "L'emploi du temps apparaîtra ici après validation officielle par l'administration.", "سيظهر استعمال الزمن هنا بعد نشره من إدارة المؤسسة.": "L'emploi du temps apparaîtra ici après sa publication par l'administration.",
  "لا يوجد استعمال زمن منشور": "Aucun emploi du temps publié", "لا توجد حصص مسجلة لهذا اليوم.": "Aucun cours enregistré pour ce jour.", "لا حصص": "Pas de cours", "الحصة": "Séance", "قاعة": "Salle",
  "تُعرض أسماء الأساتذة والأطر هنا بعد اعتماد القائمة من الإدارة.": "Les noms des enseignants et du personnel s'afficheront ici après validation de la liste par l'administration.",
  "تُضاف صور هذا التصنيف عند توفرها.": "Les photos de cette catégorie seront ajoutées dès qu'elles seront disponibles.", "لا توجد صور في هذا التصنيف": "Aucune photo dans cette catégorie",
  "تعذّر تحميل المعرض حاليًا": "Impossible de charger la galerie pour le moment", "الكل": "Tout",
  "أنشطة": "Activités", "رياضة": "Sport", "ثقافة": "Culture", "احتفالات": "Fêtes", "مسابقات": "Concours",
  "الجذع المشترك": "Tronc commun", "الأولى باكالوريا": "1re année Bac", "الثانية باكالوريا": "2e année Bac", "القسم 1": "Classe 1", "القسم 2": "Classe 2",
  "الرياضيات": "Mathématiques", "الفيزياء والكيمياء": "Physique-chimie", "اللغة العربية": "Langue arabe", "اللغة الفرنسية": "Langue française",
  "الوحدة 1 (تجريبية)": "Unité 1 (démo)", "بيانات تجريبية — سيتم استبدالها بمحتوى المؤسسة الرسمي": "Données de démonstration — elles seront remplacées par le contenu officiel de l'établissement",
  "ثقافية": "Culturelles", "رياضية": "Sportives", "علمية": "Scientifiques", "بيئية": "Environnementales", "فنية": "Artistiques",
  "الجوائز": "Prix", "النتائج": "Résultats", "المشاريع": "Projets", "التكريمات": "Distinctions", "المشاركات": "Participations",
  /* التواصل */
  "الهاتف": "Téléphone", "البريد": "E-mail", "العنوان": "Adresse", "الموقع": "Site web", "فتح الصفحة": "Ouvrir la page", "خريطة المؤسسة": "Plan de l'établissement",
  "المساعد: دليل الرازي": "Assistant : Guide Al-Razi", "السنة الدراسية": "Année scolaire", "الوقت": "Horaire",
  "جارٍ التحميل…": "Chargement…", "هذا الخبر غير متاح.": "Cet article n'est pas disponible.", "تعذّر تحميل الخبر. حاول لاحقًا.": "Impossible de charger l'article. Réessayez plus tard.", "تعذّر تحميل تفاصيل الجدول. حاول مجددًا.": "Impossible de charger le détail. Réessayez.",
  "وضع تجريبي محلي — بيانات غير رسمية": "Mode démo local — données non officielles",
  "السابقة": "Précédente", "التالية": "Suivante", "ملء الشاشة": "Plein écran", "عرض الصورة": "Afficher la photo", "الخبر": "Article",
  /* الصفحات الداخلية */
  "الاسم": "Nom", "التعريف الرسمي": "Présentation officielle", "محتوى قيد الإعداد": "Contenu en préparation", "يُعرض هنا التعريف بالمؤسسة ورسالتها وهيكلها الإداري بعد اعتماده من الإدارة.": "La présentation de l'établissement, de sa mission et de son organisation s'affichera ici après validation par l'administration.",
  "الثانوية التأهيلية الرازي — Lycée Qualifiant Al-Razi": "الثانوية التأهيلية الرازي — Lycée Qualifiant Al-Razi",
  "دليل الرازي": "Guide Al-Razi", "المساعد": "Assistant"
};
/* ترجمة بعض مفاتيح قديمة (i18n.fr في site.js) تبقى كما هي */
