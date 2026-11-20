/* hero.js (V8) — تجربة الـ Hero: شريط الرازي الأزرق ثلاثي الأبعاد + نص متناسق + شعار 3D.
   الشريط ينتمي إلى هذا القسم فقط: يُرسم في canvas داخل .hero__stage، ويختفي كليًا قبل نهاية القسم الأول.
   المعمارية (طبقات): State (تقدّم التمرير والمؤشر والثيم) ← Scene (هندسة الشريط والإطارات) ← Renderer (Canvas 2D) ← DOM (متغيرات CSS للنص والشعار).
   حلقة rAF واحدة، تتوقف خارج الرؤية وعند إخفاء التبويب، وتخفّض الدقة تلقائيًا إن تأخرت الإطارات.
   بدون مكتبات: Canvas 2D بإسقاط منظوري وتظليل بيئي (reflection) لإحساس معدني زجاجي، بكلفة منخفضة على الهاتف. */
(() => {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const root = document.documentElement, cv = document.getElementById("ribbon"), ctx = cv.getContext("2d");
  const stage = hero.querySelector(".hero__stage"), logo = document.getElementById("logo3d");
  const RM = matchMedia("(prefers-reduced-motion: reduce)"), MOBILE = matchMedia("(max-width: 899px)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ---------- 1) نص الـ Hero: تقسيم الكلمات ---------- */
  const R = window.RAZI || {};
  function splitWords() {
    const fr = root.lang === "fr", name = fr ? (R.site && R.site.nameFr) || "Lycée Qualifiant Al-Razi" : (R.site && R.site.nameAr) || "الثانوية التأهيلية الرازي";
    const h1 = document.getElementById("heroH1"), host = h1.querySelector("[data-words]");
    h1.setAttribute("aria-label", name); h1.lang = fr ? "fr" : "ar";
    host.innerHTML = name.split(/\s+/).map((w, i) => `<span class="wm"><span class="w" style="--i:${i}" aria-hidden="true">${w}</span></span>`).join(" ");
    document.querySelectorAll("#heroEdit .w").forEach((w, i) => w.style.setProperty("--i", i + 3));
  }
  splitWords();
  addEventListener("razi:lang", splitWords);

  /* ---------- 2) الحالة ---------- */
  const S = { p: 0, ps: 0, t: 0, W: 0, H: 0, dpr: 1, dark: root.dataset.theme === "dark", on: true, mobile: MOBILE.matches, mx: 0, my: 0, rx: 0, ry: 0, N: 130, slow: 0, frames: 0, acc: 0 };
  const navH = () => (document.getElementById("header") ? document.getElementById("header").offsetHeight : 64);
  function readScroll() {
    if (RM.matches) { S.p = 0; return; }
    const r = hero.getBoundingClientRect(), span = hero.offsetHeight - stage.offsetHeight;
    S.p = span > 0 ? clamp((navH() - r.top) / span) : 0;
  }
  function resize() {
    S.mobile = MOBILE.matches;
    const r = cv.getBoundingClientRect(); S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    const cap = S.mobile ? 1.25 : 1.6; S.dpr = Math.min(window.devicePixelRatio || 1, S.slow ? 1 : cap);
    cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr); ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    S.N = S.slow ? (S.mobile ? 56 : 80) : (S.mobile ? 84 : 130);
    alloc(); draw(true);
  }

  /* ---------- 3) الهندسة ---------- */
  let X, Y, Z, WX, WY, WZ, NX, NY, NZ, HW, ORD;
  function alloc() { const n = S.N + 1; [X, Y, Z, WX, WY, WZ, NX, NY, NZ, HW] = Array.from({ length: 10 }, () => new Float32Array(n)); ORD = Array.from({ length: S.N }, (_, i) => i); }
  const F = 900;   // البعد البؤري (px) للإسقاط المنظوري

  /* وضعية الشريط عند المعلمة s (0..1) — نقطة المركز ثلاثية الأبعاد في فضاء canvas */
  function pose(s, ps, t, q, out) {
    const W = S.W, H = S.H, mob = S.mobile;
    const ph = t * 0.33 + ps * 6.2 + S.mx * 0.4;
    const cx0 = (mob ? W * 0.84 : W * 0.72) - ps * (mob ? W * 0.04 : W * 0.10);
    const ampX = mob ? W * 0.085 : W * 0.12;
    let x = cx0 + ampX * (0.62 * Math.sin(s * 4.6 + ph) + 0.22 * Math.sin(s * 9.7 - ph * 1.3 + 1.9));
    let y = lerp(-0.34 * H, 1.34 * H, s) + 0.035 * H * Math.sin(s * 7 + ph * 0.8) - ps * 0.10 * H;
    let z = 0.20 * H * Math.cos(s * 3.9 + ph * 0.8) + 0.06 * H * Math.sin(s * 8.5 - ph);
    if (q > 0) {   // نهاية الـ Hero: ينحني، يتقلّص، ويهبط نحو المشهد التالي
      const k = 1 - 0.97 * q, ax = cx0, ay = H * 1.02;
      x = ax + (x - ax) * k + Math.sin(s * Math.PI) * W * 0.09 * q;
      y = ay + (y - ay) * k + q * q * H * 0.42;
      z *= k;
    }
    out[0] = x; out[1] = y; out[2] = z;
  }

  const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
  function build(ps, t, q) {
    const N = S.N, s0 = q * 0.5, base = S.mobile ? S.W * 0.07 : Math.min(S.H * 0.078, S.W * 0.14), widthK = 1 - 0.85 * q;
    for (let i = 0; i <= N; i++) {
      const s = lerp(s0, 1, i / N);
      pose(s, ps, t, q, tmp); X[i] = tmp[0]; Y[i] = tmp[1]; Z[i] = tmp[2];
      HW[i] = base * widthK * (0.72 + 0.42 * (0.5 + 0.5 * Math.sin(s * 6.1 + 1.3 + t * 0.2))) * sstep(0, 0.035, i / N + 0.012) * sstep(0, 0.035, 1 - i / N + 0.012);
    }
    for (let i = 0; i <= N; i++) {   // إطار (tangent / width / normal) لكل نقطة
      const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
      let tx = X[b] - X[a], ty = Y[b] - Y[a], tz = Z[b] - Z[a]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // مرجع العرض: المحور X مُسقَطًا عموديًا على المماس
      let ux = 1 - tx * tx, uy = -tx * ty, uz = -tx * tz; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux;   // B = T × U
      const s = lerp(s0, 1, i / N), th = 0.95 * Math.sin(s * 3.7 + t * 0.3 + ps * 5.5) + 0.4 * Math.sin(s * 8.3 - t * 0.4) + 0.3, c = Math.cos(th), sn = Math.sin(th);
      WX[i] = c * ux + sn * bx; WY[i] = c * uy + sn * by; WZ[i] = c * uz + sn * bz;
      NX[i] = -sn * ux + c * bx; NY[i] = -sn * uy + c * by; NZ[i] = -sn * uz + c * bz;
    }
  }

  /* ---------- 4) التظليل: انعكاس بيئي أزرق/كريمي ---------- */
  const PAL = {
    dark:  { deep: [14, 44, 170], elec: [38, 100, 255], sky: [140, 184, 255], hi: [255, 246, 218] },
    light: { deep: [10, 46, 190], elec: [30, 92, 250], sky: [120, 168, 255], hi: [255, 252, 238] }
  };
  const LX = -0.38, LY = -0.62, LZ = 0.69;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function shade(nx, ny, nz, back) {
    const P = S.dark ? PAL.dark : PAL.light, az = Math.abs(nz);
    // انعكاس شعاع النظر (0,0,-1) على السطح
    const rx = 2 * az * nx, ry = 2 * az * ny, rz = -1 + 2 * az * az;
    const u = clamp(0.5 + 0.5 * ry), band = 0.5 + 0.5 * Math.sin((ry * 2.3 + rx * 1.5) * 3.1 + 0.6);
    let c = mix(P.deep, P.elec, sstep(0.05, 0.85, u));
    c = mix(c, P.sky, 0.5 * band * band * sstep(0.25, 0.9, u));
    const spec = Math.pow(clamp(rx * LX + ry * LY + rz * LZ), 26);
    c = mix(c, P.hi, clamp(spec * 0.95));
    c = mix(c, P.sky, 0.5 * Math.pow(1 - az, 2.4));   // حافة مضيئة (fresnel)
    const k = back ? 0.84 : 1;
    return `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;
  }

  /* ---------- 5) الرسم ---------- */
  function draw(force) {
    if (!S.W) return;
    const q = sstep(0.70, 0.975, S.ps), alpha = 1 - sstep(0.94, 0.995, S.ps);
    ctx.clearRect(0, 0, S.W, S.H);
    if (alpha <= 0.002) return;
    build(S.ps, S.t, q);
    const N = S.N, H0 = S.W * 0.5, H1 = S.H * 0.5;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = "round";
    // إسقاط منظوري
    const px = new Float32Array((N + 1) * 4), pz = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const sc = F / (F - Z[i]), hx = WX[i] * HW[i], hy = WY[i] * HW[i], hz = WZ[i] * HW[i];
      const sl = F / (F - (Z[i] - hz)), sr = F / (F - (Z[i] + hz));
      px[i * 4] = H0 + (X[i] - hx - H0) * sl; px[i * 4 + 1] = H1 + (Y[i] - hy - H1) * sl;
      px[i * 4 + 2] = H0 + (X[i] + hx - H0) * sr; px[i * 4 + 3] = H1 + (Y[i] + hy - H1) * sr; pz[i] = Z[i] + 0 * sc;
    }
    ORD.sort((a, b) => (Z[a] + Z[a + 1]) - (Z[b] + Z[b + 1]));   // الأبعد أولًا (z موجب = أقرب للمشاهد)
    for (let k = 0; k < N; k++) {
      const i = ORD[k], j = i + 1;
      let nx = (NX[i] + NX[j]) * 0.5, ny = (NY[i] + NY[j]) * 0.5, nz = (NZ[i] + NZ[j]) * 0.5; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const back = nz < 0; if (back) { nx = -nx; ny = -ny; nz = -nz; }
      const wx = (WX[i] + WX[j]) * 0.5, wy = (WY[i] + WY[j]) * 0.5, wz = (WZ[i] + WZ[j]) * 0.5;
      const mk = (m) => { const ax = nx + wx * m, ay = ny + wy * m, az = nz + wz * m, l = Math.hypot(ax, ay, az) || 1; return shade(ax / l, ay / l, az / l, back); };
      const cl = mk(-0.55), cm = shade(nx, ny, nz, back), cr = mk(0.55);
      const x0 = px[i * 4], y0 = px[i * 4 + 1], x1 = px[i * 4 + 2], y1 = px[i * 4 + 3], x2 = px[j * 4 + 2], y2 = px[j * 4 + 3], x3 = px[j * 4], y3 = px[j * 4 + 1];
      const g = ctx.createLinearGradient((x0 + x3) / 2, (y0 + y3) / 2, (x1 + x2) / 2, (y1 + y2) / 2);
      g.addColorStop(0, cl); g.addColorStop(0.5, cm); g.addColorStop(1, cr);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.stroke();
      // سماكة الحافة: خيط داكن على الحافة التي يراها المشاهد
      const th = HW[i] * 0.10 * (1 - Math.abs(nz) * 0.5);
      if (th > 1.2) { ctx.strokeStyle = "rgba(6,22,100,.5)"; ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x3, y3); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    }
    ctx.restore();
  }

  /* ---------- 6) DOM: متغيرات CSS للنص والشعار ---------- */
  let lastP = -1;
  function applyDom() {
    if (Math.abs(S.ps - lastP) > 0.0008) { hero.style.setProperty("--p", S.ps.toFixed(4)); lastP = S.ps; }
    if (logo) { logo.style.setProperty("--rx", S.rx.toFixed(2)); logo.style.setProperty("--ry", S.ry.toFixed(2)); }
  }

  /* ---------- 7) الحلقة ---------- */
  let raf = 0, last = performance.now();
  function frame(now) {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now;
    readScroll();
    S.ps += (S.p - S.ps) * (1 - Math.pow(0.0001, dt));   // تنعيم مستقل عن معدل الإطارات
    if (Math.abs(S.p - S.ps) < 0.0004) S.ps = S.p;
    S.t += dt; S.mx += (S.tx - S.mx) * 0.05; S.my += (S.ty - S.my) * 0.05;
    S.rx = -S.my * 9; S.ry = S.mx * 14;
    applyDom();
    const t0 = performance.now(); draw(); const cost = performance.now() - t0;
    // تدهور تلقائي: إن كان الرسم بطيئًا باستمرار نخفض الدقة والتجزئة
    if (!S.slow) { S.acc += cost; S.frames++; if (S.frames === 40) { if (S.acc / 40 > 7.5) { S.slow = 1; resize(); } S.frames = 0; S.acc = 0; } }
    schedule();
  }
  S.tx = 0; S.ty = 0;
  function schedule() { if (!raf && S.on && !document.hidden && !RM.matches) raf = requestAnimationFrame(t => frame(t)); }
  function staticRender() { readScroll(); S.ps = 0; S.p = 0; S.t = 4.2; applyDom(); draw(true); }

  /* ---------- 8) ربط الأحداث ---------- */
  new IntersectionObserver(es => { S.on = es[0].isIntersecting; if (S.on) { last = performance.now(); schedule(); } }, { rootMargin: "100px 0px" }).observe(hero);
  document.addEventListener("visibilitychange", () => { last = performance.now(); schedule(); });
  new ResizeObserver(() => resize()).observe(cv);
  addEventListener("razi:theme", e => { S.dark = e.detail === "dark"; draw(true); });
  const onRM = () => { RM.matches ? (cancelAnimationFrame(raf), raf = 0, staticRender()) : (readScroll(), schedule()); };
  RM.addEventListener ? RM.addEventListener("change", onRM) : RM.addListener(onRM);
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    hero.addEventListener("pointermove", e => { const r = hero.getBoundingClientRect(); S.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; S.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; }, { passive: true });
    hero.addEventListener("pointerleave", () => { S.tx = 0; S.ty = 0; });
  }
  addEventListener("scroll", schedule, { passive: true });

  resize();
  const go = () => { requestAnimationFrame(() => hero.classList.add("is-in")); if (RM.matches) staticRender(); else { readScroll(); S.ps = S.p; schedule(); } };
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 400))]).then(go); else go();
})();
