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

## 라이선스 / License

- **Noto Emoji 유래 8종** — Apache License 2.0. 전문 = [`LICENSE-Apache-2.0.txt`](LICENSE-Apache-2.0.txt), 출처·고지 = [`NOTICE.md`](NOTICE.md). 상업 이용 가능, 저작권 고지 유지 필요.
- **직접 그린 3종 + `fruit_vec.json`의 해당 항목 + `svg2fruit.py`** — [CC0 1.0](LICENSE-CC0-1.0.txt) (퍼블릭 도메인 기증, 귀속 불필요).
- `fruit_vec.json`의 Noto 유래 8종 항목은 원본의 2차 저작물이므로 **Apache-2.0**을 따릅니다.

파일별 판정은 [`NOTICE.md`](NOTICE.md)에 표로 있습니다. / Per-file breakdown is in [`NOTICE.md`](NOTICE.md).
