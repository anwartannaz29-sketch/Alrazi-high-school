// scripts/fetch-fonts.js — ينزّل ملفات WOFF2 (عربي + لاتيني فقط) إلى assets/fonts/ مرة واحدة. تشغيل: npm run fonts
// يتطلب اتصالًا بالإنترنت وNode 18+. بعدها يُخدَّم كل شيء من نطاقك دون طلبات خارجية. تحقق من ترخيص الخطوط (SIL OFL) قبل النشر.
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "assets", "fonts"); fs.mkdirSync(OUT, { recursive: true });
const CSS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@600;700&family=Noto+Sans+Arabic:wght@400;600&display=swap";
(async () => {
  const css = await (await fetch(CSS, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" } })).text();
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)]; let n = 0;
  for (const [, subset, body] of blocks) {
    if (!["arabic", "latin"].includes(subset)) continue;
    const fam = /font-family:\s*'([^']+)'/.exec(body)[1], w = /font-weight:\s*(\d+)/.exec(body)[1], url = /url\((https:[^)]+\.woff2)\)/.exec(body)[1];
    const name = `${fam.toLowerCase().replace(/\s+/g, "-")}-${w}-${subset}.woff2`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await (await fetch(url)).arrayBuffer())); console.log("✔", name); n++;
  }
  if (n !== 8) { console.error(`⚠️ تم تنزيل ${n} ملفات من 8 المتوقعة. راجع الشبكة وأعد المحاولة.`); process.exit(1); }
})().catch(e => { console.error("❌ فشل تنزيل الخطوط:", e.message); process.exit(1); });
