/* admin-tt.js — إدارة استعمال الزمن (الأولوية القصوى).
   النموذج: timetables (السنة/المستوى/القسم/الأيام/الحالة) ← timetable_periods (الحصص والاستراحات بأوقاتها) ← timetable_entries (مادة/أستاذ/قاعة لكل يوم وحصة).
   الصلاحيات والتحقق النهائي في قاعدة البيانات (RLS + triggers + publish_timetable)؛ هذا الملف واجهة فقط. */
(() => {
  const { $, esc, fmt, toast, busy, db, modal, confirmBox } = window.ADM;
  const Q = encodeURIComponent, DAYS = TT.DAYS, hm = TT.hm;
  const ST = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
  const defYear = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
  const norm = t => String(t || "").slice(0, 5);
  let ctx = { id: null }, S = null;   // S: حالة المحرر

  window.ADM.sections.push({ table: "timetables", title: "استعمال الزمن", tab: "timetables" });
  window.ADM.views.timetables = root => (ctx.id ? editor(root) : list(root));

  const loadFull = async id => {
    const [tt, periods, entries] = await Promise.all([
      db(`timetables?id=eq.${Q(id)}&select=*`), db(`timetable_periods?timetable_id=eq.${Q(id)}&select=*&order=starts_at.asc`), db(`timetable_entries?timetable_id=eq.${Q(id)}&select=*`)]);
    if (!tt[0]) { const e = new Error("nf"); e.status = 404; throw e; }
    return { tt: tt[0], periods, entries };
  };

  /* ================= القائمة ================= */
  async function list(root) {
    root.innerHTML = `<div class="head"><h1>استعمال الزمن</h1><button class="btn btn--primary btn--sm" id="ttNew">${ADM.svg("plus")}<span>جدول جديد</span></button></div>
      <p class="muted">أنشئ جدولًا لكل قسم، عرّف الحصص والاستراحات، أضف المواد، ثم انشره ليظهر للطلاب. المسودات لا تظهر للزوار.</p>
      <div class="tools-row"><input type="search" id="ttQ" placeholder="ابحث بالمستوى أو القسم…" aria-label="بحث"><select id="ttSt" aria-label="الحالة"><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select></div>
      <div id="ttList"><p>جارٍ التحميل…</p></div>`;
    $("#ttNew").onclick = () => headModal(null);
    let t; $("#ttQ").oninput = () => { clearTimeout(t); t = setTimeout(draw, 300); }; $("#ttSt").onchange = draw;
    draw();
    async function draw() {
      const box = $("#ttList"); if (!box) return;
      const q = ($("#ttQ").value || "").replace(/[*%,()]/g, " ").trim(), st = $("#ttSt").value;
      let path = "timetables?select=id,school_year,level,class_name,days,status,updated_at,published_at&order=school_year.desc,level.asc,class_name.asc&limit=100";
      if (q) path += `&or=(level.ilike.*${Q(q)}*,class_name.ilike.*${Q(q)}*)`; if (st) path += `&status=eq.${st}`;
      try {
        const rows = await db(path), counts = {};
        if (rows.length) (await db(`timetable_entries?select=timetable_id&timetable_id=in.(${rows.map(r => r.id).join(",")})&limit=5000`)).forEach(e => (counts[e.timetable_id] = (counts[e.timetable_id] || 0) + 1));
        box.innerHTML = rows.length ? rows.map(r => `<article class="arow"><div class="arow__m"><b>${esc(r.level)} — ${esc(r.class_name)}</b><small>السنة الدراسية ${esc(r.school_year)} · ${counts[r.id] || 0} حصة مسجلة · آخر تعديل: ${fmt(r.updated_at)}</small></div>
          <span class="tag st-${esc(r.status)}">${ST[r.status] || esc(r.status)}</span>
          <div class="arow__a"><button data-tt="edit" data-id="${esc(r.id)}">تحرير</button><button data-tt="preview" data-id="${esc(r.id)}">معاينة</button><button data-tt="print" data-id="${esc(r.id)}">طباعة / PDF</button>
          ${r.status === "published" ? `<button data-tt="unpublish" data-id="${esc(r.id)}">إلغاء النشر</button>` : `<button data-tt="publish" data-id="${esc(r.id)}">نشر</button>`}
          <button data-tt="copy" data-id="${esc(r.id)}">نسخ لقسم آخر</button><button class="del" data-tt="delete" data-id="${esc(r.id)}">حذف</button></div></article>`).join("")
          : `<p class="empty"><b>${q || st ? "لا توجد نتائج مطابقة" : "لا توجد جداول بعد"}</b><small>${q || st ? "" : "اضغط «جدول جديد» لإنشاء أول استعمال زمن."}</small></p>`;
        box._rows = rows;
      } catch (e) { if (e.code !== "SESSION_EXPIRED") { box.innerHTML = `<p class="msg" role="alert">${ADM.apiErr(e)} <button class="btn btn--sm btn--primary" id="rt">إعادة المحاولة</button></p>`; $("#rt").onclick = draw; } }
    }
    root.onclick = async e => {
      const b = e.target.closest("[data-tt]"); if (!b) return; const id = b.dataset.id, act = b.dataset.tt;
      const row = ($("#ttList")._rows || []).find(r => r.id === id);
      try {
        if (act === "edit") { ctx.id = id; return go(); }
        if (act === "preview" || act === "print") { busy(b, true); const f = await loadFull(id); busy(b, false); return act === "print" ? TT.print(f.tt, f.periods, f.entries) : preview(f); }
        if (act === "publish") return publish(id, row, draw);
        if (act === "unpublish") { if (await confirmBox(`سيُخفى جدول «${row.level} — ${row.class_name}» عن الطلاب ويعود مسودة.`, "إلغاء النشر")) { await db(`timetables?id=eq.${Q(id)}`, { method: "PATCH", body: { status: "draft" } }); toast("أُلغي نشر الجدول."); draw(); } return; }
        if (act === "copy") return copyModal(id, draw);
        if (act === "delete") { if (await confirmBox(`سيُحذف «${row.level} — ${row.class_name}» (${row.school_year}) بكل حصصه نهائيًا${row.status === "published" ? " وسيختفي عن الطلاب" : ""}.`, "حذف نهائي", true)) { await db(`timetables?id=eq.${Q(id)}`, { method: "DELETE" }); toast("تم حذف الجدول."); draw(); } }
      } catch (er) { busy(b, false); if (er.code !== "SESSION_EXPIRED") toast(ADM.apiErr(er), true); }
    };
  }
  const go = () => ADM.go("timetables");

  /* ================= نشر / معاينة / نسخ ================= */
  async function publish(id, row, after, conflictsCount = 0) {
    const name = row ? `«${row.level} — ${row.class_name}»` : "هذا الجدول";
    if (!(await confirmBox(`سيظهر ${name} للطلاب في الموقع فورًا. إن وُجد جدول منشور لنفس القسم والسنة فسيُؤرشف.${conflictsCount ? ` تنبيه: يوجد ${conflictsCount} تعارض (أستاذ/قاعة) مع جداول أخرى.` : ""}`, "نشر الآن"))) return;
    try { await db("rpc/publish_timetable", { method: "POST", body: { p_id: id } }); toast("تم نشر الجدول، وهو ظاهر الآن للطلاب."); after(); }
    catch (e) { if (e.code !== "SESSION_EXPIRED") toast(ADM.apiErr(e), true); }
  }
  function preview(f) {
    return modal({ title: `معاينة — ${f.tt.level} — ${f.tt.class_name}`, wide: true, ok: "طباعة / PDF", cancel: "إغلاق", body: `<p class="muted">هكذا سيراه الطلاب. للحفظ كـ PDF اختر «Save as PDF» من نافذة الطباعة.</p><div class="ttg-wrap">${TT.gridHTML(f.tt, f.periods, f.entries)}</div>`, onSubmit: () => { TT.print(f.tt, f.periods, f.entries); return false; } });
  }
  async function copyModal(id, after) {
    const src = await loadFull(id);
    await modal({ title: "نسخ الجدول إلى قسم آخر", ok: "إنشاء النسخة (مسودة)", body: `<p class="muted">تُنسخ الحصص والمواد، ويمكنك تعديل الأساتذة والقاعات بعد ذلك.</p>
      <label class="f">السنة الدراسية<input name="y" type="text" dir="ltr" value="${esc(src.tt.school_year)}" required></label><label class="f">المستوى<input name="lv" type="text" maxlength="60" value="${esc(src.tt.level)}" required></label>
      <label class="f">القسم الجديد<input name="cl" type="text" maxlength="60" required></label>`,
      onSubmit: async (f, fail) => {
        const y = f.y.value.trim(), lv = f.lv.value.trim(), cl = f.cl.value.trim(); const m = validHead(y, lv, cl); if (m) return fail(m);
        const [nt] = await db("timetables", { method: "POST", body: { school_year: y, level: lv, class_name: cl, days: src.tt.days, notes: src.tt.notes, status: "draft" } });
        try {
          if (src.periods.length) await db("timetable_periods", { method: "POST", body: src.periods.map(p => ({ timetable_id: nt.id, slot_no: p.slot_no, label: p.label, starts_at: p.starts_at, ends_at: p.ends_at, is_break: p.is_break })) });
          if (src.entries.length) await db("timetable_entries", { method: "POST", body: src.entries.map(e => ({ timetable_id: nt.id, day: e.day, slot_no: e.slot_no, subject: e.subject, teacher_name: e.teacher_name, room: e.room, note: e.note })) });
        } catch (er) { await db(`timetables?id=eq.${nt.id}`, { method: "DELETE" }).catch(() => {}); throw er; }   // لا تُترك نسخة ناقصة
        toast("أُنشئت نسخة الجدول كمسودة."); after();
      } });
  }

  /* ================= نموذج بيانات الجدول ================= */
  const validHead = (y, lv, cl) => !/^\d{4}-\d{4}$/.test(y) ? "السنة الدراسية بصيغة 2025-2026." : (+y.slice(5) !== +y.slice(0, 4) + 1) ? "السنة الثانية يجب أن تساوي الأولى + 1." : !lv ? "المستوى مطلوب." : !cl ? "القسم مطلوب." : "";
  async function headModal(tt, entries = []) {
    const levels = [...new Set((await db("timetables?select=level&limit=500").catch(() => [])).map(r => r.level))];
    const d = tt || { school_year: defYear(), level: "", class_name: "", days: [1, 2, 3, 4, 5, 6], notes: "" };
    return modal({ title: tt ? "تعديل بيانات الجدول" : "جدول جديد", body: `
      <label class="f">السنة الدراسية *<input name="y" type="text" dir="ltr" inputmode="numeric" placeholder="2025-2026" value="${esc(d.school_year)}" required></label>
      <label class="f">المستوى *<input name="lv" type="text" maxlength="60" list="lvs" value="${esc(d.level)}" required><datalist id="lvs">${levels.map(l => `<option value="${esc(l)}">`).join("")}</datalist></label>
      <label class="f">القسم *<input name="cl" type="text" maxlength="60" value="${esc(d.class_name)}" required></label>
      <fieldset class="f"><legend>أيام الدراسة *</legend><div class="chk-row">${[1, 2, 3, 4, 5, 6, 7].map(n => `<label class="f f--chk"><input type="checkbox" name="d" value="${n}" ${d.days.includes(n) ? "checked" : ""}> ${DAYS[n]}</label>`).join("")}</div></fieldset>
      <label class="f">ملاحظات (اختياري)<textarea name="nt" maxlength="1000" rows="2">${esc(d.notes || "")}</textarea></label>`,
      onSubmit: async (f, fail) => {
        const y = f.y.value.trim(), lv = f.lv.value.trim(), cl = f.cl.value.trim(), days = [...f.querySelectorAll("[name=d]:checked")].map(x => +x.value);
        const m = validHead(y, lv, cl) || (!days.length ? "اختر يومًا دراسيًا واحدًا على الأقل." : ""); if (m) return fail(m);
        const body = { school_year: y, level: lv, class_name: cl, days, notes: f.nt.value.trim() || null };
        if (!tt) { const [nt] = await db("timetables", { method: "POST", body }); ctx.id = nt.id; toast("أُنشئ الجدول كمسودة. عرّف الحصص ثم أضف المواد."); return go(); }
        const removed = tt.days.filter(x => !days.includes(x)), lost = entries.filter(e => removed.includes(e.day)).length;
        if (lost && !(await confirmBox(`سيؤدي حذف أيام من الجدول إلى حذف ${lost} حصة مسجلة فيها.`, "متابعة", true))) return false;
        await db(`timetables?id=eq.${Q(tt.id)}`, { method: "PATCH", body }); toast("تم حفظ بيانات الجدول."); go();
      } });
  }

  /* ================= المحرر ================= */
  async function editor(root) {
    root.innerHTML = "<p>جارٍ التحميل…</p>";
    try { const f = await loadFull(ctx.id); S = { ...f, day: null, draft: f.periods.map(p => ({ ...p, starts_at: norm(p.starts_at), ends_at: norm(p.ends_at) })), dirty: false }; }
    catch (e) { if (e.code === "SESSION_EXPIRED") return; ctx.id = null; return list(root); }
    const days = [...S.tt.days].sort((a, b) => a - b); const today = ((new Date().getDay() + 6) % 7) + 1; S.day = days.includes(today) ? today : days[0];
    const t = S.tt;
    root.innerHTML = `<div class="tt-top"><button class="btn btn--outline btn--sm" id="ttBack" type="button">رجوع للقائمة</button></div>
      <div class="head"><h1>${esc(t.level)} — ${esc(t.class_name)}</h1><span class="tag st-${esc(t.status)}" id="ttSt">${ST[t.status]}</span></div>
      <p class="muted">السنة الدراسية ${esc(t.school_year)} · أيام الدراسة: ${days.map(d => DAYS[d]).join("، ")}</p>
      <div class="row tt-actions"><button class="btn btn--outline btn--sm" id="ttEditHead" type="button">تعديل بيانات الجدول</button><button class="btn btn--outline btn--sm" id="ttPrev" type="button">معاينة</button><button class="btn btn--outline btn--sm" id="ttPrint" type="button">طباعة / PDF</button>
        ${t.status === "published" ? `<button class="btn btn--outline btn--sm" id="ttUnpub" type="button">إلغاء النشر</button>` : `<button class="btn btn--primary btn--sm" id="ttPub" type="button">نشر الجدول</button>`}</div>
      <div id="ttConf" aria-live="polite"></div>
      <section class="panel"><h2 class="adm__h2">1) الحصص والاستراحات</h2><div id="ttPer"></div></section>
      <section class="panel"><h2 class="adm__h2">2) المواد حسب اليوم</h2><div class="chips chips--sm" id="ttDays" aria-label="اليوم"></div><ul class="sessions" id="ttDay"></ul></section>`;
    $("#ttBack").onclick = async () => { if (S.dirty && !(await confirmBox("لديك تعديلات غير محفوظة على الحصص. المغادرة ستفقدها.", "مغادرة", true))) return; ctx.id = null; go(); };
    $("#ttEditHead").onclick = () => headModal(S.tt, S.entries);
    $("#ttPrev").onclick = () => preview(S); $("#ttPrint").onclick = () => TT.print(S.tt, S.periods, S.entries);
    const pub = $("#ttPub"), unpub = $("#ttUnpub");
    if (pub) pub.onclick = async () => { if (S.dirty) return toast("احفظ تعديلات الحصص أولًا.", true); if (!S.entries.length) return toast("أضف مادة واحدة على الأقل قبل النشر.", true); const c = await conflicts(); publish(S.tt.id, S.tt, go, c.length); };
    if (unpub) unpub.onclick = async () => { if (await confirmBox("سيُخفى الجدول عن الطلاب ويعود مسودة.", "إلغاء النشر")) { try { await db(`timetables?id=eq.${Q(S.tt.id)}`, { method: "PATCH", body: { status: "draft" } }); toast("أُلغي النشر."); go(); } catch (e) { if (e.code !== "SESSION_EXPIRED") toast(ADM.apiErr(e), true); } } };
    drawPeriods(); drawDays(); conflicts();
  }

  /* ---- الحصص ---- */
  const nextSlot = () => { const used = new Set(S.draft.map(p => p.slot_no)); let n = 1; while (used.has(n)) n++; return n; };
  function drawPeriods() {
    const box = $("#ttPer"); if (!box) return; const sorted = [...S.draft].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    box.innerHTML = `${S.dirty ? `<p class="msg" role="status">تعديلات غير محفوظة على الحصص. اضغط «حفظ الحصص».</p>` : ""}
      ${sorted.length ? sorted.map(p => `<div class="perow ${p.is_break ? "perow--break" : ""}" data-slot="${p.slot_no}">
        <label class="f">${p.is_break ? "استراحة" : "الحصة"}<input type="text" data-f="label" maxlength="40" value="${esc(p.label || "")}" placeholder="${p.is_break ? "استراحة" : "اسم اختياري"}"></label>
        <label class="f">من<input type="time" data-f="starts_at" value="${esc(p.starts_at)}" required></label><label class="f">إلى<input type="time" data-f="ends_at" value="${esc(p.ends_at)}" required></label>
        <label class="f f--chk"><input type="checkbox" data-f="is_break" ${p.is_break ? "checked" : ""}> استراحة</label><button type="button" class="perow__x" data-del="${p.slot_no}" aria-label="حذف">حذف</button></div>`).join("")
        : `<p class="empty"><b>لم تُعرَّف حصص بعد</b><small>أضف حصصًا يدويًا أو استعمل «توليد تلقائي».</small></p>`}
      <div class="row"><button type="button" class="btn btn--outline btn--sm" id="pAdd">+ حصة</button><button type="button" class="btn btn--outline btn--sm" id="pBrk">+ استراحة</button><button type="button" class="btn btn--outline btn--sm" id="pGen">توليد تلقائي</button><button type="button" class="btn btn--primary btn--sm" id="pSave" ${S.dirty ? "" : "disabled"}>حفظ الحصص</button></div>`;
    box.oninput = e => { const row = e.target.closest("[data-slot]"), f = e.target.dataset.f; if (!row || !f) return; const p = S.draft.find(x => x.slot_no === +row.dataset.slot); p[f] = e.target.type === "checkbox" ? e.target.checked : e.target.value; if (f === "is_break") row.classList.toggle("perow--break", p.is_break); S.dirty = true; $("#pSave").disabled = false; };
    box.onclick = async e => {
      const del = e.target.closest("[data-del]"); if (del) { S.draft = S.draft.filter(p => p.slot_no !== +del.dataset.del); S.dirty = true; return drawPeriods(); }
      if (e.target.id === "pAdd" || e.target.id === "pBrk") { const last = [...S.draft].sort((a, b) => a.ends_at.localeCompare(b.ends_at)).pop(); S.draft.push({ slot_no: nextSlot(), label: "", starts_at: last ? last.ends_at : "", ends_at: "", is_break: e.target.id === "pBrk" }); S.dirty = true; return drawPeriods(); }
      if (e.target.id === "pGen") return genModal();
      if (e.target.id === "pSave") return savePeriods(e.target);
    };
  }
  function genModal() {
    return modal({ title: "توليد الحصص تلقائيًا", ok: "توليد", body: `<p class="muted">يملأ القائمة بحصص متتالية ثم تعدّلها وتحفظها. القيم أدناه اقتراحات، عدّلها حسب توقيت مؤسستك.</p>
      <label class="f">بداية اليوم<input name="s" type="time" value="08:00" required></label><label class="f">مدة الحصة (دقيقة)<input name="m" type="number" min="10" max="180" value="55" required></label>
      <label class="f">عدد الحصص<input name="c" type="number" min="1" max="12" value="8" required></label><label class="f">استراحة بعد كل … حصص (0 = بدون)<input name="b" type="number" min="0" max="12" value="4" required></label><label class="f">مدة الاستراحة (دقيقة)<input name="bm" type="number" min="5" max="120" value="15" required></label>`,
      onSubmit: async (f, fail) => {
        if (S.draft.length && !(await confirmBox("سيستبدل التوليد قائمة الحصص الحالية (غير المحفوظة).", "استبدال", true))) return false;
        const [h, mi] = f.s.value.split(":").map(Number); let cur = h * 60 + mi; const len = +f.m.value, c = +f.c.value, b = +f.b.value, bm = +f.bm.value;
        if (!(len >= 10 && c >= 1)) return fail("قيم غير صالحة."); const t = x => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; const out = []; let n = 1;
        for (let i = 1; i <= c; i++) { out.push({ slot_no: n++, label: "", starts_at: t(cur), ends_at: t(cur + len), is_break: false }); cur += len; if (b && i % b === 0 && i < c) { out.push({ slot_no: n++, label: "استراحة", starts_at: t(cur), ends_at: t(cur + bm), is_break: true }); cur += bm; } }
        if (cur >= 1440) return fail("تتجاوز الحصص منتصف الليل."); S.draft = out; S.dirty = true; drawPeriods();
      } });
  }
  async function savePeriods(btn) {
    const d = [...S.draft].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    for (const p of d) { if (!p.starts_at || !p.ends_at) return toast("أكمل أوقات كل الحصص.", true); if (p.ends_at <= p.starts_at) return toast(`وقت النهاية يجب أن يكون بعد البداية (${p.starts_at}).`, true); }
    for (let i = 1; i < d.length; i++) if (d[i].starts_at < d[i - 1].ends_at) return toast(`الحصص متداخلة: ${d[i - 1].starts_at}–${d[i - 1].ends_at} و ${d[i].starts_at}–${d[i].ends_at}.`, true);
    const keep = new Set(d.map(p => p.slot_no)), gone = S.periods.filter(p => !keep.has(p.slot_no)), lost = S.entries.filter(e => gone.some(p => p.slot_no === e.slot_no)).length;
    const breakLost = S.entries.filter(e => d.find(p => p.slot_no === e.slot_no && p.is_break)).length; if (breakLost) return toast("لا يمكن تحويل حصة فيها مواد إلى استراحة. احذف موادها أولًا.", true);
    if (lost && !(await confirmBox(`حذف ${gone.length} حصة سيحذف ${lost} مادة مسجلة فيها.`, "متابعة", true))) return;
    busy(btn, true);
    try {
      if (gone.length) await db(`timetable_periods?timetable_id=eq.${Q(S.tt.id)}&slot_no=in.(${gone.map(p => p.slot_no).join(",")})`, { method: "DELETE" });
      if (d.length) await db("timetable_periods?on_conflict=timetable_id,slot_no", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: d.map(p => ({ timetable_id: S.tt.id, slot_no: p.slot_no, label: (p.label || "").trim() || null, starts_at: p.starts_at, ends_at: p.ends_at, is_break: !!p.is_break })) });
      const f = await loadFull(S.tt.id); S.periods = f.periods; S.entries = f.entries; S.draft = f.periods.map(p => ({ ...p, starts_at: norm(p.starts_at), ends_at: norm(p.ends_at) })); S.dirty = false;
      toast("تم حفظ الحصص."); drawPeriods(); drawDays(); conflicts();
    } catch (e) { if (e.code !== "SESSION_EXPIRED") toast(ADM.apiErr(e), true); } finally { busy(btn, false); }
  }

  /* ---- المواد حسب اليوم ---- */
  function drawDays() {
    const dayBox = $("#ttDays"), list = $("#ttDay"); if (!dayBox) return; const days = [...S.tt.days].sort((a, b) => a - b);
    dayBox.innerHTML = days.map(d => `<button type="button" class="chip" data-d="${d}" aria-pressed="${d === S.day}">${DAYS[d]}</button>`).join("");
    dayBox.onclick = e => { const b = e.target.closest("[data-d]"); if (b) { S.day = +b.dataset.d; drawDays(); } };
    const ps = TT.sorted(S.periods); let n = 0;
    list.innerHTML = ps.length ? ps.map(p => {
      if (p.is_break) return `<li class="ss ss--break"><div class="ss__t"><b>${hm(p.starts_at)} – ${hm(p.ends_at)}</b></div><div class="ss__m">${esc(p.label || "استراحة")}</div></li>`;
      n++; const e = S.entries.find(x => x.day === S.day && x.slot_no === p.slot_no);
      return `<li class="ss ${e ? "" : "ss--empty"}"><div class="ss__t"><b>${hm(p.starts_at)} – ${hm(p.ends_at)}</b><small>${esc(p.label || "الحصة " + n)}</small></div>
        <div class="ss__m">${e ? `<b>${esc(e.subject)}</b><small>${[e.teacher_name, e.room].filter(Boolean).map(esc).join(" · ") || "—"}</small>` : "<small>لا توجد مادة</small>"}
        <div class="ss__a"><button type="button" data-c="${e ? "edit" : "add"}" data-slot="${p.slot_no}">${e ? "تعديل" : "+ إضافة مادة"}</button>${e ? `<button type="button" data-c="move" data-slot="${p.slot_no}">نقل</button><button type="button" class="del" data-c="del" data-slot="${p.slot_no}">حذف</button>` : ""}</div></div></li>`;
    }).join("") : `<li class="empty"><b>عرّف الحصص أولًا</b><small>بعد حفظ الحصص تظهر هنا لإضافة المواد.</small></li>`;
    list.onclick = e => { const b = e.target.closest("[data-c]"); if (b) cellAction(b.dataset.c, +b.dataset.slot); };
  }
  async function cellAction(act, slot) {
    const e0 = S.entries.find(x => x.day === S.day && x.slot_no === slot), p = S.periods.find(x => x.slot_no === slot);
    try {
      if (act === "del") { if (await confirmBox(`حذف مادة «${e0.subject}» من ${DAYS[S.day]} (${hm(p.starts_at)}).`, "حذف", true)) { await db(`timetable_entries?timetable_id=eq.${Q(S.tt.id)}&day=eq.${S.day}&slot_no=eq.${slot}`, { method: "DELETE" }); await reloadEntries("تم حذف المادة."); } return; }
      if (act === "move") return moveModal(e0);
      const subjects = [...new Set(S.entries.map(x => x.subject))], others = [...S.tt.days].filter(d => d !== S.day).sort((a, b) => a - b);
      await modal({ title: `${e0 ? "تعديل" : "إضافة"} مادة — ${DAYS[S.day]} ${hm(p.starts_at)}`, body: `
        <label class="f">المادة *<input name="s" type="text" maxlength="80" list="subs" value="${esc(e0 ? e0.subject : "")}" required><datalist id="subs">${subjects.map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>
        <label class="f">الأستاذ(ة) (اختياري)<input name="t" type="text" maxlength="100" value="${esc(e0 ? e0.teacher_name || "" : "")}"></label>
        <label class="f">القاعة (اختياري)<input name="r" type="text" maxlength="40" value="${esc(e0 ? e0.room || "" : "")}"></label>
        <label class="f">ملاحظة (اختياري)<input name="n" type="text" maxlength="200" value="${esc(e0 ? e0.note || "" : "")}"></label>
        ${others.length ? `<fieldset class="f"><legend>نسخ نفس الحصة إلى أيام أخرى (اختياري)</legend><div class="chk-row">${others.map(d => `<label class="f f--chk"><input type="checkbox" name="cp" value="${d}"> ${DAYS[d]}</label>`).join("")}</div></fieldset>` : ""}`,
        onSubmit: async (f, fail) => {
          const s = f.s.value.trim(); if (!s) return fail("اسم المادة مطلوب.");
          const targets = [S.day, ...[...f.querySelectorAll("[name=cp]:checked")].map(x => +x.value)];
          const clash = targets.filter(d => d !== S.day && S.entries.some(x => x.day === d && x.slot_no === slot)); if (clash.length && !(await confirmBox(`سيُستبدل ما هو مسجل في ${clash.map(d => DAYS[d]).join("، ")} لنفس الحصة.`, "استبدال", true))) return false;
          await db("timetable_entries?on_conflict=timetable_id,day,slot_no", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: targets.map(d => ({ timetable_id: S.tt.id, day: d, slot_no: slot, subject: s, teacher_name: f.t.value.trim() || null, room: f.r.value.trim() || null, note: f.n.value.trim() || null })) });
          await reloadEntries("تم حفظ المادة.");
        } });
    } catch (er) { if (er.code !== "SESSION_EXPIRED") toast(ADM.apiErr(er), true); }
  }
  function moveModal(e0) {
    const days = [...S.tt.days].sort((a, b) => a - b), ps = TT.sorted(S.periods).filter(p => !p.is_break);
    return modal({ title: `نقل «${e0.subject}»`, ok: "نقل", body: `<label class="f">إلى اليوم<select name="d">${days.map(d => `<option value="${d}" ${d === e0.day ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select></label>
      <label class="f">إلى الحصة<select name="p">${ps.map(p => `<option value="${p.slot_no}" ${p.slot_no === e0.slot_no ? "selected" : ""}>${hm(p.starts_at)} – ${hm(p.ends_at)}</option>`).join("")}</select></label>`,
      onSubmit: async (f, fail) => {
        const d = +f.d.value, sl = +f.p.value; if (d === e0.day && sl === e0.slot_no) return fail("اختر يومًا أو حصة مختلفة.");
        if (S.entries.some(x => x.day === d && x.slot_no === sl)) return fail("هذه الحصة مشغولة بمادة أخرى. احذفها أو انقلها أولًا.");
        await db("timetable_entries", { method: "POST", body: { timetable_id: S.tt.id, day: d, slot_no: sl, subject: e0.subject, teacher_name: e0.teacher_name, room: e0.room, note: e0.note } });
        await db(`timetable_entries?timetable_id=eq.${Q(S.tt.id)}&day=eq.${e0.day}&slot_no=eq.${e0.slot_no}`, { method: "DELETE" });
        S.day = d; await reloadEntries("تم نقل المادة.");
      } });
  }
  async function reloadEntries(msg) { S.entries = await db(`timetable_entries?timetable_id=eq.${Q(S.tt.id)}&select=*`); toast(msg); drawDays(); conflicts(); }

  /* ---- التعارضات (تنبيه لا منع) ---- */
  async function conflicts() {
    const box = $("#ttConf"); if (!box || !S) return []; let rows = [];
    try { rows = await db("rpc/timetable_conflicts", { method: "POST", body: { p_id: S.tt.id } }); } catch (e) { if (e.code !== "SESSION_EXPIRED") box.innerHTML = ""; return []; }
    const ps = Object.fromEntries(S.periods.map(p => [p.slot_no, p]));
    box.innerHTML = rows.length ? `<div class="msg" role="alert"><b>تنبيه: ${rows.length} تعارض محتمل</b><ul class="confl">${rows.map(r => `<li>${r.kind === "teacher" ? "الأستاذ(ة)" : "القاعة"} «${esc(r.c_value)}» — ${DAYS[r.c_day]} ${ps[r.c_slot] ? hm(ps[r.c_slot].starts_at) : ""} — مستعمل(ة) أيضًا مع ${esc(r.c_level)} / ${esc(r.c_class)}</li>`).join("")}</ul></div>` : "";
    return rows;
  }
})();
