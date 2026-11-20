/* service-worker.js — Web Push لمركز إشعارات الرازي. بلا كاش للصفحات (لا تغيير لسلوك الموقع الحالي): استقبال Push + نقر الإشعار فقط.
   كل بيانات الحمولة نص عادي يُنظَّف ويُحدَّد طوله؛ لا HTML ولا تنفيذ. الوجهة: مسار داخلي معروف فقط وإلا الصفحة الرئيسية. */
"use strict";
const ROUTE = /^(index|about|privacy|assistant|notifications)\.html(#[a-z0-9-]{1,40})?$/;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function dest(u) {
  if (typeof u === "string" && ROUTE.test(u)) return new URL("/" + u, self.location.origin).href;
  if (typeof u === "string" && /^https:\/\/[^\s<>"']{4,500}$/.test(u)) return u;
  return new URL("/", self.location.origin).href;
}
function parse(e) { try { const d = e.data ? e.data.json() : null; return d && typeof d === "object" ? d : {}; } catch (err) { return {}; } }

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  const d = parse(e), title = clean(d.t, 100) || "الثانوية التأهيلية الرازي", body = clean(d.b, 180);
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: "/assets/icon-192.png", badge: "/assets/favicon.png", dir: "auto",
    tag: d.id && /^[0-9a-f-]{36}$/i.test(String(d.id)) ? "razi-" + d.id : "razi", renotify: false,
    requireInteraction: d.p === 2, data: { u: typeof d.u === "string" ? d.u.slice(0, 500) : "" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = dest(e.notification.data && e.notification.data.u);
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if (new URL(c.url).origin === self.location.origin && "focus" in c) { try { await c.focus(); if ("navigate" in c) await c.navigate(url); return; } catch (err) {} } }
    await self.clients.openWindow(url);
  })());
});

/* V10: عند تدوير المتصفح للاشتراك (pushsubscriptionchange) نعيد الاشتراك تلقائيًا كي لا يتوقف الوصول بصمت. لا بيانات شخصية. */
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    try {
      const k = await (await fetch("/api/push-subscription", { cache: "no-store", credentials: "omit" })).json();
      if (!k || !k.publicKey) return;
      const p = "=".repeat((4 - (k.publicKey.length % 4)) % 4), raw = atob((k.publicKey + p).replace(/-/g, "+").replace(/_/g, "/"));
      const sub = (e.newSubscription) || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
      const j = sub.toJSON();
      await fetch("/api/push-subscription", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ action: "subscribe", endpoint: sub.endpoint, keys: j.keys, lang: "ar" }) });
    } catch (err) {}
  })());
});
