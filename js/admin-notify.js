/* admin-notify.js — «إدارة الإشعارات» داخل لوحة الإدارة الحالية (يعتمد على window.ADM). الصلاحيات الفعلية في RLS + is_admin()؛
   إرسال Push عبر /api/push-send فقط، بطلب صريح من المشرف، ومرة واحدة لكل إشعار (حجز ذرّي في قاعدة البيانات). */
(() => {
  const { $, esc, fmt, toast, busy, db, modal, confirmBox } = window.ADM, Q = encodeURIComponent, PAGE = 50;
  const ST = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
  const CAT = [["announcement", "إعلان"], ["news", "خبر"], ["timetable", "استعمال الزمن"], ["resource", "مورد"], ["activity", "نشاط"], ["general", "عام"]];
  const PRI = [["normal", "عادي"], ["high", "مهم"], ["urgent", "عاجل"]];
  const DEST = [["index.html#announcements", "الإعلانات"], ["index.html#news", "الأخبار"], ["index.html#schedule", "استعمال الزمن"], ["index.html#resources", "الدروس والموارد"], ["index.html#life", "الأنشطة والأندية"], ["index.html#achievements", "الإنجازات"], ["index.html#gallery", "معرض الصور"], ["index.html#contact", "التواصل"], ["index.html", "الصفحة الرئيسية"], ["notifications.html", "صفحة الإشعارات"]];
  const ROUTE = /^(index|about|privacy|assistant|notifications)\.html(#[a-z0-9-]{1,40})?$/, HTTPS = /^https:\/\/[^\s<>"']{4,500}$/;
  const toLocal = iso => { if (!iso) return ""; const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const opts = (a, v) => a.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("");
  const missing = e => e && (e.status === 404 || (e.detail && (e.detail.code === "PGRST205" || e.detail.code === "42P01")));
  window.ADM.sections.push({ table: "notifications", title: "الإشعارات", tab: "notifications" });

  /* إرسال Push: طلب صريح فقط. يرجع رسالة مفهومة للمشرف. */
  async function sendPush(id) {
    let token; try { token = await SB.token(); } catch { return { ok: false, msg: "انتهت الجلسة. سجّل الدخول من جديد." }; }
    if (!token) return { ok: false, msg: "انتهت الجلسة. سجّل الدخول من جديد." };
    let r, j = null; try { r = await fetch("/api/push-send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ notificationId: id }), credentials: "omit" }); j = await r.json().catch(() => null); } catch { return { ok: false, msg: "تعذّر الاتصال بالخادم." }; }
    if (r.ok && j && j.success) return { ok: true, msg: `أُرسل إلى ${j.delivered} جهازًا من ${j.total}${j.removed ? ` (حُذف ${j.removed} اشتراكًا منتهيًا)` : ""}${j.failed ? ` — فشل ${j.failed}` : ""}.` };
    const M = { 409: "سبق إرسال Push لهذا الإشعار، أو أنه غير منشور/منتهٍ.", 403: "ليست لديك صلاحية الإرسال.", 401: "انتهت الجلسة. سجّل الدخول من جديد.", 429: "طلبات كثيرة. حاول بعد قليل.", 503: "إشعارات Push غير مُعدّة على الخادم (VAPID / الترحيل 003 / web-push)." };
    return { ok: false, msg: M[r.status] || "تعذّر الإرسال." };
  }
  async function pushCount() { try { const n = await db("rpc/admin_push_count", { method: "POST", body: {} }); return typeof n === "number" ? n : null; } catch { return null; } }

  /* معاينة عربية/فرنسية */
  const prev = f => { const g = n => (f.querySelector(`[name=${n}]`) || {}).value || "";
    const box = (t, s, l) => `<div class="ntp" lang="${l}" dir="${l === "fr" ? "ltr" : "rtl"}"><small>${l === "fr" ? "Français" : "العربية"}</small><b>${esc(t) || "—"}</b><span>${esc(s)}</span></div>`;
    f.querySelector("[data-prev]").innerHTML = box(g("title"), g("summary"), "ar") + box(g("title_fr") || g("title"), g("summary_fr") || g("summary"), "fr"); };
  /* النوافذ تُضاف إلى document.body (خارج منطقة العرض) ⇒ مستمعان عامّان مرة واحدة */
  const inForm = e => (e.target.closest ? e.target.closest("dialog form") : null);
  document.addEventListener("input", e => { const f = inForm(e); if (f && f.querySelector("[data-prev]")) prev(f); });
  document.addEventListener("change", e => { const f = inForm(e); if (f && e.target.name === "dest") f.querySelector("[data-custom]").hidden = e.target.value !== "__custom"; });

  function form(row) {
    const d = row || {}, nowL = toLocal(d.publish_at || new Date().toISOString()), isCustom = d.target_url && !DEST.some(x => x[0] === d.target_url);
    const body = `<label class="f">العنوان (عربي) *<input name="title" type="text" maxlength="200" value="${esc(d.title)}" required></label>
      <label class="f">الملخص (عربي)<textarea name="summary" rows="2" maxlength="500">${esc(d.summary)}</textarea></label>
      <label class="f">Titre (français) — اختياري<input name="title_fr" type="text" dir="ltr" maxlength="200" value="${esc(d.title_fr)}"></label>
      <label class="f">Résumé (français) — اختياري<textarea name="summary_fr" dir="ltr" rows="2" maxlength="500">${esc(d.summary_fr)}</textarea></label>
      <label class="f">التصنيف<select name="category">${opts(CAT, d.category || "general")}</select></label>
      <label class="f">الأهمية<select name="priority">${opts(PRI, d.priority || "normal")}</select></label>
      <label class="f">الوجهة<select name="dest">${opts(DEST.concat([["__custom", "مسار داخلي آخر أو رابط https…"]]), isCustom ? "__custom" : (d.target_url || "index.html#announcements"))}</select></label>
      <label class="f" data-custom ${isCustom ? "" : "hidden"}>المسار أو الرابط<input name="custom" type="text" dir="ltr" maxlength="500" placeholder="about.html أو https://…" value="${isCustom ? esc(d.target_url) : ""}"></label>
      <label class="f">وقت النشر<input name="publish_at" type="datetime-local" value="${nowL}"></label>
      <label class="f">تاريخ الانتهاء (اختياري)<input name="expires_at" type="datetime-local" value="${toLocal(d.expires_at)}"></label>
      <label class="f">الحالة<select name="status">${opts(Object.entries(ST), d.status || "draft")}</select></label>
      ${d.push_sent_at ? `<p class="note">أُرسل Push لهذا الإشعار بتاريخ ${esc(fmt(d.push_sent_at))}. لن يُرسل مرة ثانية.</p>` : `<label class="f f--chk"><input name="push" type="checkbox"> إرسال Push فور الحفظ (يتطلب: الحالة «منشور» ووقت النشر الآن)</label>`}
      <div class="ntp-wrap"><b>معاينة</b><div data-prev></div></div>`;
    setTimeout(() => { const f = document.querySelector("dialog[open] form"); if (f && f.querySelector("[data-prev]")) prev(f); }, 0);
    return modal({ title: row ? "تعديل إشعار" : "إشعار جديد", body, wide: true, ok: "حفظ", onSubmit: async (f, fail) => {
      const g = n => (f.querySelector(`[name=${n}]`) || {}).value.trim(), chk = n => !!(f.querySelector(`[name=${n}]`) || {}).checked;
      if (!g("title")) return fail("العنوان مطلوب.");
      let url = g("dest"); if (url === "__custom") url = g("custom");
      if (!ROUTE.test(url) && !HTTPS.test(url)) return fail("الوجهة يجب أن تكون صفحة داخلية معروفة (مثل index.html#news) أو رابط https صالحًا.");
      const pa = g("publish_at") ? new Date(g("publish_at")) : new Date(), ex = g("expires_at") ? new Date(g("expires_at")) : null;
      if (isNaN(pa)) return fail("وقت النشر غير صالح."); if (ex && (isNaN(ex) || ex <= pa)) return fail("تاريخ الانتهاء يجب أن يكون بعد وقت النشر.");
      const status = g("status"), want = chk("push");
      if (want && (status !== "published" || pa.getTime() > Date.now() + 60000)) return fail("إرسال Push يتطلب حالة «منشور» ووقت نشر حالي (ليس مستقبليًا).");
      if (want && !(await confirmBox("سيُرسَل Push الآن إلى كل المشتركين، ولا يمكن إعادة إرساله لهذا الإشعار. متابعة؟", "إرسال", false))) return false;
      const o = { title: g("title"), summary: g("summary") || null, title_fr: g("title_fr") || null, summary_fr: g("summary_fr") || null, category: g("category"), priority: g("priority"), target_url: url, status, publish_at: pa.toISOString(), expires_at: ex ? ex.toISOString() : null };
      const saved = row ? await db(`notifications?id=eq.${Q(row.id)}`, { method: "PATCH", body: o }) : await db("notifications", { method: "POST", body: o });
      const id = (saved && saved[0] && saved[0].id) || (row && row.id);
      toast("تم الحفظ بنجاح.");
      if (want && id) { const r = await sendPush(id); toast(r.msg, !r.ok); }
    } });
  }

  async function view(root) {
    let rows = [], more = false;
    root.innerHTML = `<div class="head"><h1>إدارة الإشعارات</h1><button class="btn btn--primary btn--sm" data-add>${window.ADM.svg("plus")}<span>إشعار جديد</span></button></div>
      <p class="note">تُنشأ إشعارات داخل الموقع تلقائيًا عند نشر إعلان أو خبر أو استعمال زمن أو مورد جديد (مرة واحدة لكل سجل). إشعار Push لا يُرسَل إلا بطلب صريح منك. <span data-cnt></span></p>
      <div class="tools-row"><input type="search" data-q placeholder="بحث بالعنوان…" aria-label="بحث"><select data-st aria-label="الحالة"><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select></div>
      <div data-list><p>جارٍ التحميل…</p></div>`;
    const list = root.querySelector("[data-list]"), qEl = root.querySelector("[data-q]"), stEl = root.querySelector("[data-st]");
    pushCount().then(n => { const s = root.querySelector("[data-cnt]"); if (s && n !== null) s.textContent = `عدد اشتراكات Push الحالية: ${n}.`; });
    async function load(append) {
      const q = qEl.value.replace(/[*%,()]/g, " ").trim(), st = stEl.value, off = append ? rows.length : 0;
      let path = `notifications?select=*&order=created_at.desc&limit=${PAGE + 1}&offset=${off}`; if (q) path += `&title=ilike.*${Q(q)}*`; if (st) path += `&status=eq.${st}`;
      try {
        const b = await db(path); more = b.length > PAGE; rows = (append ? rows : []).concat(b.slice(0, PAGE));
        list.innerHTML = rows.length ? rows.map(r => `<article class="arow"><div class="arow__m"><b>${esc(r.title)}</b><span>${esc((CAT.find(c => c[0] === r.category) || [])[1] || "")} · ${esc((PRI.find(c => c[0] === r.priority) || [])[1] || "")} · ${esc(fmt(r.publish_at))}${r.source_type ? " · تلقائي" : ""}${r.push_sent_at ? " · أُرسل Push" : ""}</span></div>
          <span class="tag st-${esc(r.status)}">${ST[r.status] || esc(r.status)}</span><div class="arow__a"><button data-nt="edit" data-id="${esc(r.id)}">تعديل</button>
          ${r.status === "published" ? `<button data-nt="draft" data-id="${esc(r.id)}">إلغاء النشر</button>` : `<button data-nt="published" data-id="${esc(r.id)}">نشر</button>`}
          ${r.status === "published" && !r.push_sent_at ? `<button data-nt="push" data-id="${esc(r.id)}">إرسال Push</button>` : ""}
          ${r.status !== "archived" ? `<button data-nt="archived" data-id="${esc(r.id)}">أرشفة</button>` : ""}<button data-nt="delete" data-id="${esc(r.id)}" class="danger">حذف</button></div></article>`).join("") + (more ? `<p><button class="btn btn--outline btn--sm" data-more>عرض المزيد</button></p>` : "")
          : `<p class="empty"><b>${q || st ? "لا توجد نتائج مطابقة" : "لا توجد إشعارات بعد"}</b><small>${q || st ? "" : "تظهر هنا الإشعارات التلقائية والمنشأة يدويًا."}</small></p>`;
      } catch (e) { if (e.code === "SESSION_EXPIRED") return; list.innerHTML = `<p class="msg" role="alert">${missing(e) ? "هذا القسم غير مفعّل بعد: نفّذ الترحيل 003_notifications.sql في Supabase." : esc(window.ADM.apiErr(e))} <button class="btn btn--sm btn--primary" data-retry>إعادة المحاولة</button></p>`; }
    }
    let t; qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => load(), 300); }; stEl.onchange = () => load();
    root.onclick = async e => {
      if (e.target.closest("[data-add]")) { if (await form(null)) load(); return; }
      if (e.target.closest("[data-more]")) return load(true); if (e.target.closest("[data-retry]")) return load();
      const b = e.target.closest("[data-nt]"); if (!b) return; const r = rows.find(x => x.id === b.dataset.id), act = b.dataset.nt; if (!r) return;
      if (act === "edit") { if (await form(r)) load(); return; }
      try {
        if (act === "delete") { if (await confirmBox(`سيُحذف «${r.title}» نهائيًا ولا يمكن التراجع.`, "حذف نهائي", true)) { busy(b, true); await db(`notifications?id=eq.${Q(r.id)}`, { method: "DELETE" }); toast("تم الحذف."); load(); } return; }
        if (act === "push") { if (!(await confirmBox("سيُرسَل Push الآن إلى كل المشتركين، ولا يمكن إعادة إرساله لهذا الإشعار. متابعة؟", "إرسال"))) return; busy(b, true); const x = await sendPush(r.id); toast(x.msg, !x.ok); busy(b, false); load(); return; }
        busy(b, true); await db(`notifications?id=eq.${Q(r.id)}`, { method: "PATCH", body: { status: act } }); toast("تم تحديث الحالة."); load();
      } catch (er) { busy(b, false); if (er.code !== "SESSION_EXPIRED") toast(window.ADM.apiErr(er), true); }
    };
    load();
  }
  window.ADM.views.notifications = view;
})();
