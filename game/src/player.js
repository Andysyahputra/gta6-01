// Neon Harbor — Rex Marlowe on foot: walk/run, punch, pistol fire,
// health, ammo, and getting in and out of cars. Stealing is handled
// with cars.js through the shared game state.

import { WORLD_W, WORLD_H } from './config.js';
import { resolveCircleBuilding } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, r: 14,
    health: 100, maxHealth: 100,
    cash: 0, ammo: 0, hasPistol: false,
    inCar: null, punchCooldown: 0, shootCooldown: 0,
    muzzle: 0, punchAnim: 0, speed: 0,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const inp = G.input;
  if (p.inCar) return;
  let mx = 0, my = 0;
  if (inp.down('w', 'arrowup')) my -= 1;
  if (inp.down('s', 'arrowdown')) my += 1;
  if (inp.down('a', 'arrowleft')) mx -= 1;
  if (inp.down('d', 'arrowright')) mx += 1;
  const running = inp.down('shift');
  const speed = running ? 230 : 140;
  const len = Math.hypot(mx, my);
  p.speed = len > 0 ? speed : 0;
  if (len > 0) {
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
  }
  p.x = Math.max(16, Math.min(WORLD_W - 16, p.x));
  p.y = Math.max(16, Math.min(WORLD_H - 16, p.y));
  resolveCircleBuilding(G.city, p, p.r);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.punchAnim = Math.max(0, p.punchAnim - dt);
  // Slow health regen out of combat
  if (G.time - G.lastDamageAt > 8 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 2 * dt);
  // Punch
  if (inp.wasPressed('f') && p.punchCooldown <= 0) {
    p.punchCooldown = 0.45; p.punchAnim = 0.25;
    G.audio.punch();
    punchHit(G);
  }
  // Pistol fire toward the mouse (Space or click)
  if (p.hasPistol && p.ammo > 0 && p.shootCooldown <= 0 && (inp.wasPressed(' ') || inp.mousePressed)) {
    p.shootCooldown = 0.28; p.muzzle = 0.08; p.ammo--;
    G.audio.gunshot();
    fireBullet(G);
    if (G.wanted < 1) G.addWanted(1, 'fired weapon in public');
  }
}

export function punchHit(G) {
  const p = G.player;
  const px = p.x + Math.cos(p.angle) * 30, py = p.y + Math.sin(p.angle) * 30;
  for (const ped of G.traffic.peds) {
    if (!ped.down && Math.hypot(ped.x - px, ped.y - py) < 26) {
      ped.down = true; ped.downTimer = 3;
      G.addWanted(1, 'punched a pedestrian');
      G.addFloatText(ped.x, ped.y, 'WHAM!', '#ffdd33');
    }
  }
  for (const cop of G.police.officers) {
    if (Math.hypot(cop.x - px, cop.y - py) < 26) {
      cop.health -= 40;
      G.addWanted(2, 'hit an officer');
    }
  }
}

export function fireBullet(G) {
  const p = G.player;
  const wx = G.cam.x + G.input.mouseX, wy = G.cam.y + G.input.mouseY;
  const a = Math.atan2(wy - p.y, wx - p.x);
  G.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7, fromPlayer: true });
}

export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.fromPlayer) {
      for (const ped of G.traffic.peds) {
        if (!ped.down && Math.hypot(ped.x - b.x, ped.y - b.y) < 14) { ped.down = true; ped.downTimer = 5; b.life = 0; G.addWanted(2, 'shot a pedestrian'); }
      }
      for (const cop of G.police.officers) {
        if (Math.hypot(cop.x - b.x, cop.y - b.y) < 14) { cop.health -= 34; b.life = 0; G.addWanted(2, 'shot an officer'); }
      }
      for (const car of G.cars) {
        if (car !== G.player.inCar && Math.hypot(car.x - b.x, car.y - b.y) < 26) { car.health -= 20; b.life = 0; if (car.police) G.addWanted(1, 'damaged a police car'); }
      }
    } else {
      const p = G.player;
      if (!p.inCar && Math.hypot(p.x - b.x, p.y - b.y) < 14) {
        b.life = 0; G.damagePlayer(12);
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // Shadow
  ctx.fillStyle = '#00000033';
  ctx.beginPath(); ctx.ellipse(0, 4, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Rex: teal jacket, dark jeans, sun-bleached hair
  ctx.fillStyle = '#22222e';
  ctx.fillRect(-8, -9, 14, 18);
  ctx.fillStyle = '#0f8a7a';
  ctx.fillRect(-12, -10, 16, 20);
  ctx.fillStyle = '#f2c98a';
  ctx.beginPath(); ctx.arc(10, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath(); ctx.arc(10, -2, 8, Math.PI, Math.PI * 2); ctx.fill();
  if (p.punchAnim > 0) {
    ctx.fillStyle = '#f2c98a';
    ctx.fillRect(14, -6, 14, 6);
    ctx.fillRect(14, 2, 14, 6);
  }
  if (p.muzzle > 0) {
    ctx.fillStyle = '#ffe95e';
    ctx.beginPath(); ctx.arc(26, 0, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
