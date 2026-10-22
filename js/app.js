/* app.js (V2) — يقرأ window.RAZI عبر طبقة api. في V7 يُستبدل مصدر api بـ fetch إلى قاعدة بيانات دون تغيير الواجهة. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;
  const R = window.RAZI;

  /* ---------- طبقة البيانات (جاهزة للربط بـ Backend لاحقًا) ---------- */
  /* تعقيم: كل نص قادم من قاعدة البيانات يُهرَّب قبل أن يدخل أي قالب HTML */
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(u || "") ? esc(u) : null);
  const live = !!(window.SB && window.SB.configured);
  const DEMO = !!(window.RAZI_CONFIG && window.RAZI_CONFIG.DEMO === true);   // وضع تجريبي محلي صريح فقط (يمنعه البناء في الإنتاج)   // Supabase مُعدّ؟ نعم → الأخبار والإعلانات من القاعدة فقط (بلا بيانات تجريبية)
  const mapNews = r => ({ id: r.id, status: "published", featured: !!r.featured, title: esc(r.title), excerpt: esc(r.excerpt || ""), date: r.published_at, category: esc(r.category || "خبر"), image: safeUrl(r.image_url), url: `#news/${encodeURIComponent(r.id)}` });
  const mapAnn = r => ({ id: r.id, status: "published", pinned: !!r.pinned, type: esc(r.type), title: esc(r.title), body: esc(r.content || ""), date: r.start_at || r.created_at, file: null });
  const LIVE = {
    news: { q: "news?select=id,title,excerpt,image_url,category,featured,published_at&status=eq.published&order=published_at.desc&limit=40", map: mapNews },
    announcements: { q: "announcements?select=id,title,content,type,pinned,start_at,created_at&status=eq.published&order=pinned.desc,created_at.desc&limit=30", map: mapAnn },
    teachers: { q: "teachers?select=id,name,subject,role,photo_url&status=eq.published&order=sort_order.asc,name.asc&limit=300", map: r => ({ id: r.id, status: "published", name: esc(r.name), subject: esc(r.subject || "—"), role: esc(r.role || ""), photo: safeUrl(r.photo_url) }) },
    // level/subject تبقى خامًا (مفاتيح تصفية) ويُهرَّب عند العرض فقط
    resources: { q: "resources?select=id,title,level,subject,unit,kind,file_url,created_at&status=eq.published&order=created_at.desc&limit=500", map: r => ({ id: r.id, status: "published", levelId: r.level, subject: r.subject || "—", unit: r.unit || "", title: esc(r.title), type: r.kind, file: safeUrl(r.file_url), date: r.created_at }) },
    gallery: { q: "gallery_items?select=id,title,category,image_url&status=eq.published&order=created_at.desc&limit=120", map: r => ({ id: r.id, category: r.category, image: safeUrl(r.image_url), caption: esc(r.title || "صورة من المؤسسة"), live: true }) },
    clubs: { q: "clubs?select=id,name,description,icon&status=eq.published&order=sort_order.asc,name.asc&limit=100", map: r => ({ id: r.id, name: esc(r.name), icon: ["book", "ball", "leaf", "palette", "flask", "users", "trophy", "star"].includes(r.icon) ? r.icon : "users", text: esc(r.description || "") }) },
    activities: { q: "activities?select=id,kind,title,description&status=eq.published&order=sort_order.asc,created_at.desc&limit=100", map: r => ({ id: r.id, kind: r.kind, title: esc(r.title), icon: { "ثقافية": "book", "رياضية": "ball", "علمية": "flask", "بيئية": "leaf", "فنية": "palette", "مسابقات": "trophy" }[r.kind] || "star", text: esc(r.description || "") }) },
    achievements: { q: "achievements?select=id,kind,title,description,achieved_on&status=eq.published&order=achieved_on.desc.nullslast,created_at.desc&limit=100", map: r => ({ id: r.id, kind: r.kind, title: esc(r.title), text: esc(r.description || ""), date: r.achieved_on }) }
  };
  const api = {
    err: {},
    list: async name => {
      if (live && LIVE[name]) {   // فشل الاتصال لا يكسر الموقع: نعيد [] ونسجّل الخطأ لعرض رسالة مع إعادة المحاولة
        try { const rows = await SB.rest(LIVE[name].q); api.err[name] = false; return rows.map(LIVE[name].map); }
        catch (e) { api.err[name] = true; return []; }
      }
      // لا بيانات تجريبية إلا في الوضع التجريبي المحلي الصريح. بدونه تُعرض حالات فارغة.
      if (name === "news" || name === "announcements") { if (!live && !DEMO) return []; }
      return (R[name] || []).filter(x => (!x.status || x.status === "published") && (DEMO || !x.demo));
    },
    obj: async name => R[name]
  };

  /* ---------- أيقونات ---------- */
  const P = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', school: '<path d="M3 9l9-5 9 5-9 5zM7 12v5c3 2 7 2 10 0v-5"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-3 0M8 9h5M8 13h5"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 0 1 0 6M22 20c0-3-2-5-5-5.5"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 3-2 6 5"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>', leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15zM5 19l8-8"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.3.3-2.5 1.7-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/>', flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
    trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 14v4M8 20h8"/>', chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>', megaphone: '<path d="M4 10v4h3l8 4V6L7 10zM18 9a4 4 0 0 1 0 6"/>',
    inbox: '<path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', alert: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>', file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>'
  };
  /* نظام أيقونات واحد: شبكة 24، خط 1.75، مقاسات 16/20/24/32 فقط */
  const SZ = [16, 20, 24, 32], snap = n => SZ.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  const ico = (n, s = 20) => `<svg viewBox="0 0 24 24" width="${snap(s)}" height="${snap(s)}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.book}</svg>`;
  const arrow = () => `<span class="ar"><span class="flip">${ico("arrow", 16)}</span></span>`;

  /* ---------- نظام الصور ----------
     pic(id, {sizes, ratio, eager, cls}) → <picture> مع srcset، أبعاد، لون تحميل، object-position، وصورة بديلة عند الخطأ.
     ratio: نسبة العرض/الارتفاع لهذا الموضع (قصّ مقصود). بدونها تُعرض الصورة بنسبتها الأصلية (مفيد للمعرض). */
  const FALLBACK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#c9d4df"/><path d="M110 200l60-70 45 50 30-30 55 50z" fill="#fff" fill-opacity=".6"/><circle cx="270" cy="105" r="18" fill="#fff" fill-opacity=".6"/></svg>');
  const pic = (id, o = {}) => {
    if (typeof id === "string" && /^https?:\/\//i.test(id)) {   // صورة خارجية (من قاعدة البيانات): URL مُعقَّم مسبقًا
      return `<picture class="pic ${o.cls || ""}" style="--lq:#c9d4df;--pos:50% 50%;aspect-ratio:${o.ratio || "16/10"}"><img src="${id}" alt="${o.alt ?? ""}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('on')" onerror="this.onerror=null;this.src='${FALLBACK}';this.parentNode.classList.add('on')"></picture>`;
    }
    const im = R.images[id];
    if (!im) return `<div class="ph" role="img" aria-label="صورة قريبًا"><span>${ico("image", 30)}</span></div>`;
    const set = f => [480, 960, 1600].map(w => `assets/images/${f}-${w}.webp ${w}w`).join(", ");
    const mob = im.mobile ? `<source media="(max-width: 640px)" srcset="assets/images/${im.mobile}-480.webp 480w, assets/images/${im.mobile}-960.webp 960w" sizes="100vw">` : "";
    const style = `--lq:${im.bg};--pos:${im.pos};` + (o.ratio ? `aspect-ratio:${o.ratio};` : `aspect-ratio:${im.w}/${im.h};`);
    return `<picture class="pic ${o.cls || ""}" style="${style}">${mob}<img src="assets/images/${im.file}-960.webp" srcset="${set(im.file)}" sizes="${o.sizes || "100vw"}" width="${im.w}" height="${im.h}" alt="${o.alt ?? im.alt}" ${o.eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} onload="this.parentNode.classList.add('on')" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${FALLBACK}';this.parentNode.classList.add('on')"></picture>`;
  };

  /* ---------- لغة ومساعدات ---------- */
  let lang = localStorage.getItem("lang") === "fr" ? "fr" : "ar";
  const t = k => (R.i18n[lang] && R.i18n[lang][k]) || R.i18n.ar[k] || k;
  const loc = lang => (lang === "fr" ? "fr-FR" : "ar-MA-u-nu-latn");
  const fmt = d => new Date(d).toLocaleDateString(loc(lang), { day: "numeric", month: "long", year: "numeric" });
  const dayDiff = d => Math.round((new Date(new Date().toDateString()) - new Date(new Date(d).toDateString())) / 864e5);
  const group = d => { const n = dayDiff(d); return n <= 0 ? "اليوم" : n === 1 ? "أمس" : n < 7 ? "هذا الأسبوع" : "قبل ذلك"; };
  const demoTag = x => (x.demo ? `<span class="tag tag--demo">${t("demo")}</span>` : "");
  const EMPTY = { news: ["لا توجد أخبار منشورة حاليًا", "ستظهر الأخبار هنا فور نشرها من إدارة المؤسسة."], ann: ["لا توجد إعلانات حاليًا", "تُعرض هنا الإعلانات الرسمية السارية فقط."] };
  const empty = (hint, title) => `<div class="empty"><span class="empty__i">${ico("inbox", 24)}</span>${title ? `<b>${title}</b>` : ""}<small>${hint || ""}</small></div>`;
  const share = async (title, url = location.href) => {
    try { if (navigator.share) return await navigator.share({ title, url }); await navigator.clipboard.writeText(url); toast(t("copied")); } catch (e) {}
  };
  const toast = m => { const e = document.createElement("div"); e.className = "toast"; e.textContent = m; document.body.append(e); setTimeout(() => e.remove(), 2200); };
  const WD = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  /* ---------- Navigation ---------- */
  function renderNav() {
    const links = R.nav.map(n => `<a href="#${n.id}" data-sec="${n.id}">${n[lang]}</a>`).join("");
    $("#nav").innerHTML = links; $("#footNav").innerHTML = links;
    const b = R.bottomNav.map(id => R.nav.find(n => n.id === id));
    $("#bottom").innerHTML = b.map(n => `<a href="#${n.id}" data-sec="${n.id}">${ico(n.icon)}<span>${n[lang].split(" ")[0]}</span></a>`).join("") + `<button type="button" id="moreBtn" aria-haspopup="dialog">${ico("menu")}<span>${t("more")}</span></button>`;
    $("#sheetLinks").innerHTML = R.nav.filter(n => !R.bottomNav.includes(n.id)).map(n => `<a href="#${n.id}">${ico(n.icon)}${n[lang]}</a>`).join("");
    $("#moreBtn").onclick = () => $("#sheet").showModal();
  }

  /* ---------- Home ---------- */
  async function renderHome() {
    $("#heroMedia").innerHTML = pic("gardenHeart", { eager: true, cls: "hero__pic", ratio: "auto", sizes: "100vw" });
        $("#aboutMedia").innerHTML = pic("entrance", { ratio: "4/3", sizes: "(min-width:900px) 45vw, 100vw", cls: "a1" }) + pic("courtyard", { ratio: "1/1", sizes: "(min-width:900px) 22vw, 45vw", cls: "a2" });

    const [news, ann, ev, res] = await Promise.all([api.list("news"), api.list("announcements"), api.list("events"), api.list("resources")]);
    const byDate = (a, b) => new Date(b.date) - new Date(a.date);
    const pin = ann.find(a => a.pinned) || ann.sort(byDate)[0];
    const lastNews = [...news].sort(byDate)[0], lastRes = [...res].sort(byDate)[0], nextEv = [...ev].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const today = WD[new Date().getDay()] === "الأحد" ? "الاثنين" : WD[new Date().getDay()];
    const card = (i, label, body, href) => `<a class="tc" href="${href}"><span class="tc__i">${ico(i)}</span><small>${label}</small><b>${body}</b></a>`;
    const cards = [];   // لا تُعرض إلا البطاقات التي لها بيانات فعلية؛ وإن لم توجد يختفي القسم كله
    if (pin) cards.push(card("megaphone", "آخر إعلان", pin.title, "#announcements"));
    if (await ttAvail()) cards.push(card("clock", "استعمال الزمن", `حصص ${today}`, "#schedule"));
    if (lastNews) cards.push(card("news", "آخر خبر", lastNews.title, "#news"));
    if (nextEv) cards.push(card("cal", "أقرب نشاط", `${nextEv.title} · ${fmt(nextEv.date)}`, "#life"));
    if (lastRes) cards.push(card("book", "آخر مورد دراسي", lastRes.title, "#resources"));
    $("#todayGrid").innerHTML = cards.join(""); $("#today").hidden = !cards.length;
    const anyDemo = [pin, lastNews, lastRes, nextEv].some(x => x && x.demo);
    $("#demoToday").textContent = DEMO && anyDemo ? R.site.demoNotice : "";

    /* أهم الأخبار: خبر رئيسي + حتى 3 */
    let feat = news.filter(n => n.featured).sort(byDate);
    if (!feat.length) feat = [...news].sort(byDate).slice(0, 4);   // لا يوجد 'مهم' → أحدث الأخبار
    const [main, ...side] = feat;
    $("#topNews").innerHTML = main ? `
      <article class="nm"><a class="nm__img" href="${main.url}" tabindex="-1" aria-hidden="true">${pic(main.image, { ratio: "16/10", sizes: "(min-width:900px) 55vw, 100vw" })}</a>
        <div class="nm__b"><div class="meta"><span class="tag">${main.category}</span><time datetime="${main.date}">${fmt(main.date)}</time>${demoTag(main)}</div>
        <h3><a href="${main.url}">${main.title}</a></h3><p>${main.excerpt}</p>
        <div class="row"><a class="btn btn--primary btn--sm" href="${main.url}"><span>${t("readMore")}</span>${arrow()}</a><button class="btn-icon" type="button" data-share="${main.title}" data-url="${main.url}" aria-label="${t("share")}">${ico("share", 18)}</button></div></div></article>
      <div class="ns">${side.slice(0, 3).map(n => `<article class="nsi"><a class="nsi__img" href="${n.url}" tabindex="-1" aria-hidden="true">${pic(n.image, { ratio: "1/1", sizes: "120px" })}</a>
        <div><div class="meta"><span class="tag">${n.category}</span><time datetime="${n.date}">${fmt(n.date)}</time></div><h3><a href="${n.url}">${n.title}</a></h3></div></article>`).join("")}</div>` : empty(EMPTY.news[1], EMPTY.news[0]);

    /* Feed زمني */
    const groups = {};
    [...news].sort(byDate).forEach(n => (groups[group(n.date)] ||= []).push(n));
    $("#feed").innerHTML = Object.entries(groups).map(([g, items]) => `<li class="fg"><h3>${g}</h3><ul>${items.map(n => `<li><time datetime="${n.date}">${fmt(n.date)}</time><span class="tag">${n.category}</span><a href="${n.url}">${n.title}</a></li>`).join("")}</ul></li>`).join("") || empty(EMPTY.news[1], EMPTY.news[0]);

    /* الإعلانات: المثبّت أولًا */
    const ordered = [...ann].sort((a, b) => (b.pinned - a.pinned) || byDate(a, b));
    $("#annList").innerHTML = ordered.map(a => `<article class="an ${a.pinned ? "an--pin" : ""}"><div class="meta"><span class="tag tag--${a.pinned ? "accent" : "type"}">${a.pinned ? ico("pin", 14) + " " : ""}${a.type}</span><time datetime="${a.date}">${fmt(a.date)}</time>${demoTag(a)}</div><h3>${a.title}</h3><p>${a.body}</p>${a.file ? `<a class="link" href="${a.file}" download>تحميل الوثيقة</a>` : ""}</article>`).join("") || empty(EMPTY.ann[1], EMPTY.ann[0]);
    const errBox = what => `<div class="empty err" role="alert">تعذّر تحميل ${what} حاليًا. <button type="button" class="btn btn--sm btn--primary" data-retry>إعادة المحاولة</button></div>`;
    if (api.err.news) { $("#topNews").innerHTML = errBox("الأخبار"); $("#feed").innerHTML = ""; }
    if (api.err.announcements) $("#annList").innerHTML = errBox("الإعلانات");
  }

  /* ---------- الخدمات المدرسية: لا تُعرض خدمة غير متاحة على أنها عاملة ---------- */
  let _ttAvail; const ttAvail = () => (_ttAvail ||= live ? SB.rest("timetables?select=id&status=eq.published&limit=1").then(r => r.length > 0).catch(() => false) : Promise.resolve(!(R.schedule.demo && !DEMO)));
  async function renderServices() {
    const [clubs, acts, res] = await Promise.all([api.list("clubs"), api.list("activities"), api.list("resources")]);
    const A = { news: live || DEMO, schedule: await ttAvail(), resources: res.length > 0, life: clubs.length + acts.length > 0, achievements: (await api.list("achievements")).length > 0, about: true };
    const S = [["clock", "استعمال الزمن", "حصص الأقسام حسب المستوى", "#schedule", "schedule"], ["news", "الأخبار والإعلانات", "الأخبار والإعلانات الرسمية للمؤسسة", "#news", "news"],
      ["book", "الدروس والموارد", "دروس وتمارين وملخصات حسب المستوى والمادة", "#resources", "resources"], ["users", "الأندية والأنشطة", "الحياة المدرسية والأندية", "#life", "life"],
      ["trophy", "الإنجازات", "الجوائز والمشاركات الموثقة", "#achievements", "achievements"], ["school", "المؤسسة والتواصل", "معلومات المؤسسة وبيانات التواصل", "#about", "about"]];
    $("#svcGrid").innerHTML = S.map(([i, ti, d, href, k]) => `<div class="sv-w">${A[k]
      ? `<a class="sv" href="${href}"><span class="sv__i">${ico(i, 24)}</span><h3>${ti}</h3><span class="sv__arr"><span class="flip">${ico("arrow", 20)}</span></span><p>${d}</p></a>`
      : `<div class="sv sv--off" aria-disabled="true"><span class="sv__i">${ico(i, 24)}</span><h3>${ti}</h3><span class="tag">قريبًا</span><p>${d}</p></div>`}</div>`).join("");
  }
  /* ---------- إحصائيات: فقط الأرقام الموثقة (confirmed:true) ---------- */
  function renderStats() {
    const st = (R.stats || []).filter(x => x.confirmed === true && Number(x.value) > 0 && x.label);
    $("#stats").hidden = !st.length; if (!st.length) return;
    $("#statsGrid").innerHTML = st.map(x => `<div class="stat"><b data-to="${Number(x.value)}">0</b><span>${esc(x.label)}</span></div>`).join("");
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); e.target.querySelectorAll("[data-to]").forEach(el => {
      const to = +el.dataset.to, t0 = performance.now(); if (rm) { el.textContent = to; return; }
      const tick = n => { const p = Math.min((n - t0) / 1200, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }); }), { threshold: .3 });
    io.observe($("#statsGrid"));
  }

  /* ---------- الحياة المدرسية / الإنجازات / المرافق ---------- */
  async function renderLife() {
    const [acts, clubs, fac, ach] = await Promise.all([api.list("activities"), api.list("clubs"), api.list("facilities"), api.list("achievements")]);
    $("#actGrid").innerHTML = !acts.length ? empty("تُعرض الأنشطة المدرسية هنا عند إضافتها من إدارة المؤسسة.", "الأنشطة المدرسية") : acts.map(a => `<article class="card card--ico"><span class="ico">${ico(a.icon, 26)}</span><h3>${a.title}</h3><p>${a.text}</p></article>`).join("");
    $("#clubs").innerHTML = !clubs.length ? empty("تُعرض الأندية هنا بعد اعتماد أسمائها رسميًا.", "أندية المؤسسة") : clubs.map(c => `<div class="club">${ico(c.icon, 20)}<div><b>${c.name}</b><small>${c.text}</small></div></div>`).join("");
    $("#achGrid").innerHTML = !ach.length ? empty("تُنشر هنا الجوائز والمسابقات والنتائج والمشاريع والتكريمات والمشاركات بعد توثيقها رسميًا.", "إنجازات المؤسسة") : R.achievementKinds.map(k => {
      const items = ach.filter(a => a.kind === k.kind);
      return `<article class="card card--ico"><span class="ico">${ico(k.icon, 26)}</span><h3>${k.kind}</h3><p>${items.length ? items.map(i => i.title).join("، ") : "سيتم النشر بعد التوثيق الرسمي."}</p></article>`;
    }).join("");
    $("#facGrid").innerHTML = !fac.length ? empty("تُعرض المرافق هنا بعد توثيقها بالصور.", "مرافق المؤسسة") : fac.map(f => `<article class="card card--fac">${f.image ? pic(f.image, { ratio: "4/3", sizes: "(min-width:900px) 30vw, 100vw" }) : `<div class="ph" role="img" aria-label="صورة قريبًا"><span>${ico("image", 30)}</span></div>`}<div class="card__b"><h3>${f.name}</h3><p>${f.text}</p></div></article>`).join("");
  }

  /* ---------- الدروس والموارد: المستوى ← المادة ← النوع ← الملف ---------- */
  async function renderResources() {
    const items = await api.list("resources");
    const lvName = id => (R.schedule.levels.find(l => l.id === id) || { name: id }).name, levels = [...new Set(items.map(i => i.levelId))].map(id => ({ id, name: lvName(id) }));
    if (!items.length) { $("#resLevels").closest(".panel").innerHTML = empty("ستظهر الدروس والتمارين والملخصات هنا مصنفة حسب المستوى والمادة عند نشرها.", "الدروس والموارد"); return; }
    const st = { level: levels[0].id, subject: "all", type: "all", q: "" };
    $("#demoRes").textContent = items.some(i => i.demo) ? R.site.demoNotice : "";
    $("#resType").innerHTML = `<option value="all">كل الأنواع</option>` + R.resourceTypes.map(x => `<option>${x}</option>`).join("");
    const chip = (v, l, on) => `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`;
    const draw = () => {
      $("#resLevels").innerHTML = levels.map(l => chip(l.id, l.name, l.id === st.level)).join("");
      const subs = [...new Set(items.filter(i => i.levelId === st.level).map(i => i.subject))];
      $("#resSubjects").innerHTML = chip("all", "كل المواد", st.subject === "all") + subs.map(s => chip(s, s, s === st.subject)).join("");
      const res = items.filter(i => i.levelId === st.level && (st.subject === "all" || i.subject === st.subject) && (st.type === "all" || i.type === st.type) && String(i.title).includes(st.q));
      $("#resCrumb").textContent = [levels.find(l => l.id === st.level).name, st.subject === "all" ? "كل المواد" : st.subject, st.type === "all" ? "كل الأنواع" : st.type].join(" ‹ ");
      $("#resList").innerHTML = res.map(r => `<li class="ri"><span class="ri__i">${ico("file")}</span><div><b>${r.title}</b><small>${esc(r.subject)}${r.unit ? " · " + esc(r.unit) : ""} · <span class="tag">${esc(r.type)}</span></small></div>${r.file ? `<a class="btn btn--primary btn--sm" href="${r.file}" download>تحميل</a>` : `<span class="soon">قريبًا</span>`}</li>`).join("") || empty("جرّب تغيير الفلتر أو كلمات البحث.", "لا توجد نتائج");
    };
    $("#resLevels").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.level = b.dataset.v; st.subject = "all"; draw(); } };
    $("#resSubjects").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.subject = b.dataset.v; draw(); } };
    $("#resType").onchange = e => { st.type = e.target.value; draw(); };
    $("#resSearch").oninput = e => { st.q = e.target.value.trim(); draw(); };
    draw();
  }

  /* ---------- استعمال الزمن ---------- */
  /* استعمال الزمن المنشور من قاعدة البيانات: مستوى ← قسم ← يوم + شبكة أسبوعية + طباعة/PDF. لا مسودات (RLS) ولا بيانات تجريبية. */
  async function renderScheduleLive() {
    const panel = $("#schLevel").closest(".panel");
    let tts; try { tts = await SB.rest("timetables?select=id,school_year,level,class_name,days,notes&status=eq.published&order=school_year.desc,level.asc,class_name.asc&limit=300"); }
    catch (e) { panel.innerHTML = `<div class="empty err" role="alert">تعذّر تحميل استعمال الزمن حاليًا. <button type="button" class="btn btn--sm btn--primary" data-retry-sch>إعادة المحاولة</button></div>`; panel.querySelector("[data-retry-sch]").onclick = () => location.reload(); return; }
    if (!tts.length) { panel.innerHTML = empty("سيظهر استعمال الزمن هنا بعد نشره من إدارة المؤسسة.", "لا يوجد استعمال زمن منشور"); return; }
    const levels = [...new Set(tts.map(x => x.level))], cache = {};
    const st = { level: levels[0], tt: null, day: null };
    $("#schDays").classList.add("tt-daymode"); $("#schList").classList.add("tt-daymode"); $("#schGrid").hidden = false; $("#schBar").hidden = false;
    $("#schLevel").innerHTML = levels.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
    const pickDay = tt => { const d = ((new Date().getDay() + 6) % 7) + 1, ds = [...tt.days].sort((a, b) => a - b); return ds.includes(d) ? d : ds[0]; };
    async function detail(tt) { if (!cache[tt.id]) { const [periods, entries] = await Promise.all([SB.rest(`timetable_periods?timetable_id=eq.${encodeURIComponent(tt.id)}&select=slot_no,label,starts_at,ends_at,is_break&order=starts_at.asc`), SB.rest(`timetable_entries?timetable_id=eq.${encodeURIComponent(tt.id)}&select=day,slot_no,subject,teacher_name,room,note`)]); cache[tt.id] = { periods, entries }; } return cache[tt.id]; }
    async function draw() {
      const cl = tts.filter(x => x.level === st.level); if (!st.tt || st.tt.level !== st.level) { st.tt = cl[0]; st.day = pickDay(st.tt); }
      $("#schClass").innerHTML = cl.map(c => `<option value="${esc(c.id)}" ${c.id === st.tt.id ? "selected" : ""}>${esc(c.class_name)}</option>`).join("");
      $("#schDays").innerHTML = [...st.tt.days].sort((a, b) => a - b).map(d => `<button type="button" class="chip" data-v="${d}" aria-pressed="${d === st.day}">${TT.DAYS[d]}</button>`).join("");
      try {
        const d = await detail(st.tt); $("#schList").innerHTML = TT.dayHTML(st.tt, d.periods, d.entries, st.day).html; $("#schGrid").innerHTML = TT.gridHTML(st.tt, d.periods, d.entries);
        $("#schInfo").textContent = `السنة الدراسية ${st.tt.school_year}`; $("#schPrint").onclick = () => TT.print(st.tt, d.periods, d.entries);
      } catch (e) { $("#schList").innerHTML = `<li class="empty err" role="alert">تعذّر تحميل تفاصيل الجدول. حاول مجددًا.</li>`; }
    }
    $("#schLevel").onchange = e => { st.level = e.target.value; st.tt = null; draw(); };
    $("#schClass").onchange = e => { st.tt = tts.find(x => x.id === e.target.value); st.day = pickDay(st.tt); draw(); };
    $("#schDays").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.day = +b.dataset.v; draw(); } };
    draw();
  }
  async function renderSchedule() {
    if (live) return renderScheduleLive();
    const S = await api.obj("schedule"), teachers = await api.list("teachers");
    if (S.demo && !DEMO) { $("#schLevel").closest(".panel").innerHTML = empty("سيظهر استعمال الزمن هنا بعد اعتماده رسميًا من الإدارة.", "استعمال الزمن"); return; }
    const st = { level: S.levels[0].id, cls: null, day: S.days[Math.max(0, new Date().getDay() - 1)] || S.days[0] };
    $("#demoSch").textContent = S.demo ? R.site.demoNotice : "";
    $("#schLevel").innerHTML = S.levels.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
    const draw = () => {
      const cl = S.classes.filter(c => c.levelId === st.level);
      if (!cl.find(c => c.id === st.cls)) st.cls = cl[0].id;
      $("#schClass").innerHTML = cl.map(c => `<option value="${c.id}" ${c.id === st.cls ? "selected" : ""}>${c.name}</option>`).join("");
      $("#schDays").innerHTML = S.days.map(d => `<button type="button" class="chip" data-v="${d}" aria-pressed="${d === st.day}">${d}</button>`).join("");
      const rows = S.entries.filter(e => e.classId === st.cls && e.day === st.day).sort((a, b) => a.slot - b.slot);
      $("#schList").innerHTML = rows.map(e => `<li class="ss"><div class="ss__t"><b>${S.slots[e.slot - 1].time}</b><small>الحصة ${e.slot}</small></div><div class="ss__m"><b>${e.subject}</b><small>${(teachers.find(t => t.id === e.teacherId) || {}).name || "—"} · ${e.room}</small></div></li>`).join("") || empty("لا توجد حصص مسجلة لهذا اليوم.", "لا حصص");
    };
    $("#schLevel").onchange = e => { st.level = e.target.value; draw(); };
    $("#schClass").onchange = e => { st.cls = e.target.value; draw(); };
    $("#schDays").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.day = b.dataset.v; draw(); } };
    draw();
  }

  /* ---------- الأساتذة ---------- */
  async function renderTeachers() {
    const all = await api.list("teachers");
    if (!all.length) { $("#teaSearch").closest(".filters").hidden = true; $("#teaGrid").innerHTML = empty("تُعرض أسماء الأساتذة والأطر هنا بعد اعتماد القائمة من الإدارة.", "أساتذة وأطر المؤسسة"); return; }
    $("#demoTea").textContent = DEMO ? R.site.demoNotice : "";
    $("#teaSubject").innerHTML = `<option value="all">كل المواد</option>` + [...new Set(all.map(t => t.subject))].map(s => `<option>${s}</option>`).join("");
    const draw = () => {
      const s = $("#teaSubject").value, q = $("#teaSearch").value.trim();
      $("#teaGrid").innerHTML = all.filter(t => (s === "all" || t.subject === s) && t.name.includes(q)).map(t => `<article class="card tcard"><div class="av">${t.photo ? pic(t.photo, { ratio: "1/1", sizes: "120px" }) : ico("users", 34)}</div><h3>${t.name}</h3><p>${t.subject}</p><small>${t.role}</small></article>`).join("") || empty("جرّب تغيير الفلتر أو كلمات البحث.", "لا توجد نتائج");
    };
    $("#teaSubject").onchange = draw; $("#teaSearch").oninput = draw; draw();
  }

  /* ---------- المعرض: Masonry + Lightbox (سحب + ملء الشاشة) ---------- */
  async function renderGallery() {
    let items = await api.list("gallery");
    if (live && !items.length && !api.err.gallery) items = R.gallery;   // لم تُرفع صور بعد: تبقى صور المؤسسة الأربع الحقيقية
    let cat = "all", shown = items, cur = 0;
    const cats = ["all", ...R.galleryCategories];
    const draw = () => {
      $("#galCats").innerHTML = cats.map(c => `<button type="button" class="chip" data-v="${c}" aria-pressed="${c === cat}">${c === "all" ? "الكل" : c}</button>`).join("");
      shown = items.filter(i => cat === "all" || i.category === cat);
  $("#galGrid").innerHTML = api.err.gallery ? `<div class="empty err" role="alert"><b>تعذّر تحميل المعرض حاليًا</b><button type="button" class="btn btn--sm btn--primary" data-retry-gal>إعادة المحاولة</button></div>`
      : shown.map((g, i) => `<button type="button" class="mi" data-i="${i}" aria-label="${g.caption}">${pic(g.image, { sizes: "(min-width:900px) 30vw, 50vw", alt: g.caption, ratio: g.live ? "auto" : undefined })}</button>`).join("") || empty("تُضاف صور هذا التصنيف عند توفرها.", "لا توجد صور في هذا التصنيف");
    };
    $("#galCats").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { cat = b.dataset.v; draw(); } };
    $("#galGrid").addEventListener("click", e => { if (e.target.closest("[data-retry-gal]")) renderGallery(); });
    const lb = $("#lightbox"), img = $("#lbImg");
    const show = i => {
      cur = (i + shown.length) % shown.length; const g = shown[cur], src = x => (/^https?:\/\//.test(x.image) ? x.image : `assets/images/${R.images[x.image].file}-1600.webp`);
      img.src = src(g); img.alt = g.caption; $("#lbCap").textContent = g.caption; $("#lbCount").textContent = `${cur + 1} / ${shown.length}`;
      const nx = new Image(); nx.src = src(shown[(cur + 1) % shown.length]);
    };
    $("#galGrid").onclick = e => { const b = e.target.closest("[data-i]"); if (b) { show(+b.dataset.i); lb.showModal(); } };
    const prev = () => show(cur - 1), next = () => show(cur + 1);
    $(".lb__prev").onclick = prev; $(".lb__next").onclick = next; $(".lb__x").onclick = () => lb.close();
    $(".lb__fs").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : lb.requestFullscreen?.());
    lb.addEventListener("keydown", e => { if (e.key === "ArrowLeft") next(); if (e.key === "ArrowRight") prev(); });
    lb.addEventListener("click", e => e.target === lb && lb.close());
    let x0 = null;   // Swipe
    $("#lbFig").addEventListener("pointerdown", e => (x0 = e.clientX));
    $("#lbFig").addEventListener("pointerup", e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) (dx < 0 ? next : prev)(); });
    draw();
  }

  /* ---------- الموقع والتواصل ---------- */
  async function loadSettings() {   // معلومات المؤسسة من لوحة الإدارة (site_settings)؛ الفشل لا يكسر الصفحة
    if (!live) return;
    try {
      const m = {}; (await SB.rest("site_settings?select=key,value")).forEach(r => (m[r.key] = r.value));
      const S = R.site; S.phone = m.phone || S.phone; S.email = m.email || S.email; S.facebook = safeUrlRaw(m.facebook) || S.facebook; S.instagram = safeUrlRaw(m.instagram); S.youtube = safeUrlRaw(m.youtube); S.website = safeUrlRaw(m.website) || S.website;
      S.addressOverride = m.address || null; S.aboutText = m.about_text || null;
      if (m.maps_embed_url && /^https:\/\/www\.google\.com\/maps\/embed/i.test(m.maps_embed_url)) S.mapsEmbed = m.maps_embed_url;
    } catch (e) {}
  }
  const safeUrlRaw = u => (/^https:\/\/[^\s"'<>]+$/i.test(u || "") ? u : null);
  function renderContact() {
    const s = R.site, addr = s.addressOverride || `${s.city} – ${s.province} – ${s.country}`;
    $("#addr").textContent = addr; $("#footAddr").textContent = addr; $("#mapBtn").href = s.mapsLink;
    $("#mapBox").innerHTML = s.mapsEmbed ? `<iframe src="${esc(s.mapsEmbed)}" title="خريطة المؤسسة" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : `<a href="${s.mapsLink}" target="_blank" rel="noopener">${ico("pin", 34)}<span>${esc(addr)}</span></a>`;
    const row = (l, v, link) => `<div><dt>${l}</dt><dd>${v ? (link ? `<a href="${link}${encodeURI(v)}">${esc(v)}</a>` : esc(v)) : t("soon")}</dd></div>`;
    const ext = (l, u) => `<div><dt>${l}</dt><dd>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l === "الموقع" ? u.replace(/^https:\/\//, "") : "فتح الصفحة")}</a>` : t("soon")}</dd></div>`;
    $("#contactList").innerHTML = row("الهاتف", s.phone, "tel:") + row("البريد", s.email, "mailto:") + row("العنوان", addr) + ext("Facebook", s.facebook) + (s.instagram ? ext("Instagram", s.instagram) : "") + (s.youtube ? ext("YouTube", s.youtube) : "") + ext("الموقع", s.website);
    const p2 = $("#aboutP2"); if (p2 && s.aboutText) { p2.textContent = s.aboutText; p2.style.whiteSpace = "pre-line"; }
    $("#year").textContent = new Date().getFullYear();
  }


  /* ---------- قراءة الخبر (نص عادي فقط: textContent، لا HTML) ---------- */
  async function openArticle(id) {
    const dlg = $("#article"), box = $("#articleBody"); box.textContent = "جارٍ التحميل…"; dlg.showModal();
    try {
      const rows = live ? await SB.rest(`news?select=title,excerpt,content,image_url,category,published_at&id=eq.${encodeURIComponent(id)}&status=eq.published`) : [];
      const n = rows[0]; if (!n) { box.textContent = "هذا الخبر غير متاح."; return; }
      box.replaceChildren();
      const mk = (tag, txt, cls) => { const e = document.createElement(tag); e.textContent = txt; if (cls) e.className = cls; box.append(e); return e; };
      mk("span", n.category || "خبر", "tag"); mk("h2", n.title);
      const sh = mk("button", "مشاركة الخبر", "btn btn--sm btn--outline"); sh.type = "button"; sh.onclick = () => share(n.title, location.origin + location.pathname + "#news/" + encodeURIComponent(id));
      mk("time", fmt(n.published_at), "art__date");
      const u = safeUrl(n.image_url); if (u) { const im = document.createElement("img"); im.src = n.image_url; im.alt = ""; im.referrerPolicy = "no-referrer"; im.className = "art__img"; box.append(im); }
      (n.content || n.excerpt || "").split(/\n{2,}/).forEach(par => par.trim() && mk("p", par.trim(), "art__p"));
    } catch (e) { box.textContent = "تعذّر تحميل الخبر. حاول لاحقًا."; }
  }

  /* ---------- Reveal + scroll-spy + UI ---------- */
  function observe() {
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
    document.querySelector('[data-sec="top"]')?.classList.add("act");
    document.querySelectorAll(".section .wrap > *, .quick").forEach(el => { if (rm) el.classList.add("in"); else { el.classList.add("rv"); io.observe(el); } });
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; const id = e.target.id;
      document.querySelectorAll("[data-sec]").forEach(a => a.classList.toggle("act", a.dataset.sec === id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    R.nav.forEach(n => { const el = document.getElementById(n.id); if (el) spy.observe(el); });
  }
  function bindUI() {
    const syncTheme = () => $("#themeBtn").setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
    $("#themeBtn").onclick = () => { const n = root.dataset.theme === "dark" ? "light" : "dark"; root.dataset.theme = n; root.style.backgroundColor = n === "dark" ? "#0F1A16" : "#F7F5EF"; localStorage.setItem("theme", n); syncTheme(); }; syncTheme();
    // ميل ثلاثي الأبعاد خفيف لبطاقات الخدمات (ماوس فقط، ويُعطَّل مع تقليل الحركة)
    if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const g = $("#svcGrid");
      // المستمع على غلاف ثابت (لا يتحرك) كي لا تتذبذب البطاقة عند الحواف أثناء دورانها
      g.addEventListener("pointermove", e => { const w = e.target.closest(".sv-w"), c = w && w.querySelector("a.sv"); if (!c) return; const r = w.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; c.style.setProperty("--ry", (x * 7).toFixed(2) + "deg"); c.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg"); });
      g.addEventListener("pointerout", e => { const w = e.target.closest(".sv-w"), c = w && w.querySelector("a.sv"); if (c && !w.contains(e.relatedTarget)) { c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); } });
    }
    $("#langBtn").onclick = () => { lang = lang === "ar" ? "fr" : "ar"; localStorage.setItem("lang", lang); applyLang(); renderNav(); };
    $(".sheet__x").onclick = () => $("#sheet").close();
    $("#article .art__x").onclick = () => { $("#article").close(); history.replaceState(null, "", "#news"); };
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#news/"]'); if (a) { e.preventDefault(); history.replaceState(null, "", a.getAttribute("href")); openArticle(decodeURIComponent(a.getAttribute("href").slice(6))); }
      if (e.target.closest("[data-retry]")) renderHome();
    });
    $("#sheet").addEventListener("click", e => (e.target.closest("a") || e.target.id === "sheet") && $("#sheet").close());
    document.addEventListener("click", e => { const b = e.target.closest("[data-share]"); if (b) share(b.dataset.share, location.origin + location.pathname + (b.dataset.url || "")); });
    addEventListener("scroll", () => $("#header").classList.toggle("scrolled", scrollY > 8), { passive: true });
  }
  function applyLang() {
    root.lang = lang; root.dir = lang === "fr" ? "ltr" : "rtl"; $("#langLabel").textContent = lang === "ar" ? "FR" : "AR";
    document.querySelectorAll("[data-i18n]").forEach(el => (el.textContent = t(el.dataset.i18n)));
  }

  (async () => {
    if (DEMO) { const b = document.createElement("div"); b.className = "demo-bar"; b.textContent = "وضع تجريبي محلي — بيانات غير رسمية"; document.body.prepend(b); }
    applyLang(); renderNav(); bindUI(); renderContact(); loadSettings().then(renderContact);
    renderStats(); await Promise.all([renderServices(), renderHome(), renderLife(), renderResources(), renderSchedule(), renderTeachers(), renderGallery()]);
    observe();
    if (location.hash.startsWith("#news/")) openArticle(decodeURIComponent(location.hash.slice(6)));
  })();
})();
