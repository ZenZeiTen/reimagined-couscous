"""RetroForge demo: a side-scrolling platformer.

Shows the whole engine working together — a Tiled level rendered as a scrolling
background layer, an animated player driven by SNES-style input, gravity and
tile collision via ``move_and_slide``, and a camera that follows the player and
is clamped to the level bounds.

It also exercises the 16-bit platformer vocabulary the engine grew: a ramp you
walk up and down, a ladder you climb through a gap in a ledge, a moving platform
that ferries you over a pit, and dust particles kicked up by running and landing.

Run from the repo root::

    python examples/platformer/main.py

Controls: arrow keys / WASD to move (up/down to climb), Z (A button) to jump,
Esc to quit.
"""

from __future__ import annotations

import math
import os
import sys

import pygame

# Allow running directly without installing the package.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import retroforge as rf

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

GRAVITY = 900.0       # px/s^2
MOVE_SPEED = 110.0    # px/s
JUMP_SPEED = 320.0    # px/s
CLIMB_SPEED = 70.0    # px/s

DUST = [(196, 176, 140), (156, 138, 108), (120, 106, 82)]


class Player(rf.Entity):
    """Walks, jumps, climbs, and rides platforms."""

    def __init__(self, pos: rf.Vec2, anim: rf.AnimatedSprite) -> None:
        super().__init__(pos, rf.Vec2(12, 22), sprite=anim, layer=rf.Layer.PLAYER)
        self.spawn_point = pos.copy()
        self.inp: rf.InputManager | None = None
        self.dust: rf.ParticleSystem | None = None
        self._was_airborne = False
        self._step_timer = 0.0

    def update(self, dt: float, world: rf.World) -> None:
        inp = self.inp
        if inp is None:
            return

        vx = 0.0
        if inp.is_pressed(rf.Button.LEFT):
            vx -= MOVE_SPEED
        if inp.is_pressed(rf.Button.RIGHT):
            vx += MOVE_SPEED

        climbing = self._handle_ladder(inp, world, vx)
        if not climbing:
            vy = self.body.vel.y
            if inp.is_just_pressed(rf.Button.A) and self.body.grounded:
                vy = -JUMP_SPEED
                self._puff(6, spread=4.0)
            self.vel = rf.Vec2(vx, vy)

        world.move(self, dt)
        self._effects(dt, vx)
        self._animate(vx, climbing)

        if self.pos.y > world.tilemap.pixel_height + 32:
            self.body.teleport(self.spawn_point)     # fell in the pit
            self.vel = rf.Vec2()

    def _handle_ladder(self, inp, world: rf.World, vx: float) -> bool:
        up = inp.is_pressed(rf.Button.UP)
        down = inp.is_pressed(rf.Button.DOWN)

        if self.body.on_ladder:
            # Jumping off, or walking clear of the ladder, detaches.
            if inp.is_just_pressed(rf.Button.A) or not world.on_ladder(self):
                self.body.on_ladder = False
                self.vel = rf.Vec2(vx, -JUMP_SPEED * 0.7
                                   if inp.is_just_pressed(rf.Button.A) else 0.0)
                return False
            direction = (1 if down else 0) - (1 if up else 0)
            world.climb(self, direction, CLIMB_SPEED)
            self.vel = rf.Vec2(vx * 0.4, self.body.vel.y)
            return True

        if (up or down) and world.climb(self, (1 if down else -1), CLIMB_SPEED):
            return True
        return False

    def _effects(self, dt: float, vx: float) -> None:
        if self.dust is None:
            return
        # Dust on landing.
        if self._was_airborne and self.body.grounded:
            self._puff(8, spread=5.0)
        self._was_airborne = not self.body.grounded

        # Dust from running feet, at a steady pace rather than every frame.
        if self.body.grounded and abs(vx) > 1.0:
            self._step_timer -= dt
            if self._step_timer <= 0.0:
                self._step_timer = 0.12
                self.dust.spray(
                    self.center.x, self.body.bottom - 1,
                    math.pi if vx > 0 else 0.0, cone=math.pi / 5,
                    count=2, speed=(18.0, 42.0), life=(0.18, 0.36),
                    colors=DUST,
                )

    def _puff(self, count: int, *, spread: float) -> None:
        if self.dust is None:
            return
        self.dust.burst(self.center.x, self.body.bottom - 1, count=count,
                        speed=(20.0, 60.0), life=(0.2, 0.45),
                        spread=spread, colors=DUST)

    def _animate(self, vx: float, climbing: bool) -> None:
        if self.anim is None:
            return
        if climbing:
            self.anim.play("climb")
        elif abs(vx) > 0.1:
            self.anim.play("run")
            self.anim.sprite.flip_h = vx < 0
        else:
            self.anim.play("idle")
        self.anim.sprite.pos = self.pos.copy()


class PlatformerScene(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        r = engine.renderer
        r.palette.set_color(0, 0, 92, 148, 252)  # sky blue backdrop

        self.tilemap = rf.asset_loader.load_tilemap(os.path.join(ASSETS, "level1.json"))
        self.tilemap.oob_solid_below = False     # the pit is a real pit
        tileset = rf.asset_loader.load_tileset(os.path.join(ASSETS, "tiles.png"), 16, 16)
        self.layer = rf.TileLayer(self.tilemap, tileset, scroll_rate=1.0)

        self.font = rf.BitmapFont.default()
        self.dust = rf.ParticleSystem(192, gravity=180.0, drag=2.0)

        sheet = rf.SpriteSheet(
            rf.asset_loader.load_image(os.path.join(ASSETS, "player.png")), 16, 24)
        anim = rf.AnimatedSprite(rf.Sprite(sheet, rf.Vec2(48, 48)))
        anim.add("idle", [0], 0.2)
        anim.add("run", [1, 2, 3, 2], 0.08)
        anim.add("climb", [1, 3], 0.16)

        self.world = rf.World(self.tilemap, gravity=GRAVITY)
        self.player = Player(rf.Vec2(48, 48), anim)
        self.player.inp = None
        self.player.dust = self.dust
        self.world.spawn(self.player)

        # A platform ferrying you across the pit at tiles 26-30.
        ledge = rf.SpriteSheet(
            rf.asset_loader.load_image(os.path.join(ASSETS, "platform.png")), 32, 8)
        self.world.spawn(rf.MovingPlatform(
            rf.Vec2(25 * 16, 11 * 16), rf.Vec2(32, 6),
            [rf.Vec2(31 * 16, 11 * 16)], speed=44.0, wait=0.6,
            sprite=rf.Sprite(ledge),
        ))

        self.camera = rf.Camera2D(r.width, r.height)
        self.camera.bounds = pygame.Rect(
            0, 0, self.tilemap.pixel_width, self.tilemap.pixel_height
        )

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_pressed(rf.Button.SELECT):
            self.engine.quit()

        self.player.inp = inp
        self.world.update(dt)
        self.dust.update(dt)

        self.camera.follow(self.player.center, lerp_speed=8.0, dt=dt)
        self.camera.update(dt)

    def draw(self, renderer: rf.Renderer) -> None:
        tl = self.camera.top_left
        self.layer.render(renderer.target, tl.x, tl.y)
        self.dust.draw(renderer.target, self.camera)
        self.world.draw(renderer.target, self.camera, renderer.palette)

        hint = ("CLIMB" if self.player.body.on_ladder
                else "RIDE" if self.player.body.carrier is not None
                else "MOVE  Z JUMP")
        self.font.draw(renderer.target, hint, 6, 6, (250, 250, 235),
                       shadow=(20, 20, 40))


def main() -> None:
    pygame.init()
    renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="RetroForge — Platformer")
    engine = rf.GameEngine(renderer)
    engine.run(PlatformerScene())
    pygame.quit()


if __name__ == "__main__":
    main()
