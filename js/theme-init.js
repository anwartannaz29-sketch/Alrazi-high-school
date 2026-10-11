/* theme-init.js — يطبّق الوضع الليلي قبل الرسم (ملف خارجي ليتوافق مع CSP لصفحة الإدارة). */
try { document.documentElement.dataset.theme = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (e) {}
