/* ═══ suika_bake.cjs — 수박게임(Suika) 결정론 물리 베이크 (뱅크 카드 후보) ═══
   planck.js(Box2D 포트) 강체 시뮬을 고정 dt·고정시드로 굽고 프레임별 스냅샷 직렬화.
   렌더러는 snaps.frames[f] 를 순수 f(t)로 읽음(시뮬↔렌더 분리, tetris_sim.js 동형).

   결정론 규약: random/Date 없음(드롭 스케줄=LCG 시드). 단일머신 1회 베이크 = 픽셀락 소스.
   중력 아이디어 이식(kavan010/gravity_sim): 저탄성 감쇠 리바운드(restitution 낮게=안착 satisfying),
   semi-implicit 적분(planck 기본). 슈바르츠실트 그리드 새그는 렌더 juice 레이어(f(질량), 별도).

   실행: NODE_PATH=<site-factory>/node_modules node suika_bake.cjs [--frames 600 --fps 30 --seed 12345]
   산출: suika_snaps.json { meta, tiers, frames:[[{i,k,x,y,a}...]], merges:[...], drops:[...], gameOverF }
*/
'use strict';
const fs = require('fs');
const path = require('path');
const pl = require('planck');

// ── 파라미터 ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).join(' ')
  .split('--').filter(Boolean).map(s => s.trim().split(/\s+/)).map(([k, v]) => [k, v]));
const FPS = +args.fps || 30;
const FRAMES = +args.frames || 600;          // 20s @30fps
const SUB = +args.sub || 4;                   // 프레임당 물리 서브스텝
const DT = 1 / (FPS * SUB);                    // 물리 dt (고정)
let SEED = (+args.seed || 12345) >>> 0;

// ── 과일 티어 (11단, 원작 준용) — 반지름(m)·색 ───────────────────────────────
// s = 물리 형상(선택 티어 유기형 = 움직임 다양). circle=원 · oval/squat/tear/pear=볼록 폴리곤(각도 a 텀블 가시).
const TIERS = [
  { k: 0,  r: 0.30, c: '#f2555a', s: 'circle' }, // cherry
  { k: 1,  r: 0.40, c: '#f2859b', s: 'tear'   }, // strawberry(티어드롭 하향)
  { k: 2,  r: 0.54, c: '#a86ad0', s: 'oval'   }, // grape(세로 타원)
  { k: 3,  r: 0.68, c: '#f2a13a', s: 'squat'  }, // dekopon(납작 편구)
  { k: 4,  r: 0.82, c: '#f27a2a', s: 'circle' }, // orange
  { k: 5,  r: 1.00, c: '#e64530', s: 'circle' }, // apple
  { k: 6,  r: 1.18, c: '#c7e05a', s: 'pear'   }, // pear(하부 넓은 배)
  { k: 7,  r: 1.38, c: '#f7c6c0', s: 'circle' }, // peach
  { k: 8,  r: 1.62, c: '#f2d54a', s: 'squat'  }, // pineapple(약간 세로 편)
  { k: 9,  r: 1.90, c: '#8fd44a', s: 'circle' }, // melon
  { k: 10, r: 2.20, c: '#2f9e44', s: 'circle' }, // watermelon
];
const MAXK = TIERS.length - 1;

// ── 유기형 볼록 폴리곤 꼭짓점(로컬, r 스케일). 렌더러와 동일 정의 유지(suika_render.js). CCW·볼록. ──
function shapeVerts(shape, r) {
  const P = [], TAU = Math.PI * 2;
  // planck 볼록 폴리곤 최대 8꼭짓점 준수.
  if (shape === 'oval') { const n = 8, sx = 0.82, sy = 1.14; for (let i = 0; i < n; i++) { const a = i / n * TAU; P.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); } }
  else if (shape === 'squat') { const n = 8, sx = 1.16, sy = 0.80; for (let i = 0; i < n; i++) { const a = i / n * TAU; P.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); } }
  else if (shape === 'tear') { const n = 5; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI; P.push([Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.9]); } P.push([0, -r * 1.5]); }   // 상단 반원(y>0) 6점 + 하단 점 = 7꼭짓점 하향 티어드롭
  else if (shape === 'pear') { const n = 5; for (let i = 0; i <= n; i++) { const a = Math.PI + i / n * Math.PI; P.push([Math.cos(a) * r * 1.02, Math.sin(a) * r * 0.92]); } P.push([0, r * 1.35]); }  // 하단 반원(y<0) 6점 + 상단 점 = 7꼭짓점 상향 배
  return P;   // circle → 빈 배열(makeFruit서 Circle 사용)
}
const SPAWN_MAXK = 4;   // 드롭으로 나오는 최대 티어(원작=0..4)

// ── 컨테이너(세로 쇼츠 궁합) ─────────────────────────────────────────────────
const W = 7.2;          // 내부 폭(m)
const H = 12.8;         // 내부 높이(m)
// ★게임오버 라인 10% 상향(2026-07-08 사용자 지시): (H-1.6)=11.2 → 12.32.
const TOPLINE = (H - 1.6) * 1.1;
const WALL = 0.2;

// ── ★라인 침범 금지 규약(2026-07-08) ────────────────────────────────────────
//   "낙하 이후 과일이 game-over 라인 위로 올라가면 안 된다. 생성 후 2초 유예는 허용."
//   판정은 물리 반경 r이 아니라 **렌더 실측 반경**(vec 실루엣 × BODY_FILL, 회전안전 최대반경)으로 한다.
//   suika_render.js BODY_FILL·fruit_vec.json 단위 최대반경에서 산출 = 화면상 과일 외곽이 라인을 넘지 않음.
const VIS_R = [0.3958, 0.5533, 0.7311, 0.7747, 1.0770, 1.2999, 1.3737, 1.5929, 1.9794, 2.3545, 2.4357];
const GRACE_F = +args.grace || 60;          // 생성 후 유예 프레임(2s @30fps) — 자유낙하 안전망
const DROP_HEADROOM = 0.30;                 // 안착 스택 top이 TOPLINE−이 값 넘으면 신규 드롭 보류
const SETTLE_CORRECT = 0.03;              // 라인 초과분 서브스텝당 최대 하향 보정(m) = 0.4m/frame 상한(순간이동 방지)
const ATTRACT_CAP_G = 0.92;                 // 인력 **상향 성분** 상한 = 중력의 배수(<1 → 인력으로 못 뜸). 수평은 무제한(캐스케이드 보존)
const GRAV = 22;
const REST_V = 1.2;                         // 안착 판정 속도(m/s) 미만 = "낙하 이후"
// "낙하 이후" = 한 번이라도 접촉(바닥·벽·다른 과일)한 이후. 머지 산물은 접촉서 태어나므로 즉시 landed.
const landed = new Set();                   // id 집합

// ── 시드 난수(LCG) ──────────────────────────────────────────────────────────
function rnd() { SEED = (SEED * 1664525 + 1013904223) >>> 0; return SEED / 4294967296; }

// ── 월드 ────────────────────────────────────────────────────────────────────
const world = pl.World({ gravity: pl.Vec2(0, -22) }); // y-up, 강한 g=낙하감
const wallDef = { friction: 0.5, restitution: 0.0 };
const ground = world.createBody();
ground.createFixture(pl.Edge(pl.Vec2(-W / 2, 0), pl.Vec2(W / 2, 0)), wallDef);           // floor
ground.createFixture(pl.Edge(pl.Vec2(-W / 2, 0), pl.Vec2(-W / 2, H + 4)), wallDef);        // left
ground.createFixture(pl.Edge(pl.Vec2(W / 2, 0), pl.Vec2(W / 2, H + 4)), wallDef);          // right

// ── 과일 생성 ────────────────────────────────────────────────────────────────
let NEXT_ID = 1;
let CURF = 0;             // 현재 베이크 프레임(생성 유예 계산용)
const fruits = new Map(); // id -> body
function makeFruit(k, x, y, vx = 0, vy = 0) {
  const t = TIERS[k];
  const b = world.createBody({ type: 'dynamic', position: pl.Vec2(x, y), bullet: false });
  const fdef = { density: 1.0, friction: 0.35, restitution: 0.12 };   // ★저탄성 = 안착 satisfying
  if (t.s && t.s !== 'circle') {
    const verts = shapeVerts(t.s, t.r).map(([vx, vy]) => pl.Vec2(vx, vy));
    b.createFixture(pl.Polygon(verts), fdef);                          // 유기형 = 볼록 폴리곤(텀블)
  } else {
    b.createFixture(pl.Circle(t.r), fdef);
  }
  b.setLinearVelocity(pl.Vec2(vx, vy));
  const id = NEXT_ID++;
  b.setUserData({ id, k, bf: CURF });     // bf = 생성 프레임(유예 판정)
  fruits.set(id, b);
  return id;
}

// ── 라인 규약 헬퍼 ───────────────────────────────────────────────────────────
function visTop(b) { const u = b.getUserData(); return b.getPosition().y + VIS_R[u.k]; }
// ★"착지" = 바닥·벽(정적 바디) 또는 **이미 착지한 과일**과 접촉. 슈트서 자유낙하 중인 두 과일끼리
//   스치는 접촉은 착지가 아니다(구 코드는 이걸 착지로 봐서 라인으로 즉시 클램프 → 최대 318px 순간이동 발생).
//   전이적: A착지 & A-B접촉 → B착지. 고정점 도달까지 반복.
function markLanded() {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let c = world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const ba = c.getFixtureA().getBody(), bb = c.getFixtureB().getBody();
      const ua = ba.getUserData(), ub = bb.getUserData();
      const aL = !ua || landed.has(ua.id);          // userData 없음 = 벽/바닥(정적)
      const bL = !ub || landed.has(ub.id);
      if (aL && !bL) { landed.add(ub.id); changed = true; }
      else if (bL && !aL) { landed.add(ua.id); changed = true; }
    }
    if (!changed) break;
  }
}
// "낙하 이후 안착" = 접촉 이력 있고 거의 멈춤(REST_V 미만). 낙하·튐 중인 순간 접촉은 제외(원 물리 보존).
function resting(b) {
  const u = b.getUserData(); if (!u || !landed.has(u.id)) return false;
  const v = b.getLinearVelocity();
  return Math.hypot(v.x, v.y) < REST_V;
}
// 안착 과일의 최고 렌더 top. 신규 드롭 보류 판정용.
function restingTop() {
  let t = -99;
  for (const [, b] of fruits) if (resting(b)) { const v = visTop(b); if (v > t) t = v; }
  return t;
}
function dropBlocked() { return restingTop() > TOPLINE - DROP_HEADROOM; }
// ★"낙하 이후"(=한 번이라도 접촉) 과일은 라인 위로 못 올라간다. 초과분은 프레임당 완만 하향 보정
//   + 상승속도 제거(텔레포트 금지 = 시각 안정). 슈트서 자유낙하 중(미접촉)만 통과 허용, 그것도 GRACE_F까지.
function enforceTopline() {
  for (const [, b] of fruits) {
    const u = b.getUserData();
    if (!landed.has(u.id) && CURF - u.bf <= GRACE_F) continue;
    const over = visTop(b) - TOPLINE;
    if (over <= 0) continue;
    const p = b.getPosition();
    b.setPosition(pl.Vec2(p.x, p.y - Math.min(SETTLE_CORRECT, over)));
    const v = b.getLinearVelocity();
    if (v.y > 0) b.setLinearVelocity(pl.Vec2(v.x, 0));
    b.setAwake(true);
  }
}

// ── 동티어 미세 인력(같은 과일끼리 끌림 = 자연스러운 머지 캐스케이드, 2026-07-08) ──
//   질량비례·거리역제곱 감쇠. 상시 약(유기적 머지 촉진), 클리어 페이즈 강(연쇄 소거 유도).
function applyAttraction(strength) {
  const arr = [...fruits.values()];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const ba = arr[i], bb = arr[j];
      const ua = ba.getUserData(), ub = bb.getUserData();
      if (!ua || !ub || ua.k !== ub.k) continue;
      // ★라인 근처 과일은 인력 대상서 제외(끌어올림 방지).
      if (visTop(ba) > TOPLINE - 0.2 || visTop(bb) > TOPLINE - 0.2) continue;
      const pa = ba.getPosition(), pb = bb.getPosition();
      const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) + 1e-6;
      const rr = TIERS[ua.k].r;
      if (d > rr * 7.0) continue;                       // 인력 범위(반경 7배 = 캐스케이드 유도)
      const f = strength * rr * rr / (d * d + 0.4);      // 질량(r²)·거리역제곱
      const fx = f * dx / d, fy = f * dy / d;
      ba.setAwake(true); bb.setAwake(true);              // ★슬립 바디 깨우기(인력 적용 위해)
      // ★상향 성분만 중력의 ATTRACT_CAP_G배로 상한(인력으로 못 뜸). 수평·하향은 무제한 = 캐스케이드 위력 보존.
      const upA = Math.min(fy, ATTRACT_CAP_G * GRAV * ba.getMass());
      const upB = Math.min(-fy, ATTRACT_CAP_G * GRAV * bb.getMass());
      ba.applyForceToCenter(pl.Vec2(fx, upA)); bb.applyForceToCenter(pl.Vec2(-fx, upB));
    }
  }
}

// ── 페이즈 스케줄 ────────────────────────────────────────────────────────────
// A) 자연 빌드(t0~SPAWN_MAXK 랜덤) → B) authored 키스톤 사다리(중앙 키스톤에 동티어 드롭→머지로 등반, t10 보장).
//    수박(t10)=체리 1024개 필요 → 짧은 클립서 자연 도달 불가. 클라이맥스=authored 치트(ep36 캐넌, 놀이용 가상 OK).
const BUILD_EVERY = Math.round(FPS * 0.42);        // 자연 드롭 간격
const KEY_START = +args.keyStart || 300;           // 키스톤 페이즈 시작 프레임
const KEY_STEP = +args.keyStep || 22;              // 사다리 드롭 간격(프레임)
const KEY_X = args.keyX !== undefined ? +args.keyX : 0;  // 키스톤 중앙 x
const KEY_SEED_TIER = +args.keySeed || 4;          // 키스톤 시작 티어(자연빌드 최고와 정합)
let nextDropF = Math.round(FPS * 0.3);
let nextKeyF = KEY_START;
let keystoneId = -1, keystoneTier = -1, keyDone = false;
// ★측면 연속 드롭(키스톤 페이즈 내내 = 가시창 연쇄반응 + S0 모션). 원본 스트림(rnd) 이어씀.
const SIDE_EVERY = Math.round(FPS * (+args.sideEvery || 0.5));   // 측면 드롭 간격(작을수록 합체↑, 2026-07-08 파라미터화)
const SIDE_MAXK = +args.sideMaxK || 3;             // 측면 드롭 최대 티어(+1: 0..SIDE_MAXK-1)
let nextSideF = KEY_START + 6;
// ★클리어 웨이브(하단→상단 싹 소거 통쾌 연출, 2026-07-08): CLEAR_START부터 상승선 아래 과일 순차 팝 → 포스트 리필(루프 restart 감).
const CLEAR_START = +args.clearStart || 0;         // 0 = 비활성
const BASE_ATTRACT = +args.attract !== undefined ? +args.attract : 0;   // 상시 동티어 인력(0=비트락 보존)
const CLEAR_ATTRACT = +args.clearAttract || 55;    // 클리어 페이즈 강인력(연쇄 소거 구동)
let nextRefillF = 0;

// ── 베이크 루프 ──────────────────────────────────────────────────────────────
const framesOut = [];
const merges = [];
const drops = [];
const clears = [];        // 클리어 웨이브 팝 이벤트 {f,x,y,k}
let gameOverF = -1;

function snapshot() {
  const arr = [];
  for (const [id, b] of fruits) {
    const p = b.getPosition();
    arr.push({ i: id, k: b.getUserData().k, x: +p.x.toFixed(4), y: +p.y.toFixed(4), a: +b.getAngle().toFixed(4) });
  }
  return arr;
}

function doMerges() {
  // 접촉 중 동일 티어 쌍 수집(각 바디 1회만 소비).
  const consumed = new Set();
  const pairs = [];
  for (let c = world.getContactList(); c; c = c.getNext()) {
    if (!c.isTouching()) continue;
    const ba = c.getFixtureA().getBody(), bb = c.getFixtureB().getBody();
    const ua = ba.getUserData(), ub = bb.getUserData();
    if (!ua || !ub) continue;                 // 벽 접촉 제외
    if (ua.k !== ub.k) continue;              // ★동티어(수박쌍 포함 = 소멸)
    if (consumed.has(ua.id) || consumed.has(ub.id)) continue;
    consumed.add(ua.id); consumed.add(ub.id);
    pairs.push([ba, bb, ua, ub]);
  }
  return pairs;
}

for (let f = 0; f < FRAMES; f++) {
  CURF = f;
  // A) 자연 빌드 드롭(KEY_START 전) — 스택이 라인에 근접하면 보류(rnd 스트림 미소비 = 결정론 안정)
  if (f < KEY_START && f >= nextDropF && gameOverF < 0 && !dropBlocked()) {
    const k = Math.floor(rnd() * (SPAWN_MAXK + 1));
    const r = TIERS[k].r;
    const x = (rnd() - 0.5) * (W - 2 * r - 0.2);
    const id = makeFruit(k, x, H + 0.6);
    drops.push({ f, i: id, k, x: +x.toFixed(3) });
    nextDropF = f + BUILD_EVERY;
  }
  // B) 키스톤 사다리(KEY_START 이후) — 중앙 키스톤 위에 동티어 드롭→낙하 머지로 한 칸씩 등반, t10까지.
  if (f >= KEY_START && !keyDone && f >= nextKeyF) {
    if (keystoneId < 0 || !fruits.has(keystoneId)) {
      keystoneId = makeFruit(KEY_SEED_TIER, KEY_X, H + 0.6);   // 시드: 중앙 상단 시작티어
      keystoneTier = KEY_SEED_TIER;
      drops.push({ f, i: keystoneId, k: KEY_SEED_TIER, x: KEY_X, key: true });
    } else if (keystoneTier < MAXK) {
      const kp = fruits.get(keystoneId).getPosition();
      const id = makeFruit(keystoneTier, kp.x, H + 0.6);  // ★데드라인 위(top)서 동티어 낙하→머지(가시 낙하)
      drops.push({ f, i: id, k: keystoneTier, x: +kp.x.toFixed(3), key: true });
    } else {
      keyDone = true;
    }
    nextKeyF = f + KEY_STEP;
  }
  // ★측면 연속 드롭: 키스톤 페이즈 내내 far-side(|x|≥2.0)에 소티어(0-2) → 중앙 사다리 방해 없이 연쇄반응·S0 모션.
  const sideEnd = CLEAR_START ? CLEAR_START - 6 : FRAMES - 16;
  if (f >= KEY_START && f >= nextSideF && f < sideEnd && !dropBlocked()) {
    const k = Math.floor(rnd() * SIDE_MAXK);         // cherry/strawberry/grape(…SIDE_MAXK)
    const r = TIERS[k].r;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (2.1 + rnd() * (W / 2 - 2.1 - r - 0.15));
    const id = makeFruit(k, x, H + 0.6);             // 데드라인 위서 낙하
    drops.push({ f, i: id, k, x: +x.toFixed(3) });
    nextSideF = f + SIDE_EVERY;
  }

  // 물리 서브스텝 + 머지(서브스텝마다 접촉 안정). 동티어 인력 = 자연 머지 캐스케이드.
  const attractStr = (CLEAR_START && f >= CLEAR_START) ? CLEAR_ATTRACT : BASE_ATTRACT;
  for (let s = 0; s < SUB; s++) {
    if (attractStr > 0) applyAttraction(attractStr);
    world.step(DT, 8, 3);
    markLanded();                           // ★접촉 이력 갱신("낙하 이후" 판정)
    enforceTopline();                       // ★낙하 이후 과일의 라인 침범 차단(서브스텝마다)
    const pairs = doMerges();
    for (const [ba, bb, ua, ub] of pairs) {
      const pa = ba.getPosition(), pb = bb.getPosition();
      const mx = (pa.x + pb.x) / 2;
      // ★머지 산물 스폰 y 상한 = 라인(낙하물과 더미 꼭대기의 중점이 라인 위로 솟는 것 차단).
      //   원본은 중점 그대로 → 큰 과일이 컨테이너 위로 튀어나와 HUD를 덮었음.
      //   단 **슈트서 낙하 중인 두 과일끼리의 머지**(부모 둘 다 미착지)는 상한 미적용 = 순간이동 방지.
      const parentLanded = landed.has(ua.id) || landed.has(ub.id);
      const capY = TOPLINE - VIS_R[Math.min(MAXK, ua.k + 1)];
      const my0 = (pa.y + pb.y) / 2;
      const my = parentLanded ? Math.min(my0, capY) : my0;
      const va = ba.getLinearVelocity(), vb = bb.getLinearVelocity();
      fruits.delete(ua.id); fruits.delete(ub.id);
      world.destroyBody(ba); world.destroyBody(bb);
      const nk = ua.k + 1;
      if (nk > MAXK) {                         // ★수박+수박 = 소멸(통쾌 clear), 신규 스폰 없음
        clears.push({ f, x: +mx.toFixed(3), y: +my.toFixed(3), k: MAXK });
        if (ua.id === keystoneId || ub.id === keystoneId) { keystoneId = -1; keystoneTier = -1; }
        continue;
      }
      const nid = makeFruit(nk, mx, my, (va.x + vb.x) / 2, Math.min(0, (va.y + vb.y) / 2));   // 상승 속도 제거
      // 머지 산물의 착지 여부 = 부모 상속. 슈트서 낙하 중인 두 과일이 합쳐지면 산물도 아직 낙하 중.
      if (landed.has(ua.id) || landed.has(ub.id)) landed.add(nid);
      merges.push({ f, k: nk, x: +mx.toFixed(3), y: +my.toFixed(3), i: nid });
      if (ua.id === keystoneId || ub.id === keystoneId) { keystoneId = nid; keystoneTier = nk; }  // 키스톤 승계
    }
  }

  // ★클리어 = 강한 동티어 인력(substep)이 실제 머지 캐스케이드 구동 → 수박쌍 소멸 → 보드 소진(임의 destroy 없음).
  //   보드 소진되면 소티어 리필(새 사이클 시작감 = 루프 restart).
  if (CLEAR_START && f >= CLEAR_START) {
    if (f >= CLEAR_START + 118 && f >= nextRefillF && !dropBlocked()) {  // 캐스케이드 후 리필(S0 새 사이클 낙하)
      const k = Math.floor(rnd() * 3);
      const r = TIERS[k].r;
      const x = (rnd() - 0.5) * (W - 2 * r - 0.2);
      const id = makeFruit(k, x, H + 0.6);
      drops.push({ f, i: id, k, x: +x.toFixed(3) });
      nextRefillF = f + Math.round(FPS * (+args.refillEvery || 0.10));   // 리필 간격(성기게 = 프리즈용 clean 프레임 확보)
    }
  }

  // game over 판정 — 자연 빌드 페이즈만(키스톤은 의도적 고적재라 제외)
  if (gameOverF < 0 && f < KEY_START) {
    for (const [, b] of fruits) {
      const p = b.getPosition();
      const v = b.getLinearVelocity();
      if (p.y > TOPLINE && Math.hypot(v.x, v.y) < 0.4) { gameOverF = f; break; }
    }
  }

  framesOut.push(snapshot());
}

// ── 검증 지표 ────────────────────────────────────────────────────────────────
let maxK = 0, nanCount = 0, oobCount = 0;
for (const fr of framesOut) for (const o of fr) {
  if (o.k > maxK) maxK = o.k;
  if (!isFinite(o.x) || !isFinite(o.y)) nanCount++;
  if (o.x < -W / 2 - 1 || o.x > W / 2 + 1 || o.y < -1) oobCount++;
}
const lastCount = framesOut[framesOut.length - 1].length;

const out = {
  meta: { fps: FPS, frames: FRAMES, sub: SUB, dt: DT, seed: +args.seed || 12345, W, H, TOPLINE, wall: WALL },
  tiers: TIERS,
  frames: framesOut,
  merges, drops, clears, gameOverF,
  validate: { totalDrops: drops.length, totalMerges: merges.length, totalClears: clears.length, maxTierReached: maxK,
              finalBodies: lastCount, nan: nanCount, outOfBounds: oobCount },
};
const outPath = path.join(__dirname, 'suika_snaps.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('[OK] baked', outPath);
console.log('  frames=%d drops=%d merges=%d maxTier=%d(%s) finalBodies=%d gameOverF=%d nan=%d oob=%d',
  FRAMES, drops.length, merges.length, maxK, ['cherry','strawberry','grape','dekopon','orange','apple','pear','peach','pineapple','melon','watermelon'][maxK],
  lastCount, gameOverF, nanCount, oobCount);
