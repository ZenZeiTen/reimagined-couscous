"""RetroForge demo: a side-scrolling platformer.

Shows the whole engine working together — a Tiled level rendered as a scrolling
background layer, an animated player driven by SNES-style input, gravity and
tile collision via ``move_and_slide``, and a camera that follows the player and
is clamped to the level bounds.

Run from the repo root::

    python examples/platformer/main.py

Controls: arrow keys / WASD to move, Z (A button) to jump, Esc to quit.
"""

from __future__ import annotations

import os
import sys

import pygame

# Allow running directly without installing the package.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import retroforge as rf  # noqa: E402

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

GRAVITY = 900.0       # px/s^2
MOVE_SPEED = 110.0    # px/s
JUMP_SPEED = 320.0    # px/s


class PlatformerScene(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        r = engine.renderer

        # A simple, readable palette for the backdrop.
        r.palette.set_color(0, 0, 92, 148, 252)  # sky blue backdrop

        self.tilemap = rf.asset_loader.load_tilemap(os.path.join(ASSETS, "level1.json"))
        tileset = rf.asset_loader.load_tileset(os.path.join(ASSETS, "tiles.png"), 16, 16)
        self.layer = rf.TileLayer(self.tilemap, tileset, scroll_rate=1.0)

        sheet = rf.SpriteSheet(rf.asset_loader.load_image(os.path.join(ASSETS, "player.png")), 16, 24)
        sprite = rf.Sprite(sheet, rf.Vec2(48, 48))
        self.anim = rf.AnimatedSprite(sprite)
        self.anim.add("idle", [0], 0.2)
        self.anim.add("run", [1, 2, 3, 2], 0.08)

        self.body = rf.RigidBody2D(rf.Vec2(48, 48), rf.Vec2(12, 22))

        self.camera = rf.Camera2D(r.width, r.height)
        self.camera.bounds = pygame.Rect(
            0, 0, self.tilemap.pixel_width, self.tilemap.pixel_height
        )

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_pressed(rf.Button.SELECT):
            self.engine.quit()

        vx = 0.0
        if inp.is_pressed(rf.Button.LEFT):
            vx -= MOVE_SPEED
        if inp.is_pressed(rf.Button.RIGHT):
            vx += MOVE_SPEED

        vy = self.body.vel.y
        if inp.is_just_pressed(rf.Button.A) and self.body.grounded:
            vy = -JUMP_SPEED
        self.body.vel = rf.Vec2(vx, vy)

        rf.move_and_slide(self.body, dt, GRAVITY, self.tilemap)

        # Sync sprite to body, follow with camera.
        self.anim.sprite.pos = self.body.pos.copy()
        self.camera.follow(self.body.center, lerp_speed=8.0, dt=dt)
        self.camera.update(dt)

        if abs(vx) > 0.1:
            self.anim.play("run")
            self.anim.sprite.flip_h = vx < 0
        else:
            self.anim.play("idle")
        self.anim.update(dt)

    def draw(self, renderer: rf.Renderer) -> None:
        tl = self.camera.top_left
        self.layer.render(renderer.target, tl.x, tl.y)
        self.anim.sprite.draw(renderer.target, tl.x, tl.y, renderer.palette)


def main() -> None:
    pygame.init()
    renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="RetroForge — Platformer")
    engine = rf.GameEngine(renderer)
    engine.run(PlatformerScene())
    pygame.quit()


if __name__ == "__main__":
    main()
