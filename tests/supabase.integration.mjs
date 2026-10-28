// tests/supabase.integration.mjs — اختبار تكامل حقيقي على مشروع Supabase *اختباري* (يتطلب Node 18+).
// لا يستعمل service_role. يحتاج حسابين تُنشئهما أنت من لوحة Supabase (Authentication ← Add user، وليس من التسجيل العام):
//   مسؤول (موجود في admin_users) + مستخدم عادي (غير موجود فيه).
// المتغيرات (من البيئة فقط، لا تضعها في الملفات):
//   SUPABASE_URL  SUPABASE_ANON_KEY  TEST_ADMIN_EMAIL  TEST_ADMIN_PASSWORD  TEST_USER_EMAIL  TEST_USER_PASSWORD
// تشغيل:  node tests/supabase.integration.mjs     (رمز الخروج 2 = لم يُنفَّذ بسبب نقص الإعدادات؛ 0 = نجح؛ 1 = فشل)
const E = process.env, need = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD", "TEST_USER_EMAIL", "TEST_USER_PASSWORD"];
const missing = need.filter(k => !E[k]);
if (missing.length) { console.log("⏭  لم يُنفَّذ (متغيرات ناقصة):", missing.join(", ")); process.exit(2); }
const URL_ = E.SUPABASE_URL.replace(/\/+$/, ""), ANON = E.SUPABASE_ANON_KEY, TAG = "__rls_test__";
let pass = 0, failN = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : failN++; console.log((ok ? "PASS " : "FAIL ") + name + (!ok && extra ? `  [${extra}]` : "")); };
const login = async (email, password) => { const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const d = await r.json(); if (!r.ok) throw new Error("login failed for " + email + " (" + r.status + ")"); return { token: d.access_token, id: d.user.id }; };
const call = async (token, method, path, body) => { const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: ANON, ...((token || ANON.split(".").length === 3) ? { Authorization: `Bearer ${token || ANON}` } : {}), "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, ok: r.ok, j }; };
const day = n => new Date(Date.now() + n * 864e5).toISOString();
const denied = r => !r.ok;                                  // رفض صريح (401/403/4xx)
const ids = r => (Array.isArray(r.j) ? r.j.map(x => x.id) : []);

const admin = await login(E.TEST_ADMIN_EMAIL, E.TEST_ADMIN_PASSWORD), user = await login(E.TEST_USER_EMAIL, E.TEST_USER_PASSWORD);
const created = { news: [], announcements: [] };
const mk = async (t, body) => { const r = await call(admin.token, "POST", t, body); if (!r.ok) throw new Error(`setup insert ${t} failed: ${r.s} ${JSON.stringify(r.j)}`); created[t].push(r.j[0].id); return r.j[0]; };
try {
  const nPub = await mk("news", { title: TAG + "pub", status: "published", content: "x" }), nDraft = await mk("news", { title: TAG + "draft", status: "draft" }), nArch = await mk("news", { title: TAG + "arch", status: "archived" });
  const aLive = await mk("announcements", { title: TAG + "live", status: "published" }), aFuture = await mk("announcements", { title: TAG + "future", status: "published", start_at: day(1) });
  const aExp = await mk("announcements", { title: TAG + "expired", status: "published", start_at: day(-3), end_at: day(-1) }), aDraft = await mk("announcements", { title: TAG + "draft", status: "draft" });

  for (const [who, tok] of [["anon", null], ["non-admin user", user.token]]) {
    const n = await call(tok, "GET", `news?title=like.${TAG}*&select=id`), a = await call(tok, "GET", `announcements?title=like.${TAG}*&select=id`);
    check(`${who}: sees ONLY the published news`, JSON.stringify(ids(n)) === JSON.stringify([nPub.id]), JSON.stringify(ids(n)));
    check(`${who}: draft/archived news unreadable by id`, ids(await call(tok, "GET", `news?id=in.(${nDraft.id},${nArch.id})&select=id`)).length === 0);
    check(`${who}: sees ONLY the live announcement (not future/expired/draft)`, JSON.stringify(ids(a)) === JSON.stringify([aLive.id]), JSON.stringify(ids(a)));
    check(`${who}: INSERT news denied`, denied(await call(tok, "POST", "news", { title: TAG + "x" })));
    check(`${who}: INSERT announcement denied`, denied(await call(tok, "POST", "announcements", { title: TAG + "x" })));
    await call(tok, "PATCH", `news?id=eq.${nPub.id}`, { title: TAG + "HACKED" }); await call(tok, "DELETE", `news?id=eq.${nPub.id}`);
    const after = await call(admin.token, "GET", `news?id=eq.${nPub.id}&select=title`);
    check(`${who}: UPDATE/DELETE news had no effect`, after.j && after.j[0] && after.j[0].title === TAG + "pub");
    await call(tok, "PATCH", `announcements?id=eq.${aLive.id}`, { title: TAG + "HACKED" }); await call(tok, "DELETE", `announcements?id=eq.${aLive.id}`);
    const aAfter = await call(admin.token, "GET", `announcements?id=eq.${aLive.id}&select=title`);
    check(`${who}: UPDATE/DELETE announcement had no effect`, aAfter.j && aAfter.j[0] && aAfter.j[0].title === TAG + "live");
  }
  check("anon: admin_users unreadable", denied(await call(null, "GET", "admin_users?select=*")) || ids({ j: (await call(null, "GET", "admin_users?select=user_id")).j }).length === 0);
  const uAU = await call(user.token, "GET", "admin_users?select=user_id");
  check("non-admin: admin_users returns no rows", Array.isArray(uAU.j) && uAU.j.length === 0, JSON.stringify(uAU.j));
  check("non-admin: cannot grant themselves admin (INSERT admin_users denied)", denied(await call(user.token, "POST", "admin_users", { user_id: user.id })));
  check("non-admin: cannot make an existing user admin via UPDATE/DELETE", (await call(user.token, "DELETE", "admin_users?user_id=eq." + admin.id)).j?.length !== 1);
  check("admin: sees own admin_users row", (await call(admin.token, "GET", `admin_users?select=user_id&user_id=eq.${admin.id}`)).j?.length === 1);
  check("admin: even admin cannot INSERT into admin_users via API", denied(await call(admin.token, "POST", "admin_users", { user_id: user.id })));
  const all = await call(admin.token, "GET", `news?title=like.${TAG}*&select=id`);
  check("admin: sees all news incl. draft/archived", ids(all).length === 3);
  const sp = await mk("news", { title: TAG + "spoof", created_by: user.id, created_at: "2000-01-01T00:00:00Z", status: "draft" });
  check("trigger: created_by forced to the real admin (spoof ignored)", sp.created_by === admin.id, String(sp.created_by));
  check("trigger: created_at forced to now (spoof ignored)", new Date(sp.created_at).getFullYear() >= 2025);
  const pubd = await call(admin.token, "PATCH", `news?id=eq.${sp.id}`, { status: "published" });
  check("trigger: publishing sets published_at; then visible to anon", !!pubd.j?.[0]?.published_at && ids(await call(null, "GET", `news?id=eq.${sp.id}&select=id`)).length === 1);
  const un = await call(admin.token, "PATCH", `news?id=eq.${sp.id}`, { status: "draft" });
  check("admin: unpublish hides it from anon again", un.ok && ids(await call(null, "GET", `news?id=eq.${sp.id}&select=id`)).length === 0);
  check("constraint: announcement end_at <= start_at rejected", denied(await call(admin.token, "POST", "announcements", { title: TAG + "bad", start_at: day(2), end_at: day(1) })));
  check("constraint: image_url http:// rejected", denied(await call(admin.token, "POST", "news", { title: TAG + "img", image_url: "http://example.com/a.jpg" })));
  check("constraint: image_url javascript: rejected", denied(await call(admin.token, "POST", "news", { title: TAG + "img2", image_url: "javascript:alert(1)" })));
  check("constraint: invalid status rejected", denied(await call(admin.token, "POST", "news", { title: TAG + "st", status: "hacked" })));
  check("constraint: announcement trigger works (insert OK)", aLive && aFuture && aExp && aDraft);   // يثبت أن trigger الإعلانات لا يفشل
} catch (e) { failN++; console.log("FAIL setup/exception:", e.message); }
finally {
  for (const t of ["news", "announcements"]) await call(admin.token, "DELETE", `${t}?title=like.${TAG}*`);
  const left = await call(admin.token, "GET", `news?title=like.${TAG}*&select=id`);
  console.log(left.j?.length ? "⚠️  بقيت سجلات اختبار، احذفها يدويًا (العنوان يبدأ بـ __rls_test__)" : "🧹 تم تنظيف بيانات الاختبار");
}
console.log(`\n${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
