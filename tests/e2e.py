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

PK = {"timetable_periods": ("timetable_id", "slot_no"), "timetable_entries": ("timetable_id", "day", "slot_no"), "site_settings": ("key",)}
class MockExt:
    """جداول Supabase العامة في المحاكي + RLS مبسّط + triggers/RPC لاستعمال الزمن + Storage."""
    def init_ext(s):
        s.tables = {n: [] for n in ("timetables", "timetable_periods", "timetable_entries", "teachers", "resources", "gallery_items", "clubs", "achievements", "activities", "site_settings")}
        s.uploads = []; s.counter = 0
    async def storage(s, route, req, u, is_admin, H):
        J = {**H, "content-type": "application/json"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=H)
        if "/object/public/" in u.path: return await route.fulfill(status=200, headers={**H, "content-type": "image/png"}, body=bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d0a4720000000049454e44ae426082"))
        if not is_admin: return await route.fulfill(status=403, headers=J, body='{"message":"new row violates row-level security policy"}')
        if req.method == "POST": s.uploads.append((u.path, req.headers.get("content-type"), len(req.post_data_buffer or b""))); return await route.fulfill(status=200, headers=J, body='{"Key":"media/x"}')
        return await route.fulfill(status=200, headers=J, body="{}")
    def vis(s, t, r, is_admin):
        if is_admin: return True
        if t in ("timetable_periods", "timetable_entries"): return any(x["id"] == r["timetable_id"] and x["status"] == "published" for x in s.tables["timetables"])
        if t == "site_settings": return True
        return r.get("status") == "published"
    def match(s, r, q):
        for k, vs in q.items():
            v = vs[0]
            if k in ("select", "order", "limit", "offset", "on_conflict"): continue
            if k == "or":
                parts = v.strip("()").split(","); hit = False
                for p in parts: f, op, val = p.split(".", 2); hit |= val.strip("*") in str(r.get(f, ""))
                if not hit: return False
            elif v.startswith("eq."):
                if str(r.get(k)) != v[3:]: return False
            elif v.startswith("in."):
                if str(r.get(k)) not in v[4:-1].split(","): return False
            elif v.startswith("ilike."):
                if v[6:].strip("*") not in str(r.get(k, "")): return False
        return True
    def err(s, route, H, code, msg, status=400): return route.fulfill(status=status, headers={**H, "content-type": "application/json"}, body=json.dumps({"code": code, "message": msg}))
    async def generic(s, route, req, t, q, is_admin, H):
        J = {**H, "content-type": "application/json"}; body = json.loads(req.post_data or "null"); now = "2026-10-20T10:00:00Z"
        if t.startswith("rpc/"):
            if not is_admin: return await s.err(route, H, "42501", "غير مصرّح", 403)
            name = t[4:]; tid = body.get("p_id"); tt = next((x for x in s.tables["timetables"] if x["id"] == tid), None)
            if name == "publish_timetable":
                if not tt: return await s.err(route, H, "P0002", "الجدول غير موجود", 404)
                if not any(e["timetable_id"] == tid for e in s.tables["timetable_entries"]): return await s.err(route, H, "23514", "لا يمكن نشر جدول بلا حصص")
                for x in s.tables["timetables"]:
                    if x is not tt and x["status"] == "published" and (x["school_year"], x["level"], x["class_name"]) == (tt["school_year"], tt["level"], tt["class_name"]): x["status"] = "archived"
                tt["status"] = "published"; tt["published_at"] = now; return await route.fulfill(status=200, headers=J, body=json.dumps(tt))
            if name == "timetable_conflicts":
                P = {(p["timetable_id"], p["slot_no"]): p for p in s.tables["timetable_periods"]}; out = []
                for e in [e for e in s.tables["timetable_entries"] if e["timetable_id"] == tid]:
                    me = P[(tid, e["slot_no"])]
                    for o in s.tables["timetable_entries"]:
                        ot = next(x for x in s.tables["timetables"] if x["id"] == o["timetable_id"])
                        if o["timetable_id"] == tid or ot["status"] == "archived" or o["day"] != e["day"] or ot["school_year"] != tt["school_year"]: continue
                        op = P[(o["timetable_id"], o["slot_no"])]
                        if not (op["starts_at"] < me["ends_at"] and me["starts_at"] < op["ends_at"]): continue
                        for kind, f in (("teacher", "teacher_name"), ("room", "room")):
                            if e.get(f) and o.get(f) and e[f].strip().lower() == o[f].strip().lower(): out.append({"kind": kind, "c_day": e["day"], "c_slot": e["slot_no"], "c_level": ot["level"], "c_class": ot["class_name"], "c_value": e[f]})
                return await route.fulfill(status=200, headers=J, body=json.dumps(out))
        rows = s.tables[t]
        if req.method == "GET":
            r = [x for x in rows if s.vis(t, x, is_admin) and s.match(x, q)]
            if "count=exact" in req.headers.get("prefer", ""): return await route.fulfill(status=206, headers={**J, "content-range": f"0-0/{len(r)}"}, body="[]")
            lim = int(q.get("limit", ["1000"])[0]); off = int(q.get("offset", ["0"])[0]); return await route.fulfill(status=200, headers=J, body=json.dumps(r[off:off + lim]))
        if not is_admin: return await s.err(route, H, "42501", "new row violates row-level security policy", 403) if req.method == "POST" else await route.fulfill(status=200, headers=J, body="[]")
        pk = PK.get(t)
        def check(r):
            if t == "timetable_periods":
                if r["ends_at"] <= r["starts_at"]: return "period_time_order"
                for o in rows:
                    if o is not r and o["timetable_id"] == r["timetable_id"] and o["slot_no"] != r["slot_no"] and o["starts_at"] < r["ends_at"] and r["starts_at"] < o["ends_at"]: return "الحصص متداخلة زمنيًا"
            if t == "timetable_entries":
                per = next((p for p in s.tables["timetable_periods"] if p["timetable_id"] == r["timetable_id"] and p["slot_no"] == r["slot_no"]), None)
                tt = next((x for x in s.tables["timetables"] if x["id"] == r["timetable_id"]), None)
                if not per: return "fk"
                if per["is_break"]: return "لا يمكن وضع مادة في فترة استراحة"
                if r["day"] not in tt["days"]: return "اليوم غير ضمن أيام الدراسة لهذا الجدول"
            if t == "resources" and r.get("status") == "published" and not r.get("file_url"): return "resources_published_has_file"
            if t == "site_settings" and r["key"] == "email" and "@" not in r["value"]: return "بريد إلكتروني غير صالح"
            return None
        if req.method == "POST":
            items = body if isinstance(body, list) else [body]; out = []; merge = "merge-duplicates" in req.headers.get("prefer", "")
            for it in items:
                r = {"id": f"{t}-{s.counter}", "status": "draft", "created_at": now, "updated_at": now, **it}; s.counter += 1
                if t == "timetables": r.setdefault("days", [1, 2, 3, 4, 5, 6]); r["status"] = r.get("status", "draft")
                ex = next((o for o in rows if pk and all(o.get(k) == r.get(k) for k in pk)), None)
                if ex and not merge: return await s.err(route, H, "23505", "duplicate key value violates unique constraint", 409)
                if ex: r = {**ex, **it}
                m = check(r)
                if m: return await s.err(route, H, "23514", m)
                if ex: ex.update(r); out.append(ex)
                else: rows.append(r); out.append(r)
            return await route.fulfill(status=201, headers=J, body=json.dumps(out))
        hit = [x for x in rows if s.match(x, q)]
        if req.method == "PATCH":
            for x in hit:
                n = {**x, **body, "updated_at": now}; m = check(n)
                if m: return await s.err(route, H, "23514", m)
                x.update(n)
            return await route.fulfill(status=200, headers=J, body=json.dumps(hit))
        if req.method == "DELETE":
            for x in hit:
                rows.remove(x)
                if t == "timetables": s.tables["timetable_periods"][:] = [p for p in s.tables["timetable_periods"] if p["timetable_id"] != x["id"]]; s.tables["timetable_entries"][:] = [e for e in s.tables["timetable_entries"] if e["timetable_id"] != x["id"]]
                if t == "timetable_periods": s.tables["timetable_entries"][:] = [e for e in s.tables["timetable_entries"] if not (e["timetable_id"] == x["timetable_id"] and e["slot_no"] == x["slot_no"])]
            return await route.fulfill(status=200, headers=J, body=json.dumps(hit))

class Mock(MockExt):
    def __init__(s, fail=False):
        s.init_ext(); s.fail = fail; s.log = []; s.bodies = []; s.expire = False; s.delay = 0
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
            if s.delay: await asyncio.sleep(s.delay)
            b = json.loads(req.post_data or "{}")
            users = {"admin@x.com": ("good", "u-admin"), "user@x.com": ("good2", "u-user")}
            if b.get("email") in users and users[b["email"]][0] == b.get("password"): return await ok({"access_token": "tok-" + users[b["email"]][1], "refresh_token": "r", "expires_in": 3600, "user": {"id": users[b["email"]][1], "email": b["email"]}})
            return await ok({"error": "invalid"}, 400)
        if u.path.endswith("/auth/v1/logout"): return await ok({}, 204)
        if "/storage/v1/" in u.path: return await s.storage(route, req, u, is_admin, H)
        t = u.path.split("/rest/v1/")[-1]
        if t in s.tables or t.startswith("rpc/"): return await s.generic(route, req, t, q, is_admin, H)
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
            BAD = ["تجريبي", "اسم الأستاذ", "TODO", "قاعة", "حصص الاثنين", "حصص الثلاثاء", "حصص الأربعاء", "حصص الخميس", "حصص الجمعة", "حصص السبت", "الوحدة 1"]
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
            # 1c) الهوية والـ Hero والخدمات والوضع الداكن (بدون بيانات)
            pg = await page_with(b, None, cfg=cfgless); await pg.goto(BASE + "/"); await pg.wait_for_timeout(900)
            check("hero: approved headline + description", await pg.inner_text("#top h1") == "الثانوية التأهيلية الرازي" and "تارجيست" in await pg.inner_text("#top .hero__tag"))
            check("hero: primary 'اكتشف مؤسستنا' → #about, secondary 'اتصل بنا' → #contact", await pg.get_attribute("#top .btn--accent", "href") == "#about" and await pg.inner_text("#top .btn--ghost") == "اتصل بنا" and await pg.get_attribute("#top .btn--ghost", "href") == "#contact")
            check("hero image is eager (not lazy) with explicit dimensions", await pg.evaluate("(()=>{const i=document.querySelector('.hero__media img');return i && i.getAttribute('loading')===null && i.fetchPriority==='high' && i.width>0})()"))
            check("services (no data): only news/contact link cards are active; others 'قريبًا' & not links", await pg.locator("#svcGrid a.sv").count() == 1 and await pg.locator("#svcGrid .sv--off[aria-disabled=true]").count() == 5)
            check("today section + stats hidden when there is no real data", await pg.evaluate("document.getElementById('today').hidden && document.getElementById('stats').hidden"))
            check("no emoji anywhere in the page text", not await pg.evaluate("/\\p{Emoji_Presentation}/u.test(document.body.innerText)"))
            check("html lang=ar dir=rtl", await pg.evaluate("document.documentElement.lang==='ar' && document.documentElement.dir==='rtl'"))
            reqs = []; pgx = await page_with(b, None, cfg=cfgless); pgx.on("request", lambda r: reqs.append(r.url)); await pgx.goto(BASE + "/"); await pgx.wait_for_timeout(800)
            check("no third-party requests at all (fonts/CDN) on the home page", not [u for u in reqs if not u.startswith(BASE) and not u.startswith("data:")], str([u for u in reqs if not u.startswith(BASE)][:3]))
            for scheme in ("dark", "light"):
                cx = await b.new_context(color_scheme=scheme, viewport={"width": 390, "height": 800}); px = await cx.new_page(); await cx.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=cfgless)); await px.goto(BASE + "/")
                check(f"first visit follows OS preference ({scheme}) with matching background (no white flash)", await px.evaluate("document.documentElement.dataset.theme") == scheme and await px.evaluate("getComputedStyle(document.body).backgroundColor") == ("rgb(12, 22, 36)" if scheme == "dark" else "rgb(245, 248, 252)"))
            await px.click("#themeBtn"); await px.reload(); await px.wait_for_timeout(300)
            check("theme choice persists after reload", await px.evaluate("document.documentElement.dataset.theme") == "dark")
            for u, h1 in (("/about.html", "عن المؤسسة"), ("/privacy.html", "سياسة الخصوصية")):
                pgp = await page_with(b, None, w=320); r = await pgp.goto(BASE + u); await pgp.wait_for_timeout(500)
                check(f"{u}: loads, h1 ok, nav+footer rendered, no overflow at 320px, no errors", r.status == 200 and await pgp.inner_text("h1") == h1 and await pgp.locator("#footNav a").count() == 9 and await pgp.evaluate("document.documentElement.scrollWidth") <= 320 and not pgp.errors, str(pgp.errors))
            check("robots.txt blocks /admin/ (served)", "Disallow: /admin/" in (await (await pgx.request.get(BASE + "/robots.txt")).text()))
            # 1d) نظام التفاعل: حالات الأزرار، أهداف اللمس، الوضع الليلي، الميل ثلاثي الأبعاد
            TAP = """(sel)=>[...document.querySelectorAll(sel)].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&!e.closest('.skip')&&r.top>-1}).map(e=>{const r=e.getBoundingClientRect();return (e.className||e.tagName)+':'+Math.round(r.width)+'x'+Math.round(r.height)}).filter(x=>{const [w,h]=x.split(':')[1].split('x').map(Number);return w<44||h<44})"""
            cxm = await b.new_context(viewport={"width": 390, "height": 800}); pm = await cxm.new_page(); await cxm.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=cfgless)); await pm.goto(BASE + "/"); await pm.wait_for_timeout(700)
            small = await pm.evaluate(TAP, ".btn, .btn-icon, .chip, input, select, .bottom a, .bottom button, a.sv")
            check("touch targets ≥ 44px on mobile (buttons, chips, inputs, nav, service cards)", not small, str(small[:5]))
            pd = await page_with(b, None, w=1440, cfg=cfgless); await pd.goto(BASE + "/"); await pd.wait_for_timeout(900)
            btn = pd.locator("#top .btn--accent"); await btn.scroll_into_view_if_needed()
            st0 = await btn.evaluate("e=>[getComputedStyle(e).transform,getComputedStyle(e).boxShadow,getComputedStyle(e).backgroundColor]")
            await btn.hover(); await pd.wait_for_timeout(450); st1 = await btn.evaluate("e=>[getComputedStyle(e).transform,getComputedStyle(e).boxShadow,getComputedStyle(e).backgroundColor]")
            check("button hover: lifts, shadow and colour change", st1[0] != st0[0] and st1[1] != st0[1] and st1[2] != st0[2], f"{st0} -> {st1}")
            await pd.mouse.down(); await pd.wait_for_timeout(300); act = await btn.evaluate("e=>getComputedStyle(e).transform"); await pd.mouse.up()
            m = re.match(r"matrix\(([-\d.]+),", act or ""); check("button active/pressed: scales down", bool(m) and float(m.group(1)) < 1, str(act))
            await pd.mouse.move(5, 5); await pd.evaluate("document.activeElement.blur()")
            for _ in range(40):
                await pd.keyboard.press("Tab")
                if await pd.evaluate("document.activeElement.classList.contains('btn--accent')"): break
            fo = await btn.evaluate("e=>[getComputedStyle(e).outlineStyle,getComputedStyle(e).outlineWidth]"); check("button keyboard focus: visible 3px outline", fo[0] != "none" and fo[1] == "3px", str(fo))
            await btn.evaluate("e=>e.setAttribute('aria-disabled','true')"); dis = await btn.evaluate("e=>[getComputedStyle(e).opacity,getComputedStyle(e).cursor]"); check("button disabled: dimmed + not-allowed cursor", dis[0] == "0.5" and dis[1] == "not-allowed", str(dis))
            await btn.evaluate("e=>{e.removeAttribute('aria-disabled');e.classList.add('is-loading')}"); ld = await btn.evaluate("e=>[getComputedStyle(e,'::after').content,getComputedStyle(e,'::after').animationName]"); check("button loading: spinner pseudo-element animates", ld[0] != "none" and "spin" in ld[1], str(ld)); await btn.evaluate("e=>e.classList.remove('is-loading')")
            await pd.click("#themeBtn"); await pd.wait_for_timeout(200)
            ic = await pd.evaluate("[document.getElementById('themeBtn').getAttribute('aria-pressed'), getComputedStyle(document.querySelector('#themeBtn .i-sun')).display, getComputedStyle(document.querySelector('#themeBtn .i-moon')).display]")
            check("theme toggle: aria-pressed + sun/moon icon swap", ic == ["true", "block", "none"], str(ic))
            sv = pd.locator("a.sv").first; await sv.scroll_into_view_if_needed(); await pd.wait_for_timeout(900); bb = await sv.bounding_box(); await pd.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pd.mouse.move(bb["x"] + 10, bb["y"] + 10, steps=4); await pd.wait_for_timeout(250)
            check("3D tilt on service cards follows the pointer", (await sv.evaluate("e=>e.style.getPropertyValue('--ry')")) != "")
            cxr = await b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); pr = await cxr.new_page(); await cxr.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=cfgless)); await pr.goto(BASE + "/"); await pr.wait_for_timeout(500)
            svr = pr.locator("a.sv").first; await svr.scroll_into_view_if_needed(); await pr.wait_for_timeout(900); bb = await svr.bounding_box(); await pr.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pr.mouse.move(bb["x"] + 10, bb["y"] + 10, steps=4); await pr.wait_for_timeout(250)
            check("reduced motion: no tilt and hero content visible immediately", (await svr.evaluate("e=>e.style.getPropertyValue('--ry')")) == "" and await pr.evaluate("getComputedStyle(document.querySelector('.hero__in h1')).opacity") == "1")
            # 2) موقع عام + Supabase: منشور فقط + تعقيم XSS
            m = Mock(); pg = await page_with(b, m); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1200)
            html = await pg.inner_html("#news")
            check("public: published news shown", "عنوان منشور" in html)
            check("public: draft/demo content NOT shown", "مسودة سرية" not in html and "تجريبي" not in html and "إعلان مسودة" not in html)
            check("public: XSS title escaped (no injected <img onerror>, flag unset)", await pg.locator("#news img[onerror]").count() == 0 and await pg.evaluate("window.__xss") is None)
            check("public: announcements shown (published only)", "إعلان منشور" in html)
            check("live: today section shows only real cards (announcement+news), no schedule card", await pg.locator("#todayGrid .tc").count() == 2 and await pg.locator("#today[hidden]").count() == 0)
            check("live: news service is an active link; schedule is not", await pg.locator("#svcGrid a.sv[href='#news']").count() == 1 and await pg.locator("#svcGrid .sv--off:has-text('استعمال الزمن')").count() == 1)
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
            check("failure: gallery shows error+retry (not broken), contact still renders", await pg.locator("#galGrid [data-retry-gal]").count() == 1 and await pg.locator("#mapBtn").count() == 1 and not pg.errors, str(pg.errors))
            # 4) الإدارة
            m = Mock(); pg = await page_with(b, m, csp=True); await pg.goto(BASE + "/admin/"); await pg.wait_for_timeout(800)
            check("admin: unauthenticated sees login only", await pg.locator("#login:not([hidden])").count() == 1 and await pg.locator("#app:not([hidden])").count() == 0)
            await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "bad"); await pg.click("#loginBtn"); await pg.wait_for_timeout(500)
            msg = await pg.inner_text("#loginMsg"); check("admin: wrong password → generic Arabic message", "غير صحيحة" in msg and "admin" not in msg)
            await pg.fill("#email", "user@x.com"); await pg.fill("#password", "good2"); await pg.click("#loginBtn"); await pg.wait_for_timeout(600)
            check("admin: non-admin account rejected, no app shown", "غير مخوّل" in await pg.inner_text("#loginMsg") and await pg.locator("#app:not([hidden])").count() == 0)
            m.delay = 0.7; await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(250)
            lst = await pg.evaluate("(()=>{const b=document.getElementById('loginBtn');return [b.classList.contains('is-loading'),b.disabled,b.getAttribute('aria-busy')]})()")
            check("admin login button shows loading state (spinner, disabled, aria-busy)", lst == [True, True, "true"], str(lst))
            await pg.wait_for_timeout(900); m.delay = 0
            check("admin: login OK → dashboard counts (1 pub news, 1 draft news)", await pg.locator(".stat b").all_inner_texts() == ["1", "1", "1", "1"], str(await pg.locator(".stat b").all_inner_texts()))
            check("session stored in sessionStorage, NOT localStorage", await pg.evaluate("!!sessionStorage.getItem('razi_admin_session') && !localStorage.getItem('razi_admin_session')"))
            await pg.click('[data-tab="news"]'); await pg.wait_for_timeout(500)
            check("admin: lists draft + published news", await pg.locator(".arow").count() == 2)
            await pg.click("#addBtn"); await pg.click("#saveBtn"); await pg.wait_for_timeout(200)
            check("admin: validation blocks empty title", "العنوان مطلوب" in await pg.inner_text("#formMsg"))
            await pg.fill("#f_title", "خبر جديد"); await pg.fill("#f_content", "نص"); await pg.click("#saveBtn"); await pg.wait_for_timeout(700)
            post = [x for x in m.log if x[0] == "POST" and x[1].endswith("/news")]
            check("admin: success toast with icon (role=status)", await pg.locator("#toasts .ok[role=status] svg").count() >= 1)
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
            cxa = await b.new_context(viewport={"width": 390, "height": 800}); pa = await cxa.new_page(); await cxa.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=CFG)); await cxa.route(SB + "/**", Mock().handle)
            await pa.goto(BASE + "/admin/"); await pa.fill("#email", "admin@x.com"); await pa.fill("#password", "good"); await pa.click("#loginBtn"); await pa.wait_for_timeout(700); await pa.click('[data-tab="news"]'); await pa.wait_for_timeout(500)
            sm = await pa.evaluate(TAP, ".btn, .arow__a button, .adm__tabs button, input, select"); check("admin touch targets ≥ 44px on mobile", not sm, str(sm[:5]))
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
if __name__ == "__main__":
    asyncio.run(main())
