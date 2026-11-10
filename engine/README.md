# 수박게임 엔진 — 영상에 쓴 코드 그대로

「아낌없이 주는 두루」 수박게임 영상의 게임 화면을 만든 코드입니다. 마지막 판(v18)에 쓴 파일을 한 글자도 안 고치고 올렸습니다.
The code behind the Suika-game video, exactly as used for its final version (v18).

## 바로 돌려 보기

Node 하나면 됩니다.

```bash
cd engine
npm install
node verify.mjs
```

물리를 빈 폴더에서 다시 구워 저장소의 스냅샷과 맞대 보고, 영상에 나온 숫자를 파일에서 다시 잽니다. 이 저장소를 만들 때 나온 값입니다.

```text
PASS  V1 다시 구운 물리 = 저장소 스냅샷  146c0dd6500de834
PASS  V2 드롭 수 · 원작에서 안 떨어지는 단계  83 · 16
PASS  V3 수박은 떨어뜨리지 않고 합쳐서 생김  첫 수박 프레임 576
PASS  V4 물리 이상 없음  NaN 0 · 벽 밖 0 · 게임오버 -1
PASS  V5 수박 하나에 체리  2^10 = 1024
PASS  V6 딸기 곡선 · 겹  147 · 18
PASS  V7 복숭아 몸통과 그림자는 도는 방향이 반대  1.92 · -0.98
PASS  V8 얼굴은 몸통 한 겹으로만 자름  clipFaceToBody
전부 통과
```

화면으로 보려면 정적 서버로 엽니다.

```bash
python -m http.server 8732
```

`http://127.0.0.1:8732/index.html` — 슬라이더로 프레임을 옮기거나 재생을 누릅니다.

검사 스크립트도 그대로 들어 있습니다.

```bash
python check_snaps.py        # 순간이동 검사
python check_topline.py      # 게임오버 줄 위로 올라갔는지 검사(당시 영상의 장면 구성 기준)
python check_merge_rules.py  # 합체 규칙 위반 전수 검사
```

## 파일

| 파일 | 하는 일 |
|---|---|
| `suika_bake.cjs` | planck.js 물리를 고정 시간 간격·고정 시드로 한 번 돌려 프레임별 좌표를 굽습니다 |
| `suika_snaps.json` | 구운 결과. 영상은 이 파일을 읽습니다 |
| `suika_render.js` | 프레임 번호를 받아 캔버스에 그립니다. 물리 계산은 안 합니다 |
| `fruit_vec.json` | 과일 모양 좌표(`extra/fruit_vec.json`과 같은 데이터 + 잘린 수박 1종) |
| `check_*.py` | 위 검사 3종 |
| `verify.mjs` · `index.html` | 확인용(이 저장소에서 새로 만든 파일) |

영상에 쓴 베이크 인자:

```bash
node suika_bake.cjs --frames 840 --seed 12345 --keyStart 300 --keyStep 23 --sideEvery 0.28 --clearStart 596 --clearAttract 20000 --refillEvery 0.6
```

## 알고 쓰세요

- **수박은 저절로 안 나옵니다.** 수박 하나에 체리가 1,024개 필요해서 짧은 영상에선 나올 수 없습니다. 그래서 어떤 과일을 어디에 떨어뜨릴지 스크립트에 넣었습니다. 드롭 83개 중 16개는 원작에선 안 떨어지는 단계입니다. 물리와 합체는 실제 계산입니다.
- **뒤쪽 클리어 장면은 연출입니다.** 같은 과일끼리 끌어당기는 힘(`--clearAttract`)을 넣었습니다.
- **다시 구운 값이 같으려면 같은 컴퓨터 환경이 필요할 수 있습니다.** 다른 컴퓨터에서는 부동소수 차이로 스냅샷이 달라질 수 있어서, `verify.mjs`는 그 경우 실패 대신 `DIFF`로 알려 줍니다. 화면은 저장소 스냅샷으로 언제나 재현됩니다.
- 화면 왼쪽 위 작은 글씨와 `SUIKA` 표시는 당시 영상에 쓴 그대로입니다. 과일 합체 퍼즐은 상용 게임과 규칙이 같습니다. 자기 작품에 쓸 때 원작의 이름·로고·아트·사운드·음악은 가져다 쓰지 마세요.
- 영상 연출(내레이션·자막·장면 합성)과 음악, 캐릭터 그림은 들어 있지 않습니다.

## 라이선스

엔진 코드(`suika_bake.cjs`·`suika_render.js`·`check_*.py`·`verify.mjs`·`index.html`)와 `suika_snaps.json`은 [CC0 1.0](../LICENSE-CC0-1.0.txt)입니다. `fruit_vec.json`은 파일 안 항목마다 다릅니다([`NOTICE.md`](../NOTICE.md)). planck.js(MIT)는 `npm install`로 받으며 저장소에 포함하지 않았습니다.
