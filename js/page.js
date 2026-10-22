/* page.js — غلاف الصفحات الداخلية (about / privacy): تنقل، وضع ليلي، تذييل. يعتمد على data/site.js */
(() => {
  const R = window.RAZI, $ = s => document.querySelector(s), root = document.documentElement;
  const links = R.nav.map(n => `<a href="index.html#${n.id}">${n.ar}</a>`).join("");
  $("#nav").innerHTML = links; $("#footNav").innerHTML = links;
  $("#themeBtn").onclick = () => { const n = root.dataset.theme === "dark" ? "light" : "dark"; root.dataset.theme = n; $("#themeBtn").setAttribute("aria-pressed", String(n === "dark")); root.style.backgroundColor = n === "dark" ? "#0F1A16" : "#F7F5EF"; try { localStorage.setItem("theme", n); } catch (e) {} };
  const a = `${R.site.city} – ${R.site.province} – ${R.site.country}`; document.querySelectorAll("[data-addr]").forEach(e => (e.textContent = a));
  document.querySelectorAll("[data-map]").forEach(e => (e.href = R.site.mapsLink));
  $("#themeBtn").setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  $("#year").textContent = new Date().getFullYear();
  addEventListener("scroll", () => $("#header").classList.toggle("scrolled", scrollY > 8), { passive: true });
  // نص «عن المؤسسة» من لوحة الإدارة (إن وُجد) يحلّ محل الحالة الفارغة
  const box = document.getElementById("aboutBox");
  if (box && window.SB && SB.configured) SB.rest("site_settings?select=value&key=eq.about_text").then(r => { if (r[0] && r[0].value) { box.className = "about-text"; box.textContent = r[0].value; box.style.whiteSpace = "pre-line"; } }).catch(() => {});
})();
