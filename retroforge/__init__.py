"""RetroForge — a 2D game engine for 16-bit-era (SNES/Genesis) retro games.

Import the public API directly from the top-level package::

    from retroforge import GameEngine, Renderer, Scene, Vec2, Button

The engine targets the look and constraints of 1990s 16-bit consoles: a low-res
virtual screen scaled with crisp nearest-neighbour pixels, sub-palette colour,
four parallax background layers, hardware-style sprites, a Mode 7 affine plane,
and an SNES-style controller model.
"""

from .engine import GameEngine, PHYSICS_DT, PHYSICS_HZ
from .scene import Scene, SceneManager
from .renderer.renderer import Renderer, RES_GENESIS, RES_SNES, RES_TALL
from .renderer.palette import ColorPalette
from .renderer.layer import TileLayer
from .renderer.mode7 import Mode7
from .graphics.sprite import AnimatedSprite, Sprite, SpriteSheet
from .graphics.font import BitmapFont
from .graphics.camera import Camera2D
from .graphics.tilemap import TileData, TileMap
from .physics.body import RigidBody2D
from .physics.collision import move_and_slide, aabb_overlap
from .input.input import Button, InputManager
from .audio.audio import AudioEngine
from .utils.vec2 import Vec2
from .utils.fixed import Fixed
from .utils import asset_loader

__version__ = "0.1.0"

__all__ = [
    "GameEngine",
    "PHYSICS_DT",
    "PHYSICS_HZ",
    "Scene",
    "SceneManager",
    "Renderer",
    "RES_SNES",
    "RES_GENESIS",
    "RES_TALL",
    "ColorPalette",
    "TileLayer",
    "Mode7",
    "Sprite",
    "AnimatedSprite",
    "SpriteSheet",
    "BitmapFont",
    "Camera2D",
    "TileMap",
    "TileData",
    "RigidBody2D",
    "move_and_slide",
    "aabb_overlap",
    "Button",
    "InputManager",
    "AudioEngine",
    "Vec2",
    "Fixed",
    "asset_loader",
    "__version__",
]
