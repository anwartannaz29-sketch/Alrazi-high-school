"""tests/institution-ui.py — واجهة «المؤسسة بالأرقام» + الأقسام + الأطر (العامة) ولوحة الإدارة، مع Supabase/Storage وهميين.
لا تثبت RLS الحقيقية (تحتاج supabase/tests/rls_checks_institution.sql على مشروع حي). تشغيل: python tests/institution-ui.py"""
import asyncio, io, json, os, re, subprocess, sys, time, uuid, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e
from e2e import page_with
from playwright.async_api import async_playwright
BASE = "http://localhost:8768"; ROOT = e2e.ROOT; SB = e2e.SB; res = []
def check(name, ok, extra=""): res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d0a4720000000049454e44ae426082")
def big_png(w=900, h=1100):
    from PIL import Image; import random
    im = Image.new("RGB", (w, h)); im.putdata([(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)) for _ in range(w * h)]); b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
def face_png():
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (1000, 1300), (200, 210, 230)); d = ImageDraw.Draw(im); d.ellipse((300, 200, 700, 700), fill=(240, 200, 170)); b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
H = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range"}
XSS = '<img src=x onerror="window.__xss=1">'

class Store:
    def __init__(s):
        s.t = {n: [] for n in ("school_statistics", "school_classes", "staff_categories", "staff_profiles")}; s.files = {}; s.log = []; s.fail_patch = False; s.gets = []
    def add(s, t, **r):
        r.setdefault("id", str(uuid.uuid4())); r.setdefault("created_at", "2026-10-01T10:00:00Z"); r.setdefault("updated_at", "2026-10-01T10:00:00Z"); s.t[t].append(r); return r
    def match(s, r, q):
        for k, vs in q.items():
            v = vs[0]
            if k in ("select", "order", "limit", "offset"): continue
            if v.startswith("eq.") and str(r.get(k)) != v[3:]: return False
            if v.startswith("neq.") and str(r.get(k)) == v[4:]: return False
            if v.startswith("ilike.") and v[6:].strip("*") not in str(r.get(k, "")): return False
        return True
    def cat(s, cid): return next((c for c in s.t["staff_categories"] if c["id"] == cid and c["status"] == "published"), None)
    def constraint(s, t, r):
        if t == "school_statistics" and r.get("status") == "published" and not r.get("official_confirmed"): return "school_statistics_published_confirmed"
        if t == "staff_profiles" and r.get("status") == "published" and not r.get("consent_confirmed"): return "staff_published_consent"
        return None
    async def handle(s, route):
        req = route.request; u = urllib.parse.urlparse(req.url); q = urllib.parse.parse_qs(u.query); tok = req.headers.get("authorization", "").replace("Bearer ", ""); adm = tok == "tok-u-admin"
        J = {**H, "content-type": "application/json"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=H)
        def ok(b, st=200): return route.fulfill(status=st, headers=J, body=json.dumps(b))
        if u.path.endswith("/auth/v1/token"):
            b = json.loads(req.post_data or "{}")
            return await ok({"access_token": "tok-u-admin", "refresh_token": "r", "expires_in": 3600, "user": {"id": "u-admin", "email": "admin@x.com"}}) if b.get("password") == "good" else await ok({"error": "x"}, 400)
        if u.path.endswith("/auth/v1/logout"): return await ok({}, 204)
        if "/storage/v1/object/sign/staff-photos/" in u.path: return await route.fulfill(status=200, headers={**H, "content-type": "image/png"}, body=PNG)
        if u.path.endswith("/storage/v1/object/sign/staff-photos"):
            paths = json.loads(req.post_data)["paths"]; out = []
            for p in paths:
                shown = adm or any(x["photo_path"] == p and x["status"] == "published" and x.get("consent_confirmed") for x in s.t["staff_profiles"])
                out.append({"path": p, "signedURL": f"/object/sign/staff-photos/{p}?token=t"} if shown else {"path": p, "error": "Object not found", "signedURL": None})
            return await ok(out)
        m = re.search(r"/storage/v1/object/staff-photos/(.+)$", u.path)
        if m:
            p = m.group(1)
            if not adm: return await route.fulfill(status=403, headers=J, body='{"message":"rls"}')
            if req.method == "POST":
                s.log.append(("UPLOAD", p, req.headers.get("content-type"), len(req.post_data_buffer or b""))); s.files[p] = len(req.post_data_buffer or b""); return await ok({"Key": p})
            if req.method == "DELETE": s.log.append(("REMOVE", p)); s.files.pop(p, None); return await ok({})
        t = u.path.split("/rest/v1/")[-1]
        if t == "admin_users": return await ok([{"user_id": "u-admin"}] if adm and q.get("user_id") == ["eq.u-admin"] else [])
        if t not in s.t: return await ok([])
        rows = s.t[t]
        if req.method == "GET":
            s.gets.append((t, u.query))
            r = [x for x in rows if (adm or x["status"] == "published") and s.match(x, q)]
            if t == "staff_profiles" and "staff_categories(" in q.get("select", [""])[0]: r = [{**x, "staff_categories": s.cat(x.get("category_id"))} for x in r]
            return await ok(r)
        if not adm: return await ok({"code": "42501", "message": "rls"}, 403)
        body = json.loads(req.post_data or "null")
        if req.method == "POST":
            row = {"id": str(uuid.uuid4()), "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:00:00Z", **body}; c = s.constraint(t, row)
            if c: return await ok({"code": "23514", "message": c}, 400)
            rows.append(row); s.log.append(("INSERT", t)); return await ok([row], 201)
        rid = q.get("id", [""])[0][3:]
        if req.method == "PATCH":
            s.log.append(("PATCH", t, rid))
            if s.fail_patch: return await ok({"code": "XX000", "message": "boom"}, 500)
            row = next((x for x in rows if x["id"] == rid), None)
            if not row: return await ok([])
            new = {**row, **body}; c = s.constraint(t, new)
            if c: return await ok({"code": "23514", "message": c}, 400)
            row.update(body); return await ok([row])
        if req.method == "DELETE": s.log.append(("DELETE", t, rid)); s.t[t] = [x for x in rows if x["id"] != rid]; return await ok([])

async def new_page(b, st, w=1280, reduced=True):
    ctx = await b.new_context(viewport={"width": w, "height": 900}, reduced_motion="reduce" if reduced else "no-preference"); pg = await ctx.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e))); await ctx.route("**/fonts.*/**", lambda r: r.abort())
    await ctx.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=e2e.CFG)); await ctx.route(SB + "/**", st.handle); return pg
def seed_public(st):
    st.add("school_statistics", kind="students", label="عدد التلاميذ", label_fr="Élèves", value=120, as_of="2026-10-15", official_confirmed=True, status="published", sort_order=1)
    st.add("school_statistics", kind="custom", label="إحصائية " + XSS, value=7, official_confirmed=True, status="published", sort_order=2)
    st.add("school_statistics", kind="classes", label="مسودة سرية", value=999, official_confirmed=False, status="draft")
    st.add("school_classes", level="مستوى أ", level_fr="Niveau A", name="قسم 1", name_fr="Classe 1", track="مسلك س", code="A1", students_count=30, description="وصف القسم", status="published", sort_order=1)
    st.add("school_classes", level="مستوى أ", name="قسم 2", status="published", sort_order=2)
    st.add("school_classes", level="مستوى ب", name="قسم 3 " + XSS, status="published", sort_order=3)
    st.add("school_classes", level="مستوى ب", name="قسم مخفي", status="draft")
    c1 = st.add("staff_categories", name="الفئة الأولى", name_fr="Catégorie 1", sort_order=1, status="published"); c2 = st.add("staff_categories", name="الفئة الثانية", sort_order=2, status="published")
    pid = str(uuid.uuid4()); st.add("staff_profiles", id=pid, full_name="أحمد الاختباري", job_title="مدير", job_title_fr="Directeur", specialty="تخصص", bio="نبذة قصيرة", bio_fr="Courte bio", category_id=c1["id"], photo_path=f"{pid}/profile-1700000000.webp", consent_confirmed=True, status="published", sort_order=1)
    st.add("staff_profiles", full_name="سلمى " + XSS, job_title="إدارية", category_id=c2["id"], consent_confirmed=True, status="published", sort_order=2, bio="<b>x</b>")
    st.add("staff_profiles", full_name="مؤطر مسودة", category_id=c2["id"], status="draft"); st.add("staff_profiles", full_name="مؤطر بلا موافقة", category_id=c2["id"], status="archived", consent_confirmed=True)

async def login(pg):
    await pg.goto(BASE + "/admin/"); await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(900)
async def sub(pg): await pg.click("dialog.adlg[open] [type=submit]"); await pg.wait_for_timeout(700)

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8768"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            # ================= العام: حالات فارغة =================
            st = Store(); pg = await new_page(b, st); await pg.goto(BASE + "/index.html"); await pg.wait_for_timeout(1200)
            check("empty: stats + classes sections hidden, legacy staff empty state, no errors", await pg.locator("#stats").is_hidden() and await pg.locator("#classes").is_hidden() and await pg.locator("#teaGrid .empty").count() == 1 and not pg.errors, pg.errors)
            # ================= العام: بيانات =================
            st = Store(); seed_public(st); pg = await new_page(b, st); await pg.goto(BASE + "/index.html"); await pg.wait_for_timeout(1500)
            await pg.locator("#stats").scroll_into_view_if_needed(); await pg.wait_for_timeout(600)
            vals = await pg.eval_on_selector_all("#statsGrid .stat b", "els=>els.map(e=>e.textContent)")
            check("stats: only published+confirmed shown, values final (reduced motion), draft hidden", vals == ["120", "7"] and "999" not in await pg.inner_text("#stats"), vals)
            check("stats: last-update date shown", "آخر تحديث" in await pg.inner_text("#statsAsOf"))
            check("stats: XSS label rendered as text, not executed", await pg.evaluate("window.__xss") is None and "onerror" in await pg.inner_text("#statsGrid"))
            check("classes: grouped by level, count of published shown, draft hidden", await pg.locator("#clsList .lvl").count() == 2 and "3" in await pg.inner_text("#clsCount") and "قسم مخفي" not in await pg.inner_text("#classes"))
            check("classes: description opens as details; XSS escaped", await pg.locator("#clsList details").count() == 1 and await pg.evaluate("window.__xss") is None)
            check("staff: 2 published cards (draft/archived never shown), categories chips + grouped headings", await pg.locator(".scard").count() == 2 and await pg.locator("#staffCats .chip").count() == 3 and await pg.locator(".sgroup h3").count() == 2 and "مسودة" not in await pg.inner_text("#teachers"))
            await pg.locator("#teaGrid").scroll_into_view_if_needed(); await pg.wait_for_timeout(800)
            check("staff: signed private photo loaded (img), card without photo has placeholder", await pg.locator(".scard img[data-sp]").count() == 1 and await pg.locator(".scard__av").count() == 1 and await pg.eval_on_selector(".scard img[data-sp]", "i=>i.complete&&i.naturalWidth>0"))
            check("staff: photo has width/height (CLS), lazy, alt text", await pg.eval_on_selector(".scard img", "i=>i.width>0&&i.loading==='lazy'&&i.alt.length>3"))
            await pg.click('#staffCats [data-c]:nth-child(3)'); check("staff: category filter narrows list", await pg.locator(".scard").count() == 1)
            await pg.click('#staffCats [data-c="all"]'); await pg.click(".scard__b >> nth=0"); await pg.wait_for_timeout(300)
            check("staff: details dialog opens with name, job, category, bio", await pg.locator("#staffDlg[open]").count() == 1 and "أحمد الاختباري" in await pg.inner_text("#sdBody") and "مدير" in await pg.inner_text("#sdBody") and "نبذة قصيرة" in await pg.inner_text("#sdBody"))
            await pg.keyboard.press("Escape"); check("staff: Esc closes dialog", await pg.locator("#staffDlg[open]").count() == 0)
            await pg.click(".scard__b >> nth=1"); await pg.wait_for_timeout(200); check("staff: XSS in name/bio rendered as text only", await pg.evaluate("window.__xss") is None and "<b>x</b>" in await pg.inner_text("#sdBody")); await pg.keyboard.press("Escape")
            gets = " ".join(q for t, q in st.gets); check("public queries always filter status=eq.published", all("status=eq.published" in q for t, q in st.gets if t in st.t), gets[:200])
            await pg.click("#langBtn"); await pg.wait_for_timeout(1200)
            check("FR: LTR + french labels from DB (bilingual fields) + translated section titles", await pg.evaluate("document.documentElement.dir") == "ltr" and "Élèves" in await pg.inner_text("#statsGrid") and "Classe 1" in await pg.inner_text("#clsList") and "Directeur" in await pg.inner_text("#teaGrid") and "chiffres" in await pg.inner_text("#stats"))
            check("no page errors on public page", not pg.errors, pg.errors)
            # الهاتف 320
            pg2 = await new_page(b, st, 320); await pg2.goto(BASE + "/index.html"); await pg2.wait_for_timeout(1500)
            check("mobile 320: no horizontal overflow with stats/classes/staff", await pg2.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1") and not pg2.errors, pg2.errors)
            # الوضع الداكن
            await pg.evaluate("document.documentElement.dataset.theme='dark'"); await pg.wait_for_timeout(200)
            check("dark mode: cards/classes keep readable contrast (text not equal bg)", await pg.eval_on_selector(".scard", "e=>getComputedStyle(e).backgroundColor!==getComputedStyle(e.querySelector('b')).color"))
            # ================= الإدارة =================
            st = Store(); cat = st.add("staff_categories", name="الفئة الأولى", sort_order=1, status="published")
            st.add("school_statistics", kind="students", label="عدد التلاميذ", value=120, official_confirmed=True, status="published")
            st.add("school_classes", level="مستوى أ", name="قسم 1", students_count=30, status="published"); st.add("school_classes", level="مستوى أ", name="قسم 2", students_count=25, status="published")
            pg = await new_page(b, st); await login(pg)
            await pg.click('[data-tab="inst"]'); await pg.wait_for_timeout(900)
            txt = await pg.inner_text("#view")
            check("admin: new section loads; mismatch warning (120 vs 55) shown WITHOUT changing the official value", "اختلاف" in txt and "55" in txt and st.t["school_statistics"][0]["value"] == 120, txt[:200])
            # إحصائية غير مؤكدة لا تُنشر
            await pg.click("[data-add]"); await pg.select_option('dialog.adlg[open] [name=kind]', "classes"); await pg.wait_for_timeout(100)
            check("stats form: choosing kind pre-fills default label", await pg.input_value('dialog.adlg[open] [name=label]') == "عدد الأقسام")
            await pg.fill('dialog.adlg[open] [name=value]', "2"); await pg.select_option('dialog.adlg[open] [name=status]', "published"); await sub(pg)
            check("stats: publishing unconfirmed number blocked with clear message (no row)", len(st.t["school_statistics"]) == 1 and "رسميًا" in await pg.inner_text("dialog.adlg[open] .msg"))
            await pg.check('dialog.adlg[open] [name=official_confirmed]'); await sub(pg)
            check("stats: confirmed + published saved", len(st.t["school_statistics"]) == 2 and st.t["school_statistics"][1]["status"] == "published" and st.t["school_statistics"][1]["official_confirmed"] is True)
            # الأقسام: إضافة/تعديل/أرشفة/استعادة
            await pg.click('#instTabs [data-k="classes"]'); await pg.wait_for_timeout(500); await pg.click("[data-add]")
            await pg.fill('dialog.adlg[open] [name=level]', "مستوى ج"); await pg.fill('dialog.adlg[open] [name=name]', "قسم 9"); await pg.fill('dialog.adlg[open] [name=students_count]', "600"); await sub(pg)
            check("classes: students_count out of range rejected", len(st.t["school_classes"]) == 2)
            await pg.fill('dialog.adlg[open] [name=students_count]', ""); await sub(pg)
            check("classes: created as DRAFT with optional count null", len(st.t["school_classes"]) == 3 and st.t["school_classes"][2]["status"] == "draft" and st.t["school_classes"][2]["students_count"] is None)
            await pg.fill('[data-q]', "قسم 9"); await pg.wait_for_timeout(600); await pg.click('[data-cms="archived"]'); await pg.wait_for_timeout(500)
            check("classes: archive keeps the row", st.t["school_classes"][2]["status"] == "archived")
            await pg.click('[data-cms="draft"]'); await pg.wait_for_timeout(500); check("classes: restore → draft", st.t["school_classes"][2]["status"] == "draft")
            # الأطر
            await pg.click('#instTabs [data-k="staff"]'); await pg.wait_for_timeout(600); await pg.click("[data-add]"); await pg.wait_for_timeout(300)
            await pg.fill('dialog.adlg[open] [name=full_name]', "مؤطرة اختبارية"); await pg.select_option('dialog.adlg[open] [name=category_id]', cat["id"]); await pg.select_option('dialog.adlg[open] [name=status]', "published"); await sub(pg)
            check("staff: publish without consent blocked (no row, no upload)", len(st.t["staff_profiles"]) == 0 and "موافقة" in await pg.inner_text("dialog.adlg[open] .msg") and not [x for x in st.log if x[0] == "UPLOAD"])
            open("/tmp/bad.svg", "w").write("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"); open("/tmp/fake.png", "wb").write(b"not really a png at all....")
            for f, why in (("/tmp/bad.svg", "svg"), ("/tmp/fake.png", "fake-signature")):
                await pg.set_input_files('dialog.adlg[open] [name=photo_path__file]', f); await sub(pg)
                check(f"staff photo: {why} rejected, nothing uploaded", not [x for x in st.log if x[0] == "UPLOAD"] and len(st.t["staff_profiles"]) == 0)
            open("/tmp/huge.png", "wb").write(big_png(1500, 1500)); sz = os.path.getsize("/tmp/huge.png")
            await pg.set_input_files('dialog.adlg[open] [name=photo_path__file]', "/tmp/huge.png"); await pg.wait_for_timeout(600)
            msg = await pg.inner_text("dialog.adlg[open] [data-pinfo]"); empty = await pg.eval_on_selector('dialog.adlg[open] [name=photo_path__file]', "i=>i.files.length===0")
            check(f"staff photo: > 2MB rejected immediately on selection ({sz//1024}KB), input cleared, nothing uploaded", sz > 2 * 1048576 and empty and "2MB" in msg and not [x for x in st.log if x[0] == "UPLOAD"], msg)
            open("/tmp/face.png", "wb").write(face_png()); await pg.set_input_files('dialog.adlg[open] [name=photo_path__file]', "/tmp/face.png"); await pg.wait_for_timeout(900)
            info = await pg.inner_text("dialog.adlg[open] [data-pinfo]"); kb = int(re.search(r"(\d+)KB", info).group(1))
            check("staff photo: preview before saving, compressed to 600×750 WebP ≤180KB", "600×750" in info and kb <= 180 and await pg.eval_on_selector("dialog.adlg[open] [data-photo] img", "i=>!i.hidden&&i.src.startsWith('data:image/webp')"), info)
            await pg.check('dialog.adlg[open] [name=consent_confirmed]'); await sub(pg)
            up = [x for x in st.log if x[0] == "UPLOAD"]; row = st.t["staff_profiles"][0] if st.t["staff_profiles"] else {}
            check("staff photo: uploaded to {id}/profile-{ts}.webp (not the original file name), image/webp, row saved with that path & published", len(up) == 1 and re.fullmatch(rf"{row.get('id')}/profile-\d{{10}}\.webp", up[0][1] or "") and up[0][2] == "image/webp" and up[0][3] <= 180 * 1024 and row.get("photo_path") == up[0][1] and row.get("status") == "published", (up, row))
            old = row["photo_path"]
            # استبدال: الجديدة أولًا ثم الحذف بعد نجاح الحفظ
            st.log.clear(); await pg.fill('[data-q]', "اختبارية"); await pg.wait_for_timeout(600); await pg.click('[data-cms="edit"]'); await pg.wait_for_timeout(500)
            await pg.wait_for_timeout(700); await pg.set_input_files('dialog.adlg[open] [name=photo_path__file]', "/tmp/face.png"); await pg.wait_for_timeout(900); await sub(pg)
            ops = [x[0] for x in st.log]; new = st.t["staff_profiles"][0]["photo_path"]
            check("replace photo: upload new → patch row → delete old (never delete before save)", ops == ["UPLOAD", "PATCH", "REMOVE"] and new != old and st.log[2][1] == old and old not in st.files and new in st.files, st.log)
            # فشل الحفظ بعد الرفع: لا ملفات يتيمة، والصورة القديمة تبقى
            st.log.clear(); st.fail_patch = True; await pg.click('[data-cms="edit"]'); await pg.wait_for_timeout(500); await pg.set_input_files('dialog.adlg[open] [name=photo_path__file]', "/tmp/face.png"); await pg.wait_for_timeout(900); await sub(pg)
            ups = [x[1] for x in st.log if x[0] == "UPLOAD"]
            check("save failure after upload → new file cleaned up (no orphan), old photo kept", len(ups) == 1 and ("REMOVE", ups[0]) in st.log and ups[0] not in st.files and new in st.files and st.t["staff_profiles"][0]["photo_path"] == new, st.log)
            st.fail_patch = False; await pg.click("dialog.adlg[open] [data-x]"); await pg.wait_for_timeout(300)
            # أرشفة لا تحذف الصورة؛ الحذف النهائي منفصل ويحذفها
            await pg.click('[data-cms="archived"]'); await pg.wait_for_timeout(500)
            check("archive keeps record AND photo", st.t["staff_profiles"][0]["status"] == "archived" and new in st.files)
            await pg.click('[data-cms="delete"]'); await pg.wait_for_timeout(300); await pg.click('dialog[open] button[value="yes"]'); await pg.wait_for_timeout(700)
            check("permanent delete needs confirmation, removes row and its photo", len(st.t["staff_profiles"]) == 0 and new not in st.files)
            # زائر (بدون رمز المسؤول) لا يكتب ولا يرى المسودات
            r = await pg.evaluate("""async (u)=>{const x=await fetch(u+'/rest/v1/staff_profiles',{method:'POST',headers:{apikey:'anon-key-public','Content-Type':'application/json'},body:'{"full_name":"x"}'});return x.status}""", SB)
            check("visitor (anon key) cannot write staff profiles", r == 403)
            check("no page errors in admin", not pg.errors, pg.errors)
            await b.close()
    finally: srv.terminate()
    print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
asyncio.run(main())
