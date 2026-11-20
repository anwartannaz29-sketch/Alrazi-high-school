/* reveal.js — كشف المحتوى عند التمرير (IntersectionObserver). تحسين تدريجي: لا شيء يُخفى إلا بعد نجاح التهيئة (صنف js-reveal على <html>).
   - يتحرك مرة واحدة فقط ثم يُزال الوسم تمامًا (فلا يتعارض مع تأثيرات hover الخاصة بالبطاقات).
   - opacity + translate/scale فقط. يحترم prefers-reduced-motion (لا إخفاء نهائيًا) ويبسّط على الأجهزة الضعيفة/توفير البيانات.
   - API يدوي: data-reveal="up|left|right|scale|img" + data-reveal-delay="ms"، أو الأصناف .reveal .reveal-up .reveal-left .reveal-right .reveal-scale. */
(() => {
  const root = document.documentElement, mq = matchMedia("(prefers-reduced-motion: reduce)");
  window.RAZI_REVEAL = { active: false, refresh() {} };   // موجود دائمًا: app.js يتخلى عن نظام .rv القديم عند وجوده (لا ازدواج حركة)
  if (!("IntersectionObserver" in window) || mq.matches) return;
  const GRIDS = ".grid, .masonry, .feed, .topnews, .ann, .today__grid, .stats__grid, .split, .svc";   // أبناؤها يظهرون بتدرّج، لا الحاوية نفسها
  const AUTO = [   // [محدّد، نوع الحركة] — العناصر الديناميكية (بطاقات app.js) تُوسَم تلقائيًا عند ظهورها في DOM
    [`.section .wrap > *:not(${GRIDS}), .quick`, "up"], [".about__media, .map", "scale"],
    [GRIDS.split(", ").map(g => g + " > *").join(", "), "up"]
  ];
  const CLS = { reveal: "up", "reveal-up": "up", "reveal-left": "left", "reveal-right": "right", "reveal-scale": "scale" };
  const lite = !!(navigator.connection && navigator.connection.saveData) || (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
  const main = document.getElementById("main") || document.body;
  const tagged = new WeakSet(), pending = [];
  const skip = el => el.closest(".hero, header, footer, dialog, [data-no-reveal], .sheet, .lb, .rai");
  function tag(el, type) {
    if (tagged.has(el) || skip(el) || el.hasAttribute("data-reveal")) return;
    tagged.add(el); el.setAttribute("data-reveal", type); pending.push(el);
  }
  function scan(scope) {
    Object.keys(CLS).forEach(c => scope.querySelectorAll("." + c).forEach(el => tag(el, CLS[c])));
    scope.querySelectorAll("[data-reveal]").forEach(el => { if (!tagged.has(el) && !skip(el)) { tagged.add(el); pending.push(el); } });
    AUTO.forEach(([sel, type]) => scope.querySelectorAll(sel).forEach(el => tag(el, type)));
  }
  let io = null, started = false;
  function show(el, delay) {
    if (delay) el.style.setProperty("--rd", delay + "ms");
    el.classList.add("is-in");
    setTimeout(() => { el.removeAttribute("data-reveal"); el.classList.remove("is-in"); el.style.removeProperty("--rd"); }, 1000 + (delay || 0));   // يعود لتنسيقه الطبيعي
  }
  function observeNew() {
    while (pending.length) {
      const el = pending.shift(); if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (!started && r.top < innerHeight * 0.92 && r.bottom > 0) { el.classList.add("is-in"); setTimeout(() => { el.removeAttribute("data-reveal"); el.classList.remove("is-in"); }, 60); }   // داخل الشاشة عند التهيئة: بلا وميض
      else io.observe(el);
    }
  }
  function init() {
    try {
      io = new IntersectionObserver(entries => {
        const vis = entries.filter(e => e.isIntersecting).sort((a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1));
        vis.forEach((e, i) => { io.unobserve(e.target); const d = +e.target.getAttribute("data-reveal-delay"); show(e.target, Number.isFinite(d) && d > 0 ? Math.min(d, 800) : Math.min(i * 70, 350)); });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      scan(main); if (lite) root.setAttribute("data-reveal-lite", "");
      observeNew(); root.classList.add("js-reveal"); started = true; window.RAZI_REVEAL.active = true;     // الإخفاء يبدأ الآن فقط
      let raf = 0; new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; scan(main); observeNew(); }); }).observe(main, { childList: true, subtree: true });
      const stop = () => { if (mq.matches) { io.disconnect(); root.classList.remove("js-reveal"); document.querySelectorAll("[data-reveal]").forEach(el => el.removeAttribute("data-reveal")); } };
      mq.addEventListener ? mq.addEventListener("change", stop) : mq.addListener(stop);
    } catch (e) { root.classList.remove("js-reveal"); document.querySelectorAll("[data-reveal]").forEach(el => el.removeAttribute("data-reveal")); }   // أي خطأ ⇒ المحتوى ظاهر
  }
  window.RAZI_REVEAL.refresh = () => { if (io) { scan(main); observeNew(); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
