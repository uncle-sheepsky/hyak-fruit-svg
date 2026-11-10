# Fruit SVG × 11 — from the DURU-AI video

수박게임 영상에 쓴 **과일 11종 SVG**와, 그 SVG에서 뽑아낸 **정규화 베지어 좌표(JSON)**, **추출기 코드**입니다.
The 11 fruit SVGs used in the video, plus the normalized cubic-Bézier data extracted from them and the extractor script.

📺 https://www.youtube.com/@DURU-AI0503

---

## ⬇️ 바로 받기 / Direct download

**[fruit-svg-11.zip](https://github.com/uncle-sheepsky/hyak-fruit-svg/releases/latest/download/fruit-svg-11.zip)** — 전체 묶음 (SVG 11 + JSON + 추출기 + 라이선스)

개별 파일은 [`svg/`](svg) 폴더에서 받으면 됩니다. / Individual files live in [`svg/`](svg).

---

## 목록 / Contents

티어 순서 = 게임에서 합쳐지는 순서. / Tier order = the merge order in the game.

| # | 파일 | 과일 | 출처 / Source | 라이선스 | 큐빅 세그먼트 |
|---|---|---|---|---|---|
| 01 | `svg/01-cherry.svg` | 체리 | Noto Emoji | Apache-2.0 | 69 |
| 02 | `svg/02-strawberry.svg` | 딸기 | Noto Emoji | Apache-2.0 | **147** |
| 03 | `svg/03-grape.svg` | 포도 | Noto Emoji | Apache-2.0 | 136 |
| 04 | `svg/04-persimmon.svg` | 감 | **직접 그림 / original** | CC0-1.0 | 34 |
| 05 | `svg/05-tangerine.svg` | 귤 | Noto Emoji | Apache-2.0 | 54 |
| 06 | `svg/06-apple.svg` | 사과 | Noto Emoji | Apache-2.0 | 52 |
| 07 | `svg/07-pear.svg` | 배 | Noto Emoji | Apache-2.0 | 47 |
| 08 | `svg/08-peach.svg` | 복숭아 | **직접 그림 / original** | CC0-1.0 | 24 |
| 09 | `svg/09-pineapple.svg` | 파인애플 | Noto Emoji | Apache-2.0 | 116 |
| 10 | `svg/10-melon.svg` | 멜론 | Noto Emoji | Apache-2.0 | 487 |
| 11 | `svg/11-watermelon-whole.svg` | 수박(통) | **직접 그림 / original** | CC0-1.0 | 16 |

영상에서 세던 **147**은 02번 딸기의 큐빅 베지어 세그먼트 개수입니다.
The **147** counted on screen is the number of cubic-Bézier segments in fruit 02.

자작 3종 사유 — 감은 유니코드 이모지가 없고, 통수박은 이모지 세트가 전부 슬라이스(자른 단면)뿐이고, 복숭아는 원본이 방사형 그라디언트라 평면 추출에서 색이 새어 다시 그렸습니다.
Why 3 are original: 감/persimmon has no Unicode emoji, whole watermelon exists only as a slice in emoji sets, and the peach used a radial gradient that leaked color when flattened.

---

## extra/ — 좌표 데이터와 추출기

### `extra/fruit_vec.json`
SVG path를 **절대 큐빅 세그먼트**로 통일하고 viewBox 중심·반경 기준으로 **단위 정규화**(r=1, y-down)한 데이터입니다.

```
{ "<fruit>": [ { "fill": "#rrggbb", "subs": [ [ [x0,y0, c1x,c1y, c2x,c2y, x1,y1], ... ] ] } ] }
```
`subs` = 서브패스 그룹(구멍 nonzero 보존). 한 원소 = 큐빅 1개.

재생 계약 / Playback contract:

```js
for (const L of V[name]) {
  const p = new Path2D();
  for (const sub of L.subs) {
    p.moveTo(sub[0][0], sub[0][1]);
    for (const s of sub) p.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]);
    p.closePath();
  }
  ctx.fillStyle = L.fill; ctx.fill(p);
}
```
`translate(px,py) · rotate(a) · scale(r_px)` 아래서 그대로 동작합니다(회전·스쿼시와 합성 가능).

### `extra/svg2fruit.py`
의존성 0(표준 라이브러리만). 정규식 토크나이저 + 상태머신으로 `M/L/H/V/C/S/Q/T/A/Z` 전 명령을 **절대 큐빅**으로 통일합니다. 호(A)는 직선 근사 + 경고, 그라디언트는 첫 stop 색으로 해결.

```bash
python svg2fruit.py            # svgs/*.svg → fruit_vec.json
```

---

## demo-engine/ — 게임을 처음부터 다시 만드는 프롬프트

영상에 나온 물리 시연을 **영상 편집 프로그램 없이** 재현하는 STEP 0~8 프롬프트입니다. AI 코딩 에이전트에 그대로 붙여넣습니다.
The step-by-step prompts that rebuild the physics demo from scratch — paste them into an AI coding agent.

**[demo-engine/PROMPTS.md](demo-engine/PROMPTS.md)** · 개요 = [demo-engine/README.md](demo-engine/README.md)

| STEP | 내용 |
|---|---|
| 0~1 | 환경 · 과일 SVG → 정규화 큐빅 베지어 (이 저장소 자료로 대체 가능) |
| 2 | planck.js 강체 물리를 고정 dt·고정 시드로 **오프라인 베이크** → 프레임 스냅샷 JSON |
| 3 | **게임오버 라인 규약** — 판정 반경·착지 판정·보정 상한·머지 산물 스폰 상한 |
| 4 | authored 클라이맥스(키스톤 사다리)와 클리어 캐스케이드 |
| 5~6 | 캔버스 렌더러 · 시크 하네스 · Playwright 캡처 · ffmpeg mux |
| 7~8 | 검증 게이트(결정론 SHA·라인·순간이동·육안) · 음악 비트락 · 다른 게임으로 교체 |

게임 화면 전체가 **정수 프레임 f 하나만 받는 순수 함수**입니다(`window.__seekF(f)`). 그래서 같은 프레임은 언제 렌더해도 같은 픽셀입니다.

### `extra/preview.html`
`fruit_vec.json`을 Path2D로 재생해 눈으로 확인하는 뷰어. 회전은 프레임의 순수 함수라 슬라이더를 앞뒤로 훑어도 같은 f는 같은 그림입니다.
`fetch`를 쓰므로 정적 서버로 여세요: `python -m http.server 8732` → `http://127.0.0.1:8732/extra/preview.html`

---

## engine/ — 영상에 쓴 게임 코드

마지막 판(v18)의 물리 베이크·렌더러·스냅샷·검사 스크립트를 그대로 올렸습니다. `cd engine && npm install && node verify.mjs` 로 물리를 다시 구워 대조할 수 있습니다. 코드는 CC0입니다.
The final game code (physics bake, renderer, snapshot, check scripts), unchanged. Code is CC0.

**[engine/README.md](engine/README.md)**

---

## 라이선스 / License

- **Noto Emoji 유래 8종** — Apache License 2.0. 전문 = [`LICENSE-Apache-2.0.txt`](LICENSE-Apache-2.0.txt), 출처·고지 = [`NOTICE.md`](NOTICE.md). 상업 이용 가능, 저작권 고지 유지 필요.
- **직접 그린 3종 + `fruit_vec.json`의 해당 항목 + `svg2fruit.py`** — [CC0 1.0](LICENSE-CC0-1.0.txt) (퍼블릭 도메인 기증, 귀속 불필요).
- **`engine/` 코드와 `suika_snaps.json`** — [CC0 1.0](LICENSE-CC0-1.0.txt). `engine/fruit_vec.json`은 `extra/fruit_vec.json`과 같은 기준(파일별 표는 [`NOTICE.md`](NOTICE.md)). planck.js(MIT)는 npm으로 받으며 포함하지 않았습니다.
- `fruit_vec.json`의 Noto 유래 8종 항목은 원본의 2차 저작물이므로 **Apache-2.0**을 따릅니다.

파일별 판정은 [`NOTICE.md`](NOTICE.md)에 표로 있습니다. / Per-file breakdown is in [`NOTICE.md`](NOTICE.md).
