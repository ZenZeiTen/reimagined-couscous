"""RetroForge demo: a top-down (RPG-style) room.

A walled room with a central obstacle, an 8-directional walking hero, AABB tile
collision (no gravity), and a camera that follows the hero. Demonstrates the
same engine pieces as the platformer in a zero-gravity, top-down configuration.

Run from the repo root::

    python examples/topdown/main.py

Controls: arrow keys / WASD to move, Esc / Select to quit.
"""

from __future__ import annotations

import os
import sys

import pygame

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import retroforge as rf  # noqa: E402

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SPEED = 90.0  # px/s


class TopDownScene(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        r = engine.renderer
        r.palette.set_color(0, 0, 30, 30, 40)

        self.tilemap = rf.asset_loader.load_tilemap(os.path.join(ASSETS, "room.json"))
        tileset = rf.asset_loader.load_tileset(os.path.join(ASSETS, "tiles.png"), 16, 16)
        self.layer = rf.TileLayer(self.tilemap, tileset, scroll_rate=1.0)

        sheet = rf.SpriteSheet(rf.asset_loader.load_image(os.path.join(ASSETS, "hero.png")), 16, 16)
        sprite = rf.Sprite(sheet, rf.Vec2(48, 48))
        self.anim = rf.AnimatedSprite(sprite)
        self.anim.add("idle", [0], 0.2)
        self.anim.add("walk", [0, 1, 2, 3], 0.12)

        # No gravity in a top-down game.
        self.body = rf.RigidBody2D(rf.Vec2(48, 48), rf.Vec2(12, 14), gravity_scale=0.0)

        self.camera = rf.Camera2D(r.width, r.height)
        self.camera.bounds = pygame.Rect(
            0, 0, self.tilemap.pixel_width, self.tilemap.pixel_height
        )

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_pressed(rf.Button.SELECT):
            self.engine.quit()

        vx = vy = 0.0
        if inp.is_pressed(rf.Button.LEFT):
            vx -= SPEED
        if inp.is_pressed(rf.Button.RIGHT):
            vx += SPEED
        if inp.is_pressed(rf.Button.UP):
            vy -= SPEED
        if inp.is_pressed(rf.Button.DOWN):
            vy += SPEED
        self.body.vel = rf.Vec2(vx, vy)

        # gravity 0 keeps this purely top-down.
        rf.move_and_slide(self.body, dt, 0.0, self.tilemap)

        self.anim.sprite.pos = self.body.pos.copy()
        self.camera.follow(self.body.center, lerp_speed=8.0, dt=dt)
        self.camera.update(dt)

        if abs(vx) > 0.1 or abs(vy) > 0.1:
            self.anim.play("walk")
            if abs(vx) > 0.1:
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
    renderer = rf.Renderer(*rf.RES_GENESIS, scale=3, title="RetroForge — Top-Down")
    engine = rf.GameEngine(renderer)
    engine.run(TopDownScene())
    pygame.quit()


if __name__ == "__main__":
    main()
