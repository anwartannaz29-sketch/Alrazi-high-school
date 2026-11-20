/* assistant.js (V8) — «دليل الرازي · RAZI AI»: مساعد معلومات مؤسسي ثنائي اللغة.
   مبدأ العمل (انظر docs/ARCHITECTURE.md): يجيب فقط من المحتوى المنشور (RAZI.* أو Supabase عند الإعداد). لا يخترع تواريخ ولا هواتف ولا أسماء.
   عند غياب المعلومة يقول ذلك بصراحة ويحيل إلى قسم الموقع أو إلى الإدارة. هذه نسخة قواعد/استرجاع محلية بلا خادم نموذج لغوي؛
   V8+: عند الإعداد الحي يستدعي askAI() الدالة الآمنة POST /api/assistant (Gemini من الخادم فقط؛ لا مفتاح في المتصفح)،
   وتبقى answer() المحلية احتياطًا آمنًا (من المحتوى المنشور فقط) عند تعذّر الخدمة.
   يعمل بوضعين: نافذة عائمة في كل الصفحات، أو مضمّنًا في assistant.html (العنصر [data-rai-page]). */
(() => {
  const R = window.RAZI || {}, root = document.documentElement, $ = (s, r = document) => r.querySelector(s);
  const lang = () => (root.lang === "fr" ? "fr" : "ar");
  const live = !!(window.SB && window.SB.configured), DEMO = !!(window.RAZI_CONFIG && window.RAZI_CONFIG.DEMO === true);
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pageMode = !!document.querySelector("[data-rai-page]");
  const base = pageMode || location.pathname.endsWith("about.html") || location.pathname.endsWith("privacy.html") ? "index.html" : "";

  /* ---------------- النصوص ---------------- */
  const TX = {
    ar: {
      name: "دليل الرازي", sub: "RAZI AI · مساعد معلومات المؤسسة", open: "افتح دليل الرازي", fab: "اسأل دليل الرازي", close: "إغلاق", expand: "فتح صفحة المساعد", ph: "اكتب سؤالك عن المؤسسة…", send: "إرسال", reset: "محادثة جديدة",
      note: "يجيب من المحتوى المنشور في الموقع فقط، ولا يغني عن الإدارة في القرارات الرسمية. لا ترسل معلومات شخصية أو خاصة بالتلاميذ.",
    ai: { pre: "المصدر: ", note: "الإجابة الذكية غير متاحة الآن، وهذه إجابة أساسية من المحتوى المنشور.", retry: "إعادة المحاولة بالمساعد الذكي", rate: "الطلبات كثيرة الآن، حاول بعد قليل.", bad: "اكتب سؤالًا قصيرًا عن المؤسسة (حتى 500 حرف).", net: "تعذّر الاتصال بالمساعد. تحقق من الشبكة.", wait: "جارٍ البحث في المحتوى المنشور…" },

      hello: "مرحبًا! أنا «دليل الرازي»، مساعد المعلومات الخاص بالثانوية التأهيلية الرازي بتارجيست. أجيب من المحتوى المنشور في الموقع: الإعلانات، استعمال الزمن، الدروس والموارد، الأندية والأنشطة، التوجيه والإجراءات.",
      sug: ["ما آخر الإعلانات؟", "أين أجد استعمال الزمن؟", "كيف أجد الدروس والتمارين؟", "ما الأندية والأنشطة؟", "ما مستويات الدراسة والتوجيه؟", "ما الوثائق والإجراءات الإدارية؟", "كيف أتواصل مع المؤسسة؟"],
      src: { ann: "المصدر: إعلانات المؤسسة المنشورة", news: "المصدر: أخبار المؤسسة المنشورة", sch: "المصدر: استعمال الزمن المنشور", res: "المصدر: قسم الدروس والموارد", life: "المصدر: قسم الحياة المدرسية", t: "المصدر: قائمة الأساتذة والأطر المعتمدة", site: "المصدر: بيانات المؤسسة في الموقع", gen: "معلومة عامة عن النظام التعليمي، لا عن المؤسسة تحديدًا", none: "لا توجد معلومة منشورة" },
      open_ann: "فتح الإعلانات", open_news: "فتح الأخبار", open_sch: "فتح استعمال الزمن", open_res: "فتح الدروس والموارد", open_life: "فتح الحياة المدرسية", open_t: "فتح الأساتذة", open_contact: "فتح التواصل والموقع", open_gal: "فتح المعرض", open_about: "عن المؤسسة", map: "فتح الخريطة", demoNote: "بيانات تجريبية للعرض فقط",
      emptyAnn: "لا توجد إعلانات منشورة حاليًا. تُعرض الإعلانات هنا فور نشرها من إدارة المؤسسة.", emptyNews: "لا توجد أخبار منشورة حاليًا.",
      annHead: "آخر الإعلانات المنشورة:", newsHead: "آخر الأخبار المنشورة:",
      schNone: "لم يُنشر استعمال الزمن بعد. سيظهر في قسم «استعمال الزمن» (مع الطباعة وPDF) فور اعتماده من الإدارة.", schYes: n => `استعمال الزمن منشور لـ ${n} قسمًا/مستوى. اختر المستوى والقسم ثم اليوم، ويمكنك طباعته أو حفظه PDF.`,
      resNone: "لم تُنشر دروس أو تمارين بعد. ستجدها في قسم «الدروس والموارد» مصنفة حسب المستوى ثم المادة ثم النوع.", resYes: (n, s) => `يوجد ${n} مورد منشور${s ? " في المواد: " + s : ""}. صنِّف بحسب المستوى ثم المادة ثم النوع، أو ابحث بالكلمة.`,
      lifeNone: "لم تُنشر بعد قائمة معتمدة بالأندية والأنشطة. تُعرض في قسم «الحياة المدرسية» بعد اعتماد الأسماء رسميًا.", lifeYes: "الأندية والأنشطة المنشورة:",
      tNone: "لم تُعتمد بعد قائمة الأساتذة والأطر لنشرها.", tYes: (n, s) => `تضم القائمة المنشورة ${n} من الأساتذة والأطر${s ? " في المواد: " + s : ""}. يمكنك التصفية بالمادة أو البحث بالاسم.`,
      contactHead: "بيانات التواصل المنشورة:", addr: "العنوان", phone: "الهاتف", mail: "البريد", pending: "سيتم تحديثها قريبًا", contactNote: "الموقع على الخريطة متاح عبر الزر أدناه.",
      streams: "في التعليم الثانوي التأهيلي بالمغرب ثلاثة مستويات: الجذع المشترك، ثم الأولى باكالوريا، ثم الثانية باكالوريا. التخصص (المسلك) يبدأ تدريجيًا بعد الجذع المشترك.", streams2: "المسالك والشعب المتاحة فعليًا بالمؤسسة لم تُنشر بعد في الموقع؛ تؤكدها الإدارة. للتوجيه الشخصي استشر مستشار/ة التوجيه بالمؤسسة.",
      proc: "لم تُنشر بعد إجراءات أو نماذج رسمية في الموقع (التسجيل، الشهادات، الانتقال…). عند اعتمادها من الإدارة ستظهر ضمن الإعلانات والموارد.", proc2: "للاستفسار عن وثيقة أو إجراء محدد، تواصل مع إدارة المؤسسة مباشرة.",
      about: "الثانوية التأهيلية الرازي مؤسسة تعليمية عمومية في تارجيست، إقليم الحسيمة، المغرب. التعريف الرسمي ورسالة المؤسسة ستُنشر بعد اعتمادها من الإدارة.",
      gal: "في المعرض صور حقيقية للمؤسسة (المدخل، الساحة، الحدائق). تُضاف صور الأنشطة عند توفرها.", ach: "تُنشر الإنجازات (جوائز، نتائج، مشاريع، مشاركات) فقط بعد التوثيق الرسمي، وهي غير منشورة حاليًا.", fac: "الساحة والأقسام والحدائق موثقة بالصور في المعرض. المكتبة والمختبرات والملاعب والقاعات ستُعرض بعد توثيقها.",
      thanks: "على الرحب والسعة! هل من سؤال آخر عن المؤسسة؟", fall: "لم أجد جوابًا لهذا السؤال ضمن المحتوى المنشور. جرّب أحد الأسئلة المقترحة، أو تواصل مع إدارة المؤسسة للاستفسار الرسمي.", err: "تعذّر الوصول إلى البيانات حاليًا. حاول لاحقًا.",
      know: [["الإعلانات والأخبار", "آخر ما نُشر رسميًا"], ["استعمال الزمن", "حسب المستوى والقسم واليوم"], ["الدروس والموارد", "حسب المستوى والمادة"], ["الأندية والأنشطة", "الحياة المدرسية"], ["التوجيه والمسالك", "معلومات عامة + إحالة للإدارة"], ["الوثائق والإجراءات", "تُعرض عند اعتمادها"]],
      pageTitle: "دليل الرازي", pageLead: "مساعد معلومات مؤسسي للثانوية التأهيلية الرازي: يجيب من المحتوى المنشور في الموقع، بالعربية والفرنسية، ويحيلك إلى القسم المناسب.", pageKnow: "ما الذي يعرفه؟", honest: "ليس روبوت دردشة عامًا: لا يجيب خارج نطاق المؤسسة، ولا يخترع معلومات غير منشورة. حين لا يجد الجواب يقول ذلك ويحيلك إلى الإدارة."
    },
    fr: {
      name: "Guide Al-Razi", sub: "RAZI AI · assistant d'information de l'établissement", open: "Ouvrir le Guide Al-Razi", fab: "Demander au Guide", close: "Fermer", expand: "Ouvrir la page de l'assistant", ph: "Posez votre question sur l'établissement…", send: "Envoyer", reset: "Nouvelle conversation",
      note: "Il répond uniquement à partir du contenu publié sur le site et ne remplace pas l'administration pour les décisions officielles. N'envoyez aucune information personnelle ou d'élève.",
    ai: { pre: "Source : ", note: "La réponse intelligente est indisponible pour le moment ; voici une réponse de base issue du contenu publié.", retry: "Réessayer avec l'assistant intelligent", rate: "Trop de demandes, réessayez dans un instant.", bad: "Posez une question courte sur l'établissement (500 caractères max).", net: "Connexion à l'assistant impossible. Vérifiez le réseau.", wait: "Recherche dans le contenu publié…" },

      hello: "Bonjour ! Je suis le « Guide Al-Razi », l'assistant d'information du Lycée Qualifiant Al-Razi de Targuist. Je réponds à partir du contenu publié sur le site : annonces, emploi du temps, cours et ressources, clubs et activités, orientation et démarches.",
      sug: ["Quelles sont les dernières annonces ?", "Où trouver l'emploi du temps ?", "Comment trouver les cours et exercices ?", "Quels clubs et activités ?", "Quels niveaux et quelle orientation ?", "Quels documents et démarches administratives ?", "Comment contacter l'établissement ?"],
      src: { ann: "Source : annonces publiées par l'établissement", news: "Source : actualités publiées", sch: "Source : emploi du temps publié", res: "Source : rubrique Cours et ressources", life: "Source : rubrique Vie scolaire", t: "Source : liste validée des enseignants et du personnel", site: "Source : informations de l'établissement sur le site", gen: "Information générale sur le système éducatif, pas spécifique à l'établissement", none: "Aucune information publiée" },
      open_ann: "Ouvrir les annonces", open_news: "Ouvrir les actualités", open_sch: "Ouvrir l'emploi du temps", open_res: "Ouvrir les ressources", open_life: "Ouvrir la vie scolaire", open_t: "Ouvrir les enseignants", open_contact: "Ouvrir contact et plan", open_gal: "Ouvrir la galerie", open_about: "À propos", map: "Ouvrir la carte", demoNote: "Données de démonstration uniquement",
      emptyAnn: "Aucune annonce publiée pour le moment. Les annonces apparaîtront ici dès leur publication par l'administration.", emptyNews: "Aucune actualité publiée pour le moment.",
      annHead: "Dernières annonces publiées :", newsHead: "Dernières actualités publiées :",
      schNone: "L'emploi du temps n'est pas encore publié. Il apparaîtra dans la rubrique « Emploi du temps » (avec impression et PDF) dès sa validation par l'administration.", schYes: n => `L'emploi du temps est publié pour ${n} classe(s)/niveau(x). Choisissez le niveau, la classe puis le jour ; vous pouvez l'imprimer ou l'enregistrer en PDF.`,
      resNone: "Aucun cours ni exercice n'est encore publié. Ils apparaîtront dans « Cours et ressources », classés par niveau, matière et type.", resYes: (n, s) => `${n} ressource(s) publiée(s)${s ? " en : " + s : ""}. Classez par niveau, matière et type, ou cherchez un mot-clé.`,
      lifeNone: "La liste validée des clubs et activités n'est pas encore publiée. Elle apparaîtra dans « Vie scolaire » après validation officielle des noms.", lifeYes: "Clubs et activités publiés :",
      tNone: "La liste des enseignants et du personnel n'a pas encore été validée pour publication.", tYes: (n, s) => `La liste publiée compte ${n} enseignant(s) et membre(s) du personnel${s ? " — matières : " + s : ""}. Filtrez par matière ou cherchez par nom.`,
      contactHead: "Coordonnées publiées :", addr: "Adresse", phone: "Téléphone", mail: "E-mail", pending: "bientôt disponible", contactNote: "La localisation sur la carte est accessible via le bouton ci-dessous.",
      streams: "Dans le secondaire qualifiant au Maroc, il y a trois niveaux : le Tronc commun, puis la 1re année du Bac, puis la 2e année du Bac. La spécialisation (filière) commence progressivement après le Tronc commun.", streams2: "Les filières réellement proposées par l'établissement ne sont pas encore publiées sur le site ; elles sont confirmées par l'administration. Pour un conseil personnalisé, consultez le/la conseiller(ère) d'orientation de l'établissement.",
      proc: "Aucune démarche ni formulaire officiel n'est encore publié sur le site (inscription, certificats, transfert…). Dès leur validation par l'administration, ils apparaîtront dans les annonces et les ressources.", proc2: "Pour une démarche ou un document précis, contactez directement l'administration de l'établissement.",
      about: "Le Lycée Qualifiant Al-Razi est un établissement public de Targuist, province d'Al Hoceïma, Maroc. La présentation officielle et la mission de l'établissement seront publiées après validation par l'administration.",
      gal: "La galerie présente de vraies photos de l'établissement (entrée, cour, jardins). Les photos d'activités seront ajoutées dès qu'elles seront disponibles.", ach: "Les réalisations (prix, résultats, projets, participations) ne sont publiées qu'après validation officielle ; aucune n'est publiée pour le moment.", fac: "La cour, les salles et les jardins sont documentés en photos dans la galerie. La bibliothèque, les laboratoires, les terrains et les salles seront présentés une fois documentés.",
      thanks: "Avec plaisir ! Une autre question sur l'établissement ?", fall: "Je n'ai pas trouvé de réponse dans le contenu publié. Essayez l'une des questions suggérées, ou contactez l'administration pour une demande officielle.", err: "Impossible d'accéder aux données pour le moment. Réessayez plus tard.",
      know: [["Annonces et actualités", "Les dernières publications officielles"], ["Emploi du temps", "Par niveau, classe et jour"], ["Cours et ressources", "Par niveau et matière"], ["Clubs et activités", "Vie scolaire"], ["Orientation et filières", "Infos générales + renvoi à l'administration"], ["Documents et démarches", "Affichés dès leur validation"]],
      pageTitle: "Guide Al-Razi", pageLead: "Assistant d'information du Lycée Qualifiant Al-Razi : il répond à partir du contenu publié sur le site, en arabe et en français, et vous oriente vers la bonne rubrique.", pageKnow: "Que connaît-il ?", honest: "Ce n'est pas un chatbot généraliste : il ne répond pas hors du cadre de l'établissement et n'invente aucune information non publiée. S'il ne trouve pas la réponse, il le dit et vous renvoie vers l'administration."
    }
  };
  const tx = () => TX[lang()];

  /* ---------------- المعرفة: المحتوى المنشور فقط ---------------- */
  const pub = a => (a || []).filter(x => (!x.status || x.status === "published") && (DEMO || !x.demo));
  const sbq = async q => { try { return await SB.rest(q); } catch (e) { return null; } };
  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  async function know() {
    if (live) {
      const [ann, news, res, clubs, acts, tts, tea] = await Promise.all([
        sbq("announcements?select=title,type,pinned,start_at,created_at&status=eq.published&order=pinned.desc,created_at.desc&limit=5"),
        sbq("news?select=title,category,published_at&status=eq.published&order=published_at.desc&limit=5"),
        sbq("resources?select=subject&status=eq.published&limit=500"),
        sbq("clubs?select=name&status=eq.published&limit=50"), sbq("activities?select=title&status=eq.published&limit=50"),
        sbq("timetables?select=id&status=eq.published&limit=300"), sbq("teachers?select=subject&status=eq.published&limit=300")]);
      return { ann: (ann || []).map(a => ({ title: a.title, date: a.start_at || a.created_at, type: a.type })), news: (news || []).map(n => ({ title: n.title, date: n.published_at })), resN: (res || []).length, resSubjects: [...new Set((res || []).map(r => r.subject).filter(Boolean))],
        life: [...(clubs || []).map(c => c.name), ...(acts || []).map(a => a.title)], tt: (tts || []).length, teaN: (tea || []).length, teaSubjects: [...new Set((tea || []).map(t => t.subject).filter(s => s && s !== "—"))], demo: false };
    }
    const ok = live || DEMO, res = pub(R.resources), tea = pub(R.teachers);
    return { ann: ok ? pub(R.announcements).sort(byDate).slice(0, 4) : [], news: ok ? pub(R.news).sort(byDate).slice(0, 4) : [], resN: res.length, resSubjects: [...new Set(res.map(r => r.subject))],
      life: [...pub(R.clubs).map(c => c.name), ...pub(R.activities).map(a => a.title)], tt: (R.schedule && (!R.schedule.demo || DEMO)) ? (R.schedule.classes || []).length : 0, teaN: tea.length, teaSubjects: [...new Set(tea.map(t => t.subject).filter(s => s && s !== "—"))], demo: DEMO };
  }

  /* ---------------- الفهم: تطبيع + نوايا ---------------- */
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const INTENTS = [
    ["thanks", /شكرا|merci|thank/], ["greet", /^(مرحبا|سلام|اهلا|السلام|hello|bonjour|salut|bonsoir|hi)(?=\s|$)/],
    ["schedule", /استعمال الزمن|جدول|حصص|حصه|توقيت|emploi du temps|horaire|planning|timetable/],
    ["ann", /اعلان|اعلانات|annonce|communique|avis\b/], ["news", /خبر|اخبار|مستجد|actualit|news|nouveaut/],
    ["res", /درس|دروس|تمرين|تمارين|ملخص|فرض|موارد|مراجع|cours|exercice|resume|ressource|devoir|pdf|lecon/],
    ["life", /نادي|اندي|نشاط|انشطه|حياه مدرسيه|club|activit|vie scolaire|sport/],
    ["teachers", /استاذ|اساتذه|مدرس|اطر|enseignant|professeur|\bprof/],
    ["streams", /توجيه|شعبه|شعب|مسلك|مسالك|باكالوريا|جذع|مستوي|مستويات|orientation|filiere|\bbac\b|tronc|niveau|niveaux|specialit/],
    ["proc", /اجراء|وثيقه|وثائق|شهاده|تسجيل|انتقال|ملف اداري|نموذج|procedure|demarche|document|certificat|inscription|attestation|dossier|formulaire/],
    ["contact", /اتصل|تواصل|هاتف|بريد|عنوان|اين|خريطه|موقع المؤسسه|contact|telephone|tel\b|adresse|ou se trouve|plan|map|email|joindre/],
    ["gallery", /صور|معرض|galerie|photo/], ["ach", /انجاز|جوائز|جايزه|نتائج|reussite|prix\b|resultat|realisation/], ["fac", /مرافق|مكتبه|مختبر|ملعب|equipement|bibliotheque|laboratoire|terrain|salle/],
    ["about", /عن المؤسسه|تعريف|about|presentation|a propos|qui etes|etablissement/]
  ];
  const detect = q => { const n = norm(q); for (const [k, rx] of INTENTS) if (rx.test(n)) return k; return "fall"; };

  /* ---------------- الإجابة ---------------- */
  const a = (href, label) => ({ href: (href.startsWith("#") ? base + href : href), label });
  const fmtD = d => { try { return new Date(d).toLocaleDateString(lang() === "fr" ? "fr-FR" : "ar-MA-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
  const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  async function answer(q) {
    const T = tx(), k = detect(q), S = T.src;
    let K; try { K = await know(); } catch (e) { return { html: `<p>${T.err}</p>` }; }
    const demo = K.demo ? `<span class="rai__src">${T.demoNote}</span>` : "";
    const out = (html, src, acts) => ({ html: html + (src ? `<span class="rai__src">${src}</span>` : "") + demo, acts });
    switch (k) {
      case "greet": return out(`<p>${T.hello}</p>`, "", []);
      case "thanks": return out(`<p>${T.thanks}</p>`, "", []);
      case "ann": return K.ann.length ? out(`<p>${T.annHead}</p>${list(K.ann.map(x => `${esc(x.title)} <small>(${fmtD(x.date)})</small>`))}`, S.ann, [a("#news", T.open_ann)]) : out(`<p>${T.emptyAnn}</p>`, S.none, [a("#news", T.open_ann)]);
      case "news": return K.news.length ? out(`<p>${T.newsHead}</p>${list(K.news.map(x => `${esc(x.title)} <small>(${fmtD(x.date)})</small>`))}`, S.news, [a("#news", T.open_news)]) : out(`<p>${T.emptyNews}</p>`, S.none, [a("#news", T.open_news)]);
      case "schedule": return out(`<p>${K.tt ? T.schYes(K.tt) : T.schNone}</p>`, K.tt ? S.sch : S.none, [a("#schedule", T.open_sch)]);
      case "res": return out(`<p>${K.resN ? T.resYes(K.resN, K.resSubjects.slice(0, 6).map(esc).join(lang() === "fr" ? ", " : "، ")) : T.resNone}</p>`, K.resN ? S.res : S.none, [a("#resources", T.open_res)]);
      case "life": return K.life.length ? out(`<p>${T.lifeYes}</p>${list(K.life.slice(0, 8).map(esc))}`, S.life, [a("#life", T.open_life)]) : out(`<p>${T.lifeNone}</p>`, S.none, [a("#life", T.open_life)]);
      case "teachers": return out(`<p>${K.teaN ? T.tYes(K.teaN, K.teaSubjects.slice(0, 6).map(esc).join(lang() === "fr" ? ", " : "، ")) : T.tNone}</p>`, K.teaN ? S.t : S.none, [a("#teachers", T.open_t)]);
      case "streams": return out(`<p>${T.streams}</p><p>${T.streams2}</p>`, S.gen, [a("#contact", T.open_contact)]);
      case "proc": return out(`<p>${T.proc}</p><p>${T.proc2}</p>`, S.none, [a("#news", T.open_ann), a("#contact", T.open_contact)]);
      case "contact": {
        const s = R.site || {}, ad = s.addressOverride || `${s.city} – ${s.province} – ${s.country}`;
        const rows = [`${T.addr}: ${esc(ad)}`, `${T.phone}: ${s.phone ? esc(s.phone) : T.pending}`, `${T.mail}: ${s.email ? esc(s.email) : T.pending}`];
        return out(`<p>${T.contactHead}</p>${list(rows)}<p>${T.contactNote}</p>`, S.site, [a("#contact", T.open_contact), a(s.mapsLink || "#contact", T.map)]);
      }
      case "gallery": return out(`<p>${T.gal}</p>`, S.site, [a("#gallery", T.open_gal)]);
      case "ach": return out(`<p>${T.ach}</p>`, S.none, []);
      case "fac": return out(`<p>${T.fac}</p>`, S.site, [a("#gallery", T.open_gal)]);
      case "about": return out(`<p>${T.about}</p>`, S.site, [a("about.html", T.open_about)]);
      default: return out(`<p>${T.fall}</p>`, "", [a("#contact", T.open_contact)]);
    }
  }

  /* ---------------- طبقة الذكاء الاصطناعي: POST /api/assistant (الخادم يحمل المفتاح) ---------------- */
  const ROUTES = /^index\.html#(news|announcements|schedule|resources|teachers|clubs|life|achievements|gallery|contact)$/;   // روابط داخلية معروفة فقط
  const useAI = q => live && !DEMO && !/^(thanks|greet)$/.test(detect(q));   // التحية والشكر محليان (توفير الحصة)
  const rich = s => String(s).split(/(https:\/\/[^\s<>"'`)]+)/g).map((p, i) => i % 2 ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>` : esc(p)).join("");   // نص فقط؛ الروابط https التي تحققت منها الدالة فقط
  async function callAI(q) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.slice(0, 500), lang: lang() }), signal: ctl.signal, credentials: "omit", cache: "no-store" });
      let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j };
    } catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); }
  }
  async function askAI(q) {
    const T = tx(), r = await callAI(q), j = r.j;
    if (r.status === 200 && j && j.success === true && typeof j.answer === "string" && j.answer.trim()) {
      const acts = (Array.isArray(j.sources) ? j.sources : []).filter(x => x && typeof x.url === "string" && ROUTES.test(x.url) && typeof x.label === "string").slice(0, 3);
      const body = j.answer.split(/\n+/).filter(Boolean).map(x => `<p>${rich(x)}</p>`).join("");
      const src = acts.length ? `<span class="rai__src">${esc(T.ai.pre + acts.map(x => x.label).join(lang() === "fr" ? ", " : "، "))}</span>` : "";
      return { html: body + src, acts: acts.map(x => a(x.url.replace(/^index\.html(?=#)/, base ? "index.html" : ""), x.label)) };
    }
    if (r.status === 400 || r.status === 413 || r.status === 415) return { html: `<p>${T.ai.bad}</p>` };
    const why = r.status === 429 ? T.ai.rate : r.status === 0 ? T.ai.net : T.ai.note, loc = await answer(q);   // احتياط محلي من المحتوى المنشور، بلا اختلاق
    return { html: `<p class="rai__aiNote">${why}</p>` + loc.html, acts: loc.acts, retry: q };
  }
  const respond = q => useAI(q) ? askAI(q) : answer(q);
  window.RAZI_AI = { answer, askAI, detect, norm };   // معزولة للاختبار والاستبدال لاحقًا بـ RAG

  /* ---------------- الواجهة ---------------- */
  const ico = (p, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = { spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', send: '<path d="M5 12h14M13 6l6 6-6 6"/>', exp: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', reset: '<path d="M4 4v6h6M20 20v-6h-6M5.5 15A8 8 0 0 0 20 12M18.5 9A8 8 0 0 0 4 12"/>', book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-3 0M8 9h5M8 13h5"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 0 1 0 6M22 20c0-3-2-5-5-5.5"/>', school: '<path d="M3 9l9-5 9 5-9 5zM7 12v5c3 2 7 2 10 0v-5"/>', file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>' };

  let ui = null, started = false;
  function build() {
    if (ui) return ui;
    const el = document.createElement("div");
    el.className = "rai" + (pageMode ? " rai--page open" : ""); el.id = "rai";
    el.innerHTML = `<div class="rai__scrim" data-close></div>
      <section class="rai__panel" role="dialog" aria-modal="${pageMode ? "false" : "true"}" aria-labelledby="raiT">
        <header class="rai__head"><span class="rai__avatar">${ico(I.spark, 22)}</span><div class="rai__t"><b id="raiT"></b><small></small></div>
          <button type="button" class="rai__hb" data-reset>${ico(I.reset, 20)}</button>
          ${pageMode ? "" : `<a class="rai__hb" data-expand href="assistant.html">${ico(I.exp, 20)}</a><button type="button" class="rai__hb" data-close>${ico(I.x, 20)}</button>`}
        </header>
        <div class="rai__body" role="log" aria-live="polite"></div>
        <div class="rai__sug" role="group"></div>
        <form class="rai__form" autocomplete="off"><input type="text" name="q" maxlength="300" required><button class="rai__send" type="submit">${ico(I.send, 20)}</button></form>
        <p class="rai__note"></p>
      </section>`;
    const mount = pageMode ? $("[data-rai-page]") : document.body; mount.append(el);
    ui = { el, body: $(".rai__body", el), sug: $(".rai__sug", el), form: $(".rai__form", el), input: $("input", el) };
    el.addEventListener("click", e => { if (e.target.closest("[data-close]")) close(); if (e.target.closest("[data-reset]")) reset(); const c = e.target.closest(".rai__chip"); if (c) ask(c.dataset.q); const rt = e.target.closest("[data-retry]"); if (rt && !busy) { const m = rt.closest(".rai__msg"), q = m && m.dataset.q; if (q) { m.remove(); ask(q, true); } } });
    ui.form.addEventListener("submit", e => { e.preventDefault(); const v = ui.input.value.trim(); if (v) { ui.input.value = ""; ask(v); } });
    el.addEventListener("keydown", e => { if (e.key === "Escape" && !pageMode) close(); });
    paintStatic(); hello(); return ui;
  }
  function paintStatic() {
    if (!ui) return; const T = tx(), e = ui.el;
    $("#raiT", e).textContent = T.name; $(".rai__t small", e).textContent = T.sub; $(".rai__note", e).textContent = T.note;
    ui.input.placeholder = T.ph; ui.input.setAttribute("aria-label", T.ph); $(".rai__send", e).setAttribute("aria-label", T.send); $("[data-reset]", e).setAttribute("aria-label", T.reset); $("[data-reset]", e).title = T.reset;
    const ex = $("[data-expand]", e); if (ex) { ex.setAttribute("aria-label", T.expand); ex.title = T.expand; } const cl = $("button[data-close].rai__hb", e); if (cl) { cl.setAttribute("aria-label", T.close); cl.title = T.close; }
    ui.sug.innerHTML = T.sug.map(s => `<button type="button" class="rai__chip" data-q="${esc(s)}">${esc(s)}</button>`).join("");
    ui.sug.setAttribute("aria-label", lang() === "fr" ? "Questions suggérées" : "أسئلة مقترحة");
  }
  const scroll = () => { ui.body.scrollTop = ui.body.scrollHeight; };
  function push(cls, html) { const m = document.createElement("div"); m.className = "rai__msg " + cls; m.innerHTML = html; ui.body.append(m); scroll(); return m; }
  function hello() { ui.body.innerHTML = ""; push("rai__msg--bot", `<p>${tx().hello}</p>`); }
  function reset() { hello(); ui.input.focus(); }
  let busy = false;
  async function ask(q, again) {
    if (busy) return; busy = true; const T = tx(), send = $(".rai__send", ui.el); send.disabled = true; ui.body.setAttribute("aria-busy", "true");
    try {
      if (!again) push("rai__msg--me", esc(q));
      const typing = push("rai__msg--bot", `<span class="rai__typing" role="status" aria-label="${esc(T.ai.wait)}"><i></i><i></i><i></i></span>`);
      const [r] = await Promise.all([respond(q).catch(() => ({ html: `<p>${tx().err}</p>` })), new Promise(res => setTimeout(res, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520))]);
      typing.remove();
      const m = push("rai__msg--bot", r.html);
      if ((r.acts && r.acts.length) || r.retry) {
        const box = document.createElement("div"); box.className = "rai__acts";
        box.innerHTML = (r.acts || []).map(x => `<a class="rai__act" href="${esc(x.href)}"${/^https?:/.test(x.href) ? ' target="_blank" rel="noopener"' : ""}>${esc(x.label)}</a>`).join("") + (r.retry ? `<button type="button" class="rai__act" data-retry>${esc(tx().ai.retry)}</button>` : "");
        m.append(box); m.dataset.q = r.retry || "";
        if (!pageMode) box.addEventListener("click", e => { if (e.target.closest("a") && !/^https?:/.test(e.target.closest("a").getAttribute("href"))) close(); });
      }
      scroll();
    } finally { busy = false; send.disabled = false; ui.body.removeAttribute("aria-busy"); }
  }
  let fab = null, lastFocus = null;
  function open() { build(); lastFocus = document.activeElement; ui.el.classList.add("open"); fab && fab.setAttribute("aria-expanded", "true"); document.documentElement.style.overflow = matchMedia("(max-width: 699px)").matches ? "hidden" : ""; setTimeout(() => ui.input.focus(), 60); }
  function close() { if (!ui) return; ui.el.classList.remove("open"); fab && fab.setAttribute("aria-expanded", "false"); document.documentElement.style.overflow = ""; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function mountFab() {
    if (pageMode || started) return; started = true;
    fab = document.createElement("button"); fab.type = "button"; fab.className = "rai-fab"; fab.setAttribute("aria-haspopup", "dialog"); fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = `<span class="rai-fab__i">${ico(I.spark, 22)}</span><span class="rai-fab__l"></span>`; document.body.append(fab);
    const lab = () => { $(".rai-fab__l", fab).textContent = tx().fab; fab.setAttribute("aria-label", tx().open); };
    lab(); fab.addEventListener("click", open); addEventListener("razi:lang", lab);
    document.addEventListener("click", e => { const t = e.target.closest("[data-open-ai]"); if (t) { e.preventDefault(); open(); } });
  }
  addEventListener("razi:lang", () => { if (!ui) return; paintStatic(); hello(); const t = $("#aiPageT"); if (t) paintPage(); });
  function paintPage() {
    const T = tx(), set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("aiPageT", T.pageTitle); set("aiPageLead", T.pageLead); set("aiKnowT", T.pageKnow); set("aiHonest", T.honest);
    const k = document.getElementById("aiKnow"); if (k) { const ic = [I.news, I.clock, I.book, I.users, I.school, I.file]; k.innerHTML = T.know.map(([b, s], i) => `<li>${ico(ic[i], 22)}<div><b>${esc(b)}</b><small>${esc(s)}</small></div></li>`).join(""); }
  }
  const go = () => { mountFab(); if (pageMode) { build(); paintPage(); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
