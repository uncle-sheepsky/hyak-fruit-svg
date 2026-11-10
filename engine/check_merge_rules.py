# ep3 머지 규칙 감사 — 게임 룰 위반 전수 검사.
#
#   ★주의: 한 프레임 = 물리 서브스텝 4회. 머지 산물이 **같은 프레임 안에서 다시 머지**될 수 있고,
#   그 중간 산물은 스냅샷에 남지 않는다. 따라서 프레임 id 차분만 보면 "단계 건너뜀"으로 오독한다.
#   → 로그(merges/clears/drops)를 규칙 모형으로 삼고, **프레임 스냅샷과 티어별 수지(收支)** 로 교차검증한다.
#
#   검사 규칙
#     R1 단계 무결      : 모든 머지 산물 티어 k 는 부모 티어 k-1 소비 2개로만 생김(로그 구조상 보장 → 수지로 검증)
#     R2 수박쌍 소멸    : k=10 쌍은 생성 없이 소멸 (authored, 기획서 명시)
#     R3 티어별 수지    : 프레임별 tier t 개수 변화 == (t 생성: 머지산물+드롭) − (t 소비: 2×머지(k=t+1) + 2×클리어(t=10))
#     R4 스폰 출처      : 스냅샷에 새로 나타난 id 는 반드시 drops 또는 merges 산물
#     R5 id 재사용 금지 : 사라진 id 재등장 금지
#     R6 드롭 티어      : 비키스톤 드롭은 원작 규칙 0..SPAWN_MAXK(4). 키스톤 사다리는 authored 예외로 분리 집계
#     R7 동일과일 재투입: **최고 티어(수박) 이후 동일 티어 과일이 드롭으로 재투입되지 않는가**(사용자 질의)
#   사용: python check_merge_rules.py [LO HI]
import json, os, sys
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
s = json.load(open(os.path.join(HERE, 'suika_snaps.json'), encoding='utf-8'))
F = s['frames']
LO = int(sys.argv[1]) if len(sys.argv) > 1 else 1
HI = int(sys.argv[2]) if len(sys.argv) > 2 else len(F) - 1
SPAWN_MAXK, MAXK = 4, 10

drops_by_f, merges_by_f, clears_by_f = defaultdict(list), defaultdict(list), defaultdict(list)
for d in s['drops']:  drops_by_f[d['f']].append(d)
for m in s['merges']: merges_by_f[m['f']].append(m)
for c in s['clears']: clears_by_f[c['f']].append(c)

viol = []
merge_ids = {m['i'] for m in s['merges']}
drop_ids = {d['i'] for d in s['drops']}
gone = set()
intermediates = []          # 같은 프레임 안에서 다시 머지되어 스냅샷에 안 남는 산물

for f in range(1, len(F)):
    prev = {o['i']: o for o in F[f - 1]}
    cur = {o['i']: o for o in F[f]}
    added = [cur[i] for i in cur if i not in prev]
    removed = [prev[i] for i in prev if i not in cur]

    for o in added:
        if o['i'] in gone and LO <= f <= HI:
            viol.append((f, 'R5', f"id{o['i']} 재등장"))
    for o in removed: gone.add(o['i'])
    if not (LO <= f <= HI):
        continue

    # R4 스폰 출처
    for o in added:
        if o['i'] not in drop_ids and o['i'] not in merge_ids:
            viol.append((f, 'R4', f"출처 불명 생성 id{o['i']} k{o['k']}"))

    # R6 드롭 티어
    for d in drops_by_f[f]:
        if not d.get('key') and d['k'] > SPAWN_MAXK:
            viol.append((f, 'R6', f"비키스톤 드롭 티어 {d['k']} > {SPAWN_MAXK}"))

    # R3 티어별 수지
    before, after = Counter(o['k'] for o in F[f - 1]), Counter(o['k'] for o in F[f])
    produced, consumed = Counter(), Counter()
    for d in drops_by_f[f]:  produced[d['k']] += 1
    for m in merges_by_f[f]:
        produced[m['k']] += 1
        consumed[m['k'] - 1] += 2                      # R1: 부모는 정확히 k-1 두 개
    for c in clears_by_f[f]: consumed[MAXK] += 2       # R2
    for t in range(MAXK + 1):
        expect = produced[t] - consumed[t]
        actual = after[t] - before[t]
        if expect != actual:
            viol.append((f, 'R3', f"티어 {t} 수지 불일치: 예상 {expect:+d}, 실제 {actual:+d}"))

    # 같은 프레임 내 재머지(중간 산물) 표시
    for m in merges_by_f[f]:
        if m['i'] not in cur:
            intermediates.append((f, m['k'], m['i']))

# R7 동일과일 재투입 (수박 최초 생성 이후 수박 드롭 여부 / 각 티어별 드롭 최고치)
wm = [m['f'] for m in s['merges'] if m['k'] == MAXK]
first_wm = min(wm) if wm else None
redrop = [d for d in s['drops'] if first_wm is not None and d['f'] > first_wm and d['k'] >= MAXK]
if redrop: viol.append((redrop[0]['f'], 'R7', f"수박 생성 후 수박 드롭 {len(redrop)}건"))

keys = [d for d in s['drops'] if d.get('key') and LO <= d['f'] <= HI]
nat = [d for d in s['drops'] if not d.get('key') and LO <= d['f'] <= HI]
lm = [m for m in s['merges'] if LO <= m['f'] <= HI]
lc = [c for c in s['clears'] if LO <= c['f'] <= HI]

print(f"감사 구간 bake[{LO},{HI}]   (video = bake - 16)")
print(f"  머지 {len(lm)}건 · 수박쌍 소멸 {len(lc)}건 · 드롭 {len(keys)+len(nat)}건(키스톤 authored {len(keys)} / 자연·측면·리필 {len(nat)})")
print(f"  머지 티어 분포 {dict(sorted(Counter(m['k'] for m in lm).items()))}")
print(f"  키스톤 드롭 티어 {sorted({d['k'] for d in keys})}  · 비키스톤 드롭 티어 {sorted({d['k'] for d in nat})}")
print(f"  동일 프레임 재머지(중간 산물, 스냅샷 미출현) {len(intermediates)}건 — 서브스텝 연쇄, 규칙 위반 아님")
for x in intermediates[:8]: print(f"     bake {x[0]} video {x[0]-16}: k{x[1]} 산물(id{x[2]})이 같은 프레임에 재머지")
print(f"\n위반 {len(viol)}건")
for v in viol[:20]: print(f"  bake {v[0]} video {v[0]-16} [{v[1]}] {v[2]}")
print("GATE:", "PASS" if not viol else "FAIL")
sys.exit(0 if not viol else 1)
