"use strict";
/* api/push-send.js — POST { notificationId } + Authorization: Bearer <access token المشرف>.
   1) يتحقق من الرمز لدى Supabase Auth، 2) يستدعي is_admin() بالرمز نفسه، 3) «يحجز» الإرسال مرة واحدة في قاعدة البيانات (idempotency)،
   4) يرسل عبر مكتبة web-push، 5) يحذف الاشتراكات المنتهية. لا service-role: كل الصلاحيات من رمز المشرف + دوال SQL. */
const { send, fail, originOk, ipOf, makeLimiter, readJson, rpc, pushHostOk, cfgFrom, UUID } = require("./_lib/http");
const limit = makeLimiter(10), CHUNK = 40, TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ROUTE = /^(index|about|privacy|assistant|notifications)\.html(#[a-z0-9-]{1,40})?$/, HTTPS = /^https:\/\/[^\s<>"']{4,500}$/;
const cut = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function payloadFor(n, lang) {
  const fr = lang === "fr" && n.title_fr;
  return JSON.stringify({ id: n.id, t: cut(fr ? n.title_fr : n.title, 100), b: cut(fr ? (n.summary_fr || n.summary) : n.summary, 180), u: ROUTE.test(n.target_url) || HTTPS.test(n.target_url) ? n.target_url : "index.html", p: n.priority === "urgent" ? 2 : n.priority === "high" ? 1 : 0 });
}
async function handler(req, res, deps) {
  const env = (deps && deps.env) || process.env, fetchFn = (deps && deps.fetch) || fetch, now = (deps && deps.now) || Date.now();
  let claimed = null, cfg = null, token = null, sentAny = false;
  const unclaim = async () => { if (claimed) { try { await rpc(cfg, fetchFn, "admin_unclaim_push", { p_id: claimed }, token); } catch {} claimed = null; } };
  try {
    if (req.method !== "POST") return fail(res, 405, "method_not_allowed", { Allow: "POST" });
    if (!originOk(req, env)) return fail(res, 403, "forbidden_origin");
    if (limit(ipOf(req), now)) return fail(res, 429, "rate_limited", { "Retry-After": "60" });
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization || ""); if (!m || m[1].length > 4096 || !TOKEN.test(m[1])) return fail(res, 401, "unauthorized");
    token = m[1];
    const j = readJson(req); if (!j.body) return fail(res, j.status, j.code);
    const id = j.body.notificationId; if (typeof id !== "string" || !UUID.test(id)) return fail(res, 400, "invalid_request");
    cfg = cfgFrom(env); if (!cfg) return fail(res, 503, "unavailable");
    const pub = String(env.VAPID_PUBLIC_KEY || "").trim(), priv = String(env.VAPID_PRIVATE_KEY || "").trim(), subj = String(env.VAPID_SUBJECT || "").trim();
    if (!pub || !priv || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subj)) return fail(res, 503, "push_unavailable");   // قبل أي حجز
    let webpush; try { webpush = (deps && deps.webpush) || require("web-push"); } catch { return fail(res, 503, "push_unavailable"); }

    // 1) هوية صحيحة لدى Supabase Auth  2) is_admin() بالرمز نفسه (لا نثق بأي علم من العميل)
    const u = await fetchFn(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(5000) });
    let uj = null; try { uj = await u.json(); } catch {}
    if (!u.ok || !uj || !uj.id) return fail(res, 401, "unauthorized");
    const adm = await rpc(cfg, fetchFn, "is_admin", {}, token);
    if (!adm.ok || adm.data !== true) return fail(res, 403, "forbidden");

    // 3) حجز ذرّي: ينجح مرة واحدة فقط لكل إشعار منشور
    const c = await rpc(cfg, fetchFn, "admin_claim_push", { p_id: id }, token);
    if (!c.ok) return fail(res, c.status === 401 || c.status === 403 ? 403 : 502, c.status === 401 || c.status === 403 ? "forbidden" : "storage_error");
    if (!c.data) return fail(res, 409, "already_sent_or_not_publishable");
    claimed = id; const n = c.data;

    const l = await rpc(cfg, fetchFn, "admin_list_push_subscriptions", { p_limit: 3000 }, token);
    if (!l.ok || !Array.isArray(l.data)) { await unclaim(); return fail(res, 502, "storage_error"); }
    const subs = l.data, bad = [], opts = { TTL: 86400, urgency: n.priority === "normal" ? "normal" : "high", timeout: 5000 };
    webpush.setVapidDetails(subj, pub, priv);
    let delivered = 0, failed = 0; const payloads = { ar: payloadFor(n, "ar"), fr: payloadFor(n, "fr") };
    for (let i = 0; i < subs.length; i += CHUNK) {
      await Promise.all(subs.slice(i, i + CHUNK).map(async s => {
        if (!s || !pushHostOk(s.endpoint)) { if (s && s.id) bad.push(s.id); return; }
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloads[s.lang === "fr" ? "fr" : "ar"], opts); delivered++; sentAny = true; }
        catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) bad.push(s.id); else failed++; }
      }));
    }
    let removed = 0;
    if (bad.length) { const p = await rpc(cfg, fetchFn, "admin_prune_push_subscriptions", { p_ids: bad }, token); if (p.ok && typeof p.data === "number") removed = p.data; }
    if (delivered === 0) await unclaim();                      // لم يصل شيء: يسمح بمحاولة صريحة لاحقة
    return send(res, 200, { success: true, total: subs.length, delivered, failed, removed });
  } catch (e) {
    if (!sentAny) await unclaim(); console.error("push_send_error", e && e.name); return fail(res, 500, "internal_error");
  }
}
module.exports = (req, res) => handler(req, res);
module.exports.handler = handler; module.exports._limit = limit;
