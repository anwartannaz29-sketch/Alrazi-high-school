/* js/supabase.js — عميل صغير لـ Supabase (PostgREST + Auth) بدون مكتبات. يستعمل مفتاح anon فقط؛ الحماية الحقيقية في RLS. */
(() => {
  const C = window.RAZI_CONFIG || {};
  const URL_ = (C.SUPABASE_URL || "").replace(/\/+$/, "");
  const KEY = C.SUPABASE_ANON_KEY || "";
  const SKEY = "razi_admin_session";
  const SB = { configured: /^https:\/\//.test(URL_) && !!KEY };

  /* الجلسة في sessionStorage (تنتهي بإغلاق التبويب) بدل localStorage: تقليل نافذة التعرض عند أي ثغرة XSS */
  const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } };
  const setSession = s => (s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY));
  const pack = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user && { id: d.user.id, email: d.user.email } });

  async function authCall(path, body) {
    const r = await fetch(`${URL_}/auth/v1/${path}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error("auth"); e.status = r.status; throw e; }
    return d;
  }
  SB.session = getSession;
  SB.login = async (email, password) => { const s = pack(await authCall("token?grant_type=password", { email, password })); setSession(s); return s; };
  SB.logout = async () => {
    const s = getSession(); setSession(null);
    if (s) fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  };
  let refreshing = null;   // طلب تجديد واحد فقط حتى لو جاءت عدة طلبات معًا (تدوير refresh token)
  async function freshToken() {
    const s = getSession(); if (!s) return null;
    if (s.expires_at - 30 > Date.now() / 1000) return s.access_token;
    if (!refreshing) refreshing = (async () => {
      try { const n = pack(await authCall("token?grant_type=refresh_token", { refresh_token: s.refresh_token })); n.user = n.user || s.user; setSession(n); return n.access_token; }
      catch { setSession(null); const e = new Error("expired"); e.code = "SESSION_EXPIRED"; throw e; }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  /* rest(path, { method, body, admin, count }) — admin:true يرسل رمز المستخدم، وإلا مفتاح anon */
  SB.rest = async (path, o = {}) => {
    if (!SB.configured) throw new Error("not-configured");
    const token = o.admin ? await freshToken() : null;
    if (o.admin && !token) { const e = new Error("expired"); e.code = "SESSION_EXPIRED"; throw e; }
    // المفتاح الجديد (sb_publishable_…) ليس JWT فلا يُرسل في Authorization؛ المفتاح القديم (anon JWT) يُرسل كما هو.
    const h = { apikey: KEY, Accept: "application/json" }; const bearer = token || (KEY.split(".").length === 3 ? KEY : null); if (bearer) h.Authorization = `Bearer ${bearer}`;
    if (o.body !== undefined) { h["Content-Type"] = "application/json"; h.Prefer = o.prefer || "return=representation"; }
    if (o.count) { h.Prefer = "count=exact"; h.Range = "0-0"; }
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(`${URL_}/rest/v1/${path}`, { method: o.method || "GET", headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, signal: ctl.signal });
      if (r.status === 401 && o.admin) { setSession(null); const e = new Error("expired"); e.code = "SESSION_EXPIRED"; throw e; }
      if (!r.ok) { const e = new Error("rest"); e.status = r.status; e.detail = await r.json().catch(() => ({})); throw e; }
      if (o.count) return +(r.headers.get("content-range") || "*/0").split("/")[1] || 0;
      return r.status === 204 ? null : r.json();
    } finally { clearTimeout(to); }
  };
  SB.url = URL_; SB.key = KEY; SB.token = freshToken;   // للرفع إلى Storage (يستعمله admin-cms.js)
  window.SB = SB;
})();
