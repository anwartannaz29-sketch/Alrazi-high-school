// scripts/demo.js — معاينة محلية بمحتوى تجريبي: يشغّل build-config مع RAZI_DEMO=1 (يعمل على كل الأنظمة). للعودة: npm run build
const { spawnSync } = require("child_process"), path = require("path");
const r = spawnSync(process.execPath, [path.join(__dirname, "build-config.js")], { stdio: "inherit", env: { ...process.env, RAZI_DEMO: "1", VERCEL: "", CI: "" } });
process.exit(r.status || 0);
