"use strict";
/* api/_lib/retrieve.js — استرجاع المحتوى المنشور فقط من Supabase (مفتاح anon + RLS). لا مفتاح سري ولا جلسة إدارة.
   كل الاستعلامات للقراءة، وتُرشَّح مرة ثانية هنا (status=published) كطبقة دفاع إضافية فوق RLS. */
const MAX_CTX = 6000, FIELD_MAX = 320, TIMEOUT_MS = 4000;
const DAYS = { 1: ["الاثنين", "Lun"], 2: ["الثلاثاء", "Mar"], 3: ["الأربعاء", "Mer"], 4: ["الخميس", "Jeu"], 5: ["الجمعة", "Ven"], 6: ["السبت", "Sam"], 7: ["الأحد", "Dim"] };
const SECTIONS = {
  news: { ar: "أخبار المؤسسة المنشورة", fr: "Actualités publiées", url: "index.html#news" },
  announcements: { ar: "إعلانات المؤسسة المنشورة", fr: "Annonces publiées", url: "index.html#announcements" },
  timetables: { ar: "استعمالات الزمن المنشورة", fr: "Emplois du temps publiés", url: "index.html#schedule" },
  resources: { ar: "الدروس والموارد المنشورة", fr: "Cours et ressources publiés", url: "index.html#resources" },
  teachers: { ar: "الأطر التربوية المنشورة", fr: "Équipe pédagogique publiée", url: "index.html#teachers" },
  clubs: { ar: "الأندية المنشورة", fr: "Clubs publiés", url: "index.html#clubs" },
  activities: { ar: "الأنشطة المنشورة", fr: "Activités publiées", url: "index.html#life" },
  achievements: { ar: "إنجازات المؤسسة المنشورة", fr: "Réalisations publiées", url: "index.html#achievements" },
  gallery: { ar: "معرض الصور", fr: "Galerie photos", url: "index.html#gallery" },
  site: { ar: "معلومات المؤسسة والتواصل", fr: "Informations et contact", url: "index.html#contact" }
};
const norm = s => String(s == null ? "" : s).normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
const INTENTS = {
  news: "خبر|اخبار|مستجد|actualit|news|nouveaut|evenement|événement",
  announcements: "اعلان|تنبيه|اشعار|annonce|avis|communiqu",
  timetables: "استعمال الزمن|جدول|حصه|حصص|توقيت|emploi|horaire|timetable|planning|heure",
  resources: "درس|دروس|تمرين|تمارين|فرض|فروض|ملخص|مورد|موارد|امتحان|cours|exercice|ressource|devoir|resume|résumé|examen",
  teachers: "استاذ|اساتذه|معلم|اطر|الاطر|مدرس|enseignant|prof|cadre|equipe pedagogique",
  clubs: "نادي|اندي|club",
  activities: "نشاط|انشط|فعاليه|activit|sortie|atelier",
  achievements: "انجاز|جائزه|جوايز|نتائج|تفوق|réussite|reussite|prix|resultat|réalisation|realisation|achievement",
  gallery: "صور|معرض|galerie|photo",
  site: "هاتف|رقم|بريد|ايميل|عنوان|اتصال|تواصل|اين|موقع|خريطه|contact|adresse|telephone|téléphone|email|mail|ou se trouve|où|plan d'acces|facebook|instagram|about|عن المؤسسه|تعريف|presentation|présentation"
};
const INTENT_RE = Object.fromEntries(Object.entries(INTENTS).map(([k, v]) => [k, new RegExp(norm(v))]));
const clean = (s, max = FIELD_MAX) => {
  const t = String(s == null ? "" : s).replace(/[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, " ").replace(/[<>`]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};
const httpsUrl = u => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length <= 2000) ? u : null;
const isPub = r => r && r.status === "published";

function detect(question) {
  const q = norm(question), hit = Object.keys(INTENT_RE).filter(k => INTENT_RE[k].test(q));
  return { q, hit };
}
function rank(rows, q, textOf, n) {
  const toks = q.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3);
  return rows.map((r, i) => ({ r, i, s: toks.reduce((a, t) => a + (norm(textOf(r)).includes(t) ? 1 : 0), 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map(x => x.r);
}
function cfgFrom(env) {
  const url = (env.SUPABASE_URL || "").trim().replace(/\/+$/, ""), key = (env.SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) return null;
  let role = ""; try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch {}
  if (/^sb_se[c]ret_/.test(key) || (role && role !== "anon")) return null;   // لا نقبل إلا مفتاح anon العام: أي دور آخر (مفتاح سري) مرفوض
  return { url, key };
}
async function rest(cfg, fetchFn, table, query) {
  const r = await fetchFn(`${cfg.url}/rest/v1/${table}?${query}`, {
    method: "GET", headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!r.ok) throw new Error("supabase_" + r.status);
  const j = await r.json(); return Array.isArray(j) ? j : [];
}
const P = "status=eq.published";

async function retrieve(question, lang, env, fetchFn) {
  const cfg = cfgFrom(env); if (!cfg) throw new Error("supabase_config");
  const { q, hit } = detect(question), now = Date.now();
  const want = new Set(hit.length ? hit : ["news", "announcements", "site"]);
  const jobs = {}, L = lang === "fr" ? 1 : 0;
  if (want.has("news")) jobs.news = rest(cfg, fetchFn, "news", `select=title,excerpt,content,category,published_at,status&${P}&order=published_at.desc&limit=20`);
  if (want.has("announcements")) jobs.announcements = rest(cfg, fetchFn, "announcements", `select=title,content,type,pinned,start_at,end_at,status&${P}&order=created_at.desc&limit=20`);
  if (want.has("resources")) jobs.resources = rest(cfg, fetchFn, "resources", `select=title,level,subject,unit,kind,file_url,status&${P}&order=created_at.desc&limit=40`);
  if (want.has("teachers")) jobs.teachers = rest(cfg, fetchFn, "teachers", `select=name,subject,role,status&${P}&order=sort_order.asc&limit=40`);   // بلا صور أو بيانات اتصال
  if (want.has("clubs")) jobs.clubs = rest(cfg, fetchFn, "clubs", `select=name,description,status&${P}&order=sort_order.asc&limit=20`);
  if (want.has("activities")) jobs.activities = rest(cfg, fetchFn, "activities", `select=kind,title,description,status&${P}&order=sort_order.asc&limit=20`);
  if (want.has("achievements")) jobs.achievements = rest(cfg, fetchFn, "achievements", `select=kind,title,description,achieved_on,status&${P}&order=created_at.desc&limit=20`);
  if (want.has("gallery")) jobs.gallery = rest(cfg, fetchFn, "gallery_items", `select=title,category,status&${P}&order=created_at.desc&limit=20`);   // بلا روابط الصور
  if (want.has("site")) jobs.site = rest(cfg, fetchFn, "site_settings", "select=key,value&key=in.(phone,email,address,facebook,instagram,youtube,website,about_text)");
  if (want.has("timetables")) jobs.timetables = rest(cfg, fetchFn, "timetables", `select=id,school_year,level,class_name,days,notes,status&${P}&order=school_year.desc&limit=60`);
  const keys = Object.keys(jobs), res = await Promise.all(keys.map(k => jobs[k]));
  const data = Object.fromEntries(keys.map((k, i) => [k, res[i]])), blocks = [], used = new Set(), allowed = new Set();
  const add = (sec, lines) => { if (lines.length) { blocks.push(`[${sec}]\n` + lines.join("\n")); used.add(sec); } };
  const link = u => { const h = httpsUrl(u); if (h) allowed.add(h); return h; };

  if (data.news) add("news", rank(data.news.filter(r => isPub(r) && r.published_at && Date.parse(r.published_at) <= now), q, r => r.title + " " + r.excerpt, 4)
    .map(r => `- ${clean(r.title, 160)} (${clean(r.published_at, 10)})${r.excerpt ? ": " + clean(r.excerpt) : r.content ? ": " + clean(r.content) : ""}`));
  if (data.announcements) add("announcements", rank(data.announcements.filter(r => isPub(r) && (!r.start_at || Date.parse(r.start_at) <= now) && (!r.end_at || Date.parse(r.end_at) > now)), q, r => r.title + " " + r.content, 5)
    .map(r => `- [${clean(r.type, 20)}] ${clean(r.title, 160)}: ${clean(r.content)}`));
  if (data.resources) add("resources", rank(data.resources.filter(r => isPub(r) && httpsUrl(r.file_url)), q, r => [r.title, r.level, r.subject, r.unit, r.kind].join(" "), 6)
    .map(r => `- ${clean(r.kind, 20)}: ${clean(r.title, 140)} | ${clean(r.level, 40)}${r.subject ? " | " + clean(r.subject, 40) : ""}${r.unit ? " | " + clean(r.unit, 60) : ""} | ${link(r.file_url)}`));
  if (data.teachers) add("teachers", data.teachers.filter(isPub).slice(0, 25).map(r => `- ${clean(r.name, 80)}${r.role ? " (" + clean(r.role, 60) + ")" : ""}${r.subject ? " — " + clean(r.subject, 60) : ""}`));
  if (data.clubs) add("clubs", data.clubs.filter(isPub).slice(0, 10).map(r => `- ${clean(r.name, 100)}${r.description ? ": " + clean(r.description, 200) : ""}`));
  if (data.activities) add("activities", data.activities.filter(isPub).slice(0, 10).map(r => `- [${clean(r.kind, 20)}] ${clean(r.title, 140)}${r.description ? ": " + clean(r.description, 200) : ""}`));
  if (data.achievements) add("achievements", rank(data.achievements.filter(isPub), q, r => r.title + " " + r.description, 6)
    .map(r => `- [${clean(r.kind, 20)}] ${clean(r.title, 140)}${r.achieved_on ? " (" + clean(r.achieved_on, 10) + ")" : ""}${r.description ? ": " + clean(r.description, 200) : ""}`));
  if (data.gallery) add("gallery", data.gallery.filter(isPub).slice(0, 8).map(r => `- ${clean(r.category, 30)}${r.title ? ": " + clean(r.title, 100) : ""}`));
  if (data.site) {
    const m = Object.fromEntries(data.site.filter(r => r && typeof r.key === "string").map(r => [r.key, r.value]));
    const lines = []; ["phone", "email", "address", "about_text"].forEach(k => m[k] && lines.push(`- ${k}: ${clean(m[k], k === "about_text" ? 600 : 200)}`));
    ["facebook", "instagram", "youtube", "website"].forEach(k => { const h = link(m[k]); if (h) lines.push(`- ${k}: ${h}`); });
    add("site", lines);
  }
  if (data.timetables) {
    const tts = data.timetables.filter(isPub), pick = tts.filter(t => {
      const lv = norm(t.level).replace(/^ال/, ""), cl = norm(t.class_name);   // "للجذع" و"الجذع" يتطابقان
      return (lv.length >= 2 && q.includes(lv)) || (cl.length >= 2 && q.includes(cl)) || (lv.length >= 2 && cl.length >= 1 && q.includes(lv + " " + cl));
    }).slice(0, 3);
    if (pick.length) {
      const ids = pick.map(t => t.id).filter(i => /^[0-9a-f-]{36}$/i.test(i)).join(",");
      const [per, ent] = await Promise.all([
        rest(cfg, fetchFn, "timetable_periods", `select=timetable_id,slot_no,label,starts_at,ends_at,is_break&timetable_id=in.(${ids})&order=slot_no.asc`),
        rest(cfg, fetchFn, "timetable_entries", `select=timetable_id,day,slot_no,subject,room,note&timetable_id=in.(${ids})&order=day.asc,slot_no.asc`)   // بلا اسم الأستاذ
      ]);
      const lines = [];
      pick.forEach(t => {
        lines.push(`# ${clean(t.level, 60)} ${clean(t.class_name, 60)} (${clean(t.school_year, 9)})${t.notes ? " — " + clean(t.notes, 200) : ""}`);
        const P2 = per.filter(p => p.timetable_id === t.id), tm = x => String(x || "").slice(0, 5);
        (t.days || []).forEach(d => {
          const cells = ent.filter(e => e.timetable_id === t.id && e.day === d).map(e => {
            const p = P2.find(x => x.slot_no === e.slot_no);
            return `${tm(p && p.starts_at)}-${tm(p && p.ends_at)} ${clean(e.subject, 60)}${e.room ? " (" + clean(e.room, 30) + ")" : ""}`;
          });
          lines.push(`${(DAYS[d] || [])[L] || d}: ${cells.length ? cells.join("; ") : "—"}`);
        });
      });
      add("timetables", lines);
    } else if (tts.length) {
      add("timetables", ["AVAILABLE_CLASSES (specific class not identified; ask which one): " + tts.slice(0, 30).map(t => clean(t.level, 40) + " " + clean(t.class_name, 40)).join(" ; ")]);
    }
  }
  let ctx = ""; for (const b of blocks) { if ((ctx + b).length > MAX_CTX) { ctx += b.slice(0, Math.max(0, MAX_CTX - ctx.length)); break; } ctx += b + "\n"; }
  return { context: ctx.trim(), sections: [...used], allowedUrls: allowed, empty: !ctx.trim() };
}
module.exports = { retrieve, detect, clean, httpsUrl, SECTIONS, norm, cfgFrom };
