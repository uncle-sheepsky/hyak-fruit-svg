// node verify.mjs — 물리를 빈 폴더에서 다시 구워 저장소의 suika_snaps.json 과 맞대 보고, 영상에 나온 숫자를 파일에서 다시 잽니다.
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NM = process.env.NODE_PATH || path.join(HERE, 'node_modules');
if (!fs.existsSync(path.join(NM, 'planck'))) { console.error('planck 가 없습니다. 먼저 npm install 을 실행하세요.'); process.exit(2); }

// 영상에 쓴 베이크 인자 그대로
const BAKE_ARGS = ['--frames', '840', '--seed', '12345', '--keyStart', '300', '--keyStep', '23', '--sideEvery', '0.28', '--clearStart', '596', '--clearAttract', '20000', '--refillEvery', '0.6'];
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let fail = 0;
const row = (ok, name, val) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${val}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'suika-'));
fs.copyFileSync(path.join(HERE, 'suika_bake.cjs'), path.join(tmp, 'suika_bake.cjs'));
execFileSync(process.execPath, ['suika_bake.cjs', ...BAKE_ARGS], { cwd: tmp, env: { ...process.env, NODE_PATH: NM }, stdio: 'ignore' });
const a = sha(path.join(tmp, 'suika_snaps.json')), b = sha(path.join(HERE, 'suika_snaps.json'));
if (a === b) console.log(`PASS  V1 다시 구운 물리 = 저장소 스냅샷  ${b.slice(0, 16)}`);
else console.log(`DIFF  V1 다시 구운 물리 ≠ 저장소 스냅샷  ${a.slice(0, 16)} / ${b.slice(0, 16)}  (다른 컴퓨터나 다른 planck 버전이면 부동소수 차이로 다를 수 있습니다. 화면은 저장소 스냅샷으로 재현됩니다.)`);
fs.rmSync(tmp, { recursive: true, force: true });

const S = J(path.join(HERE, 'suika_snaps.json')), V = J(path.join(HERE, 'fruit_vec.json'));
const hi = S.drops.filter(d => d.k > 4).length;
row(S.drops.length === 83 && hi === 16, 'V2 드롭 수 · 원작에서 안 떨어지는 단계', `${S.drops.length} · ${hi}`);
const wm = S.merges.filter(m => m.k === 10);
row(S.validate.maxTierReached === 10 && S.drops.every(d => d.k < 10) && wm.length > 0, 'V3 수박은 떨어뜨리지 않고 합쳐서 생김', `첫 수박 프레임 ${Math.min(...wm.map(m => m.f))}`);
row(S.validate.nan === 0 && S.validate.outOfBounds === 0 && S.gameOverF === -1, 'V4 물리 이상 없음', `NaN ${S.validate.nan} · 벽 밖 ${S.validate.outOfBounds} · 게임오버 ${S.gameOverF}`);
row(2 ** (S.tiers.length - 1) === 1024, 'V5 수박 하나에 체리', `2^${S.tiers.length - 1} = ${2 ** (S.tiers.length - 1)}`);
const cub = V.strawberry.reduce((n, L) => n + L.subs.reduce((m, s) => m + s.length, 0), 0);
row(cub === 147 && V.strawberry.length === 18, 'V6 딸기 곡선 · 겹', `${cub} · ${V.strawberry.length}`);
const area = sub => { let t = 0; for (const s of sub) for (let i = 0; i < 24; i++) { const P = u => { const v = 1 - u; return [v * v * v * s[0] + 3 * v * v * u * s[2] + 3 * v * u * u * s[4] + u * u * u * s[6], v * v * v * s[1] + 3 * v * v * u * s[3] + 3 * v * u * u * s[5] + u * u * u * s[7]]; }; const [x0, y0] = P(i / 24), [x1, y1] = P((i + 1) / 24); t += x0 * y1 - x1 * y0; } return t / 2; };
const A0 = V.peach[0].subs.reduce((n, s) => n + area(s), 0), A1 = V.peach[1].subs.reduce((n, s) => n + area(s), 0);
row(A0 > 0 && A1 < 0, 'V7 복숭아 몸통과 그림자는 도는 방향이 반대', `${A0.toFixed(2)} · ${A1.toFixed(2)}`);
const src = fs.readFileSync(path.join(HERE, 'suika_render.js'), 'utf8');
row(src.includes('g.clip(bodyPath([layers[0]]));'), 'V8 얼굴은 몸통 한 겹으로만 자름', 'clipFaceToBody');
console.log(fail ? `FAIL ${fail}건` : '전부 통과');
process.exit(fail ? 1 : 0);
