// Neon Harbor — traffic cars and pedestrians. Traffic drives the road
// grid, keeps to its lane, slows at intersections and turns at random.
// Pedestrians walk sidewalks and flee from fast cars, gunfire and heat.

import { ROAD_X, ROAD_Y, nearestRoadX, nearestRoadY, onRoad } from './world.js';
import { createCar } from './cars.js';
import { SeededRandom, mulberry32 } from './rng.js';
import { CAR_COLORS } from './config.js';

const PED_COLORS = ['#ff8a5c', '#5cb8ff', '#ffd94a', '#c98aff', '#7be0a3', '#ff6b9d', '#e8e4da'];

export class TrafficSystem {
  constructor(G) {
    this.G = G;
    this.rng = new SeededRandom(777);
    this.traffic = [];
    this.peds = [];
    this.spawnTimer = 0;
    const r2 = new SeededRandom(4242);
    // Parked cars along curbs
    const parkedSpots = [
      [500, 205, 0], [800, 205, 0], [1400, 205, Math.PI], [2000, 205, 0],
      [500, 455, 0], [1700, 455, Math.PI], [800, 705, 0], [2000, 705, Math.PI],
      [500, 955, 0], [1400, 955, Math.PI], [800, 1205, 0], [2000, 1205, Math.PI],
      [500, 1455, 0], [1700, 1455, Math.PI],
    ];
    const models = ['sedan', 'hatch', 'coupe', 'taxi', 'sedan', 'hatch'];
    parkedSpots.forEach(([x, y, a], i) => {
      const c = createCar(models[i % models.length], x, y, a, { parked: true, driver: false, color: CAR_COLORS[i % CAR_COLORS.length] });
      this.traffic.push(c);
    });
    // Moving traffic
    for (let i = 0; i < 12; i++) this.spawnTrafficCar(true);
    // Pedestrians
    for (let i = 0; i < 38; i++) {
      this.peds.push(this.makePed(r2));
    }
  }
  makePed(rng) {
    const vertical = rng.chance(0.5);
    const x = vertical ? nearestRoadX(rng.float(150, 2250)) + rng.float(-70, 70) : rng.float(150, 2250);
    const y = vertical ? rng.float(150, 1650) : nearestRoadY(rng.float(150, 1650)) + rng.float(-70, 70);
    return {
      x, y, speed: rng.float(35, 70), angle: rng.float(0, Math.PI * 2),
      color: rng.pick(PED_COLORS), down: false, downTimer: 0,
      flee: false, wander: rng.float(0, 4), walkPhase: rng.float(0, 6),
    };
  }
  spawnTrafficCar(anywhere = false) {
    const r = this.rng;
    const vertical = r.chance(0.5);
    const road = vertical ? r.pick(ROAD_X) : r.pick(ROAD_Y);
    const x = vertical ? road + (r.chance(0.5) ? -18 : 18) : r.float(200, 2200);
    const y = vertical ? r.float(200, 1600) : road + (r.chance(0.5) ? -18 : 18);
    const angle = vertical ? (x < road ? Math.PI / 2 : -Math.PI / 2) : (y < road ? 0 : Math.PI);
    const models = ['sedan', 'hatch', 'taxi', 'sedan', 'coupe'];
    const c = createCar(r.pick(models), x, y, angle, { driver: true, color: r.pick(CAR_COLORS) });
    c.speed = r.float(120, 190);
    c.cruise = c.speed;
    this.traffic.push(c);
    return c;
  }
  update(dt) {
    const G = this.G;
    const p = G.player;
    const playerPos = p.inCar ? p.inCar : p;
    // Traffic
    for (const c of this.traffic) {
      if (c.parked || c.wrecked || c.police) continue;
      if (c === p.inCar) continue;
      // Slow near intersections and near the player car ahead
      let target = c.cruise || 150;
      const nearX = ROAD_X.some((rx) => Math.abs(c.x - rx) < 60);
      const nearY = ROAD_Y.some((ry) => Math.abs(c.y - ry) < 60);
      if ((nearX || nearY) && this.rng.chance(0.02)) target = 60;
      const pd = Math.hypot(playerPos.x - c.x, playerPos.y - c.y);
      if (pd < 90) target = Math.min(target, 70); // give way
      c.speed += (target - c.speed) * dt * 1.2;
      // Random turn at intersections
      if (((Math.abs(c.x - nearestRoadX(c.x)) < 8 && Math.abs(c.y - nearestRoadY(c.y)) < 8)) && this.rng.chance(dt * 0.5)) {
        c.angle += this.rng.pick([-Math.PI / 2, Math.PI / 2]);
      }
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      if (onRoad(nx, ny)) { c.x = nx; c.y = ny; }
      else {
        c.angle += Math.PI / 2; // turn back onto the grid
      }
      if (c.x < 80 || c.x > 2320 || c.y < 80 || c.y > 1700) {
        c.x = Math.max(120, Math.min(2280, c.x));
        c.y = Math.max(120, Math.min(1680, c.y));
        c.angle += Math.PI;
      }
    }
    this.spawnTimer -= dt;
    const moving = this.traffic.filter((c) => !c.parked).length;
    if (this.spawnTimer <= 0 && moving < 16) { this.spawnTrafficCar(); this.spawnTimer = 2.5; }
    // Pedestrians
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) { ped.down = false; ped.flee = true; }
        continue;
      }
      const d = Math.hypot(playerPos.x - ped.x, playerPos.y - ped.y);
      const scared = d < 170 && (G.wanted > 0 || (p.inCar && Math.abs(p.inCar.speed) > 150) || G.recentShot);
      if (scared) ped.flee = true;
      ped.wander -= dt;
      if (ped.flee) {
        const a = Math.atan2(ped.y - playerPos.y, ped.x - playerPos.x);
        ped.angle = a;
        ped.x += Math.cos(a) * 150 * dt;
        ped.y += Math.sin(a) * 150 * dt;
        if (d > 320) ped.flee = false;
      } else {
        if (ped.wander <= 0) { ped.angle = this.rng.float(0, Math.PI * 2); ped.wander = this.rng.float(2, 6); }
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.walkPhase += dt * 6;
      ped.x = Math.max(60, Math.min(2340, ped.x));
      ped.y = Math.max(60, Math.min(1700, ped.y));
    }
    if (this.peds.length > 46) this.peds.length = 46;
  }
  draw(ctx) {
    for (const c of this.traffic) {
      // Every car in the master list is drawn here, including the player's
      // car: drawPlayer() returns early while Rex is driving, so skipping
      // the player's car here would make it invisible.
      this.G.drawCarFn(ctx, c);
    }
    for (const ped of this.peds) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      if (ped.down) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = ped.color;
        ctx.fillRect(-12, -6, 24, 12);
        ctx.fillStyle = '#f2c98a';
        ctx.beginPath(); ctx.arc(14, 0, 6, 0, Math.PI * 2); ctx.fill();
      } else {
        const bob = Math.sin(ped.walkPhase) * 2;
        ctx.rotate(ped.angle);
        ctx.fillStyle = '#00000033';
        ctx.beginPath(); ctx.ellipse(0, 4, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ped.color;
        ctx.fillRect(-7, -6 + bob * 0.3, 13, 12);
        ctx.fillStyle = '#f2c98a';
        ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#22222e';
        ctx.fillRect(-9, -5, 5, 10);
      }
      ctx.restore();
    }
  }
}
