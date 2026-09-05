"""
Vassal's Edge - Blender build script for the v2 model set.

Builds every model in tools/models_spec.py as real Blender objects (one object per part, parented to
an Empty per model, sockets as Empties) so they can be inspected, edited and re-exported, then writes
the same packed JSON the game loads.

Run headless:
    blender -b -P tools/blender/build_models.py -- --out models/models_v2.json [--blend models/vareth_models.blend]

Run inside Blender's Text Editor: open this file and press Run Script; the JSON lands next to the .blend.

Blender 4.x/5.x. Uses bmesh for every primitive so the result is independent of operator context.
"""
import base64
import json
import math
import os
import struct
import sys

import bpy  # noqa: E402  (bpy must load before bmesh/mathutils register)
import bmesh
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath or __file__))
for cand in (HERE, os.path.join(HERE, '..'), os.path.join(HERE, '..', '..', 'tools')):
    if os.path.exists(os.path.join(cand, 'models_spec.py')):
        sys.path.insert(0, cand)
        break
from models_spec import MODELS  # noqa: E402

MM = 0.001   # spec is in millimetres; Blender scene is metres


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = os.path.join(HERE, '..', '..', 'models', 'models_v2.json')
    blend = None
    i = 0
    while i < len(argv):
        if argv[i] == '--out': out = argv[i + 1]; i += 2
        elif argv[i] == '--blend': blend = argv[i + 1]; i += 2
        else: i += 1
    return out, blend


def _matrix(pos, rot):
    m = Matrix.Translation(Vector([c * MM for c in pos]))
    return m @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()


def _lathe(bm, profile, seg, mat):
    """Revolve a profile with bmesh.ops.spin; poles where r == 0."""
    pts = [bm.verts.new((r * MM, y * MM, 0.0)) for r, y in profile]
    edges = [bm.edges.new((pts[i], pts[i + 1])) for i in range(len(pts) - 1)]
    bm.verts.ensure_lookup_table()
    res = bmesh.ops.spin(bm, geom=pts + edges, cent=(0, 0, 0), axis=(0, 1, 0), angle=math.tau, steps=seg, use_merge=True, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    # cap open rings at either end (spin leaves them open when r > 0)
    for idx in (0, len(profile) - 1):
        if profile[idx][0] > 0:
            ring = [v for v in bm.verts if abs(v.co.y - profile[idx][1] * MM) < 1e-6 and abs(v.co.length_2d if False else math.hypot(v.co.x, v.co.z) - profile[idx][0] * MM) < 1e-4]
            if len(ring) >= 3:
                try: bm.faces.new(sorted(ring, key=lambda v: math.atan2(v.co.z, v.co.x)))
                except ValueError: pass
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts[:])


def build_prim(bm, prim):
    kind = prim[0]
    if kind == 'box':
        _, (w, h, d), pos, rot = prim
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w * MM, h * MM, d * MM), verts=r['verts'])
        bmesh.ops.transform(bm, matrix=_matrix(pos, rot), verts=r['verts'])
    elif kind == 'cyl':
        _, rt, rb, h, seg, pos, rot = prim
        r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=max(rb * MM, 1e-6), radius2=max(rt * MM, 1e-6), depth=h * MM)
        # bmesh cones point along +Z; the spec wants +Y
        bmesh.ops.transform(bm, matrix=_matrix(pos, rot) @ Euler((-math.pi / 2, 0, 0), 'XYZ').to_matrix().to_4x4(), verts=r['verts'])
    elif kind == 'lathe':
        _, prof, seg, pos, rot = prim
        sub = bmesh.new(); _lathe(sub, prof, seg, _matrix(pos, rot))
        me = bpy.data.meshes.new('_tmp'); sub.to_mesh(me); sub.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    elif kind == 'blade':
        _, w, th, ln, tip, pos, rot = prim
        w2, t2 = w / 2 * MM, th / 2 * MM
        ring = [(w2, 0), (0, t2), (-w2, 0), (0, -t2)]
        base = [bm.verts.new((x, 0, z)) for x, z in ring]
        top = [bm.verts.new((x, (ln - tip) * MM, z)) for x, z in ring]
        apex = bm.verts.new((0, ln * MM, 0))
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((base[i], base[j], top[j], top[i])); bm.faces.new((top[i], top[j], apex))
        bm.faces.new(list(reversed(base)))
        bmesh.ops.transform(bm, matrix=_matrix(pos, rot), verts=base + top + [apex])
    else:
        raise ValueError(kind)


def build_part(name, pn, p, parent):
    bm = bmesh.new()
    for prim in p['prims']:
        build_prim(bm, prim)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('%s_%s' % (name, pn))
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('%s.%s' % (name, pn), me)
    ob['socket'] = p['a']; ob['colour'] = p['c']
    ob.parent = parent
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export_part(ob):
    me = ob.data.copy()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    verts = [max(-32768, min(32767, int(round(c / MM)))) for v in me.vertices for c in v.co]
    idx = [i for poly in me.polygons for i in poly.vertices]
    bpy.data.meshes.remove(me)
    return {'a': ob['socket'], 'c': ob['colour'],
            'v': base64.b64encode(struct.pack('<%dh' % len(verts), *verts)).decode(),
            'i': base64.b64encode(struct.pack('<%dH' % len(idx), *idx)).decode()}


def main():
    out, blend = _args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = {}
    x = 0.0
    for name, parts in MODELS.items():
        root = bpy.data.objects.new(name, None); root.location = (x, 0, 0); x += 2.5
        bpy.context.scene.collection.objects.link(root)
        data[name] = {}
        for pn, p in parts.items():
            ob = build_part(name, pn, p, root)
            data[name][pn] = export_part(ob)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
    print('wrote %s (%d models)' % (out, len(data)))


if __name__ == '__main__' or bpy.data.filepath == '':
    main()
