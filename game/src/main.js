// Neon Harbor — main game: state machine, loop, camera, player on foot and in
// cars, stealing, combat, collisions, rendering, save/load and the ?shot=
// debug setups used for the screenshots.
import { WORLD, SPOTS, CAR_MODELS, ECONOMY, SAVE_KEY } from './config.js';
import { buildCity, collideCircle, insideBuilding, onRoad, districtAt } from './world.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Traffic, Pedestrians, Bullets, makeCar } from './entities.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { clamp, dist, lerp } from './rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = 1280, VH = 720;

export class Game {
  constructor() {
    this.city = buildCity(WORLD.SEED);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.traffic = new Traffic(this.city, WORLD.SEED);
    this.peds = new Pedestrians(this.city, WORLD.SEED);
    this.bullets = new Bullets();
    this.police = new Police(this.city, WORLD.SEED);
    this.missions = new Missions(this);
    this.player = {
      x: SPOTS.spawn.x, y: SPOTS.spawn.y, angle: -Math.PI / 2,
      health: 100, hasPistol: false, ammo: 0, lastDamage: 99,
    };
    this.playerCar = null;
    this.cash = ECONOMY.startCash;
    this.bestWanted = 0;
    this.state = 'start'; // start | playing | paused | wasted | busted
    this.camera = { x: 600, y: 300 };
    this.clockMin = 18 * 60 + 40; // dusk
    this.sparks = [];
    this.muzzle = 0;
    this.shake = 0; // camera screen-shake magnitude (decays each frame)
    this.punchCd = 0;
    this.shootCd = 0;
    this.dt = 0;
    this.hasSave = false;
    this.endPenaltyText = '';
    this.missionCarId = null;
    this.interactPrompt = '';
    this.safehouseDwell = 0;
    this.loadGame();
    this.applyShot();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- save / load ----------------------------------------------------------
  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.cash = s.cash ?? ECONOMY.startCash;
      this.bestWanted = s.bestWanted ?? 0;
      this.player.hasPistol = !!s.pistol;
      this.player.ammo = s.pistol ? ECONOMY.ammoRounds : 0;
      this.missions.completed = s.missions ?? 0;
      this.missions.freeRoam = this.missions.completed >= 5;
      this.hasSave = true;
    } catch (e) { /* corrupted save: start fresh */ }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, bestWanted: this.bestWanted,
        pistol: this.player.hasPistol, missions: this.missions.completed,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  newGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.cash = ECONOMY.startCash;
    this.bestWanted = 0;
    this.player.hasPistol = false;
    this.player.ammo = 0;
    this.missions.completed = 0;
    this.missions.freeRoam = false;
    this.missions.current = null;
    this.missions.titleScreen = null;
    this.hasSave = false;
  }

  // ---- flow ------------------------------------------------------------------
  startGame() {
    this.audio.ensure();
    this.state = 'playing';
    if (!this.missions.current && this.missions.completed < 5) {
      this.missions.startMission(this.missions.completed);
    }
  }

  hudMessage(text, secs) { this.hud.showMessage(text, secs); }
  earnCash(n) { this.cash += n; }
  spark(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({ x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.35, color: color || '#fbbf24' });
    }
  }

  // Camera kick on hard impacts; the render step turns it into a small shake.
  addShake(n) { this.shake = Math.min(14, this.shake + n); }

  damagePlayer(n) {
    if (this.state !== 'playing') return;
    this.player.health -= n;
    this.player.lastDamage = 0;
    if (this.player.health <= 0) { this.player.health = 0; this.wasted(); }
  }

  applyPenalty(kind) {
    const loss = Math.floor(this.cash * (kind === 'wasted' ? ECONOMY.wastedLoss : ECONOMY.bustedLoss));
    this.cash -= loss;
    this.endPenaltyText = kind === 'wasted'
      ? `The harbor takes its cut — you lost $${loss}.`
      : `Vera bailed you out — that cost $${loss}.`;
    return loss;
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.applyPenalty('wasted');
    this.state = 'wasted';
    this.audio.setSiren(false);
  }

  busted() {
    if (this.state !== 'playing') return;
    this.applyPenalty('busted');
    this.state = 'busted';
    this.audio.setSiren(false);
  }

  respawn() {
    this.player.x = SPOTS.safehouse.x;
    this.player.y = SPOTS.safehouse.y;
    this.player.health = 100;
    this.playerCar = null;
    this.police.clearWanted();
    this.missions.restartCurrent();
    this.saveGame();
    this.state = 'playing';
  }

  // ---- mission helpers -------------------------------------------------------
  // Find a spot near (x, y) that is not inside a building (for mission cars).
  findFreeSpot(x, y) {
    for (let r = 0; r <= 220; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (!insideBuilding(px, py, this.city) && py < WORLD.WATER_Y - 30) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  ensureCoupeAtLot() {
    const spot = this.findFreeSpot(SPOTS.coupeLot.x, SPOTS.coupeLot.y);
    const c = makeCar('coupe', spot.x, spot.y, 0, { parked: true });
    this.traffic.parked.push(c);
    this.missionCarId = c.id;
  }

  ensureTruckAtDepot() {
    const spot = this.findFreeSpot(SPOTS.truckDepot.x, SPOTS.truckDepot.y);
    const c = makeCar('truck', spot.x, spot.y, 0, { parked: true });
    this.traffic.parked.push(c);
    this.missionCarId = c.id;
  }

  removePlayerCar(car) {
    this.playerCar = null;
    car.dead = true;
    this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
    this.traffic.cars = this.traffic.cars.filter((c) => c !== car);
    this.player.x = car.x + 40;
    this.player.y = car.y;
    if (this.traffic.parked.length < 7) this.traffic.spawnParked();
  }

  clockText() {
    const h = Math.floor(this.clockMin / 60) % 24;
    const m = Math.floor(this.clockMin % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---- debug shot setups (?shot=start|drive|chase|mission) ------------------
  applyShot() {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (!shot) return;
    if (shot === 'start') {
      this.state = 'start';
      this.camera = { x: 560, y: 440 };
      return;
    }
    this.newGame();
    this.startGame();
    if (shot === 'drive') {
      const car = makeCar('comet', 1180, 600, 0, {});
      this.traffic.cars.push(car);
      this.playerCar = car;
      this.player.x = car.x; this.player.y = car.y; this.player.angle = 0;
      car.speed = 300;
      this.camera = { x: 560, y: 240 };
    } else if (shot === 'chase') {
      const car = makeCar('coupe', 1000, 1000, -0.3, {});
      this.traffic.cars.push(car);
      this.playerCar = car;
      this.player.x = car.x; this.player.y = car.y; this.player.angle = -0.3;
      car.speed = 330;
      this.police.wanted = 3;
      for (let i = 0; i < 3; i++) {
        const pc = makeCar('cruiser', 1000 - 90 - i * 70, 1000 + 30 + i * 24, -0.3, { police: true });
        pc.speed = 320;
        this.police.cars.push(pc);
      }
      this.missions.current = null;
      this.missions.startMission(3);
      this.camera = { x: 360, y: 640 };
    } else if (shot === 'mission') {
      // Bank holdout: the truck is parked in the bank zone on the road in
      // front of the bank, police closing in along the same road.
      const car = makeCar('truck', 1200, 990, -Math.PI / 2, {});
      this.traffic.cars.push(car);
      this.playerCar = car;
      this.player.x = car.x; this.player.y = car.y; this.player.angle = -Math.PI / 2;
      car.speed = 0;
      this.missions.current = null;
      this.missions.completed = 4;
      this.missions.startMission(4);
      this.missions.setStage(2);
      this.missions.current.holdout = 14;
      this.police.wanted = 4;
      for (const px of [900, 1500]) {
        const pc = makeCar('cruiser', px, 1000, px < 1200 ? 0 : Math.PI, { police: true });
        pc.speed = 260;
        this.police.cars.push(pc);
      }
      this.camera = { x: 560, y: 640 };
    }
  }

  // ---- main loop --------------------------------------------------------------
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    this.dt = dt;
    this.update(dt);
    this.render();
    this.input.endFrame();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    const inp = this.input;
    if (inp.wasPressed('0')) this.audio.setMuted(!this.audio.muted);

    if (this.state === 'start') {
      // Slow cinematic pan over downtown behind the title.
      this.camera.x = 560 + Math.sin(performance.now() / 9000) * 120;
      this.camera.y = 440 + Math.cos(performance.now() / 12000) * 60;
      this.traffic.update(dt, { x: 1200, y: 800 }, null);
      this.peds.update(dt, { x: 1200, y: 800 }, null, 0);
      if (inp.wasPressed('Enter')) this.startGame();
      if (inp.wasPressed('n')) { this.newGame(); this.startGame(); }
      return;
    }
    if (this.state === 'paused') {
      if (inp.wasPressed('Escape') || inp.wasPressed('Enter')) this.state = 'playing';
      if (inp.wasPressed('r')) { this.missions.restartCurrent(); this.state = 'playing'; }
      if (inp.wasPressed('n')) { this.newGame(); this.respawn(); }
      return;
    }
    if (this.state === 'wasted' || this.state === 'busted') {
      if (inp.wasPressed('Enter')) this.respawn();
      return;
    }

    // --- playing ---
    this.audio.ensure();
    this.clockMin += dt * 0.66;
    if (inp.wasPressed('Escape')) { this.state = 'paused'; this.saveGame(); return; }

    const p = this.player;
    p.lastDamage += dt;
    if (p.lastDamage > 6 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;

    if (this.playerCar) this.updateDriving(dt);
    else this.updateOnFoot(dt);

    // Interactions (E): payphone, arms, car enter/exit.
    this.interactPrompt = '';
    if (inp.wasPressed('e')) this.handleInteract();
    this.updateInteractPrompt();

    // Combat inputs.
    if (!this.playerCar) {
      if (inp.wasPressed('f')) this.punch();
      const wantShoot = inp.wasPressed(' ') || inp.mouse.clicked;
      if (wantShoot) this.shoot();
    }

    // World systems.
    this.traffic.update(dt, p, this.playerCar);
    this.peds.update(dt, p, this.playerCar, this.police.wanted);
    this.bullets.update(dt, this.city);
    this.police.update(dt, p, this.playerCar, this);
    this.police.policeBulletsHit(this, p);
    this.resolvePlayerBullets();
    this.missions.update(dt);
    if (this.police.wanted > this.bestWanted) this.bestWanted = this.police.wanted;

    // Safehouse: heal + clear heat on arrival.
    if (dist(p.x, p.y, SPOTS.safehouse.x, SPOTS.safehouse.y) < 110) {
      this.safehouseDwell += dt;
      p.health = Math.min(100, p.health + 20 * dt);
      if (this.safehouseDwell > 0.6 && this.police.wanted > 0) {
        this.police.clearWanted();
        this.hudMessage('Heat cleared — safehouse');
      }
    } else this.safehouseDwell = 0;

    // Sparks + shake decay.
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.shake = Math.max(0, this.shake - dt * 34);

    // Audio state.
    const speedRatio = this.playerCar ? Math.abs(this.playerCar.speed) / this.playerCar.top : 0;
    this.audio.setEngine(speedRatio, !!this.playerCar);
    this.audio.setSiren(this.police.wanted > 0);

    // Camera follows the player (or car) with a little velocity lookahead.
    const look = this.playerCar ? 90 : 30;
    const tx = p.x - VW / 2 + Math.cos(p.angle) * look;
    const ty = p.y - VH / 2 + Math.sin(p.angle) * look;
    this.camera.x = lerp(this.camera.x, clamp(tx, 0, WORLD.W - VW), 1 - Math.pow(0.001, dt));
    this.camera.y = lerp(this.camera.y, clamp(ty, 0, WORLD.H - VH), 1 - Math.pow(0.001, dt));
  }

  // ---- on foot ----------------------------------------------------------------
  updateOnFoot(dt) {
    const inp = this.input;
    const p = this.player;
    const ax = inp.axis();
    const run = inp.down('Shift');
    const speed = run ? 240 : 145;
    const len = Math.hypot(ax.x, ax.y);
    if (len > 0) {
      p.angle = Math.atan2(ax.y, ax.x);
      p.x += (ax.x / len) * speed * dt;
      p.y += (ax.y / len) * speed * dt;
      const pos = { x: p.x, y: p.y };
      collideCircle(pos, 11, this.city);
      p.x = pos.x; p.y = pos.y;
    }
    p.walkPhase = (p.walkPhase || 0) + (len > 0 ? dt * (run ? 11 : 8) : 0);
  }

  // ---- driving -----------------------------------------------------------------
  updateDriving(dt) {
    const inp = this.input;
    const car = this.playerCar;
    const p = this.player;
    const ax = inp.axis();
    const forward = ax.y < 0, back = ax.y > 0;
    if (forward) car.speed += car.accel * dt;
    else if (back) {
      if (car.speed > 10) car.speed -= car.accel * 1.4 * dt; // brake
      else car.speed -= car.accel * 0.55 * dt; // reverse
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 180 * dt); // drag
    }
    car.speed = clamp(car.speed, -130, car.top);
    const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
    if (ax.x !== 0) car.angle += ax.x * car.turn * steerAuthority * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const pos = { x: nx, y: ny };
    const hitBuilding = collideCircle(pos, 20, this.city);
    if (hitBuilding && Math.abs(car.speed) > 120) {
      this.spark(car.x, car.y);
      this.audio.bump();
      this.addShake(7);
      car.health -= 8;
    }
    if (hitBuilding) car.speed *= 0.55;
    car.x = pos.x; car.y = pos.y;
    p.x = car.x; p.y = car.y; p.angle = car.angle;

    // Car-vs-car bumps: push both cars apart (the other car takes most of it,
    // so a ramming cruiser can't shove the player across the map).
    for (const o of this.traffic.allCars()) {
      if (o === car || o.dead) continue;
      const d = dist(car.x, car.y, o.x, o.y);
      if (d < 46 && d > 0.01) {
        const push = Math.atan2(car.y - o.y, car.x - o.x);
        const overlap = 46 - d;
        car.x += Math.cos(push) * overlap * 0.3;
        car.y += Math.sin(push) * overlap * 0.3;
        o.x -= Math.cos(push) * overlap * 0.7;
        o.y -= Math.sin(push) * overlap * 0.7;
        if (Math.abs(car.speed) > 150) {
          car.health -= 4;
          if (o.police) this.police.addWanted(1, 'ram-cop');
          this.audio.bump();
          this.addShake(5);
          this.spark(car.x, car.y);
        }
        car.speed *= 0.85;
      }
    }
    for (const pc of this.police.cars) {
      const d = dist(car.x, car.y, pc.x, pc.y);
      if (d < 46 && d > 0.01) {
        const overlap = 46 - d;
        car.x += ((car.x - pc.x) / d) * overlap * 0.3;
        car.y += ((car.y - pc.y) / d) * overlap * 0.3;
        pc.x -= ((car.x - pc.x) / d) * overlap * 0.7;
        pc.y -= ((car.y - pc.y) / d) * overlap * 0.7;
        car.speed *= 0.8;
      }
    }
    // Running over pedestrians.
    for (const ped of this.peds.list) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
        this.peds.knockDown(ped);
        this.police.addWanted(1, 'hit-ped');
        this.audio.bump();
        car.speed *= 0.92;
        this.hudMessage('You hit a pedestrian!');
      }
    }
    // Wrecked car.
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      this.spark(car.x, car.y, '#f97316');
      this.wasted();
    }
  }

  // ---- interaction -------------------------------------------------------------
  nearestCar(maxD) {
    let best = null, bd = maxD;
    for (const c of this.traffic.allCars()) {
      if (c.dead || c.wrecked) continue;
      const d = dist(this.player.x, this.player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    for (const c of this.police.cars) {
      const d = dist(this.player.x, this.player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  handleInteract() {
    const p = this.player;
    if (this.playerCar) { // get out
      const car = this.playerCar;
      this.playerCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const pos = { x: p.x, y: p.y };
      collideCircle(pos, 11, this.city);
      p.x = pos.x; p.y = pos.y;
      return;
    }
    if (dist(p.x, p.y, SPOTS.payphone.x, SPOTS.payphone.y) < 70) {
      if (this.police.wanted === 0) { this.hudMessage('No heat to clean.'); return; }
      if (this.cash < ECONOMY.payphonePrice) { this.hudMessage('Cleaner costs $100 — not enough cash.'); this.audio.denied(); return; }
      this.cash -= ECONOMY.payphonePrice;
      this.police.clearWanted();
      this.hudMessage('Cleaner paid — heat gone.');
      this.audio.cash();
      return;
    }
    if (dist(p.x, p.y, SPOTS.arms.x, SPOTS.arms.y) < 70) {
      if (!p.hasPistol) { this.hudMessage('Harbor Arms: finish Mission 2 to earn the pistol.'); return; }
      if (p.ammo >= ECONOMY.ammoRounds) { this.hudMessage('Ammo full.'); return; }
      if (this.cash < ECONOMY.ammoPrice) { this.hudMessage('Ammo costs $50 — not enough cash.'); this.audio.denied(); return; }
      this.cash -= ECONOMY.ammoPrice;
      p.ammo = ECONOMY.ammoRounds;
      this.hudMessage('Ammo refilled — 12 rounds.');
      this.audio.cash();
      return;
    }
    const car = this.nearestCar(64);
    if (car) {
      const occupied = car.traffic || car.police;
      if (occupied) {
        this.police.addWanted(1, 'steal-occupied');
        this.hudMessage(`Stole a ${car.name} — the driver fled!`);
        // The driver bails out and runs.
        this.peds.list.push({
          x: car.x + 30, y: car.y, angle: Math.atan2(car.y - p.y, car.x - p.x),
          state: 'flee', flee: 3, down: 0, shirt: '#f8fafc', skin: '#d9a066',
          walkPhase: 0, dead: false,
        });
        car.traffic = false;
        this.traffic.cars = this.traffic.cars.filter((c) => c !== car);
      } else {
        this.hudMessage(`Took the ${car.name}.`);
        this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
      }
      this.playerCar = car;
      car.parked = false;
      car.speed = 0;
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      this.audio.pickup();
    }
  }

  updateInteractPrompt() {
    const p = this.player;
    if (this.playerCar) { this.interactPrompt = 'E — get out of the car'; return; }
    if (dist(p.x, p.y, SPOTS.payphone.x, SPOTS.payphone.y) < 70) { this.interactPrompt = 'E — Cleaner payphone: clear heat ($100)'; return; }
    if (dist(p.x, p.y, SPOTS.arms.x, SPOTS.arms.y) < 70) { this.interactPrompt = 'E — Harbor Arms: refill ammo ($50)'; return; }
    if (this.nearestCar(64)) { this.interactPrompt = 'E — steal this car'; }
  }

  // ---- combat --------------------------------------------------------------------
  punch() {
    if (this.punchCd > 0 || this.playerCar) return;
    this.punchCd = 0.4;
    const p = this.player;
    this.audio.punch();
    const range = 46;
    for (const ped of this.peds.list) {
      if (ped.state === 'down') continue;
      const d = dist(ped.x, ped.y, p.x, p.y);
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (d < range && Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.1) {
        this.peds.knockDown(ped);
        if (this.police.nearestPoliceDist(p) < 420) this.police.addWanted(1, 'punch');
      }
    }
    for (const o of this.police.officers) {
      if (dist(o.x, o.y, p.x, p.y) < range) {
        o.hp -= 40;
        if (o.hp <= 0) this.police.addWanted(2, 'kill-cop');
      }
    }
  }

  shoot() {
    const p = this.player;
    if (!p.hasPistol) { this.hudMessage('No pistol yet — finish Mission 2.'); return; }
    if (this.shootCd > 0) return;
    if (p.ammo <= 0) { this.audio.denied(); this.hudMessage('Out of ammo — refill at Harbor Arms.'); this.shootCd = 0.3; return; }
    this.shootCd = 0.25;
    p.ammo -= 1;
    const mx = this.input.mouse.x + this.camera.x;
    const my = this.input.mouse.y + this.camera.y;
    const a = Math.atan2(my - p.y, mx - p.x);
    p.angle = a;
    this.bullets.fire(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, true);
    this.muzzle = 0.07;
    this.audio.gunshot();
    this.police.addWanted(1, 'shoot');
  }

  resolvePlayerBullets() {
    const p = this.player;
    for (const b of this.bullets.list) {
      if (!b.fromPlayer) continue;
      for (const ped of this.peds.list) {
        if (ped.state === 'down') continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 13) {
          b.life = 0;
          ped.state = 'down'; ped.down = 8; ped.killed = true;
          this.police.addWanted(2, 'kill-ped');
        }
      }
      for (const o of this.police.officers) {
        if (dist(b.x, b.y, o.x, o.y) < 13) {
          b.life = 0;
          o.hp -= 34;
          if (o.hp <= 0) this.police.addWanted(2, 'kill-cop');
        }
      }
      for (const c of this.police.cars) {
        if (dist(b.x, b.y, c.x, c.y) < 22) {
          b.life = 0;
          c.health -= 12;
          this.police.addWanted(1, 'shoot-cop-car');
          if (c.health <= 0) { c.dead = true; this.spark(c.x, c.y, '#f97316'); }
        }
      }
    }
    // Remove killed peds once their fall timer ends.
    for (const ped of this.peds.list) {
      if (ped.killed && ped.state === 'down' && ped.down <= 0) ped.dead = true;
    }
  }

  // ---- rendering -------------------------------------------------------------------
  render() {
    const cam = this.camera;
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    const shx = (Math.random() * 2 - 1) * this.shake;
    const shy = (Math.random() * 2 - 1) * this.shake;
    ctx.translate(-Math.round(cam.x) + shx, -Math.round(cam.y) + shy);
    this.drawGround();
    this.drawBuildings();
    this.drawSpots();
    this.drawMissionMarker();
    for (const c of this.traffic.parked) if (!c.dead) this.drawCar(c);
    for (const c of this.traffic.cars) if (!c.dead) this.drawCar(c);
    for (const c of this.police.roadblocks) this.drawCar(c);
    for (const c of this.police.cars) this.drawCar(c);
    for (const ped of this.peds.list) this.drawPed(ped);
    for (const o of this.police.officers) this.drawOfficer(o);
    if (!this.playerCar) this.drawPlayer();
    else this.drawCar(this.playerCar);
    for (const b of this.bullets.list) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, s.life / 0.35);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    // Muzzle flash.
    if (this.muzzle > 0 && !this.playerCar) {
      const p = this.player;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // HUD + screens.
    if (this.state === 'playing' || this.state === 'paused') this.hud.draw(ctx, this, VW, VH);
    if (this.state === 'playing' && this.interactPrompt) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,24,0.7)';
      const w = ctx.measureText(this.interactPrompt).width + 28;
      this.hud.roundRect(ctx, (VW - w) / 2, VH - 64, w, 30, 8);
      ctx.fill();
      ctx.fillStyle = '#e0e7ff';
      ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(this.interactPrompt, VW / 2, VH - 44);
    }
    if (this.state === 'start') this.hud.drawStart(ctx, this, VW, VH);
    if (this.state === 'paused') this.hud.drawPause(ctx, this, VW, VH);
    if (this.state === 'wasted') this.hud.drawEnd(ctx, this, VW, VH, 'wasted');
    if (this.state === 'busted') this.hud.drawEnd(ctx, this, VW, VH, 'busted');
    if (this.missions.titleScreen) {
      this.missions.titleScreen.t -= this.dt;
      if (this.missions.titleScreen.t > 0) this.hud.drawKing(ctx, this, VW, VH);
      else this.missions.titleScreen = null;
    }
  }

  drawGround() {
    const cam = this.camera;
    const x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.W, cam.x + VW + 40), y1 = Math.min(WORLD.H, cam.y + VH + 40);
    // Base ground (blocks).
    ctx.fillStyle = '#262b3d';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Park grass.
    ctx.fillStyle = '#14532d';
    ctx.fillRect(400, 1000, 400, 400);
    // Harbor apron concrete.
    ctx.fillStyle = '#3f4756';
    ctx.fillRect(0, WORLD.APRON_Y, WORLD.W, WORLD.WATER_Y - WORLD.APRON_Y);
    // Water with wave lines.
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(0, WORLD.WATER_Y, WORLD.W, WORLD.H - WORLD.WATER_Y);
    ctx.strokeStyle = 'rgba(125,211,252,0.35)';
    ctx.lineWidth = 2;
    for (let y = WORLD.WATER_Y + 18; y < WORLD.H; y += 34) {
      if (y < y0 || y > y1) continue;
      ctx.beginPath();
      for (let x = x0; x < x1; x += 46) {
        const yy = y + Math.sin(x / 60 + y) * 4;
        if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Docks: wooden piers into the water.
    ctx.fillStyle = '#7c4a21';
    for (const px of [700, 1200, 1700]) ctx.fillRect(px - 26, WORLD.WATER_Y, 52, 130);
    ctx.fillStyle = '#a16207';
    for (const px of [700, 1200, 1700]) {
      for (let y = WORLD.WATER_Y + 12; y < WORLD.H - 8; y += 26) ctx.fillRect(px - 26, y, 52, 3);
    }
    // Roads: sidewalk border, asphalt, centre dashes.
    for (const rx of WORLD.V_ROADS) {
      ctx.fillStyle = '#3d4356';
      ctx.fillRect(rx - 42, y0, 84, y1 - y0);
      ctx.fillStyle = '#191d2b';
      ctx.fillRect(rx - 30, y0, 60, y1 - y0);
      ctx.strokeStyle = 'rgba(250,204,21,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 22]);
      ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const ry of WORLD.H_ROADS) {
      ctx.fillStyle = '#3d4356';
      ctx.fillRect(x0, ry - 42, x1 - x0, 84);
      ctx.fillStyle = '#191d2b';
      ctx.fillRect(x0, ry - 30, x1 - x0, 60);
      ctx.strokeStyle = 'rgba(250,204,21,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 22]);
      ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Crosswalk stripes at intersections.
    ctx.fillStyle = 'rgba(226,232,240,0.5)';
    for (const rx of WORLD.V_ROADS) {
      for (const ry of WORLD.H_ROADS) {
        for (let i = -3; i <= 3; i++) ctx.fillRect(rx + i * 10 - 3, ry - 40, 6, 12);
        for (let i = -3; i <= 3; i++) ctx.fillRect(rx + i * 10 - 3, ry + 28, 6, 12);
      }
    }
    // Containers on the apron.
    for (const c of this.city.containers) {
      if (c.x < x0 - 60 || c.x > x1 || c.y < y0 - 60 || c.y > y1) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    }
    // Park trees.
    for (const t of this.city.trees) {
      if (t.x < x0 - 20 || t.x > x1 || t.y < y0 - 20 || t.y > y1) continue;
      ctx.fillStyle = '#166534';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBuildings() {
    const cam = this.camera;
    for (const b of this.city.buildings) {
      if (b.x > cam.x + VW + 40 || b.x + b.w < cam.x - 40 || b.y > cam.y + VH + 40 || b.y + b.h < cam.y - 40) continue;
      if (b.tall) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
      }
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 10);
      // Windows.
      ctx.fillStyle = 'rgba(253,224,71,0.75)';
      const cols = Math.max(1, Math.floor(b.w / 22));
      const rows = Math.max(1, Math.floor(b.h / 24));
      for (let i = 0; i < b.windows; i++) {
        const cx = b.x + 8 + (i % cols) * ((b.w - 16) / cols);
        const cy = b.y + 18 + Math.floor(i / cols) * ((b.h - 26) / Math.max(1, rows));
        if (cy > b.y + b.h - 10) break;
        ctx.fillRect(cx, cy, 8, 10);
      }
      if (b.name) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x + b.w / 2, b.y - 8);
        ctx.textAlign = 'left';
      }
    }
  }

  drawSpots() {
    const marks = [
      [SPOTS.safehouse, 'H', '#4ade80'], [SPOTS.garage, 'G', '#facc15'],
      [SPOTS.arms, 'A', '#f97316'], [SPOTS.payphone, '$', '#38bdf8'],
      [SPOTS.bank, 'B', '#e879f9'], [SPOTS.docks, 'D', '#22d3ee'],
      [SPOTS.coupeLot, 'C', '#fb923c'], [SPOTS.truckDepot, 'T', '#a78bfa'],
    ];
    ctx.textAlign = 'center';
    for (const [s, letter, color] of marks) {
      ctx.fillStyle = 'rgba(8,10,24,0.7)';
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(letter, s.x, s.y + 5);
    }
    ctx.textAlign = 'left';
  }

  drawMissionMarker() {
    const m = this.missions.current && this.missions.current.marker;
    if (!m) return;
    const pulse = 1 + Math.sin(performance.now() / 280) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(250,204,21,0.18)';
    ctx.beginPath(); ctx.arc(m.x, m.y, 34 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, m.x, m.y - 44);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 4, c.w, c.h);
    // Wheels.
    ctx.fillStyle = '#0f172a';
    const ww = 10, wh = 5;
    ctx.fillRect(-c.w / 2 + 4, -c.h / 2 - 2, ww, wh);
    ctx.fillRect(-c.w / 2 + 4, c.h / 2 - 3, ww, wh);
    ctx.fillRect(c.w / 2 - 14, -c.h / 2 - 2, ww, wh);
    ctx.fillRect(c.w / 2 - 14, c.h / 2 - 3, ww, wh);
    // Body.
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 7);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(c.w / 2 - 16, -c.h / 2 + 3, 8, c.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-c.w / 2 + 8, -c.h / 2 + 3, c.w / 2 - 14, c.h - 6);
    // Headlights.
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(c.w / 2 - 2, -c.h / 2 + 3, 3, 5);
    ctx.fillRect(c.w / 2 - 2, c.h / 2 - 8, 3, 5);
    if (c.police) {
      // Flashing light bar.
      const phase = Math.floor(performance.now() / 220) % 2 === 0;
      ctx.fillStyle = phase ? '#ef4444' : '#3b82f6';
      ctx.fillRect(-6, -c.h / 2 + 2, 12, 5);
      ctx.fillStyle = phase ? '#3b82f6' : '#ef4444';
      ctx.fillRect(-6, c.h / 2 - 7, 12, 5);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      ctx.textAlign = 'left';
    }
    if (c.model === 'taxi') {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
      ctx.textAlign = 'left';
    }
    if (c.wrecked || c.health < 35) {
      ctx.fillStyle = 'rgba(100,100,100,0.7)';
      ctx.beginPath(); ctx.arc(-c.w / 4, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawPed(ped) {
    const x = ped.x, y = ped.y;
    if (ped.state === 'down') {
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.ellipse(x, y, 11, 6, ped.angle, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const bob = Math.sin(ped.walkPhase || 0) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y + bob * 0.3);
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(3, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawOfficer(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angle);
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(4, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(8, -2, 7, 4);
    ctx.restore();
  }

  drawPlayer() {
    const p = this.player;
    const bob = Math.sin(p.walkPhase || 0) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y + bob * 0.3);
    ctx.rotate(p.angle);
    // Rex: teal jacket, dark hair.
    ctx.fillStyle = '#0d9488';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(2, -2, 3.5, 0, Math.PI * 2); ctx.fill();
    if (p.hasPistol) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(8, -2, 9, 4);
    }
    ctx.restore();
    // Direction tick.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12);
    ctx.lineTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
    ctx.stroke();
  }
}

const game = new Game();
window.__game = game;
