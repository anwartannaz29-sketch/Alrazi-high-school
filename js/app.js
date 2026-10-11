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
    announcements: { q: "announcements?select=id,title,content,type,pinned,start_at,created_at&status=eq.published&order=pinned.desc,created_at.desc&limit=30", map: mapAnn }
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
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>', file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>'
  };
  const ico = (n, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.book}</svg>`;

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
  const empty = (m = t("soon")) => `<p class="empty">${m}</p>`;
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
    $("#quick").innerHTML = [["book", "الدروس", "resources"], ["clock", "استعمال الزمن", "schedule"], ["megaphone", "الإعلانات", "announcements"], ["news", "الأخبار", "news"]]
      .map(([i, l, id]) => `<a class="qt" href="#${id}">${ico(i, 26)}<span>${l}</span></a>`).join("");
    $("#aboutMedia").innerHTML = pic("entrance", { ratio: "4/3", sizes: "(min-width:900px) 45vw, 100vw", cls: "a1" }) + pic("courtyard", { ratio: "1/1", sizes: "(min-width:900px) 22vw, 45vw", cls: "a2" });

    const [news, ann, ev, res] = await Promise.all([api.list("news"), api.list("announcements"), api.list("events"), api.list("resources")]);
    const byDate = (a, b) => new Date(b.date) - new Date(a.date);
    const pin = ann.find(a => a.pinned) || ann.sort(byDate)[0];
    const lastNews = [...news].sort(byDate)[0], lastRes = [...res].sort(byDate)[0], nextEv = [...ev].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const today = WD[new Date().getDay()] === "الأحد" ? "الاثنين" : WD[new Date().getDay()];
    const card = (i, label, body, href) => `<a class="tc" href="${href}"><span class="tc__i">${ico(i)}</span><small>${label}</small><b>${body || t("soon")}</b></a>`;
    $("#todayGrid").innerHTML =
      card("megaphone", "آخر إعلان", pin && pin.title, "#announcements") +
      card("clock", "استعمال الزمن", R.schedule.demo && !DEMO ? null : `حصص ${today}`, "#schedule") +
      card("news", "آخر خبر", lastNews && lastNews.title, "#news") +
      card("cal", "أقرب نشاط", nextEv && `${nextEv.title} · ${fmt(nextEv.date)}`, "#life") +
      card("book", "آخر مورد دراسي", lastRes && lastRes.title, "#resources");
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
        <div class="row"><a class="btn btn--primary btn--sm" href="${main.url}">${t("readMore")}</a><button class="btn-icon" type="button" data-share="${main.title}" data-url="${main.url}" aria-label="${t("share")}">${ico("share", 18)}</button></div></div></article>
      <div class="ns">${side.slice(0, 3).map(n => `<article class="nsi"><a class="nsi__img" href="${n.url}" tabindex="-1" aria-hidden="true">${pic(n.image, { ratio: "1/1", sizes: "120px" })}</a>
        <div><div class="meta"><span class="tag">${n.category}</span><time datetime="${n.date}">${fmt(n.date)}</time></div><h3><a href="${n.url}">${n.title}</a></h3></div></article>`).join("")}</div>` : empty();

    /* Feed زمني */
    const groups = {};
    [...news].sort(byDate).forEach(n => (groups[group(n.date)] ||= []).push(n));
    $("#feed").innerHTML = Object.entries(groups).map(([g, items]) => `<li class="fg"><h3>${g}</h3><ul>${items.map(n => `<li><time datetime="${n.date}">${fmt(n.date)}</time><span class="tag">${n.category}</span><a href="${n.url}">${n.title}</a></li>`).join("")}</ul></li>`).join("") || empty();

    /* الإعلانات: المثبّت أولًا */
    const ordered = [...ann].sort((a, b) => (b.pinned - a.pinned) || byDate(a, b));
    $("#annList").innerHTML = ordered.map(a => `<article class="an ${a.pinned ? "an--pin" : ""}"><div class="meta"><span class="tag tag--${a.pinned ? "accent" : "type"}">${a.pinned ? "📌 " : ""}${a.type}</span><time datetime="${a.date}">${fmt(a.date)}</time>${demoTag(a)}</div><h3>${a.title}</h3><p>${a.body}</p>${a.file ? `<a class="link" href="${a.file}" download>تحميل الوثيقة</a>` : ""}</article>`).join("") || empty();
    const errBox = what => `<div class="empty err" role="alert">تعذّر تحميل ${what} حاليًا. <button type="button" class="btn btn--sm btn--primary" data-retry>إعادة المحاولة</button></div>`;
    if (api.err.news) { $("#topNews").innerHTML = errBox("الأخبار"); $("#feed").innerHTML = ""; }
    if (api.err.announcements) $("#annList").innerHTML = errBox("الإعلانات");
  }

  /* ---------- الحياة المدرسية / الإنجازات / المرافق ---------- */
  async function renderLife() {
    const [acts, clubs, fac] = await Promise.all([api.list("activities"), api.list("clubs"), api.list("facilities")]);
    $("#actGrid").innerHTML = !acts.length ? empty("سيتم نشر أنشطة المؤسسة قريبًا.") : acts.map(a => `<article class="card card--ico"><span class="ico">${ico(a.icon, 26)}</span><h3>${a.title}</h3><p>${a.text}</p></article>`).join("");
    $("#clubs").innerHTML = !clubs.length ? empty("سيتم التعريف بأندية المؤسسة قريبًا.") : clubs.map(c => `<div class="club">${ico(c.icon, 20)}<div><b>${c.name}</b><small>${c.text}</small></div></div>`).join("");
    $("#achGrid").innerHTML = R.achievementKinds.map(k => {
      const items = R.achievements.filter(a => a.kind === k.kind);
      return `<article class="card card--ico"><span class="ico">${ico(k.icon, 26)}</span><h3>${k.kind}</h3><p>${items.length ? items.map(i => i.title).join("، ") : "سيتم النشر بعد التوثيق الرسمي."}</p></article>`;
    }).join("");
    $("#facGrid").innerHTML = !fac.length ? empty("سيتم عرض مرافق المؤسسة قريبًا.") : fac.map(f => `<article class="card card--fac">${f.image ? pic(f.image, { ratio: "4/3", sizes: "(min-width:900px) 30vw, 100vw" }) : `<div class="ph" role="img" aria-label="صورة قريبًا"><span>${ico("image", 30)}</span></div>`}<div class="card__b"><h3>${f.name}</h3><p>${f.text}</p></div></article>`).join("");
  }

  /* ---------- الدروس والموارد: المستوى ← المادة ← النوع ← الملف ---------- */
  async function renderResources() {
    const items = await api.list("resources"), levels = R.schedule.levels;
    if (!items.length) { $("#resLevels").closest(".panel").innerHTML = empty("سيتم نشر الدروس والموارد الرسمية قريبًا."); return; }
    const st = { level: levels[0].id, subject: "all", type: "all", q: "" };
    $("#demoRes").textContent = items.some(i => i.demo) ? R.site.demoNotice : "";
    $("#resType").innerHTML = `<option value="all">كل الأنواع</option>` + R.resourceTypes.map(x => `<option>${x}</option>`).join("");
    const chip = (v, l, on) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${on}">${l}</button>`;
    const draw = () => {
      $("#resLevels").innerHTML = levels.map(l => chip(l.id, l.name, l.id === st.level)).join("");
      const subs = [...new Set(items.filter(i => i.levelId === st.level).map(i => i.subject))];
      $("#resSubjects").innerHTML = chip("all", "كل المواد", st.subject === "all") + subs.map(s => chip(s, s, s === st.subject)).join("");
      const res = items.filter(i => i.levelId === st.level && (st.subject === "all" || i.subject === st.subject) && (st.type === "all" || i.type === st.type) && i.title.includes(st.q));
      $("#resCrumb").textContent = [levels.find(l => l.id === st.level).name, st.subject === "all" ? "كل المواد" : st.subject, st.type === "all" ? "كل الأنواع" : st.type].join(" ‹ ");
      $("#resList").innerHTML = res.map(r => `<li class="ri"><span class="ri__i">${ico("file")}</span><div><b>${r.title}</b><small>${r.subject} · ${r.unit} · <span class="tag">${r.type}</span></small></div>${r.file ? `<a class="btn btn--primary btn--sm" href="${r.file}" download>تحميل</a>` : `<span class="soon">قريبًا</span>`}</li>`).join("") || empty("لا توجد نتائج.");
    };
    $("#resLevels").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.level = b.dataset.v; st.subject = "all"; draw(); } };
    $("#resSubjects").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.subject = b.dataset.v; draw(); } };
    $("#resType").onchange = e => { st.type = e.target.value; draw(); };
    $("#resSearch").oninput = e => { st.q = e.target.value.trim(); draw(); };
    draw();
  }

  /* ---------- استعمال الزمن ---------- */
  async function renderSchedule() {
    const S = await api.obj("schedule"), teachers = await api.list("teachers");
    if (S.demo && !DEMO) { $("#schLevel").closest(".panel").innerHTML = empty("سيتم نشر استعمال الزمن الرسمي قريبًا."); return; }
    const st = { level: S.levels[0].id, cls: null, day: S.days[Math.max(0, new Date().getDay() - 1)] || S.days[0] };
    $("#demoSch").textContent = S.demo ? R.site.demoNotice : "";
    $("#schLevel").innerHTML = S.levels.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
    const draw = () => {
      const cl = S.classes.filter(c => c.levelId === st.level);
      if (!cl.find(c => c.id === st.cls)) st.cls = cl[0].id;
      $("#schClass").innerHTML = cl.map(c => `<option value="${c.id}" ${c.id === st.cls ? "selected" : ""}>${c.name}</option>`).join("");
      $("#schDays").innerHTML = S.days.map(d => `<button type="button" class="chip" data-v="${d}" aria-pressed="${d === st.day}">${d}</button>`).join("");
      const rows = S.entries.filter(e => e.classId === st.cls && e.day === st.day).sort((a, b) => a.slot - b.slot);
      $("#schList").innerHTML = rows.map(e => `<li class="ss"><div class="ss__t"><b>${S.slots[e.slot - 1].time}</b><small>الحصة ${e.slot}</small></div><div class="ss__m"><b>${e.subject}</b><small>${(teachers.find(t => t.id === e.teacherId) || {}).name || "—"} · ${e.room}</small></div></li>`).join("") || empty("لا توجد حصص.");
    };
    $("#schLevel").onchange = e => { st.level = e.target.value; draw(); };
    $("#schClass").onchange = e => { st.cls = e.target.value; draw(); };
    $("#schDays").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.day = b.dataset.v; draw(); } };
    draw();
  }

  /* ---------- الأساتذة ---------- */
  async function renderTeachers() {
    const all = await api.list("teachers");
    if (!all.length) { $("#teaSearch").closest(".filters").hidden = true; $("#teaGrid").innerHTML = empty("سيتم التعريف بأساتذة وأطر المؤسسة قريبًا."); return; }
    $("#demoTea").textContent = DEMO ? R.site.demoNotice : "";
    $("#teaSubject").innerHTML = `<option value="all">كل المواد</option>` + [...new Set(all.map(t => t.subject))].map(s => `<option>${s}</option>`).join("");
    const draw = () => {
      const s = $("#teaSubject").value, q = $("#teaSearch").value.trim();
      $("#teaGrid").innerHTML = all.filter(t => (s === "all" || t.subject === s) && t.name.includes(q)).map(t => `<article class="card tcard"><div class="av">${t.photo ? pic(t.photo, { ratio: "1/1", sizes: "120px" }) : ico("users", 34)}</div><h3>${t.name}</h3><p>${t.subject}</p><small>${t.role}</small></article>`).join("") || empty("لا توجد نتائج.");
    };
    $("#teaSubject").onchange = draw; $("#teaSearch").oninput = draw; draw();
  }

  /* ---------- المعرض: Masonry + Lightbox (سحب + ملء الشاشة) ---------- */
  async function renderGallery() {
    const items = await api.list("gallery");
    let cat = "all", shown = items, cur = 0;
    const cats = ["all", ...R.galleryCategories];
    const draw = () => {
      $("#galCats").innerHTML = cats.map(c => `<button type="button" class="chip" data-v="${c}" aria-pressed="${c === cat}">${c === "all" ? "الكل" : c}</button>`).join("");
      shown = items.filter(i => cat === "all" || i.category === cat);
      $("#galGrid").innerHTML = shown.map((g, i) => `<button type="button" class="mi" data-i="${i}" aria-label="${g.caption}">${pic(g.image, { sizes: "(min-width:900px) 30vw, 50vw", alt: g.caption })}</button>`).join("") || empty("سيتم إضافة صور هذا التصنيف قريبًا.");
    };
    $("#galCats").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { cat = b.dataset.v; draw(); } };
    const lb = $("#lightbox"), img = $("#lbImg");
    const show = i => {
      cur = (i + shown.length) % shown.length; const g = shown[cur], im = R.images[g.image];
      img.src = `assets/images/${im.file}-1600.webp`; img.alt = im.alt; $("#lbCap").textContent = g.caption; $("#lbCount").textContent = `${cur + 1} / ${shown.length}`;
      const nx = new Image(); nx.src = `assets/images/${R.images[shown[(cur + 1) % shown.length].image].file}-1600.webp`;
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
  function renderContact() {
    const s = R.site, addr = `${s.city} – ${s.province} – ${s.country}`;
    $("#addr").textContent = addr; $("#footAddr").textContent = addr; $("#mapBtn").href = s.mapsLink;
    $("#mapBox").innerHTML = s.mapsEmbed ? `<iframe src="${s.mapsEmbed}" title="خريطة المؤسسة" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : `<a href="${s.mapsLink}" target="_blank" rel="noopener">${ico("pin", 34)}<span>${addr}</span></a>`;
    const row = (l, v, link) => `<div><dt>${l}</dt><dd>${v ? (link ? `<a href="${link + v}">${v}</a>` : v) : t("soon")}</dd></div>`;
    const fb = s.facebook ? `<a href="${s.facebook}" target="_blank" rel="noopener">صفحة المؤسسة</a>` : null;
    $("#contactList").innerHTML = row("الهاتف", s.phone, "tel:") + row("البريد", s.email, "mailto:") + row("العنوان", addr) + `<div><dt>Facebook</dt><dd>${fb || t("soon")}</dd></div>` + row("الموقع", s.website);
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
      const sh = mk("button", "مشاركة الخبر", "btn btn--sm btn--primary"); sh.type = "button"; sh.onclick = () => share(n.title, location.origin + location.pathname + "#news/" + encodeURIComponent(id));
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
    $("#themeBtn").onclick = () => { const n = root.dataset.theme === "dark" ? "light" : "dark"; root.dataset.theme = n; localStorage.setItem("theme", n); };
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
    applyLang(); renderNav(); bindUI(); renderContact();
    await Promise.all([renderHome(), renderLife(), renderResources(), renderSchedule(), renderTeachers(), renderGallery()]);
    observe();
    if (location.hash.startsWith("#news/")) openArticle(decodeURIComponent(location.hash.slice(6)));
  })();
})();
