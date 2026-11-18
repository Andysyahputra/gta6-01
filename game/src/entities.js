// Neon Harbor — cars, traffic, pedestrians and bullets.
// Traffic drives the road grid (right-hand lanes, random turns at intersections,
// yields when a car is ahead); pedestrians walk the sidewalks and flee from
// danger; bullets fly from the player's pistol and police guns.
import { WORLD, CAR_MODELS } from './config.js';
import { makeRng, clamp, dist, angleDiff } from './rng.js';
import { collideCircle, insideBuilding, onRoad } from './world.js';

let nextCarId = 1;

export function makeCar(modelKey, x, y, angle, opts = {}) {
  const m = CAR_MODELS[modelKey];
  return {
    id: nextCarId++,
    model: modelKey,
    name: m.name,
    color: opts.color || m.color,
    x, y, angle,
    speed: 0,
    top: m.top, accel: m.accel, turn: m.turn,
    w: m.w, h: m.h,
    health: 100,
    traffic: !!opts.traffic,
    parked: !!opts.parked,
    police: !!opts.police,
    dir: opts.dir ?? 0,          // traffic: 0 E, 1 S, 2 W, 3 N
    lane: opts.lane ?? 14,       // traffic: lateral offset from road centre
    cruise: opts.cruise ?? 110,  // traffic: cruising speed
    wait: 0,                     // traffic: seconds paused at an intersection
    lastNode: '',
    dead: false,
    wrecked: false,
    smoke: 0,
    sirenPhase: Math.random() * 10,
  };
}

// ---- Traffic ---------------------------------------------------------------

export class Traffic {
  constructor(city, seed) {
    this.city = city;
    this.rng = makeRng(seed + 77);
    this.cars = [];
    this.parked = [];
    this.spawnParked();
  }

  spawnParked() {
    const models = ['sedan', 'comet', 'coupe', 'taxi', 'pickup'];
    let tries = 0;
    while (this.parked.length < 9 && tries < 200) {
      tries++;
      const vertical = this.rng.chance(0.5);
      const road = this.rng.pick(vertical ? WORLD.V_ROADS : WORLD.H_ROADS);
      const along = this.rng.range(140, vertical ? WORLD.H - 260 : WORLD.W - 140);
      const off = (WORLD.ROAD_W / 2 + 16) * (this.rng.chance(0.5) ? 1 : -1);
      const x = vertical ? road + off : along;
      const y = vertical ? along : road + off;
      if (insideBuilding(x, y, this.city) || onRoad(x, y) || y > WORLD.WATER_Y - 40) continue;
      if (this.parked.some((c) => dist(c.x, c.y, x, y) < 120)) continue;
      const angle = vertical ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : (off > 0 ? 0 : Math.PI);
      this.parked.push(makeCar(this.rng.pick(models), x, y, angle, { parked: true }));
    }
  }

  spawnTrafficCar(px, py) {
    // Spawn on a road near the player (but not on top of them).
    const vertical = this.rng.chance(0.5);
    const road = this.rng.pick(vertical ? WORLD.V_ROADS : WORLD.H_ROADS);
    const along = clamp((vertical ? py : px) + this.rng.range(-500, 500), 120, (vertical ? WORLD.H : WORLD.W) - 220);
    const dir = this.rng.int(0, 3);
    const model = this.rng.pick(['sedan', 'taxi', 'pickup', 'sedan', 'comet']);
    const lane = 16;
    let x, y;
    if (dir === 0) { x = vertical ? road - lane : along; y = vertical ? along : road + lane; }
    else if (dir === 2) { x = vertical ? road + lane : along; y = vertical ? along : road - lane; }
    else if (dir === 1) { x = vertical ? road - lane : along; y = vertical ? along : road + lane; }
    else { x = vertical ? road + lane : along; y = vertical ? along : road - lane; }
    if (insideBuilding(x, y, this.city)) return;
    const c = makeCar(model, x, y, dir * Math.PI / 2, { traffic: true, dir, lane, cruise: this.rng.range(85, 135) });
    c.speed = c.cruise;
    this.cars.push(c);
  }

  update(dt, playerPos, playerCar) {
    // Keep traffic topped up near the player.
    if (this.cars.length < 11) this.spawnTrafficCar(playerPos.x, playerPos.y);
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const c of this.cars) {
      if (c.wait > 0) { c.wait -= dt; c.speed = Math.max(0, c.speed - 300 * dt); continue; }
      const [dx, dy] = DIRS[c.dir];
      // Slow down for a car ahead in the same lane.
      let target = c.cruise;
      for (const o of this.cars) {
        if (o === c) continue;
        const ox = o.x - c.x, oy = o.y - c.y;
        const ahead = ox * dx + oy * dy;
        const side = Math.abs(ox * dy - oy * dx);
        if (ahead > 0 && ahead < 70 && side < 26) { target = Math.min(target, o.speed * 0.8); }
      }
      if (playerCar) {
        const ox = playerCar.x - c.x, oy = playerCar.y - c.y;
        const ahead = ox * dx + oy * dy;
        const side = Math.abs(ox * dy - oy * dx);
        if (ahead > 0 && ahead < 80 && side < 30) target = 0;
      }
      c.speed += clamp(target - c.speed, -260 * dt, 200 * dt);
      c.x += dx * c.speed * dt;
      c.y += dy * c.speed * dt;
      // Intersection decision: near a crossing road centre.
      const nearV = WORLD.V_ROADS.find((rx) => Math.abs(c.x - rx) < 10);
      const nearH = WORLD.H_ROADS.find((ry) => Math.abs(c.y - ry) < 10);
      if (nearV !== undefined && nearH !== undefined) {
        const key = nearV + ':' + nearH;
        if (c.lastNode !== key) {
          c.lastNode = key;
          if (this.rng.chance(0.14)) { c.wait = this.rng.range(0.8, 2.0); }
          else {
            const r = this.rng.next();
            const turn = r < 0.62 ? 0 : r < 0.81 ? 1 : -1; // straight / left / right
            const nd = (c.dir + turn + 4) % 4;
            if (nd !== (c.dir + 2) % 4) {
              c.dir = nd;
              // Snap onto the new road's lane (right-hand traffic).
              if (nd === 0) { c.y = nearH + 16; }
              else if (nd === 2) { c.y = nearH - 16; }
              else if (nd === 1) { c.x = nearV - 16; }
              else { c.x = nearV + 16; }
            }
          }
        }
      }
      c.angle = c.dir * Math.PI / 2;
      // Recycle cars that wandered far from the player.
      if (dist(c.x, c.y, playerPos.x, playerPos.y) > 1100) {
        c.dead = true;
      }
    }
    this.cars = this.cars.filter((c) => !c.dead);
  }

  allCars() { return [...this.cars, ...this.parked.filter((c) => !c.dead)]; }
}

// ---- Pedestrians -----------------------------------------------------------

const SHIRTS = ['#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#34d399', '#f472b6', '#fb923c', '#e2e8f0'];

export class Pedestrians {
  constructor(city, seed) {
    this.city = city;
    this.rng = makeRng(seed + 31);
    this.list = [];
    this.shotTimer = 0; // seconds since the last gunshot (peds flee while fresh)
  }

  update(dt, player, playerCar, wanted) {
    if (this.shotTimer > 0) this.shotTimer -= dt;
    if (this.list.length < 24) this.spawn(player);
    const pSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
    for (const p of this.list) {
      if (p.state === 'down') {
        p.down -= dt;
        if (p.down <= 0) { p.state = 'flee'; p.flee = 2.5; }
        continue;
      }
      const dPlayer = dist(p.x, p.y, player.x, player.y);
      const danger = (playerCar && pSpeed > 190 && dPlayer < 190) ||
        (this.shotTimer > 0 && dPlayer < 320) ||
        (wanted > 0 && dPlayer < 220);
      if (danger && p.state !== 'flee') { p.state = 'flee'; p.flee = this.rng.range(1.5, 3); }
      if (p.state === 'flee') {
        p.flee -= dt;
        const a = Math.atan2(p.y - player.y, p.x - player.x);
        p.x += Math.cos(a) * 210 * dt;
        p.y += Math.sin(a) * 210 * dt;
        p.angle = a;
        if (p.flee <= 0) p.state = 'walk';
      } else {
        // Walk along a sidewalk: parallel to a road, offset from its centre.
        p.x += Math.cos(p.angle) * 55 * dt;
        p.y += Math.sin(p.angle) * 55 * dt;
        // At an intersection, sometimes turn or cross.
        const nearV = WORLD.V_ROADS.find((rx) => Math.abs(p.x - rx) < 14);
        const nearH = WORLD.H_ROADS.find((ry) => Math.abs(p.y - ry) < 14);
        if (nearV !== undefined && nearH !== undefined && this.rng.chance(0.02)) {
          p.angle = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
        }
      }
      // Keep peds out of buildings and water; nudge them back onto sidewalks.
      p.x = clamp(p.x, 20, WORLD.W - 20);
      p.y = clamp(p.y, 20, WORLD.WATER_Y - 16);
      if (insideBuilding(p.x, p.y, this.city)) {
        p.angle += Math.PI / 2;
        p.x += Math.cos(p.angle) * 30 * dt;
        p.y += Math.sin(p.angle) * 30 * dt;
      }
      if (dist(p.x, p.y, player.x, player.y) > 1200) p.dead = true;
    }
    this.list = this.list.filter((p) => !p.dead);
  }

  spawn(player) {
    const vertical = this.rng.chance(0.5);
    const road = this.rng.pick(vertical ? WORLD.V_ROADS : WORLD.H_ROADS);
    const along = clamp((vertical ? player.y : player.x) + this.rng.range(-450, 450), 100, (vertical ? WORLD.H : WORLD.W) - 200);
    const off = (WORLD.ROAD_W / 2 + 14) * (this.rng.chance(0.5) ? 1 : -1);
    const x = vertical ? road + off : along;
    const y = vertical ? along : road + off;
    if (insideBuilding(x, y, this.city) || y > WORLD.WATER_Y - 30) return;
    const angle = vertical ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (this.rng.chance(0.5) ? 0 : Math.PI);
    this.list.push({
      x, y, angle, state: 'walk', flee: 0, down: 0,
      shirt: this.rng.pick(SHIRTS), skin: this.rng.pick(['#f2c89b', '#d9a066', '#8d5524', '#f7d7b0']),
      walkPhase: this.rng.range(0, 6), dead: false,
    });
  }

  knockDown(p) { p.state = 'down'; p.down = 2.5; }
}

// ---- Bullets ---------------------------------------------------------------

export class Bullets {
  constructor() { this.list = []; }
  fire(x, y, angle, fromPlayer) {
    this.list.push({ x, y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, life: 0.9, fromPlayer });
  }
  update(dt, city) {
    for (const b of this.list) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < 0 || b.x > WORLD.W || b.y < 0 || b.y > WORLD.H) b.life = 0;
      else if (insideBuilding(b.x, b.y, city)) b.life = 0;
    }
    this.list = this.list.filter((b) => b.life > 0);
  }
}
