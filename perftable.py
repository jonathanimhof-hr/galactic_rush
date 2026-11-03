"""Markdown table from tests/fixedbench.py output, pairing two builds view by view (V6).
usage: python3 tests/perftable.py fixedbench.json [OLD_BUILD_NAME NEW_BUILD_NAME] > table.md"""
import sys, json, math
rows = json.load(open(sys.argv[1])); builds = []
for r in rows:
    if r['build'] not in builds: builds.append(r['build'])
old, new = (sys.argv[2], sys.argv[3]) if len(sys.argv) > 3 else (builds[0], builds[-1])
key = lambda r: (r['course'], r['preset'], r['view'])
O = {key(r): r for r in rows if r['build'] == old}; N = {key(r): r for r in rows if r['build'] == new}
NAMES = {'spire': 'Neon Spire', 'belt': 'Cinder Belt', 'foundry': 'Foundry Trench', 'ring': 'Halo of Vashti'}
f = lambda v: f'{v:,.0f}'
print(f'| Course, preset, view (camera position) | render size | {old} avg / median / p95 (ms) | {new} avg / median / p95 (ms) | new / old (avg) | fps old → new | draws old → new | triangles old → new | dust clouds (new) |')
print('|---|---|---|---|---|---|---|---|---|')
ratios = []
for k in [key(r) for r in rows if r['build'] == new]:
    if k not in O: continue
    a, b = O[k], N[k]; q = b['msAvg'] / a['msAvg']; ratios.append(q)
    print(f"| {NAMES.get(k[0], k[0])}, {k[1].capitalize()}, {k[2]} ({', '.join(str(c) for c in b.get('cam', []))}) | {b.get('res', '')} | {f(a['msAvg'])} / {f(a['msMedian'])} / {f(a['msP95'])} | {f(b['msAvg'])} / {f(b['msMedian'])} / {f(b['msP95'])} | {q:.2f}× | "
          f"{a['fps']:.2f} → {b['fps']:.2f} | {a['draws']} → {b['draws']} | {a['tris'] / 1000:,.0f} k → {b['tris'] / 1000:,.0f} k | {b.get('haze', 0)} |")
if ratios:
    g = math.exp(sum(math.log(x) for x in ratios) / len(ratios)); faster = sum(1 for x in ratios if x < 1)
    print(f'\nAverage frame time is lower in {new} in {faster} of {len(ratios)} views; geometric mean of new/old: {g:.2f}×.')
