"""tests/assistant-ui.py — واجهة المساعد مع /api/assistant مُحاكى (بلا Gemini حقيقي). تشغيل: python tests/assistant-ui.py"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8771; BASE = f"http://localhost:{PORT}"
CFG = 'window.RAZI_CONFIG={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"anon-key-public"};'
DEMO = 'window.RAZI_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",DEMO:false};'
res = []
def check(n, ok, x=""): res.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  [{x}]" if x and not ok else ""))
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json"}
async def page(b, cfg, handler, w=390):
    cx = await b.new_context(viewport={"width": w, "height": 800}); calls = []
    await cx.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body=cfg))
    await cx.route("https://test.supabase.co/**", lambda r: r.fulfill(status=200, headers=CORS, body="[]") if r.request.method != "OPTIONS" else r.fulfill(status=204, headers=CORS))
    async def api(route):
        calls.append(json.loads(route.request.post_data or "{}")); await handler(route, len(calls))
    await cx.route("**/api/assistant", api)
    pg = await cx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); return pg, calls, errs
async def ask(pg, q):
    await pg.fill(".rai__form input", q); await pg.press(".rai__form input", "Enter")
async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            XSS = "<img src=x onerror=window.__x=1> مرحبًا\nرابط https://files.example.com/a.pdf"
            async def ok(route, n): await route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "answer": XSS, "sources": [{"label": "أخبار المؤسسة المنشورة", "url": "index.html#news"}, {"label": "evil", "url": "https://evil.example"}, {"label": "js", "url": "javascript:alert(1)"}], "fallback": False}))
            pg, calls, errs = await page(b, CFG, ok); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "ما هي الأخبار؟"); await pg.wait_for_selector(".rai__acts", timeout=5000)
            html = await pg.inner_html(".rai__body")
            check("AI answer rendered as text (no injected <img>/onerror executed)", "<img" not in html and await pg.evaluate("window.__x") is None)
            check("request carries only question+lang to /api/assistant", calls and set(calls[0]) == {"question", "lang"} and calls[0]["lang"] == "ar")
            check("trusted https link from answer is clickable with rel=noopener; source label shown", 'rel="noopener noreferrer"' in html and "files.example.com/a.pdf" in html and "المصدر: أخبار المؤسسة المنشورة" in html)
            hrefs = await pg.eval_on_selector_all(".rai__act", "e=>e.map(x=>x.getAttribute('href'))")
            check("only known internal routes become action links (external/javascript: dropped)", hrefs == ["index.html#news"], str(hrefs))
            await pg.close()
            # تحية: محلي بلا API
            pg, calls, errs = await page(b, CFG, ok); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "مرحبا"); await pg.wait_for_timeout(900)
            check("greeting handled locally (no API call)", len(calls) == 0)
            # فشل → احتياط محلي + إعادة المحاولة
            async def fail(route, n):
                if n == 1: await route.fulfill(status=502, content_type="application/json", body='{"success":false,"code":"upstream_error"}')
                else: await route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "answer": "تمت الإجابة", "sources": [], "fallback": False}))
            await pg.close(); pg, calls, errs = await page(b, CFG, fail); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "ما آخر الإعلانات؟"); await pg.wait_for_selector("[data-retry]", timeout=5000)
            t = await pg.inner_text(".rai__body")
            check("API failure → note + local published-content fallback + retry button", "غير متاحة" in t and "الإعلانات" in t)
            await pg.click("[data-retry]"); await pg.wait_for_function("document.body.innerText.includes('تمت الإجابة')", timeout=5000)
            n_me = await pg.locator(".rai__msg--me").count()
            check("retry re-asks once without duplicating the user message", len(calls) == 2 and n_me == 1, f"{len(calls)} {n_me}")
            await pg.close()
            # شبكة منقطعة
            async def abort(route, n): await route.abort()
            pg, calls, errs = await page(b, CFG, abort); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "كيف أتواصل؟"); await pg.wait_for_selector("[data-retry]", timeout=5000)
            check("network error → clear message + fallback + retry", "الاتصال" in await pg.inner_text(".rai__body"))
            await pg.close()
            # منع الإرسال المزدوج
            async def slow(route, n): await asyncio.sleep(1.2); await route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "answer": "ok", "sources": [], "fallback": False}))
            pg, calls, errs = await page(b, CFG, slow); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "ما هي الأخبار؟"); await pg.fill(".rai__form input", "سؤال ثان"); dis = await pg.is_disabled(".rai__send"); await pg.press(".rai__form input", "Enter"); await pg.wait_for_timeout(1800)
            check("duplicate submission blocked while a request is pending (button disabled, one call)", dis and len(calls) == 1, f"{dis} {len(calls)}")
            await pg.close()
            # فرنسي
            pg, calls, errs = await page(b, CFG, ok); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await pg.evaluate("document.documentElement.lang='fr'; dispatchEvent(new Event('razi:lang'))"); await ask(pg, "Quelles actualités ?"); await pg.wait_for_selector(".rai__acts", timeout=5000)
            check("French: lang=fr sent to API", calls and calls[0]["lang"] == "fr")
            await pg.close()
            # وضع بلا إعداد حي: لا API
            pg, calls, errs = await page(b, DEMO, ok); await pg.goto(BASE + "/assistant.html"); await pg.wait_for_selector(".rai__form")
            await ask(pg, "ما آخر الإعلانات؟"); await pg.wait_for_timeout(1000)
            check("without live Supabase config the local assistant answers and API is not called", len(calls) == 0 and "الإعلانات" in await pg.inner_text(".rai__body"))
            check("no page errors", not errs, str(errs))
            await b.close()
    finally: srv.terminate()
    print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
asyncio.run(main())
