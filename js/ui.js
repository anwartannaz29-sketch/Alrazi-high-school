/* ui.js (V8) — طبقة واجهة مشتركة بين كل الصفحات: الترجمة، الوضع الليلي مع انتقال دائري، تبديل اللغة.
   لا تعتمد على app.js. تعرض window.V8 = { X, translate, setLang, setTheme, toggleTheme, lang }.
   data-x / placeholder / aria-label / title: المفتاح هو النص العربي الأصلي → RAZI.fr (data/i18n.js). */
(() => {
  const root = document.documentElement, FR = () => (window.RAZI && window.RAZI.fr) || {};
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lang = () => (root.lang === "fr" ? "fr" : "ar");
  const X = s => (lang() === "fr" ? (FR()[s] ?? s) : s);
  const BG = { dark: "#05070C", light: "#FBF4E1" };

  /* يترجم عناصر ثابتة. كل عنصر يحفظ أصله العربي في data-ar* عند أول لمسة فيمكن الرجوع إليه دون فقدان. */
  function translate(scope = document) {
    const fr = lang() === "fr", F = FR();
    scope.querySelectorAll("[data-x]").forEach(el => {
      if (el.dataset.ar === undefined) el.dataset.ar = el.textContent;
      el.textContent = fr ? (F[el.dataset.ar] ?? el.dataset.ar) : el.dataset.ar;
    });
    [["placeholder", "arPh"], ["aria-label", "arAria"], ["title", "arTitle"]].forEach(([attr, key]) => {
      scope.querySelectorAll(`[${attr}]`).forEach(el => {
        if (el.dataset[key] === undefined) el.dataset[key] = el.getAttribute(attr);
        const o = el.dataset[key]; el.setAttribute(attr, fr ? (F[o] ?? o) : o);
      });
    });
    const t = document.querySelector("title"); if (t) { if (t.dataset.ar === undefined) t.dataset.ar = t.textContent; t.textContent = fr ? (t.dataset.fr || t.dataset.ar) : t.dataset.ar; }
  }

  function setTheme(next, from) {
    try { localStorage.setItem("theme", next); } catch (e) {}   // يُحفظ فورًا، قبل أي انتقال
    const apply = () => {
      root.dataset.theme = next; root.style.backgroundColor = BG[next];
      document.querySelectorAll("#themeBtn").forEach(b => b.setAttribute("aria-pressed", String(next === "dark")));
      const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = next === "dark" ? "#05070C" : "#0A3AC0";
      dispatchEvent(new CustomEvent("razi:theme", { detail: next }));
    };
    if (reduced() || !document.startViewTransition) { root.classList.add("theme-fade"); apply(); setTimeout(() => root.classList.remove("theme-fade"), 520); return; }
    const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    const x = r ? r.left + r.width / 2 : innerWidth - 40, y = r ? r.top + r.height / 2 : 40;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("theme-vt");
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 780, easing: "cubic-bezier(.65,0,.2,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    vt.finished.finally(() => root.classList.remove("theme-vt"));
  }
  const toggleTheme = from => setTheme(root.dataset.theme === "dark" ? "light" : "dark", from);

  function setLang(next) {
    const apply = () => {
      root.lang = next; root.dir = next === "fr" ? "ltr" : "rtl";
      try { localStorage.setItem("lang", next); } catch (e) {}
      const lb = document.getElementById("langLabel"); if (lb) lb.textContent = next === "ar" ? "FR" : "AR";
      translate(); dispatchEvent(new CustomEvent("razi:lang", { detail: next }));
    };
    if (reduced() || !document.startViewTransition) apply(); else document.startViewTransition(apply);
  }

  window.V8 = { X, translate, setLang, setTheme, toggleTheme, lang };
  /* ربط أزرار الرأس (موجودة في كل الصفحات بنفس المعرّفات) */
  document.addEventListener("DOMContentLoaded", () => {
    const tb = document.getElementById("themeBtn"); if (tb) { tb.setAttribute("aria-pressed", String(root.dataset.theme === "dark")); tb.addEventListener("click", () => toggleTheme(tb)); }
    const lbtn = document.getElementById("langBtn"); if (lbtn) lbtn.addEventListener("click", () => setLang(lang() === "ar" ? "fr" : "ar"));
    const lb = document.getElementById("langLabel"); if (lb) lb.textContent = lang() === "ar" ? "FR" : "AR";
    translate();
  });
})();
