# RetroForge

A 2D game engine for building games in the spirit of the 16-bit console era —
a fusion of SNES and Sega Genesis capabilities, built in Python on
[pygame-ce](https://pyga.me/) and NumPy.

RetroForge is designed for three things at once:

- **Easy to deploy** — pure-Python, `pip install` and go.
- **Great for prototyping** — concise, readable API; write a playable scene in a
  few dozen lines.
- **Authentic and fast** — a low-resolution virtual screen scaled with crisp
  nearest-neighbour pixels, sub-palette colour, and NumPy-accelerated hot paths
  (Mode 7, palette effects, tile rendering).

## Features

| System | What it gives you |
| --- | --- |
| **Virtual screen** | 256×224 (SNES), 320×224 (Genesis) or 320×240, upscaled with no blur; optional CRT scanlines, mosaic and fade effects |
| **Palette** | 16 sub-palettes × 16 colours, NumPy-backed; fades, cross-fades, and colour cycling |
| **Backgrounds** | Up to 4 scrollable tile layers with independent parallax, drawn with a single batched `blits()` call |
| **Mode 7** | NumPy affine ground-plane (rotation / scale / perspective) for F-Zero-style floors |
| **Sprites** | Sheets, animation, H/V flip, priority, and zero-cost palette-swap recolouring |
| **Physics** | AABB rigid bodies with sub-pixel accumulation and X-then-Y tile collision |
| **Camera** | Smooth follow, level-bound clamping, trauma-based shake |
| **Input** | SNES-style 12-button model (d-pad + A/B/X/Y/L/R/Start/Select), keyboard + gamepad, remappable |
| **Audio** | 8-channel mixer with SFX channel pooling and streaming music |
| **Scenes** | Stack-based scene manager (push a pause menu over a running level and pop to resume) |
| **Loop** | Fixed 60 Hz timestep decoupled from render rate, with spiral-of-death protection |

## Install

```bash
pip install pygame-ce numpy        # runtime deps
pip install -e .                   # install RetroForge in editable mode
```

Requires Python 3.10+.

## Quick start

```python
import pygame
import retroforge as rf


class MyScene(rf.Scene):
    def on_enter(self, engine):
        self.engine = engine
        engine.renderer.palette.set_color(0, 0, 92, 148, 252)  # sky backdrop

    def update(self, dt, inp):
        if inp.is_just_pressed(rf.Button.A):
            self.engine.renderer.palette.set_color(0, 0, 252, 92, 92)

    def draw(self, renderer):
        pass  # draw layers / sprites onto renderer.target


pygame.init()
renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="My Game")
rf.GameEngine(renderer).run(MyScene())
pygame.quit()
```

## Examples

Two runnable demos live under `examples/`. First generate their (procedurally
drawn, no-binary-bloat) assets, then run a demo:

```bash
python examples/generate_assets.py     # writes tilesets, sprites, Tiled levels
python examples/platformer/main.py     # side-scrolling platformer
python examples/topdown/main.py        # top-down RPG-style room
```

Controls: arrow keys / WASD to move, **Z** to jump (platformer), **Esc**/Select
to quit.

## Project layout

```
retroforge/
├── engine.py            # fixed-timestep main loop
├── scene.py             # Scene + stack-based SceneManager
├── renderer/            # renderer, palette, tile layers, Mode 7
├── graphics/            # sprites, tilemaps, camera
├── physics/             # rigid bodies, tile collision
├── input/               # SNES-style input manager
├── audio/               # 8-channel audio engine
└── utils/               # Vec2, fixed-point math, asset loader
examples/                # platformer + top-down demos
tests/                   # pytest suite (runs headless)
```

## Tests

The suite runs fully headless (`SDL_VIDEODRIVER=dummy`), so no display or audio
device is needed:

```bash
pytest
```

## License

MIT.
