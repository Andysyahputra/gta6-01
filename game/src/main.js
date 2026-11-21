// Neon Harbor — main game: state machine, loop, player controls, stealing,
// combat, wanted level, rendering, save/load, and screenshot shot modes.
import {
  WORLD_W, WORLD_H, VERTICAL_ROADS, HORIZONTAL_ROADS, ROAD_HALF,
  PLAYER_WALK, PLAYER_RUN, PLAYER_RADIUS, PISTOL_AMMO_MAX, PISTOL_PRICE,
  CLEANER_PRICE_PER_STAR, SAVE_KEY, clamp, angleDiff, dist2,
} from './config.js';
import { buildWorld, drawWorld, collideCircle } from './world.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Car, Player, Traffic, Pedestrians, Bullets } from './entities.js';
import { Police } from './police.js';
import { MissionChain } from './missions.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1337);
const SHOT = params.get('shot') || '';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.viewW = 1280; this.viewH = 720;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.world = buildWorld(SEED);
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.player = new Player(430, 470);
    this.traffic = new Traffic(this.world, SEED);
    this.peds = new Pedestrians(this.world, SEED);
    this.police = new Police(this.world);
    this.bullets = new Bullets();
    this.missions = new MissionChain(this);
    this.hud = new Hud(document);

    this.state = 'title'; // title | playing | paused | busted | wasted
    this.wanted = 0;
    this.gameTime = 0;
    this.time = 0;
    this.cam = { x: 1200, y: 900 };
    this.lastCrime = -100;
    this.coolTimer = 0;
    this.lastDamage = -100;
    this.king = false;
    this.sparks = [];
    this.muzzle = 0; this.muzzleX = 0; this.muzzleY = 0; this.muzzleAngle = 0;
    this.lastShotPublic = -100;
    this.safeTimer = 0;
    this.collisionCooldown = 0;
    this.policeRamCooldown = 0;
    this.shotMode = SHOT;
    this.penalty = 0;

    this.bindScreens();
    if (SHOT) this.setupShot(SHOT);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  resize() {
    this.viewW = window.innerWidth; this.viewH = window.innerHeight;
    this.canvas.width = this.viewW; this.canvas.height = this.viewH;
  }
  // ---- save / load ----
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.player.cash, missionIndex: this.missions.index,
        pistol: this.player.pistol, ammo: this.player.ammo,
        bestWanted: this.player.bestWanted, king: this.king,
      }));
    } catch (e) { /* storage unavailable: play without saving */ }
  }
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  applySave(s) {
    this.player.cash = s.cash || 0;
    this.missions.index = s.missionIndex || 0;
    this.missions.completedCount = s.missionIndex || 0;
    this.player.pistol = !!s.pistol;
    this.player.ammo = s.ammo || 0;
    this.player.bestWanted = s.bestWanted || 0;
    this.king = !!s.king;
  }
  // ---- screens ----
  bindScreens() {
    const $ = (id) => document.getElementById(id);
    const save = this.loadSave();
    if (save) {
      $('title-continue').style.display = 'inline-block';
      $('title-continue').textContent = `Continue — $${save.cash}, Mission ${(save.missionIndex || 0) + 1}/5`;
    }
    $('title-start').addEventListener('click', () => this.startGame(false));
    $('title-continue').addEventListener('click', () => this.startGame(true));
    $('title-new').addEventListener('click', () => {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      this.startGame(false);
    });
    $('pause-resume').addEventListener('click', () => this.togglePause(false));
    $('pause-restart').addEventListener('click', () => { this.resetRun(); this.state = 'playing'; this.showOnly(null); });
    $('end-respawn').addEventListener('click', () => this.respawn());
    $('hud-mute').addEventListener('click', () => this.audio.toggleMute());
  }
  showOnly(id) {
    for (const el of ['title-screen', 'pause-screen', 'end-screen']) {
      document.getElementById(el).classList.toggle('hidden', el !== id);
    }
  }
  startGame(continueSave) {
    this.audio.ensure();
    // Start / Continue resume the save when one exists; New Game wipes it first.
    const s = this.loadSave();
    if (s) this.applySave(s);
    else this.resetRun();
    this.state = 'playing';
    this.showOnly(null);
    this.hud.showBriefing('Welcome to Neon Harbor', 'Rex Marlowe just rolled into town with a duffel bag and nothing else. Vera Kline has work for him — find the garage marker and press M.');
  }
  resetRun() {
    this.player = new Player(430, 470);
    this.missions = new MissionChain(this);
    this.wanted = 0; this.gameTime = 0; this.king = false;
    this.police = new Police(this.world);
    this.traffic = new Traffic(this.world, SEED);
    this.peds = new Pedestrians(this.world, SEED);
    this.bullets = new Bullets();
  }
  respawn() {
    const lost = Math.max(50, Math.floor(this.player.cash * 0.1));
    this.penalty = lost;
    this.player.cash = Math.max(0, this.player.cash - lost);
    this.player.health = 100;
    this.player.x = 430; this.player.y = 470;
    if (this.player.inCar) { this.player.inCar.health = 100; this.player.inCar = null; }
    this.wanted = 0;
    this.police = new Police(this.world);
    this.state = 'playing';
    this.showOnly(null);
    this.hud.showBanner(`Back on your feet — lost $${lost}`);
    this.saveGame();
  }
  togglePause(force) {
    if (this.state === 'playing') {
      this.state = 'paused'; this.showOnly('pause-screen'); this.saveGame();
    } else if (this.state === 'paused' && force !== true) {
      this.state = 'playing'; this.showOnly(null);
    }
  }
  // ---- wanted ----
  setWanted(n) { this.wanted = clamp(n, 0, 5); this.player.bestWanted = Math.max(this.player.bestWanted, this.wanted); this.lastCrime = this.gameTime; this.coolTimer = 0; }
  addWanted(n) { this.setWanted(this.wanted + n); }
  // ---- mission hooks (called by MissionChain) ----
  showBriefing(title, text) { this.hud.showBriefing(title, text); }
  showBanner(text) { this.hud.showBanner(text); }
  // ---- screenshot shot modes (?shot=start|drive|chase|mission) ----
  setupShot(shot) {
    this.state = 'playing';
    this.showOnly(null);
    if (shot === 'start') { this.state = 'title'; this.showOnly('title-screen'); this.cam = { x: 1200, y: 900 }; return; }
    const comet = (x, y, angle, speed) => {
      const c = new Car('comet', x, y, angle);
      c.driver = 'player'; c.speed = speed;
      this.player.inCar = c;
      this.player.x = x; this.player.y = y;
      return c;
    };
    if (shot === 'drive') {
      comet(1050, 700, 0, 300);
      this.missions.index = 0; this.missions.start();
      this.cam = { x: 1050, y: 700 };
    } else if (shot === 'chase') {
      comet(1100, 1150, -Math.PI / 2, 340);
      this.missions.index = 1; this.missions.start(); this.missions.stage = 1; this.missions.hasPackage = true;
      this.setWanted(3);
      for (let i = 0; i < 3; i++) {
        const c = new Car('cruiser', 1100 + (i - 1) * 70, 1330 + i * 30, -Math.PI / 2);
        c.driver = 'police'; c.speed = 320;
        this.police.cars.push(c);
      }
      this.cam = { x: 1100, y: 1150 };
    } else if (shot === 'mission') {
      comet(1000, 1500, Math.PI / 2, 180);
      this.missions.index = 1; this.missions.start();
      this.player.pistol = true; this.player.ammo = 12;
      this.cam = { x: 1000, y: 1560 };
    }
    window.__ready = true;
  }
  // ---- main loop ----
  loop(t) {
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000 || 0.016);
    this.lastT = t;
    this.time = t;
    // A single frame's error must never freeze the game: log it and keep going.
    try {
      if (this.state === 'playing') this.update(dt);
    } catch (e) { console.error('update failed:', e); }
    this.render();
    if (this.state === 'playing' || this.state === 'title') this.hud.update(dt, this);
    this.input.endFrame();
    this.raf = requestAnimationFrame((nt) => this.loop(nt));
  }

  // ---- per-frame update ----
  update(dt) {
    const inp = this.input;
    const p = this.player;
    this.gameTime += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.policeRamCooldown = Math.max(0, this.policeRamCooldown - dt);

    // Pause / mute.
    if (inp.justPressed('escape')) { this.togglePause(); return; }
    if (inp.justPressed('0')) this.audio.toggleMute();

    const pp = p.pos();
    const inCar = !!p.inCar;

    // --- Mission start prompt: press M near the current mission's start point.
    const startPos = this.missionStartPos();
    const promptEl = document.getElementById('mission-prompt');
    if (!this.missions.active && !this.missions.done && startPos &&
        dist2(pp.x, pp.y, startPos.x, startPos.y) < 130 * 130) {
      promptEl.textContent = `Press M — start mission: ${this.missions.current.name}`;
      promptEl.classList.add('show');
      if (inp.justPressed('m')) { this.missions.start(); }
    } else {
      promptEl.classList.remove('show');
    }

    // --- Player movement.
    if (inCar) {
      const car = p.inCar;
      const throttle = (inp.down('w', 'arrowup') ? 1 : 0) - (inp.down('s', 'arrowdown') ? 1 : 0);
      const steer = (inp.down('a', 'arrowleft') ? -1 : 0) + (inp.down('d', 'arrowright') ? 1 : 0);
      car.drive(throttle, steer, dt);
      const fixed = collideCircle(this.world, car.x, car.y, 20);
      if (fixed.hit) {
        if (Math.abs(car.speed) > 240 && this.collisionCooldown <= 0) {
          car.health -= 3; this.audio.bump();
          this.addSparks(car.x, car.y, 6);
          this.collisionCooldown = 0.4;
        }
        car.speed *= 0.45;
        car.x = fixed.x; car.y = fixed.y;
      }
      // Collisions with traffic cars (damage throttled per car so one scrape
      // is one hit, not one hit per frame).
      for (const tc of this.traffic.cars) {
        if (tc.wrecked) continue;
        tc.hitCooldown = Math.max(0, (tc.hitCooldown || 0) - dt);
        const d = Math.sqrt(dist2(car.x, car.y, tc.x, tc.y));
        if (d < 42 && tc.hitCooldown <= 0) {
          tc.hitCooldown = 0.5;
          car.speed *= 0.7; tc.speed *= 0.6;
          tc.health -= 8; car.health -= 2;
          if (tc.health <= 0) { tc.wrecked = true; tc.speed = 0; }
          if (this.collisionCooldown <= 0) { this.audio.bump(); this.addSparks(car.x, car.y, 4); this.collisionCooldown = 0.3; }
        }
      }
      // Run over pedestrians.
      for (const ped of this.peds.list) {
        if (ped.state !== 'down' && Math.abs(car.speed) > 60 && dist2(car.x, car.y, ped.x, ped.y) < 34 * 34) {
          ped.state = 'down'; ped.downTimer = 6;
          this.addWanted(1);
          this.audio.punch();
        }
      }
      // Police ram the player's car (being rammed is not a crime: no wanted gain).
      for (const pc of this.police.cars) {
        const d = Math.sqrt(dist2(car.x, car.y, pc.x, pc.y));
        if (d < 44 && this.policeRamCooldown <= 0) {
          car.health -= 4; pc.health -= 2; pc.flash = 0.2;
          car.speed *= 0.75;
          this.audio.bump(); this.addSparks(car.x, car.y, 5);
          this.policeRamCooldown = 0.6;
        }
      }
      // Exit the car.
      if (inp.justPressed('e')) {
        p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
        p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
        const fixed2 = collideCircle(this.world, p.x, p.y, PLAYER_RADIUS);
        p.x = fixed2.x; p.y = fixed2.y;
        p.angle = car.angle;
        car.driver = 'parked'; car.occupied = false;
        this.traffic.parked.push(car);
        p.inCar = null;
      }
      if (car.health <= 0) { this.wasted('Your car was wrecked by the HPD.'); return; }
    } else {
      const mv = inp.moveVector();
      const run = inp.down('shift');
      const speed = run ? PLAYER_RUN : PLAYER_WALK;
      p.moving = mv.x !== 0 || mv.y !== 0;
      if (p.moving) {
        p.angle = Math.atan2(mv.y, mv.x);
        p.walkPhase += dt * speed * 0.06;
        const nx = p.x + mv.x * speed * dt;
        const ny = p.y + mv.y * speed * dt;
        const fixed = collideCircle(this.world, nx, ny, PLAYER_RADIUS);
        p.x = fixed.x; p.y = fixed.y;
      }
      // Steal / enter a car.
      if (inp.justPressed('e')) this.tryEnterCar();
      // Punch.
      p.punchCooldown = Math.max(0, p.punchCooldown - dt);
      if (inp.justPressed('f') && p.punchCooldown <= 0) this.punch();
      // Shoot.
      p.shootCooldown = Math.max(0, p.shootCooldown - dt);
      if ((inp.justPressed(' ') || inp.clicked) && p.pistol && p.shootCooldown <= 0) this.shoot();
      // Interact: refill ammo at Harbor Arms, pay off heat at the Cleaner.
      if (inp.justPressed('e')) this.tryInteract();
    }

    // Recompute driving here: the player may have just entered or exited
    // the car above, so the `inCar` captured at the top of update is stale.
    const driving = !!p.inCar;

    // Health regen out of combat; safehouse heals and clears heat.
    if (this.gameTime - this.lastDamage > 5) p.health = Math.min(100, p.health + 3 * dt);
    const L = this.world.landmarks;
    if (dist2(pp.x, pp.y, L.safehouse.x, L.safehouse.y) < 110 * 110) {
      p.health = Math.min(100, p.health + 20 * dt);
      this.safeTimer += dt;
      if (this.safeTimer > 2 && this.wanted > 0) { this.wanted = 0; this.safeTimer = 0; this.hud.showBanner('Lying low at the safehouse — heat cleared'); }
    } else this.safeTimer = 0;

    // Traffic hit the player on foot.
    if (!driving) {
      for (const tc of this.traffic.cars) {
        if (dist2(p.x, p.y, tc.x, tc.y) < 30 * 30 && Math.abs(tc.speed) > 40) {
          this.damagePlayer(15);
          p.x += (p.x - tc.x) * 0.4; p.y += (p.y - tc.y) * 0.4;
          tc.speed *= 0.4;
          break;
        }
      }
    }

    // Wanted cooldown: out of police sight and out of trouble, stars fall.
    if (this.wanted > 0) {
      let nearestPolice = 1e9;
      for (const pc of this.police.cars) nearestPolice = Math.min(nearestPolice, Math.sqrt(dist2(pp.x, pp.y, pc.x, pc.y)));
      if (nearestPolice > 450 && this.gameTime - this.lastCrime > 12) {
        this.coolTimer += dt;
        if (this.coolTimer > 6) { this.wanted--; this.coolTimer = 0; this.lastCrime = this.gameTime; }
      } else this.coolTimer = 0;
    }

    // World systems.
    const playerSpeed = driving ? Math.abs(p.inCar.speed) : 0;
    this.traffic.update(dt, pp, playerSpeed);
    const danger = this.wanted > 0 || playerSpeed > 200 || this.gameTime - this.lastShotPublic < 2;
    this.peds.update(dt, pp, danger);
    // Second revision — predictive pursuit: hand the police the player's
    // velocity so cruisers aim at where Rex will be, not where he is.
    const playerVel = driving
      ? { x: Math.cos(p.inCar.angle) * p.inCar.speed, y: Math.sin(p.inCar.angle) * p.inCar.speed }
      : (() => {
          const mv = inp.moveVector();
          const sp = p.moving ? (inp.down('shift') ? PLAYER_RUN : PLAYER_WALK) : 0;
          return { x: mv.x * sp, y: mv.y * sp };
        })();
    const busted = this.police.update(dt, p, this.wanted, this.time, playerVel);
    if (busted) { this.busted(); return; }
    // Officer shots.
    for (const s of this.police.officerShots(p)) {
      this.bullets.fire(s.x, s.y, s.angle);
      this.audio.shot();
    }
    this.bullets.update(dt, this.world, (b) => this.bulletHit(b));
    this.missions.update(dt);
    this.missions.tryDelivery();

    // Audio: engine + siren follow the action.
    this.audio.setEngine(driving ? Math.abs(p.inCar.speed) / p.inCar.model.topSpeed : 0, driving);
    this.audio.setSiren(this.police.sirenOn);

    // Camera follows the player.
    const target = p.pos();
    this.cam.x = clamp(target.x, this.viewW / 2 - 200, WORLD_W - this.viewW / 2 + 200);
    this.cam.y = clamp(target.y, this.viewH / 2 - 200, WORLD_H - this.viewH / 2 + 200);
    if (this.viewW >= WORLD_W) this.cam.x = WORLD_W / 2;
    if (this.viewH >= WORLD_H) this.cam.y = WORLD_H / 2;

    // Effects.
    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (p.health <= 0) { this.wasted('Rex was shot down.'); }
  }

  missionStartPos() {
    if (this.missions.done) return null;
    const L = this.world.landmarks;
    const id = this.missions.current.id;
    if (id === 1) return L.garage;
    if (id === 2) return L.vera;
    if (id === 3) return L.coupeSpot;
    if (id === 4) return L.safehouse;
    if (id === 5) return L.truckSpot;
    return null;
  }
  tryEnterCar() {
    const p = this.player;
    let best = null, bd = 70 * 70;
    const consider = (c) => {
      const d = dist2(p.x, p.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    };
    for (const c of this.traffic.cars) consider(c);
    for (const c of this.traffic.parked) consider(c);
    for (const c of this.police.cars) consider(c);
    if (!best) return;
    if (best.driver === 'traffic' && best.occupied) {
      // Driver flees on foot.
      this.peds.list.push({
        x: best.x + 24, y: best.y, tx: best.x + 300, ty: best.y + 300,
        speed: 170, angle: 0, color: '#e8b04f', shirt: '#4f8ac8',
        state: 'walk', downTimer: 0, fleeTimer: 4, phase: 0,
      });
      this.addWanted(1);
      this.hud.showBanner(`Stole a ${best.name} — the driver ran! +1★`);
    } else if (best.driver === 'police') {
      this.addWanted(2);
      this.hud.showBanner('Stole a police cruiser! +2★');
    }
    // Remove from its list and drive it.
    this.traffic.cars = this.traffic.cars.filter((c) => c !== best);
    this.traffic.parked = this.traffic.parked.filter((c) => c !== best);
    this.police.cars = this.police.cars.filter((c) => c !== best);
    best.driver = 'player'; best.occupied = true;
    p.inCar = best;
    this.audio.pickup();
  }
  tryInteract() {
    const p = this.player;
    const L = this.world.landmarks;
    // Harbor Arms: refill pistol ammo for $50.
    if (p.pistol && dist2(p.x, p.y, L.arms.x, L.arms.y) < 90 * 90) {
      if (p.ammo < PISTOL_AMMO_MAX && p.cash >= PISTOL_PRICE) {
        p.cash -= PISTOL_PRICE; p.ammo = PISTOL_AMMO_MAX;
        this.audio.cash();
        this.hud.showBanner('Ammo refilled at Harbor Arms — $50');
      } else if (p.ammo >= PISTOL_AMMO_MAX) this.hud.showBanner('Ammo already full');
      else this.hud.showBanner('Not enough cash for ammo ($50)');
      return;
    }
    // Cleaner payphone: pay off the heat.
    if (this.wanted > 0 && dist2(p.x, p.y, L.payphone.x, L.payphone.y) < 80 * 80) {
      const price = this.wanted * CLEANER_PRICE_PER_STAR;
      if (p.cash >= price) {
        p.cash -= price; this.wanted = 0;
        this.audio.cash();
        this.hud.showBanner(`Cleaner paid $${price} — heat cleared`);
      } else this.hud.showBanner(`Cleaner wants $${price} — not enough cash`);
    }
  }
  punch() {
    const p = this.player;
    p.punchCooldown = 0.45; p.punchTimer = 0.18;
    this.audio.punch();
    const fx = p.x + Math.cos(p.angle) * 30, fy = p.y + Math.sin(p.angle) * 30;
    for (const ped of this.peds.list) {
      if (ped.state !== 'down' && dist2(fx, fy, ped.x, ped.y) < 30 * 30) {
        ped.state = 'down'; ped.downTimer = 3;
        let seen = false;
        for (const pc of this.police.cars) if (dist2(p.x, p.y, pc.x, pc.y) < 500 * 500) seen = true;
        if (seen) this.addWanted(1);
        break;
      }
    }
  }
  shoot() {
    const p = this.player;
    if (p.ammo <= 0) { this.hud.showBanner('Out of ammo — refill at Harbor Arms ($50)'); p.shootCooldown = 0.3; return; }
    p.ammo--;
    p.shootCooldown = 0.28;
    // Aim toward the mouse cursor in world space.
    const wx = this.cam.x - this.viewW / 2 + this.input.mouseX;
    const wy = this.cam.y - this.viewH / 2 + this.input.mouseY;
    const angle = Math.atan2(wy - p.y, wx - p.x);
    p.angle = angle;
    this.bullets.fire(p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, angle);
    this.muzzle = 0.07; this.muzzleX = p.x + Math.cos(angle) * 24; this.muzzleY = p.y + Math.sin(angle) * 24; this.muzzleAngle = angle;
    this.audio.shot();
    if (this.gameTime - this.lastShotPublic > 5) { this.addWanted(1); this.lastShotPublic = this.gameTime; }
  }
  bulletHit(b) {
    const p = this.player;
    // Hit a pedestrian (kills them: +2 wanted).
    for (const ped of this.peds.list) {
      if (ped.state !== 'down' && dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
        ped.state = 'down'; ped.downTimer = 8;
        this.addWanted(2);
        return true;
      }
    }
    // Hit a police officer (2 hits to drop).
    for (let i = 0; i < this.police.officers.length; i++) {
      const o = this.police.officers[i];
      if (dist2(b.x, b.y, o.x, o.y) < 14 * 14) {
        o.hp = (o.hp || 2) - 1;
        if (o.hp <= 0) { this.police.officers.splice(i, 1); this.addWanted(2); }
        return true;
      }
    }
    // Hit a car.
    const cars = [...this.traffic.cars, ...this.traffic.parked, ...this.police.cars];
    for (const c of cars) {
      if (c === p.inCar) continue;
      if (dist2(b.x, b.y, c.x, c.y) < 26 * 26) {
        c.health -= 12; c.flash = 0.15;
        if (c.driver === 'police') this.addWanted(1);
        return true;
      }
    }
    return false;
  }
  damagePlayer(amount) {
    this.player.health -= amount;
    this.lastDamage = this.gameTime;
  }
  addSparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4 });
    }
  }
  busted() {
    this.state = 'busted';
    this.audio.fail();
    document.getElementById('end-title').textContent = 'BUSTED';
    document.getElementById('end-text').textContent = 'The HPD caught Rex on foot. He loses 10% of his cash and wakes up at the safehouse.';
    this.showOnly('end-screen');
    this.saveGame();
  }
  wasted(reason) {
    this.state = 'wasted';
    this.audio.fail();
    document.getElementById('end-title').textContent = 'WASTED';
    document.getElementById('end-text').textContent = `${reason} Rex loses 10% of his cash and wakes up at the safehouse.`;
    this.showOnly('end-screen');
    this.saveGame();
  }

  // ---- rendering ----
  render() {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.save();
    ctx.translate(this.viewW / 2 - cam.x, this.viewH / 2 - cam.y);
    drawWorld(ctx, this.world, cam, this.viewW, this.viewH, this.time);

    // Mission marker: pulsing ring + label.
    const target = this.missions.targetPos();
    if (target && this.state !== 'title') {
      const pulse = 1 + Math.sin(this.time / 220) * 0.15;
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,215,106,0.25)';
      ctx.beginPath(); ctx.arc(target.x, target.y, 30 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.moveTo(target.x, target.y - 52); ctx.lineTo(target.x + 8, target.y - 38); ctx.lineTo(target.x - 8, target.y - 38); ctx.closePath(); ctx.fill();
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(target.x - 60, target.y - 78, 120, 20);
      ctx.fillStyle = '#ffd76a'; ctx.fillText(target.label || 'TARGET', target.x, target.y - 64);
    }
    // Safehouse / garage / shop ground markers.
    const L = this.world.landmarks;
    this.drawGroundIcon(ctx, L.safehouse.x, L.safehouse.y, '#3fae6a', 'H');
    this.drawGroundIcon(ctx, L.garage.x, L.garage.y, '#f2a230', 'G');
    this.drawGroundIcon(ctx, L.arms.x, L.arms.y, '#c84fd0', 'A');
    this.drawGroundIcon(ctx, L.payphone.x, L.payphone.y, '#39b8c8', 'C');

    this.traffic.draw(ctx, this.time);
    this.police.draw(ctx, this.time);
    this.peds.draw(ctx);
    // Player's car (drawn above traffic so it reads as the hero vehicle).
    if (this.player.inCar) this.player.inCar.draw(ctx, this.time);
    else this.drawPlayerOnFoot(ctx);
    this.bullets.draw(ctx);
    // Sparks.
    for (const s of this.sparks) {
      ctx.fillStyle = `rgba(255,220,120,${Math.max(0, s.life * 2)})`;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    // Muzzle flash.
    if (this.muzzle > 0) {
      ctx.save(); ctx.translate(this.muzzleX, this.muzzleY); ctx.rotate(this.muzzleAngle);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(16, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Punch arc.
    if (this.player.punchTimer > 0) {
      ctx.save(); ctx.translate(this.player.x, this.player.y); ctx.rotate(this.player.angle);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 34, -0.6, 0.6); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Dusk vignette.
    const grad = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.45,
      this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.75);
    grad.addColorStop(0, 'rgba(20,10,40,0)');
    grad.addColorStop(1, 'rgba(20,10,40,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    if (this.state === 'title') {
      // Dim the world behind the title screen.
      ctx.fillStyle = 'rgba(10,8,24,0.45)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    window.__ready = true;
  }
  drawGroundIcon(ctx, x, y, color, letter) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(letter, x, y + 4);
  }
  drawPlayerOnFoot(ctx) {
    const p = this.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    const bob = p.moving ? Math.sin(p.walkPhase) * 1.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 7, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // Rex Marlowe: teal jacket, dark hair.
    ctx.fillStyle = '#2f8f7a';
    ctx.beginPath(); ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b04f';
    ctx.beginPath(); ctx.arc(0, -9 + bob * 0.3, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-1, -11 + bob * 0.3, 4, Math.PI, 0); ctx.fill();
    // Facing tick + pistol in hand.
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
    if (p.pistol) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(8, -2, 9, 4);
    }
    ctx.restore();
  }
}
