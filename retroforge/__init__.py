"""RetroForge — a 2D game engine for 16-bit-era (SNES/Genesis) retro games.

Import the public API directly from the top-level package::

    from retroforge import GameEngine, Renderer, Scene, Vec2, Button

The engine targets the look and constraints of 1990s 16-bit consoles: a low-res
virtual screen scaled with crisp nearest-neighbour pixels, sub-palette colour,
four parallax background layers, hardware-style sprites, a Mode 7 affine plane,
and an SNES-style controller model — on top of the boring-but-essential parts a
game actually ships with: text, entities, collision, timers, saves, and a debug
overlay.
"""

from .audio.audio import AudioEngine
from .debug import DebugOverlay
from .engine import PHYSICS_DT, PHYSICS_HZ, GameEngine
from .entity import Entity, MovingPlatform, World
from .fsm import StateMachine
from .graphics.camera import Camera2D
from .graphics.font import BitmapFont
from .graphics.sprite import AnimatedSprite, Sprite, SpriteSheet
from .graphics.tilemap import (
    EMPTY_TILE,
    SLOPE_NONE,
    SLOPE_UP_LEFT,
    SLOPE_UP_LEFT_HIGH,
    SLOPE_UP_LEFT_LOW,
    SLOPE_UP_RIGHT,
    SLOPE_UP_RIGHT_HIGH,
    SLOPE_UP_RIGHT_LOW,
    MapObject,
    TileData,
    TileMap,
)
from .input.input import Button, InputManager
from .particles import ParticleSystem
from .physics.body import Layer, RigidBody2D
from .physics.collision import (
    SpatialHash,
    aabb_overlap,
    depenetrate,
    layers_interact,
    move_and_slide,
    overlaps,
    query,
    resolve_overlaps,
    sweep_aabb,
    sweep_first,
)
from .renderer.layer import TileLayer
from .renderer.mode7 import Mode7
from .renderer.palette import ColorPalette
from .renderer.renderer import RES_GENESIS, RES_SNES, RES_TALL, Renderer
from .save import SaveManager, save_dir
from .scene import Scene, SceneManager
from .transition import Transition
from .utils import asset_loader
from .utils.fixed import Fixed
from .utils.timing import (
    EASINGS,
    Scheduler,
    Timer,
    Tween,
    ease_in_cubic,
    ease_in_out_cubic,
    ease_in_out_quad,
    ease_in_out_sine,
    ease_in_quad,
    ease_out_back,
    ease_out_bounce,
    ease_out_cubic,
    ease_out_quad,
    linear,
)
from .utils.vec2 import Vec2

__version__ = "0.2.0"

__all__ = [
    # engine + scenes
    "GameEngine",
    "PHYSICS_DT",
    "PHYSICS_HZ",
    "Scene",
    "SceneManager",
    "Transition",
    # game objects
    "Entity",
    "StateMachine",
    "ParticleSystem",
    "MovingPlatform",
    "World",
    # rendering
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
    # level data
    "TileMap",
    "SLOPE_NONE",
    "SLOPE_UP_RIGHT",
    "SLOPE_UP_LEFT",
    "SLOPE_UP_RIGHT_LOW",
    "SLOPE_UP_RIGHT_HIGH",
    "SLOPE_UP_LEFT_HIGH",
    "SLOPE_UP_LEFT_LOW",
    "TileData",
    "MapObject",
    "EMPTY_TILE",
    # physics
    "RigidBody2D",
    "Layer",
    "move_and_slide",
    "depenetrate",
    "aabb_overlap",
    "overlaps",
    "layers_interact",
    "query",
    "sweep_aabb",
    "sweep_first",
    "resolve_overlaps",
    "SpatialHash",
    # input + audio
    "Button",
    "InputManager",
    "AudioEngine",
    # timing + easing
    "Scheduler",
    "Timer",
    "Tween",
    "EASINGS",
    "linear",
    "ease_in_quad",
    "ease_out_quad",
    "ease_in_out_quad",
    "ease_in_cubic",
    "ease_out_cubic",
    "ease_in_out_cubic",
    "ease_in_out_sine",
    "ease_out_back",
    "ease_out_bounce",
    # tools
    "DebugOverlay",
    "SaveManager",
    "save_dir",
    "Vec2",
    "Fixed",
    "asset_loader",
    "__version__",
]
