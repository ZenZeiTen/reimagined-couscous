# Kernel tests

Copy this directory to your project root as `tests/`, alongside `src/` holding
the kernel modules. They import `../src/<module>`, which is the layout the Vite
scaffold in `references/assets-and-tooling.md` uses.

29 tests over the parts where a raycaster silently goes wrong:

- **`renderer.test.ts`** — the fisheye lock (every column hitting one flat wall
  must report the same perpendicular distance), packed-pixel round trips and
  shading, wall column heights and z-buffer contents, sprite occlusion behind a
  wall, sprite-sheet direction selection at the cardinals, and rejection of
  malformed sheet metadata.
- **`world.test.ts`** — ASCII parsing including ragged rows, unknown glyphs and
  a missing player start; JSON round-trip; sliding collision, corner escape,
  line of sight and ray distance.
- **`math.test.ts`** — angle wrapping, shortest-arc interpolation, direction
  quantisation, vector and matrix operations.
- **`engine.test.ts`** — fixed-step accumulation, the render interpolation
  alpha, and the sub-step cap that prevents a spiral of death.

Run them with `vitest`. They need no canvas: the renderer passes only touch
`width`, `height` and `data`, so a plain object stands in for the framebuffer.

Keep the fisheye test in particular. It is three lines and it permanently
prevents the single most common regression in this kind of renderer.
