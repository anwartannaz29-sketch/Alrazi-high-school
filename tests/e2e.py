"""tests/e2e.py — اختبارات واجهة آلية بخادم Supabase وهمي (Mock) داخل المتصفح.
تختبر منطق الواجهة (التعقيم، معالجة الأخطاء، تدفق الإدارة). لا تختبر RLS الحقيقية:
تلك تُفحَص في Supabase عبر supabase/tests/rls_checks.sql.
تشغيل:  python tests/e2e.py   (يتطلب playwright + chromium)"""
import asyncio, json, re, subprocess, sys, time, os, urllib.parse
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8766; BASE = f"http://localhost:{PORT}"
SB = "https://test.supabase.co"; ANON = "anon-key-public"
CFG = f'window.RAZI_CONFIG={{SUPABASE_URL:"{SB}",SUPABASE_ANON_KEY:"{ANON}"}};'
results = []
def check(name, ok, extra=""): results.append((ok, name, extra)); print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))

class Mock:
    def __init__(s, fail=False):
        s.fail = fail; s.log = []; s.bodies = []; s.expire = False
        s.news = [dict(id="n-pub", title='<img src=x onerror="window.__xss=1">عنوان منشور', excerpt="<b>x</b>", content="فقرة1\n\nفقرة2", image_url=None, category="خبر", featured=True, status="published", published_at="2026-10-01T10:00:00Z", created_at="2026-10-01T10:00:00Z", updated_at="2026-10-01T10:00:00Z", slug=None),
                  dict(id="n-draft", title="مسودة سرية", excerpt="", content="", image_url=None, category=None, featured=False, status="draft", published_at=None, created_at="2026-10-02T10:00:00Z", updated_at="2026-10-02T10:00:00Z", slug=None)]
        s.ann = [dict(id="a1", title="إعلان منشور", content="نص", type="تنبيه", pinned=True, status="published", start_at=None, end_at=None, created_at="2026-10-01T10:00:00Z", updated_at="2026-10-01T10:00:00Z"),
                 dict(id="a2", title="إعلان مسودة", content="", type="إداري", pinned=False, status="draft", start_at=None, end_at=None, created_at="2026-10-01T10:00:00Z", updated_at="2026-10-01T10:00:00Z")]
    async def handle(s, route):
        req = route.request; H = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=H)
        if s.fail and "/rest/" in req.url: return await route.abort()
        u = urllib.parse.urlparse(req.url); q = urllib.parse.parse_qs(u.query); tok = req.headers.get("authorization", "").replace("Bearer ", "")
        is_admin = tok == "tok-u-admin"
        if s.expire and is_admin and "/rest/" in req.url and "admin_users" not in req.url: return await route.fulfill(status=401, headers={**H, "content-type": "application/json"}, body='{"message":"JWT expired"}')
        s.log.append((req.method, u.path, u.query, tok))
        def ok(body, status=200, extra=None): return route.fulfill(status=status, headers={**H, "content-type": "application/json", **(extra or {})}, body=json.dumps(body))
        if u.path.endswith("/auth/v1/token"):
            b = json.loads(req.post_data or "{}")
            users = {"admin@x.com": ("good", "u-admin"), "user@x.com": ("good2", "u-user")}
            if b.get("email") in users and users[b["email"]][0] == b.get("password"): return await ok({"access_token": "tok-" + users[b["email"]][1], "refresh_token": "r", "expires_in": 3600, "user": {"id": users[b["email"]][1], "email": b["email"]}})
            return await ok({"error": "invalid"}, 400)
        if u.path.endswith("/auth/v1/logout"): return await ok({}, 204)
        t = u.path.split("/rest/v1/")[-1]
        if t == "admin_users": return await ok([{"user_id": "u-admin"}] if is_admin and q.get("user_id") == ["eq.u-admin"] else [])
        tbl = s.news if t == "news" else s.ann
        if req.method == "GET":
            rows = [r for r in tbl if is_admin or r["status"] == "published"]            # محاكاة RLS
            if "status" in q: rows = [r for r in rows if r["status"] == q["status"][0].replace("eq.", "")]
            if "count=exact" in req.headers.get("prefer", ""): return await ok([], 206, {"content-range": f"0-0/{len(rows)}"})
            if "id" in q: rows = [r for r in rows if r["id"] == q["id"][0].replace("eq.", "")]
            lim = int(q.get("limit", ["1000"])[0]); off = int(q.get("offset", ["0"])[0]); return await ok(rows[off:off + lim])
        if not is_admin: return await ok({"message": "rls"}, 403)
        body = json.loads(req.post_data or "{}"); s.bodies.append((req.method, t, body))
        if req.method == "POST": r = dict(id="new-%d" % len(tbl), created_at="2026-10-09T10:00:00Z", updated_at="2026-10-09T10:00:00Z", published_at=None, **body); tbl.append(r); return await ok([r], 201)
        rid = q["id"][0].replace("eq.", "")
        if req.method == "PATCH":
            for r in tbl:
                if r["id"] == rid: r.update(body)
            return await ok([r for r in tbl if r["id"] == rid])
        if req.method == "DELETE": tbl[:] = [r for r in tbl if r["id"] != rid]; return await ok({}, 204)

CSP = next(h['value'] for hh in json.load(open(os.path.join(ROOT, 'vercel.json')))['headers'] if hh['source'].startswith('/admin') for h in hh['headers'] if h['key'] == 'Content-Security-Policy')
DEMOCFG = 'window.RAZI_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",DEMO:true};'
async def page_with(b, mock, w=1280, cfg=True, demo=False, csp=False):
    ctx = await b.new_context(viewport={"width": w, "height": 900}); pg = await ctx.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    await ctx.route("**/fonts.*/**", lambda r: r.abort())
    if csp:
        pg.csp = []
        pg.on("console", lambda m: pg.csp.append(m.text) if "Content Security Policy" in m.text else None)
        async def addcsp(route):
            resp = await route.fetch(); await route.fulfill(response=resp, headers={**resp.headers, "content-security-policy": CSP})
        await ctx.route("**/admin/", addcsp)
    if cfg: await ctx.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=DEMOCFG if demo else (CFG if cfg is True else cfg)))
    if mock: await ctx.route(SB + "/**", mock.handle)
    return pg

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            BAD = ["تجريبي", "اسم الأستاذ", "TODO", "قاعة", "حصص ", "الوحدة 1"]
            # 1) بدون Supabase وبدون وضع تجريبي (= إنتاج بلا إعدادات): لا بيانات وهمية إطلاقًا
            cfgless = 'window.RAZI_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",DEMO:false};'
            pg = await page_with(b, None, cfg=cfgless); await pg.goto(BASE + "/"); await pg.wait_for_timeout(900)
            txt = await pg.inner_text("main")
            check("no-demo mode: NO demo strings anywhere in the page", not [x for x in BAD if x in txt], str([x for x in BAD if x in txt]))
            check("no-demo mode: news/announcements/teachers/schedule/resources show empty states", await pg.locator("#topNews .empty").count() == 1 and await pg.locator("#annList .empty").count() == 1 and await pg.locator("#teaGrid .empty").count() == 1 and await pg.locator("#schedule .empty").count() == 1 and await pg.locator("#resources .empty").count() == 1 and await pg.locator("#actGrid .empty").count() == 1 and await pg.locator("#clubs .empty").count() == 1, "")
            check("no-demo mode: real gallery photos + confirmed facilities remain", await pg.locator("#galGrid .mi").count() == 4 and await pg.locator("#facGrid .card--fac").count() == 2)
            check("no-demo mode: no page errors", not pg.errors, str(pg.errors))
            # 1b) وضع تجريبي محلي صريح: شريط تنبيه + بيانات موسومة
            pg = await page_with(b, None, demo=True); await pg.goto(BASE + "/"); await pg.wait_for_timeout(900)
            check("explicit local demo: red banner + demo data visible & labelled", await pg.locator(".demo-bar").count() == 1 and await pg.locator("#topNews .tag--demo").count() > 0 and await pg.locator("#schList .ss").count() > 0)
            # 2) موقع عام + Supabase: منشور فقط + تعقيم XSS
            m = Mock(); pg = await page_with(b, m); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1200)
            html = await pg.inner_html("#news")
            check("public: published news shown", "عنوان منشور" in html)
            check("public: draft/demo content NOT shown", "مسودة سرية" not in html and "تجريبي" not in html and "إعلان مسودة" not in html)
            check("public: XSS title escaped (no injected <img onerror>, flag unset)", await pg.locator("#news img[onerror]").count() == 0 and await pg.evaluate("window.__xss") is None)
            check("public: announcements shown (published only)", "إعلان منشور" in html)
            mtxt = await pg.inner_text("main"); check("live mode: NO demo strings anywhere in the page", not [x for x in BAD if x in mtxt], str([x for x in BAD if x in mtxt]))
            check("public: announcements query orders by pinned then created_at (no nullslast cut)", any("order=pinned.desc,created_at.desc" in qy for (_, pth, qy, _) in m.log if pth.endswith("/announcements")))
            await pg.evaluate("navigator.share = d => { window.__shared = d; return Promise.resolve(); }"); await pg.click("[data-share]"); await pg.wait_for_timeout(200)
            check("share: URL points to the specific article (#news/<id>)", (await pg.evaluate("window.__shared && window.__shared.url") or "").endswith("#news/n-pub"))
            check("public: list queries filter status=eq.published", all("status=eq.published" in qy for (mt, pth, qy, t) in m.log if pth.endswith(("/news", "/announcements")) and "id=eq" not in qy))
            await pg.click("#topNews .nm h3 a"); await pg.wait_for_timeout(500)
            check("article dialog opens with paragraphs via textContent", await pg.locator("#articleBody .art__p").count() == 2 and await pg.locator("#article[open]").count() == 1)
            # 3) فشل الاتصال لا يكسر الموقع
            pg = await page_with(b, Mock(fail=True)); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1500)
            check("failure: error message + retry shown for news", await pg.locator("#topNews [data-retry]").count() == 1)
            check("failure: other sections still render (gallery, contact)", await pg.locator("#galGrid .mi").count() > 0 and await pg.locator("#mapBtn").count() == 1 and not pg.errors, str(pg.errors))
            # 4) الإدارة
            m = Mock(); pg = await page_with(b, m, csp=True); await pg.goto(BASE + "/admin/"); await pg.wait_for_timeout(800)
            check("admin: unauthenticated sees login only", await pg.locator("#login:not([hidden])").count() == 1 and await pg.locator("#app:not([hidden])").count() == 0)
            await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "bad"); await pg.click("#loginBtn"); await pg.wait_for_timeout(500)
            msg = await pg.inner_text("#loginMsg"); check("admin: wrong password → generic Arabic message", "غير صحيحة" in msg and "admin" not in msg)
            await pg.fill("#email", "user@x.com"); await pg.fill("#password", "good2"); await pg.click("#loginBtn"); await pg.wait_for_timeout(600)
            check("admin: non-admin account rejected, no app shown", "غير مخوّل" in await pg.inner_text("#loginMsg") and await pg.locator("#app:not([hidden])").count() == 0)
            await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(800)
            check("admin: login OK → dashboard counts (1 pub news, 1 draft news)", await pg.locator(".stat b").all_inner_texts() == ["1", "1", "1", "1"], str(await pg.locator(".stat b").all_inner_texts()))
            check("session stored in sessionStorage, NOT localStorage", await pg.evaluate("!!sessionStorage.getItem('razi_admin_session') && !localStorage.getItem('razi_admin_session')"))
            await pg.click('[data-tab="news"]'); await pg.wait_for_timeout(500)
            check("admin: lists draft + published news", await pg.locator(".arow").count() == 2)
            await pg.click("#addBtn"); await pg.click("#saveBtn"); await pg.wait_for_timeout(200)
            check("admin: validation blocks empty title", "العنوان مطلوب" in await pg.inner_text("#formMsg"))
            await pg.fill("#f_title", "خبر جديد"); await pg.fill("#f_content", "نص"); await pg.click("#saveBtn"); await pg.wait_for_timeout(700)
            post = [x for x in m.log if x[0] == "POST" and x[1].endswith("/news")]
            check("admin: create news as draft (status=draft, admin token)", len(post) == 1 and m.news[-1]["status"] == "draft" and post[0][3] == "tok-u-admin")
            await pg.locator('.arow:has-text("خبر جديد") [data-act="publish"]').click(); await pg.wait_for_timeout(600)
            check("admin: publish via PATCH", m.news[-1]["status"] == "published")
            await pg.locator('.arow:has-text("خبر جديد") [data-act="unpublish"]').click(); await pg.wait_for_timeout(400); await pg.locator('.arow:has-text("خبر جديد") [data-act="publish"]').click(); await pg.wait_for_timeout(500)
            pb = [b_ for (mt, t_, b_) in m.bodies if mt == "PATCH" and t_ == "news" and b_.get("status") == "published"]
            check("republish sends a fresh published_at", len(pb) >= 2 and all("published_at" in x for x in pb), str(pb))
            await pg.locator('.arow:has-text("خبر جديد") [data-act="delete"]').click(); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
            check("admin: Esc on delete-confirm does NOT delete", len(m.news) == 3)
            await pg.locator('.arow:has-text("خبر جديد") [data-act="delete"]').click(); await pg.click('#confirmDlg button[value="yes"]'); await pg.wait_for_timeout(600)
            check("admin: delete after confirm", len(m.news) == 2)
            await pg.click('[data-tab="announcements"]'); await pg.wait_for_timeout(400)
            await pg.locator('.arow:has-text("إعلان منشور") [data-act="unpublish"]').click(); await pg.wait_for_timeout(500)
            check("admin: unpublish announcement", m.ann[0]["status"] == "draft")
            await pg.click("#addBtn"); await pg.fill("#f_title", "x"); await pg.fill("#f_start", "2026-10-10T10:00"); await pg.fill("#f_end", "2026-10-09T10:00"); await pg.click("#saveBtn")
            check("admin: end before start rejected", "بعد البداية" in await pg.inner_text("#formMsg"))
            check("admin: no page errors", not pg.errors, str(pg.errors))
            check("admin: works under the production CSP (no violations)", not pg.csp, str(pg.csp))
            # https فقط للصور
            await pg.click("#cancelBtn"); await pg.click('[data-tab="news"]'); await pg.click("#addBtn"); await pg.fill("#f_title", "t"); await pg.fill("#f_image", "http://x.com/a.jpg"); await pg.click("#saveBtn")
            check("admin: http:// image URL rejected (https only)", "https://" in await pg.inner_text("#formMsg")); await pg.click("#cancelBtn")
            # انتهاء الجلسة أثناء التحرير: لا يضيع النص
            await pg.click("#addBtn"); await pg.fill("#f_title", "عنوان لا يجب أن يضيع"); await pg.fill("#f_content", "نص طويل غير محفوظ"); m.expire = True; await pg.click("#saveBtn"); await pg.wait_for_timeout(600)
            check("session expiry mid-edit → login shown with clear message, dialog closed", await pg.locator("#login:not([hidden])").count() == 1 and "انتهت الجلسة" in await pg.inner_text("#loginMsg") and not await pg.evaluate("document.getElementById('formDlg').open"))
            m.expire = False; await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(700)
            await pg.click("#addBtn"); await pg.wait_for_timeout(200)
            check("unsaved text restored after re-login", await pg.input_value("#f_title") == "عنوان لا يجب أن يضيع" and await pg.input_value("#f_content") == "نص طويل غير محفوظ")
            await pg.click("#cancelBtn")
            # صفحات: /admin و /admin/
            for u in ("/admin", "/admin/"):
                pg2 = await page_with(b, Mock()); r = await pg2.goto(BASE + u); await pg2.wait_for_timeout(500)
                check(f"{u} loads the login page", r.status == 200 and await pg2.locator("#login:not([hidden])").count() == 1)
            # تحميل المزيد
            m2 = Mock(); m2.news += [dict(id=f"x{i}", title=f"خبر {i}", excerpt="", content="", image_url=None, category=None, featured=False, status="draft", published_at=None, created_at="2026-09-01T10:00:00Z", updated_at="2026-09-01T10:00:00Z", slug=None) for i in range(60)]
            pg3 = await page_with(b, m2); await pg3.goto(BASE + "/admin/"); await pg3.fill("#email", "admin@x.com"); await pg3.fill("#password", "good"); await pg3.click("#loginBtn"); await pg3.wait_for_timeout(700); await pg3.click('[data-tab="news"]'); await pg3.wait_for_timeout(600)
            n1 = await pg3.locator(".arow").count(); has = await pg3.locator("#moreBtn").count(); await pg3.click("#moreBtn"); await pg3.wait_for_timeout(600)
            check("admin pagination: 50 first + 'load more' shows the rest (62)", n1 == 50 and has == 1 and await pg3.locator(".arow").count() == 62 and await pg3.locator("#moreBtn").count() == 0, f"{n1}/{await pg3.locator('.arow').count()}")
            # 5) هاتف: لا تمرير أفقي
            for url in ("/", "/admin/"):
                pg = await page_with(b, Mock(), w=320); await pg.goto(BASE + url); await pg.wait_for_timeout(800)
                sw = await pg.evaluate("document.documentElement.scrollWidth"); check(f"mobile 320px no horizontal overflow {url}", sw <= 320, str(sw))
            await b.close()
    finally: srv.terminate()
    # 6) فحص الأسرار + حارس البناء
    leaks = subprocess.run("grep -rIlE 'service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\\.' --exclude-dir=docs --exclude-dir=tests --exclude-dir=scripts --exclude-dir=supabase --exclude=*.md --exclude=.env.example .", shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
    check("no secrets/JWTs in public files", leaks == "", leaks)
    import base64; jwt = "x." + base64.urlsafe_b64encode(b'{"role":"service_role"}').decode().rstrip("=") + ".y"
    r = subprocess.run(["node", "scripts/build-config.js"], cwd=ROOT, env={**os.environ, "SUPABASE_URL": "https://abc.supabase.co", "SUPABASE_ANON_KEY": jwt}, capture_output=True, text=True)
    check("build-config rejects service_role key", r.returncode == 1)
    subprocess.run("git checkout js/config.js 2>/dev/null; true", shell=True, cwd=ROOT)
    bad = [n for ok, n, _ in results if not ok]; print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
