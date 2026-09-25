import { describe, it, expect } from 'vitest';
import { Player, EntityManager, Chest, Door, Lever, Inventory, Projectile, Enemy, GRUNT, type WorldContext } from '../src/entities';
import { parseAsciiMap, type TileLegend } from '../src/world';
import { Shading } from '../src/renderer';
import { HALF_PI } from '../src/math';

const legend: TileLegend = {
  '#': { wall: 1, floor: 0, ceiling: 0 },
  D: { wall: 5, floor: 1, ceiling: 1 },
  '.': { wall: 0, floor: 1, ceiling: 1 },
  P: { wall: 0, floor: 1, ceiling: 1, playerStart: true, startAngleDeg: 0 },
};

/** Minimal Input stand-in: a set of held action names. */
class FakeInput {
  held = new Set<string>();
  mouseDeltaY = 0;
  isAction(a: string): boolean { return this.held.has(a); }
}

function setup(rows: string[]) {
  const map = parseAsciiMap({ rows, legend });
  const manager = new EntityManager();
  const player = new Player();
  player.spawn(map.playerStart.x, map.playerStart.y, map.playerStart.angle);
  const sounds: string[] = [];
  const world: WorldContext = {
    map,
    player,
    entities: manager.entities,
    playSound: (n) => { sounds.push(n); },
    speak: () => undefined,
    message: () => undefined,
    time: 0,
  };
  const input = new FakeInput();
  const run = (seconds: number) => {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i++) {
      player.update(1 / 60, input as unknown as Parameters<Player['update']>[1], map, manager, 240);
      manager.update(1 / 60, world);
    }
  };
  return { map, manager, player, world, sounds, input, run };
}

describe('grid player', () => {
  it('steps exactly one tile with a smooth tween and stays cell-locked', () => {
    const { player, input, run } = setup(['#####', '#P..#', '#####']);
    expect(player.pos.x).toBe(1.5);
    input.held.add('forward');
    run(1 / 60);
    expect(player.action).toBe('move');
    run(0.15);
    expect(player.pos.x).toBeGreaterThan(1.5);
    expect(player.pos.x).toBeLessThan(2.5);
    input.held.clear();
    run(0.5);
    expect(player.action).toBe('idle');
    expect(player.pos.x).toBeCloseTo(2.5, 6);
    expect(player.pos.y).toBeCloseTo(1.5, 6);
    expect(player.cellX).toBe(2);
  });

  it('snap-turns in 90° increments and interpolates the camera angle', () => {
    const { player, input, run } = setup(['###', '#P#', '###']);
    input.held.add('turnRight');
    run(1 / 60);
    input.held.clear();
    expect(player.action).toBe('turn');
    run(0.1);
    expect(player.angle).toBeGreaterThan(0);
    expect(player.angle).toBeLessThan(HALF_PI);
    run(0.2); // turn (0.24 s) is complete, post-action delay (0.08 s) still running
    expect(player.facing).toBe(1);
    expect(player.angle).toBeCloseTo(HALF_PI, 6);
    expect(player.facingName).toBe('S');
    expect(player.tryTurn(-1)).toBe(false); // still in post-action delay
    run(0.2);
    expect(player.tryTurn(-1)).toBe(true);
    run(0.5);
    expect(player.facing).toBe(0);
  });

  it('refuses to walk into walls or solid entities and reports the bump', () => {
    const { player, manager, input, run } = setup(['#####', '#P.##', '#####']);
    let bumps = 0;
    player.onBlocked = () => bumps++;
    const chest = new Chest({ kind: 'gold', amount: 1 });
    chest.pos.set(2.5, 1.5);
    manager.add(chest);
    input.held.add('forward');
    run(0.5);
    expect(player.cellX).toBe(1);
    expect(bumps).toBeGreaterThan(0);
    expect(player.stamina).toBeCloseTo(player.maxStamina, 0);
  });

  it('gates actions on stamina and recovers over time', () => {
    const { player, input, run } = setup(['#####', '#P..#', '#####']);
    player.config.moveStaminaCost = 60;
    player.config.staminaRegen = 40;
    input.held.add('forward');
    run(0.4);
    expect(player.cellX).toBe(2);
    expect(player.stamina).toBeLessThan(60);
    // Second step is refused until stamina regenerates past the cost.
    run(0.3);
    expect(player.cellX).toBe(2);
    run(1.5);
    expect(player.cellX).toBe(3);
  });

  it('uses items and spends mana on casting', () => {
    const { player, input, run } = setup(['#####', '#P..#', '#####']);
    player.health = 10;
    player.inventory.add('potion', 1);
    expect(player.useItem()).toBe('potion');
    expect(player.health).toBe(50);
    expect(player.useItem()).toBeNull();
    const before = player.mana;
    expect(player.tryCast()).toBe(true);
    expect(player.mana).toBe(before - player.inventory.equipment.spell.manaCost);
    let impacts = 0;
    player.onAttackImpact = () => impacts++;
    input.held.clear();
    run(0.6);
    expect(impacts).toBe(1);
  });
});

describe('interactables', () => {
  it('chests hand over their contents once', () => {
    const { world, player, sounds } = setup(['###', '#P#', '###']);
    const chest = new Chest({ kind: 'key', amount: 1, keyId: 'iron' });
    expect(chest.prompt(player)).toBe('Open chest');
    const r = chest.interact(world, player);
    expect(r.ok).toBe(true);
    expect(player.inventory.hasKey('iron')).toBe(true);
    expect(chest.animation).toBe('open');
    expect(chest.prompt(player)).toBeNull();
    expect(chest.interact(world, player).ok).toBe(false);
    expect(sounds).toContain('chest_open');
  });

  it('doors clear their wall tile, respect keys and answer to levers', () => {
    const { map, world, player, sounds, manager } = setup(['#####', '#PD.#', '#####']);
    const door = new Door(5, 'iron', 'gate');
    door.pos.set(2.5, 1.5);
    manager.add(door);
    expect(map.isSolid(2, 1)).toBe(true);
    expect(door.prompt(player)).toMatch(/Locked/);
    expect(door.interact(world, player).ok).toBe(false);
    expect(sounds).toContain('door_locked');
    const lever = new Lever('gate');
    expect(lever.interact(world, player).message).toMatch(/uselessly/); // locked doors ignore levers
    player.inventory.add('key', 1, 'iron');
    expect(door.interact(world, player).ok).toBe(true);
    expect(door.isLocked).toBe(false);
    expect(map.isSolid(2, 1)).toBe(false);
    expect(sounds).toContain('door_open');
    door.setOpen(world, false);
    expect(map.isSolid(2, 1)).toBe(true);
    // The lever is currently "on" from the earlier pull; pulling it back then forward opens the now-unlocked door.
    expect(lever.interact(world, player).message).toMatch(/rumbles/);
    expect(door.open).toBe(false);
    expect(lever.interact(world, player).message).toMatch(/rumbles/);
    expect(door.open).toBe(true);
    expect(map.isSolid(2, 1)).toBe(false);
  });

  it('projectiles damage the first enemy and vanish on walls', () => {
    const { manager, run } = setup(['#######', '#P....#', '#######']);
    manager.registerFactory('grunt', () => new Enemy(GRUNT));
    const target = manager.spawn('grunt', 4.5, 1.5, Math.PI) as Enemy;
    const bolt = new Projectile(0, 7, 45, 8);
    bolt.pos.set(1.9, 1.5);
    manager.add(bolt);
    run(1);
    expect(target.health).toBe(GRUNT.health - 45);
    expect(manager.entities.includes(bolt)).toBe(false);
    const stray = new Projectile(Math.PI, 7, 45, 8);
    stray.pos.set(1.9, 1.5);
    manager.add(stray);
    run(1);
    expect(manager.entities.includes(stray)).toBe(false);
  });
});

describe('dungeon shading', () => {
  it('falls off exponentially and clamps to darkness beyond the fog distance', () => {
    const s = new Shading(8, 0, 0.7, 'dungeon', 0.6, 0.5);
    expect(s.factorFor(0)).toBe(256);
    expect(s.factorFor(0.5)).toBe(256);
    const near = s.factorFor(2);
    const far = s.factorFor(5);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThan(256);
    expect(far / 256).toBeCloseTo(Math.exp(-0.6 * 4.5), 1);
    expect(s.factorFor(9)).toBe(0);
    s.configure({ ambient: 0.5 });
    expect(s.factorFor(0)).toBe(128);
  });

  it('keeps the linear mode behaviour', () => {
    const s = new Shading(10, 0.1, 0.7, 'linear');
    expect(s.factorFor(5) / 256).toBeCloseTo(0.5, 1);
    expect(s.factorFor(50) / 256).toBeCloseTo(0.1, 1);
  });
});

describe('inventory', () => {
  it('stacks items and tracks keys', () => {
    const inv = new Inventory();
    inv.add('potion', 2);
    inv.add('potion', 1);
    inv.add('key', 1, 'iron');
    expect(inv.count('potion')).toBe(3);
    expect(inv.remove('potion', 5)).toBe(3);
    expect(inv.count('potion')).toBe(0);
    expect(inv.keys()).toEqual(['iron']);
    expect(inv.hasKey('gold')).toBe(false);
  });
});
