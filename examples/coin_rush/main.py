"""Coin Rush — a complete little platformer built on RetroForge.

Not a feature demo: an actual game with a title screen, a run, a pause menu, a
death, a game over, and a high score that survives quitting. It exists to prove
the engine carries a whole game rather than one impressive screen, and to be the
file you copy when starting your own.

What it uses, and where to look:

    Levels        Tiled JSON with base64+zlib data and a firstgid of 17, with
                  the player, enemies and coins read out of an object layer
                  (``Game.on_enter``)
    Entities      Player / Walker / Coin subclass Entity; World owns them,
                  spawns and kills them, and draws them in priority order
    Physics       gravity + tile collision, one-way wooden platforms you jump
                  up through, coyote time and a jump buffer (``Player.update``)
    Collision     layer/mask so shots and pickups only touch what they should;
                  stomping an enemy is a downward-velocity check
    Text          score, lives and timer HUD with drop shadows (``Game.draw``)
    Timing        invulnerability flicker, respawn delay, a score pop tween
    Scenes        Title -> Game -> GameOver with iris and fade transitions, and
                  a Pause overlay that freezes the world beneath it
    Saving        the high score, written atomically to the user's data dir
    Debug         F1 toggles hitboxes, tile solidity and the frame budget

Run it::

    python examples/coin_rush/generate_assets.py
    python examples/coin_rush/main.py

Controls: arrows/WASD move, Z jump (hold for height, tap for a hop),
DOWN+Z drops through a wooden platform, Enter pauses, Esc quits, F1 debug.
"""

from __future__ import annotations

import os
import sys

import pygame

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import retroforge as rf

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

GRAVITY = 900.0
MOVE_SPEED = 96.0
AIR_ACCEL = 520.0
GROUND_ACCEL = 900.0
FRICTION = 1100.0
JUMP_SPEED = 300.0
JUMP_CUT = 0.45         # release the button early and keep this much rise
COYOTE_TIME = 0.10      # still jumpable this long after walking off a ledge
JUMP_BUFFER = 0.12      # a jump pressed this soon before landing still counts
STOMP_BOUNCE = 220.0
INVULN_TIME = 1.2
RESPAWN_DELAY = 0.9
RUN_SECONDS = 90.0

SKY = (92, 148, 236)
SKY_DEEP = (48, 92, 188)


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------

class Coin(rf.Entity):
    def __init__(self, pos: rf.Vec2, sheet: rf.SpriteSheet) -> None:
        anim = rf.AnimatedSprite(rf.Sprite(sheet))
        anim.add("spin", [0, 1, 2, 3], 0.09)
        anim.play("spin")
        super().__init__(pos, rf.Vec2(8, 8), sprite=anim,
                         layer=rf.Layer.PICKUP, gravity_scale=0.0,
                         priority=0, tags=["coin"])
        self.base_y = pos.y
        self.phase = (pos.x * 0.05) % 6.283

    def update(self, dt: float, world: rf.World) -> None:
        # A gentle bob, offset per coin so a row of them ripples.
        import math
        self.phase += dt * 3.0
        self.body.pos = rf.Vec2(self.body.pos.x,
                                self.base_y + math.sin(self.phase) * 1.5)


class Walker(rf.Entity):
    """Patrols a stretch of ground, turning at the ends and at ledges."""

    def __init__(self, pos: rf.Vec2, sheet: rf.SpriteSheet, patrol: float) -> None:
        anim = rf.AnimatedSprite(rf.Sprite(sheet))
        anim.add("walk", [0, 1], 0.18)
        anim.play("walk")
        super().__init__(pos, rf.Vec2(14, 14), sprite=anim,
                         layer=rf.Layer.ENEMY, mask=rf.Layer.PLAYER,
                         tags=["enemy"])
        self.home_x = pos.x
        self.patrol = patrol
        self.speed = 34.0
        self.facing = -1

    def update(self, dt: float, world: rf.World) -> None:
        self.body.vel = rf.Vec2(self.speed * self.facing, self.body.vel.y)
        world.move(self, dt)

        if self.body.on_wall or abs(self.body.pos.x - self.home_x) > self.patrol:
            self.facing = -self.facing
            # Nudge back inside the patrol so it cannot stick to the boundary.
            self.body.pos = rf.Vec2(
                min(self.home_x + self.patrol,
                    max(self.home_x - self.patrol, self.body.pos.x)),
                self.body.pos.y,
            )

    def squash(self, world: rf.World) -> None:
        self.kill()


class Player(rf.Entity):
    def __init__(self, pos: rf.Vec2, sheet: rf.SpriteSheet, game: Game) -> None:
        anim = rf.AnimatedSprite(rf.Sprite(sheet))
        anim.add("idle", [0], 0.2)
        anim.add("run", [1, 2, 3, 2], 0.09)
        anim.add("air", [1], 0.2)
        anim.play("idle")
        super().__init__(pos, rf.Vec2(12, 22), sprite=anim,
                         layer=rf.Layer.PLAYER,
                         mask=rf.Layer.ENEMY | rf.Layer.PICKUP,
                         priority=2, tags=["player"])
        self.game = game
        self.anim.sprite.offset = rf.Vec2(2, 2)   # 16x24 art on a 12x22 body
        self.coyote = 0.0
        self.buffer = 0.0
        self.invuln = 0.0
        self.spawn_point = pos.copy()

    @property
    def invulnerable(self) -> bool:
        return self.invuln > 0.0

    def update(self, dt: float, world: rf.World) -> None:
        inp = self.game.input
        body = self.body

        # --- horizontal: accelerate toward the held direction, else brake ---
        want = 0.0
        if inp.is_pressed(rf.Button.LEFT):
            want -= MOVE_SPEED
        if inp.is_pressed(rf.Button.RIGHT):
            want += MOVE_SPEED

        accel = GROUND_ACCEL if body.grounded else AIR_ACCEL
        vx = body.vel.x
        if want != 0.0:
            vx += (accel if want > vx else -accel) * dt
            vx = max(-MOVE_SPEED, min(MOVE_SPEED, vx))
            self.facing = 1 if want > 0 else -1
        elif body.grounded:
            vx -= min(abs(vx), FRICTION * dt) * (1 if vx > 0 else -1)

        # --- jumping: coyote time and a jump buffer, the two forgivenesses
        # every good platformer has and no player ever notices ---
        self.coyote = COYOTE_TIME if body.grounded else max(0.0, self.coyote - dt)
        self.buffer = JUMP_BUFFER if inp.is_just_pressed(rf.Button.A) \
            else max(0.0, self.buffer - dt)

        vy = body.vel.y
        body.drop_through = inp.is_pressed(rf.Button.DOWN)

        if self.buffer > 0.0 and self.coyote > 0.0 and not body.drop_through:
            vy = -JUMP_SPEED
            self.coyote = 0.0
            self.buffer = 0.0
            self.game.sfx_jump()
        # Releasing early cuts the rise, so a tap is a hop.
        if inp.is_just_released(rf.Button.A) and vy < 0.0:
            vy *= JUMP_CUT

        body.vel = rf.Vec2(vx, vy)
        world.move(self, dt)

        if self.invuln > 0.0:
            self.invuln -= dt
            # Flicker while invulnerable — the universal 16-bit "you are safe".
            self.anim.sprite.visible = int(self.invuln * 20) % 2 == 0
        else:
            self.anim.sprite.visible = True

        self._touch(world)
        self._animate()

        # Fell into a pit.
        if body.pos.y > world.tilemap.pixel_height + 32:
            self.game.lose_life()

    def _touch(self, world: rf.World) -> None:
        for other in world.overlapping(self):
            if other.has_tag("coin"):
                other.kill()
                self.game.collect_coin()
            elif other.has_tag("enemy"):
                falling = self.body.vel.y > 40.0
                on_top = self.body.bottom <= other.body.pos.y + 10
                if falling and on_top:
                    other.squash(world)
                    self.body.vel = rf.Vec2(self.body.vel.x, -STOMP_BOUNCE)
                    self.game.stomp()
                elif not self.invulnerable:
                    self.game.take_hit()
                    self.invuln = INVULN_TIME
                    self.body.vel = rf.Vec2(-90.0 * self.facing, -160.0)

    def _animate(self) -> None:
        if not self.body.grounded:
            self.anim.play("air")
        elif abs(self.body.vel.x) > 8.0:
            self.anim.play("run")
        else:
            self.anim.play("idle")

    def respawn(self) -> None:
        self.pos = self.spawn_point.copy()
        self.body.vel = rf.Vec2()
        self.invuln = INVULN_TIME
        self.anim.sprite.visible = True


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------

class Game(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        self.input = engine.input
        renderer = engine.renderer
        renderer.palette.set_color(0, 0, *SKY)

        self.font = rf.BitmapFont.default()
        self.saves = rf.SaveManager("RetroForgeCoinRush")
        self.high_score = int(self.saves.read_settings().get("high_score", 0))

        # --- level ---
        self.tilemap = rf.TileMap.load_tiled(os.path.join(ASSETS, "level.json"))
        self.tilemap.oob_solid_below = False        # pits are lethal, not floors
        tileset = rf.asset_loader.load_tileset(os.path.join(ASSETS, "tiles.png"),
                                               16, 16)
        self.layer = rf.TileLayer(self.tilemap, tileset)

        # --- entities, placed from the level's object layer ---
        self.world = rf.World(self.tilemap, gravity=GRAVITY)
        player_sheet = rf.SpriteSheet(
            rf.asset_loader.load_image(os.path.join(ASSETS, "player.png")), 16, 24)
        enemy_sheet = rf.SpriteSheet(
            rf.asset_loader.load_image(os.path.join(ASSETS, "enemy.png")), 16, 16)
        coin_sheet = rf.SpriteSheet(
            rf.asset_loader.load_image(os.path.join(ASSETS, "coin.png")), 8, 8)

        # A registry maps each Tiled object type to a factory once. Adding a
        # new kind of thing to the level is then a change to the map, not to
        # this file — which is what lets a level editor (or a tool) extend the
        # game without touching Python.
        registry = rf.EntityRegistry(on_unknown="raise")

        @registry.spawns("spawn")
        def make_player(obj, ctx):
            return Player(rf.Vec2(obj.x, obj.y), ctx["player_sheet"], self)

        @registry.spawns("enemy")
        def make_enemy(obj, ctx):
            return Walker(rf.Vec2(obj.x, obj.y), ctx["enemy_sheet"],
                          float(obj.get("range", 48)))

        @registry.spawns("coin")
        def make_coin(obj, ctx):
            return Coin(rf.Vec2(obj.x, obj.y), ctx["coin_sheet"])

        spawned = registry.populate(self.world, context={
            "player_sheet": player_sheet,
            "enemy_sheet": enemy_sheet,
            "coin_sheet": coin_sheet,
        })
        self.player = spawned.first("spawn")
        self.total_coins = len(spawned.of("coin"))

        # --- camera, HUD, timers ---
        self.camera = rf.Camera2D(renderer.width, renderer.height)
        self.camera.bounds = pygame.Rect(0, 0, self.tilemap.pixel_width,
                                         self.tilemap.pixel_height)
        self.camera.snap_to(self.player.center)

        self.timers = rf.Scheduler()
        self.score = 0
        self.lives = 3
        self.time_left = RUN_SECONDS
        self.score_pop = 0.0
        self.dying = False
        self.finished = False

        self.debug = rf.DebugOverlay(enabled=False)
        self.debug.watch("vel", lambda: (round(self.player.vel.x),
                                         round(self.player.vel.y)))
        self.debug.watch("grounded", lambda: self.player.body.grounded)

        self._sky = _bake_sky(renderer.width, renderer.height)
        self._clouds = _bake_clouds(renderer.width, renderer.height // 2)

    # -- game events ----------------------------------------------------------
    def sfx_jump(self) -> None:
        pass        # no audio assets are committed; the hook is here to fill in

    def collect_coin(self) -> None:
        self.score += 10
        self._pop_score()
        if not self.world.find("coin"):
            self.win()

    def stomp(self) -> None:
        self.score += 50
        self._pop_score()
        self.camera.shake(2.0, 0.18)

    def _pop_score(self) -> None:
        self.timers.tween(0.22, 3.0, 0.0,
                          lambda v: setattr(self, "score_pop", v),
                          ease="out_quad")

    def take_hit(self) -> None:
        self.camera.shake(4.0, 0.35)
        self.lose_life()

    def lose_life(self) -> None:
        if self.dying or self.finished:
            return
        self.dying = True
        self.lives -= 1
        self.player.body.active = False
        if self.lives <= 0:
            self.timers.after(RESPAWN_DELAY, self.game_over)
        else:
            self.timers.after(RESPAWN_DELAY, self._revive)

    def _revive(self) -> None:
        self.player.respawn()
        self.player.body.active = True
        self.dying = False
        self.camera.snap_to(self.player.center)

    def win(self) -> None:
        self.finished = True
        self._save_high_score()
        self.engine.scenes.push(
            rf.Transition(Results(self.score, self.high_score, won=True),
                          style="iris", duration=0.9))

    def game_over(self) -> None:
        self.finished = True
        self._save_high_score()
        self.engine.scenes.push(
            rf.Transition(Results(self.score, self.high_score, won=False),
                          style="fade", duration=0.9))

    def _save_high_score(self) -> None:
        if self.score > self.high_score:
            self.high_score = self.score
            settings = self.saves.read_settings()
            settings["high_score"] = self.score
            self.saves.write_settings(settings)

    # -- loop -----------------------------------------------------------------
    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_just_pressed(rf.Button.SELECT):
            self.engine.quit()
            return
        if inp.is_just_pressed(rf.Button.R):
            self.debug.enabled = not self.debug.enabled
        if inp.is_just_pressed(rf.Button.START) and not self.finished:
            self.engine.scenes.push(Pause())
            return

        self.timers.update(dt)
        if self.finished:
            return

        self.time_left -= dt
        if self.time_left <= 0.0:
            self.time_left = 0.0
            self.game_over()
            return

        self.world.update(dt)
        self.layer.update(dt)
        self.camera.follow(self.player.center, lerp_speed=7.0, dt=dt)
        self.camera.update(dt)

    def draw(self, renderer: rf.Renderer) -> None:
        target = renderer.target
        tl = self.camera.top_left
        target.blit(self._sky, (0, 0))
        self._draw_clouds(target, tl, renderer.width)
        self.layer.render(target, tl.x, tl.y, renderer.palette)
        self.world.draw(target, self.camera, renderer.palette)
        self._draw_hud(target, renderer)
        self.debug.draw(renderer, world=self.world, tilemap=self.tilemap,
                        camera=self.camera)

    def _draw_clouds(self, target: pygame.Surface, tl: rf.Vec2, width: int) -> None:
        strip = self._clouds
        ox = int(-tl.x * 0.25) % width          # a quarter of the camera speed
        oy = int(-tl.y * 0.12) + 22             # clear of the HUD row
        target.blit(strip, (ox - width, oy))
        target.blit(strip, (ox, oy))

    def _draw_hud(self, target: pygame.Surface, renderer: rf.Renderer) -> None:
        w = renderer.width
        got = self.total_coins - len(self.world.find("coin"))
        pop = int(self.score_pop)
        self.font.draw(target, f"SCORE {self.score:05d}", 4, 4 - pop,
                       (255, 240, 180), shadow=(0, 0, 0))
        self.font.draw(target, f"COINS {got:02d}/{self.total_coins:02d}",
                       4, 13, (200, 230, 255), shadow=(0, 0, 0))
        self.font.draw(target, f"x{max(0, self.lives)}", w // 2, 4,
                       (255, 140, 150), align="center", shadow=(0, 0, 0))

        urgent = self.time_left <= 10.0
        self.font.draw(target, f"{int(self.time_left):03d}", w - 4, 4,
                       (255, 90, 90) if urgent else (235, 235, 245),
                       align="right", shadow=(0, 0, 0))
        if self.high_score:
            self.font.draw(target, f"BEST {self.high_score:05d}", w - 4, 13,
                           (170, 180, 200), align="right", shadow=(0, 0, 0))


class Pause(rf.Scene):
    """A menu over a frozen level: transparent so the world still draws, but
    not ``update_below``, so it stops."""

    transparent = True

    def on_enter(self, engine) -> None:
        self.engine = engine
        self.font = rf.BitmapFont.default()

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_just_pressed(rf.Button.START) or inp.is_just_pressed(rf.Button.B):
            self.engine.scenes.pop()
        elif inp.is_just_pressed(rf.Button.SELECT):
            self.engine.quit()

    def draw(self, renderer: rf.Renderer) -> None:
        renderer.apply_fade(0.55)
        w, h = renderer.width, renderer.height
        self.font.draw(renderer.target, "PAUSED", w // 2, h // 2 - 12,
                       (255, 255, 255), align="center", shadow=(0, 0, 0))
        self.font.draw(renderer.target, "ENTER RESUME   ESC QUIT",
                       w // 2, h // 2 + 4, (180, 190, 210),
                       align="center", shadow=(0, 0, 0))


class Results(rf.Scene):
    def __init__(self, score: int, high_score: int, won: bool) -> None:
        self.score = score
        self.high_score = high_score
        self.won = won

    def on_enter(self, engine) -> None:
        self.engine = engine
        self.font = rf.BitmapFont.default()
        self.timers = rf.Scheduler()
        self.shown = 0
        # Count the score up rather than just printing it.
        self.timers.tween(1.0, 0.0, float(self.score),
                          lambda v: setattr(self, "shown", int(v)),
                          ease="out_cubic")

    def update(self, dt: float, inp: rf.InputManager) -> None:
        self.timers.update(dt)
        if inp.is_just_pressed(rf.Button.SELECT):
            self.engine.quit()
        elif inp.is_just_pressed(rf.Button.START) or inp.is_just_pressed(rf.Button.A):
            self.engine.scenes.push(rf.Transition(Game(), style="fade"))

    def draw(self, renderer: rf.Renderer) -> None:
        renderer.target.fill((16, 18, 34))
        w, h = renderer.width, renderer.height
        title = "ALL COINS!" if self.won else "GAME OVER"
        colour = (255, 220, 90) if self.won else (255, 110, 110)
        self.font.draw(renderer.target, title, w // 2, h // 2 - 28, colour,
                       align="center", shadow=(0, 0, 0))
        self.font.draw(renderer.target, f"SCORE {self.shown:05d}", w // 2,
                       h // 2 - 8, (255, 255, 255), align="center")
        self.font.draw(renderer.target, f"BEST  {self.high_score:05d}", w // 2,
                       h // 2 + 4, (170, 180, 200), align="center")
        self.font.draw(renderer.target, "ENTER TO PLAY AGAIN", w // 2,
                       h - 24, (140, 200, 255), align="center")


class Title(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        self.font = rf.BitmapFont.default()
        self.t = 0.0
        engine.renderer.palette.set_color(0, 0, *SKY)
        self._sky = _bake_sky(engine.renderer.width, engine.renderer.height)

    def update(self, dt: float, inp: rf.InputManager) -> None:
        self.t += dt
        if inp.is_just_pressed(rf.Button.SELECT):
            self.engine.quit()
        elif inp.is_just_pressed(rf.Button.START) or inp.is_just_pressed(rf.Button.A):
            self.engine.scenes.push(rf.Transition(Game(), style="iris",
                                                  duration=0.8))

    def draw(self, renderer: rf.Renderer) -> None:
        renderer.target.blit(self._sky, (0, 0))
        w, h = renderer.width, renderer.height
        self.font.draw(renderer.target, "COIN RUSH", w // 2, h // 2 - 24,
                       (255, 226, 120), align="center", shadow=(60, 30, 0))
        self.font.draw(renderer.target, "a RetroForge demo", w // 2, h // 2 - 8,
                       (210, 225, 250), align="center", shadow=(0, 0, 0))
        if int(self.t * 2) % 2 == 0:
            self.font.draw(renderer.target, "PRESS ENTER", w // 2, h // 2 + 16,
                           (255, 255, 255), align="center", shadow=(0, 0, 0))
        self.font.draw(
            renderer.target,
            "ARROWS MOVE   Z JUMP   DOWN+Z DROP\nENTER PAUSE   F1 DEBUG   ESC QUIT",
            w // 2, h - 26, (150, 165, 195), align="center")


def _bake_sky(w: int, h: int) -> pygame.Surface:
    surf = pygame.Surface((w, h))
    for y in range(h):
        t = y / max(1, h - 1)
        surf.fill(
            (int(SKY_DEEP[0] + (SKY[0] - SKY_DEEP[0]) * t),
             int(SKY_DEEP[1] + (SKY[1] - SKY_DEEP[1]) * t),
             int(SKY_DEEP[2] + (SKY[2] - SKY_DEEP[2]) * t)),
            (0, y, w, 1),
        )
    return surf


def _bake_clouds(width: int, height: int) -> pygame.Surface:
    """One tiling strip of clouds, scrolled at a fraction of the camera speed.

    Parallax is the cheapest depth cue the era had: the further something is,
    the slower it slides past.
    """
    import random
    surf = pygame.Surface((width, height), pygame.SRCALPHA)
    rng = random.Random(3)
    for _ in range(14):
        cx = rng.randrange(0, width)
        cy = rng.randrange(6, max(7, height - 20))
        scale = rng.uniform(0.7, 1.5)
        for dx, dy, r in ((0, 0, 9), (7, 2, 7), (-7, 2, 6), (3, -4, 6)):
            for x_wrap in (0, width, -width):   # so the strip tiles seamlessly
                pygame.draw.circle(
                    surf, (255, 255, 255, 130),
                    (int(cx + dx * scale) + x_wrap, int(cy + dy * scale)),
                    max(2, int(r * scale)),
                )
    return surf


def main() -> None:
    pygame.init()
    renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="RetroForge — Coin Rush")
    engine = rf.GameEngine(renderer, init_audio=False)
    engine.input.remap(pygame.K_F1, rf.Button.R)
    engine.run(Title())
    pygame.quit()


if __name__ == "__main__":
    main()
