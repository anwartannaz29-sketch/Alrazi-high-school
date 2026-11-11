/* page.js (V8) — غلاف الصفحات الداخلية (about / privacy / assistant): تنقل، تذييل، عنوان. الثيم واللغة في ui.js. يعتمد على data/site.js */
(() => {
  const R = window.RAZI, $ = s => document.querySelector(s);
  const draw = () => {
    const lang = document.documentElement.lang === "fr" ? "fr" : "ar", hr = n => n.href || `index.html#${n.id}`;
    const links = R.nav.map(n => `<a href="${hr(n)}"${n.ai ? ' class="nav__ai"' : ""}>${n[lang]}</a>`).join("");
    $("#nav").innerHTML = links; $("#footNav").innerHTML = links;
    const a = `${window.V8.X(R.site.city)} – ${window.V8.X(R.site.province)} – ${window.V8.X(R.site.country)}`; document.querySelectorAll("[data-addr]").forEach(e => (e.textContent = a));
  };
  document.querySelectorAll("[data-map]").forEach(e => (e.href = R.site.mapsLink));
  $("#year").textContent = new Date().getFullYear();
  draw(); addEventListener("razi:lang", draw);
  addEventListener("scroll", () => $("#header").classList.toggle("scrolled", scrollY > 8), { passive: true });
  // نص «عن المؤسسة» من لوحة الإدارة (إن وُجد) يحلّ محل الحالة الفارغة
  const box = document.getElementById("aboutBox");
  if (box && window.SB && SB.configured) SB.rest("site_settings?select=value&key=eq.about_text").then(r => { if (r[0] && r[0].value) { box.className = "about-text"; box.textContent = r[0].value; box.style.whiteSpace = "pre-line"; } }).catch(() => {});
})();
