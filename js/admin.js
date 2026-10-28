/* admin.js — لوحة الإدارة. الحماية الفعلية في قاعدة البيانات (RLS)؛ هذا الملف واجهة فقط. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ST = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
  const fmt = d => (d ? new Date(d).toLocaleString("ar-MA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const toLocal = iso => { if (!iso) return ""; const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const ICON = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', bad: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>', plus: '<path d="M12 5v14M5 12h14"/>' };
  const svg = n => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  const toast = (m, bad) => { const e = document.createElement("div"); e.setAttribute("role", bad ? "alert" : "status"); e.className = bad ? "bad" : "ok"; e.innerHTML = svg(bad ? "bad" : "ok"); const t = document.createElement("span"); t.textContent = m; e.append(t); $("#toasts").append(e); setTimeout(() => e.remove(), 3600); };
  const busy = (b, on) => { if (!b) return; b.classList.toggle("is-loading", on); b.disabled = on; on ? b.setAttribute("aria-busy", "true") : b.removeAttribute("aria-busy"); };
  const TYPES = ["إداري", "موعد", "وثيقة", "تغيير", "تنبيه"];
  const KINDS = {
    news: { title: "الأخبار", one: "خبر", sel: "id,title,slug,excerpt,content,image_url,category,featured,status,published_at,created_at,updated_at" },
    announcements: { title: "الإعلانات", one: "إعلان", sel: "id,title,content,type,pinned,status,start_at,end_at,created_at,updated_at" }
  };
  let tab = "dash", editing = null, rows = [], hasMore = false;
  const PAGE = 50, DRAFT = "razi_draft_";

  const show = id => ["boot", "login", "app"].forEach(x => ($("#" + x).hidden = x !== id));
  const showLogin = msg => { show("login"); const m = $("#loginMsg"); m.hidden = !msg; m.textContent = msg || ""; $("#password").value = ""; };
  const apiErr = e => {
    if (e.userMsg) return e.userMsg;
    const m = e.detail && e.detail.message, code = e.detail && e.detail.code;
    if (m && /[\u0600-\u06FF]/.test(m)) return m;                       // رسائل التحقق العربية القادمة من triggers قاعدة البيانات
    if (e.status === 404 || code === "PGRST205" || code === "42P01") return "هذا القسم غير مفعّل بعد في قاعدة البيانات (نفّذ الترحيل 002_cms_timetable.sql).";
    if (code === "23505") return "يوجد سجل مطابق من قبل (تكرار). عدّل البيانات أو ألغِ نشر السجل الآخر.";
    if (code === "23503") return "لا يمكن تنفيذ العملية لوجود سجلات مرتبطة.";
    if (code === "23514" || code === "22P02" || code === "22007") return "بيانات غير صالحة. راجع الحقول.";
    return e.status === 401 || e.status === 403 ? "ليست لديك صلاحية لهذه العملية." : e.status === 409 ? "الرابط المختصر (slug) مستخدم من قبل خبر آخر." : e.status === 400 || e.status === 422 ? "بيانات غير صالحة. راجع الحقول." : "تعذّر إتمام العملية. تحقق من الاتصال وحاول مرة أخرى.";
  };
  const guard = async fn => { try { return await fn(); } catch (e) {
    if (e.code === "SESSION_EXPIRED") { saveDraft(); document.querySelectorAll("dialog[open]").forEach(d => d.close()); showLogin("انتهت الجلسة. سجّل الدخول من جديد؛ يُسترجع نص التحرير غير المحفوظ عند فتح العنصر نفسه."); }
    throw e; } };
  const db = (path, o = {}) => guard(() => SB.rest(path, { ...o, admin: true }));

  /* ---------- الدخول ---------- */
  async function isAdmin(uid) { const r = await db(`admin_users?select=user_id&user_id=eq.${encodeURIComponent(uid)}`); return r.length === 1; }
  async function enter() {
    const s = SB.session(); if (!s) return showLogin();
    try { if (!(await isAdmin(s.user.id))) { await SB.logout(); return showLogin("هذا الحساب غير مخوّل لإدارة الموقع."); } }
    catch (e) { if (e.code !== "SESSION_EXPIRED") showLogin("تعذّر التحقق من الحساب. حاول لاحقًا."); return; }
    show("app"); go(tab);
  }
  $("#loginForm").addEventListener("submit", async ev => {
    ev.preventDefault(); const email = $("#email").value.trim(), pw = $("#password").value;
    if (!email || !pw) return showLogin("أدخل البريد الإلكتروني وكلمة المرور.");
    const b = $("#loginBtn"); busy(b, true);
    try { await SB.login(email, pw); await enter(); }
    catch (e) { showLogin(e.status === 429 ? "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." : e.status >= 400 && e.status < 500 ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "تعذّر الاتصال بالخادم. حاول لاحقًا."); }
    finally { busy(b, false); }
  });
  $("#logoutBtn").onclick = async () => { Object.keys(sessionStorage).filter(k => k.startsWith(DRAFT)).forEach(k => sessionStorage.removeItem(k)); await SB.logout(); showLogin(); };

  /* ---------- التنقل ---------- */
  $("#tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); };
  function go(t) {
    tab = t; document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === t));
    t === "dash" ? dash() : ADM.views[t] ? ADM.views[t]($("#view")) : manager(t);
  }

  /* ---------- لوحة الرئيسية ---------- */
  async function dash() {
    const v = $("#view"); v.innerHTML = `<p>جارٍ التحميل…</p>`;
    try {
      const q = (tb, st) => db(`${tb}?select=id&status=eq.${st}`, { count: true });
      const [np, nd, ap, ad] = await Promise.all([q("news", "published"), q("news", "draft"), q("announcements", "published"), q("announcements", "draft")]);
      const more = await Promise.all(ADM.sections.map(async sec => { try { const r = await db(`${sec.table}?select=status&limit=1000`); return { sec, p: r.filter(x => x.status === "published").length, d: r.filter(x => x.status === "draft").length }; } catch (e) { if (e.code === "SESSION_EXPIRED") throw e; return { sec, off: true }; } }));
      v.innerHTML = `<h1>الرئيسية</h1><div class="stats3">
        <div class="stat"><b>${np}</b><small>أخبار منشورة</small></div><div class="stat"><b>${nd}</b><small>أخبار (مسودات)</small></div>
        <div class="stat"><b>${ap}</b><small>إعلانات منشورة</small></div><div class="stat"><b>${ad}</b><small>إعلانات (مسودات)</small></div></div>
        <h2 class="adm__h2">حالة النشر حسب القسم</h2>
        <div class="sec-grid">${more.map(m => `<button type="button" class="sec-card" data-go="${m.sec.tab}"><b>${esc(m.sec.title)}</b>${m.off ? `<small class="warnline">غير مفعّل بعد (نفّذ الترحيل 002)</small>` : `<span class="sec-card__n"><span class="tag st-published">${m.p} منشور</span><span class="tag st-draft">${m.d} مسودة</span></span>`}</button>`).join("")}</div>
        <div class="row"><button class="btn btn--primary" data-go="news">إدارة الأخبار</button><button class="btn btn--primary" data-go="announcements">إدارة الإعلانات</button></div>`;
      v.querySelectorAll("[data-go]").forEach(b => (b.onclick = () => go(b.dataset.go)));
    } catch (e) { if (e.code !== "SESSION_EXPIRED") { v.innerHTML = `<p class="msg" role="alert">تعذّر تحميل الإحصائيات. <button class="btn btn--sm btn--primary" id="rt">إعادة المحاولة</button></p>`; $("#rt").onclick = dash; } }
  }

  /* ---------- قائمة المحتوى ---------- */
  function manager(kind) {
    const K = KINDS[kind], v = $("#view");
    v.innerHTML = `<div class="head"><h1>${K.title}</h1><button class="btn btn--primary btn--sm" id="addBtn">${svg("plus")}<span>إضافة ${K.one}</span></button></div>
      <div class="tools-row"><input type="search" id="q" placeholder="بحث بالعنوان…" aria-label="بحث"><select id="stf" aria-label="الحالة"><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select></div>
      <div id="list"><p>جارٍ التحميل…</p></div>`;
    $("#addBtn").onclick = () => openForm(kind, null);
    let t; $("#q").oninput = () => { clearTimeout(t); t = setTimeout(() => load(kind), 300); }; $("#stf").onchange = () => load(kind);
    load(kind);
  }
  async function load(kind, more = false) {
    const K = KINDS[kind], list = $("#list"); if (!list) return;
    const q = ($("#q").value || "").replace(/[*%,()]/g, " ").trim(), st = $("#stf").value, off = more ? rows.length : 0;
    let path = `${kind}?select=${K.sel}&order=created_at.desc&limit=${PAGE + 1}&offset=${off}`;
    if (q) path += `&title=ilike.*${encodeURIComponent(q)}*`;
    if (st) path += `&status=eq.${st}`;
    try {
      const batch = await db(path); hasMore = batch.length > PAGE; rows = (more ? rows : []).concat(batch.slice(0, PAGE));
      list.innerHTML = rows.length ? rows.map(r => `<article class="arow"><div class="arow__m"><b>${esc(r.title)}</b><small>أُنشئ: ${fmt(r.created_at)} · آخر تعديل: ${fmt(r.updated_at)}${r.end_at ? " · ينتهي: " + fmt(r.end_at) : ""}</small></div>
        <span class="tag st-${esc(r.status)}">${ST[r.status] || esc(r.status)}</span>
        <div class="arow__a"><button data-act="edit" data-id="${esc(r.id)}">تعديل</button>
        ${r.status === "published" ? `<button data-act="unpublish" data-id="${esc(r.id)}">إلغاء النشر</button>` : `<button data-act="publish" data-id="${esc(r.id)}">نشر</button>`}
        ${r.status !== "archived" ? `<button data-act="archive" data-id="${esc(r.id)}">أرشفة</button>` : ""}
        <button class="del" data-act="delete" data-id="${esc(r.id)}">حذف</button></div></article>`).join("") + (hasMore ? `<p class="center"><button class="btn btn--primary btn--sm" id="moreBtn" type="button">تحميل المزيد</button></p>` : "")
        : `<p class="empty">${q || st ? "لا توجد نتائج مطابقة." : `لا توجد عناصر بعد. اضغط "إضافة ${K.one}".`}</p>`;
    } catch (e) { if (e.code !== "SESSION_EXPIRED") { list.innerHTML = `<p class="msg" role="alert">${apiErr(e)} <button class="btn btn--sm btn--primary" id="rt">إعادة المحاولة</button></p>`; $("#rt").onclick = () => load(kind); } }
  }
  $("#view").addEventListener("click", async e => {
    if (e.target.id === "moreBtn") return load(tab, true);
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r = rows.find(x => x.id === b.dataset.id), act = b.dataset.act; if (!r) return;
    if (act === "edit") return openForm(tab, r);
    if (act === "delete") {
      $("#confirmText").textContent = `سيتم حذف "${r.title}" نهائيًا ولا يمكن التراجع.`; const d = $("#confirmDlg");
      d.onclose = async () => { if (d.returnValue !== "yes") return; try { await db(`${tab}?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" }); toast("تم الحذف."); load(tab); } catch (er) { if (er.code !== "SESSION_EXPIRED") toast(apiErr(er), true); } };
      d.returnValue = ""; return d.showModal();   // تصفير القيمة: إغلاق بـ Esc لا يحذف
    }
    const status = { publish: "published", unpublish: "draft", archive: "archived" }[act]; busy(b, true);
    const patch = { status }; if (status === "published" && tab === "news") patch.published_at = new Date().toISOString();   // إعادة النشر تُحدّث تاريخ النشر
    try { await db(`${tab}?id=eq.${encodeURIComponent(r.id)}`, { method: "PATCH", body: patch }); toast("تم تحديث الحالة."); load(tab); }
    catch (er) { busy(b, false); if (er.code !== "SESSION_EXPIRED") toast(apiErr(er), true); }
  });

  /* ---------- نموذج الإضافة/التعديل (نص عادي فقط؛ لا HTML) ---------- */
  const slugify = t => { const s = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); return s || "news-" + Date.now().toString(36); };
  const sel = (id, opts, val, lbl) => `<label class="f">${lbl}<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const stOpts = Object.entries(ST);
  function openForm(kind, r) {
    editing = r; const K = KINDS[kind], d = r || {};
    $("#formTitle").textContent = (r ? "تعديل " : "إضافة ") + K.one; $("#formMsg").hidden = true;
    $("#formFields").innerHTML = `<label class="f">العنوان *<input id="f_title" type="text" maxlength="200" value="${esc(d.title)}" required></label>` + (kind === "news" ? `
      <label class="f">الرابط المختصر (slug)<input id="f_slug" type="text" dir="ltr" maxlength="120" value="${esc(d.slug)}" placeholder="يُولَّد تلقائيًا"><small>أحرف لاتينية وأرقام وشرطات فقط (اختياري)</small></label>
      <label class="f">الملخص<textarea id="f_excerpt" maxlength="500" rows="3">${esc(d.excerpt)}</textarea></label>
      <label class="f">المحتوى *<textarea id="f_content" rows="9" maxlength="50000">${esc(d.content)}</textarea><small>نص عادي. اترك سطرًا فارغًا بين الفقرات. لا يُسمح بـ HTML.</small></label>
      <label class="f">رابط الصورة<input id="f_image" type="url" dir="ltr" placeholder="https://…" value="${esc(d.image_url)}"></label>
      <label class="f">التصنيف<input id="f_category" type="text" maxlength="40" value="${esc(d.category)}"></label>
      <label class="f f--chk"><input id="f_featured" type="checkbox" ${d.featured ? "checked" : ""}> ضمن "أهم الأخبار"</label>` : `
      <label class="f">النص<textarea id="f_content" rows="5" maxlength="5000">${esc(d.content)}</textarea></label>
      ${sel("f_type", TYPES.map(x => [x, x]), d.type || "إداري", "النوع")}
      <label class="f f--chk"><input id="f_pinned" type="checkbox" ${d.pinned ? "checked" : ""}> تثبيت الإعلان</label>
      <label class="f">بداية العرض<input id="f_start" type="datetime-local" value="${toLocal(d.start_at)}"></label>
      <label class="f">نهاية العرض (اختياري)<input id="f_end" type="datetime-local" value="${toLocal(d.end_at)}"></label>`) + sel("f_status", stOpts, d.status || "draft", "الحالة");
    $("#formDlg").dataset.kind = kind; draftKey = DRAFT + kind + "_" + (r ? r.id : "new");
    try { const sv = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (sv) { Object.entries(sv).forEach(([id, val]) => { const el = $("#" + id); if (el) el.type === "checkbox" ? (el.checked = val) : (el.value = val); }); const m = $("#formMsg"); m.hidden = false; m.className = "msg ok"; m.textContent = "تم استرجاع نص غير محفوظ. راجعه ثم احفظ."; } } catch {}
    $("#formDlg").showModal();
  }
  let draftKey = null;
  function saveDraft() { if (!draftKey || !$("#formDlg").open) return; const o = {}; document.querySelectorAll('#formFields [id^="f_"]').forEach(el => (o[el.id] = el.type === "checkbox" ? el.checked : el.value)); try { sessionStorage.setItem(draftKey, JSON.stringify(o)); } catch {} }
  $("#formFields").addEventListener("input", saveDraft); $("#formFields").addEventListener("change", saveDraft);
  $("#cancelBtn").onclick = () => { if (draftKey) sessionStorage.removeItem(draftKey); $("#formDlg").close(); };
  $("#form").addEventListener("submit", async ev => {
    ev.preventDefault(); const kind = $("#formDlg").dataset.kind, v = id => ($("#" + id) ? $("#" + id).value.trim() : ""), c = id => $("#" + id).checked;
    const fail = m => { const e = $("#formMsg"); e.hidden = false; e.className = "msg"; e.textContent = m; }; let body;
    if (!v("f_title")) return fail("العنوان مطلوب.");
    const status = v("f_status");
    if (kind === "news") {
      if (status === "published" && !v("f_content")) return fail("المحتوى مطلوب لنشر الخبر.");
      if (v("f_image") && !/^https:\/\/[^\s"'<>]+$/i.test(v("f_image"))) return fail("رابط الصورة يجب أن يبدأ بـ https:// ولا يحتوي مسافات.");
      if (v("f_slug") && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v("f_slug"))) return fail("الرابط المختصر: أحرف لاتينية صغيرة وأرقام وشرطات فقط.");
      body = { title: v("f_title"), slug: v("f_slug") || (editing && editing.slug) || slugify(v("f_title")), excerpt: v("f_excerpt") || null, content: v("f_content"), image_url: v("f_image") || null, category: v("f_category") || null, featured: c("f_featured"), status };
      if (editing && editing.status !== "published" && status === "published") body.published_at = new Date().toISOString();
    } else {
      const s = v("f_start"), e = v("f_end"); if (s && e && new Date(e) <= new Date(s)) return fail("نهاية العرض يجب أن تكون بعد البداية.");
      body = { title: v("f_title"), content: v("f_content"), type: v("f_type"), pinned: c("f_pinned"), status, start_at: s ? new Date(s).toISOString() : null, end_at: e ? new Date(e).toISOString() : null };
    }
    const b = $("#saveBtn"); busy(b, true);
    try {
      if (editing) await db(`${kind}?id=eq.${encodeURIComponent(editing.id)}`, { method: "PATCH", body }); else await db(kind, { method: "POST", body });
      $("#formDlg").close(); if (draftKey) sessionStorage.removeItem(draftKey); toast("تم الحفظ بنجاح."); load(kind);
    } catch (er) { if (er.code !== "SESSION_EXPIRED") fail(apiErr(er)); else $("#formDlg").close(); }
    finally { busy(b, false); }
  });

  /* ---------- أدوات مشتركة للوحدات (استعمال الزمن / المحتوى) ---------- */
  const confirmBox = (text, ok = "تأكيد", danger = false) => new Promise(res => {
    const d = document.createElement("dialog"); d.className = "adlg adlg--sm";
    d.innerHTML = `<form method="dialog"><h2>تأكيد</h2><p></p><div class="adlg__a"><button class="btn ${danger ? "btn--danger" : "btn--primary"}" value="yes"></button><button class="btn btn--outline" value="no">إلغاء</button></div></form>`;
    d.querySelector("p").textContent = text; d.querySelector("button").textContent = ok; document.body.append(d);
    d.addEventListener("close", () => { const y = d.returnValue === "yes"; d.remove(); res(y); }); d.showModal();
  });
  function modal({ title, body, ok = "حفظ", cancel = "إلغاء", wide = false, onSubmit }) {
    return new Promise(res => {
      const d = document.createElement("dialog"); d.className = "adlg" + (wide ? " adlg--wide" : "");
      d.innerHTML = `<form novalidate><h2></h2><p class="msg" role="alert" hidden></p><div class="adlg__body">${body}</div><div class="adlg__a"><button class="btn btn--primary" type="submit"></button><button class="btn btn--outline" type="button" data-x>إلغاء</button></div></form>`;
      d.querySelector("h2").textContent = title; d.querySelector("[type=submit]").textContent = ok; d.querySelector("[data-x]").textContent = cancel; document.body.append(d);
      const f = d.querySelector("form"), msg = d.querySelector(".msg"), sub = f.querySelector("[type=submit]");
      const fail = m => { msg.hidden = false; msg.className = "msg"; msg.textContent = m; msg.scrollIntoView({ block: "nearest" }); return false; };   // fail() يُرجع false دائمًا كي يمنع "return fail(...)" إغلاق النافذة
      f.querySelector("[data-x]").onclick = () => d.close();
      d.addEventListener("close", () => { const okd = d.returnValue === "ok"; d.remove(); res(okd ? f : null); });
      f.addEventListener("submit", async e => {
        e.preventDefault(); msg.hidden = true; busy(sub, true);
        try { if ((await onSubmit(f, fail)) !== false) { d.returnValue = "ok"; d.close(); } }
        catch (er) { if (er.code !== "SESSION_EXPIRED") fail(apiErr(er)); }
        finally { busy(sub, false); }
      });
      d.showModal(); const first = f.querySelector("input:not([type=hidden]),select,textarea"); if (first) first.focus();
    });
  }
  const ADM = window.ADM = { $, esc, fmt, toast, busy, db, apiErr, svg, modal, confirmBox, go: t => go(t), views: {}, sections: [] };

  /* ---------- بدء التشغيل ---------- */
  addEventListener("DOMContentLoaded", () => {
  if (!SB.configured) { show("boot"); $("#boot").innerHTML = `<p class="msg" role="alert">لم يتم إعداد Supabase بعد. راجع docs/ADMIN_SETUP.md (متغيرات SUPABASE_URL و SUPABASE_ANON_KEY).</p>`; }
  else enter();
  });
})();
