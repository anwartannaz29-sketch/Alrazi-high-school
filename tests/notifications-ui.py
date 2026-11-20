"""tests/notifications-ui.py — مركز الإشعارات + Scroll Reveal + إدارة الإشعارات (متصفح آلي؛ Supabase وهمي؛ لا شبكة حقيقية).
تشغيل: python tests/notifications-ui.py   (لا يثبت RLS الحقيقية — راجع supabase/tests/rls_checks_notifications.sql)"""
import asyncio, json, os, subprocess, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e
from e2e import Mock, page_with
from playwright.async_api import async_playwright
PORT = 8772; BASE = f"http://localhost:{PORT}"; e2e.BASE = BASE; ROOT = e2e.ROOT; res = []
def check(n, ok, x=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  [{x}]" if x and not ok else ""))
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json"}
def iso(days=0, hours=0): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + days * 86400 + hours * 3600))
def N(i, title, **k): return {"id": f"00000000-0000-0000-0000-{i:012d}", "title": title, "summary": "ملخص " + title, "title_fr": None, "summary_fr": None, "category": "announcement", "priority": "normal", "target_url": "index.html#announcements", "status": "published", "publish_at": iso(-1), "expires_at": None, "push_sent_at": None, **k}
def rls_visible(r): return r["status"] == "published" and r["publish_at"] <= iso() and (not r["expires_at"] or r["expires_at"] > iso())

class Feed:
    """يحاكي RLS للقراءة العامة لجدول notifications ويسجّل الطلبات."""
    def __init__(s, rows, fail=False): s.rows = rows; s.fail = fail; s.reqs = []; s.writes = []
    async def handle(s, route):
        req = route.request
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=CORS)
        u = urllib.parse.urlparse(req.url); s.reqs.append((req.method, u.path, u.query))
        if req.method != "GET": s.writes.append(req.method); return await route.fulfill(status=403, headers=CORS, body='{"message":"permission denied"}')
        if s.fail: return await route.fulfill(status=500, headers=CORS, body="{}")
        if u.path.endswith("/notifications"):
            q = urllib.parse.parse_qs(u.query); lim = int(q.get("limit", ["30"])[0]); off = int(q.get("offset", ["0"])[0])
            r = sorted([x for x in s.rows if rls_visible(x)], key=lambda x: x["publish_at"], reverse=True)
            return await route.fulfill(status=200, headers=CORS, body=json.dumps(r[off:off + lim]))
        return await route.fulfill(status=200, headers=CORS, body="[]")
async def pub(b, feed, w=1280, js=True, reduced=False, init=None):
    ctx = await b.new_context(viewport={"width": w, "height": 900 if w > 600 else 780}, java_script_enabled=js, reduced_motion="reduce" if reduced else "no-preference")
    await ctx.route("**/fonts.*/**", lambda r: r.abort()); await ctx.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=e2e.CFG))
    await ctx.route(e2e.SB + "/**", feed.handle)
    if init: await ctx.add_init_script(init)
    pg = await ctx.new_page(); pg.errors = []; pg.on("pageerror", lambda e: pg.errors.append(str(e))); return pg
async def perm_calls(pg): return await pg.evaluate("window.__perm || 0")
BOX = "e=>{const r=e.getBoundingClientRect();return [r.left,r.right,r.bottom,innerWidth,innerHeight]}"

async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            rows = [N(1, "إعلان أول"), N(2, "إعلان ثانٍ", category="news", priority="high", target_url="index.html#news", title_fr="Deuxième annonce", summary_fr="Résumé FR"), N(3, "إعلان ثالث", priority="urgent"),
                    N(4, "مسودة سرية DRAFT", status="draft"), N(5, "مؤرشف ARCH", status="archived"), N(6, "منتهي EXPIRED", publish_at=iso(-3), expires_at=iso(-1)), N(7, "مستقبلي FUTURE", publish_at=iso(2))]
            INIT = "window.__perm=0; try{ Object.defineProperty(Notification,'permission',{get:()=>'default'}); Notification.requestPermission = () => { window.__perm++; return Promise.resolve('denied'); }; }catch(e){}"
            # ---------- 1 + 3 + 4 ----------
            feed = Feed(rows); pg = await pub(b, feed, init=INIT); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell", timeout=6000); await pg.wait_for_timeout(700)
            check("1 anonymous visitor (no login) sees the bell with unread badge = 3 active notifications", await pg.inner_text(".nt-badge") == "3")
            await pg.click("#ntBell"); await pg.wait_for_selector(".nt-item"); txt = await pg.inner_text("#ntPanel")
            check("3/4 drafts, archived, expired and not-yet-published notifications never appear", all(x not in txt for x in ["DRAFT", "ARCH", "EXPIRED", "FUTURE"]) and await pg.locator(".nt-item").count() == 3)
            check("panel shows title, summary, category, priority chips, time and unread styling", "إعلان ثانٍ" in txt and "مهم" in txt and "عاجل" in txt and await pg.locator(".nt-item.is-unread").count() == 3)
            check("2 visitor cannot write: feed requests are GET only", set(m for m, *_ in feed.reqs) == {"GET"} and feed.writes == [])
            check("bell has aria-label with unread count, aria-expanded, dialog role", "3" in (await pg.get_attribute("#ntBell", "aria-label")) and await pg.get_attribute("#ntBell", "aria-expanded") == "true" and await pg.get_attribute("#ntPanel", "role") == "dialog")
            check("no browser permission prompt on load or when opening the panel", await perm_calls(pg) == 0)
            # ---------- 14 ----------
            await pg.click('[data-mark="00000000-0000-0000-0000-000000000001"]'); await pg.wait_for_timeout(200)
            st = json.loads(await pg.evaluate("localStorage.getItem('razi_nt_v1')"))
            check("14 'mark as read' updates badge (3→2) and stores versioned local state {v:1, read:[id]}", await pg.inner_text(".nt-badge") == "2" and st["v"] == 1 and st["read"] == ["00000000-0000-0000-0000-000000000001"], str(st))
            await pg.reload(); await pg.wait_for_selector("#ntBell"); await pg.wait_for_timeout(700)
            check("14b read state persists across reloads", await pg.inner_text(".nt-badge") == "2")
            await pg.click("#ntBell"); await pg.click("[data-markall]"); await pg.wait_for_timeout(200)
            check("14c 'mark all as read' clears the badge and all unread styling", await pg.locator(".nt-badge").is_hidden() and await pg.locator(".nt-item.is-unread").count() == 0 and len(json.loads(await pg.evaluate("localStorage.getItem('razi_nt_v1')"))["read"]) == 3)
            await pg.evaluate("localStorage.setItem('razi_nt_v1', JSON.stringify({v:1, read:Array.from({length:500},(_, i)=>'id'+i)}))"); await pg.reload(); await pg.wait_for_selector("#ntBell"); await pg.click("#ntBell"); await pg.click("[data-markall]"); await pg.wait_for_timeout(200)
            check("14d local storage is bounded (≤200 ids)", len(json.loads(await pg.evaluate("localStorage.getItem('razi_nt_v1')"))["read"]) <= 200)
            await pg.evaluate("localStorage.setItem('razi_nt_v1', '{broken')"); await pg.reload(); await pg.wait_for_selector("#ntBell"); await pg.wait_for_timeout(600)
            check("14e corrupted storage → treated as empty (badge shows again), no errors", await pg.inner_text(".nt-badge") == "3" and not pg.errors, str(pg.errors))
            await pg.click("#ntBell"); await pg.wait_for_timeout(200); href = await pg.get_attribute(".nt-item:nth-child(2) .nt-item__link", "href")
            check("notification link targets internal route (in-page anchor on the homepage)", href in ("#news", "index.html#news"), href)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(150)
            check("Escape closes the panel and returns focus to the bell", await pg.locator("#ntPanel").is_hidden() and await pg.evaluate("document.activeElement.id") == "ntBell")
            # ---------- 18 ----------
            await pg.click("#langBtn"); await pg.wait_for_timeout(700); await pg.click("#ntBell"); await pg.wait_for_selector(".nt-item"); fr = await pg.inner_text("#ntPanel"); bb = await pg.eval_on_selector("#ntPanel", BOX)
            check("18 French: LTR, French UI + French title/summary used when provided, panel inside viewport", await pg.evaluate("document.documentElement.dir") == "ltr" and "Centre de notifications" in fr and "Deuxième annonce" in fr and bb[0] >= 0 and bb[1] <= bb[3], str(bb))
            await pg.keyboard.press("Escape"); await pg.click("#langBtn"); await pg.wait_for_timeout(700); await pg.click("#ntBell"); bb = await pg.eval_on_selector("#ntPanel", BOX)
            check("18b Arabic RTL restored; panel inside viewport", await pg.evaluate("document.documentElement.dir") == "rtl" and "مركز إشعارات الرازي" in await pg.inner_text("#ntPanel") and bb[0] >= 0 and bb[1] <= bb[3], str(bb))
            await pg.close()
            # ---------- Push ----------
            pg = await pub(b, Feed(rows), init=INIT); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell"); await pg.click("#ntBell"); await pg.wait_for_selector("[data-push]")
            await pg.route("**/api/push-subscription", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "publicKey": "B" + "A" * 86})))
            check("push button text is exactly 'تفعيل إشعارات الرازي' and no permission requested yet", "تفعيل إشعارات الرازي" in await pg.inner_text("[data-push]") and await perm_calls(pg) == 0)
            await pg.click("[data-push]"); await pg.wait_for_timeout(600)
            check("explicit click → permission requested ONCE; denied handled gracefully (message, button hidden, no loop)", await perm_calls(pg) == 1 and "محظورة" in await pg.inner_text(".nt-push__msg") and await pg.locator("[data-push]").is_hidden())
            await pg.reload(); await pg.wait_for_selector("#ntBell"); await pg.wait_for_timeout(600); check("permission is never re-requested on later page loads", await perm_calls(pg) == 0)
            await pg.close()
            pg = await pub(b, Feed(rows), init="delete window.PushManager;"); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell"); await pg.click("#ntBell"); await pg.wait_for_selector(".nt-push__msg"); await pg.wait_for_timeout(300)
            check("unsupported browser: clear explanation (incl. iOS PWA note), no push button, in-app center still works", "لا يدعم" in await pg.inner_text(".nt-push__msg") and await pg.locator("[data-push]").is_hidden() and await pg.locator(".nt-item").count() == 3)
            await pg.close()
            # ---------- أخطاء/فراغ ----------
            pg = await pub(b, Feed(rows, fail=True)); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell"); await pg.click("#ntBell"); await pg.wait_for_selector("[data-retry]", timeout=6000)
            check("network/API error → clear alert message + retry button (center still opens)", "تعذّر" in await pg.inner_text("#ntPanel") and await pg.locator(".nt-badge").is_hidden()); await pg.close()
            pg = await pub(b, Feed([])); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell"); await pg.click("#ntBell"); await pg.wait_for_selector(".nt-state"); check("empty state shown with explanation", "لا توجد إشعارات حاليًا" in await pg.inner_text("#ntPanel")); await pg.close()
            # ---------- صفحة السجل + ترقيم ----------
            many = [N(100 + i, f"إشعار رقم {i}", publish_at=iso(-1, -i)) for i in range(35)]
            feed = Feed(many); pg = await pub(b, feed); await pg.goto(BASE + "/notifications.html"); await pg.wait_for_selector(".nt-item")
            check("full notifications page: renders a bounded first page (30) with 'show more'", await pg.locator(".nt-item").count() == 30 and await pg.locator("[data-more]").count() == 1)
            await pg.click("[data-more]"); await pg.wait_for_timeout(500); check("pagination loads the rest without refetching the first page", await pg.locator(".nt-item").count() == 35 and sum("offset=30" in q for _, _, q in feed.reqs) == 1)
            await pg.click('.nt-tab[data-tab="read"]'); await pg.wait_for_timeout(150); check("history tab filters read items (none yet → empty state)", await pg.locator(".nt-item").count() == 0); await pg.close()
            # ---------- جوال 320 ----------
            pg = await pub(b, Feed(rows), w=320); await pg.goto(BASE + "/"); await pg.wait_for_selector("#ntBell"); await pg.wait_for_timeout(600)
            r = await pg.evaluate("(()=>{const t=document.querySelector('.tools').getBoundingClientRect();return [t.right,t.left,innerWidth,document.documentElement.scrollWidth]})()")
            check("mobile 320px: bell fits the header (tools inside viewport, no horizontal overflow)", r[1] >= 0 and r[0] <= r[2] and r[3] <= 320, str(r))
            await pg.click("#ntBell"); await pg.wait_for_selector(".nt-item"); bb = await pg.eval_on_selector("#ntPanel", BOX)
            check("mobile 320px: panel never overflows the screen", bb[0] >= 0 and bb[1] <= bb[3] and bb[2] <= bb[4], str(bb)); await pg.close()
            # ---------- Scroll reveal ----------
            for name, w in (("desktop", 1280), ("mobile", 390)):
                pg = await pub(b, Feed(rows), w=w); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1200)
                hidden = await pg.evaluate("[...document.querySelectorAll('[data-reveal]')].filter(e=>getComputedStyle(e).opacity==='0').length")
                check(f"15 reveal ({name}): below-the-fold elements start hidden after init (js-reveal set)", await pg.evaluate("document.documentElement.classList.contains('js-reveal')") and hidden > 3, str(hidden))
                check(f"15b reveal ({name}): hero is never hidden/animated by the reveal system", await pg.evaluate("(()=>{const h=document.querySelector('.hero');return !h.hasAttribute('data-reveal') && !h.querySelector('[data-reveal]')})()"))
                await pg.evaluate("document.querySelector('#news').scrollIntoView()"); await pg.wait_for_timeout(1700)
                shown = await pg.evaluate("getComputedStyle(document.querySelector('#news .head, #news h2')).opacity")
                check(f"15c reveal ({name}): element becomes visible on entering the viewport, then reveal attributes are removed (animate once)", shown == "1" and await pg.evaluate("!document.querySelector('#news .head, #news h2').hasAttribute('data-reveal')"), shown)
                sw = await pg.evaluate("document.documentElement.scrollWidth"); check(f"15d reveal ({name}): no horizontal overflow while elements are hidden/animating", sw <= w, str(sw))
                await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(2000)
                left = await pg.evaluate("[...document.querySelectorAll('[data-reveal]')].filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&getComputedStyle(e).opacity==='0'}).length")
                check(f"15e reveal ({name}): nothing visible stays at opacity 0 after scrolling", left == 0, str(left)); await pg.close()
            pg = await pub(b, Feed(rows), reduced=True); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1000)
            check("16 prefers-reduced-motion: reveal system not initialised, nothing is hidden", not await pg.evaluate("document.documentElement.classList.contains('js-reveal')") and await pg.evaluate("document.querySelectorAll('[data-reveal]').length") == 0); await pg.close()
            pg = await pub(b, Feed(rows)); await pg.route("**/js/reveal.js", lambda r: r.abort()); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1000)
            check("17 reveal script unavailable/failing: no js-reveal class and nothing hidden by the new system (legacy .rv fallback only)", not await pg.evaluate("document.documentElement.classList.contains('js-reveal')") and await pg.evaluate("document.querySelectorAll('[data-reveal]').length") == 0); await pg.close()
            ctx = await b.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 900}); await ctx.route("**/fonts.*/**", lambda r: r.abort()); pg = await ctx.new_page(); await pg.goto(BASE + "/"); await pg.wait_for_timeout(500)
            check("17b JavaScript disabled entirely: main content is visible (opacity 1)", await pg.evaluate("[...document.querySelectorAll('#news h2, #about h2, #contact h2')].every(e=>getComputedStyle(e).opacity==='1')")); await ctx.close()
            pg = await pub(b, Feed(rows), init="delete window.IntersectionObserver;"); await pg.goto(BASE + "/"); await pg.wait_for_timeout(800)
            check("17c IntersectionObserver unavailable → reveal skipped, content visible", not await pg.evaluate("document.documentElement.classList.contains('js-reveal')")); await pg.close()
            # ---------- 19 ----------
            pg = await pub(b, Feed(rows)); await pg.goto(BASE + "/"); await pg.wait_for_timeout(1500)
            check("19 hero scroll indicator absent from the DOM; hero 3D ribbon + logo artwork still present", await pg.locator(".hero__scroll, .hero__scroll-line").count() == 0 and await pg.locator(".ribbon").count() >= 1 and await pg.locator(".logo3d").count() == 1)
            check("hero layout intact after removal (h1 visible, CTA visible, no overflow at 1280)", await pg.locator(".hero__h1").is_visible() and await pg.locator(".hero__cta .btn").first.is_visible() and await pg.evaluate("document.documentElement.scrollWidth") <= 1280)
            check("no page errors on the homepage with notifications + reveal", not pg.errors, str(pg.errors)); await pg.close()
            for u in ("about.html", "privacy.html", "assistant.html", "notifications.html"):
                pg = await pub(b, Feed(rows), w=320); await pg.goto(BASE + "/" + u); await pg.wait_for_timeout(900)
                check(f"{u}: bell present, 320px no overflow, no errors", await pg.locator("#ntBell").count() == 1 and await pg.evaluate("document.documentElement.scrollWidth") <= 320 and not pg.errors, str(pg.errors)); await pg.close()
            # ---------- الإدارة ----------
            m = Mock(); m.tables["notifications"] = []; T = m.tables["notifications"]
            pg = await page_with(b, m); await pg.goto(BASE + "/admin/"); await pg.fill("#email", "admin@x.com"); await pg.fill("#password", "good"); await pg.click("#loginBtn"); await pg.wait_for_timeout(900)
            sends = []
            await pg.route(e2e.SB + "/rest/v1/rpc/admin_push_count", lambda r: r.fulfill(status=200, headers=CORS, body="7"))
            async def psend(route):
                sends.append((route.request.headers.get("authorization"), json.loads(route.request.post_data or "{}")))
                if len(sends) == 1: await route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "total": 7, "delivered": 6, "failed": 0, "removed": 1}))
                else: await route.fulfill(status=409, content_type="application/json", body=json.dumps({"success": False, "code": "already_sent_or_not_publishable"}))
            await pg.route("**/api/push-send", psend)
            await pg.click('[data-tab="notifications"]'); await pg.wait_for_timeout(700)
            check("5 admin section 'إدارة الإشعارات' opens with empty state and Push subscriber count", "لا توجد إشعارات بعد" in await pg.inner_text("#view") and "7" in await pg.inner_text("[data-cnt]"))
            await pg.click("[data-add]"); await pg.fill('dialog[open] [name=title]', "إشعار اختبار"); await pg.fill('dialog[open] [name=summary]', "ملخص"); await pg.fill('dialog[open] [name=title_fr]', "Test FR")
            check("5b live AR/FR preview in the form", "Test FR" in await pg.inner_text("dialog[open] [data-prev]") and "إشعار اختبار" in await pg.inner_text("dialog[open] [data-prev]"))
            await pg.select_option('dialog[open] [name=dest]', "__custom"); await pg.fill('dialog[open] [name=custom]', "javascript:alert(1)"); await pg.click("dialog[open] [type=submit]"); await pg.wait_for_timeout(400)
            check("5c unsafe destination rejected (javascript:) — nothing saved", len(T) == 0 and "الوجهة" in await pg.inner_text("dialog[open] .msg"))
            await pg.fill('dialog[open] [name=custom]', "https://example.org/x"); await pg.select_option('dialog[open] [name=status]', "published"); await pg.check('dialog[open] [name=push]'); await pg.click("dialog[open] [type=submit]"); await pg.wait_for_timeout(500)
            await pg.click('dialog[open] button[value="yes"]'); await pg.wait_for_timeout(900)
            check("5d create + publish saved with validated https target; explicit confirm required for Push", len(T) == 1 and T[0]["target_url"] == "https://example.org/x" and T[0]["status"] == "published", str(T))
            check("8 explicit publish sends exactly ONE push request with the admin's own token and the new id", len(sends) == 1 and sends[0][0] == "Bearer tok-u-admin" and sends[0][1] == {"notificationId": T[0]["id"]}, str(sends))
            await pg.wait_for_timeout(300); T[0]["push_sent_at"] = iso(); await pg.click('[data-tab="announcements"]'); await pg.click('[data-tab="notifications"]'); await pg.wait_for_timeout(600)
            check("already-pushed notification shows no 'send Push' button (cannot be re-sent from the UI)", await pg.locator('[data-nt="push"]').count() == 0 and "أُرسل Push" in await pg.inner_text("#view"))
            await pg.locator('[data-nt="edit"]').click(); await pg.fill('dialog[open] [name=title]', "عنوان معدّل"); await pg.click("dialog[open] [type=submit]"); await pg.wait_for_timeout(800)
            check("9 editing a published notification saves WITHOUT any push request", len(sends) == 1 and T[0]["title"] == "عنوان معدّل")
            await pg.locator('[data-nt="draft"]').click(); await pg.wait_for_timeout(500); check("unpublish works (status → draft)", T[0]["status"] == "draft")
            await pg.locator('[data-nt="archived"]').click(); await pg.wait_for_timeout(500); check("archive works", T[0]["status"] == "archived")
            await pg.locator('[data-nt="delete"]').click(); await pg.click('dialog[open] button[value="yes"]'); await pg.wait_for_timeout(600); check("delete works after confirmation", len(T) == 0)
            await pg.click('[data-tab="announcements"]'); await pg.wait_for_timeout(500); await pg.click("#addBtn"); await pg.wait_for_timeout(200)
            check("announcement form offers 'create notification on publish' (checked by default)", await pg.is_checked("#f_notify"))
            await pg.fill("#f_title", "إعلان بلا إشعار"); await pg.uncheck("#f_notify"); await pg.click("#saveBtn"); await pg.wait_for_timeout(700)
            await pg.click("#addBtn"); await pg.fill("#f_title", "إعلان عادي"); await pg.click("#saveBtn"); await pg.wait_for_timeout(700)
            normal = next(x for x in m.ann if x["title"] == "إعلان عادي"); check("default announcement save does NOT send a 'notify' field (compatible before migration 003)", "notify" not in normal, str(normal))
            quiet = next(x for x in m.ann if x["title"] == "إعلان بلا إشعار"); check("announcement saved with notify=false when unchecked", quiet.get("notify") is False, str(quiet))
            check("admin panel: no page errors", not pg.errors, str(pg.errors))
            await b.close()
    finally: srv.terminate()
    print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
asyncio.run(main())
