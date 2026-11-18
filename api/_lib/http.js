"use strict";
/* api/_lib/http.js — أدوات مشتركة لدوال الإشعارات (push-subscription / push-send). لا أسرار هنا. */
const { cfgFrom } = require("./retrieve");
const MAX_BODY = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
/* خدمات Push المعروفة فقط (حماية من SSRF: الخادم يرسل لاحقًا إلى هذه العناوين) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const pushHostOk = endpoint => { try { const u = new URL(endpoint); return u.protocol === "https:" && !u.username && !u.password && !u.port && PUSH_HOSTS.some(r => r.test(u.hostname)); } catch { return false; } };

function send(res, status, body, extra) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(extra || {}).forEach(([k, v]) => res.setHeader(k, v)); res.end(JSON.stringify(body));
}
const fail = (res, status, code, extra) => send(res, status, { success: false, code }, extra);
function originOk(req, env) {
  const o = req.headers.origin; if (!o) return true;
  let host; try { host = new URL(o).host; } catch { return false; }
  return host === req.headers.host || String(env.ASSISTANT_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean).includes(o);
}
const ipOf = req => String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "unknown").split(",")[0].trim();
function makeLimiter(perMin) {
  const hits = new Map();
  const fn = (ip, now) => {
    const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (arr.length >= perMin) { hits.set(ip, arr); return true; }
    arr.push(now); hits.set(ip, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60000)) hits.delete(k);
    return false;
  };
  fn.reset = () => hits.clear(); return fn;
}
/* قراءة JSON آمنة: يعيد { body } أو { code, status } */
function readJson(req) {
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) return { status: 415, code: "unsupported_media_type" };
  if (parseInt(req.headers["content-length"] || "0", 10) > MAX_BODY) return { status: 413, code: "payload_too_large" };
  let b; try { b = req.body; } catch { return { status: 400, code: "invalid_request" }; }
  if (typeof b === "string") { if (b.length > MAX_BODY) return { status: 413, code: "payload_too_large" }; try { b = JSON.parse(b); } catch { return { status: 400, code: "invalid_request" }; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) return { status: 400, code: "invalid_request" };
  return { body: b };
}
/* استدعاء دالة SQL عبر PostgREST بمفتاح anon (+ رمز المشرف عند الحاجة). لا service-role إطلاقًا. */
async function rpc(cfg, fetchFn, name, args, token) {
  const h = { apikey: cfg.key, "Content-Type": "application/json", Accept: "application/json" };
  const bearer = token || (cfg.key.split(".").length === 3 ? cfg.key : null); if (bearer) h.Authorization = "Bearer " + bearer;
  const r = await fetchFn(`${cfg.url}/rest/v1/rpc/${name}`, { method: "POST", headers: h, body: JSON.stringify(args || {}), signal: AbortSignal.timeout(5000) });
  let j = null; try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data: j };
}
module.exports = { send, fail, originOk, ipOf, makeLimiter, readJson, rpc, pushHostOk, cfgFrom, UUID, B64URL, MAX_BODY };
