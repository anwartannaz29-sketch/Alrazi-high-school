"use strict";
/* api/assistant.js — دالة Vercel (Node, CommonJS). POST /api/assistant  { question, lang: "ar"|"fr" }
   لأسئلة معلومات الثانوية فقط. المفاتيح من البيئة (الخادم فقط). لا تخزين للمحادثات ولا تسجيل لنص الأسئلة. */
const { retrieve, SECTIONS, httpsUrl } = require("./_lib/retrieve");
const { SYSTEM, SCHEMA, userPrompt } = require("./_lib/prompt");

const MAX_Q = 500, MAX_BODY = 4096, MAX_ANSWER = 1200, GEMINI_TIMEOUT_MS = 8000, DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MSG = {
  ar: {
    invalid: "تعذّر فهم الطلب. اكتب سؤالًا قصيرًا عن المؤسسة.", method: "طريقة الطلب غير مسموحة.", origin: "الطلب مرفوض.",
    rate: "الطلبات كثيرة الآن. حاول بعد قليل.", quota: "الخدمة مشغولة حاليًا. حاول لاحقًا أو تصفّح أقسام الموقع.",
    unavailable: "المساعد غير متاح مؤقتًا. تصفّح أقسام الموقع أو تواصل مع إدارة المؤسسة.", timeout: "تأخر الرد. حاول مرة أخرى.", upstream: "تعذّر الحصول على إجابة الآن. حاول لاحقًا.",
    nodata: "لم أجد جوابًا رسميًا منشورًا عن هذا السؤال. يمكنك مراجعة أقسام الموقع أو التواصل مع إدارة المؤسسة.",
    hello: "مرحبًا! أنا دليل الرازي. اسألني عن أخبار المؤسسة وإعلاناتها واستعمالات الزمن والدروس. لا ترسل معلومات شخصية أو خاصة بالتلاميذ."
  },
  fr: {
    invalid: "Requête non comprise. Posez une question courte sur l'établissement.", method: "Méthode non autorisée.", origin: "Requête refusée.",
    rate: "Trop de demandes. Réessayez dans un instant.", quota: "Service occupé. Réessayez plus tard ou parcourez le site.",
    unavailable: "L'assistant est momentanément indisponible. Parcourez le site ou contactez l'administration.", timeout: "Délai dépassé. Réessayez.", upstream: "Impossible d'obtenir une réponse maintenant. Réessayez plus tard.",
    nodata: "Je n'ai trouvé aucune réponse officielle publiée à cette question. Consultez les sections du site ou contactez l'administration.",
    hello: "Bonjour ! Je suis RAZI AI. Posez-moi vos questions sur les actualités, annonces, emplois du temps et cours. N'envoyez aucune information personnelle ou d'élève."
  }
};
const GREET = /^(?:\s*(?:مرحبا|مرحبًا|اهلا|أهلا|أهلًا|السلام عليكم|سلام|صباح الخير|مساء الخير|هلا|hello|hi|hey|salut|bonjour|bonsoir|coucou|salam)[\s!؟?.،,]*)+$/i;

const hits = new Map(); let dayKey = "", dayCount = 0;      // حدّ بسيط داخل ذاكرة النسخة (best-effort في بيئة serverless)
function limited(ip, env, now) {
  const perMin = Math.max(1, parseInt(env.ASSISTANT_RATE_LIMIT_PER_MIN, 10) || 6), daily = Math.max(1, parseInt(env.ASSISTANT_DAILY_LIMIT, 10) || 400);
  const dk = new Date(now).toISOString().slice(0, 10); if (dk !== dayKey) { dayKey = dk; dayCount = 0; }
  if (dayCount >= daily) return "daily";
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= perMin) { hits.set(ip, arr); return "minute"; }
  arr.push(now); hits.set(ip, arr); dayCount++;
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60000)) hits.delete(k);
  return null;
}
function send(res, status, body, extra) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(extra || {}).forEach(([k, v]) => res.setHeader(k, v)); res.end(JSON.stringify(body));
}
const fail = (res, status, code, lang, key, extra) => send(res, status, { success: false, code, message: MSG[lang][key], fallback: true }, extra);
const ok = (res, answer, sources, fallback) => send(res, 200, { success: true, answer, sources, fallback: !!fallback });
const srcOf = (keys, lang) => keys.filter(k => SECTIONS[k]).map(k => ({ label: SECTIONS[k][lang], url: SECTIONS[k].url }));

function originOk(req, env) {
  const o = req.headers.origin; if (!o) return true;                       // طلبات نفس الأصل من المتصفح قد لا تحمل Origin في GET فقط؛ POST يحمله
  let host; try { host = new URL(o).host; } catch { return false; }
  if (host === req.headers.host) return true;
  return String(env.ASSISTANT_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean).includes(o);
}
function parseBody(req) {
  let b; try { b = req.body; } catch { return null; }      // Vercel يرمي خطأ عند JSON غير صالح
  if (typeof b === "string") { if (b.length > MAX_BODY) return { tooBig: true }; try { b = JSON.parse(b); } catch { return null; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  if (typeof b.question !== "string" || (b.lang !== "ar" && b.lang !== "fr")) return null;
  const question = b.question.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!question || question.length > MAX_Q) return null;
  return { question, lang: b.lang };
}
function sanitizeAnswer(text, allowed) {
  let a = String(text).replace(/<[^>]*>/g, " ").replace(/[`*_#]{1,3}/g, "");
  a = a.replace(/https?:\/\/[^\s)»"']+/gi, u => (allowed.has(u.replace(/[.,;!؟،]+$/, "")) ? u : ""));   // لا روابط إلا من سجلات منشورة موثوقة
  a = a.replace(/\s+/g, " ").trim(); return a.length > MAX_ANSWER ? a.slice(0, MAX_ANSWER - 1) + "…" : a;
}
async function callGemini(env, fetchFn, question, lang, context) {
  const model = /^[a-z0-9.\-]{3,60}$/i.test(env.GEMINI_MODEL || "") ? env.GEMINI_MODEL : DEFAULT_MODEL;
  const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: userPrompt(question, lang, context) }] }],
      generationConfig: { maxOutputTokens: parseInt(env.GEMINI_MAX_OUTPUT_TOKENS, 10) || 400, temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA }
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
  });
  if (!r.ok) { const e = new Error("gemini_" + r.status); e.status = r.status; throw e; }
  const j = await r.json(), txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map(p => p.text || "").join("");
  if (!txt) throw Object.assign(new Error("empty"), { bad: true });
  let o; try { o = JSON.parse(txt.replace(/^```(?:json)?|```$/g, "").trim()); } catch { throw Object.assign(new Error("badjson"), { bad: true }); }
  if (!o || typeof o.answer !== "string" || typeof o.found !== "boolean" || !Array.isArray(o.used)) throw Object.assign(new Error("badshape"), { bad: true });
  return o;
}

async function handler(req, res, deps) {
  const env = (deps && deps.env) || process.env, fetchFn = (deps && deps.fetch) || fetch, now = (deps && deps.now) || Date.now();
  let lang = "ar";
  try {
    if (req.method !== "POST") return fail(res, 405, "method_not_allowed", lang, "method", { Allow: "POST" });
    if (!originOk(req, env)) return fail(res, 403, "forbidden_origin", lang, "origin");
    if (!/^application\/json/i.test(req.headers["content-type"] || "")) return fail(res, 415, "unsupported_media_type", lang, "invalid");
    if (parseInt(req.headers["content-length"] || "0", 10) > MAX_BODY) return fail(res, 413, "payload_too_large", lang, "invalid");
    const b = parseBody(req); if (b && b.tooBig) return fail(res, 413, "payload_too_large", lang, "invalid");
    if (!b) return fail(res, 400, "invalid_request", lang, "invalid");
    lang = b.lang;
    const ip = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "unknown").split(",")[0].trim();
    const lim = limited(ip, env, now);
    if (lim) return fail(res, 429, "rate_limited", lang, "rate", { "Retry-After": lim === "daily" ? "3600" : "30" });
    if (GREET.test(b.question)) return ok(res, MSG[lang].hello, [], false);                         // بلا استدعاء نموذج
    if (!env.GEMINI_API_KEY || !String(env.GEMINI_API_KEY).trim()) return fail(res, 503, "unavailable", lang, "unavailable");
    let ret; try { ret = await retrieve(b.question, lang, env, fetchFn); } catch { return fail(res, 503, "unavailable", lang, "unavailable"); }
    if (ret.empty) return ok(res, MSG[lang].nodata, srcOf(["site"], lang), true);                     // لا بيانات منشورة: لا نسأل النموذج
    let out; try { out = await callGemini(env, fetchFn, b.question, lang, ret.context); }
    catch (e) {
      console.error("assistant_upstream", e && (e.status || e.name || e.message));
      if (e && e.status === 429) return fail(res, 429, "quota", lang, "quota", { "Retry-After": "60" });
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) return fail(res, 504, "timeout", lang, "timeout");
      return fail(res, 502, "upstream_error", lang, "upstream");
    }
    const answer = sanitizeAnswer(out.answer, ret.allowedUrls);
    if (!answer) return fail(res, 502, "upstream_error", lang, "upstream");
    const used = out.used.filter(k => typeof k === "string" && ret.sections.includes(k));
    if (!out.found) return ok(res, answer, srcOf(used.length ? used : ["site"], lang), true);
    return ok(res, answer, srcOf(used.length ? used : ret.sections.slice(0, 2), lang), false);
  } catch (e) {
    console.error("assistant_error", e && e.name); return fail(res, 500, "internal_error", lang, "upstream");
  }
}
module.exports = (req, res) => handler(req, res);
module.exports.handler = handler; module.exports._limits = { reset() { hits.clear(); dayCount = 0; dayKey = ""; } };
