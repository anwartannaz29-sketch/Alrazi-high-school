/* timetable-view.js — عرض استعمال الزمن (شبكة أسبوعية + قائمة يوم + طباعة). مشترك بين الموقع العام ولوحة الإدارة.
   كل النصوص تُهرَّب. المدخلات: tt {school_year, level, class_name, days[], notes}, periods[{slot_no,label,starts_at,ends_at,is_break}], entries[{day,slot_no,subject,teacher_name,room,note}] */
(() => {
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAYS = { 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت", 7: "الأحد" };
  const hm = t => String(t || "").slice(0, 5);
  const sorted = ps => [...ps].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const get = (es, day, slot) => es.find(e => e.day === day && e.slot_no === slot);
  const order = tt => [...tt.days].sort((a, b) => a - b);
  function cell(e) {
    if (!e) return '<span class="ttg__empty">—</span>';
    return `<b>${esc(e.subject)}</b>${e.teacher_name ? `<small>${esc(e.teacher_name)}</small>` : ""}${e.room ? `<small>${esc(e.room)}</small>` : ""}`;
  }
  function title(tt) { return `استعمال الزمن — ${esc(tt.level)} — ${esc(tt.class_name)} (${esc(tt.school_year)})`; }
  function gridHTML(tt, periods, entries) {
    const ps = sorted(periods), days = order(tt);
    if (!ps.length) return '<p class="empty"><b>لا توجد حصص معرّفة بعد</b></p>';
    let n = 0;
    const rows = ps.map(p => p.is_break
      ? `<tr class="ttg__break"><th scope="row">${esc(hm(p.starts_at))} – ${esc(hm(p.ends_at))}</th><td colspan="${days.length}">${esc(p.label || "استراحة")}</td></tr>`
      : `<tr><th scope="row"><span>${esc(p.label || "الحصة " + ++n)}</span><small>${esc(hm(p.starts_at))} – ${esc(hm(p.ends_at))}</small></th>${days.map(d => `<td>${cell(get(entries, d, p.slot_no))}</td>`).join("")}</tr>`);
    return `<table class="ttg"><caption class="sr">${title(tt)}</caption><thead><tr><th scope="col">الوقت</th>${days.map(d => `<th scope="col">${DAYS[d]}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>${tt.notes ? `<p class="ttg__note">${esc(tt.notes)}</p>` : ""}`;
  }
  function dayHTML(tt, periods, entries, day) {
    const ps = sorted(periods); let n = 0, any = false;
    const items = ps.map(p => {
      if (p.is_break) return `<li class="ss ss--break"><div class="ss__t"><b>${esc(hm(p.starts_at))} – ${esc(hm(p.ends_at))}</b></div><div class="ss__m">${esc(p.label || "استراحة")}</div></li>`;
      n++; const e = get(entries, day, p.slot_no); if (e) any = true;
      return `<li class="ss ${e ? "" : "ss--empty"}"><div class="ss__t"><b>${esc(hm(p.starts_at))} – ${esc(hm(p.ends_at))}</b><small>${esc(p.label || "الحصة " + n)}</small></div><div class="ss__m">${e ? `<b>${esc(e.subject)}</b><small>${[e.teacher_name, e.room].filter(Boolean).map(esc).join(" · ")}</small>` : "<small>لا توجد مادة</small>"}</div></li>`;
    });
    return { html: items.join(""), any };
  }
  /* طباعة / حفظ PDF من نافذة الطباعة في المتصفح (A4 أفقي). */
  function print(tt, periods, entries) {
    document.getElementById("ttPrint")?.remove();
    const d = document.createElement("div"); d.id = "ttPrint";
    d.innerHTML = `<h1>الثانوية التأهيلية الرازي — تارجيست</h1><h2>${title(tt)}</h2>${gridHTML(tt, periods, entries)}<p class="ttg__foot">${esc(new Date().toLocaleDateString("ar-MA-u-nu-latn"))}</p>`;
    document.body.append(d); document.body.classList.add("print-tt");
    const done = () => { document.body.classList.remove("print-tt"); d.remove(); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
  }
  window.TT = { DAYS, hm, sorted, gridHTML, dayHTML, print, title, esc };
})();
