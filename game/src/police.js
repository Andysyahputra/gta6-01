// Neon Harbor — police: patrol cars that chase, ram, and deploy officers on
// foot; roadblocks at 3+ stars; wanted level that cools down out of sight.
import { WORLD_W, WORLD_H, clamp, angleDiff, dist2 } from './config.js';
import { Rng } from './rng.js';
import { Car } from './entities.js';
import { collideCircle } from './world.js';

export class Police {
  constructor(world) {
    this.world = world;
    this.rng = new Rng(777);
    this.cars = [];
    this.officers = []; // on-foot officers {x,y,angle,shootCooldown,touchTimer}
    this.spawnTimer = 0;
    this.roadblocks = []; // {x,y} cones at 3+ stars
    this.sirenOn = false;
  }
  wantedCount(wanted) { return wanted <= 0 ? 0 : wanted; }
  update(dt, player, wanted, time, playerVel) {
    const p = player.pos();
    // Predictive pursuit: aim at where the player will be, not where they are.
    const lead = playerVel ? clamp(Math.sqrt(dist2(player.x, player.y, p.x, p.y)) / 700, 0.15, 0.8) : 0;
    const tx = p.x + (playerVel ? playerVel.x * lead : 0);
    const ty = p.y + (playerVel ? playerVel.y * lead : 0);
    // Spawn patrol cars up to the wanted count.
    this.spawnTimer -= dt;
    const want = this.wantedCount(wanted);
    if (this.cars.length < want && this.spawnTimer <= 0) {
      const ang = this.rng.range(0, Math.PI * 2);
      const x = clamp(p.x + Math.cos(ang) * 620, 60, WORLD_W - 60);
      const y = clamp(p.y + Math.sin(ang) * 420, 60, 1560);
      const c = new Car('cruiser', x, y, Math.atan2(p.y - y, p.x - x));
      c.driver = 'police';
      this.cars.push(c);
      this.spawnTimer = 1.2;
    }
    // Despawn extra cars when wanted falls.
    while (this.cars.length > want) this.cars.pop();
    // Roadblocks at 3+ stars: two cone clusters ahead of the player.
    if (wanted >= 3 && this.roadblocks.length === 0) {
      this.roadblocks = [
        { x: clamp(p.x + 260, 80, WORLD_W - 80), y: clamp(p.y - 120, 80, 1560) },
        { x: clamp(p.x - 260, 80, WORLD_W - 80), y: clamp(p.y + 120, 80, 1560) },
      ];
    }
    if (wanted < 3) this.roadblocks = [];

    // Chase behaviour: steer toward the player's predicted position, ram,
    // and slide along buildings. Stuck detection: a cruiser that pushes
    // against a wall for 1.5s reverses out and picks a fresh approach.
    for (const c of this.cars) {
      const d = Math.sqrt(dist2(c.x, c.y, tx, ty));
      const aggression = 0.75 + wanted * 0.09;
      // Stuck tracking.
      c.lastX = c.lastX ?? c.x; c.lastY = c.lastY ?? c.y;
      c.stuckTimer = (c.stuckTimer || 0) + dt;
      const moved = Math.sqrt(dist2(c.x, c.y, c.lastX, c.lastY));
      if (c.stuckTimer > 1.5) {
        if (moved < 10 && Math.abs(c.speed) > 100) {
          c.reverseTimer = 0.7; // back out of the trap
          c.angle += Math.PI * (this.rng.chance(0.5) ? 1 : -1) * 0.5;
        }
        c.lastX = c.x; c.lastY = c.y; c.stuckTimer = 0;
      }
      c.reverseTimer = Math.max(0, (c.reverseTimer || 0) - dt);
      const targetAngle = Math.atan2(ty - c.y, tx - c.x);
      const diff = angleDiff(c.angle, targetAngle);
      c.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
      const wantSpeed = c.reverseTimer > 0 ? -220 : d > 40 ? 430 * aggression : 200;
      c.speed += clamp(wantSpeed - c.speed, -700 * dt, 500 * dt);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      const fixed = collideCircle(this.world, nx, ny, 16);
      if (fixed.hit) c.speed *= 0.55;
      c.x = fixed.x; c.y = fixed.y;
      c.flash = Math.max(0, c.flash - dt);
      // Separation: cruisers do not pile onto one another.
      for (const other of this.cars) {
        if (other === c) continue;
        const od = Math.sqrt(dist2(c.x, c.y, other.x, other.y));
        if (od > 0.01 && od < 55) {
          const push = (55 - od) * 0.5;
          const px = (c.x - other.x) / od, py = (c.y - other.y) / od;
          c.x += px * push * dt * 8; c.y += py * push * dt * 8;
        }
      }
      // Deploy officers when the player is on foot and a cruiser is close.
      if (!player.inCar && d < 150 && this.officers.length < 2 * want && this.rng.chance(0.01)) {
        this.officers.push({
          x: c.x + 20, y: c.y + 20, angle: 0,
          shootCooldown: 1, touchTimer: 0,
        });
      }
    }
    // Officers on foot chase the player; touch = busted, they shoot at range.
    let busted = false;
    for (const o of this.officers) {
      const d = Math.sqrt(dist2(o.x, o.y, p.x, p.y));
      o.angle = Math.atan2(p.y - o.y, p.x - o.x);
      if (!player.inCar) {
        const sp = 165;
        o.x += Math.cos(o.angle) * sp * dt;
        o.y += Math.sin(o.angle) * sp * dt;
        const fixed = collideCircle(this.world, o.x, o.y, 10);
        o.x = fixed.x; o.y = fixed.y;
        if (d < 26) { o.touchTimer += dt; if (o.touchTimer > 0.8) busted = true; }
        else o.touchTimer = Math.max(0, o.touchTimer - dt * 2);
      }
      o.shootCooldown -= dt;
    }
    // Officers give up when the player drives away.
    if (player.inCar) this.officers = this.officers.filter(() => this.rng.chance(0.98));
    if (wanted <= 0) { this.officers = []; }
    this.sirenOn = wanted > 0;
    return busted;
  }
  // Officer shooting: returns true when an officer fires (main.js rolls accuracy).
  officerShots(player) {
    const p = player.pos();
    const shots = [];
    for (const o of this.officers) {
      if (o.shootCooldown <= 0 && !player.inCar) {
        const d = Math.sqrt(dist2(o.x, o.y, p.x, p.y));
        if (d < 280 && d > 40) {
          o.shootCooldown = 1.4;
          shots.push({ x: o.x, y: o.y, angle: o.angle + (this.rng.float() - 0.5) * 0.22 });
        }
      }
    }
    return shots;
  }
  draw(ctx, time) {
    // Roadblock cones.
    for (const rb of this.roadblocks) {
      ctx.fillStyle = '#ff7a2f';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(rb.x + i * 26, rb.y - 12); ctx.lineTo(rb.x + i * 26 + 8, rb.y + 10); ctx.lineTo(rb.x + i * 26 - 8, rb.y + 10);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('HPD', rb.x, rb.y - 18);
    }
    for (const c of this.cars) c.draw(ctx, time);
    // Officers: dark blue uniforms with caps.
    for (const o of this.officers) {
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 6, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2f5e'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b04f'; ctx.beginPath(); ctx.arc(0, -8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#12203f'; ctx.fillRect(-5, -12, 10, 3);
      ctx.restore();
    }
  }
}
