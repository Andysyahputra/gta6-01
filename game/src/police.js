// Neon Harbor — police: patrol cruisers that chase and ram, officers
// on foot who chase and shoot, roadblocks at 3+ stars, and AIR-1 the
// police helicopter with a spotlight at 3+ stars. Wanted scales the
// response; staying out of sight cools it down.

import { createCar } from './cars.js';
import { WORLD_W, WORLD_H } from './config.js';

export class PoliceSystem {
  constructor(G) {
    this.G = G;
    this.cars = [];
    this.officers = [];
    this.heli = { x: 0, y: 0, angle: 0, active: false, orbit: 0 };
    this.spawnTimer = 0;
    this.sirenPhase = false;
    this.sirenTimer = 0;
    this.roadblocks = [];
  }
  wantedCarCount() {
    const w = this.G.wanted;
    if (w <= 0) return 0;
    if (w === 1) return 1;
    if (w === 2) return 2;
    if (w === 3) return 3;
    if (w === 4) return 4;
    return 5;
  }
  update(dt) {
    const G = this.G;
    const p = G.player;
    const target = p.inCar ? p.inCar : p;
    const want = this.wantedCarCount();
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const a = Math.atan2(target.y - 900, target.x - 1200) + Math.PI;
      const sx = Math.max(120, Math.min(2280, target.x + Math.cos(a) * 520));
      const sy = Math.max(120, Math.min(1600, target.y + Math.sin(a) * 520));
      const c = createCar('cruiser', sx, sy, Math.atan2(target.y - sy, target.x - sx), { police: true, driver: true });
      c.speed = 200;
      c.cruise = 380 + G.wanted * 12;
      this.cars.push(c);
      G.cars.push(c);
    }
    if (this.cars.length > want) {
      const extra = this.cars.pop();
      G.cars = G.cars.filter((c) => c !== extra);
    }
    // Helicopter AIR-1 at 3+ stars: circles the player, spotlight cone
    this.heli.active = G.wanted >= 3;
    if (this.heli.active) {
      this.heli.orbit += dt * 0.7;
      const R = 190;
      this.heli.x = target.x + Math.cos(this.heli.orbit) * R;
      this.heli.y = target.y + Math.sin(this.heli.orbit) * R - 40;
      this.heli.angle = Math.atan2(target.y - this.heli.y, target.x - this.heli.x);
    }
    // Roadblocks at 3+ stars: two parked cruisers ahead of the player
    if (G.wanted >= 3 && this.roadblocks.length === 0 && p.inCar) {
      const f = { x: Math.cos(p.inCar.angle), y: Math.sin(p.inCar.angle) };
      for (const side of [-1, 1]) {
        const c = createCar('cruiser', target.x + f.x * 320 - f.y * side * 40, target.y + f.y * 320 + f.x * side * 40, p.inCar.angle + Math.PI / 2, { police: true, driver: false, parked: true });
        this.roadblocks.push(c);
        G.cars.push(c);
      }
    }
    if (G.wanted < 3 && this.roadblocks.length) {
      for (const c of this.roadblocks) G.cars = G.cars.filter((x) => x !== c);
      this.roadblocks = [];
    }
    // Chase behaviour: steer toward the player, ram, faster at high stars
    for (const c of this.cars) {
      if (c.wrecked) continue;
      const wantAngle = Math.atan2(target.y - c.y, target.x - c.x);
      let diff = wantAngle - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const aggression = 1.6 + G.wanted * 0.35;
      c.angle += Math.max(-aggression * dt, Math.min(aggression * dt, diff));
      const top = 300 + G.wanted * 28;
      c.speed += (top - c.speed) * dt * 0.8;
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      c.x = Math.max(24, Math.min(2376, nx));
      c.y = Math.max(24, Math.min(1776, ny));
      // Ram the player's car, with a cooldown per cruiser so three cars
      // cannot grind the player's health to zero in under a second.
      c.ramTimer = Math.max(0, (c.ramTimer || 0) - dt);
      if (p.inCar) {
        const d = Math.hypot(p.inCar.x - c.x, p.inCar.y - c.y);
        if (d < 48 && c.ramTimer <= 0) {
          c.ramTimer = 2.0;
          p.inCar.health -= 5;
          p.inCar.speed *= 0.9;
          // The cruiser bounces off after the ram instead of staying glued
          // to the player's bumper, so a chase stays escapable.
          const ux = (c.x - p.inCar.x) / (d || 1), uy = (c.y - p.inCar.y) / (d || 1);
          c.x += ux * 46; c.y += uy * 46;
          c.speed *= 0.65;
          G.audio.bump();
          G.addFloatText(p.inCar.x, p.inCar.y - 30, 'RAMMED!', '#ff5533');
        }
      } else {
        // On foot: touch = busted
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < 34) G.busted('A patrol car caught you on foot.');
      }
      // Officers bail out at close range on foot chases
      if (!p.inCar && this.officers.length < 2 && Math.hypot(p.x - c.x, p.y - c.y) < 220) {
        this.officers.push({ x: c.x + 24, y: c.y, health: 100, shootTimer: 1.2, speed: 165 });
      }
    }
    // Officers on foot
    for (const o of this.officers) {
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < 26 && !p.inCar) G.busted('An officer grabbed you.');
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      o.x += Math.cos(a) * o.speed * dt;
      o.y += Math.sin(a) * o.speed * dt;
      o.shootTimer -= dt;
      if (o.shootTimer <= 0 && d < 320 && !p.inCar) {
        o.shootTimer = 1.4;
        const hit = (o.x * 7 + o.y * 13) % 10 < 4; // deterministic-ish spread, no Math.random in layout path
        if (hit) G.damagePlayer(8);
        G.bullets.push({ x: o.x, y: o.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.6, fromPlayer: false });
        G.audio.blip(200, 0.08, 'square', 0.12);
      }
    }
    this.officers = this.officers.filter((o) => o.health > 0);
    // Siren wail alternates while any police car exists
    this.sirenTimer -= dt;
    if (this.cars.length > 0 && this.sirenTimer <= 0) {
      this.sirenTimer = 0.7;
      this.sirenPhase = !this.sirenPhase;
      G.audio.sirenTick(this.sirenPhase);
    }
    // Cooling down: wanted falls when out of police sight for a while
    if (G.wanted > 0) {
      const nearest = this.cars.reduce((m, c) => Math.min(m, Math.hypot(target.x - c.x, target.y - c.y)), Infinity);
      if (nearest > 520 && this.officers.length === 0) {
        G.coolTimer += dt;
        if (G.coolTimer > 9) { G.wanted = Math.max(0, G.wanted - 1); G.coolTimer = 0; G.addFloatText(target.x, target.y - 40, 'Heat cooling…', '#9fd8ff'); }
      } else G.coolTimer = 0;
    }
  }
  draw(ctx, t) {
    const G = this.G;
    // Helicopter + spotlight
    if (this.heli.active) {
      const h = this.heli;
      const p = G.player.inCar ? G.player.inCar : G.player;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#fff6b0';
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(p.x + 70, p.y + 40);
      ctx.lineTo(p.x - 70, p.y + 40);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.angle);
      ctx.fillStyle = '#1c2b4a';
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffdd33';
      ctx.fillRect(-30, -2, 60, 4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(20, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('AIR-1', h.x - 18, h.y - 30);
    }
    // Officers
    for (const o of this.officers) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.fillStyle = '#27408b';
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c98a';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#27408b';
      ctx.fillRect(-8, -14, 16, 5);
      ctx.restore();
    }
    // Roadblock markers
    for (const c of this.roadblocks) {
      ctx.fillStyle = '#ff5533';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('ROADBLOCK', c.x - 34, c.y - 30);
    }
  }
}
