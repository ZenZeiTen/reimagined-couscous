"""
Directional Sprite Baker add-on.

Renders the active object from N azimuths around the Z axis into individual
transparent PNGs plus a `metadata.json` the engine's `DirectionalSprites`
loader consumes (see src/renderer/DirectionalSprites.ts). This is the
lightweight companion to `sprite_baker.py`: no camera rig or animation
sampling, just rotate the object in front of whatever camera the scene has.

Install: Edit > Preferences > Add-ons > Install... and pick this file, or run
it from Blender's Text Editor. A "Sprite Baker" tab appears in the 3D
viewport sidebar (N panel). The `bake_directional_sprites()` function stays
importable for scripts and the CLI:

    blender -b model.blend -P tools/blender/directional_sprite_addon.py -- \
        --output public/assets/sprites/guard --angles 8 --resolution 128

Direction convention: frame `i` rotates the object by `i * 360 / N` degrees
counter-clockwise (seen from above), which is the same view as moving the
camera clockwise by that angle. That matches `sprite_baker.py` and the
engine's clockwise-from-front direction lookup.
"""

from __future__ import annotations

import json
import math
import os
import sys

bl_info = {
    "name": "Directional Sprite Baker",
    "author": "Raycaster Engine",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > Sprite Baker",
    "description": "Bake the active object into N-angle directional sprites with JSON metadata for 3.5D engines",
    "category": "Render",
}

try:
    import bpy  # type: ignore
except ImportError:  # pragma: no cover - only outside Blender
    bpy = None  # type: ignore


def bake_directional_sprites(output_dir, num_angles=8, resolution=128, name=None, report=print):
    """
    Renders 3D model directional sprite sheets for 3.5D engines.
    Rotates the active object around the Z-axis at fixed intervals,
    renders transparent PNGs, and generates a JSON metadata map.

    Returns the metadata dict, or None if there was no active object.
    """
    if bpy is None:
        raise RuntimeError("bake_directional_sprites must run inside Blender")

    output_dir = bpy.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    obj = bpy.context.active_object
    if not obj:
        report("Error: No active object selected in Blender scene.")
        return None

    scene = bpy.context.scene
    render = scene.render
    if scene.camera is None:
        report("Error: The scene has no camera; add one that frames the object.")
        return None

    # Configure render settings for sprite extraction, remembering the originals.
    saved = {
        "film_transparent": render.film_transparent,
        "resolution_x": render.resolution_x,
        "resolution_y": render.resolution_y,
        "resolution_percentage": render.resolution_percentage,
        "file_format": render.image_settings.file_format,
        "color_mode": render.image_settings.color_mode,
        "filepath": render.filepath,
    }
    render.film_transparent = True
    render.resolution_x = resolution
    render.resolution_y = resolution
    render.resolution_percentage = 100
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"

    model_name = name or obj.name
    metadata = {
        "modelName": model_name,
        "numAngles": num_angles,
        "resolution": resolution,
        "convention": "clockwise-from-front",
        "frames": [],
    }
    angle_step = 360.0 / num_angles
    original_rotation_z = obj.rotation_euler[2]
    report(f"Starting bake for '{model_name}' ({num_angles} angles)...")

    try:
        for i in range(num_angles):
            angle = i * angle_step
            # Rotate object around its Z axis so the fixed camera sees each side.
            obj.rotation_euler[2] = original_rotation_z + math.radians(angle)
            bpy.context.view_layer.update()

            filename = f"sprite_{i:02d}_{int(angle)}deg.png"
            filepath = os.path.join(output_dir, filename)
            render.filepath = filepath
            bpy.ops.render.render(write_still=True)

            metadata["frames"].append({"index": i, "angleDegrees": angle, "filename": filename})
            report(f"Rendered angle {angle}° -> {filename}")
    finally:
        # Restore the object and render settings whatever happened.
        obj.rotation_euler[2] = original_rotation_z
        render.film_transparent = saved["film_transparent"]
        render.resolution_x = saved["resolution_x"]
        render.resolution_y = saved["resolution_y"]
        render.resolution_percentage = saved["resolution_percentage"]
        render.image_settings.file_format = saved["file_format"]
        render.image_settings.color_mode = saved["color_mode"]
        render.filepath = saved["filepath"]

    # Save metadata JSON for the TypeScript game engine to consume.
    meta_path = os.path.join(output_dir, "metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=4)

    report(f"Sprite baking complete! Output saved to: {output_dir}")
    return metadata


# --------------------------------------------------------------------------- #
# Add-on UI
# --------------------------------------------------------------------------- #

if bpy is not None:

    class SPRITEBAKER_OT_bake_directional(bpy.types.Operator):
        """Render the active object from N angles into PNGs plus metadata.json"""

        bl_idname = "spritebaker.bake_directional"
        bl_label = "Bake Directional Sprites"
        bl_options = {"REGISTER"}

        @classmethod
        def poll(cls, context):
            return context.active_object is not None and context.scene.camera is not None

        def execute(self, context):
            settings = context.scene.sprite_baker
            messages = []
            result = bake_directional_sprites(
                settings.output_dir,
                num_angles=settings.num_angles,
                resolution=settings.resolution,
                name=settings.sprite_name or None,
                report=messages.append,
            )
            if result is None:
                self.report({"ERROR"}, messages[-1] if messages else "Bake failed")
                return {"CANCELLED"}
            self.report({"INFO"}, f"Baked {result['numAngles']} sprites for '{result['modelName']}'")
            return {"FINISHED"}

    class SpriteBakerSettings(bpy.types.PropertyGroup):
        output_dir: bpy.props.StringProperty(  # type: ignore[valid-type]
            name="Output Folder",
            description="Folder for the PNG frames and metadata.json (// = relative to the .blend file)",
            default="//sprites",
            subtype="DIR_PATH",
        )
        sprite_name: bpy.props.StringProperty(  # type: ignore[valid-type]
            name="Sprite Name",
            description="Name written to metadata.json (defaults to the object name)",
            default="",
        )
        num_angles: bpy.props.IntProperty(  # type: ignore[valid-type]
            name="Angles",
            description="Number of view directions around the Z axis",
            default=8,
            min=1,
            max=64,
        )
        resolution: bpy.props.IntProperty(  # type: ignore[valid-type]
            name="Resolution",
            description="Square frame size in pixels",
            default=128,
            min=8,
            max=2048,
        )

    class SPRITEBAKER_PT_panel(bpy.types.Panel):
        bl_label = "Directional Sprite Baker"
        bl_idname = "SPRITEBAKER_PT_panel"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "Sprite Baker"

        def draw(self, context):
            layout = self.layout
            settings = context.scene.sprite_baker
            obj = context.active_object
            layout.label(text=f"Active: {obj.name}" if obj else "No active object", icon="OBJECT_DATA")
            if context.scene.camera is None:
                layout.label(text="Scene needs a camera", icon="ERROR")
            layout.prop(settings, "output_dir")
            layout.prop(settings, "sprite_name")
            row = layout.row(align=True)
            row.prop(settings, "num_angles")
            row.prop(settings, "resolution")
            layout.operator(SPRITEBAKER_OT_bake_directional.bl_idname, icon="RENDER_STILL")

    _classes = (SpriteBakerSettings, SPRITEBAKER_OT_bake_directional, SPRITEBAKER_PT_panel)

    def register():
        for cls in _classes:
            bpy.utils.register_class(cls)
        bpy.types.Scene.sprite_baker = bpy.props.PointerProperty(type=SpriteBakerSettings)

    def unregister():
        del bpy.types.Scene.sprite_baker
        for cls in reversed(_classes):
            bpy.utils.unregister_class(cls)


# --------------------------------------------------------------------------- #
# CLI entry point
# --------------------------------------------------------------------------- #

def _cli_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def main_cli(args):
    import argparse

    parser = argparse.ArgumentParser(prog="directional_sprite_addon.py")
    parser.add_argument("--output", required=True, help="Output folder for PNGs and metadata.json")
    parser.add_argument("--angles", type=int, default=8)
    parser.add_argument("--resolution", type=int, default=128)
    parser.add_argument("--name", default=None, help="Sprite name (defaults to the active object's name)")
    parser.add_argument("--object", default=None, help="Object to bake (defaults to the active object)")
    opts = parser.parse_args(args)
    if opts.object:
        target = bpy.data.objects.get(opts.object)
        if target is None:
            raise SystemExit(f"Object '{opts.object}' not found")
        bpy.context.view_layer.objects.active = target
    result = bake_directional_sprites(opts.output, num_angles=opts.angles, resolution=opts.resolution, name=opts.name)
    if result is None:
        raise SystemExit(1)


if __name__ == "__main__":
    if bpy is None:
        raise SystemExit("Run inside Blender: blender -b model.blend -P directional_sprite_addon.py -- --output DIR")
    cli = _cli_args()
    if cli:
        main_cli(cli)
    else:
        register()
        print("Directional Sprite Baker registered: see the 'Sprite Baker' tab in the 3D viewport sidebar.")
