// scripts/build-config.js — يولّد js/config.js من متغيرات البيئة. بلا اعتماديات.
// قواعد الإنتاج (Vercel: VERCEL=1): غياب الإعدادات أو وجود وضع تجريبي = فشل البناء. لا رجوع صامت إلى بيانات تجريبية.
const fs = require("fs"), path = require("path");
const env = { ...process.env };
try { // دعم .env محليًا فقط
  fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch {}
const out = env.CONFIG_OUT || path.join(__dirname, "..", "js", "config.js");
const url = (env.SUPABASE_URL || "").trim(), key = (env.SUPABASE_ANON_KEY || "").trim();
const demo = env.RAZI_DEMO === "1";
const isHosted = !!(env.VERCEL || env.CI);          // أي بيئة نشر/CI تُعامَل كإنتاج
const fail = m => { console.error("❌ " + m); process.exit(1); };
const isSecret = k => {
  if (/^sb_secret_/.test(k) || /service/i.test(k)) return true;
  try { return JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role === "service_role"; } catch { return false; }
};

if (key && isSecret(key)) fail("SUPABASE_ANON_KEY يبدو مفتاحًا سريًا (service_role/secret). استعمل مفتاح anon/publishable فقط.");
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail("SUPABASE_URL غير صالح (المتوقع https://xxxx.supabase.co).");
if (isHosted) {
  if (!url || !key) fail("بناء الإنتاج يتطلب SUPABASE_URL و SUPABASE_ANON_KEY (Vercel ← Settings ← Environment Variables). لن يُنشر الموقع بدونهما.");
  if (demo) fail("RAZI_DEMO=1 ممنوع في الإنتاج: لا تُنشر بيانات تجريبية على الموقع الرسمي.");
} else if (!url || !key) {
  console.warn(demo ? "⚠️  وضع تجريبي محلي (RAZI_DEMO=1): ستظهر بيانات غير رسمية مع شريط تنبيه."
                    : "⚠️  لا يوجد Supabase ولا وضع تجريبي: الأخبار والإعلانات ستظهر فارغة محليًا. للتجربة ضع RAZI_DEMO=1 في .env");
}
const cfg = { SUPABASE_URL: url, SUPABASE_ANON_KEY: key, DEMO: !isHosted && demo };
fs.writeFileSync(out, `/* مولَّد آليًا بواسطة scripts/build-config.js — لا تعدّله يدويًا. يحتوي المفتاح العام فقط. */\nwindow.RAZI_CONFIG = ${JSON.stringify(cfg)};\n`);
// ---- SEO (V10): sitemap.xml + robots.txt + canonical/og:url/og:image مطلقة داخل الصفحات (تحتاج دومينًا: SITE_URL أو دومين Vercel الإنتاجي) ----
const root = env.SEO_OUT_DIR || path.join(__dirname, "..");
const site = (env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + env.VERCEL_PROJECT_PRODUCTION_URL : "")).replace(/\/+$/, "");
if (site && !/^https:\/\/[a-z0-9.-]+$/i.test(site)) fail("SITE_URL غير صالح (المتوقع https://example.com بدون مسار).");
const robots = "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n" + (site ? `Sitemap: ${site}/sitemap.xml\n` : "");
fs.writeFileSync(path.join(root, "robots.txt"), robots);
const PAGES = [["/", "index.html", "1.0"], ["/about.html", "about.html", "0.7"], ["/assistant.html", "assistant.html", "0.6"], ["/privacy.html", "privacy.html", "0.3"]];
const smPath = path.join(root, "sitemap.xml"), today = new Date().toISOString().slice(0, 10);
if (site) fs.writeFileSync(smPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(([u, , p]) => `  <url><loc>${site}${u}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join("\n")}\n</urlset>\n`);
else if (fs.existsSync(smPath)) fs.unlinkSync(smPath);
if (site) {   // حقن idempotent بين علامتين؛ لا يمس الصفحات غير الموجودة (الاختبارات تستعمل مجلدًا مؤقتًا)
  const esc = v => String(v).replace(/[^A-Za-z0-9_\-]/g, "");
  const gv = esc(env.GOOGLE_SITE_VERIFICATION || ""), bv = esc(env.BING_SITE_VERIFICATION || "");
  for (const [u, file] of PAGES) {
    const fp = path.join(root, file); if (!fs.existsSync(fp)) continue;
    let h = fs.readFileSync(fp, "utf8");
    h = h.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->\s*/g, "");
    h = h.replace(/(<meta property="og:image" content=")(?!https:)([^"]+)(")/, (m, a, p, c) => a + site + "/" + p.replace(/^\/+/, "") + c);
    let blk = `<!--seo:start-->\n<link rel="canonical" href="${site}${u}">\n<meta property="og:url" content="${site}${u}">\n<meta property="og:site_name" content="الثانوية التأهيلية الرازي">\n`;
    if (gv) blk += `<meta name="google-site-verification" content="${gv}">\n`;
    if (bv) blk += `<meta name="msvalidate.01" content="${bv}">\n`;
    if (u === "/") blk += `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "الثانوية التأهيلية الرازي", alternateName: "Lycée Qualifiant Al-Razi", url: site + "/", inLanguage: ["ar", "fr"] })}</script>\n`;
    blk += "<!--seo:end-->\n";
    h = h.replace("</title>", "</title>\n" + blk.trimEnd()); if (!h.includes("<!--seo:start-->")) continue;
    fs.writeFileSync(fp, h);
  }
}
console.log("✔", path.basename(out), `(supabase: ${url ? "yes" : "no"}, demo: ${cfg.DEMO})`);
