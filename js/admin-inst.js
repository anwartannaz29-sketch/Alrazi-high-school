/* admin-inst.js (V10) — «إحصائيات المؤسسة والأطر»: إحصائيات رسمية، الأقسام والمسالك، فئات الأطر، ملفات الأطر مع صورها.
   يبني على محرّك admin-cms.js (CRUD + بحث + حالات + أرشفة + حذف نهائي بتأكيد). الصلاحيات الفعلية في RLS وسياسات Storage (الترحيل 004)؛ هذا واجهة فقط.
   الصور: حاوية staff-photos الخاصة — تحقق من النوع والتوقيع والحجم (≤2MB)، قصّ 4:5 وتحويل WebP بمقاس 600×750، رفع الجديدة أولًا ثم حذف القديمة بعد نجاح الحفظ. */
(() => {
  const { $, esc, db, toast } = window.ADM, { view, T, A, Sel, userErr, sniff } = window.ADM.cms, Q = encodeURIComponent;
  const BUCKET = "staff-photos", MAXIN = 2 * 1048576, W = 600, H = 750, TARGET = 180 * 1024;
  const KIND = [["students", "عدد التلاميذ"], ["classes", "عدد الأقسام"], ["staff", "عدد الأطر التربوية والإدارية"], ["custom", "إحصائية أخرى"]];
  const KIND_LABEL = { students: ["عدد التلاميذ", "Élèves"], classes: ["عدد الأقسام", "Classes"], staff: ["الأطر التربوية والإدارية", "Équipe pédagogique et administrative"] };
  const NUM = (k, l, o = {}) => ({ k, l, t: "number", ...o }), CHK = (k, l) => ({ k, l, t: "check" });

  /* ---------- صور الأطر ---------- */
  const cache = new WeakMap();
  async function prepare(file) {
    if (cache.has(file)) return cache.get(file);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw userErr("الصور المسموحة: JPG أو PNG أو WebP (لا SVG ولا ملفات أخرى).");
    if (file.size > MAXIN) throw userErr("الحجم الأقصى للصورة قبل الضغط 2MB.");
    if ((await sniff(file)) !== file.type) throw userErr("محتوى الملف لا يطابق نوعه. اختر صورة صالحة.");
    let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { throw userErr("تعذّر قراءة الصورة. اختر صورة أخرى."); }
    const sc = Math.max(W / bmp.width, H / bmp.height), sw = W / sc, sh = H / sc, sx = (bmp.width - sw) / 2, sy = Math.max(0, (bmp.height - sh) * 0.2);   // قصّ 4:5 مع ميل للأعلى (الوجه)
    const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
    let blob = null;
    for (const q of [0.82, 0.74, 0.66, 0.58, 0.5]) { blob = await new Promise(r => c.toBlob(r, "image/webp", q)); if (!blob || blob.type !== "image/webp") throw userErr("هذا المتصفح لا يدعم تحويل الصور إلى WebP. استعمل متصفحًا حديثًا."); if (blob.size <= TARGET) break; }
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const out = { blob, url }; cache.set(file, out); return out;
  }
  const auth = async () => ({ apikey: SB.key, Authorization: `Bearer ${await SB.token()}` });
  const PH = {
    prepare,
    async put(id, file) {
      const { blob } = await prepare(file), path = `${id}/profile-${Math.floor(Date.now() / 1000)}.webp`;
      let r; try { r = await fetch(`${SB.url}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...(await auth()), "Content-Type": "image/webp", "Cache-Control": "max-age=3600" }, body: blob }); } catch (e) { throw userErr("تعذّر رفع الصورة. تحقق من الاتصال."); }
      if (!r.ok) throw userErr(r.status === 401 || r.status === 403 ? "ليست لديك صلاحية رفع الصور." : r.status === 404 ? "حاوية staff-photos غير موجودة (نفّذ الترحيل 004)." : r.status === 413 ? "الصورة كبيرة جدًا." : "رفض الخادم هذه الصورة.");
      return path;
    },
    async remove(path) { if (!path) return; try { await fetch(`${SB.url}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: await auth() }); } catch (e) {} },
  };
  async function signer(paths) {   // روابط موقّعة قصيرة العمر (الحاوية خاصة)
    const out = {}; if (!paths.length) return out;
    const r = await fetch(`${SB.url}/storage/v1/object/sign/${BUCKET}`, { method: "POST", headers: { ...(await auth()), "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600, paths }) });
    if (!r.ok) return out; const j = await r.json().catch(() => []);
    (Array.isArray(j) ? j : []).forEach(x => { if (x && x.path && x.signedURL && !x.error) out[x.path] = SB.url + (x.signedURL.startsWith("/storage/v1") ? "" : "/storage/v1") + x.signedURL; });
    return out;
  }

  /* ---------- الأقسام (أوصاف الحقول) ---------- */
  let cats = [];
  const loadCats = async () => { cats = await db("staff_categories?select=id,name,status&status=neq.archived&order=sort_order.asc,name.asc&limit=100"); };
  const catName = id => (cats.find(c => c.id === id) || {}).name || "بلا فئة";
  const CFG = {
    stats: { table: "school_statistics", title: "إحصائيات المؤسسة", one: "إحصائية", search: "label", order: "sort_order.asc,created_at.asc",
      note: "هذه أرقام رسمية تُدخلها أنت ولا تُحسب آليًا. لا تظهر للزوار إلا بعد تفعيل «أؤكد أنه رسمي» ونشرها.",
      fields: [Sel("kind", "النوع", KIND, { req: 1 }), T("label", "العنوان بالعربية", { req: 1, max: 80 }), T("label_fr", "العنوان بالفرنسية (اختياري)", { max: 80 }), NUM("value", "الرقم", { req: 1, min: 0, max: 100000 }), { k: "as_of", l: "تاريخ آخر تحديث", t: "date" }, CHK("official_confirmed", "أؤكد أن هذا الرقم رسمي ومعتمد من إدارة المؤسسة"), NUM("sort_order", "ترتيب العرض (رقم أصغر = أولًا)")],
      titleOf: r => r.label, sum: r => `${r.value}${r.as_of ? " · آخر تحديث: " + r.as_of : ""}${r.official_confirmed ? "" : " · غير مؤكد رسميًا"}`,
      validate: b => (b.status === "published" && !b.official_confirmed ? "لا يمكن نشر رقم غير مؤكد رسميًا. فعّل خانة التأكيد أو احفظه كمسودة." : null),
      onOpen(dlg) { const k = dlg.querySelector('[name="kind"]'), l = dlg.querySelector('[name="label"]'), lf = dlg.querySelector('[name="label_fr"]'); k.addEventListener("change", () => { const d = KIND_LABEL[k.value]; if (d && !l.value.trim()) { l.value = d[0]; if (!lf.value.trim()) lf.value = d[1]; } }); },
      async extra(box) {   // تنبيه فقط — لا يغيّر القيمة الرسمية أبدًا
        try {
          const [st, cl, sf] = await Promise.all([db("school_statistics?select=kind,value,status&status=neq.archived&kind=neq.custom"), db("school_classes?select=students_count&status=eq.published&limit=1000"), db("staff_profiles?select=id&status=eq.published&limit=1000")]);
          const get = k => (st.find(x => x.kind === k && x.status === "published") || st.find(x => x.kind === k)), msg = [];
          const sum = cl.reduce((a, x) => a + (x.students_count || 0), 0), withN = cl.filter(x => x.students_count != null).length;
          if (get("students") && withN && sum !== get("students").value) msg.push(`الرقم المسجّل لعدد التلاميذ (${get("students").value}) يختلف عن مجموع تلاميذ الأقسام المنشورة (${sum}).`);
          if (get("classes") && cl.length !== get("classes").value) msg.push(`الرقم المسجّل لعدد الأقسام (${get("classes").value}) يختلف عن عدد الأقسام المنشورة (${cl.length}).`);
          if (get("staff") && sf.length && sf.length !== get("staff").value) msg.push(`الرقم المسجّل للأطر (${get("staff").value}) يختلف عن عدد ملفات الأطر المنشورة (${sf.length}).`);
          box.innerHTML = msg.length ? `<div class="warnbox" role="status"><b>تنبيه: اختلاف بين الأرقام الرسمية والسجلات التفصيلية</b><ul>${msg.map(m => `<li>${esc(m)}</li>`).join("")}</ul><small>لم يتغير أي رقم رسمي. قد يكون الاختلاف طبيعيًا (سجلات غير مكتملة)؛ راجعها ثم عدّل ما يلزم بنفسك.</small></div>` : "";
        } catch (e) { box.innerHTML = ""; }
      } },
    classes: { table: "school_classes", title: "الأقسام والمسالك", one: "قسم", search: "name", order: "sort_order.asc,name.asc",
      note: "أدخل الأقسام الفعلية للمؤسسة فقط. الأمثلة في الحقول للتوضيح، وليست قائمة جاهزة.",
      fields: [T("level", "المستوى الدراسي (عربي)", { req: 1, max: 60, ph: "مثال: الجذع المشترك" }), T("level_fr", "المستوى (فرنسي)", { max: 60 }), T("track", "الشعبة / المسلك (عربي)", { max: 80 }), T("track_fr", "الشعبة / المسلك (فرنسي)", { max: 80 }), T("name", "اسم القسم (عربي)", { req: 1, max: 80 }), T("name_fr", "اسم القسم (فرنسي)", { max: 80 }), T("code", "رمز القسم", { max: 20 }),
        A("description", "وصف اختياري (عربي)", { max: 600 }), A("description_fr", "وصف اختياري (فرنسي)", { max: 600 }), NUM("students_count", "عدد التلاميذ (اختياري)", { min: 0, max: 500, nullable: true }), NUM("sort_order", "ترتيب العرض")],
      titleOf: r => r.name, sum: r => `${r.level}${r.track ? " · " + r.track : ""}${r.students_count != null ? " · " + r.students_count + " تلميذ" : ""}` },
    staff_categories: { table: "staff_categories", title: "فئات الأطر", one: "فئة", search: "name", order: "sort_order.asc,name.asc",
      note: "الفئات الأولية هيكلية ويمكنك تعديلها أو إضافة فئات. لحذف فئة مستعملة انقل أطرها إلى فئة أخرى أولًا (أو أرشفها).",
      fields: [T("name", "اسم الفئة (عربي)", { req: 1, max: 60 }), T("name_fr", "اسم الفئة (فرنسي)", { max: 60 }), NUM("sort_order", "ترتيب العرض")],
      titleOf: r => r.name, sum: r => r.name_fr || "—" },
    staff: { table: "staff_profiles", title: "الأطر التربوية والإدارية", one: "مؤطر", search: "full_name", order: "sort_order.asc,full_name.asc", thumbPath: "photo_path", signer,
      note: "لا تنشر صورة أو معلومات أي مؤطر دون موافقته وموافقة المؤسسة. لا تستعمل صورًا عشوائية أو مولّدة.",
      async prepare() { await loadCats(); CFG.staff.fields.find(f => f.k === "category_id").opts = [["", "— اختر الفئة —"], ...cats.map(c => [c.id, c.name])]; },
      fields: [T("full_name", "الاسم الكامل", { req: 1, max: 120 }), T("job_title", "الوظيفة أو الصفة (عربي)", { max: 100 }), T("job_title_fr", "الوظيفة (فرنسي)", { max: 100 }), T("specialty", "التخصص أو المادة (عربي)", { max: 100 }), T("specialty_fr", "التخصص (فرنسي)", { max: 100 }),
        Sel("category_id", "الفئة", [["", "— اختر الفئة —"]], { nullable: true }), T("department", "القسم أو المجال (اختياري، عربي)", { max: 100 }), T("department_fr", "القسم أو المجال (فرنسي)", { max: 100 }),
        A("bio", "نبذة تعريفية (عربي)", { max: 1200 }), A("bio_fr", "نبذة تعريفية (فرنسي)", { max: 1200 }), { k: "photo_path", l: "الصورة الشخصية (اختياري)", t: "photo", handler: PH },
        CHK("consent_confirmed", "أؤكد موافقة المؤطر والمؤسسة على نشر اسمه وصورته ومعلوماته"), NUM("sort_order", "ترتيب الظهور (رقم أصغر = أولًا)")],
      titleOf: r => r.full_name, sum: r => `${catName(r.category_id)} · ${r.job_title || "—"}${r.photo_path ? "" : " · بلا صورة"}${r.consent_confirmed ? "" : " · بلا موافقة"}`,
      validate: b => (b.status !== "published" ? null : !b.consent_confirmed ? "لا يمكن نشر ملف دون تأكيد موافقة المؤطر والمؤسسة." : !b.category_id ? "اختر فئة المؤطر قبل النشر." : null),
      async onOpen(dlg, d) {
        const box = dlg.querySelector("[data-photo]"), img = box.querySelector("img"), cur = box.querySelector("[data-pcur]"), inp = box.querySelector('input[type="file"]'), info = box.querySelector("[data-pinfo]");
        if (d.photo_path) signer([d.photo_path]).then(m => { if (m[d.photo_path] && !inp.files[0]) { img.src = m[d.photo_path]; img.hidden = false; } }).catch(() => {});
        inp.addEventListener("change", async () => {
          info.hidden = true; const f = inp.files[0]; if (!f) return;
          try { const p = await prepare(f); img.src = p.url; img.hidden = false; cur.hidden = false; info.hidden = false; info.textContent = `معاينة بعد الضغط: ${Math.round(p.blob.size / 1024)}KB · ${W}×${H} WebP`; }
          catch (e) { inp.value = ""; info.hidden = false; info.textContent = e.userMsg || "تعذّر قراءة الصورة."; }
        });
      } }
  };
  for (const [k, mig] of [["stats", 0], ["classes", 0], ["staff_categories", 0], ["staff", 0]]) window.ADM.sections.push({ table: CFG[k].table, title: CFG[k].title, tab: "inst", mig: "004" });

  window.ADM.views.inst = async root => {
    root.innerHTML = "<p>جارٍ التحميل…</p>";
    try { await db("school_statistics?select=id&limit=1"); } catch (e) {
      if (e.code === "SESSION_EXPIRED") return;
      root.innerHTML = `<p class="msg" role="alert">${e.status === 404 || (e.detail && /PGRST205|42P01/.test(e.detail.code || "")) ? "هذا القسم غير مفعّل بعد: نفّذ الترحيل 004_institution_profiles.sql في Supabase (SQL Editor)." : window.ADM.apiErr(e)}</p>`; return;
    }
    root.innerHTML = `<div class="head"><h1>إحصائيات المؤسسة والأطر</h1></div><div class="chips" id="instTabs">${[["stats", "إحصائيات المؤسسة"], ["classes", "الأقسام والمسالك"], ["staff", "الأطر التربوية والإدارية"], ["staff_categories", "فئات الأطر"]].map(([k, l], i) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div><div id="instBox"></div>`;
    const show = k => { root.querySelectorAll("#instTabs .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.k === k)); view($("#instBox"), CFG[k]); };
    $("#instTabs").onclick = e => { const b = e.target.closest("[data-k]"); if (b) show(b.dataset.k); }; show("stats");
  };
})();
