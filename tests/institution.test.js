// tests/institution.test.js — فحوص ساكنة للترحيل 004 وواجهات V10 (لا تثبت RLS الحقيقية؛ هذه تحتاج Supabase حيًا: supabase/tests/rls_checks_institution.sql).
const fs = require("fs"), path = require("path"), crypto = require("crypto"), ROOT = path.join(__dirname, ".."); let pass = 0, bad = 0;
const check = (n, ok, x = "") => { ok ? pass++ : bad++; console.log((ok ? "PASS " : "FAIL ") + n + (!ok && x ? "  [" + x + "]" : "")); };
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8"), sql = rd("supabase/migrations/004_institution_profiles.sql");
const T = ["school_statistics", "school_classes", "staff_categories", "staff_profiles"];

check("004 creates the 4 tables with UUID primary keys", T.every(t => new RegExp(`create table if not exists public\\.${t} \\(\\s*id uuid primary key default gen_random_uuid\\(\\)`).test(sql)));
check("004 enables RLS + admin_all + public_read (published only) for all 4 tables via one loop", /array\['school_statistics','school_classes','staff_categories','staff_profiles'\]/.test(sql) && /enable row level security/.test(sql) && /public\.is_admin\(\)/.test(sql) && /for select to anon, authenticated using \(status = ''published''\)/.test(sql) && /revoke all on public\.%I from anon, authenticated/.test(sql) && /grant select on public\.%I to anon/.test(sql));
check("anon gets SELECT only (never insert/update/delete)", !/grant (insert|update|delete)[^;]*to anon/.test(sql) && !/(^|\s)to public\b/m.test(sql));
check("created_at/updated_at + tg_base_defaults trigger + indexes", T.every(t => new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?created_at timestamptz`).test(sql)) && /tg_base_defaults/.test(sql) && /status_sort_idx/.test(sql) && /staff_profiles_category_idx/.test(sql));
check("statistics: published requires official_confirmed (DB CHECK)", /school_statistics_published_confirmed check \(status <> 'published' or official_confirmed\)/.test(sql));
check("staff: published requires consent + category (DB CHECK)", /staff_published_consent check \(status <> 'published' or consent_confirmed\)/.test(sql) && /staff_published_has_category check/.test(sql));
check("duplicate prevention: unique indexes for classes/categories/statistics kind", /school_classes_level_name_uidx/.test(sql) && /staff_categories_name_uidx/.test(sql) && /school_statistics_kind_uidx/.test(sql));
check("bilingual columns (ar+fr) on all content tables", ["label_fr", "level_fr", "track_fr", "name_fr", "description_fr", "job_title_fr", "specialty_fr", "department_fr", "bio_fr"].every(c => sql.includes(c)));
check("photos are paths, not Base64/URLs; path shape is enforced in a CHECK", /photo_path text,/.test(sql) && /staff_photo_path_shape/.test(sql) && !/base64|bytea/i.test(sql));
check("staff-photos bucket is PRIVATE, webp only, 512KB limit", /'staff-photos', 'staff-photos', false, 524288, array\['image\/webp'\]/.test(sql) && /public = false/.test(sql));
check("storage: select only for admin or published+consented profile photo (no draft exposure)", /staff_photos_select[\s\S]*?public\.is_admin\(\) or exists[\s\S]*?p\.status = 'published' and p\.consent_confirmed and p\.photo_path = storage\.objects\.name/.test(sql));
check("storage: insert/delete admin-only; insert path pattern enforced; NO update policy", /staff_photos_admin_insert[\s\S]*?public\.is_admin\(\) and name ~/.test(sql) && /staff_photos_admin_delete[\s\S]*?public\.is_admin\(\)/.test(sql) && !/for update on storage\.objects/.test(sql));
check("migration is additive: no drop of existing data/tables, 001-003 untouched", !/drop table (?!if exists public\.(school|staff))/i.test(sql) && !/truncate|delete from/i.test(sql));
check("rollback + RLS check scripts exist", fs.existsSync(path.join(ROOT, "supabase/rollbacks/004_rollback.sql")) && fs.existsSync(path.join(ROOT, "supabase/tests/rls_checks_institution.sql")));

// الترحيلات القديمة لم تُمسّ (مقارنة بتجزئة النسخة الأصلية إن وُجدت)
const h = f => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const base = process.env.V8_DIR;
if (base) for (const f of ["001_initial_schema.sql", "002_cms_timetable.sql", "003_notifications.sql"]) check("old migration untouched: " + f, h("supabase/migrations/" + f) === crypto.createHash("sha256").update(fs.readFileSync(path.join(base, "supabase/migrations", f))).digest("hex"));

// واجهة: لا أسرار، لا innerHTML بلا تهريب في الكود الجديد، لا Base64 للصور في القاعدة
const inst = rd("js/admin-inst.js"), app = rd("js/app.js");
check("no service_role / secret keys in new front-end code", !/service_role|sb_secret_|SERVICE_ROLE/.test(inst + app + rd("css/v10.css")));
check("public staff rendering escapes every DB field (esc) and never injects raw bio/name", /esc\(nm\)/.test(app) && /esc\(L\(x\.bio, x\.bio_fr\)\)/.test(app) && /esc\(L\(c\.name, c\.name_fr\)\)/.test(app) && /esc\(L\(g\[0\]\.level, g\[0\]\.level_fr\)\)/.test(app) && /esc\(L\(x\.label, x\.labelFr\)\)/.test(app));
check("photo upload validates type, 2MB, signature, converts to WebP 600x750, uploads new before deleting old", /MAXIN = 2 \* 1048576/.test(inst) && /sniff\(file\)/.test(inst) && /W = 600, H = 750/.test(inst) && /fresh\.forEach/.test(rd("js/admin-cms.js")) && /stalePhoto\.forEach/.test(rd("js/admin-cms.js")));
check("admin CSP unchanged-compatible: no blob:/inline needed (previews use data: URLs)", !/blob:|createObjectURL/.test(inst));
check("admin page has the new tab and loads admin-inst.js; stays noindex", /data-tab="inst"/.test(rd("admin/index.html")) && /admin-inst\.js/.test(rd("admin/index.html")) && /noindex, nofollow/.test(rd("admin/index.html")));
check("index.html: stats title + classes section + staff dialog + v10.css", /id="statsT"/.test(rd("index.html")) && /id="classes"/.test(rd("index.html")) && /id="staffDlg"/.test(rd("index.html")) && /css\/v10\.css/.test(rd("index.html")));
check("no hard-coded statistics numbers or invented staff/classes in HTML/JS", !/data-to="\d/.test(rd("index.html")) && !/RAZI\.stats = \[\s*\{/.test(rd("data/site.js")));
console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
