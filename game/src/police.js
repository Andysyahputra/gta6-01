// Neon Harbor — the wanted level and the police who respond to it.
// Stars rise with crime, fall when the player stays calm and out of sight, and
// clear at the safehouse or the Cleaner payphone. Patrol cars chase and ram;
// on foot, officers get out and chase, and touching the player busts them.
import { WORLD } from './config.js';
import { makeCar } from './entities.js';
import { makeRng, clamp, dist, angleDiff } from './rng.js';
import { collideCircle, nearestRoadPoint, insideBuilding } from './world.js';

export class Police {
  constructor(city, seed) {
    this.city = city;
    this.rng = makeRng(seed + 55);
    this.wanted = 0;
    this.calmTimer = 0;      // seconds of no crime and no police in sight
    this.crimeCooldown = 0;  // throttle on repeated wanted gains from one source
    this.cars = [];
    this.officers = [];
    this.roadblocks = [];
    this.bustedTimer = 0;    // how long an officer has touched the player
    this.heatCooldowns = {};
  }

  addWanted(n, source) {
    const now = performance.now() / 1000;
    if (this.heatCooldowns[source] && now - this.heatCooldowns[source] < 4) return;
    this.heatCooldowns[source] = now;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.calmTimer = 0;
  }

  clearWanted() { this.wanted = 0; this.calmTimer = 0; this.despawnAll(); }

  despawnAll() {
    this.cars = [];
    this.officers = [];
    this.roadblocks = [];
  }

  wantedCount() {
    return this.wanted; // 1 star: 1 car … 5 stars: 5 cars (plus roadblocks at 3+)
  }

  update(dt, player, playerCar, game) {
    if (this.crimeCooldown > 0) this.crimeCooldown -= dt;
    // Decay: calm + out of police sight slowly cools the heat.
    const nearestPolice = this.nearestPoliceDist(player);
    if (this.wanted > 0 && nearestPolice > 520 && this.crimeCooldown <= 0) {
      this.calmTimer += dt;
      if (this.calmTimer > 12) { this.wanted -= 1; this.calmTimer = 0; game.hudMessage('Heat cooling down…'); }
    } else {
      this.calmTimer = 0;
    }

    // Spawn patrol cars to match the wanted level.
    const want = this.wantedCount();
    if (this.wanted > 0 && this.cars.length < want) {
      const p = nearestRoadPoint(player.x + this.rng.range(-700, 700), player.y + this.rng.range(-700, 700));
      const c = makeCar('cruiser', p.x, p.y, Math.atan2(player.y - p.y, player.x - p.x), { police: true });
      c.speed = 200;
      this.cars.push(c);
    }
    // Roadblocks at 3+ stars: static cruisers on roads ahead of the player.
    // They reposition ahead of the player when the player gets far away.
    if (this.wanted >= 3 && this.roadblocks.length < 2) {
      const ahead = {
        x: clamp(player.x + Math.cos(player.angle) * 420, 100, WORLD.W - 100),
        y: clamp(player.y + Math.sin(player.angle) * 420, 100, WORLD.WATER_Y - 100),
      };
      const p = nearestRoadPoint(ahead.x, ahead.y);
      const c = makeCar('cruiser', p.x, p.y, Math.atan2(player.y - p.y, player.x - p.x) + Math.PI / 2, { police: true });
      this.roadblocks.push(c);
    }
    for (const rb of this.roadblocks) {
      if (dist(rb.x, rb.y, player.x, player.y) > 750) {
        const ahead = {
          x: clamp(player.x + Math.cos(player.angle) * 420, 100, WORLD.W - 100),
          y: clamp(player.y + Math.sin(player.angle) * 420, 100, WORLD.WATER_Y - 100),
        };
        const p = nearestRoadPoint(ahead.x, ahead.y);
        rb.x = p.x; rb.y = p.y;
        rb.angle = Math.atan2(player.y - p.y, player.x - p.x) + Math.PI / 2;
      }
    }

    // Chase: steer toward the player's predicted position, ram on contact.
    // Road-aware pursuit: if a building blocks the direct line, drive to the
    // road intersection nearest the player instead of grinding through walls.
    const target = playerCar || player;
    for (const c of this.cars) {
      const lead = 0.35;
      let tx = target.x + (target.vx || Math.cos(target.angle) * (playerCar ? playerCar.speed : 0)) * lead;
      let ty = target.y + (target.vy || Math.sin(target.angle) * (playerCar ? playerCar.speed : 0)) * lead;
      let blocked = false;
      for (let i = 1; i <= 6; i++) {
        const sx = c.x + (tx - c.x) * (i / 6), sy = c.y + (ty - c.y) * (i / 6);
        if (insideBuilding(sx, sy, this.city)) { blocked = true; break; }
      }
      if (blocked) {
        // Route along the roads: stay on the car's current road to the
        // crossing nearest the player (an L-shaped route, never a diagonal
        // through a block); if off-road, head for the nearest intersection.
        const vx = WORLD.V_ROADS.find((rx) => Math.abs(c.x - rx) < 45);
        const hy = WORLD.H_ROADS.find((ry) => Math.abs(c.y - ry) < 45);
        if (hy !== undefined) {
          let bx = WORLD.V_ROADS[0], bd = Infinity;
          for (const rx of WORLD.V_ROADS) { const d = Math.abs(rx - tx); if (d < bd) { bd = d; bx = rx; } }
          tx = bx; ty = hy;
        } else if (vx !== undefined) {
          let by = WORLD.H_ROADS[0], bd = Infinity;
          for (const ry of WORLD.H_ROADS) { const d = Math.abs(ry - ty); if (d < bd) { bd = d; by = ry; } }
          tx = vx; ty = by;
        } else {
          let best = null, bd = Infinity;
          for (const rx of WORLD.V_ROADS) {
            for (const ry of WORLD.H_ROADS) {
              const d = dist(rx, ry, c.x, c.y);
              if (d < bd) { bd = d; best = { x: rx, y: ry }; }
            }
          }
          tx = best.x; ty = best.y;
        }
      }
      const wantAngle = Math.atan2(ty - c.y, tx - c.x);
      const diff = angleDiff(c.angle, wantAngle);
      const aggression = 1 + this.wanted * 0.12;
      c.angle += clamp(diff, -2.4 * aggression * dt, 2.4 * aggression * dt);
      let top = 300 + this.wanted * 22;
      // Don't grind into the player's car: match speed when right on top of it.
      if (playerCar && dist(c.x, c.y, playerCar.x, playerCar.y) < 60) {
        top = Math.min(top, Math.abs(playerCar.speed) + 60);
      }
      // Unstick: if the car was driving hard but barely moved, reverse out.
      if (c.stuckT === undefined) { c.stuckT = 0; c.reverseT = 0; c.lastX = c.x; c.lastY = c.y; }
      const moved = dist(c.x, c.y, c.lastX, c.lastY);
      c.lastX = c.x; c.lastY = c.y;
      // Stuck = ordered to drive fast but barely moving (wedged on a building).
      if (top > 120 && moved < 0.8) c.stuckT += dt; else c.stuckT = 0;
      if (c.stuckT > 0.9) { c.reverseT = 1.0; c.stuckT = 0; }
      if (c.reverseT > 0) {
        c.reverseT -= dt;
        c.speed = -170;
        c.angle += 2.2 * dt;
      } else {
        c.speed = clamp(c.speed + 260 * dt, 0, top);
      }
      const pos = { x: c.x + Math.cos(c.angle) * c.speed * dt, y: c.y + Math.sin(c.angle) * c.speed * dt };
      if (collideCircle(pos, 20, this.city)) {
        c.x = pos.x; c.y = pos.y;
        c.speed *= 0.4;
        game.spark(c.x, c.y);
      } else { c.x = pos.x; c.y = pos.y; }
      // Ram the player's car: damage + shove (scaled by the cruiser's speed,
      // so a slow push nudges instead of launching the player).
      if (playerCar && dist(c.x, c.y, playerCar.x, playerCar.y) < 44) {
        const push = Math.atan2(playerCar.y - c.y, playerCar.x - c.x);
        const shove = 12 * (c.speed / 350);
        playerCar.x += Math.cos(push) * shove * dt * 10;
        playerCar.y += Math.sin(push) * shove * dt * 10;
        playerCar.health -= 14 * dt * 10 * 0.1;
        c.speed *= 0.7;
        game.addShake(3);
        if (this.rng.chance(0.02)) game.audio.bump();
      }
      // On foot: if a cruiser gets close and slow, two officers get out.
      if (!playerCar && dist(c.x, c.y, player.x, player.y) < 170 && this.officers.length < 4) {
        this.officers.push({ x: c.x + 24, y: c.y, angle: 0, hp: 50, shootCd: 1, touch: 0 });
        this.officers.push({ x: c.x - 24, y: c.y, angle: 0, hp: 50, shootCd: 1.4, touch: 0 });
        c.speed = 0;
        c.wait = 2;
      }
      if (dist(c.x, c.y, player.x, player.y) > 1300) c.dead = true;
    }
    this.cars = this.cars.filter((c) => !c.dead && c.health > 0);

    // Officers on foot: chase, shoot when close, bust on touch.
    for (const o of this.officers) {
      const d = dist(o.x, o.y, player.x, player.y);
      const a = Math.atan2(player.y - o.y, player.x - o.x);
      o.angle = a;
      if (d > 34) {
        const sp = 165 + this.wanted * 6;
        o.x += Math.cos(a) * sp * dt;
        o.y += Math.sin(a) * sp * dt;
        const pos = { x: o.x, y: o.y };
        collideCircle(pos, 10, this.city);
        o.x = pos.x; o.y = pos.y;
      }
      o.shootCd -= dt;
      if (!playerCar && d < 300 && d > 40 && o.shootCd <= 0) {
        o.shootCd = this.rng.range(1.1, 1.8);
        // Limited accuracy: 55% hit chance.
        if (this.rng.chance(0.55)) {
          game.damagePlayer(7);
          game.bullets.fire(o.x, o.y, a, false);
        } else {
          game.bullets.fire(o.x, o.y, a + this.rng.range(-0.25, 0.25), false);
        }
        game.audio.gunshot();
      }
      if (!playerCar && d < 26) {
        o.touch += dt;
        this.bustedTimer += dt;
        if (this.bustedTimer > 0.9) game.busted();
      } else {
        o.touch = 0;
      }
    }
    if (playerCar || this.officers.every((o) => dist(o.x, o.y, player.x, player.y) > 26)) {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    this.officers = this.officers.filter((o) => o.hp > 0 && dist(o.x, o.y, player.x, player.y) < 1400);
  }

  nearestPoliceDist(player) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, dist(c.x, c.y, player.x, player.y));
    for (const o of this.officers) best = Math.min(best, dist(o.x, o.y, player.x, player.y));
    return best;
  }

  // A police bullet hit the player (bullets with fromPlayer=false).
  policeBulletsHit(game, player) {
    for (const b of game.bullets.list) {
      if (b.fromPlayer) continue;
      if (dist(b.x, b.y, player.x, player.y) < 12) { b.life = 0; game.damagePlayer(6); }
    }
  }
}
