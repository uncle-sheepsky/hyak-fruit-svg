# ep3 순간이동 게이트 — enforceTopline / 머지 스폰 보정이 만드는 "비물리 점프" 검출.
#
#   왜 단순 가속 임계가 아닌가: 클리어 캐스케이드는 동티어 인력(strength 20000, 수평·하향 무제한)이
#   중력의 수십 배 가속을 정당하게 만든다. "가속이 g보다 크다"는 판정 기준이 못 된다.
#   진짜 결함은 **거의 멈춰 있던 바디가 한 프레임 만에 크게 순간이동**하는 것(구 하드 클램프 증상, 최대 318px).
#     ① 돌발: 직전 프레임 하강량 < REST_DY 인데 이번 프레임 하강량 > BURST_DY
#     ② 절대: 한 프레임 하강량 > HARD_DY (어떤 힘으로도 정당화 안 되는 크기)
#   사용: python check_snaps.py [BAKE_LO BAKE_HI]   (기본 = S5 노출창 bake416-735)
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LO = int(sys.argv[1]) if len(sys.argv) > 1 else 416
HI = int(sys.argv[2]) if len(sys.argv) > 2 else 735
SCALE = 120          # px/m (suika_render)
REST_DY = 0.15       # m/frame — 사실상 정지
BURST_DY = 0.70      # m/frame — 정지 상태서 이만큼 튀면 비물리(=84px)
HARD_DY = 2.00       # m/frame — 절대 상한(=240px). 자유낙하 최대는 0.8m/frame(13.4m 낙하 = 23.9m/s)이므로
                     #   그 이상은 전부 인력 슬램(의도된 캐스케이드 연출). 실측 최대 1.604m/frame(bake707, 파인애플).
                     #   2.0 = 실측 최대의 1.25배 = 회귀 감시선.

s = json.load(open(os.path.join(HERE, 'suika_snaps.json'), encoding='utf-8'))
F = s['frames']
prev, burst, hard = {}, [], []
for b in range(1, len(F)):
    a = {o['i']: o for o in F[b - 1]}
    for o in F[b]:
        i = o['i']
        if i in a:
            dy = a[i]['y'] - o['y']                      # 양수 = 하강
            p = prev.get(i)
            if LO <= b <= HI:
                if p is not None and p < REST_DY and dy > BURST_DY:
                    burst.append((b, i, o['k'], round(p, 3), round(dy, 3), round(dy * SCALE)))
                if dy > HARD_DY:
                    hard.append((b, i, o['k'], round(dy, 3), round(dy * SCALE)))
            prev[i] = dy

print(f"노출창[{LO},{HI}]")
print(f"  (1) 돌발 순간이동 (직전 dy<{REST_DY} -> dy>{BURST_DY}): {len(burst)}")
for x in sorted(burst, key=lambda z: -z[5])[:6]: print(f"      bake {x[0]} id{x[1]} k{x[2]}  {x[3]} -> {x[4]} m = {x[5]}px")
print(f"  (2) 절대 초과 (dy>{HARD_DY} m/frame): {len(hard)}")
for x in sorted(hard, key=lambda z: -z[4])[:6]: print(f"      bake {x[0]} id{x[1]} k{x[2]}  {x[3]} m = {x[4]}px")
fail = len(burst) + len(hard)
print("GATE:", "PASS" if fail == 0 else "FAIL")
sys.exit(0 if fail == 0 else 1)
