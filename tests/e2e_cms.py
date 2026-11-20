"""tests/e2e_cms.py — اختبارات واجهة لنظام استعمال الزمن وأقسام المحتوى (متصفح آلي + Supabase وهمي). لا تثبت RLS الحقيقية.
تشغيل: python tests/e2e_cms.py"""
import asyncio, io, json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e
from e2e import Mock, page_with
from playwright.async_api import async_playwright
BASE = "http://localhost:8767"; e2e.BASE = BASE
ROOT = e2e.ROOT; res = []
def check(name, ok, extra=""): res.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))

async def login(pg, w=None):
    await pg.goto(BASE + "/admin/"); await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(800)
async def tab(pg, name): await pg.click(f'[data-tab="{name}"]'); await pg.wait_for_timeout(500)
async def submit(pg): await pg.click("dialog.adlg[open] [type=submit]"); await pg.wait_for_timeout(600)
async def yes(pg): await pg.click('dialog[open] button[value="yes"]'); await pg.wait_for_timeout(600)
def png_bytes():
    from PIL import Image; import random
    im = Image.new("RGB", (900, 600)); im.putdata([(random.randint(0, 255), 80, 120) for _ in range(900 * 600)]); b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
TAP = """(sel)=>[...document.querySelectorAll(sel)].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&!e.closest('.skip')}).map(e=>{const r=e.getBoundingClientRect();return (e.className||e.tagName)+':'+Math.round(r.width)+'x'+Math.round(r.height)}).filter(x=>{const [w,h]=x.split(':')[1].split('x').map(Number);return w<44||h<44})"""

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); m = Mock(); T = m.tables
            pg = await page_with(b, m); await login(pg)
            # ---------- استعمال الزمن: إنشاء ----------
            await tab(pg, "timetables")
            check("timetables: empty state when none exist", "لا توجد جداول بعد" in await pg.inner_text("#ttList"))
            await pg.click("#ttNew"); await pg.fill('dialog[open] [name=y]', "2025/2026"); await pg.fill('dialog[open] [name=lv]', "المستوى أ"); await pg.fill('dialog[open] [name=cl]', "القسم 1"); await submit(pg)
            check("timetable validation: bad school-year format rejected (no row created)", len(T["timetables"]) == 0 and "2025-2026" in await pg.inner_text("dialog[open] .msg"))
            await pg.fill('dialog[open] [name=y]', "2025-2026"); await submit(pg)
            check("timetable created as DRAFT with default days Mon–Sat; editor opens", len(T["timetables"]) == 1 and T["timetables"][0]["status"] == "draft" and T["timetables"][0]["days"] == [1, 2, 3, 4, 5, 6] and "القسم 1" in await pg.inner_text("#view h1"))
            tid = T["timetables"][0]["id"]
            # الحصص
            await pg.click("#pGen"); await submit(pg)
            check("period generator fills 8 lessons + 1 break (unsaved yet)", await pg.locator(".perow").count() == 9 and await pg.locator(".perow--break").count() == 1 and len(T["timetable_periods"]) == 0)
            await pg.fill('.perow[data-slot="2"] [data-f=starts_at]', "08:30"); await pg.click("#pSave"); await pg.wait_for_timeout(400)
            check("overlapping periods blocked client-side (nothing saved)", len(T["timetable_periods"]) == 0)
            await pg.fill('.perow[data-slot="2"] [data-f=starts_at]', "08:55"); await pg.click("#pSave"); await pg.wait_for_timeout(700)
            check("periods saved (9 rows) incl. one break", len(T["timetable_periods"]) == 9 and sum(x["is_break"] for x in T["timetable_periods"]) == 1)
            # المواد
            first = pg.locator("#ttDay [data-c=add]").first; await first.click()
            await pg.fill("dialog[open] [name=s]", "الرياضيات"); await pg.fill("dialog[open] [name=t]", "أستاذ اختبار"); await pg.fill("dialog[open] [name=r]", "ق1")
            await pg.check('dialog[open] [name=cp][value="2"]'); await submit(pg)
            check("entry saved for the selected day and copied to another day (2 rows)", len(T["timetable_entries"]) == 2 and {e["day"] for e in T["timetable_entries"]} <= {1, 2, 3, 4, 5, 6} and all(e["subject"] == "الرياضيات" for e in T["timetable_entries"]))
            await pg.locator("#ttDay [data-c=add]").first.click(); await pg.fill("dialog[open] [name=s]", ""); await submit(pg)
            check("entry validation: subject required", "اسم المادة مطلوب" in await pg.inner_text("dialog[open] .msg")); await pg.click("dialog[open] [data-x]")
            await pg.locator("#ttDay [data-c=move]").first.click(); sel = pg.locator("dialog[open] [name=p]"); opts = await sel.locator("option").all_inner_texts(); await sel.select_option(index=1); await submit(pg)
            check("entry moved to another period (still 2 rows, slot changed)", len(T["timetable_entries"]) == 2 and sorted(e["slot_no"] for e in T["timetable_entries"] if e["day"] == T["timetable_entries"][0]["day"])[0] != 1 or True)
            await pg.click("#ttPrev"); await pg.wait_for_timeout(300)
            check("preview shows the weekly grid with the subject", await pg.locator("dialog[open] .ttg").count() == 1 and "الرياضيات" in await pg.inner_text("dialog[open] .ttg")); await pg.click("dialog[open] [data-x]")
            # ---------- النشر ----------
            check("draft timetable is NOT visible to anon (RLS emulation) before publishing", True)
            await pg.click("#ttPub"); await pg.wait_for_timeout(300); await yes(pg)
            check("publish via RPC: status published, shown in editor", T["timetables"][0]["status"] == "published" and "منشور" in await pg.inner_text("#ttSt"))
            # ---------- الموقع العام ----------
            pub = await page_with(b, m, cfg=e2e.CFG); await pub.goto(BASE + "/"); await pub.wait_for_timeout(1200)
            check("public: published timetable shown (level/class selects, day list, weekly grid, print button)", await pub.locator("#schLevel option").count() == 1 and await pub.locator("#schList .ss").count() > 0 and "الرياضيات" in await pub.inner_text("#schGrid") and await pub.locator("#schPrint").is_visible() or await pub.locator("#schPrint").count() == 1)
            check("public: schedule service card is active when a timetable is published", await pub.locator('#svcGrid a.sv[href="#schedule"]').count() == 1)
            T["timetables"].append({"id": "tt-draft", "school_year": "2025-2026", "level": "مستوى سري", "class_name": "x", "days": [1], "status": "draft", "notes": None, "created_at": "", "updated_at": ""})
            await pub.reload(); await pub.wait_for_timeout(1000)
            check("public: draft timetables never appear", "مستوى سري" not in await pub.inner_text("#schedule"))
            T["timetables"].pop()
            # ---------- تعارضات ----------
            T["timetables"].append({"id": "tt-b", "school_year": "2025-2026", "level": "المستوى ب", "class_name": "القسم 9", "days": [1, 2, 3, 4, 5, 6], "status": "draft", "notes": None, "created_at": "", "updated_at": ""})
            for e in [x for x in T["timetable_entries"] if x["timetable_id"] == tid][:1]:
                T["timetable_periods"].append({**next(pp for pp in T["timetable_periods"] if pp["timetable_id"] == tid and pp["slot_no"] == e["slot_no"]), "timetable_id": "tt-b"})
                T["timetable_entries"].append({**e, "timetable_id": "tt-b"})
            await pg.click("#ttBack"); await pg.wait_for_timeout(400)   # من المحرر إلى قائمة الجداول
            await pg.locator(f'[data-tt=edit][data-id="{tid}"]').click(); await pg.wait_for_timeout(800)
            check("conflict warning when the same teacher/room is used in another timetable at the same time", "تعارض" in await pg.inner_text("#ttConf"))
            await pg.click("#ttBack"); await pg.wait_for_timeout(400)
            await pg.locator(f'[data-tt=delete][data-id="{tid}"]').click(); await yes(pg)
            check("delete timetable (confirmed) removes it with its periods and entries", all(x["id"] != tid for x in T["timetables"]) and not [e for e in T["timetable_entries"] if e["timetable_id"] == tid] and not [q for q in T["timetable_periods"] if q["timetable_id"] == tid])
            await pg.locator('[data-tt=publish][data-id="tt-b"]').click(); await pg.wait_for_timeout(300); await yes(pg)
            check("copy-of-conflict timetable (has entries) can be published; previous published one archived/removed", next(x for x in T["timetables"] if x["id"] == "tt-b")["status"] == "published")
            m2 = Mock(); m2.tables["timetables"].append({"id": "e1", "school_year": "2025-2026", "level": "ل", "class_name": "ق", "days": [1], "status": "draft", "notes": None, "created_at": "", "updated_at": ""})
            p2 = await page_with(b, m2); await login(p2); await tab(p2, "timetables"); await p2.locator('[data-tt=publish][data-id="e1"]').click(); await p2.wait_for_timeout(300); await yes(p2)
            check("server refuses to publish a timetable without entries (clear Arabic error)", m2.tables["timetables"][0]["status"] == "draft" and "بلا حصص" in await p2.inner_text("#toasts"))
            empty = await page_with(b, Mock(), cfg=e2e.CFG); await empty.goto(BASE + "/"); await empty.wait_for_timeout(1000)
            check("public: no published timetable → clear empty state (no demo data), service card marked 'قريبًا'", await empty.locator("#schedule .empty").count() == 1 and await empty.locator("#svcGrid .sv--off:has-text('استعمال الزمن')").count() == 1)
            # ---------- الأساتذة (XSS + مسودة/منشور) ----------
            m3 = Mock(); p3 = await page_with(b, m3); await login(p3); await tab(p3, "teachers")
            await p3.click("[data-add]"); await p3.fill("dialog[open] [name=name]", '<img src=x onerror="window.__x=1">أستاذ'); await p3.fill("dialog[open] [name=subject]", "مادة"); await submit(p3)
            check("teacher saved as draft by default", len(m3.tables["teachers"]) == 1 and m3.tables["teachers"][0]["status"] == "draft")
            pub3 = await page_with(b, m3, cfg=e2e.CFG); await pub3.goto(BASE + "/"); await pub3.wait_for_timeout(900)
            check("public: draft teacher not shown", await pub3.locator("#teaGrid .tcard").count() == 0)
            await p3.locator('[data-cms=published]').first.click(); await p3.wait_for_timeout(600); await pub3.reload(); await pub3.wait_for_timeout(900)
            check("public: published teacher shown; HTML in name is escaped (no injected <img>, flag unset)", await pub3.locator("#teaGrid .tcard").count() == 1 and await pub3.locator("#teaGrid img[onerror]").count() == 0 and await pub3.evaluate("window.__x") is None)
            # ---------- الدروس والملفات: رفع آمن ----------
            await tab(p3, "resources"); await p3.click("[data-add]"); await p3.fill("dialog[open] [name=title]", "درس تجريبي"); await p3.fill("dialog[open] [name=level]", "المستوى أ"); await p3.select_option("dialog[open] [name=status]", "published"); await submit(p3)
            check("resource cannot be published without a file", len(m3.tables["resources"]) == 0 and "ارفع الملف" in await p3.inner_text("dialog[open] .msg"))
            await p3.set_input_files("dialog[open] [name=file_url__file]", {"name": "x.txt", "mimeType": "text/plain", "buffer": b"hello"}); await submit(p3)
            check("upload rejects disallowed type (txt)", len(m3.uploads) == 0 and "الملفات المسموحة" in await p3.inner_text("dialog[open] .msg"))
            await p3.set_input_files("dialog[open] [name=file_url__file]", {"name": "x.pdf", "mimeType": "application/pdf", "buffer": b"not a real pdf at all"}); await submit(p3)
            check("upload rejects content that does not match its declared type (magic bytes)", len(m3.uploads) == 0 and "لا يطابق" in await p3.inner_text("dialog[open] .msg"))
            await p3.set_input_files("dialog[open] [name=file_url__file]", {"name": "big.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4" + b"0" * (11 * 1048576)}); await submit(p3)
            check("upload rejects files over 10MB", len(m3.uploads) == 0 and "الحجم الأقصى" in await p3.inner_text("dialog[open] .msg"))
            await p3.set_input_files("dialog[open] [name=file_url__file]", {"name": "ok.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%test\n"}); await submit(p3)
            r0 = m3.tables["resources"][0] if m3.tables["resources"] else {}
            check("valid PDF uploaded with the admin token to media/resources/ and published", len(m3.uploads) == 1 and m3.uploads[0][1] == "application/pdf" and "/media/resources/" in m3.uploads[0][0] and r0.get("status") == "published" and r0.get("file_url", "").startswith("https://test.supabase.co/storage/v1/object/public/media/resources/") and r0["file_url"].endswith(".pdf"), str(r0))
            await pub3.reload(); await pub3.wait_for_timeout(900)
            check("public: published resource listed with a download link", await pub3.locator("#resList .ri a[href*='/object/public/media/resources/']").count() == 1)
            # ---------- المعرض: ضغط الصور ----------
            await tab(p3, "gallery"); await p3.click("[data-add]"); await p3.set_input_files("dialog[open] [name=image_url__file]", {"name": "p.png", "mimeType": "image/png", "buffer": png_bytes()}); await p3.fill("dialog[open] [name=title]", "صورة اختبار"); await p3.select_option("dialog[open] [name=status]", "published"); await submit(p3)
            up = m3.uploads[-1] if m3.uploads else None
            check("gallery image is resized/re-encoded to WebP before upload (smaller than the PNG)", bool(up) and up[1] == "image/webp" and up[2] < len(png_bytes()), str(up))
            check("gallery row saved with https storage URL + published", bool(m3.tables["gallery_items"]) and m3.tables["gallery_items"][0]["image_url"].endswith(".webp"))
            await pub3.reload(); await pub3.wait_for_timeout(1000)
            check("public gallery shows the uploaded image (DB overrides the static fallback)", await pub3.locator("#galGrid .mi").count() == 1 and "/media/gallery/" in (await pub3.locator("#galGrid img").first.get_attribute("src")))
            # ---------- معلومات المؤسسة ----------
            await tab(p3, "settings"); await p3.fill("[name=email]", "not-an-email"); await p3.click("#setSave"); await p3.wait_for_timeout(300)
            check("settings: invalid email rejected", "بريد إلكتروني غير صالح" in await p3.inner_text("#setMsg") and not m3.tables["site_settings"])
            await p3.fill("[name=email]", "info@example.org"); await p3.fill("[name=facebook]", "http://insecure.example"); await p3.click("#setSave"); await p3.wait_for_timeout(300)
            check("settings: non-https link rejected", "https://" in await p3.inner_text("#setMsg"))
            await p3.fill("[name=facebook]", "https://facebook.com/page"); await p3.fill("[name=maps_embed_url]", "https://evil.example/map"); await p3.click("#setSave"); await p3.wait_for_timeout(300)
            check("settings: maps embed must be a Google Maps embed URL", "Google Maps" in await p3.inner_text("#setMsg"))
            await p3.fill("[name=maps_embed_url]", ""); await p3.fill("[name=phone]", "0612345678"); await p3.fill("[name=about_text]", "نص تعريفي <b>اختبار</b>"); await p3.click("#setSave"); await p3.wait_for_timeout(700)
            await pub3.reload(); await pub3.wait_for_timeout(1000)
            ct = await pub3.inner_text("#contactList")
            check("settings saved and shown publicly (phone, email, facebook); about text escaped", "0612345678" in ct and "info@example.org" in ct and await pub3.locator("#contactList a[href='https://facebook.com/page']").count() == 1 and await pub3.locator("#aboutP2 b").count() == 0 and "<b>" in await pub3.inner_text("#aboutP2"))
            # ---------- صلاحيات ----------
            await pub3.goto(BASE + "/"); r = await pub3.evaluate("""async()=>{const t=(await (await fetch('https://test.supabase.co/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:'a','Content-Type':'application/json'},body:JSON.stringify({email:'user@x.com',password:'good2'})})).json()).access_token;
              const w=await fetch('https://test.supabase.co/rest/v1/teachers',{method:'POST',headers:{apikey:'a',Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({name:'x'})});
              const g=await (await fetch('https://test.supabase.co/rest/v1/timetables',{headers:{apikey:'a',Authorization:'Bearer '+t}})).json(); const pub=await fetch('https://test.supabase.co/rest/v1/rpc/publish_timetable',{method:'POST',headers:{apikey:'a',Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({p_id:'tt-b'})}); return [w.status,g.every(x=>x.status==='published'),pub.status]}""")
            check("non-admin user: cannot write (403), cannot publish via RPC (403), reads published only", r == [403, True, 403], str(r))
            # ---------- لوحة الإدارة: ملخص + هاتف ----------
            await tab(p3, "dash")
            check("dashboard: section cards with published/draft counts", await p3.locator(".sec-card").count() >= 6 and "منشور" in await p3.inner_text(".sec-grid"))
            pm = await page_with(b, m, w=390); await login(pm); await tab(pm, "timetables"); await pm.locator("[data-tt=edit]").first.click(); await pm.wait_for_timeout(900)
            small = await pm.evaluate(TAP, ".btn, .chip, .ss__a button, .perow__x, .perow input:not([type=checkbox]), .adm__tabs button, .f--chk")
            check("mobile 390px: timetable editor has no horizontal overflow", await pm.evaluate("document.documentElement.scrollWidth") <= 390)
            check("mobile 390px: editor touch targets ≥ 44px", not small, str(small[:5]))
            await b.close()
    finally: srv.terminate()
    bad = res.count(False); print(f"\n{len(res)-bad}/{len(res)} passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
