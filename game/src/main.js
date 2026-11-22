// Neon Harbor — main game: state, loop, camera, save/load, wanted,
// wasted/busted, screen flow and the debug scenes used for screenshots.
// This file wires every system together; each system owns one job.

import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, SAVE_KEY, LANDMARKS } from './config.js';
import { buildCity, drawCity } from './world.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createPlayer, updatePlayerOnFoot, updateBullets, drawPlayer } from './player.js';
import { createCar, updatePlayerCar, nearestStealableCar, stealCar, exitCar, drawCar } from './cars.js';
import { TrafficSystem } from './traffic.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { drawHUD, drawStartScreen, drawPauseScreen, drawEndScreen, drawKingScreen } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const G = {
  time: 0, state: 'start', // start | playing | paused | end
  wanted: 0, coolTimer: 0, lastDamageAt: -99, recentShot: false, recentShotTimer: 0,
  bullets: [], floatTexts: [],
  endKind: '', endText: '', penalty: 0,
  king: false, kingShown: false, hasSave: false,
  safeTimer: 0, shopTimer: 0, shake: 0, prevCarHealth: 100,
  cam: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
};

G.city = buildCity();
G.input = new Input(canvas);
G.audio = new AudioSys();
G.player = createPlayer(LANDMARKS.safehouse.x + 40, LANDMARKS.safehouse.y + 40);
G.traffic = new TrafficSystem(G);
G.cars = G.traffic.traffic; // one master car list: traffic, parked, police, mission cars
G.police = new PoliceSystem(G);
G.missions = new MissionSystem(G);
G.drawCarFn = (c2, car) => drawCar(c2, car, G.time);

G.addWanted = function (n, why) {
  if (G.state !== 'playing') return;
  const before = G.wanted;
  G.wanted = Math.max(0, Math.min(5, G.wanted + n));
  if (G.wanted > before) G.coolTimer = 0;
  void why;
};
G.setWanted = function (n, why) {
  G.wanted = Math.max(0, Math.min(5, n));
  G.coolTimer = 0;
  void why;
};
G.damagePlayer = function (n) {
  const p = G.player;
  p.health -= n;
  G.lastDamageAt = G.time;
  if (p.health <= 0) G.wasted('Rex was shot down in the streets.');
};
G.wasted = function (text) {
  if (G.state !== 'playing') return;
  G.state = 'end'; G.endKind = 'wasted'; G.endText = text;
  G.penalty = Math.min(G.player.cash, 150);
  G.player.cash -= G.penalty;
  G.audio.blip(110, 0.6, 'sawtooth', 0.25);
};
G.busted = function (text) {
  if (G.state !== 'playing') return;
  G.state = 'end'; G.endKind = 'busted'; G.endText = text;
  G.penalty = Math.min(G.player.cash, 100);
  G.player.cash -= G.penalty;
  G.audio.blip(220, 0.5, 'square', 0.2);
};
G.addFloatText = function (x, y, text, color) {
  G.floatTexts.push({ x, y, text, color: color || '#ffffff', life: 1.4 });
  if (G.floatTexts.length > 12) G.floatTexts.shift();
};
G.saveGame = function () {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.player.cash, index: G.missions.index,
      hasPistol: G.player.hasPistol, ammo: G.player.ammo,
      deliveries: G.missions.deliveries,
    }));
  } catch { /* storage unavailable: game still plays */ }
};
G.loadSave = function () {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    G.player.cash = s.cash || 0;
    G.missions.index = Math.min(7, s.index || 0);
    G.player.hasPistol = !!s.hasPistol;
    G.player.ammo = s.ammo || 0;
    G.missions.deliveries = s.deliveries || 0;
    G.missions.setupCurrent();
    return true;
  } catch { return false; }
};

G.hasSave = (() => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } })();

function respawn() {
  const p = G.player;
  if (p.inCar) { p.inCar = null; }
  p.x = LANDMARKS.safehouse.x + 40; p.y = LANDMARKS.safehouse.y + 40;
  p.health = p.maxHealth;
  G.wanted = 0; G.coolTimer = 0;
  G.police.cars = [];
  G.police.officers = [];
  G.cars = G.cars.filter((c) => !c.police);
  G.traffic.traffic = G.cars;
  G.state = 'playing';
  G.saveGame();
}

function startGame(fresh) {
  if (fresh) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    G.player.cash = 0; G.player.hasPistol = false; G.player.ammo = 0;
    G.missions.index = 0; G.missions.deliveries = 0; G.king = false;
    G.missions.setupCurrent();
  } else {
    G.loadSave();
  }
  G.player.health = G.player.maxHealth;
  G.wanted = 0;
  G.state = 'playing';
  G.audio.ensure();
}

// Debug scenes for screenshots (?scene=drive|chase|mission|start).
// Each one puts the real game into a real playable state, then plays.
function applyScene(scene) {
  const p = G.player;
  if (scene === 'start') { G.state = 'start'; return; }
  G.state = 'playing';
  G.audio.ensure();
  if (scene === 'drive') {
    const car = createCar('comet', 1100, 900, 0, { driver: false });
    G.cars.push(car);
    p.inCar = car; p.x = car.x; p.y = car.y;
    G.missions.index = 0; G.missions.setupCurrent();
    G.missions.showBanner('MISSION 1 — First Wheels: bring any car to the Garage');
  } else if (scene === 'chase') {
    const car = createCar('comet', 1100, 900, 0, { driver: false });
    G.cars.push(car);
    p.inCar = car; p.x = car.x; p.y = car.y;
    G.missions.index = 3; G.missions.setupCurrent();
    G.setWanted(3, 'chase scene');
    for (let i = 0; i < 3; i++) {
      const pc = createCar('cruiser', 1100 - 280 - i * 80, 900, 0, { police: true, driver: true });
      pc.speed = 320; G.cars.push(pc); G.police.cars.push(pc);
    }
    // Extra traffic near the chase for density
    for (let i = 0; i < 3; i++) {
      const tc = createCar(i % 2 ? 'taxi' : 'sedan', 800 + i * 300, 650, 0, { driver: true });
      tc.speed = 150; G.cars.push(tc);
    }
    G.missions.showBanner('MISSION 4 — Clean Getaway: lose 3 stars, reach the Safehouse!');
  } else if (scene === 'mission') {
    const car = createCar('taxi', 1100, 1650, 0, { driver: false });
    G.cars.push(car);
    p.inCar = car; p.x = car.x; p.y = car.y;
    G.missions.index = 1; G.missions.setupCurrent();
    G.setWanted(1, 'mission scene');
    const pc = createCar('cruiser', 1100, 1400, Math.PI / 2, { police: true, driver: true });
    pc.speed = 300; G.cars.push(pc); G.police.cars.push(pc);
    G.missions.showBanner('MISSION 2 — The Package: pick up at the Harbor Docks!');
  }
}

function update(dt) {
  const inp = G.input;
  if (inp.wasPressed('0')) G.audio.toggleMute();
  if (G.state === 'start') {
    if (inp.wasPressed('enter')) startGame(false);
    if (inp.wasPressed('n')) startGame(true);
    return;
  }
  if (G.state === 'end') {
    if (inp.wasPressed('enter')) respawn();
    return;
  }
  if (G.state === 'paused') {
    if (inp.wasPressed('escape', 'enter')) { G.state = 'playing'; }
    if (inp.wasPressed('r')) { G.missions.setupCurrent(); G.state = 'playing'; }
    return;
  }
  // playing
  if (inp.wasPressed('escape')) { G.state = 'paused'; G.saveGame(); return; }
  G.time += dt;
  G.recentShotTimer -= dt;
  if (G.recentShotTimer <= 0) G.recentShot = false;
  // Steal / exit car
  if (inp.wasPressed('e')) {
    if (G.player.inCar) exitCar(G);
    else {
      const car = nearestStealableCar(G);
      if (car) stealCar(G, car);
    }
  }
  // Harbor Arms ammo refill ($50, key Q near the shop)
  const shopD = Math.hypot(G.player.x - LANDMARKS.armsShop.x, G.player.y - LANDMARKS.armsShop.y);
  if (G.player.hasPistol && shopD < 90 && inp.wasPressed('q') && G.player.cash >= 50) {
    G.player.cash -= 50; G.player.ammo = 12; G.audio.cash();
    G.addFloatText(G.player.x, G.player.y - 30, 'AMMO REFILLED — $50', '#7be0a3');
  }
  // Safehouse: health refills, wanted clears after standing there
  const safeD = Math.hypot(G.player.x - LANDMARKS.safehouse.x, G.player.y - LANDMARKS.safehouse.y);
  if (safeD < 90) {
    G.safeTimer += dt;
    G.player.health = Math.min(G.player.maxHealth, G.player.health + 12 * dt);
    if (G.wanted > 0 && G.safeTimer > 2.5) { G.wanted = 0; G.safeTimer = 0; G.addFloatText(G.player.x, G.player.y - 40, 'HEAT CLEARED — safehouse', '#9fd8ff'); }
  } else G.safeTimer = 0;
  updatePlayerOnFoot(G, dt);
  updatePlayerCar(G, dt);
  G.traffic.update(dt);
  G.police.update(dt);
  G.missions.update(dt);
  updateBullets(G, dt);
  for (const ft of G.floatTexts) ft.life -= dt;
  G.floatTexts = G.floatTexts.filter((f) => f.life > 0);
  if (G.king && !G.kingShown) { G.kingShown = true; }
  // Crash shake: a sudden health loss on the player's car kicks the camera.
  if (G.player.inCar) {
    const h = G.player.inCar.health;
    if (h < G.prevCarHealth - 2) G.shake = Math.min(14, G.shake + (G.prevCarHealth - h) * 0.9);
    G.prevCarHealth = h;
  }
  G.shake = Math.max(0, G.shake - 30 * dt);
  // Camera follows player / car, eased, with look-ahead in the driving
  // direction so fast chases read ahead of the car instead of behind it.
  const focus = G.player.inCar || G.player;
  const look = G.player.inCar ? Math.min(130, Math.abs(G.player.inCar.speed) * 0.32) : 0;
  const tx = Math.max(0, Math.min(WORLD_W - VIEW_W, focus.x + Math.cos(focus.angle) * look - VIEW_W / 2));
  const ty = Math.max(0, Math.min(WORLD_H - VIEW_H, focus.y + Math.sin(focus.angle) * look - VIEW_H / 2));
  const ease = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
  G.cam.x += (tx - G.cam.x) * ease;
  G.cam.y += (ty - G.cam.y) * ease;
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (G.state === 'start') {
    drawCity(ctx, G.city, { x: 560, y: 540, w: VIEW_W, h: VIEW_H });
    drawStartScreen(ctx, G);
    ctx.restore();
    return;
  }
  const shx = G.shake > 0.2 ? (Math.sin(G.time * 61) * G.shake) : 0;
  const shy = G.shake > 0.2 ? (Math.cos(G.time * 53) * G.shake) : 0;
  ctx.translate(-G.cam.x + shx, -G.cam.y + shy);
  drawCity(ctx, G.city, G.cam);
  G.missions.drawMarker(ctx, G.time);
  G.traffic.draw(ctx);
  G.police.draw(ctx, G.time);
  drawPlayer(ctx, G);
  // Bullets
  ctx.fillStyle = '#ffe95e';
  for (const b of G.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  drawHUD(ctx, G);
  if (G.state === 'paused') drawPauseScreen(ctx);
  if (G.state === 'end') drawEndScreen(ctx, G);
  if (G.king && G.missions.index >= 7) drawKingScreen(ctx);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  G.input.endFrame();
  requestAnimationFrame(frame);
}

// Boot: apply a debug scene if requested, otherwise show the start screen.
const params = new URLSearchParams(location.search);
const scene = params.get('scene');
if (scene) applyScene(scene);
requestAnimationFrame(frame);

// Expose a tiny handle for scripted play-tests.
window.NeonHarbor = {
  state: G,
  start: () => startGame(false),
  scene: applyScene,
};
