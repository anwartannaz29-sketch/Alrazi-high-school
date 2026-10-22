/* admin-cms.js — إدارة بقية الأقسام: الدروس والملفات، الأساتذة، المعرض، الأنشطة، الأندية، الإنجازات، ومعلومات المؤسسة.
   محرّك عام يعتمد على وصف الحقول (CFG). كل عملية تُنفَّذ فعليًا على Supabase؛ الصلاحيات في RLS، والأنواع والأحجام مقيّدة أيضًا في حاوية Storage. */
(() => {
  const { $, esc, fmt, toast, busy, db, modal, confirmBox } = window.ADM;
  const Q = encodeURIComponent, PAGE = 50;
  const ST = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
  const opt = a => a.map(x => [x, x]);
  const ICON_OPTS = [["book", "كتاب"], ["ball", "كرة"], ["leaf", "ورقة"], ["palette", "ألوان"], ["flask", "علوم"], ["users", "أشخاص"], ["trophy", "كأس"], ["star", "نجمة"]];

  /* ---------- وصف الأقسام ---------- */
  const T = (k, l, o = {}) => ({ k, l, t: "text", ...o }), A = (k, l, o = {}) => ({ k, l, t: "textarea", ...o }), Sel = (k, l, opts, o = {}) => ({ k, l, t: "select", opts, ...o });
  const CFG = {
    resources: { table: "resources", tab: "resources", title: "الدروس والملفات", one: "مورد", search: "title", needsFileToPublish: "file_url",
      fields: [T("title", "العنوان", { req: 1, max: 200 }), T("level", "المستوى", { req: 1, max: 60, ph: "مثال: الثانية باكالوريا" }), T("subject", "المادة", { max: 80 }), T("unit", "الوحدة / الدرس", { max: 120 }),
        Sel("kind", "النوع", opt(["درس", "تمرين", "فرض", "ملخص", "وثيقة", "أخرى"]), { req: 1 }), { k: "file_url", l: "الملف (PDF أو Word أو Excel أو PowerPoint)", t: "file", folder: "resources" }],
      sum: r => `${r.level || ""} · ${r.subject || "—"} · ${r.kind}${r.file_url ? "" : " · بلا ملف"}` },
    teachers: { table: "teachers", tab: "teachers", title: "الأساتذة والأطر", one: "أستاذ", search: "name", order: "sort_order.asc,name.asc",
      fields: [T("name", "الاسم", { req: 1, max: 120 }), T("subject", "المادة / التخصص", { max: 80 }), T("role", "الصفة", { max: 80, ph: "مثال: أستاذ، إدارة…" }), { k: "photo_url", l: "الصورة (اختياري)", t: "image", folder: "teachers" }, { k: "sort_order", l: "ترتيب العرض (رقم أصغر = أولًا)", t: "number" }],
      sum: r => `${r.subject || "—"} · ${r.role || "—"}`, thumb: "photo_url" },
    gallery_items: { table: "gallery_items", tab: "gallery", title: "معرض الصور", one: "صورة", search: "title",
      fields: [{ k: "image_url", l: "الصورة", t: "image", req: 1, folder: "gallery" }, T("title", "الوصف / التعليق (يُستعمل كنص بديل)", { max: 200 }), Sel("category", "التصنيف", opt(["المؤسسة", "أنشطة", "رياضة", "ثقافة", "احتفالات", "مسابقات"]), { req: 1 })],
      sum: r => `${r.category}`, thumb: "image_url", titleOf: r => r.title || "صورة بلا وصف" },
    activities: { table: "activities", tab: "life", title: "الأنشطة المدرسية", one: "نشاط", search: "title", order: "sort_order.asc,created_at.desc",
      fields: [Sel("kind", "النوع", opt(["ثقافية", "رياضية", "علمية", "بيئية", "فنية", "مسابقات"]), { req: 1 }), T("title", "العنوان", { req: 1, max: 200 }), A("description", "الوصف", { max: 1000 }), { k: "sort_order", l: "ترتيب العرض", t: "number" }],
      sum: r => r.kind, titleOf: r => r.title },
    clubs: { table: "clubs", tab: "life", title: "الأندية", one: "نادٍ", search: "name", order: "sort_order.asc,name.asc",
      fields: [T("name", "اسم النادي", { req: 1, max: 120 }), A("description", "الوصف", { max: 1000 }), Sel("icon", "الأيقونة", ICON_OPTS, { req: 1 }), { k: "sort_order", l: "ترتيب العرض", t: "number" }],
      sum: r => r.description || "—", titleOf: r => r.name },
    achievements: { table: "achievements", tab: "achievements", title: "إنجازات المؤسسة", one: "إنجاز", search: "title",
      fields: [Sel("kind", "النوع", opt(["جوائز", "مسابقات", "نتائج", "مشاريع", "تكريمات", "مشاركات"]), { req: 1 }), T("title", "العنوان", { req: 1, max: 200 }), A("description", "الوصف", { max: 2000 }), { k: "achieved_on", l: "التاريخ", t: "date" }, { k: "image_url", l: "صورة (اختياري)", t: "image", folder: "achievements" }],
      sum: r => `${r.kind}${r.achieved_on ? " · " + r.achieved_on : ""}`, thumb: "image_url", note: "لا تنشر إلا إنجازات موثقة رسميًا." }
  };
  for (const c of Object.values(CFG)) { c.titleOf = c.titleOf || (r => r.title || r.name); window.ADM.sections.push({ table: c.table, title: c.title, tab: c.tab }); }

  /* ---------- رفع الملفات (آمن) ---------- */
  const IMG = ["image/jpeg", "image/png", "image/webp"];
  const DOC = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", [DOC[1]]: "docx", [DOC[2]]: "xlsx", [DOC[3]]: "pptx" };
  const userErr = m => Object.assign(new Error("upload"), { userMsg: m });
  async function sniff(file) {   // التحقق من توقيع الملف (لا يكفي الامتداد ولا النوع المعلن)
    const h = [...new Uint8Array(await file.slice(0, 12).arrayBuffer())].map(x => x.toString(16).padStart(2, "0")).join("");
    return h.startsWith("ffd8ff") ? "image/jpeg" : h.startsWith("89504e47") ? "image/png" : h.startsWith("52494646") && h.slice(16, 24) === "57454250" ? "image/webp" : h.startsWith("25504446") ? "application/pdf" : h.startsWith("504b0304") ? "zip" : null;
  }
  async function compress(file) {   // تصغير إلى 1600px وWebP: أسرع للطلاب، ويزيل بيانات EXIF (مثل الموقع الجغرافي)
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }), sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, "image/webp", .82)); if (blob && blob.type === "image/webp" && blob.size < file.size) return blob;
    } catch (e) {}
    return file;
  }
  const publicUrl = path => `${SB.url}/storage/v1/object/public/media/${path}`;
  const pathOf = url => (url && url.startsWith(publicUrl("")) ? url.slice(publicUrl("").length) : null);
  async function uploadFile(file, kind, folder) {
    const allowed = kind === "image" ? IMG : DOC, max = kind === "image" ? 8 : 10;
    if (!allowed.includes(file.type)) throw userErr(kind === "image" ? "الصور المسموحة: JPG أو PNG أو WebP." : "الملفات المسموحة: PDF أو Word (docx) أو Excel (xlsx) أو PowerPoint (pptx).");
    if (file.size > max * 1048576) throw userErr(`الحجم الأقصى ${max}MB.`);
    const sig = await sniff(file); if (!(sig === file.type || (sig === "zip" && DOC.slice(1).includes(file.type)))) throw userErr("محتوى الملف لا يطابق نوعه. اختر ملفًا صالحًا.");
    const blob = kind === "image" ? await compress(file) : file, path = `${folder}/${crypto.randomUUID()}.${EXT[blob.type]}`, token = await SB.token();
    let r; try { r = await fetch(`${SB.url}/storage/v1/object/media/${path}`, { method: "POST", headers: { apikey: SB.key, Authorization: `Bearer ${token}`, "Content-Type": blob.type, "Cache-Control": "max-age=31536000" }, body: blob }); } catch (e) { throw userErr("تعذّر رفع الملف. تحقق من الاتصال."); }
    if (!r.ok) throw userErr(r.status === 401 || r.status === 403 ? "ليست لديك صلاحية رفع الملفات." : r.status === 413 ? "الملف كبير جدًا." : r.status === 404 ? "حاوية الملفات media غير موجودة (نفّذ الترحيل 002)." : "رفض الخادم هذا الملف.");
    return publicUrl(path);
  }
  const removeFile = async url => { const p = pathOf(url); if (p) { try { const t = await SB.token(); await fetch(`${SB.url}/storage/v1/object/media/${p}`, { method: "DELETE", headers: { apikey: SB.key, Authorization: `Bearer ${t}` } }); } catch (e) {} } };

  /* ---------- نموذج الإضافة/التعديل ---------- */
  function fieldHTML(f, v) {
    const lbl = `${esc(f.l)}${f.req ? " *" : ""}`;
    if (f.t === "textarea") return `<label class="f">${lbl}<textarea name="${f.k}" rows="3" ${f.max ? `maxlength="${f.max}"` : ""}>${esc(v)}</textarea></label>`;
    if (f.t === "select") return `<label class="f">${lbl}<select name="${f.k}">${f.opts.map(([val, l]) => `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    if (f.t === "number") return `<label class="f">${lbl}<input name="${f.k}" type="number" min="-9999" max="9999" value="${esc(v ?? 0)}"></label>`;
    if (f.t === "date") return `<label class="f">${lbl}<input name="${f.k}" type="date" value="${esc(v || "")}"></label>`;
    if (f.t === "image" || f.t === "file") {
      const acc = f.t === "image" ? IMG.join(",") : DOC.join(","), max = f.t === "image" ? 8 : 10;
      return `<div class="f upl"><span>${lbl}</span>${v ? `<div class="upl__cur">${f.t === "image" ? `<img class="thumb" src="${esc(v)}" alt="" referrerpolicy="no-referrer">` : ""}<a class="link" href="${esc(v)}" target="_blank" rel="noopener">الملف الحالي</a>${f.req ? "" : `<label class="f f--chk"><input type="checkbox" name="${f.k}__rm"> إزالته</label>`}</div>` : ""}
        <input type="file" name="${f.k}__file" accept="${acc}"><small>${f.t === "image" ? "JPG / PNG / WebP — تُصغَّر تلقائيًا إلى 1600px" : "PDF / DOCX / XLSX / PPTX"} · حتى ${max}MB</small></div>`;
    }
    return `<label class="f">${lbl}<input name="${f.k}" type="text" ${f.max ? `maxlength="${f.max}"` : ""} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} value="${esc(v)}"></label>`;
  }
  async function form(cfg, row) {
    const d = row || {}; const def = { kind: cfg.fields.find(f => f.k === "kind")?.opts?.[0]?.[0] };
    return modal({ title: `${row ? "تعديل" : "إضافة"} ${cfg.one}`, wide: true, body: cfg.fields.map(f => fieldHTML(f, d[f.k] ?? def[f.k] ?? "")).join("") + `<label class="f">الحالة<select name="status"><option value="draft" ${!row || d.status === "draft" ? "selected" : ""}>مسودة (غير ظاهرة للزوار)</option><option value="published" ${d.status === "published" ? "selected" : ""}>منشور</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>مؤرشف</option></select></label>${cfg.note ? `<p class="note">${esc(cfg.note)}</p>` : ""}`,
      onSubmit: async (f, fail) => {
        const body = {}, stale = [];
        for (const fl of cfg.fields) {
          if (fl.t === "image" || fl.t === "file") {
            const file = f.elements[fl.k + "__file"].files[0], rm = f.elements[fl.k + "__rm"] && f.elements[fl.k + "__rm"].checked;
            if (file) { body[fl.k] = await uploadFile(file, fl.t, fl.folder); if (d[fl.k]) stale.push(d[fl.k]); }
            else if (rm) { body[fl.k] = null; if (d[fl.k]) stale.push(d[fl.k]); } else if (row) body[fl.k] = d[fl.k] ?? null; else body[fl.k] = null;
            if (fl.req && !body[fl.k]) return fail(`${fl.l} مطلوب.`);
          } else {
            let v = f.elements[fl.k].value.trim();
            if (fl.req && !v) return fail(`${fl.l} مطلوب.`);
            if (fl.t === "number") v = v === "" ? 0 : Math.trunc(Number(v)); else if (fl.t === "date" || fl.t === "textarea" || (fl.t === "text" && !fl.req)) v = v || null;
            if (fl.t === "number" && (!Number.isFinite(v) || Math.abs(v) > 9999)) return fail("الترتيب رقم بين -9999 و9999.");
            body[fl.k] = v;
          }
        }
        body.status = f.elements.status.value;
        if (cfg.needsFileToPublish && body.status === "published" && !body[cfg.needsFileToPublish]) return fail("ارفع الملف قبل نشر هذا المورد (أو احفظه كمسودة).");
        if (row) await db(`${cfg.table}?id=eq.${Q(row.id)}`, { method: "PATCH", body }); else await db(cfg.table, { method: "POST", body });
        stale.forEach(removeFile); toast("تم الحفظ بنجاح.");
      } });
  }

  /* ---------- العرض العام للقسم ---------- */
  function view(root, cfg) {
    let rows = [], more = false;
    root.innerHTML = `<div class="head"><h1>${esc(cfg.title)}</h1><button class="btn btn--primary btn--sm" data-add>${ADM.svg("plus")}<span>إضافة ${esc(cfg.one)}</span></button></div>${cfg.note ? `<p class="note">${esc(cfg.note)}</p>` : ""}
      <div class="tools-row"><input type="search" data-q placeholder="بحث…" aria-label="بحث"><select data-st aria-label="الحالة"><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select></div><div data-list><p>جارٍ التحميل…</p></div>`;
    const list = root.querySelector("[data-list]"), qEl = root.querySelector("[data-q]"), stEl = root.querySelector("[data-st]");
    async function load(append = false) {
      const q = qEl.value.replace(/[*%,()]/g, " ").trim(), st = stEl.value, off = append ? rows.length : 0;
      let path = `${cfg.table}?select=*&order=${cfg.order || "created_at.desc"}&limit=${PAGE + 1}&offset=${off}`;
      if (q) path += `&${cfg.search}=ilike.*${Q(q)}*`; if (st) path += `&status=eq.${st}`;
      try {
        const b = await db(path); more = b.length > PAGE; rows = (append ? rows : []).concat(b.slice(0, PAGE));
        list.innerHTML = rows.length ? rows.map(r => `<article class="arow">${cfg.thumb && r[cfg.thumb] ? `<img class="thumb" src="${esc(r[cfg.thumb])}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<div class="arow__m"><b>${esc(cfg.titleOf(r))}</b><small>${esc(cfg.sum(r))} · آخر تعديل: ${fmt(r.updated_at)}</small></div>
          <span class="tag st-${esc(r.status)}">${ST[r.status] || esc(r.status)}</span><div class="arow__a"><button data-cms="edit" data-id="${esc(r.id)}">تعديل</button>
          ${r.status === "published" ? `<button data-cms="draft" data-id="${esc(r.id)}">إلغاء النشر</button>` : `<button data-cms="published" data-id="${esc(r.id)}">نشر</button>`}${r.status !== "archived" ? `<button data-cms="archived" data-id="${esc(r.id)}">أرشفة</button>` : ""}<button class="del" data-cms="delete" data-id="${esc(r.id)}">حذف</button></div></article>`).join("") + (more ? `<p class="center"><button class="btn btn--primary btn--sm" data-more type="button">تحميل المزيد</button></p>` : "")
          : `<p class="empty"><b>${q || st ? "لا توجد نتائج مطابقة" : "لا توجد عناصر بعد"}</b><small>${q || st ? "" : `اضغط «إضافة ${esc(cfg.one)}».`}</small></p>`;
      } catch (e) { if (e.code !== "SESSION_EXPIRED") { list.innerHTML = `<p class="msg" role="alert">${ADM.apiErr(e)} <button class="btn btn--sm btn--primary" data-retry>إعادة المحاولة</button></p>`; } }
    }
    let t; qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => load(), 300); }; stEl.onchange = () => load();
    root.onclick = async e => {
      if (e.target.closest("[data-add]")) { if (await form(cfg, null)) load(); return; }
      if (e.target.closest("[data-more]")) return load(true); if (e.target.closest("[data-retry]")) return load();
      const b = e.target.closest("[data-cms]"); if (!b) return; const r = rows.find(x => x.id === b.dataset.id), act = b.dataset.cms; if (!r) return;
      if (act === "edit") { if (await form(cfg, r)) load(); return; }
      try {
        if (act === "delete") { if (await confirmBox(`سيُحذف «${cfg.titleOf(r)}» نهائيًا ولا يمكن التراجع.`, "حذف نهائي", true)) { busy(b, true); await db(`${cfg.table}?id=eq.${Q(r.id)}`, { method: "DELETE" }); for (const f of cfg.fields) if ((f.t === "image" || f.t === "file") && r[f.k]) removeFile(r[f.k]); toast("تم الحذف."); load(); } return; }
        if (act === "published" && cfg.needsFileToPublish && !r[cfg.needsFileToPublish]) return toast("ارفع الملف أولًا (تعديل) ثم انشر.", true);
        busy(b, true); await db(`${cfg.table}?id=eq.${Q(r.id)}`, { method: "PATCH", body: { status: act } }); toast("تم تحديث الحالة."); load();
      } catch (er) { busy(b, false); if (er.code !== "SESSION_EXPIRED") toast(ADM.apiErr(er), true); }
    };
    load();
  }
  for (const key of ["resources", "teachers", "achievements"]) window.ADM.views[key] = root => view(root, CFG[key]);
  window.ADM.views.gallery = root => view(root, CFG.gallery_items);
  window.ADM.views.life = root => {
    root.innerHTML = `<div class="chips" id="lifeTabs"><button type="button" class="chip" data-k="activities" aria-pressed="true">الأنشطة</button><button type="button" class="chip" data-k="clubs" aria-pressed="false">الأندية</button></div><div id="lifeBox"></div>`;
    const show = k => { root.querySelectorAll("#lifeTabs .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.k === k)); view($("#lifeBox"), CFG[k]); };
    $("#lifeTabs").onclick = e => { const b = e.target.closest("[data-k]"); if (b) show(b.dataset.k); }; show("activities");
  };

  /* ---------- معلومات المؤسسة والتواصل ---------- */
  const SET = [["phone", "الهاتف", "tel", "مثال: 0539000000"], ["email", "البريد الإلكتروني", "email", ""], ["address", "العنوان", "text", "يُستعمل بدل «تارجيست – إقليم الحسيمة – المغرب» إن أُدخل"], ["facebook", "رابط Facebook", "url", "https://…"], ["instagram", "رابط Instagram", "url", "https://…"], ["youtube", "رابط YouTube", "url", "https://…"], ["website", "الموقع الرسمي", "url", "https://…"],
    ["maps_embed_url", "رابط تضمين الخريطة (Google Maps ← مشاركة ← تضمين خريطة ← انسخ قيمة src)", "url", "https://www.google.com/maps/embed?…"], ["about_text", "نص «عن المؤسسة»", "textarea", "فقرة تعريفية رسمية (اتركها فارغة لعدم العرض)"]];
  const SETVAL = { url: v => /^https:\/\/[^\s"'<>]+$/i.test(v) || "الرابط يجب أن يبدأ بـ https://", email: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || "بريد إلكتروني غير صالح", tel: v => /^[0-9+()\s.-]{6,25}$/.test(v) || "رقم هاتف غير صالح" };
  window.ADM.views.settings = async root => {
    root.innerHTML = "<p>جارٍ التحميل…</p>"; let cur = {};
    try { (await db("site_settings?select=key,value")).forEach(r => (cur[r.key] = r.value)); } catch (e) { if (e.code !== "SESSION_EXPIRED") root.innerHTML = `<p class="msg" role="alert">${ADM.apiErr(e)}</p>`; return; }
    root.innerHTML = `<div class="head"><h1>معلومات المؤسسة</h1></div><p class="note">تظهر هذه البيانات في قسم التواصل والتذييل وصفحة «عن المؤسسة». اترك الحقل فارغًا لعدم عرضه.</p>
      <form class="panel" id="setForm" novalidate>${SET.map(([k, l, t, ph]) => t === "textarea" ? `<label class="f">${esc(l)}<textarea name="${k}" rows="5" maxlength="4000" placeholder="${esc(ph)}">${esc(cur[k] || "")}</textarea></label>` : `<label class="f">${esc(l)}<input name="${k}" type="${t === "url" ? "text" : t}" ${t === "url" || t === "email" || t === "tel" ? 'dir="ltr"' : ""} maxlength="2000" placeholder="${esc(ph)}" value="${esc(cur[k] || "")}"></label>`).join("")}
        <p id="setMsg" class="msg" role="alert" hidden></p><div class="adlg__a"><button class="btn btn--primary" type="submit" id="setSave">حفظ</button></div></form>`;
    $("#setForm").onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target, msg = $("#setMsg"), up = [], del = [];
      for (const [k, l, t] of SET) {
        const v = f.elements[k].value.trim(); if (!v) { if (cur[k]) del.push(k); continue; }
        const chk = SETVAL[t] && SETVAL[t](v); if (chk !== undefined && chk !== true) { msg.hidden = false; msg.textContent = `${l}: ${chk}`; return; }
        if (k === "maps_embed_url" && !/^https:\/\/www\.google\.com\/maps\/embed/i.test(v)) { msg.hidden = false; msg.textContent = "رابط الخريطة يجب أن يكون رابط تضمين من Google Maps (يبدأ بـ https://www.google.com/maps/embed)."; return; }
        if (v !== cur[k]) up.push({ key: k, value: v });
      }
      msg.hidden = true; const b = $("#setSave"); busy(b, true);
      try {
        if (up.length) await db("site_settings?on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: up });
        if (del.length) await db(`site_settings?key=in.(${del.join(",")})`, { method: "DELETE" });
        up.forEach(r => (cur[r.key] = r.value)); del.forEach(k => delete cur[k]); toast(up.length || del.length ? "تم حفظ المعلومات." : "لا توجد تغييرات.");
      } catch (er) { if (er.code !== "SESSION_EXPIRED") { msg.hidden = false; msg.textContent = ADM.apiErr(er); } } finally { busy(b, false); }
    };
  };
})();
