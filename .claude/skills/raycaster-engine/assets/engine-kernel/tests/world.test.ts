import { describe, it, expect } from 'vitest';
import { parseAsciiMap, parseJsonMap, serializeMap, MapParseError, moveWithCollision, hasLineOfSight, castRayDistance, circleHitsWall, type TileLegend } from '../src/world';
import { Vec2 } from '../src/math';

const legend: TileLegend = {
  '#': { wall: 1, floor: 0, ceiling: 0 },
  '.': { wall: 0, floor: 2, ceiling: 3 },
  P: { wall: 0, floor: 2, ceiling: 3, playerStart: true, startAngleDeg: 90 },
  g: { wall: 0, floor: 2, ceiling: 3, spawn: 'grunt', startAngleDeg: 180 },
};

function room(rows: string[]) {
  return parseAsciiMap({ rows, legend, name: 'test' });
}

describe('parseAsciiMap', () => {
  it('builds layers, spawns and player start', () => {
    const map = room(['#####', '#P..#', '#..g#', '#####']);
    expect(map.width).toBe(5);
    expect(map.height).toBe(4);
    expect(map.getWall(0, 0)).toBe(1);
    expect(map.getWall(1, 1)).toBe(0);
    expect(map.getFloor(1, 1)).toBe(2);
    expect(map.getCeiling(2, 2)).toBe(3);
    expect(map.playerStart.x).toBe(1.5);
    expect(map.playerStart.y).toBe(1.5);
    expect(map.playerStart.angle).toBeCloseTo(Math.PI / 2);
    expect(map.spawns).toEqual([{ type: 'grunt', x: 3.5, y: 2.5, angle: Math.PI }]);
    expect(map.isSolid(-1, 0)).toBe(true);
    expect(map.isSolid(99, 99)).toBe(true);
  });

  it('rejects ragged rows, unknown glyphs and missing starts', () => {
    expect(() => room(['###', '#P#', '##'])).toThrow(MapParseError);
    expect(() => room(['###', '#?#', '###'])).toThrow(/unknown tile/);
    expect(() => room(['###', '#.#', '###'])).toThrow(/player start/);
  });

  it('round-trips through the JSON format', () => {
    const map = room(['#####', '#P..#', '#..g#', '#####']);
    const json = serializeMap(map);
    const back = parseJsonMap(json);
    expect(Array.from(back.walls)).toEqual(Array.from(map.walls));
    expect(back.playerStart.angle).toBeCloseTo(map.playerStart.angle);
    expect(back.spawns[0]!.type).toBe('grunt');
    expect(() => parseJsonMap({ ...json, walls: [] })).toThrow(MapParseError);
  });
});

describe('collision', () => {
  const map = room(['#####', '#P..#', '#...#', '#####']);

  it('detects circle overlap with walls', () => {
    expect(circleHitsWall(map, 2.5, 2.5, 0.2)).toBe(false);
    expect(circleHitsWall(map, 1.1, 2.5, 0.2)).toBe(true);
  });

  it('slides along walls instead of stopping', () => {
    const pos = new Vec2(2.5, 2.5);
    const blocked = moveWithCollision(map, pos, 0.4, 5, 0.2);
    expect(blocked).toBe(true);
    expect(pos.x).toBeCloseTo(2.9);
    expect(pos.y).toBeCloseTo(2.5); // y move blocked by the bottom wall
  });

  it('checks line of sight through open and blocked cells', () => {
    const maze = room(['#######', '#P.#..#', '#..#..#', '#.....#', '#######']);
    expect(hasLineOfSight(maze, 1.5, 1.5, 2.5, 2.5)).toBe(true);
    expect(hasLineOfSight(maze, 1.5, 1.5, 5.5, 1.5)).toBe(false);
    expect(hasLineOfSight(maze, 1.5, 3.5, 5.5, 3.5)).toBe(true);
  });

  it('measures ray distance to the first wall', () => {
    expect(castRayDistance(map, 1.5, 1.5, 1, 0, 100)).toBeCloseTo(2.5);
    expect(castRayDistance(map, 1.5, 1.5, 0, 1, 100)).toBeCloseTo(1.5);
    expect(castRayDistance(map, 1.5, 1.5, 1, 0, 1)).toBe(1);
  });
});
