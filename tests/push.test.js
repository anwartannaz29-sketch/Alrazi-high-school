// tests/push.test.js — api/push-subscription.js + api/push-send.js + service-worker.js + فحوص ساكنة للترحيل 003 (Supabase وweb-push وهميان؛ لا شبكة).
// تنبيه: لا يُنفَّذ SQL هنا (لا قاعدة بيانات). فحوص RLS الفعلية في supabase/tests/rls_checks_notifications.sql تُشغَّل يدويًا.
const fs = require("fs"), vm = require("vm"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const sub = require("../api/push-subscription.js"), snd = require("../api/push-send.js");
let pass = 0, bad = 0; const check = (n, ok, x = "") => { ok ? pass++ : bad++; console.log((ok ? "PASS " : "FAIL ") + n + (!ok && x ? "  [" + x + "]" : "")); };
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const ANON = `x.${b64({ role: "anon" })}.y`, PUB = "B" + "A".repeat(86), PRIV = "PRIVATE_KEY_must_never_leak_" + "x".repeat(10);
const ENV = { SUPABASE_URL: "https://abcd1234.supabase.co", SUPABASE_ANON_KEY: ANON, VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: "mailto:admin@example.com" };
const ADMIN = "adm.tok.1", USER = "usr.tok.2", NID = "11111111-1111-1111-1111-111111111111", NID2 = "22222222-2222-2222-2222-222222222222";
const FCM = "https://fcm.googleapis.com/fcm/send/";

function world(over = {}) {
  const w = { notes: { [NID]: { id: NID, title: "إعلان مهم", summary: "تفاصيل", title_fr: "Annonce importante", summary_fr: "Détails", target_url: "index.html#announcements", priority: "high", published: true }, [NID2]: { id: NID2, title: "مسودة", published: false } },
    claimed: new Set(), subs: over.subs || [{ id: "s1", endpoint: FCM + "ok1", p256dh: "p".repeat(30), auth: "a".repeat(16), lang: "ar" }, { id: "s2", endpoint: FCM + "ok2", p256dh: "p".repeat(30), auth: "a".repeat(16), lang: "fr" }],
    calls: [], sent: [], pruned: [], unclaimed: [], registered: [], removed: [], vapid: null, rpcFail: over.rpcFail || {} };
  w.fetch = async (url, opts = {}) => {
    const u = String(url), tok = ((opts.headers || {}).Authorization || "").replace("Bearer ", ""); w.calls.push({ u, tok, body: opts.body });
    const J = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (u.endsWith("/auth/v1/user")) return tok === ADMIN ? J(200, { id: "u-admin" }) : tok === USER ? J(200, { id: "u-user" }) : J(401, { msg: "bad" });
    const m = u.match(/\/rest\/v1\/rpc\/(\w+)$/); if (!m) return J(404, {}); const name = m[1], a = JSON.parse(opts.body || "{}");
    if (w.rpcFail[name]) return J(w.rpcFail[name], { message: "boom SECRET_DB_DETAIL" });
    if (name === "is_admin") return J(200, tok === ADMIN);
    if (name === "register_push_subscription") { w.registered.push(a); return J(204, null); }
    if (name === "remove_push_subscription") { w.removed.push(a.p_endpoint); return J(200, w.subs.some(s => s.endpoint === a.p_endpoint)); }
    if (tok !== ADMIN) return J(403, { code: "42501", message: "forbidden" });
    if (name === "admin_claim_push") { const n = w.notes[a.p_id]; if (!n || !n.published || w.claimed.has(a.p_id)) return J(200, null); w.claimed.add(a.p_id); return J(200, n); }
    if (name === "admin_unclaim_push") { w.claimed.delete(a.p_id); w.unclaimed.push(a.p_id); return J(204, null); }
    if (name === "admin_list_push_subscriptions") return J(200, w.subs);
    if (name === "admin_prune_push_subscriptions") { w.pruned.push(...a.p_ids); return J(200, a.p_ids.length); }
    return J(404, {});
  };
  w.webpush = { setVapidDetails(s, p, k) { w.vapid = [s, p, k]; }, async sendNotification(s, payload, o) { w.sent.push({ endpoint: s.endpoint, payload, o }); if (/gone/.test(s.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 }); if (/err500/.test(s.endpoint)) throw Object.assign(new Error("x"), { statusCode: 500 }); } };
  return w;
}
let ip = 0;
async function call(h, w, { method = "POST", headers = {}, body, env = ENV, raw, noWebpush } = {}) {
  const req = { method, headers: { "content-type": "application/json", host: "razi.example.com", origin: "https://razi.example.com", "x-forwarded-for": "7.7.7." + (++ip % 250), ...headers }, body: raw !== undefined ? raw : body };
  const out = { status: 0, headers: {}, body: "" }; const res = { statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, end(b) { out.status = this.statusCode; out.body = b; } };
  await h.handler(req, res, { env, fetch: w.fetch, now: Date.now(), webpush: noWebpush ? undefined : w.webpush });
  let json = null; try { json = JSON.parse(out.body); } catch {} return { status: out.status, json, raw: out.body, headers: out.headers };
}
const auth = t => ({ authorization: "Bearer " + t });
const KEYS = { p256dh: "B".repeat(40), auth: "c".repeat(20) };
const S = (id, endpoint, lang = "ar") => ({ id, endpoint, p256dh: "p".repeat(30), auth: "a".repeat(16), lang });

(async () => {
  let w, r;
  // ===== push-send: صلاحيات =====
  w = world(); r = await call(snd, w, { body: { notificationId: NID } });
  check("6 unauthenticated request → 401, nothing sent, no DB call", r.status === 401 && w.sent.length === 0 && w.calls.length === 0);
  r = await call(snd, w, { headers: auth("not-a-jwt"), body: { notificationId: NID } }); check("6b malformed token → 401", r.status === 401 && w.calls.length === 0);
  r = await call(snd, w, { headers: auth("bad.tok.0"), body: { notificationId: NID } }); check("6c invalid/expired token (Supabase Auth rejects) → 401, no claim", r.status === 401 && w.sent.length === 0 && w.claimed.size === 0);
  w = world(); r = await call(snd, w, { headers: auth(USER), body: { notificationId: NID } });
  check("7 authenticated NON-admin → 403, no claim, no push sent", r.status === 403 && w.claimed.size === 0 && w.sent.length === 0, r.raw);
  r = await call(snd, w, { headers: { ...auth(USER), "x-is-admin": "true" }, body: { notificationId: NID, isAdmin: true, admin: true } });
  check("7b client-supplied isAdmin flags are ignored → still 403", r.status === 403 && w.sent.length === 0);
  // ===== push-send: إرسال واحد =====
  w = world(); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } });
  check("8 admin publish → 200, delivered to both subscribers, claim made exactly once", r.status === 200 && r.json.success && r.json.delivered === 2 && r.json.total === 2 && w.calls.filter(c => /admin_claim_push/.test(c.u)).length === 1, r.raw);
  check("8b VAPID configured from env only; payload language per subscriber (ar/fr), short plain text", w.vapid[1] === PUB && w.vapid[2] === PRIV && JSON.parse(w.sent.find(s => /ok1/.test(s.endpoint)).payload).t === "إعلان مهم" && JSON.parse(w.sent.find(s => /ok2/.test(s.endpoint)).payload).t === "Annonce importante");
  r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } });
  check("8c second request for the same notification → 409 and NO additional push (idempotent)", r.status === 409 && w.sent.length === 2, r.raw);
  w = world(); const [a, b] = await Promise.all([call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } }), call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } })]);
  check("8d two concurrent requests → exactly one delivers (200) and one is rejected (409)", [a.status, b.status].sort().join() === "200,409" && w.sent.length === 2, a.status + "," + b.status);
  w = world(); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID2 } }); check("8e unpublished/draft notification cannot be pushed → 409", r.status === 409 && w.sent.length === 0);
  // ===== اشتراكات منتهية/فاشلة =====
  w = world({ subs: [S("g1", FCM + "gone1"), S("e1", FCM + "err500"), S("k1", FCM + "ok")] });
  r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } });
  check("12 expired (410) subscription is pruned; transient 500 is counted but NOT pruned; others delivered", r.json.delivered === 1 && r.json.failed === 1 && r.json.removed === 1 && w.pruned.join() === "g1", r.raw);
  w = world({ subs: [S("e1", FCM + "err500")] }); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } });
  check("12b nothing delivered → claim released so the admin can retry explicitly", r.json.delivered === 0 && w.unclaimed.includes(NID) && !w.claimed.has(NID));
  w = world({ subs: [S("x1", "https://evil.example.com/steal"), S("x2", "http://fcm.googleapis.com/x")] });
  r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } }); check("12c SSRF guard: non-push hosts / http endpoints are never contacted and get pruned", w.sent.length === 0 && w.pruned.sort().join() === "x1,x2");
  w = world({ subs: [] }); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } }); check("12d zero subscribers → success with 0 delivered (claim released)", r.status === 200 && r.json.total === 0 && w.unclaimed.length === 1);
  // ===== تهيئة وأخطاء =====
  w = world(); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID }, env: { ...ENV, VAPID_PRIVATE_KEY: "" } });
  check("missing VAPID_PRIVATE_KEY → 503 BEFORE any claim/auth call; no secrets in body", r.status === 503 && w.calls.length === 0 && !r.raw.includes(PRIV));
  w = world(); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID }, noWebpush: true });
  check("web-push package not installed → 503 (no claim) instead of crashing", r.status === 503 && w.claimed.size === 0);
  w = world(); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID }, env: { ...ENV, SUPABASE_ANON_KEY: `x.${b64({ role: "service" + "_role" })}.y` } }); check("a non-anon Supabase key in env is refused", r.status === 503 && w.calls.length === 0);
  w = world({ rpcFail: { admin_claim_push: 500 } }); r = await call(snd, w, { headers: auth(ADMIN), body: { notificationId: NID } }); check("DB failure → 502 generic (no DB detail leaked)", r.status === 502 && !/SECRET_DB_DETAIL/.test(r.raw), r.raw);
  w = world(); const bads = [["GET", 405, { method: "GET", headers: auth(ADMIN) }], ["foreign origin", 403, { headers: { ...auth(ADMIN), origin: "https://evil.example" }, body: { notificationId: NID } }], ["non-uuid id", 400, { headers: auth(ADMIN), body: { notificationId: "1; drop table" } }], ["missing id", 400, { headers: auth(ADMIN), body: {} }], ["text/plain", 415, { headers: { ...auth(ADMIN), "content-type": "text/plain" }, raw: "x" }], ["too large", 413, { headers: { ...auth(ADMIN), "content-length": "99999" }, body: { notificationId: NID } }], ["array body", 400, { headers: auth(ADMIN), raw: [1] }]];
  for (const [n, c, o] of bads) { const x = await call(snd, w, o); check("push-send invalid: " + n + " → " + c, x.status === c, x.status + " " + x.raw); }
  check("invalid requests never reach Supabase or push service", w.calls.length === 0 && w.sent.length === 0);
  snd._limit.reset(); w = world(); let last; for (let i = 0; i < 11; i++) last = await call(snd, w, { headers: { ...auth(USER), "x-forwarded-for": "3.3.3.3" }, body: { notificationId: NID } });
  check("push-send rate limit: 11th request/min → 429", last.status === 429 && last.headers["retry-after"]);
  // ===== تسجيل / إلغاء الاشتراك =====
  w = world(); r = await call(sub, w, { method: "GET" }); check("GET returns ONLY the public VAPID key", r.status === 200 && r.json.publicKey === PUB && !r.raw.includes(PRIV));
  r = await call(sub, w, { method: "GET", env: { ...ENV, VAPID_PUBLIC_KEY: "" } }); check("GET without VAPID config → 503 push_unavailable", r.status === 503 && r.json.code === "push_unavailable");
  r = await call(sub, w, { body: { action: "subscribe", endpoint: FCM + "abc", keys: KEYS, lang: "fr" } });
  check("10 valid subscribe → 200 and stored via RPC with validated fields only", r.status === 200 && w.registered.length === 1 && w.registered[0].p_lang === "fr" && w.registered[0].p_endpoint === FCM + "abc" && Object.keys(w.registered[0]).sort().join() === "p_auth,p_endpoint,p_lang,p_p256dh", r.raw);
  const sb = [["http endpoint", { endpoint: "http://fcm.googleapis.com/x", keys: KEYS }], ["unknown host", { endpoint: "https://evil.example.com/x", keys: KEYS }], ["localhost", { endpoint: "https://localhost/x", keys: KEYS }], ["host with credentials", { endpoint: "https://u:p@fcm.googleapis.com/x", keys: KEYS }], ["not a string", { endpoint: 5, keys: KEYS }], ["endpoint too long", { endpoint: FCM + "a".repeat(2100), keys: KEYS }],
    ["missing keys", { endpoint: FCM + "a" }], ["keys wrong charset", { endpoint: FCM + "a", keys: { p256dh: "bad key!", auth: "c".repeat(20) } }], ["auth too short", { endpoint: FCM + "a", keys: { p256dh: "B".repeat(40), auth: "x" } }]];
  for (const [n, o] of sb) { const x = await call(sub, w, { body: { action: "subscribe", ...o } }); check("10 invalid subscribe: " + n + " → 400", x.status === 400 && w.registered.length === 1, x.status + " " + x.raw); }
  r = await call(sub, w, { body: { action: "nuke", endpoint: FCM + "a" } }); check("10 unknown action → 400", r.status === 400);
  w.subs.push({ endpoint: FCM + "mine" }); r = await call(sub, w, { body: { action: "unsubscribe", endpoint: FCM + "mine" } }); check("11 unsubscribe → 200 removed:true via RPC", r.status === 200 && r.json.removed === true && w.removed[0] === FCM + "mine");
  r = await call(sub, w, { body: { action: "unsubscribe", endpoint: FCM + "unknown" } }); check("11b unsubscribe unknown endpoint → removed:false (no error, no info leak)", r.status === 200 && r.json.removed === false);
  r = await call(sub, w, { body: { action: "subscribe", endpoint: FCM + "z", keys: KEYS }, env: { ...ENV, VAPID_PUBLIC_KEY: "" } }); check("subscribe when push not configured → 503", r.status === 503);
  w = world({ rpcFail: { register_push_subscription: 500 } }); r = await call(sub, w, { body: { action: "subscribe", endpoint: FCM + "q", keys: KEYS } }); check("storage failure → 502 generic", r.status === 502 && !/SECRET_DB_DETAIL/.test(r.raw));
  check("subscription endpoint sends no admin token / never reads subscriptions", w.calls.every(c => !/admin_|push_subscriptions\?/.test(c.u)));
  r = await call(sub, w, { method: "DELETE" }); check("push-subscription: DELETE method → 405", r.status === 405);
  r = await call(sub, w, { body: { action: "subscribe", endpoint: FCM + "q", keys: KEYS }, headers: { origin: "https://evil.example" } }); check("push-subscription: foreign origin → 403", r.status === 403);
  sub._limit.reset(); let L; for (let i = 0; i < 21; i++) L = await call(sub, world(), { method: "GET", headers: { "x-forwarded-for": "4.4.4.4" } }); check("push-subscription rate limit: 21st/min → 429", L.status === 429);

  // ===== service worker (13) =====
  function runSW() {
    const L = {}, shown = [], opened = [], st = { clients: [] };
    const self = { location: { origin: "https://razi.example.com" }, addEventListener: (t, f) => (L[t] = f), skipWaiting() {}, registration: { showNotification: (t, o) => { shown.push([t, o]); return Promise.resolve(); } },
      clients: { claim: async () => {}, matchAll: async () => st.clients, openWindow: async u => { opened.push(u); } } };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8"), { self, URL, console, Promise }); return { L, shown, opened, st };
  }
  const ev = (data, extra) => { const p = []; return { e: { data, waitUntil: x => p.push(x), notification: { close() {}, data: extra } }, done: () => Promise.all(p) }; };
  let s = runSW(), x = ev({ json: () => ({ id: NID, t: "<b>عنوان</b> مهم", b: "نص\u0000 <img src=x onerror=1>", u: "index.html#news", p: 2 }) }); s.L.push(x.e); await x.done();
  check("SW push: shows sanitized plain-text notification (tags stripped, urgent requires interaction)", s.shown.length === 1 && !/[<>]/.test(s.shown[0][0] + s.shown[0][1].body) && s.shown[0][1].requireInteraction === true && s.shown[0][1].data.u === "index.html#news", JSON.stringify(s.shown));
  s = runSW(); x = ev(null); s.L.push(x.e); await x.done(); check("SW push: missing payload → default title, no crash", s.shown.length === 1 && s.shown[0][0] === "الثانوية التأهيلية الرازي");
  s = runSW(); x = ev({ json: () => { throw new Error("bad json"); } }); s.L.push(x.e); await x.done(); check("SW push: malformed JSON → default notification, no crash", s.shown.length === 1);
  s = runSW(); x = ev({ json: () => "just a string" }); s.L.push(x.e); await x.done(); check("SW push: non-object payload handled", s.shown.length === 1);
  const click = async (u, clients = []) => { const s = runSW(); s.st.clients = clients; const x = ev(null, { u }); s.L.notificationclick(x.e); await x.done(); return s; };
  s = await click("index.html#news"); check("13 click opens the correct internal destination (index.html#news)", s.opened[0] === "https://razi.example.com/index.html#news", String(s.opened));
  s = await click("notifications.html"); check("13b click opens notifications.html", s.opened[0] === "https://razi.example.com/notifications.html");
  s = await click("javascript:alert(1)"); check("13c javascript: URL is rejected → home page", s.opened[0] === "https://razi.example.com/");
  s = await click("http://evil.example/x"); check("13d plain http URL rejected → home page", s.opened[0] === "https://razi.example.com/");
  s = await click("//evil.example/x"); check("13e protocol-relative URL rejected → home page", s.opened[0] === "https://razi.example.com/");
  s = await click("../admin/"); check("13f path traversal / unknown route rejected → home page", s.opened[0] === "https://razi.example.com/");
  s = await click("https://example.org/doc.pdf"); check("13g trusted https link allowed", s.opened[0] === "https://example.org/doc.pdf");
  const focused = []; s = await click("index.html#schedule", [{ url: "https://razi.example.com/about.html", focus: async () => focused.push("f"), navigate: async u => focused.push(u) }]);
  check("13h existing tab is focused and navigated instead of opening a duplicate", focused[1] === "https://razi.example.com/index.html#schedule" && s.opened.length === 0, String(focused));
  check("SW registers no fetch/cache handler (does not alter site loading)", !runSW().L.fetch);

  // ===== فحوص ساكنة: الترحيل / الأسرار / المراجع =====
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/003_notifications.sql"), "utf8"), rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  check("3 SQL: RLS enabled on notifications AND push_subscriptions", /alter table public\.notifications enable row level security/.test(sql) && /alter table public\.push_subscriptions enable row level security/.test(sql));
  check("1/3/4 SQL: public read policy = published AND publish_at <= now() AND not expired", /notifications_public_read[\s\S]{0,400}status = 'published' and publish_at <= now\(\) and \(expires_at is null or expires_at > now\(\)\)/.test(sql));
  check("2 SQL: anon gets SELECT only on notifications (no insert/update/delete)", /revoke all on public\.notifications from anon, authenticated;\s*grant select on public\.notifications to anon;/.test(sql) && !/grant[^;]*(insert|update|delete)[^;]*to anon/i.test(sql));
  check("5 SQL: only is_admin() can write notifications (policy)", /notifications_admin_all[\s\S]{0,200}public\.is_admin\(\)/.test(sql));
  check("SQL: push_subscriptions has NO policy and anon/authenticated are revoked (not publicly readable)", !/create policy[^;]*on public\.push_subscriptions/.test(sql) && /revoke all on public\.push_subscriptions from anon, authenticated/.test(sql));
  check("SQL: admin_* functions verify is_admin() and are granted only to authenticated", ["admin_push_count", "admin_claim_push", "admin_unclaim_push", "admin_list_push_subscriptions", "admin_prune_push_subscriptions"].every(f => new RegExp(`function public\\.${f}[\\s\\S]*?if not public\\.is_admin\\(\\) then raise exception`).test(sql)) && !/grant execute on function public\.admin_[^;]*to anon/.test(sql));
  check("9 SQL: one notification per source record + no new notification when an already-published record is edited", /create unique index if not exists notifications_source_once[^;]*where source_type is not null/.test(sql) && /if tg_op = 'UPDATE' and old\.status = 'published' then return new;/.test(sql) && /on conflict \(source_type, source_id\) where source_type is not null do nothing/.test(sql));
  check("SQL: push_sent_at cannot be edited directly (only via claim function)", /razi\.push_claim/.test(sql) && /new\.push_sent_at := old\.push_sent_at/.test(sql));
  check("SQL: target_url constrained to internal routes or https; additive migration with rollback file", /target_url ~ '\^\(index\|about\|privacy\|assistant\|notifications\)/.test(sql) && fs.existsSync(path.join(ROOT, "supabase/rollbacks/003_rollback.sql")) && !/drop table[^;]*(news|announcements|timetables|resources)\b/i.test(sql));
  const h = f => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
  check("migrations 001 and 002 are byte-for-byte unchanged", h("supabase/migrations/001_initial_schema.sql") === "eb395dc08c74a0af04afbbc7c990ac5c04505dac9b0770b9e5590db61c74d79f" && h("supabase/migrations/002_cms_timetable.sql") === "eda099d66db909127f9c173ac539118bc21b4f4e5f91a5ca38b7e55e7aa6fb85");
  const all = ["api/assistant.js", "api/push-send.js", "api/push-subscription.js", "api/_lib/http.js", "api/_lib/retrieve.js"].map(rd).join("\n");
  check("no service-role key usage in server code (only anon + admin's own token)", !/SERVICE_ROLE|service_role|SUPABASE_SERVICE/i.test(all));
  const client = ["js/notifications.js", "js/admin-notify.js", "service-worker.js", "index.html", "notifications.html", "js/config.js", "manifest.webmanifest"].map(rd).join("\n");
  check("VAPID private key / secrets never appear in browser files", !/VAPID_PRIVATE|PRIVATE_KEY|setVapidDetails|SERVICE_ROLE/i.test(client) && !client.includes(PRIV));
  check("server code never logs request bodies, subscriptions or tokens", !/console\.(log|error)\([^)]*(body|endpoint|token|auth)/i.test(all.replace(/"push_send_error", e && e\.name/g, "")));
  const env = rd(".env.example");
  check(".env.example: VAPID names only (no values), GEMINI untouched", /^VAPID_PUBLIC_KEY=\s*$/m.test(env) && /^VAPID_PRIVATE_KEY=\s*$/m.test(env) && /^VAPID_SUBJECT=\s*$/m.test(env) && /^GEMINI_API_KEY=\s*$/m.test(env));
  const pj = JSON.parse(rd("package.json")), vj = JSON.parse(rd("vercel.json"));
  check("package.json depends on web-push; vercel.json sets function limits and no-cache for the service worker", /web-push/.test(JSON.stringify(pj.dependencies || {})) && vj.functions && vj.functions["api/push-send.js"] && JSON.stringify(vj.headers).includes("service-worker.js"));
  const hero = ["index.html", "css/v8.css", "data/i18n.js", "js/hero.js", "js/app.js", "js/ui.js"].map(rd).join("\n");
  check("19 hero scroll indicator fully removed (markup, CSS, keyframes, translations, JS)", !/hero__scroll|v8-line|التمرير للأسفل|مرر للأسفل|Défiler/.test(hero));
  check("hero artwork (3D ribbon/logo) untouched", /class="ribbon"/.test(rd("index.html")) && /logo3d/.test(rd("index.html")) && /\.ribbon \{/.test(rd("css/v8.css")));
  console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
