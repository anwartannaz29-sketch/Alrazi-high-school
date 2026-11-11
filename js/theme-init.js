/* theme-init.js — يعمل قبل الرسم: يطبّق الوضع (اختيار المستخدم ثم تفضيل النظام) واللغة، ويمنع الوميض.
   ملف خارجي ليتوافق مع CSP. V8: خلفية كريمية فاتحة / سوداء داكنة. */
try {
  var d = document.documentElement, t = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  d.dataset.theme = t; d.style.backgroundColor = t === "dark" ? "#05070C" : "#FBF4E1";
  if (localStorage.getItem("lang") === "fr") { d.lang = "fr"; d.dir = "ltr"; }
} catch (e) {}
