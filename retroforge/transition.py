"""Scene transitions — fades and wipes between scenes.

A hard cut between a title screen and a level looks broken; every 16-bit game
faded, wiped, or irised between them. The Renderer already knows how to fade and
mosaic the virtual screen, but "fade out, swap the scene, fade in" is scene-stack
choreography, and without a helper every game rewrites it.

``Transition`` is a transparent scene pushed on top of the stack. It covers the
screen while it runs, swaps the scene underneath at the midpoint, and pops
itself when it is done.

    engine.scenes.push(rf.Transition(Level2(), style="fade", duration=0.6))
"""

from __future__ import annotations

import pygame

from .renderer.renderer import Renderer
from .scene import Scene
from .utils.timing import _resolve


class Transition(Scene):
    """Covers the screen, swaps to ``target`` at the midpoint, then pops.

    ``style`` is one of ``"fade"`` (to black), ``"fade_white"``, ``"mosaic"``
    (pixelate out and back), ``"wipe"`` (a bar sweeping across), or ``"iris"``
    (a shrinking circle, the Zelda door effect).

    Pass ``target=None`` to run the effect over the current scene without
    changing it, and ``replace=False`` to push the target on top instead of
    replacing what is there.
    """

    transparent = True

    def __init__(
        self,
        target: Scene | None = None,
        *,
        style: str = "fade",
        duration: float = 0.6,
        color: tuple[int, int, int] = (0, 0, 0),
        replace: bool = True,
        ease=None,
        on_swap=None,
    ) -> None:
        self.target = target
        self.style = style
        self.duration = max(1e-6, float(duration))
        self.color = color
        self.replace = replace
        self.ease = _resolve(ease)
        self.on_swap = on_swap

        self._elapsed = 0.0
        self._swapped = False

    def on_enter(self, engine) -> None:
        self.engine = engine

    @property
    def progress(self) -> float:
        """0 at the start, 1 at the end."""
        return min(1.0, self._elapsed / self.duration)

    @property
    def cover(self) -> float:
        """How covered the screen is: 0 clear, 1 fully obscured at the midpoint."""
        t = self.progress
        return self.ease(1.0 - abs(t * 2.0 - 1.0))

    def update(self, dt: float, inp) -> None:
        self._elapsed += dt

        if not self._swapped and self.progress >= 0.5:
            self._swapped = True
            if self.on_swap is not None:
                self.on_swap()
            if self.target is not None:
                stack = self.engine.scenes
                # Swap the scene *underneath* this transition: pop the
                # transition, change the scene, then push it back on top.
                stack.pop()
                if self.replace:
                    stack.replace(self.target)
                else:
                    stack.push(self.target)
                stack.push(self)

        if self.progress >= 1.0:
            self.engine.scenes.pop()

    def draw(self, renderer: Renderer) -> None:
        amount = self.cover
        if amount <= 0.0:
            return
        target = renderer.target
        w, h = renderer.width, renderer.height

        if self.style == "mosaic":
            block = 1 + int(amount * 15)
            renderer.apply_mosaic(block)
            renderer.apply_fade(amount * 0.4)
            return

        if self.style == "wipe":
            width = int(w * amount)
            pygame.draw.rect(target, self.color, (0, 0, width, h))
            return

        if self.style == "iris":
            # A shrinking hole: paint the cover colour everywhere except a
            # circle whose radius closes to nothing.
            max_r = int(((w / 2) ** 2 + (h / 2) ** 2) ** 0.5) + 1
            radius = int(max_r * (1.0 - amount))
            mask = pygame.Surface((w, h), pygame.SRCALPHA)
            mask.fill((*self.color, 255))
            if radius > 0:
                pygame.draw.circle(mask, (0, 0, 0, 0), (w // 2, h // 2), radius)
            target.blit(mask, (0, 0))
            return

        renderer.apply_fade(amount, to_white=(self.style == "fade_white"))
