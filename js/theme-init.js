/* theme-init.js — يعمل قبل الرسم: يطبّق الوضع (احترام تفضيل النظام ثم اختيار المستخدم) واللغة، ويمنع الوميض الأبيض.
   ملف خارجي ليتوافق مع CSP. */
try {
  var d = document.documentElement, t = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  d.dataset.theme = t; d.style.backgroundColor = t === "dark" ? "#0F1A16" : "#F7F5EF";
  if (localStorage.getItem("lang") === "fr") { d.lang = "fr"; d.dir = "ltr"; }
} catch (e) {}
