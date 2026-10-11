// tests/build.test.js — اختبار سكربت البناء وإعداد Vercel (محلي بالكامل، بلا شبكة). تشغيل: node tests/build.test.js
const { spawnSync } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(__dirname, ".."); let pass = 0, bad = 0;
const check = (n, ok, x = "") => { ok ? pass++ : bad++; console.log((ok ? "PASS " : "FAIL ") + n + (!ok && x ? "  [" + x + "]" : "")); };
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const URL_ = "https://abcd1234.supabase.co", ANON = `x.${b64({ role: "anon" })}.y`, SERVICE = `x.${b64({ role: "service_role" })}.y`;
function run(env) {
  const out = path.join(os.tmpdir(), "cfg-" + Math.random().toString(36).slice(2) + ".js");
  const base = { PATH: process.env.PATH, CONFIG_OUT: out };           // بيئة نظيفة (بدون VERCEL/CI من الجهاز)
  const r = spawnSync("node", ["scripts/build-config.js"], { cwd: ROOT, env: { ...base, ...env }, encoding: "utf8" });
  const txt = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : ""; try { fs.unlinkSync(out); } catch {}
  return { code: r.status, out: r.stdout + r.stderr, cfg: txt };
}
if (fs.existsSync(path.join(ROOT, ".env"))) console.log("ℹ️  ملف .env موجود وقد يؤثر على الاختبارات المحلية");
let r;
r = run({ VERCEL: "1" });                                  check("production (VERCEL=1) without Supabase vars → build FAILS", r.code === 1 && /SUPABASE_URL/.test(r.out) && r.cfg === "", r.out);
r = run({ VERCEL: "1", SUPABASE_URL: URL_ });              check("production with URL but no key → FAILS", r.code === 1);
r = run({ CI: "true" });                                   check("CI=true treated as production → FAILS without vars", r.code === 1);
r = run({ VERCEL: "1", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON }); check("production with valid vars → succeeds, DEMO=false", r.code === 0 && /"DEMO":false/.test(r.cfg) && r.cfg.includes(URL_), r.out);
r = run({ VERCEL: "1", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON, RAZI_DEMO: "1" }); check("production with RAZI_DEMO=1 → FAILS (demo forbidden)", r.code === 1 && /RAZI_DEMO/.test(r.out));
r = run({ VERCEL: "1", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: SERVICE }); check("service_role JWT rejected", r.code === 1 && r.cfg === "");
r = run({ VERCEL: "1", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: "sb_secret_abc" }); check("sb_secret_ key rejected", r.code === 1);
r = run({ VERCEL: "1", SUPABASE_URL: "http://evil.example", SUPABASE_ANON_KEY: ANON }); check("invalid SUPABASE_URL rejected", r.code === 1);
r = run({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON }); check("local with valid vars → ok", r.code === 0 && /"DEMO":false/.test(r.cfg));
r = run({ RAZI_DEMO: "1" });                               check("local explicit RAZI_DEMO=1 → DEMO=true with warning", r.code === 0 && /"DEMO":true/.test(r.cfg) && /تجريبي/.test(r.out));
r = run({});                                               check("local with nothing → DEMO=false (no silent demo)", r.code === 0 && /"DEMO":false/.test(r.cfg) && /"SUPABASE_URL":""/.test(r.cfg));
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
check("vercel.json runs scripts/build-config.js as the build command", vj.buildCommand === "node scripts/build-config.js" && fs.existsSync(path.join(ROOT, vj.buildCommand.split(" ")[1])));
check("vercel.json: output dir '.', trailingSlash true", vj.outputDirectory === "." && vj.trailingSlash === true);
const adminH = (vj.headers.find(h => h.source.startsWith("/admin")) || { headers: [] }).headers.map(h => h.key);
check("vercel.json: admin has CSP + no-store + noindex + DENY framing", ["Content-Security-Policy", "Cache-Control", "X-Robots-Tag", "X-Frame-Options"].every(k => adminH.includes(k)));
const committed = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
check("committed js/config.js is the empty/non-demo default", /"DEMO":false/.test(committed) && /"SUPABASE_URL":""/.test(committed));
console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
