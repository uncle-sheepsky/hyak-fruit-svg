/* ═══ suika_render.js — ep3 SUIKA 물리 렌더러 모듈 (컴포지터·standalone 공용) ═══
   index.html 프로토서 추출. SUIKA.load(cb) → suika_snaps.json 로드. SUIKA.render(ctx, bakeF) 순수 f(t) 드로.
   juice: 스쿼시(2차동역학)·잎/표정·슈바르츠실트 새그·머지 링(스쿼시정합fix)·연쇄팝업·next프리뷰. 전부 seek-safe.
   컴포지터: S5 = render(ctx, video_f-56) · S0 라이브 = render(ctx, 504+f). 캔버스 1080×1920 소유(bg clear 포함). */
(function (global) {
  const W = 1080, H = 1920, FPS = 30;
  let g = null;                                   // 주입 ctx
  const SCALE = 120, CX = 540, FLOOR_PY = 1784;
  const mx = x => CX + x * SCALE;
  const my = y => FLOOR_PY - y * SCALE;

  let SNAP = null, TIERS = null, META = null, mergeByFrame = null, mergeById = null, clearsByFrame = null;
  let mergesDesc = null;   // 최신 머지 먼저(juice 겹침 순서 = 구 df 오름차순 루프와 동일)
  let FVEC = null;   // 벡터 통과일 데이터(fruit_vec.json, 단위정규화 큐빅 베지어)
  // 티어 k → 통과일 벡터명(크기순, 실루엣이 티어 구분 = 색중복 무력화, 2026-07-08 사용자 승인)
  const TIER_FRUIT = ['cherry','strawberry','grape','persimmon','tangerine','apple','pear','peach','pineapple','melon','watermelonwhole'];
  // 티어별 얼굴 스케일·y오프셋(과일 바디 실충전 영역에 맞춤 = 얼굴 과일 밖 넘침 방지, 2026-07-08).
  const FACE_CFG = [
    {s:0.42,dy:0.30},{s:0.66,dy:0.06},{s:0.60,dy:0.12},{s:0.70,dy:0.16},{s:0.72,dy:0.08},{s:0.72,dy:0.10},
    {s:0.58,dy:0.20},{s:0.72,dy:0.10},{s:0.60,dy:0.24},{s:0.78,dy:0.06},{s:0.82,dy:0.05},
  ];
  // 티어별 바디 확대율(잎·꼭지 padding으로 바디가 반경r보다 작아 간격 큼 → 바디를 r에 채워 간격 축소, 2026-07-08).
  const BODY_FILL = [1.18,1.20,1.16,1.16,1.12,1.14,1.12,1.15,1.20,1.08,1.10];

  function load(cb) {
    Promise.all([
      fetch('suika_snaps.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('fruit_vec.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([s, fv]) => {
      SNAP = s; TIERS = s.tiers; META = s.meta; FVEC = fv;
      mergeByFrame = {}; mergeById = {};
      for (const m of s.merges) { (mergeByFrame[m.f] ||= []).push(m); mergeById[m.i] = m.f; }
      const sorted = [...s.merges].sort((a, b) => a.f - b.f); let chain = 0;
      for (const m of sorted) { if (m.k >= 6) chain++; else chain = 0; m._chain = chain; }
      clearsByFrame = {};
      for (const c of (s.clears || [])) (clearsByFrame[c.f] ||= []).push(c);   // 클리어 웨이브 팝
      mergesDesc = [...s.merges].sort((a, b) => b.f - a.f);
      if (cb) cb();
    });
  }

  /* ★분수 bake 프레임 샘플러(2026-07-08, 배속 파생용).
     bake 스냅샷은 정수 프레임이지만 x·y·a 는 연속량 → 인접 두 프레임을 선형보간해
     "존재하지 않는 1.2번째 프레임"을 만든다. 30fps 배속 시 프레임 드롭(6:5 불균일 샘플링)이
     만들던 모션 저더를 제거. 순수 f(t) 유지 = 결정론·시크안전.
     · 규약: 바디 등장은 정수 프레임 경계(신생 id를 앞당기지 않음), 소멸 예정 바디는 다음 정수까지 현 위치 유지.
     · 라인 불변식은 자동 보존: y+VIS_R ≤ TOPLINE 은 볼록 반평면 → 두 만족점의 볼록결합도 만족. */
  function frameAt(f) {
    const N = SNAP.frames.length;
    let f0 = Math.floor(f);
    if (f0 < 0) f0 = 0; if (f0 > N - 1) f0 = N - 1;
    const t = Math.min(1, Math.max(0, f - f0));
    if (t < 1e-9 || f0 >= N - 1) return SNAP.frames[f0];
    const A = SNAP.frames[f0], B = SNAP.frames[f0 + 1];
    const bm = new Map();
    for (const o of B) bm.set(o.i, o);
    const out = [];
    for (const o of A) {
      const b = bm.get(o.i);
      if (b) out.push({ i: o.i, k: o.k, x: o.x + (b.x - o.x) * t, y: o.y + (b.y - o.y) * t, a: o.a + (b.a - o.a) * t });
      else out.push(o);                                   // 소멸 예정(머지·소거) = 정수 경계까지 유지
    }
    return out;
  }

  // 2차동역학 스쿼시(언더댐프 스프링) — 머지 순간 납작→오버슈트→안착. τ=머지후 초.
  function squashS(tau) {
    if (tau < 0) return 0;
    const A = 0.30, zeta = 0.26, omega = 24;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return A * Math.exp(-zeta * omega * tau) * Math.cos(wd * tau);
  }
  function shakeAt(f) {
    let best = -1, bk = 0, bx = 0;
    for (const m of SNAP.merges) { if (m.f > f) break; if (m.f >= best) { best = m.f; bk = m.k; bx = m.x; } }
    if (best < 0) return [0, 0];
    const tau = (f - best) / FPS;
    const amp = (2 + bk * 1.4) * Math.exp(-tau / 0.12);
    const ph = (best * 12.9898) % (2 * Math.PI);
    return [amp * Math.sin(52 * tau + ph), amp * Math.cos(61 * tau + ph * 1.7)];
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); gg = Math.max(0, Math.min(255, gg + amt)); b = Math.max(0, Math.min(255, b + amt));
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }
  const SAG_SIG = 1.5, SAG_GAIN = 0.16;
  function sagAt(xm, ym, fr) {
    let s = 0;
    for (const o of fr) { const w = TIERS[o.k].r * TIERS[o.k].r; const dx = xm - o.x, dy = ym - o.y; s += w * Math.exp(-(dx * dx + dy * dy) / (2 * SAG_SIG * SAG_SIG)); }
    return SAG_GAIN * s;
  }
  function drawPanel(fr) {
    g.fillStyle = '#0d0b12'; g.fillRect(0, 0, W, H);
    const L = mx(-META.W / 2), R = mx(META.W / 2), T = my(META.H), B = my(0);
    const W2 = META.W / 2, HH = META.H;
    g.save();
    g.beginPath(); g.rect(L, T, R - L, B - T); g.clip();
    g.strokeStyle = 'rgba(150,120,220,0.09)'; g.lineWidth = 1;
    const NV = 8, NH = 12, SS = 28;
    for (let i = 0; i <= NV; i++) {
      const xm = -W2 + META.W * i / NV;
      g.beginPath();
      for (let s = 0; s <= SS; s++) { const ym = HH * s / SS; g.lineTo(mx(xm), my(ym - sagAt(xm, ym, fr))); }
      g.stroke();
    }
    for (let j = 0; j <= NH; j++) {
      const ym = HH * j / NH;
      g.beginPath();
      for (let s = 0; s <= SS; s++) { const xm = -W2 + META.W * s / SS; g.lineTo(mx(xm), my(ym - sagAt(xm, ym, fr))); }
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(200,180,255,0.35)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(L, T); g.lineTo(L, B); g.lineTo(R, B); g.lineTo(R, T); g.stroke();
    const ty = my(META.TOPLINE);
    g.strokeStyle = 'rgba(255,90,120,0.5)'; g.setLineDash([14, 12]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(L, ty); g.lineTo(R, ty); g.stroke(); g.setLineDash([]);
  }
  // ── 유기형 볼록 폴리곤 꼭짓점(suika_bake.cjs와 동일 정의 유지) ──
  function shapeVerts(shape, r) {
    const P = [], TAU = Math.PI * 2;
    if (shape === 'oval') { const n = 8, sx = 0.82, sy = 1.14; for (let i = 0; i < n; i++) { const a = i / n * TAU; P.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); } }
    else if (shape === 'squat') { const n = 8, sx = 1.16, sy = 0.80; for (let i = 0; i < n; i++) { const a = i / n * TAU; P.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); } }
    else if (shape === 'tear') { const n = 5; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI; P.push([Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.9]); } P.push([0, -r * 1.5]); }
    else if (shape === 'pear') { const n = 5; for (let i = 0; i <= n; i++) { const a = Math.PI + i / n * Math.PI; P.push([Math.cos(a) * r * 1.02, Math.sin(a) * r * 0.92]); } P.push([0, r * 1.35]); }
    return P;
  }
  function shapePath(shape, r) {
    if (!shape || shape === 'circle') { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); return; }
    const v = shapeVerts(shape, r); g.beginPath(); g.moveTo(v[0][0], v[0][1]); for (let i = 1; i < v.length; i++) g.lineTo(v[i][0], v[i][1]); g.closePath();
  }
  // 벡터 통과일 바디(단위 큐빅 베지어 → Path2D, 다레이어 fill). 회전·스쿼시 트랜스폼 아래서 결정론.
  function bodyPath(layers) {                             // 벡터 레이어 → 단위 Path2D(전 서브패스)
    const p = new Path2D();
    for (const L of layers) for (const sub of L.subs) {
      p.moveTo(sub[0][0], sub[0][1]);
      for (const s of sub) p.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]);
      p.closePath();
    }
    return p;
  }
  function drawVecBody(k, r) {
    const layers = FVEC && FVEC[TIER_FRUIT[k]];
    if (!layers) {                                        // fallback: 티어색 원(데이터 없을 때)
      g.fillStyle = TIERS[k].c; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); return;
    }
    const rf = r * (BODY_FILL[k] || 1);
    g.save(); g.scale(rf, rf);                            // 단위(r=1) → px 반경(바디확대)
    for (const L of layers) { g.fillStyle = L.fill; g.fill(bodyPath([L])); }
    g.restore();
  }
  // 얼굴을 바디 실루엣(회전 반영)에 클립 = 과일 밖 이탈 방지.
  function clipFaceToBody(k, r, a) {
    const layers = FVEC && FVEC[TIER_FRUIT[k]]; if (!layers) return;
    const rf = r * (BODY_FILL[k] || 1);
    g.rotate(a || 0); g.scale(rf, rf);
    // ★메인 바디 레이어(layers[0])만 클립 = 다레이어 winding 충돌로 생기던 홀(복숭아 얼굴 우반부 소실) 방지.
    g.clip(bodyPath([layers[0]]));                        // 회전·확대된 바디 실루엣 = 클립(device 고정)
    g.scale(1 / rf, 1 / rf); g.rotate(-(a || 0));         // 얼굴 드로용 정립 프레임 복귀(클립 유지)
  }
  // 통수박 줄무늬 오버레이(통수박 벡터=초록 구, 줄무늬는 절차적). 바디와 함께 회전.
  // ★마스킹 타이트화(2026-07-08): 구 코드는 반경 r*0.98 원으로 클립했으나 벡터 바디 실반경은 단위 0.844(=r*0.844)
  //   → 줄무늬가 실루엣 밖 16%까지 삐져나감(회전 시 좌우 검은 줄기로 관측). 실제 바디 패스(layers[0])로 클립.
  const WM_UNIT_R = 0.844;                                // watermelonwhole 단위 바디 반경(fruit_vec 실측)
  function drawWatermelonStripes(rf) {
    const layers = FVEC && FVEC['watermelonwhole'];
    const br = rf * WM_UNIT_R;                            // 실제 그려진 바디 px 반경
    g.save();
    if (layers) { g.scale(rf, rf); g.clip(bodyPath([layers[0]])); g.scale(1 / rf, 1 / rf); }   // 바디 실루엣 클립
    else { g.beginPath(); g.arc(0, 0, br, 0, Math.PI * 2); g.clip(); }
    g.strokeStyle = 'rgba(14,50,20,0.5)'; g.lineWidth = Math.max(3, br * 0.085); g.lineCap = 'round';
    for (let i = -3; i <= 3; i++) { const x0 = i * br * 0.32; g.beginPath(); g.moveTo(x0, -br); g.quadraticCurveTo(x0 * 0.5, 0, x0, br); g.stroke(); }
    g.restore();
  }
  function drawFruit(o, f) {
    const t = TIERS[o.k], px = mx(o.x), py = my(o.y), r = t.r * SCALE;
    let sx = 1, sy = 1;
    const mf = mergeById[o.i];
    if (mf !== undefined) { const s = squashS((f - mf) / FPS); sx = 1 + s; sy = 1 / (1 + s); }
    g.save();
    g.translate(px, py); g.scale(sx, sy);
    // 벡터 통과일 바디 = 각도 a 회전 텀블(물리). 벡터 자체 잎·꼭지·음영 포함 → 절차적 잎/텍스처/하이라이트 불요.
    g.save(); g.rotate(o.a || 0);
    drawVecBody(o.k, r);
    if (o.k === 10) drawWatermelonStripes(r * (BODY_FILL[10] || 1));   // 통수박 줄무늬(바디확대 정합)
    g.restore();
    g.save(); clipFaceToBody(o.k, r, o.a);                 // 얼굴 = 바디 클립(이탈 방지)
    drawFace(r, o.i, f, o.k);                              // 큐티 얼굴 = 화면 정립·티어별 크기맞춤
    g.restore();
    g.restore();
  }
  // 티어별 텍스처(원 안 클립, 순수 f(k,r)). ★각 표현 뚜렷하게 강화(2026-07-08): 매끈 티어도 광택=의도적 텍스처.
  function drawTexture(k, r, shape) {
    const TAU = Math.PI * 2;
    g.save();
    shapePath(shape || 'circle', r * 0.97); g.clip();
    if (k === 10) {                                        // 수박: 세로 줄무늬(굵고 뚜렷, 사용자 긍정)
      g.strokeStyle = 'rgba(16,54,22,0.62)'; g.lineWidth = Math.max(4, r * 0.085); g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) { const x0 = i * r * 0.32; g.beginPath(); g.moveTo(x0, -r); g.quadraticCurveTo(x0 * 0.5, 0, x0, r); g.stroke(); }
    } else if (k === 9) {                                  // 멜론: 그물 네트(강화 alpha·선폭)
      g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = Math.max(2, r * 0.028);
      for (let a = 0; a < 6; a++) { g.save(); g.rotate(a * Math.PI / 6); for (let yy = -r; yy < r; yy += r * 0.30) { g.beginPath(); g.moveTo(-r, yy); g.lineTo(r, yy + r * 0.14); g.stroke(); } g.restore(); }
    } else if (k === 8) {                                  // 파인애플: 다이아 격자(강화)
      g.strokeStyle = 'rgba(120,74,14,0.46)'; g.lineWidth = Math.max(2, r * 0.038);
      for (let d = -4; d <= 4; d++) { g.beginPath(); g.moveTo(-r, d * r * 0.28 - r); g.lineTo(r, d * r * 0.28); g.stroke(); g.beginPath(); g.moveTo(-r, d * r * 0.28); g.lineTo(r, d * r * 0.28 - r); g.stroke(); }
    } else if (k === 1 || k === 0) {                       // 딸기·체리: 씨 점(뚜렷, 사용자 긍정)
      g.fillStyle = 'rgba(255,246,214,0.72)';
      for (let i = 0; i < 11; i++) { const a = i * 2.4, rr2 = r * 0.62 * (((i * 7) % 3) / 3 + 0.35); g.beginPath(); g.ellipse(Math.cos(a) * rr2, Math.sin(a) * rr2, r * 0.06, r * 0.11, a, 0, TAU); g.fill(); }
    } else if (k === 4 || k === 7) {                       // 오렌지·복숭아: 껍질 점묘(강화 = 매트 질감 뚜렷)
      g.fillStyle = 'rgba(90,40,0,0.13)';
      for (let i = 0; i < 20; i++) { const a = i * 1.7, rr2 = r * 0.74 * (((i * 5) % 4) / 4 + 0.2); g.beginPath(); g.arc(Math.cos(a) * rr2, Math.sin(a) * rr2, r * 0.035, 0, TAU); g.fill(); }
    } else {                                               // 매끈 티어(포도·한라봉·사과·배): 광택 스트릭 = 매끈함을 의도적·뚜렷한 텍스처로
      const lg = g.createLinearGradient(-r * 0.5, -r, -r * 0.05, r);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.42, 'rgba(255,255,255,0.24)');
      lg.addColorStop(0.58, 'rgba(255,255,255,0.05)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(-r, -r, r * 2, r * 2);
    }
    g.restore();
  }
  // 잎: ★원 안쪽 표현(2026-07-08) — 꼭지·잎이 과일 원 내부 상단(돌출 없음). 티어별 개수 다양.
  function drawLeaf(r, k) {
    const nLeaf = k >= 8 ? 3 : (k >= 3 ? 2 : 1);           // 큰 과일=3잎, 중간=2, 작은=1
    g.save();
    g.strokeStyle = '#5a7a2e'; g.lineWidth = Math.max(1.2, r * 0.045); g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -r * 0.50); g.lineTo(0, -r * 0.74); g.stroke();   // 원 안쪽 꼭지
    const greens = ['#4caf50', '#66bb56', '#3e9e46'];
    for (let li = 0; li < nLeaf; li++) {
      const ang = nLeaf === 1 ? -0.25 : (li - (nLeaf - 1) / 2) * 0.7;   // 부채꼴 전개
      g.fillStyle = greens[li % 3];
      g.save(); g.translate(0, -r * 0.74); g.rotate(ang);
      g.beginPath(); g.ellipse(0, -r * 0.07, r * 0.13, r * 0.06, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.restore();
  }
  function drawFace(r, id, f, k) {
    const cfg = FACE_CFG[k] || { s: 0.72, dy: 0.10 };
    const rr = r * cfg.s;                                 // 바디 실충전 영역 스케일
    g.save(); g.translate(0, r * cfg.dy);                 // 바디 중심으로 오프셋
    const mf = mergeById[id];
    const tau = mf !== undefined ? (f - mf) / FPS : 99;
    const happy = tau >= 0 && tau < 0.5;
    const ey = -rr * 0.02, ex = rr * 0.30;
    g.fillStyle = 'rgba(255,120,150,0.28)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * rr * 0.46, rr * 0.16, rr * 0.14, rr * 0.09, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#3a2b2b'; g.fillStyle = '#3a2b2b';
    for (const s of [-1, 1]) {
      if (happy) {
        g.lineWidth = Math.max(1.6, rr * 0.06); g.lineCap = 'round';
        g.beginPath(); g.arc(s * ex, ey + rr * 0.04, rr * 0.13, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      } else {
        g.beginPath(); g.ellipse(s * ex, ey, rr * 0.085, rr * 0.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(s * ex - rr * 0.03, ey - rr * 0.045, rr * 0.035, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a2b2b';
      }
    }
    g.strokeStyle = '#3a2b2b'; g.lineWidth = Math.max(1.4, rr * 0.045); g.lineCap = 'round';
    g.beginPath(); g.arc(0, rr * 0.08, rr * 0.16, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    g.restore();
  }
  // 머지 juice: 확장 링 + 방사 파티클(f(f) 순수). 링·파티클을 과일 스쿼시에 정합(얼굴 미가림).
  // ★분수 f 대응(2026-07-08): 구 `df` 정수 루프 → 머지 목록 순회(df 실수). mergesDesc = 최신 먼저 = 구 겹침 순서 보존.
  function drawMergeJuice(f) {
    const LIFE = 14;
    for (const m of mergesDesc) {
      const df = f - m.f;
      if (df < 0) continue;
      if (df >= LIFE) break;                              // 내림차순 → 더 오래된 건 전부 수명 초과
      const p = df / LIFE;
      {
        const t = TIERS[m.k], px = mx(m.x), py = my(m.y), base = t.r * SCALE;
        const boost = 0.6 + m.k * 0.14;
        const a = (1 - p) * 0.85;
        const s = squashS(df / FPS), sx = 1 + s, sy = 1 / (1 + s);
        g.save(); g.translate(px, py); g.scale(sx, sy);
        const ro = base * (1 + p * (1.3 + boost));
        g.strokeStyle = `rgba(255,255,255,${a * 0.9})`; g.lineWidth = (6 * (1 - p) + 1) * boost;
        g.beginPath(); g.arc(0, 0, ro, 0, Math.PI * 2); g.stroke();
        const ri = base * (1 + p * (0.85 + boost));
        g.strokeStyle = `rgba(${hexRGB(t.c)},${a})`; g.lineWidth = (9 * (1 - p) + 1) * boost;
        g.beginPath(); g.arc(0, 0, ri, 0, Math.PI * 2); g.stroke();
        const Np = 8 + m.k * 2;
        for (let j = 0; j < Np; j++) {
          const ang = (j / Np) * Math.PI * 2 + (m.f % 7) * 0.3;
          const dist = base * (1 + p * (1.4 + boost));
          const psz = (1 - p) * base * 0.13 + 1;
          const alpha = (1 - p) * 0.9;
          // ★버그fix(2026-07-08): shade()는 'rgb()' 문자열 → hexRGB(NaN) 무효색(검정 누수). rgb→rgba 직변환.
          g.fillStyle = shade(t.c, 60).replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
          g.beginPath(); g.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, psz, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
    }
  }
  function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
  // ★클리어 웨이브 팝 버스트(하단→상단 소거 연출) — 소거된 과일마다 확장링+코어플래시+방사파티클. 순수 f(t).
  function drawClears(f) {
    if (!SNAP.clears) return;
    const LIFE = 13;
    for (const c of SNAP.clears) {
      const df = f - c.f;
      if (df < 0 || df >= LIFE) continue;
      const p = df / LIFE, a = 1 - p;
      {
        const t = TIERS[c.k], px = mx(c.x), py = my(c.y), base = t.r * SCALE * (BODY_FILL[c.k] || 1);
        const rr = base * (0.55 + p * 1.5);
        g.strokeStyle = shade(t.c, 55).replace('rgb(', 'rgba(').replace(')', `,${a * 0.95})`);
        g.lineWidth = 6 * (1 - p) + 1.5; g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.stroke();
        if (df < 4) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,255,255,${(1 - df / 4) * 0.5})`; g.beginPath(); g.arc(px, py, base * 0.34 * (1 - df / 4), 0, Math.PI * 2); g.fill(); g.restore(); }
        const Np = 6 + c.k;
        for (let j = 0; j < Np; j++) {
          const ang = (j / Np) * Math.PI * 2 + (c.f % 5) * 0.4, dist = base * (0.5 + p * 1.7), psz = (1 - p) * base * 0.12 + 1;
          g.fillStyle = shade(t.c, 65).replace('rgb(', 'rgba(').replace(')', `,${a})`);
          g.beginPath(); g.arc(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist, psz, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }
  function scoreAt(f) { let s = 0; for (const m of SNAP.merges) { if (m.f > f) break; s += (m.k + 1) * 10; } return s; }
  function drawChainPopups(f) {
    const LIFE = 18;
    g.textAlign = 'center';
    for (const m of SNAP.merges) {
      if (m.f > f) break;
      const df = f - m.f; if (df >= LIFE) continue;
      const p = df / LIFE;
      const px = mx(m.x), py = my(m.y + p * 0.9);
      const a = 1 - p;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.font = `800 ${Math.round(30 + m.k * 2.5)}px system-ui, sans-serif`;
      g.fillText('+' + ((m.k + 1) * 10), px, py);
      if (m._chain >= 2) {
        g.fillStyle = `rgba(255,214,102,${a})`;
        g.font = `800 ${Math.round(26 + m._chain * 2)}px system-ui, sans-serif`;
        g.fillText('CHAIN ×' + m._chain, px, py - 44);
      }
    }
    g.textAlign = 'left';
  }
  function drawNextPreview(f) {
    let nk = -1;
    for (const d of SNAP.drops) { if (d.f > f) { nk = d.k; break; } }
    const bx = 962, by = 300, R = 44;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(200,180,255,0.55)'; g.font = '600 26px system-ui, sans-serif';
    g.fillText('NEXT', bx, by - R - 16);
    g.strokeStyle = 'rgba(200,180,255,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.arc(bx, by, R + 12, 0, Math.PI * 2); g.stroke();
    if (nk < 0) { g.textAlign = 'left'; return; }
    const t = TIERS[nk];
    const grd = g.createRadialGradient(bx - R * 0.35, by - R * 0.4, R * 0.1, bx, by, R);
    grd.addColorStop(0, shade(t.c, 55)); grd.addColorStop(0.55, t.c); grd.addColorStop(1, shade(t.c, -35));
    g.fillStyle = grd; g.beginPath(); g.arc(bx, by, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(bx - R * 0.32, by - R * 0.36, R * 0.18, R * 0.12, -0.6, 0, Math.PI * 2); g.fill();
    g.textAlign = 'left';
  }
  function drawHUD(f) {
    g.fillStyle = '#f2e9ff'; g.textAlign = 'left';
    g.font = '700 64px system-ui, sans-serif';
    g.fillText('SUIKA', 70, 150);
    g.textAlign = 'right';
    g.font = '800 88px system-ui, sans-serif';
    g.fillText(String(scoreAt(f)).padStart(5, '0'), 1010, 155);
    g.textAlign = 'left'; g.font = '500 30px system-ui, sans-serif';
    g.fillStyle = 'rgba(200,180,255,0.6)';
    g.fillText('no after effects · pure code physics', 70, 200);
  }

  // render(ctx, bakeF) — 물리 씬 프레임 소유(bg clear 포함). shake 옵션. bakeF = **실수 허용**(분수 = 선형보간 프레임).
  function render(ctx, f, ropts) {
    if (!SNAP) return;
    g = ctx; ropts = ropts || {};
    f = Math.max(0, Math.min(SNAP.frames.length - 1, +f));
    const st = !!ropts.static;                            // 정적 프리즈: shake·머지juice·연쇄팝업 억제(얼어붙은 버스트 잔상 제거)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0b12'; g.fillRect(0, 0, W, H);
    const [shx, shy] = st ? [0, 0] : shakeAt(f);
    const fr = frameAt(f);
    g.save();
    g.translate(shx + (ropts.shakeX || 0), shy + (ropts.shakeY || 0));
    drawPanel(fr);
    for (const o of fr) drawFruit(o, f);
    if (!st) { drawMergeJuice(f); drawChainPopups(f); drawClears(f); }
    g.restore();
    if (ropts.noHud) return;                              // 썸네일 배경용: HUD·NEXT 억제
    drawHUD(f);
    drawNextPreview(f);
  }

  // 썸네일용: 통수박 벡터 바디 + 줄무늬만 그린다(물리·얼굴 없음). thumb_proto.html 전용 노출.
  function drawThumbBody(ctx, r) {
    g = ctx;
    const rf = r * (BODY_FILL[10] || 1);
    drawVecBody(10, r);
    drawWatermelonStripes(rf);
  }

  /* ── SVG 비교 모션그래픽(comp.html NARR 씬)용 노출 API (2026-07-08) ──
     "원본 SVG vs 우리가 재구성한 SVG"를 그리려면 벡터 레이어·물리 폴리곤·얼굴에 접근해야 한다.
     전부 정적 데이터/순수 드로라 결정론 유지. */
  function drawBodyTo(ctx, k, r) { g = ctx; drawVecBody(k, r); }                 // 벡터 바디만(얼굴·줄무늬 없음)
  function drawFaceTo(ctx, k, r) { g = ctx; drawFace(r, -1, 0, k); }             // id=-1 → 머지 스쿼시 없음
  function vecLayers(k) { return FVEC ? FVEC[TIER_FRUIT[k]] : null; }
  function vecName(k) { return TIER_FRUIT[k]; }
  function tiers() { return TIERS; }
  function bodyFill(k) { return BODY_FILL[k] || 1; }
  function faceCfg(k) { return FACE_CFG[k]; }

  global.SUIKA = {
    load, render, drawThumbBody,
    drawBodyTo, drawFaceTo, vecLayers, vecName, tiers, bodyFill, faceCfg, shapeVerts,
    get frames() { return SNAP ? SNAP.frames.length : 0; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
