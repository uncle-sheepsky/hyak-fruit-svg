# ep3 라인 침범 게이트 — "낙하 이후 과일이 game-over 라인 위로 올라가지 않는다"(2026-07-08 사용자 규약).
#   판정 반경 = 렌더 실측(vec 실루엣 × BODY_FILL, 회전안전 최대반경) = suika_bake.cjs VIS_R 동일.
#   유예: 생성(드롭/머지) 후 GRACE 프레임 이내는 낙하 중이므로 허용.
#   대상: comp.html 이 실제로 노출하는 bake 프레임 전부(썸네일·콜드오픈·나레이션 슬로모·시연).
#   ★분수 bake(나레이션 슬로모·1.2배속 보간)는 추가 검사 불요: y+VIS_R ≤ TOPLINE 은 볼록 반평면이라
#     두 정수 프레임이 만족하면 그 볼록결합(선형보간)도 만족한다.
#   사용: python check_topline.py [BAKE_OFFSET BAKE_LIVE0 BAKE_FREEZE BAKE_THUMB]   (인자 미사용, comp v2 씬맵 고정)
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
VIS_R = [0.3958, 0.5533, 0.7311, 0.7747, 1.0770, 1.2999, 1.3737, 1.5929, 1.9794, 2.3545, 2.4357]
GRACE = 60
# comp.html v3 씬맵 상수(동기 유지 필수)
BAKE_LIVE0  = 595
BAKE_THUMB  = BAKE_LIVE0 + 1          # ★f0 배경 = f1 물리 프레임
NARR_B0, NARR_SLOW = 200, 0.45
CD_B0 = NARR_B0 + (399 - 30) * NARR_SLOW
DEMO_F0, DEMO_B0, DEMO_SPEED = 560, 456, 1.5
NF = 720

snap = json.load(open(os.path.join(HERE, 'suika_snaps.json'), encoding='utf-8'))
TOP = snap['meta']['TOPLINE']
F = snap['frames']
birth = {}
for d in snap['drops']:  birth[d['i']] = d['f']
for m in snap['merges']: birth[m['i']] = m['f']

# comp.html v2 씬맵 → video_f 별 노출 bake_f (분수는 floor/ceil 양끝 검사 = 볼록결합 커버)
def exposed():
    for vf in range(0, NF):
        if vf == 0:                 yield vf, BAKE_THUMB, 'THUMB'
        elif vf < 30:               yield vf, BAKE_LIVE0 + vf, 'LIVE'
        elif vf < 46:                                                  # NARR 페이드 구간만 물리 노출
            b = NARR_B0 + (vf - 30) * NARR_SLOW
            yield vf, int(b), 'NARR-FADE'
            if int(b) != b: yield vf, int(b) + 1, 'NARR-FADE'
        elif vf < 400:              continue                            # f46+ 완전 불투명 검정 = 물리 미노출
        elif vf < 520:              continue                      # BUILD 씬 = 물리 미노출(S4Render)
        elif vf < 560:
            t = (vf - 520) / 40.0; e = t * t * (3 - 2 * t)
            b = CD_B0 + (DEMO_B0 - CD_B0) * e
            yield vf, int(b), 'CD'
            if int(b) != b: yield vf, int(b) + 1, 'CD'
        else:
            b = DEMO_B0 + (vf - DEMO_F0) * DEMO_SPEED
            yield vf, int(b), 'S5'
            if int(b) != b: yield vf, int(b) + 1, 'S5'

viol = []
for vf, bf, scene in exposed():
    if bf < 0 or bf >= len(F):
        viol.append((vf, bf, scene, 'OUT_OF_BAKE', 0, 0)); continue
    for o in F[bf]:
        top = o['y'] + VIS_R[o['k']]
        if top <= TOP: continue
        age = bf - birth.get(o['i'], -999)
        if age > GRACE:
            viol.append((vf, bf, scene, f"id{o['i']} k{o['k']}", round(top, 3), age))

# 정지 노출(썸네일·해줘 프리즈)은 한 프레임을 오래 보여줌 → 유예 무관하게 "라인 위 과일 0" 권장(경고)
# 정지 노출 프레임은 썸네일(f0) 하나뿐 — 나머지 씬은 전부 물리가 흐른다(프리즈 폐지).
warn = []
for bf, tag in [(BAKE_THUMB, 'THUMB')]:
    if 0 <= bf < len(F):
        ab = [(o['i'], o['k'], round(o['y'] + VIS_R[o['k']], 2), bf - birth.get(o['i'], -999)) for o in F[bf]
              if o['y'] + VIS_R[o['k']] > TOP]
        if ab: warn.append((tag, bf, ab))

print(f"TOPLINE={TOP:.3f}  GRACE={GRACE}f  comp v3: LIVE0={BAKE_LIVE0} THUMB={BAKE_THUMB} NARR={NARR_B0}+{NARR_SLOW}x DEMO={DEMO_B0}+{DEMO_SPEED}x")
print(f"VIOLATIONS (age>{GRACE}f, top>TOPLINE): {len(viol)}")
for v in viol[:20]: print('  ', v)
print(f"WARN (정지 노출 프레임에 라인 위 과일): {len(warn)}")
for w in warn: print('  ', w)
print("GATE:", "PASS" if not viol else "FAIL")
sys.exit(0 if not viol else 1)
