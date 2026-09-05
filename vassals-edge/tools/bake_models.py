#!/usr/bin/env python3
"""
Bake tools/models_spec.py into the game's packed model format (no Blender needed).

Output shape matches the v1 loader exactly:
  { model: { part: { a: socket, c: colour, v: base64 int16 mm xyz…, i: base64 uint16 indices } } }

Writes models/models_v2.json and src/data/models.js (v1 set merged with v2).
Run:  python3 tools/bake_models.py
"""
import base64
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from models_spec import MODELS  # noqa: E402


# ---------------------------------------------------------------- primitives -> (verts, tris)
def prim_box(w, h, d):
    x, y, z = w / 2, h / 2, d / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    t = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2), (1, 2, 6), (1, 6, 5), (0, 4, 7), (0, 7, 3)]
    return v, t


def prim_lathe(profile, seg):
    """Revolve an (r, y) profile around Y. Rows with r == 0 collapse to a single pole vertex."""
    v, t, rows = [], [], []
    for r, y in profile:
        if r <= 1e-6:
            rows.append([len(v)]); v.append((0.0, y, 0.0))
        else:
            row = []
            for i in range(seg):
                a = i / seg * math.tau
                row.append(len(v)); v.append((r * math.cos(a), y, r * math.sin(a)))
            rows.append(row)
    for k in range(len(rows) - 1):
        a, b = rows[k], rows[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            a0, a1 = a[i % len(a)], a[j % len(a)]
            b0, b1 = b[i % len(b)], b[j % len(b)]
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                t.append((a0, b1, b0))
            elif len(b) == 1:
                t.append((a0, a1, b0))
            else:
                t.append((a0, a1, b0)); t.append((a1, b1, b0))
    # closed caps when the ends are open rings
    if len(rows[0]) > 1:
        c = len(v); v.append((0.0, profile[0][1], 0.0))
        for i in range(seg): t.append((c, rows[0][i], rows[0][(i + 1) % seg]))
    if len(rows[-1]) > 1:
        c = len(v); v.append((0.0, profile[-1][1], 0.0))
        for i in range(seg): t.append((c, rows[-1][(i + 1) % seg], rows[-1][i]))
    return v, t


def prim_cyl(rt, rb, h, seg):
    prof = [(0, -h / 2), (rb, -h / 2), (rt, h / 2), (0, h / 2)]
    prof = [(r, y) for r, y in prof]
    # drop degenerate zero-radius ends to avoid double poles
    if rb <= 0: prof.pop(0)
    if rt <= 0: prof.pop()
    return prim_lathe(prof, seg)


def prim_blade(width, thick, length, tip):
    """Diamond cross-section blade from y=0 to y=length; the last `tip` mm taper to a point."""
    w, t = width / 2, thick / 2
    ring = [(w, 0), (0, t), (-w, 0), (0, -t)]
    v, tr = [], []
    base = [(x, 0.0, z) for x, z in ring]
    top = [(x, length - tip, z) for x, z in ring]
    v += base + top
    for i in range(4):
        j = (i + 1) % 4
        tr.append((i, j, 4 + j)); tr.append((i, 4 + j, 4 + i))
    p = len(v); v.append((0.0, length, 0.0))
    for i in range(4):
        j = (i + 1) % 4
        tr.append((4 + i, 4 + j, p))
    c = len(v); v.append((0.0, 0.0, 0.0))
    for i in range(4):
        j = (i + 1) % 4
        tr.append((c, j, i))
    return v, tr


def rot_xyz(p, rot):
    rx, ry, rz = [math.radians(a) for a in rot]
    x, y, z = p
    # Euler XYZ (three.js default): apply X, then Y, then Z
    cy, sy = math.cos(rx), math.sin(rx); y, z = y * cy - z * sy, y * sy + z * cy
    cy, sy = math.cos(ry), math.sin(ry); x, z = x * cy + z * sy, -x * sy + z * cy
    cy, sy = math.cos(rz), math.sin(rz); x, y = x * cy - y * sy, x * sy + y * cy
    return (x, y, z)


def build_prim(prim):
    kind = prim[0]
    if kind == 'box':
        _, (w, h, d), pos, rot = prim; v, t = prim_box(w, h, d)
    elif kind == 'cyl':
        _, rt, rb, h, seg, pos, rot = prim; v, t = prim_cyl(rt, rb, h, seg)
    elif kind == 'lathe':
        _, prof, seg, pos, rot = prim; v, t = prim_lathe(prof, seg)
    elif kind == 'blade':
        _, w, th, ln, tip, pos, rot = prim; v, t = prim_blade(w, th, ln, tip)
    else:
        raise ValueError(kind)
    v = [tuple(a + b for a, b in zip(rot_xyz(p, rot), pos)) for p in v]
    return v, t


def bake_part(p):
    verts, tris = [], []
    for prim in p['prims']:
        v, t = build_prim(prim)
        off = len(verts)
        verts += v
        tris += [(a + off, b + off, c + off) for a, b, c in t]
    if len(verts) > 65535:
        raise ValueError('part too large for uint16 indices')
    q = [max(-32768, min(32767, int(round(c)))) for p in verts for c in p]
    vb = struct.pack('<%dh' % len(q), *q)
    ib = struct.pack('<%dH' % (len(tris) * 3), *[i for t in tris for i in t])
    return {'a': p['a'], 'c': p['c'], 'v': base64.b64encode(vb).decode(), 'i': base64.b64encode(ib).decode()}, len(tris)


def bake_all(models):
    out, total = {}, 0
    for name, parts in models.items():
        out[name] = {}
        for pn, p in parts.items():
            out[name][pn], n = bake_part(p); total += n
    return out, total


def main():
    v2, tris = bake_all(MODELS)
    os.makedirs(os.path.join(ROOT, 'models'), exist_ok=True)
    with open(os.path.join(ROOT, 'models', 'models_v2.json'), 'w') as f:
        json.dump(v2, f, separators=(',', ':'))
    with open(os.path.join(ROOT, 'models', 'models_v1.json')) as f:
        v1 = json.load(f)
    merged = dict(v1); merged.update(v2)
    js = ("/* Generated by tools/bake_models.py — do not edit by hand.\n"
          "   v1: 14 models authored in Blender (see docs/ORIGINAL_HANDOFF.md). v2: %d models from tools/models_spec.py.\n"
          "   Format: MODEL_DATA[model][part] = { a: socket, c: colour key, v: base64 int16 mm xyz, i: base64 uint16 indices }. */\n"
          "export const MODEL_DATA = %s;\n") % (len(v2), json.dumps(merged, separators=(',', ':')))
    with open(os.path.join(ROOT, 'src', 'data', 'models.js'), 'w') as f:
        f.write(js)
    print('baked %d v2 models, %d parts, %d tris; merged set: %d models' % (len(v2), sum(len(p) for p in v2.values()), tris, len(merged)))


if __name__ == '__main__':
    main()
