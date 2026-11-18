/* notifications.js — RAZI NOTIFICATIONS · مركز إشعارات الرازي (يعمل لكل زائر بلا حساب).
   مصدر البيانات: جدول notifications (قراءة عامة للمنشور الفعّال غير المنتهي فقط عبر RLS). حالة «مقروء» محلية في localStorage (صيغة مُرقَّمة ومحدودة).
   Web Push اختياري: لا يُطلب الإذن إلا بنقرة صريحة من الزائر. كل النصوص تُعرض كنص (textContent) لا HTML. */
(() => {
  const SB = window.SB, root = document.documentElement;
  if (!SB || !SB.configured) return;                                   // بلا إعداد حيّ لا مصدر للإشعارات
  const LS = "razi_nt_v1", MAX_READ = 200, CACHE_MS = 60000, PAGE = 30;
  const ROUTE = /^(index|about|privacy|assistant|notifications)\.html(#[a-z0-9-]{1,40})?$/, HTTPS = /^https:\/\/[^\s<>"']{4,500}$/;
  const T = {
    ar: { bell: "الإشعارات", title: "مركز إشعارات الرازي", all: "عرض كل الإشعارات", markAll: "تعليم الكل كمقروء", mark: "تعليم كمقروء", unread: "غير مقروء", empty: "لا توجد إشعارات حاليًا", emptyS: "ستظهر هنا الإعلانات والأخبار المهمة فور نشرها.", err: "تعذّر تحميل الإشعارات.", retry: "إعادة المحاولة", more: "عرض المزيد", close: "إغلاق", loading: "جارٍ التحميل",
      cat: { announcement: "إعلان", news: "خبر", timetable: "استعمال الزمن", resource: "مورد", activity: "نشاط", general: "عام" }, pri: { high: "مهم", urgent: "عاجل" },
      tabs: { all: "الكل", unread: "غير المقروء", read: "السجل" }, count: n => n + " غير مقروء",
      push: { on: "تفعيل إشعارات الرازي", off: "إيقاف إشعارات الرازي", active: "إشعارات المتصفح مفعّلة على هذا الجهاز.", denied: "الإشعارات محظورة في إعدادات المتصفح. فعّلها من إعدادات الموقع إن رغبت.", unsupported: "متصفحك لا يدعم إشعارات الدفع. على iPhone/iPad أضف الموقع إلى الشاشة الرئيسية أولًا (iOS 16.4+).", unavailable: "إشعارات الدفع غير مفعّلة من الخادم حاليًا.", fail: "تعذّر تفعيل الإشعارات الآن. حاول لاحقًا.", hint: "اختياري. لا يتم الاشتراك إلا بموافقتك الصريحة، ويمكنك الإلغاء في أي وقت." } },
    fr: { bell: "Notifications", title: "Centre de notifications Razi", all: "Voir toutes les notifications", markAll: "Tout marquer comme lu", mark: "Marquer comme lu", unread: "Non lu", empty: "Aucune notification pour le moment", emptyS: "Les annonces et actualités importantes apparaîtront ici dès leur publication.", err: "Impossible de charger les notifications.", retry: "Réessayer", more: "Voir plus", close: "Fermer", loading: "Chargement",
      cat: { announcement: "Annonce", news: "Actualité", timetable: "Emploi du temps", resource: "Ressource", activity: "Activité", general: "Général" }, pri: { high: "Important", urgent: "Urgent" },
      tabs: { all: "Toutes", unread: "Non lues", read: "Historique" }, count: n => n + " non lue(s)",
      push: { on: "Activer les notifications Razi", off: "Désactiver les notifications Razi", active: "Notifications du navigateur activées sur cet appareil.", denied: "Notifications bloquées dans les réglages du navigateur. Autorisez-les depuis les réglages du site si vous le souhaitez.", unsupported: "Votre navigateur ne prend pas en charge les notifications push. Sur iPhone/iPad, ajoutez d'abord le site à l'écran d'accueil (iOS 16.4+).", unavailable: "Les notifications push ne sont pas activées côté serveur pour le moment.", fail: "Activation impossible pour le moment. Réessayez plus tard.", hint: "Facultatif. L'abonnement n'a lieu qu'avec votre accord explicite ; vous pouvez l'annuler à tout moment." } }
  };
  const lang = () => (root.lang === "fr" ? "fr" : "ar"), tx = () => T[lang()];
  const safeUrl = u => (typeof u === "string" && (ROUTE.test(u) || HTTPS.test(u)) ? u : "index.html");
  const hrefOf = u => { u = safeUrl(u); if (!ROUTE.test(u)) return u; const onIdx = /(^|\/)(index\.html)?$/.test(location.pathname) && /^index\.html#/.test(u); return onIdx ? u.slice(u.indexOf("#")) : u; };

  /* ---------- حالة القراءة المحلية (مُرقَّمة ومحدودة؛ لا بيانات شخصية) ---------- */
  const loadRead = () => { try { const o = JSON.parse(localStorage.getItem(LS)); if (o && o.v === 1 && Array.isArray(o.read)) return new Set(o.read.filter(x => typeof x === "string").slice(-MAX_READ)); } catch (e) {} return new Set(); };
  const saveRead = set => { try { localStorage.setItem(LS, JSON.stringify({ v: 1, read: [...set].slice(-MAX_READ) })); } catch (e) {} };
  let readSet = loadRead(), items = [], state = "idle", hasMore = false, fetchedAt = 0, inflight = null;

  /* ---------- الجلب (مرة عند التحميل ثم عند فتح اللوحة إن مضت دقيقة؛ لا جلب عند التمرير) ---------- */
  async function fetchItems(more) {
    if (inflight) return inflight;
    const now = new Date().toISOString(), off = more ? items.length : 0;
    const q = `notifications?select=id,title,summary,title_fr,summary_fr,category,priority,target_url,publish_at&status=eq.published&publish_at=lte.${encodeURIComponent(now)}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(now)})&order=publish_at.desc&limit=${PAGE + 1}&offset=${off}`;
    state = more ? state : "loading"; render();
    inflight = SB.rest(q).then(rows => {
      const ok = rows.filter(r => r && typeof r.id === "string" && typeof r.title === "string");
      hasMore = ok.length > PAGE; items = (more ? items : []).concat(ok.slice(0, PAGE)); state = "ready"; fetchedAt = Date.now();
    }).catch(() => { state = "error"; }).finally(() => { inflight = null; render(); });
    return inflight;
  }
  const unreadCount = () => items.filter(n => !readSet.has(n.id)).length;
  const markRead = id => { readSet.add(id); saveRead(readSet); render(); };
  const markAll = () => { items.forEach(n => readSet.add(n.id)); saveRead(readSet); render(); };

  /* ---------- عرض العناصر (DOM آمن) ---------- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmtTime = iso => { try { return new Date(iso).toLocaleDateString(lang() === "fr" ? "fr-MA" : "ar-MA-u-nu-latn", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  function card(n) {
    const t = tx(), fr = lang() === "fr", isUnread = !readSet.has(n.id);
    const li = el("li", "nt-item" + (isUnread ? " is-unread" : "")); li.dataset.id = n.id;
    const a = el("a", "nt-item__link"); a.href = hrefOf(n.target_url); if (HTTPS.test(n.target_url)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    const meta = el("div", "nt-item__meta"); meta.append(el("span", "nt-chip", t.cat[n.category] || t.cat.general));
    if (t.pri[n.priority]) meta.append(el("span", "nt-chip nt-chip--" + n.priority, t.pri[n.priority]));
    meta.append(el("time", "nt-item__time", fmtTime(n.publish_at)));
    a.append(meta, el("b", "nt-item__title", (fr && n.title_fr) || n.title));
    const sum = (fr && (n.summary_fr || n.summary)) || n.summary; if (sum) a.append(el("span", "nt-item__sum", sum));
    if (isUnread) { const dot = el("span", "nt-dot"); dot.setAttribute("role", "img"); dot.setAttribute("aria-label", t.unread); a.prepend(dot); }
    a.addEventListener("click", () => { if (isUnread) { readSet.add(n.id); saveRead(readSet); updateBadge(); } });
    li.append(a);
    if (isUnread) { const b = el("button", "nt-item__mark", t.mark); b.type = "button"; b.dataset.mark = n.id; li.append(b); }
    return li;
  }
  function body(list, filter) {
    const t = tx(); list.replaceChildren();
    if (state === "loading" && !items.length) { for (let i = 0; i < 3; i++) { const s = el("li", "nt-skel"); s.setAttribute("aria-hidden", "true"); list.append(s); } list.setAttribute("aria-busy", "true"); const st = el("li", "nt-sr", t.loading); st.setAttribute("role", "status"); list.append(st); return; }
    list.removeAttribute("aria-busy");
    if (state === "error" && !items.length) { const li = el("li", "nt-state"); li.setAttribute("role", "alert"); li.append(el("span", null, t.err)); const b = el("button", "nt-btn", t.retry); b.type = "button"; b.dataset.retry = "1"; li.append(b); list.append(li); return; }
    let shown = items; if (filter === "unread") shown = items.filter(n => !readSet.has(n.id)); if (filter === "read") shown = items.filter(n => readSet.has(n.id));
    if (!shown.length) { const li = el("li", "nt-state"); li.append(el("b", null, t.empty), el("span", null, t.emptyS)); list.append(li); return; }
    shown.forEach(n => list.append(card(n)));
    if (hasMore && filter !== "unread") { const li = el("li", "nt-state"); const b = el("button", "nt-btn", t.more); b.type = "button"; b.dataset.more = "1"; li.append(b); list.append(li); }
  }

  /* ---------- Web Push (اختياري وصريح) ---------- */
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64ToU8 = s => { const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  async function pushState() {
    if (!supported()) return "unsupported"; if (Notification.permission === "denied") return "denied";
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? "active" : "idle"; } catch (e) { return "idle"; }
  }
  const api = (method, data) => fetch("/api/push-subscription", { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined, credentials: "omit", cache: "no-store" }).then(async r => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => null) }));
  const subBody = (sub, action) => { const j = sub.toJSON(); return { action, endpoint: sub.endpoint, keys: j.keys, lang: lang() }; };
  let why = "";   // سبب الفشل التقني (يُعرض صغيرًا للتشخيص؛ لا يحوي بيانات شخصية)
  async function enablePush() {
    why = ""; if (!supported()) return "unsupported";
    const k = await api("GET"); if (!k.ok || !k.j || !k.j.publicKey) { why = "config " + k.status + " " + ((k.j && k.j.code) || ""); return "unavailable"; }
    const perm = await Notification.requestPermission();                       // بعد نقرة الزائر فقط
    if (perm !== "granted") return perm === "denied" ? "denied" : "idle";
    let reg, sub;
    try { reg = await navigator.serviceWorker.register("/service-worker.js"); await navigator.serviceWorker.ready; } catch (e) { why = "service-worker: " + ((e && e.name) || "error"); return "fail"; }
    try { sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(k.j.publicKey) }); }
    catch (e) { why = "browser-push: " + ((e && e.name) || "error") + " " + String((e && e.message) || "").slice(0, 80); return "fail"; }
    let r; try { r = await api("POST", subBody(sub, "subscribe")); } catch (e) { why = "network"; return "fail"; }
    if (!r.ok) { why = "server " + r.status + " " + ((r.j && r.j.code) || ""); try { await sub.unsubscribe(); } catch (e) {} return "fail"; }
    return "active";
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
    if (sub) { try { await api("POST", { action: "unsubscribe", endpoint: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
    return "idle";
  }
  /* تجديد صامت (بلا أي نافذة إذن) للمشتركين فعلًا: مرة كل 7 أيام لتحديث last_seen واللغة */
  async function refreshIfSubscribed() {
    try { if (!supported() || Notification.permission !== "granted") return; const last = +localStorage.getItem("razi_push_seen") || 0; if (Date.now() - last < 6048e5) return;
      const reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription(); if (!sub) return;
      const r = await api("POST", subBody(sub, "subscribe")); if (r.ok) localStorage.setItem("razi_push_seen", String(Date.now())); } catch (e) {}
  }
  function pushBox() {
    const box = el("div", "nt-push"), msg = el("p", "nt-push__msg"), btn = el("button", "nt-btn nt-btn--primary"); btn.type = "button"; btn.dataset.push = "1"; msg.setAttribute("role", "status");
    const paint = async st => { const t = tx().push; box.dataset.state = st; btn.hidden = st === "unsupported" || st === "denied" || st === "unavailable";
      btn.textContent = st === "active" ? t.off : t.on; btn.disabled = false; btn.removeAttribute("aria-busy");
      msg.textContent = ({ active: t.active, denied: t.denied, unsupported: t.unsupported, unavailable: t.unavailable + (why ? " (" + why + ")" : ""), fail: t.fail + (why ? " (" + why + ")" : ""), idle: t.hint })[st] || t.hint; };
    btn.addEventListener("click", async () => { btn.disabled = true; btn.setAttribute("aria-busy", "true"); let st; try { st = box.dataset.state === "active" ? await disablePush() : await enablePush(); } catch (e) { st = "fail"; } await paint(st); });
    box.append(msg, btn); pushState().then(paint); box._paint = paint; return box;
  }

  /* ---------- الجرس واللوحة ---------- */
  let bell, badge, panel, list, tabsEl, filter = "all", lastFocus = null;
  const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8zM10 20a2 2 0 0 0 4 0"/></svg>';
  function updateBadge() {
    if (!bell) return; const n = unreadCount(), t = tx();
    badge.hidden = n === 0; badge.textContent = n > 9 ? "9+" : String(n);
    bell.setAttribute("aria-label", t.bell + (n ? " — " + t.count(n) : ""));
  }
  function render() {
    updateBadge(); if (list && panel && !panel.hidden) { body(list, filter); const mk = panel.querySelector("[data-markall]"); if (mk) mk.disabled = unreadCount() === 0; }
    document.querySelectorAll("[data-nt-page-list]").forEach(l => body(l, pageFilter));
    const mkp = document.querySelector("[data-nt-page-markall]"); if (mkp) mkp.disabled = unreadCount() === 0;
  }
  function buildPanel() {
    const t = tx(); panel = el("div", "nt-panel"); panel.id = "ntPanel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "ntTitle"); panel.tabIndex = -1;
    const head = el("div", "nt-panel__head"), h = el("h2", null, t.title); h.id = "ntTitle";
    const mk = el("button", "nt-link", t.markAll); mk.type = "button"; mk.dataset.markall = "1";
    const cl = el("button", "nt-x"); cl.type = "button"; cl.dataset.close = "1"; cl.setAttribute("aria-label", t.close); cl.textContent = "×";
    head.append(h, mk, cl);
    tabsEl = el("div", "nt-tabs"); tabsEl.setAttribute("role", "group"); [["all", t.tabs.all], ["unread", t.tabs.unread]].forEach(([k, l]) => { const b = el("button", "nt-tab", l); b.type = "button"; b.dataset.tab = k; b.setAttribute("aria-pressed", String(k === filter)); tabsEl.append(b); });
    list = el("ul", "nt-list"); list.setAttribute("aria-live", "polite");
    const foot = el("div", "nt-panel__foot"), all = el("a", "nt-link", t.all); all.href = "notifications.html"; foot.append(all, pushBox());
    panel.append(head, tabsEl, list, foot); document.body.append(panel);
    panel.addEventListener("click", e => {
      const x = e.target.closest("button,a"); if (!x) return;
      if (x.dataset.close) return close(true); if (x.dataset.markall) return markAll(); if (x.dataset.mark) return markRead(x.dataset.mark);
      if (x.dataset.retry) return fetchItems(); if (x.dataset.more) return fetchItems(true);
      if (x.dataset.tab) { filter = x.dataset.tab; tabsEl.querySelectorAll(".nt-tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === filter))); render(); }
    });
    panel.addEventListener("keydown", e => {                                    // حبس التركيز داخل اللوحة + Esc
      if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
      if (e.key !== "Tab") return; const f = [...panel.querySelectorAll("a[href],button:not([disabled]):not([hidden])")]; if (!f.length) return;
      const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function place() {                                                           // تحت الجرس، داخل الشاشة دائمًا (RTL/LTR/جوال)
    const r = bell.getBoundingClientRect(), w = Math.min(380, innerWidth - 16); panel.style.width = w + "px";
    let left = lang() === "fr" ? r.right - w : r.left; left = Math.max(8, Math.min(left, innerWidth - w - 8)); panel.style.left = left + "px"; panel.style.top = Math.round(r.bottom + 8) + "px";
    panel.style.maxHeight = Math.max(240, innerHeight - r.bottom - 24) + "px";
  }
  function open() {
    if (!panel) buildPanel(); lastFocus = document.activeElement; panel.hidden = false; bell.setAttribute("aria-expanded", "true"); place(); render();
    if (state === "idle" || state === "error" || Date.now() - fetchedAt > CACHE_MS) fetchItems();
    panel.focus();
  }
  function close(back) { if (!panel || panel.hidden) return; panel.hidden = true; bell.setAttribute("aria-expanded", "false"); if (back && lastFocus && lastFocus.focus) lastFocus.focus(); }
  function mountBell() {
    const tools = document.querySelector(".tools"); if (!tools || document.getElementById("ntBell")) return;
    bell = el("button", "btn-icon nt-bell"); bell.id = "ntBell"; bell.type = "button"; bell.setAttribute("aria-haspopup", "dialog"); bell.setAttribute("aria-expanded", "false"); bell.setAttribute("aria-controls", "ntPanel");
    bell.insertAdjacentHTML("beforeend", ICON); badge = el("span", "nt-badge"); badge.hidden = true; bell.append(badge);
    tools.insertBefore(bell, tools.firstChild); updateBadge();
    bell.addEventListener("click", () => (panel && !panel.hidden ? close(true) : open()));
    document.addEventListener("click", e => { if (panel && !panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) close(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(true); });
    addEventListener("resize", () => { if (panel && !panel.hidden) place(); });
    addEventListener("razi:lang", () => { if (panel) { panel.remove(); panel = null; } updateBadge(); render(); });
    addEventListener("storage", e => { if (e.key === LS) { readSet = loadRead(); render(); } });   // تزامن بين التبويبات
    fetchItems();
  }

  /* ---------- صفحة notifications.html الكاملة (السجل) ---------- */
  let pageFilter = "all";
  function mountPage() {
    const host = document.querySelector("[data-nt-page]"); if (!host) return;
    const t = tx(); host.replaceChildren();
    const bar = el("div", "nt-page__bar"), tabs = el("div", "nt-tabs"); tabs.setAttribute("role", "group");
    [["all", t.tabs.all], ["unread", t.tabs.unread], ["read", t.tabs.read]].forEach(([k, l]) => { const b = el("button", "nt-tab", l); b.type = "button"; b.dataset.tab = k; b.setAttribute("aria-pressed", String(k === pageFilter)); tabs.append(b); });
    const mk = el("button", "nt-link", t.markAll); mk.type = "button"; mk.dataset.ptMarkall = "1"; mk.setAttribute("data-nt-page-markall", "");
    bar.append(tabs, mk); const ul = el("ul", "nt-list nt-list--page"); ul.setAttribute("data-nt-page-list", ""); ul.setAttribute("aria-live", "polite");
    host.append(bar, ul, pushBox());
    host.onclick = e => { const x = e.target.closest("button"); if (!x) return;
      if (x.dataset.tab) { pageFilter = x.dataset.tab; tabs.querySelectorAll(".nt-tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === pageFilter))); render(); }
      else if (x.dataset.ptMarkall) markAll(); else if (x.dataset.mark) markRead(x.dataset.mark); else if (x.dataset.retry) fetchItems(); else if (x.dataset.more) fetchItems(true); };
    render();
  }
  const boot = () => { mountBell(); mountPage(); refreshIfSubscribed(); };
  addEventListener("razi:lang", () => { if (document.querySelector("[data-nt-page]")) mountPage(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.RAZI_NT = { fetchItems, markAll, unreadCount, enablePush, disablePush, _readSet: () => [...readSet] };
})();
