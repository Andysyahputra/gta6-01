// Neon Harbor — cars: invented models, arcade driving physics,
// stealing (E), parking, damage, sparks and drawing. Traffic and police
// cars reuse this same Car shape.

import { CAR_MODELS } from './config.js';
import { resolveCircleBuilding } from './world.js';

let carId = 1;

export function createCar(modelKey, x, y, angle, opts = {}) {
  const m = CAR_MODELS[modelKey] || CAR_MODELS.sedan;
  return {
    id: carId++, modelKey, model: m,
    x, y, angle, speed: 0,
    health: 100, maxHealth: 100,
    color: opts.color || m.color,
    parked: !!opts.parked, police: !!opts.police,
    driver: opts.driver !== false,
    wrecked: false, sparkTimer: 0, sirenOn: false,
    targetCar: opts.targetCar || null,
  };
}

export function carForward(car) { return { x: Math.cos(car.angle), y: Math.sin(car.angle) }; }

export function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  const inp = G.input;
  const m = car.model;
  let throttle = 0;
  if (inp.down('w', 'arrowup')) throttle = 1;
  if (inp.down('s', 'arrowdown')) throttle = -1;
  let steer = 0;
  if (inp.down('a', 'arrowleft')) steer = -1;
  if (inp.down('d', 'arrowright')) steer = 1;
  const dir = car.speed >= 0 ? 1 : -1;
  car.speed += throttle * m.accel * dt;
  car.speed -= car.speed * 0.55 * dt; // drag
  if (throttle === 0) car.speed -= car.speed * 1.4 * dt;
  car.speed = Math.max(-m.topSpeed * 0.45, Math.min(m.topSpeed, car.speed));
  const steerFactor = Math.min(1, Math.abs(car.speed) / 120);
  car.angle += steer * m.grip * steerFactor * dir * dt * 0.55;
  const f = carForward(car);
  const nx = car.x + f.x * car.speed * dt;
  const ny = car.y + f.y * car.speed * dt;
  const probe = { x: nx, y: ny };
  if (resolveCircleBuilding(G.city, probe, 20)) {
    if (Math.abs(car.speed) > 120) { G.audio.bump(); car.sparkTimer = 0.3; car.health -= 6; G.addFloatText(car.x, car.y, 'CRASH!', '#ff5533'); }
    car.speed *= 0.25;
  } else {
    car.x = nx; car.y = ny;
  }
  car.x = Math.max(24, Math.min(2376, car.x));
  car.y = Math.max(24, Math.min(1776, car.y));
  car.sparkTimer = Math.max(0, car.sparkTimer - dt);
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    G.wasted('Your car was wrecked.');
  }
  G.audio.setEngine(Math.abs(car.speed) / m.topSpeed);
  // Hit pedestrians while driving fast
  for (const ped of G.traffic.peds) {
    if (!ped.down && Math.hypot(ped.x - car.x, ped.y - car.y) < 24 && Math.abs(car.speed) > 60) {
      ped.down = true; ped.downTimer = 5;
      G.addWanted(1, 'hit a pedestrian');
      G.addFloatText(ped.x, ped.y, 'OUCH!', '#ffdd33');
    }
  }
  // Bump other cars. Positional push-out runs every frame, but the speed
  // cut is gated by a short cooldown: without it, one overlapping cruiser
  // multiplies the player's speed by 0.6 every frame and pins the car.
  car.bumpTimer = Math.max(0, (car.bumpTimer || 0) - dt);
  G.bumpWantedTimer = Math.max(0, (G.bumpWantedTimer || 0) - dt);
  for (const other of G.cars) {
    if (other === car || other.wrecked) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 44 && d > 0.01) {
      const push = (44 - d) / 2;
      const ux = (other.x - car.x) / d, uy = (other.y - car.y) / d;
      other.x += ux * push; other.y += uy * push;
      if (car.bumpTimer <= 0) {
        car.bumpTimer = 0.5;
        if (Math.abs(car.speed) > 150) {
          // Wanted for damaging a police car is throttled: one hard shunt
          // in a chase must not stack the player to 5 stars in seconds.
          if (other.police && Math.abs(car.speed) > 250 && (G.bumpWantedTimer || 0) <= 0) {
            G.bumpWantedTimer = 3;
            G.addWanted(1, 'damaged a police car');
          }
          G.audio.bump(); other.health -= 8;
        }
        car.speed *= 0.6;
      }
    }
  }
}

export function nearestStealableCar(G, maxDist = 70) {
  const p = G.player;
  let best = null, bd = maxDist;
  for (const car of G.cars) {
    if (car.wrecked || car === p.inCar) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function stealCar(G, car) {
  const p = G.player;
  if (!car) return false;
  if (car.driver) {
    // Driver bails and runs away as a pedestrian
    G.traffic.peds.push({ x: car.x + 30, y: car.y + 20, vx: 0, vy: 0, speed: 150, angle: 0, color: '#e8e4da', down: false, downTimer: 0, flee: true, wander: 0 });
    car.driver = false;
    G.addWanted(1, 'stole an occupied car');
    G.addFloatText(car.x, car.y - 30, 'CARJACKED!', '#ff5533');
  } else {
    G.addFloatText(car.x, car.y - 30, car.model.name, '#ffffff');
  }
  car.parked = false;
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  G.audio.pickup();
  return true;
}

export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  car.speed = 0;
}

export function drawCar(ctx, car, t) {
  if (car.wrecked) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = '#33333d';
    ctx.fillRect(-car.model.len / 2, -car.model.wid / 2, car.model.len, car.model.wid);
    ctx.fillStyle = '#ff5533';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('WRECK', -18, 4);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = '#00000044';
  ctx.fillRect(-car.model.len / 2 + 3, -car.model.wid / 2 + 4, car.model.len, car.model.wid);
  // Body
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.model.len / 2, -car.model.wid / 2, car.model.len, car.model.wid, 7);
  ctx.fill();
  // Cabin + windshield
  ctx.fillStyle = '#bfe8ff';
  roundRect(ctx, -6, -car.model.wid / 2 + 4, 16, car.model.wid - 8, 4);
  ctx.fill();
  ctx.fillStyle = '#22222e';
  ctx.fillRect(car.model.len / 2 - 6, -car.model.wid / 2 + 3, 4, 5);
  ctx.fillRect(car.model.len / 2 - 6, car.model.wid / 2 - 8, 4, 5);
  // Headlights
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(car.model.len / 2 - 2, -car.model.wid / 2 + 2, 3, 5);
  ctx.fillRect(car.model.len / 2 - 2, car.model.wid / 2 - 7, 3, 5);
  if (car.modelKey === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('TAXI', -12, 3);
  }
  if (car.modelKey === 'truck') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-car.model.len / 2 + 4, -car.model.wid / 2 + 4, 22, car.model.wid - 8);
  }
  if (car.police) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-10, -car.model.wid / 2 + 2, 20, 5);
    const flash = Math.floor(t * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2222' : '#2266ff';
    ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#2266ff' : '#ff2222';
    ctx.beginPath(); ctx.arc(8, 0, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (car.sparkTimer > 0) {
    ctx.fillStyle = '#ffe95e';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(car.x + (i * 7 - 14), car.y - 12 + i * 5, 3, 3);
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
