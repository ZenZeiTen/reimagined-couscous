#!/usr/bin/env python3
"""
Blender sprite baker for the raycasting engine.

Imports a low-poly model, orbits a camera around it in discrete steps, renders
each animation frame with a transparent background, packs the frames into a
uniform sprite sheet and writes JSON metadata matching `SpriteSheetMeta` in
`src/renderer/SpriteSheet.ts`.

Run headless through the Blender CLI (Blender 3.6+, tested against 4.x):

    blender -b -P tools/blender/sprite_baker.py -- \
        --input models/grunt.glb --output public/assets/sprites --name grunt \
        --directions 8 --size 64 --animations "idle:Idle,walk:Walk:8,attack:Attack:3" \
        --fps 8 --elevation 12

Direction convention (must match the engine): direction `d` places the camera
at azimuth `d * 360 / directions` degrees clockwise (seen from above) from the
model's forward axis. Blender's "front" is -Y, so direction 0 looks at the
model from -Y and direction `directions / 4` shows the model's right side.

Sheet layout: columns = directions, rows = animation frames (animations are
stacked vertically in the order given). Every frame is `size x size` pixels.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

try:
    import bpy  # type: ignore
    import numpy as np  # Blender ships numpy
    from mathutils import Vector  # type: ignore
    from bpy_extras.object_utils import world_to_camera_view  # type: ignore
except ImportError:  # pragma: no cover - only hit when run outside Blender
    bpy = None  # type: ignore
    np = None  # type: ignore


# --------------------------------------------------------------------------- #
# Argument parsing
# --------------------------------------------------------------------------- #

@dataclass
class AnimationSpec:
    name: str
    action: Optional[str] = None
    frame_start: Optional[int] = None
    frame_end: Optional[int] = None
    frame_count: Optional[int] = None
    loop: bool = True


@dataclass
class BakeConfig:
    input_path: str
    output_dir: str
    name: str
    directions: int = 8
    size: int = 64
    fps: int = 8
    frames: int = 8
    elevation_deg: float = 12.0
    margin: float = 0.06
    camera_type: str = "ORTHO"
    engine: str = "AUTO"
    samples: int = 16
    world_height: float = 1.0
    animations: List[AnimationSpec] = field(default_factory=list)
    auto_actions: bool = False
    keep_frames: bool = False
    scale: float = 1.0
    forward_axis: str = "-Y"


def parse_animation_spec(text: str) -> List[AnimationSpec]:
    """
    Parse "name:Action:count,name2:10-20:count:noloop".
    Each entry: NAME[:ACTION|START-END][:FRAME_COUNT][:noloop]
    """
    specs: List[AnimationSpec] = []
    if not text:
        return specs
    for raw in text.split(","):
        raw = raw.strip()
        if not raw:
            continue
        parts = raw.split(":")
        spec = AnimationSpec(name=parts[0].strip())
        for token in parts[1:]:
            token = token.strip()
            if not token:
                continue
            if token.lower() == "noloop":
                spec.loop = False
            elif token.lower() == "loop":
                spec.loop = True
            elif "-" in token and all(p.strip().lstrip("-").isdigit() for p in token.split("-", 1)):
                a, b = token.split("-", 1)
                spec.frame_start, spec.frame_end = int(a), int(b)
            elif token.isdigit():
                spec.frame_count = int(token)
            else:
                spec.action = token
        specs.append(spec)
    return specs


def parse_args(argv: Sequence[str]) -> BakeConfig:
    parser = argparse.ArgumentParser(prog="sprite_baker.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="Model file (.glb, .gltf, .fbx, .obj, .blend)")
    parser.add_argument("--output", required=True, help="Output directory for <name>.png and <name>.json")
    parser.add_argument("--name", required=True, help="Sprite sheet name (used for file names and metadata)")
    parser.add_argument("--directions", type=int, default=8, help="Number of view directions (8 or 16 typical)")
    parser.add_argument("--size", type=int, default=64, help="Frame size in pixels (square)")
    parser.add_argument("--fps", type=int, default=8, help="Playback fps written to metadata")
    parser.add_argument("--frames", type=int, default=8, help="Default frames sampled per animation")
    parser.add_argument("--elevation", type=float, default=12.0, help="Camera elevation angle in degrees above the horizon")
    parser.add_argument("--margin", type=float, default=0.06, help="Extra framing margin as a fraction of the model size")
    parser.add_argument("--camera", choices=["ORTHO", "PERSP"], default="ORTHO")
    parser.add_argument("--engine", choices=["AUTO", "EEVEE", "CYCLES", "WORKBENCH"], default="AUTO")
    parser.add_argument("--samples", type=int, default=16, help="Render samples (EEVEE/Cycles)")
    parser.add_argument("--world-height", type=float, default=1.0, help="Height of one frame in world tiles for the engine")
    parser.add_argument("--animations", default="", help='Animation spec, e.g. "idle:Idle:2,walk:Walk:8,die:Die:4:noloop"')
    parser.add_argument("--auto-actions", action="store_true", help="Bake every action found in the file")
    parser.add_argument("--keep-frames", action="store_true", help="Keep the individual rendered frames next to the sheet")
    parser.add_argument("--scale", type=float, default=1.0, help="Uniform scale applied to the imported model")
    parser.add_argument("--forward-axis", choices=["-Y", "+Y", "-X", "+X"], default="-Y", help="Which world axis the model faces")
    args = parser.parse_args(list(argv))
    cfg = BakeConfig(
        input_path=os.path.abspath(args.input),
        output_dir=os.path.abspath(args.output),
        name=args.name,
        directions=args.directions,
        size=args.size,
        fps=args.fps,
        frames=args.frames,
        elevation_deg=args.elevation,
        margin=args.margin,
        camera_type=args.camera,
        engine=args.engine,
        samples=args.samples,
        world_height=args.world_height,
        animations=parse_animation_spec(args.animations),
        auto_actions=args.auto_actions,
        keep_frames=args.keep_frames,
        scale=args.scale,
        forward_axis=args.forward_axis,
    )
    if cfg.directions < 1:
        parser.error("--directions must be >= 1")
    if cfg.size < 4:
        parser.error("--size must be >= 4")
    return cfg


def script_argv() -> List[str]:
    """Blender passes its own args; ours follow the '--' separator."""
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    return sys.argv[1:]


# --------------------------------------------------------------------------- #
# Scene setup
# --------------------------------------------------------------------------- #

def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:  # Blender < 3.3
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        raise SystemExit(f"Unsupported model format: {ext}")


def mesh_objects() -> List["bpy.types.Object"]:
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def evaluated_bounds(objects: Sequence["bpy.types.Object"]) -> Tuple[Vector, Vector]:
    """World-space AABB of the evaluated (deformed) meshes at the current frame."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lo = Vector((math.inf, math.inf, math.inf))
    hi = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        try:
            mw = ev.matrix_world
            for v in mesh.vertices:
                p = mw @ v.co
                lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
                hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
        finally:
            ev.to_mesh_clear()
    if not math.isfinite(lo.x):
        raise SystemExit("Model contains no mesh geometry")
    return lo, hi


def configure_render(cfg: BakeConfig) -> None:
    scene = bpy.context.scene
    render = scene.render
    engine = cfg.engine
    if engine == "AUTO":
        engine = "EEVEE"
    if engine == "EEVEE":
        # Blender 4.2+ renamed EEVEE; pick whichever exists.
        candidates = ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"]
        for c in candidates:
            try:
                render.engine = c
                break
            except TypeError:
                continue
        eevee = getattr(scene, "eevee", None)
        if eevee is not None:
            eevee.taa_render_samples = cfg.samples
    elif engine == "CYCLES":
        render.engine = "CYCLES"
        scene.cycles.samples = cfg.samples
        scene.cycles.use_denoising = False
    else:
        render.engine = "BLENDER_WORKBENCH"
    render.resolution_x = cfg.size
    render.resolution_y = cfg.size
    render.resolution_percentage = 100
    render.film_transparent = True
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    render.image_settings.color_depth = "8"
    render.filter_size = 0.8  # crisper pixels for low-res sprites
    render.dither_intensity = 0.0
    # Neutral colour management so albedo survives into the sprite.
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.display_settings.display_device = "sRGB"


def setup_lighting() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("SpriteWorld") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.35, 0.35, 0.38, 1.0)
        bg.inputs[1].default_value = 1.0

    key = bpy.data.lights.new("SpriteKey", type="SUN")
    key.energy = 3.0
    key.angle = math.radians(8)
    key_obj = bpy.data.objects.new("SpriteKey", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (math.radians(55), math.radians(15), math.radians(-35))

    fill = bpy.data.lights.new("SpriteFill", type="SUN")
    fill.energy = 1.2
    fill_obj = bpy.data.objects.new("SpriteFill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(60), math.radians(-20), math.radians(140))


def forward_angle_offset(axis: str) -> float:
    """Rotation needed so the configured forward axis maps to Blender's -Y."""
    return {"-Y": 0.0, "+X": math.radians(90), "+Y": math.radians(180), "-X": math.radians(-90)}[axis]


@dataclass
class Rig:
    pivot: "bpy.types.Object"
    camera: "bpy.types.Object"
    ground: Vector
    center: Vector
    radius_xy: float
    height: float


def setup_camera(cfg: BakeConfig, lo: Vector, hi: Vector) -> Rig:
    scene = bpy.context.scene
    center = (lo + hi) * 0.5
    ground = Vector((center.x, center.y, lo.z))
    size = hi - lo
    radius_xy = 0.5 * math.hypot(size.x, size.y)
    height = size.z
    elev = math.radians(cfg.elevation_deg)

    pivot = bpy.data.objects.new("SpritePivot", None)
    scene.collection.objects.link(pivot)
    pivot.location = ground
    # Pivot rotation applies the forward-axis remap; per-direction rotation is added on top.
    pivot.rotation_euler = (0.0, 0.0, forward_angle_offset(cfg.forward_axis))

    cam_data = bpy.data.cameras.new("SpriteCamera")
    cam_obj = bpy.data.objects.new("SpriteCamera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    cam_obj.parent = pivot

    # Distance: far enough that perspective distortion is mild and clipping is safe.
    distance = max(radius_xy, height) * 6.0 + 1.0
    # Camera sits on -Y (front) at the elevation angle, looking at the model's centre.
    cam_obj.location = Vector((0.0, -distance * math.cos(elev), (center.z - ground.z) + distance * math.sin(elev)))
    look_target = Vector((0.0, 0.0, center.z - ground.z))
    direction = look_target - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_start = 0.01
    cam_data.clip_end = distance * 4

    # Framing: projected height of the box seen from the elevation angle.
    projected_height = height * math.cos(elev) + 2 * radius_xy * math.sin(elev)
    extent = max(2 * radius_xy, projected_height) * (1.0 + cfg.margin)
    if cfg.camera_type == "ORTHO":
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = extent
    else:
        cam_data.type = "PERSP"
        cam_data.sensor_fit = "VERTICAL"
        # Vertical FOV so `extent` fills the frame at `distance`.
        fov = 2 * math.atan((extent * 0.5) / distance)
        cam_data.angle_y = fov
    return Rig(pivot=pivot, camera=cam_obj, ground=ground, center=center, radius_xy=radius_xy, height=height)


# --------------------------------------------------------------------------- #
# Animation discovery
# --------------------------------------------------------------------------- #

def animated_objects() -> List["bpy.types.Object"]:
    return [o for o in bpy.context.scene.objects if o.animation_data is not None]


def resolve_animations(cfg: BakeConfig) -> List[AnimationSpec]:
    actions = {a.name: a for a in bpy.data.actions}
    specs = list(cfg.animations)
    if cfg.auto_actions:
        for name, action in actions.items():
            if any(s.action == name for s in specs):
                continue
            specs.append(AnimationSpec(name=name.lower().replace(" ", "_"), action=name))
    if not specs:
        specs.append(AnimationSpec(name="idle", frame_count=1))
    for spec in specs:
        if spec.action is not None:
            action = actions.get(spec.action)
            if action is None:
                raise SystemExit(f"Animation '{spec.name}' references unknown action '{spec.action}'. Available: {sorted(actions)}")
            start, end = action.frame_range
            if spec.frame_start is None:
                spec.frame_start, spec.frame_end = int(round(start)), int(round(end))
        if spec.frame_start is None:
            spec.frame_start = bpy.context.scene.frame_current
            spec.frame_end = spec.frame_start
        if spec.frame_end is None:
            spec.frame_end = spec.frame_start
        if spec.frame_count is None:
            span = spec.frame_end - spec.frame_start
            spec.frame_count = 1 if span <= 0 else cfg.frames
    return specs


def apply_action(spec: AnimationSpec) -> None:
    if spec.action is None:
        return
    action = bpy.data.actions[spec.action]
    for obj in bpy.context.scene.objects:
        if obj.animation_data is None:
            if action.id_root == "OBJECT" and obj.type == "ARMATURE":
                obj.animation_data_create()
            else:
                continue
        if action.id_root in ("OBJECT", "ARMATURE") and obj.type in ("ARMATURE", "MESH", "EMPTY"):
            try:
                obj.animation_data.action = action
            except Exception:
                continue


def sample_frames(spec: AnimationSpec) -> List[float]:
    if spec.frame_count <= 1 or spec.frame_end <= spec.frame_start:
        return [float(spec.frame_start)]
    step = (spec.frame_end - spec.frame_start) / (spec.frame_count if spec.loop else spec.frame_count - 1)
    return [spec.frame_start + i * step for i in range(spec.frame_count)]


# --------------------------------------------------------------------------- #
# Rendering and packing
# --------------------------------------------------------------------------- #

def render_frame(path: str) -> "np.ndarray":
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    try:
        w, h = img.size
        buf = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(buf)
        arr = buf.reshape(h, w, 4)
        return np.flipud(arr)  # Blender stores rows bottom-up; we work top-down.
    finally:
        bpy.data.images.remove(img)


def save_sheet(path: str, sheet: "np.ndarray") -> None:
    h, w, _ = sheet.shape
    img = bpy.data.images.new("SpriteSheet", width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(np.ascontiguousarray(np.flipud(sheet)).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def compute_origin(rig: Rig) -> Tuple[float, float]:
    """Where the model's ground contact point lands in the frame (normalised, y from the top)."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    co = world_to_camera_view(scene, rig.camera, rig.ground)
    return (max(0.0, min(1.0, co.x)), max(0.0, min(1.0, 1.0 - co.y)))


def bake(cfg: BakeConfig) -> Dict[str, object]:
    reset_scene()
    import_model(cfg.input_path)
    meshes = mesh_objects()
    if not meshes:
        raise SystemExit("No mesh objects found after import")
    if cfg.scale != 1.0:
        for o in bpy.context.scene.objects:
            if o.parent is None:
                o.scale = o.scale * cfg.scale
    bpy.context.view_layer.update()

    specs = resolve_animations(cfg)

    # Bounds across every sampled frame so animated poses never clip.
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for spec in specs:
        apply_action(spec)
        for f in sample_frames(spec):
            bpy.context.scene.frame_set(int(round(f)), subframe=f - int(round(f)) if f != int(round(f)) else 0.0)
            a, b = evaluated_bounds(meshes)
            lo = Vector((min(lo.x, a.x), min(lo.y, a.y), min(lo.z, a.z)))
            hi = Vector((max(hi.x, b.x), max(hi.y, b.y), max(hi.z, b.z)))

    configure_render(cfg)
    setup_lighting()
    rig = setup_camera(cfg, lo, hi)
    origin_x, origin_y = compute_origin(rig)

    total_rows = sum(s.frame_count for s in specs)
    sheet_w = cfg.size * cfg.directions
    sheet_h = cfg.size * total_rows
    sheet = np.zeros((sheet_h, sheet_w, 4), dtype=np.float32)

    os.makedirs(cfg.output_dir, exist_ok=True)
    frames_dir = os.path.join(cfg.output_dir, f"{cfg.name}_frames") if cfg.keep_frames else tempfile.mkdtemp(prefix="sprite_baker_")
    os.makedirs(frames_dir, exist_ok=True)

    frames_meta: List[Dict[str, object]] = []
    animations_meta: Dict[str, Dict[str, object]] = {}
    base_rot = forward_angle_offset(cfg.forward_axis)
    row = 0
    total = total_rows * cfg.directions
    done = 0
    for spec in specs:
        apply_action(spec)
        animations_meta[spec.name] = {"fps": cfg.fps, "loop": spec.loop, "frameCount": spec.frame_count}
        for fi, frame in enumerate(sample_frames(spec)):
            whole = int(math.floor(frame))
            bpy.context.scene.frame_set(whole, subframe=frame - whole)
            for d in range(cfg.directions):
                theta = (d / cfg.directions) * 2 * math.pi
                # Clockwise (seen from above) → negative rotation about +Z.
                rig.pivot.rotation_euler = (0.0, 0.0, base_rot - theta)
                bpy.context.view_layer.update()
                frame_path = os.path.join(frames_dir, f"{cfg.name}_{spec.name}_{fi:03d}_d{d:02d}.png")
                pixels = render_frame(frame_path)
                y0 = row * cfg.size
                x0 = d * cfg.size
                sheet[y0:y0 + cfg.size, x0:x0 + cfg.size, :] = pixels[: cfg.size, : cfg.size, :]
                frames_meta.append({"animation": spec.name, "frame": fi, "direction": d, "x": x0, "y": y0, "w": cfg.size, "h": cfg.size})
                done += 1
                print(f"[sprite_baker] {done}/{total} {spec.name} frame {fi} dir {d}", flush=True)
            row += 1

    png_name = f"{cfg.name}.png"
    save_sheet(os.path.join(cfg.output_dir, png_name), sheet)
    if not cfg.keep_frames:
        shutil.rmtree(frames_dir, ignore_errors=True)

    meta: Dict[str, object] = {
        "name": cfg.name,
        "image": png_name,
        "frameWidth": cfg.size,
        "frameHeight": cfg.size,
        "directions": cfg.directions,
        "origin": {"x": round(origin_x, 4), "y": round(origin_y, 4)},
        "worldHeight": cfg.world_height,
        "animations": animations_meta,
        "frames": frames_meta,
        "generator": {
            "tool": "sprite_baker.py",
            "version": 1,
            "blender": bpy.app.version_string,
            "source": os.path.basename(cfg.input_path),
            "convention": "clockwise-from-front",
            "elevationDeg": cfg.elevation_deg,
            "camera": cfg.camera_type,
            "modelBounds": {"min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]},
        },
    }
    with open(os.path.join(cfg.output_dir, f"{cfg.name}.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print(f"[sprite_baker] wrote {os.path.join(cfg.output_dir, png_name)} ({sheet_w}x{sheet_h}) and {cfg.name}.json")
    return meta


def main() -> None:
    cfg = parse_args(script_argv())
    if bpy is None:
        raise SystemExit("sprite_baker.py must be run inside Blender: blender -b -P sprite_baker.py -- ...")
    bake(cfg)


if __name__ == "__main__":
    main()
