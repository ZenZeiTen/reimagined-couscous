"""Run every example headless for N frames and fail if any of them raises.

Unit tests cover the pieces; this covers the assembly — the real engine loop
driving a real scene through the renderer, physics, input, and audio. It is the
check that catches an example broken by an API change.

    python -m tools.smoke_examples [frames]
"""

from __future__ import annotations

import importlib.util
import os
import sys
import traceback

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import pygame  # noqa: E402  (must follow the SDL env setup)

import retroforge as rf  # noqa: E402

EXAMPLES = ["platformer", "topdown", "mode7_racer"]


def _load(name: str):
    path = os.path.join(ROOT, "examples", name, "main.py")
    spec = importlib.util.spec_from_file_location(f"example_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _scene_class(module):
    for value in vars(module).values():
        if (isinstance(value, type) and issubclass(value, rf.Scene)
                and value not in (rf.Scene, rf.Transition)):
            return value
    raise LookupError(f"no Scene subclass found in {module.__name__}")


def run(name: str, frames: int) -> bool:
    try:
        pygame.init()
        module = _load(name)
        renderer = rf.Renderer(*rf.RES_GENESIS, scale=1, vsync=False)
        engine = rf.GameEngine(renderer, init_audio=False)
        engine.step(frames, _scene_class(module)())
    except Exception:
        print(f"FAIL {name}")
        traceback.print_exc()
        return False
    print(f"ok   {name} ({frames} frames)")
    return True


def main() -> int:
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    results = [run(name, frames) for name in EXAMPLES]
    if not all(results):
        print(f"\n{results.count(False)} of {len(results)} examples failed")
        return 1
    print(f"\nall {len(results)} examples ran clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
