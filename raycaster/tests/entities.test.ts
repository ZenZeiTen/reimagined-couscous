import { describe, it, expect } from 'vitest';
import { Enemy, GRUNT, EntityManager, Weapon, PISTOL, hitscan, Pickup, Decoration, resetEntityIds, type WorldContext } from '../src/entities';
import { parseAsciiMap, type TileLegend } from '../src/world';
import { Vec2 } from '../src/math';

const legend: TileLegend = {
  '#': { wall: 1, floor: 0, ceiling: 0 },
  '.': { wall: 0, floor: 1, ceiling: 1 },
  P: { wall: 0, floor: 1, ceiling: 1, playerStart: true },
};

function makeWorld(rows: string[]) {
  const map = parseAsciiMap({ rows, legend });
  const manager = new EntityManager();
  const sounds: string[] = [];
  const lines: string[] = [];
  const player = {
    pos: new Vec2(map.playerStart.x, map.playerStart.y),
    angle: 0,
    radius: 0.2,
    health: 100,
    isAlive() { return this.health > 0; },
    takeDamage(amount: number) { this.health -= amount; },
  };
  const world: WorldContext = {
    map,
    player,
    entities: manager.entities,
    playSound: (n) => { sounds.push(n); },
    speak: (l) => { lines.push(l); },
    message: () => undefined,
    time: 0,
  };
  return { map, manager, world, player, sounds, lines };
}

function step(manager: EntityManager, world: WorldContext, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) manager.update(dt, world);
}

describe('Weapon', () => {
  it('cycles through fire, empty and reload states', () => {
    const w = new Weapon(PISTOL, 12);
    expect(w.fire()).toBe('fired');
    expect(w.fire()).toBe('busy');
    w.update(PISTOL.cooldown + 0.01);
    for (let i = 1; i < PISTOL.magazine; i++) {
      expect(w.fire()).toBe('fired');
      w.update(PISTOL.cooldown + 0.01);
    }
    expect(w.inMagazine).toBe(0);
    expect(w.fire()).toBe('empty');
    w.update(1);
    expect(w.reload()).toBe(true);
    expect(w.fire()).toBe('busy');
    w.update(PISTOL.reloadTime + 0.01);
    expect(w.inMagazine).toBe(PISTOL.magazine);
    expect(w.reserve).toBe(0);
    expect(w.reload()).toBe(false);
    expect(w.addAmmo(50, 30)).toBe(30);
  });
});

describe('hitscan', () => {
  it('hits the nearest targetable entity in the cone and respects walls', () => {
    resetEntityIds();
    const { map, manager } = makeWorld(['########', '#P...#.#', '########']);
    manager.registerFactory('grunt', () => new Enemy(GRUNT));
    const near = manager.spawn('grunt', 3.5, 1.5);
    manager.spawn('grunt', 4.5, 1.5);
    const behindWall = manager.spawn('grunt', 6.5, 1.5);
    const r = hitscan(map, manager.entities, 1.5, 1.5, 0, 30, 0.02);
    expect(r.entity).toBe(near);
    expect(r.distance).toBeCloseTo(2, 5);
    near.removed = true;
    manager.update(0, { map, player: { pos: new Vec2(1.5, 1.5), angle: 0, radius: 0.2, isAlive: () => true, takeDamage: () => undefined }, entities: manager.entities, playSound: () => undefined, speak: () => undefined, message: () => undefined, time: 0 });
    const r2 = hitscan(map, manager.entities, 1.5, 1.5, 0, 30, 0.02);
    expect(r2.entity?.pos.x).toBe(4.5);
    expect(hitscan(map, [behindWall], 1.5, 1.5, 0, 30, 0.02).entity).toBeNull();
    expect(hitscan(map, [near], 1.5, 1.5, Math.PI, 30, 0.02).entity).toBeNull();
  });
});

describe('Enemy', () => {
  it('notices the player, chases, attacks and dies', () => {
    const { manager, world, player, sounds, lines } = makeWorld(['########', '#P.....#', '#......#', '########']);
    manager.registerFactory('grunt', () => new Enemy(GRUNT));
    const e = manager.spawn('grunt', 6.5, 1.5, Math.PI) as Enemy;
    expect(e.state).toBe('idle');
    step(manager, world, 0.5);
    expect(e.state).toBe('chase');
    expect(sounds).toContain('enemy_alert');
    expect(lines).toContain('enemy_taunt');
    const startX = e.pos.x;
    step(manager, world, 1);
    expect(e.pos.x).toBeLessThan(startX);
    step(manager, world, 6);
    expect(player.health).toBeLessThan(100);
    expect(sounds).toContain('enemy_attack');
    expect(e.pos.distanceTo(player.pos)).toBeGreaterThan(e.radius + player.radius);

    expect(e.takeDamage(30, player.pos.x, player.pos.y, world)).toBe(false);
    expect(e.state).toBe('hurt');
    expect(e.takeDamage(100, player.pos.x, player.pos.y, world)).toBe(true);
    expect(e.state).toBe('dead');
    expect(e.solid).toBe(false);
    expect(e.targetable).toBe(false);
    expect(sounds).toContain('enemy_die');
    const healthAfterDeath = player.health;
    step(manager, world, 2);
    expect(player.health).toBe(healthAfterDeath);
    expect(e.animation).toBe('die');
  });

  it('does not see a player behind a wall or outside its view cone', () => {
    const { manager, world } = makeWorld(['#######', '#P.#..#', '#######']);
    manager.registerFactory('grunt', () => new Enemy(GRUNT));
    const behind = manager.spawn('grunt', 5.5, 1.5, Math.PI) as Enemy;
    step(manager, world, 1);
    expect(behind.state).toBe('idle');

    const open = makeWorld(['#######', '#P....#', '#######']);
    open.manager.registerFactory('grunt', () => new Enemy(GRUNT));
    const facingAway = open.manager.spawn('grunt', 5.5, 1.5, 0) as Enemy; // looking +x, player is at -x
    step(open.manager, open.world, 1);
    expect(facingAway.state).toBe('idle');
  });
});

describe('EntityManager and pickups', () => {
  it('collects pickups on overlap and compacts removed entities', () => {
    const { manager, world, player, sounds } = makeWorld(['#####', '#P..#', '#####']);
    const got: Array<[string, number]> = [];
    manager.registerFactory('ammo', () => new Pickup('ammo', 12, { collect: (k, a) => { got.push([k, a]); return true; } }));
    manager.registerFactory('pillar', () => new Decoration('pillar'));
    manager.spawn('ammo', 3.5, 1.5);
    manager.spawn('pillar', 2.5, 1.5);
    expect(manager.count).toBe(2);
    expect(manager.blocksCircle(2.6, 1.5, 0.2)).toBe(true);
    step(manager, world, 0.1);
    expect(got).toEqual([]);
    player.pos.set(3.5, 1.5);
    step(manager, world, 0.1);
    expect(got).toEqual([['ammo', 12]]);
    expect(sounds).toContain('pickup_ammo');
    expect(manager.count).toBe(1);
    expect(manager.billboards().length).toBe(1);
  });
});
