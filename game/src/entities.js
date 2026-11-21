// Neon Harbor — cars, the player on foot, traffic, pedestrians, bullets.
import {
  WORLD_W, WORLD_H, CAR_MODELS, TRAFFIC_MODELS, MAX_PEDS, MAX_TRAFFIC,
  PLAYER_WALK, PLAYER_RUN, PLAYER_RADIUS, PISTOL_AMMO_MAX,
  VERTICAL_ROADS, HORIZONTAL_ROADS, ROAD_HALF, clamp, angleDiff, dist2,
} from './config.js';
import { Rng } from './rng.js';
import { collideCircle, onRoad, inWater } from './world.js';

// A car: shared by the player, traffic and police. angle 0 = east, -PI/2 = north.
export class Car {
  constructor(modelKey, x, y, angle) {
    const m = CAR_MODELS[modelKey];
    this.modelKey = modelKey; this.model = m;
    this.x = x; this.y = y; this.angle = angle;
    this.speed = 0; this.health = 100;
    this.driver = null; // 'player' | 'traffic' | 'police' | 'parked'
    this.occupied = false; // a traffic driver sits in it
    this.steer = 0; this.wrecked = false;
    this.flash = 0; // hit flash timer
    this.isMissionCar = false;
  }
  get name() { return this.model.name; }
  // Arcade driving: W/S throttle, A/D steer; momentum and speed-sensitive turn.
  drive(throttle, steer, dt) {
    const m = this.model;
    if (throttle > 0) this.speed += m.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 5) this.speed -= m.accel * 1.4 * dt; // brake
      else this.speed = Math.max(this.speed + m.accel * 0.5 * dt, -170); // reverse
    } else {
      this.speed -= this.speed * 1.6 * dt; // drag
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }
    this.speed = clamp(this.speed, -170, m.topSpeed);
    const speedRatio = clamp(Math.abs(this.speed) / m.topSpeed, 0, 1);
    const turnRate = m.turn * (1 - speedRatio * 0.45) * (this.speed >= 0 ? 1 : -1);
    this.angle += steer * turnRate * dt * (Math.abs(this.speed) > 8 ? 1 : 0);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }
  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const L = this.model.len, W = this.model.wid;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L, W);
    // body
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.model.color;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    // cabin + windshield
    ctx.fillStyle = 'rgba(20,24,34,0.85)';
    ctx.beginPath(); ctx.roundRect(-L * 0.18, -W / 2 + 3, L * 0.36, W - 6, 4); ctx.fill();
    ctx.fillStyle = 'rgba(140,200,230,0.7)';
    ctx.fillRect(L * 0.18, -W / 2 + 4, 4, W - 8);
    // headlights / taillights
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 4); ctx.fillRect(L / 2 - 2, W / 2 - 6, 3, 4);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 3, 4); ctx.fillRect(-L / 2 - 1, W / 2 - 6, 3, 4);
    if (this.modelKey === 'taxi') {
      ctx.fillStyle = '#222'; ctx.fillRect(-4, -W / 2 + 1, 8, 6);
      ctx.fillStyle = '#f2c230'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -W / 2 + 6);
    }
    if (this.modelKey === 'cruiser') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('HPD', 0, 2);
      const blink = Math.floor(time / 180) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2a2a' : '#2a7bff';
      ctx.beginPath(); ctx.arc(-L * 0.28, -W / 2 + 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#2a7bff' : '#ff2a2a';
      ctx.beginPath(); ctx.arc(-L * 0.28, W / 2 - 1, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.angle = -Math.PI / 2;
    this.health = 100; this.cash = 50;
    this.pistol = false; this.ammo = 0;
    this.inCar = null; // Car or null
    this.punchTimer = 0; this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.walkPhase = 0; this.moving = false;
    this.bestWanted = 0;
  }
  pos() { return this.inCar ? { x: this.inCar.x, y: this.inCar.y } : { x: this.x, y: this.y }; }
}

// ---- Traffic: cars that follow the road grid, slow at intersections, turn ----
export class Traffic {
  constructor(world, seed) {
    this.world = world; this.rng = new Rng(seed + 101);
    this.cars = [];
    this.parked = [];
    this.spawnTimer = 0;
    for (let i = 0; i < 10; i++) this.spawnCar(true);
    this.spawnParked();
  }
  spawnParked() {
    const rng = this.rng;
    // Parked cars along curbs near roads.
    const spots = [
      [340, 660, 0], [660, 340, Math.PI / 2], [1140, 660, 0], [1540, 340, Math.PI / 2],
      [740, 1140, 0], [1140, 1540, Math.PI / 2], [1940, 740, 0], [340, 1540, Math.PI / 2],
      [1540, 1140, 0], [740, 740, Math.PI / 2], [1940, 1140, 0], [340, 1140, Math.PI / 2],
    ];
    for (const [x, y, a] of spots) {
      if (rng.chance(0.25)) continue;
      const c = new Car(rng.pick(TRAFFIC_MODELS), x, y, a);
      c.driver = 'parked'; c.occupied = false;
      this.parked.push(c);
    }
  }
  spawnCar(anywhere) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(VERTICAL_ROADS) : rng.pick(HORIZONTAL_ROADS);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = 16;
    let x, y, angle;
    if (vertical) {
      x = road + dir * lane; y = rng.range(80, 1560); angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      y = road + dir * lane; x = rng.range(80, 2320); angle = dir > 0 ? 0 : Math.PI;
    }
    const c = new Car(rng.pick(TRAFFIC_MODELS), x, y, angle);
    c.driver = 'traffic'; c.occupied = true;
    c.axis = vertical ? 'v' : 'h'; c.dir = dir; c.road = road;
    c.speed = rng.range(120, 190);
    c.baseSpeed = c.speed;
    this.cars.push(c);
  }
  nearestIntersection(x, y) {
    let best = null, bd = 1e9;
    for (const rx of VERTICAL_ROADS) for (const ry of HORIZONTAL_ROADS) {
      const d = dist2(x, y, rx, ry);
      if (d < bd) { bd = d; best = { x: rx, y: ry, d: Math.sqrt(d) }; }
    }
    return best;
  }
  update(dt, playerPos, playerSpeed) {
    // Spawn upkeep.
    this.spawnTimer -= dt;
    if (this.cars.length < MAX_TRAFFIC && this.spawnTimer <= 0) {
      this.spawnCar(false); this.spawnTimer = 1.5;
    }
    for (const c of this.cars) {
      if (c.wrecked) continue;
      // Slow near intersections, sometimes turn onto the crossing road.
      const inter = this.nearestIntersection(c.x, c.y);
      let target = c.baseSpeed;
      if (inter && inter.d < 90) {
        target = c.baseSpeed * 0.55;
        if (inter.d < 26 && this.rng.chance(0.012)) {
          // turn: switch axis
          if (c.axis === 'v') {
            c.axis = 'h'; c.road = inter.y;
            c.dir = this.rng.chance(0.5) ? 1 : -1;
            c.angle = c.dir > 0 ? 0 : Math.PI;
            c.y = inter.y + c.dir * 16;
          } else {
            c.axis = 'v'; c.road = inter.x;
            c.dir = this.rng.chance(0.5) ? 1 : -1;
            c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            c.x = inter.x + c.dir * 16;
          }
        }
      }
      // Brake for the player's car ahead.
      const pd = Math.sqrt(dist2(c.x, c.y, playerPos.x, playerPos.y));
      if (pd < 110 && playerSpeed > 30) target = 0;
      // Steer back to lane.
      if (c.axis === 'v') {
        const laneX = c.road + c.dir * 16;
        c.x += clamp(laneX - c.x, -60 * dt, 60 * dt);
        c.angle += angleDiff(c.angle, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) * Math.min(1, 4 * dt);
      } else {
        const laneY = c.road + c.dir * 16;
        c.y += clamp(laneY - c.y, -60 * dt, 60 * dt);
        c.angle += angleDiff(c.angle, c.dir > 0 ? 0 : Math.PI) * Math.min(1, 4 * dt);
      }
      c.speed += clamp(target - c.speed, -260 * dt, 160 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      // Reached a world edge: turn around at the next intersection or respawn.
      if (c.x < 60 || c.x > WORLD_W - 60 || c.y < 60 || c.y > 1580) {
        c.x = clamp(c.x, 80, WORLD_W - 80); c.y = clamp(c.y, 80, 1560);
        c.dir *= -1;
        c.angle += Math.PI;
      }
    }
  }
  draw(ctx, time) {
    for (const c of this.cars) c.draw(ctx, time);
    for (const c of this.parked) c.draw(ctx, time);
  }
}

// ---- Pedestrians: walk sidewalks, cross at crosswalks, flee danger ----
const PED_COLORS = ['#e8b04f', '#4fc8e8', '#e84f7a', '#8ae84f', '#d8d8e8', '#c89a6a', '#9a6ac8'];
const PED_SHIRTS = ['#c84f4f', '#4f8ac8', '#4fae6a', '#c8a24f', '#8a4fc8', '#e8e8e8', '#3a3a3a'];

export class Pedestrians {
  constructor(world, seed) {
    this.world = world; this.rng = new Rng(seed + 202);
    this.list = [];
    for (let i = 0; i < 26; i++) this.spawn(true);
  }
  randomSidewalkPoint() {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    if (vertical) {
      const rx = rng.pick(VERTICAL_ROADS);
      return { x: rx + (rng.chance(0.5) ? 1 : -1) * (ROAD_HALF + 7), y: rng.range(60, 1600) };
    }
    const ry = rng.pick(HORIZONTAL_ROADS);
    return { x: rng.range(60, 2340), y: ry + (rng.chance(0.5) ? 1 : -1) * (ROAD_HALF + 7) };
  }
  spawn(anywhere) {
    const p = this.randomSidewalkPoint();
    const target = this.randomSidewalkPoint();
    this.list.push({
      x: p.x, y: p.y, tx: target.x, ty: target.y,
      speed: this.rng.range(45, 75), angle: 0,
      color: this.rng.pick(PED_COLORS), shirt: this.rng.pick(PED_SHIRTS),
      state: 'walk', downTimer: 0, fleeTimer: 0, phase: this.rng.range(0, 6),
    });
  }
  update(dt, playerPos, danger) {
    const rng = this.rng;
    if (this.list.length < MAX_PEDS && rng.chance(0.01)) this.spawn(false);
    for (const p of this.list) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) p.state = 'walk';
        continue;
      }
      let tx = p.tx, ty = p.ty, speed = p.speed;
      if (danger && Math.sqrt(dist2(p.x, p.y, playerPos.x, playerPos.y)) < 220) {
        // Flee away from the player.
        const dx = p.x - playerPos.x, dy = p.y - playerPos.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        tx = p.x + (dx / d) * 200; ty = p.y + (dy / d) * 200;
        speed = 170; p.fleeTimer = 1.2;
      } else if (p.fleeTimer > 0) {
        p.fleeTimer -= dt;
        const dx = p.x - playerPos.x, dy = p.y - playerPos.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        tx = p.x + (dx / d) * 200; ty = p.y + (dy / d) * 200;
        speed = 150;
      }
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 12) {
        const t = this.randomSidewalkPoint();
        p.tx = t.x; p.ty = t.y;
      } else {
        p.angle = Math.atan2(dy, dx);
        p.x += (dx / d) * speed * dt;
        p.y += (dy / d) * speed * dt;
        p.phase += dt * speed * 0.06;
      }
      // Stay out of water and buildings.
      if (inWater(p.x, p.y)) p.y = WATER_TOP - 20;
      const fixed = collideCircle(this.world, p.x, p.y, 10);
      p.x = fixed.x; p.y = fixed.y;
    }
  }
  draw(ctx) {
    for (const p of this.list) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.state === 'down') {
        ctx.rotate(1.4);
        ctx.fillStyle = p.shirt; ctx.fillRect(-9, -5, 18, 10);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(11, 0, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        const bob = Math.sin(p.phase) * 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 6, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.shirt;
        ctx.beginPath(); ctx.arc(0, bob * 0.3, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0, -8 + bob * 0.3, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}

// ---- Bullets ----
export class Bullets {
  constructor() { this.list = []; }
  fire(x, y, angle) {
    this.list.push({ x, y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, life: 0.7 });
  }
  update(dt, world, hit) {
    for (const b of this.list) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      if (hit(b)) b.life = 0;
      const fixed = collideCircle(world, b.x, b.y, 2);
      if (fixed.hit) b.life = 0;
    }
    this.list = this.list.filter((b) => b.life > 0);
  }
  draw(ctx) {
    ctx.fillStyle = '#ffe9a8';
    for (const b of this.list) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export { PLAYER_RADIUS, PISTOL_AMMO_MAX };
