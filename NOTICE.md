# NOTICE — 출처·라이선스 고지 / Attribution

이 저장소에는 **출처가 다른 두 묶음**이 섞여 있습니다. 파일 단위로 아래 표를 따르세요.
This repository mixes two provenances. Licensing is per file, per the table below.

## 1. Noto Emoji 유래 (Apache License 2.0)

Copyright Google Inc. — Noto Emoji, licensed under the Apache License, Version 2.0.
전문 = [`LICENSE-Apache-2.0.txt`](LICENSE-Apache-2.0.txt) · 원본 프로젝트 = https://github.com/googlefonts/noto-emoji

| 파일 | 원본 |
|---|---|
| `svg/01-cherry.svg` | Noto Emoji 🍒 |
| `svg/02-strawberry.svg` | Noto Emoji 🍓 |
| `svg/03-grape.svg` | Noto Emoji 🍇 |
| `svg/05-tangerine.svg` | Noto Emoji 🍊 |
| `svg/06-apple.svg` | Noto Emoji 🍎 |
| `svg/07-pear.svg` | Noto Emoji 🍐 |
| `svg/09-pineapple.svg` | Noto Emoji 🍍 |
| `svg/10-melon.svg` | Noto Emoji 🍈 |

`extra/fruit_vec.json` 안의 위 8종 항목은 이 SVG들의 **2차 저작물**이므로 동일하게 Apache-2.0을 따릅니다.
The corresponding entries inside `extra/fruit_vec.json` are derivative works of those SVGs and carry the same license.

## 2. 직접 그린 것 (CC0 1.0 / public domain)

@DURU-AI0503 채널에서 직접 그렸습니다. 귀속 불필요.
Drawn by the @DURU-AI0503 channel. No attribution required.

| 파일 | 사유 |
|---|---|
| `svg/04-persimmon.svg` | 감은 유니코드 이모지가 없음 |
| `svg/08-peach.svg` | Noto 원본이 방사형 그라디언트 → 평면 추출 시 초록 누수 → 재작성 |
| `svg/11-watermelon-whole.svg` | 이모지 세트의 수박이 전부 슬라이스(자른 단면) |
| `extra/svg2fruit.py` | 자작 추출기(외부 라이브러리 0) |
| `extra/fruit_vec.json` 중 위 3종 항목 | 위 SVG에서 추출 |

## 3. 파일명 정정

원본 작업 폴더에서는 자작 3종도 `noto_*.svg` 라는 이름을 달고 있었습니다(출처를 오도할 수 있는 이름). 이 저장소에서는 그 접두어를 떼고 티어 번호로 바꾸었습니다.
In the working tree the three original drawings were also named `noto_*.svg`, which misrepresented their source. That prefix is removed here.

## 4. engine/ — 영상에 쓴 게임 코드 (CC0 1.0)

`engine/suika_bake.cjs` · `engine/suika_render.js` · `engine/suika_snaps.json` · `engine/check_*.py` · `engine/verify.mjs` · `engine/index.html` = CC0 1.0.
`engine/fruit_vec.json`은 `extra/fruit_vec.json`의 위 표를 그대로 따릅니다. 추가로 들어 있는 잘린 수박(`watermelon`) 항목은 Noto Emoji 유래(Apache-2.0)입니다.
의존성 planck.js는 MIT이고 저장소에 포함하지 않았습니다(`npm install`).
