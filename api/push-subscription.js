"use strict";
/* api/push-subscription.js — GET: المفتاح العام VAPID. POST: { action: "subscribe"|"unsubscribe", endpoint, keys:{p256dh,auth}, lang }.
   لا يقرأ ولا يعرض أي اشتراك؛ يكتب عبر دوال SQL محكومة بمفتاح anon فقط. */
const { send, fail, originOk, ipOf, makeLimiter, readJson, rpc, pushHostOk, cfgFrom, B64URL } = require("./_lib/http");
const limit = makeLimiter(20);
const VAPID_PUB = /^[A-Za-z0-9_-]{80,100}$/;

async function handler(req, res, deps) {
  const env = (deps && deps.env) || process.env, fetchFn = (deps && deps.fetch) || fetch, now = (deps && deps.now) || Date.now();
  try {
    if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", { Allow: "GET, POST" });
    if (!originOk(req, env)) return fail(res, 403, "forbidden_origin");
    if (limit(ipOf(req), now)) return fail(res, 429, "rate_limited", { "Retry-After": "30" });
    const pub = String(env.VAPID_PUBLIC_KEY || "").trim();
    if (req.method === "GET") return VAPID_PUB.test(pub) ? send(res, 200, { success: true, publicKey: pub }) : fail(res, 503, "push_unavailable");
    const j = readJson(req); if (!j.body) return fail(res, j.status, j.code);
    const b = j.body, endpoint = b.endpoint;
    if (b.action !== "subscribe" && b.action !== "unsubscribe") return fail(res, 400, "invalid_request");
    if (typeof endpoint !== "string" || endpoint.length > 2048 || !pushHostOk(endpoint)) return fail(res, 400, "invalid_endpoint");
    const cfg = cfgFrom(env); if (!cfg) return fail(res, 503, "unavailable");
    if (b.action === "unsubscribe") {
      const r = await rpc(cfg, fetchFn, "remove_push_subscription", { p_endpoint: endpoint });
      return r.ok ? send(res, 200, { success: true, removed: r.data === true }) : fail(res, 502, "storage_error");
    }
    const k = b.keys; if (!k || typeof k !== "object" || typeof k.p256dh !== "string" || typeof k.auth !== "string"
      || !B64URL.test(k.p256dh) || k.p256dh.length < 20 || k.p256dh.length > 200 || !B64URL.test(k.auth) || k.auth.length < 10 || k.auth.length > 64) return fail(res, 400, "invalid_keys");
    if (!VAPID_PUB.test(pub)) return fail(res, 503, "push_unavailable");
    const r = await rpc(cfg, fetchFn, "register_push_subscription", { p_endpoint: endpoint, p_p256dh: k.p256dh, p_auth: k.auth, p_lang: b.lang === "fr" ? "fr" : "ar" });
    if (!r.ok) return fail(res, r.data && /subscription_limit/.test(JSON.stringify(r.data)) ? 503 : 502, "storage_error");
    return send(res, 200, { success: true });
  } catch (e) { console.error("push_subscription_error", e && e.name); return fail(res, 500, "internal_error"); }
}
module.exports = (req, res) => handler(req, res);
module.exports.handler = handler; module.exports._limit = limit;
