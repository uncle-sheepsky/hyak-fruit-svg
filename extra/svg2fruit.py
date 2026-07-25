# svg2fruit.py — 벡터(SVG) 과일에서 수학적 형태 추출: path → 절대 큐빅 베지어 → 단위 정규화 JSON.
# 소스: Noto Emoji (Apache 2.0, 라이선스-클린). 산출 = 순수 수치 데이터(캔버스 Path2D 재생용).
import re, json, sys, xml.etree.ElementTree as ET

NS = {'svg': 'http://www.w3.org/2000/svg'}
TOK = re.compile(r'[MmCcSsLlHhVvQqTtAaZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?')

def parse_d(d):
    """path d → 절대 큐빅 세그먼트 리스트 [[x0,y0, c1x,c1y, c2x,c2y, x1,y1]...] (서브패스별)."""
    toks = TOK.findall(d); i = 0
    x = y = sx = sy = 0.0; px = py = None  # 이전 제어점(S/T 반사용)
    subs = []; cur = None; cmd = None
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    while i < len(toks):
        t = toks[i]
        if t.isalpha(): cmd = t; i += 1
        rel = cmd.islower(); C = cmd.upper()
        if C == 'M':
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            x, y = nx, ny; sx, sy = x, y
            cur = {'start': [x, y], 'segs': []}; subs.append(cur); px = py = None
            cmd = 'l' if rel else 'L'  # 후속 좌표쌍 = 암시적 lineto
        elif C == 'L':
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            cur['segs'].append([x, y, x + (nx - x) / 3, y + (ny - y) / 3, nx - (nx - x) / 3, ny - (ny - y) / 3, nx, ny])
            x, y = nx, ny; px = py = None
        elif C == 'H':
            nx = num(); nx = nx + x if rel else nx
            cur['segs'].append([x, y, x + (nx - x) / 3, y, nx - (nx - x) / 3, y, nx, y]); x = nx; px = py = None
        elif C == 'V':
            ny = num(); ny = ny + y if rel else ny
            cur['segs'].append([x, y, x, y + (ny - y) / 3, x, ny - (ny - y) / 3, x, ny]); y = ny; px = py = None
        elif C == 'C':
            c1x, c1y, c2x, c2y, nx, ny = (num() for _ in range(6))
            if rel: c1x += x; c1y += y; c2x += x; c2y += y; nx += x; ny += y
            cur['segs'].append([x, y, c1x, c1y, c2x, c2y, nx, ny])
            px, py = c2x, c2y; x, y = nx, ny
        elif C == 'S':
            c2x, c2y, nx, ny = (num() for _ in range(4))
            if rel: c2x += x; c2y += y; nx += x; ny += y
            c1x = 2 * x - px if px is not None else x; c1y = 2 * y - py if py is not None else y
            cur['segs'].append([x, y, c1x, c1y, c2x, c2y, nx, ny])
            px, py = c2x, c2y; x, y = nx, ny
        elif C == 'Q':
            qx, qy, nx, ny = (num() for _ in range(4))
            if rel: qx += x; qy += y; nx += x; ny += y
            cur['segs'].append([x, y, x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny), nx, ny])
            px, py = qx, qy; x, y = nx, ny
        elif C == 'T':
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            qx = 2 * x - px if px is not None else x; qy = 2 * y - py if py is not None else y
            cur['segs'].append([x, y, x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny), nx, ny])
            px, py = qx, qy; x, y = nx, ny
        elif C == 'A':  # 호 → 직선 근사(이모지에 드묾, 경고)
            _rx, _ry, _rot, _laf, _sf, nx, ny = (num() for _ in range(7))
            if rel: nx += x; ny += y
            print(f'  [warn] Arc→line 근사', file=sys.stderr)
            cur['segs'].append([x, y, x + (nx - x) / 3, y + (ny - y) / 3, nx - (nx - x) / 3, ny - (ny - y) / 3, nx, ny])
            x, y = nx, ny; px = py = None
        elif C == 'Z':
            if (x, y) != (sx, sy):
                cur['segs'].append([x, y, x + (sx - x) / 3, y + (sy - y) / 3, sx - (sx - x) / 3, sy - (sy - y) / 3, sx, sy])
            x, y = sx, sy; px = py = None; i += 0
        else:
            i += 1
    return subs

def extract(svg_path):
    root = ET.parse(svg_path).getroot()
    vb = [float(v) for v in root.get('viewBox', '0 0 128 128').split()]
    cx, cy = vb[0] + vb[2] / 2, vb[1] + vb[3] / 2
    R = max(vb[2], vb[3]) / 2
    # gradient id → 대표 solid 색(첫 불투명 stop): url(#id) fill 해결(그라디언트 미지원 → 근사)
    grad = {}
    for el in root.iter():
        if el.tag.split('}')[-1] in ('linearGradient', 'radialGradient'):
            gid = el.get('id')
            for st in el.iter():
                if st.tag.split('}')[-1] == 'stop':
                    sty = dict(p.split(':') for p in (st.get('style') or '').split(';') if ':' in p)
                    col = st.get('stop-color') or sty.get('stop-color')
                    op = st.get('stop-opacity') or sty.get('stop-opacity') or '1'
                    if col and float(op) > 0.5 and gid not in grad: grad[gid] = col
    layers = []
    for el in root.iter():
        tag = el.tag.split('}')[-1]
        fill = el.get('fill') or (dict(p.split(':') for p in (el.get('style') or '').split(';') if ':' in p).get('fill'))
        if fill and fill.startswith('url(') :   # 그라디언트 → 대표 stop색
            gid = fill[fill.find('#') + 1:fill.rfind(')')].rstrip(') ')
            fill = grad.get(gid, '#cccccc')
        if tag == 'path' and el.get('d'):
            # path 요소 = 1레이어(서브패스 그룹 유지 = nonzero 구멍 보존). 정규화: 중심→원점, R→1(y-down 캔버스계).
            subs_n = []
            for sub in parse_d(el.get('d')):
                segs = [[round((v - (cx if j % 2 == 0 else cy)) / R, 4) for j, v in enumerate(s)] for s in sub['segs']]
                if segs: subs_n.append(segs)
            if subs_n: layers.append({'fill': fill or '#000', 'subs': subs_n})
        elif tag in ('circle', 'ellipse'):
            ex = float(el.get('cx', 0)); ey = float(el.get('cy', 0))
            rx = float(el.get('rx', el.get('r', 0))); ry = float(el.get('ry', el.get('r', 0)))
            k = 0.5523
            pts = []
            for dx, dy, c1, c2 in [((rx, 0), (0, ry), (rx, ry * k), (rx * k, ry))]: pass
            # 4호 큐빅 원 근사
            segs = []
            P = [(ex + rx, ey), (ex, ey + ry), (ex - rx, ey), (ex, ey - ry)]
            CPs = [((ex + rx, ey + ry * k), (ex + rx * k, ey + ry)), ((ex - rx * k, ey + ry), (ex - rx, ey + ry * k)),
                   ((ex - rx, ey - ry * k), (ex - rx * k, ey - ry)), ((ex + rx * k, ey - ry), (ex + rx, ey - ry * k))]
            for qi in range(4):
                x0, y0 = P[qi]; x1, y1 = P[(qi + 1) % 4]; (c1x, c1y), (c2x, c2y) = CPs[qi]
                segs.append([round((x0 - cx) / R, 4), round((y0 - cy) / R, 4), round((c1x - cx) / R, 4), round((c1y - cy) / R, 4),
                             round((c2x - cx) / R, 4), round((c2y - cy) / R, 4), round((x1 - cx) / R, 4), round((y1 - cy) / R, 4)])
            layers.append({'fill': fill or '#000', 'subs': [segs]})
    return layers

if __name__ == '__main__':
    out = {}
    for name, fn in [('watermelon', 'noto_watermelon.svg'), ('strawberry', 'noto_strawberry.svg')]:
        L = extract(fn)
        nseg = sum(len(s) for l in L for s in l['subs'])
        print(f'{name}: layers={len(L)} cubic segs={nseg}')
        out[name] = L
    with open('fruit_vec.json', 'w') as f:
        json.dump(out, f)
    print('[OK] fruit_vec.json', end=' ')
    import os; print(os.path.getsize('fruit_vec.json'), 'bytes')
