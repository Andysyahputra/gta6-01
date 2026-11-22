// Neon Harbor — main.js
// One job: wire everything together. The game loop, camera, game state
// (start / playing / paused / wasted / busted), wanted-level bookkeeping,
// bullets and sparks, car stealing, save/load, and the ?shot= states the
// screenshot run uses. All world drawing order lives here.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;
  var L = CFG.landmarks;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new NH.Input(canvas);
    this.audio = new NH.AudioEngine();
    this.hud = null;
    this.world = null;
    this.player = null;
    this.missions = null;
    this.police = null;
    this.rng = null;

    this.state = 'start';      // start | playing | paused | wasted | busted
    this.time = 0;
    this.clock = 17 * 60 + 24; // golden hour: 17:24
    this.cash = 0;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.gunfireTimer = 0;
    this.king = false;
    this.hasSave = false;
    this.bullets = [];
    this.sparks = [];
    this.extraCars = [];
    this.parkedCars = [];
    this.traffic = [];
    this.pedestrians = [];
    this.camera = { x: 0, y: 0, w: CFG.viewWidth, h: CFG.viewHeight };
    this.endPenalty = 0;
    this.lastRaise = {};
    this.flashTimer = 0;

    this.loadSave();
    this.newGame(this.seedFromQuery());
    this.hud = new NH.Hud(this);
    this.applyShotMode();
  }

  Game.prototype.seedFromQuery = function () {
    var q = NH.Input.queryParams();
    var s = parseInt(q.seed || '1', 10);
    return isNaN(s) ? 1 : s;
  };

  Game.prototype.newGame = function (seed) {
    this.rng = new NH.SeededRng(seed * 7919 + 13);
    this.world = new NH.World(seed * 7919 + 13);
    this.player = new NH.Player(L.safehouse.x + 40, L.safehouse.y + 40);
    this.missions = new NH.Missions(this);
    this.police = new NH.Police(this);
    this.extraCars = [];
    this.parkedCars = NH.spawnParkedCars(this);
    this.traffic = NH.spawnTraffic(this);
    this.pedestrians = NH.spawnPedestrians(this);
    this.bullets = [];
    this.sparks = [];
    this.wanted = 0;
    this.cash = 0;
    this.king = false;
    this.clock = 17 * 60 + 24;
    this.missions.startMission(0);
  };

  // Save/load: cash, mission, pistol, best wanted. localStorage only.
  Game.prototype.save = function () {
    try {
      global.localStorage.setItem(CFG.saveKey, JSON.stringify({
        cash: this.cash,
        mission: this.missions.index,
        pistol: this.player.hasPistol,
        ammo: this.player.ammo,
        king: this.king,
        bestWanted: this.bestWanted || 0
      }));
    } catch (e) { /* storage unavailable: game still plays */ }
  };

  Game.prototype.loadSave = function () {
    try {
      var raw = global.localStorage.getItem(CFG.saveKey);
      if (!raw) return;
      var s = JSON.parse(raw);
      this.savedData = s;
      this.hasSave = true;
      this.cash = s.cash || 0;
      this.bestWanted = s.bestWanted || 0;
    } catch (e) { this.hasSave = false; }
  };

  Game.prototype.applySave = function () {
    var s = this.savedData;
    if (!s) return;
    this.cash = s.cash || 0;
    this.king = !!s.king;
    this.player.hasPistol = !!s.pistol;
    this.player.ammo = s.ammo || 0;
    var idx = Math.min(s.mission || 0, CFG.missions.length - 1);
    this.missions.startMission(idx);
  };

  // Wanted level: add with a per-reason throttle so one burst of
  // gunfire is one star, not five.
  Game.prototype.addWanted = function (n, reason) {
    var now = this.time;
    if (this.lastRaise[reason] !== undefined && now - this.lastRaise[reason] < 2) return;
    this.lastRaise[reason] = now;
    this.setWanted(Math.min(5, this.wanted + n), reason);
  };

  Game.prototype.setWanted = function (n, reason) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.wantedTimer = 0;
    this.bestWanted = Math.max(this.bestWanted || 0, this.wanted);
    if (this.wanted > 0) this.audio.setSiren(true);
  };

  Game.prototype.allCars = function () {
    var list = this.parkedCars.concat(this.extraCars);
    for (var i = 0; i < this.traffic.length; i++) list.push(this.traffic[i].car);
    for (var j = 0; j < this.police.cars.length; j++) list.push(this.police.cars[j]);
    for (var k = 0; k < this.police.roadblocks.length; k++) list.push(this.police.roadblocks[k]);
    return list;
  };

  Game.prototype.nearestCar = function (x, y, maxD) {
    var best = null, bestD = maxD, cars = this.allCars();
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.wrecked || c.drivenByPlayer) continue;
      var d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  Game.prototype.tryEnterCar = function () {
    var p = this.player;
    var car = this.nearestCar(p.x, p.y, 52);
    if (!car) return;
    if (car.isPolice) { this.missions.showMessage('That is a police cruiser — stealing it is a bad idea.', 2.5); return; }
    if (car.occupied) {
      // Occupied steal: the driver bails and runs; +1 star.
      car.occupied = false;
      car.driverFled = true;
      var ped = new NH.Pedestrian(car.x + 30, car.y + 20, this.rng);
      ped.fleeing = true;
      this.pedestrians.push(ped);
      this.addWanted(CFG.wanted.stealOccupied, 'steal');
      this.missions.showMessage('Car jacked! The driver ran off screaming.', 2.5);
    }
    p.inCar = car;
    car.drivenByPlayer = true;
    this.audio.resume();
  };

  Game.prototype.exitCar = function () {
    var p = this.player;
    if (!p.inCar) return;
    var car = p.inCar;
    car.drivenByPlayer = false;
    car.speed *= 0.3;
    p.inCar = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    if (this.world.collideBuildings(p.x, p.y, p.radius)) {
      p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
    }
  };

  Game.prototype.removeCar = function (car) {
    var lists = [this.parkedCars, this.extraCars];
    for (var l = 0; l < lists.length; l++) {
      var i = lists[l].indexOf(car);
      if (i >= 0) { lists[l].splice(i, 1); return; }
    }
  };

  Game.prototype.hitNearestPedestrian = function (x, y, r, dmg) {
    for (var i = 0; i < this.pedestrians.length; i++) {
      var ped = this.pedestrians[i];
      if (ped.downTimer > 0) continue;
      if (Math.hypot(ped.x - x, ped.y - y) < r + 10) {
        ped.downTimer = 4;
        if (this.wanted >= 0) this.addWanted(1, 'punch');
        return true;
      }
    }
    return false;
  };

  Game.prototype.hitNearestOfficer = function (x, y, r, dmg) {
    for (var i = 0; i < this.police.officers.length; i++) {
      var o = this.police.officers[i];
      if (o.downTimer > 0) continue;
      if (Math.hypot(o.x - x, o.y - y) < r + 10) {
        o.health -= dmg;
        if (o.health <= 0) {
          o.downTimer = 8;
          this.addWanted(CFG.wanted.killOfficer, 'kill-officer');
        }
        return true;
      }
    }
    return false;
  };

  Game.prototype.spawnSparks = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = this.rng.float(0, Math.PI * 2);
      var sp = this.rng.float(40, 160);
      this.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, color: color });
    }
  };

  Game.prototype.onWasted = function () {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.endPenalty = Math.floor(this.cash * 0.1);
    this.cash -= this.endPenalty;
    this.audio.setSiren(false);
    this.missions.failMission('Wasted');
    this.save();
  };

  Game.prototype.onBusted = function () {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.endPenalty = Math.floor(this.cash * 0.1);
    this.cash -= this.endPenalty;
    this.audio.setSiren(false);
    this.missions.failMission('Busted by the Harbor PD');
    this.save();
  };

  Game.prototype.respawn = function () {
    if (this.player.inCar) {
      this.player.inCar.drivenByPlayer = false;
      this.player.inCar = null;
    }
    this.player.reset(L.safehouse.x + 40, L.safehouse.y + 40);
    this.player.health = CFG.player.healthMax;
    this.setWanted(0, 'respawn');
    this.police.cars = [];
    this.police.officers = [];
    this.state = 'playing';
    this.save();
  };

  Game.prototype.update = function (dt) {
    this.time += dt;
    NH.__time = this.time;
    this.clock += dt * 0.6; // game clock runs faster than real time
    this.gunfireTimer = Math.max(0, this.gunfireTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (this.state === 'start') {
      if (this.input.wasPressed('Enter')) {
        this.audio.resume();
        if (this.hasSave) this.applySave();
        this.state = 'playing';
        this.missions.showMessage(CFG.missions[this.missions.index]
          ? CFG.missions[this.missions.index].brief : 'Free roam — deliver cars to the garage.', 5);
      } else if (this.input.wasPressed('n')) {
        this.audio.resume();
        this.newGame(this.seedFromQuery());
        this.state = 'playing';
      }
      this.input.endFrame();
      return;
    }

    if (this.state === 'paused') {
      if (this.input.wasPressed('Escape', 'p')) { this.state = 'playing'; }
      else if (this.input.wasPressed('r')) { this.missions.startMission(this.missions.index); this.state = 'playing'; }
      else if (this.input.wasPressed('n')) { this.newGame(this.seedFromQuery()); this.state = 'playing'; }
      this.input.endFrame();
      return;
    }

    if (this.state === 'wasted' || this.state === 'busted') {
      if (this.input.wasPressed('Enter')) this.respawn();
      this.input.endFrame();
      return;
    }

    // Playing.
    if (this.input.wasPressed('Escape', 'p')) { this.state = 'paused'; this.save(); this.input.endFrame(); return; }
    if (this.input.wasPressed('0')) {
      this.audio.setMuted(!this.audio.muted);
      this.missions.showMessage(this.audio.muted ? 'Sound muted.' : 'Sound on.', 1.5);
    }

    // Wanted cooldown: lay low and the heat fades, faster near the safehouse.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      var nearSafe = Math.hypot(this.player.x - L.safehouse.x, this.player.y - L.safehouse.y) < 260;
      var cool = CFG.wanted.coolDownSeconds - (nearSafe ? CFG.wanted.hideBonusSeconds : 0);
      if (this.wantedTimer > cool) {
        this.wantedTimer = 0;
        this.setWanted(this.wanted - 1, 'cooldown');
        if (this.wanted === 0) this.audio.setSiren(false);
      }
    }

    // Cleaner payphone: pay $150 to wipe the wanted level.
    if (this.wanted > 0 && !this.player.inCar &&
        Math.hypot(this.player.x - L.cleaner.x, this.player.y - L.cleaner.y) < 60 &&
        this.input.wasPressed('e') && this.cash >= CFG.prices.cleaner) {
      this.cash -= CFG.prices.cleaner;
      this.setWanted(0, 'cleaner');
      this.audio.setSiren(false);
      this.missions.showMessage('Cleaner paid. The heat is gone — for now.', 3);
    }

    // Harbor Arms: refill pistol ammo for $50.
    if (this.player.hasPistol && !this.player.inCar &&
        Math.hypot(this.player.x - L.gunShop.x, this.player.y - L.gunShop.y) < 60 &&
        this.input.wasPressed('e') && this.cash >= CFG.prices.ammoRefill) {
      this.cash -= CFG.prices.ammoRefill;
      this.player.ammo = CFG.player.pistolAmmoMax;
      this.missions.showMessage('Ammo restocked at Harbor Arms.', 2.5);
    }

    this.player.update(dt, this);
    if (this.player.inCar) this.player.inCar.updateDriving(dt, this);

    var i, j;
    for (i = 0; i < this.traffic.length; i++) this.traffic[i].update(dt, this);
    for (i = 0; i < this.pedestrians.length; i++) this.pedestrians[i].update(dt, this);
    this.police.update(dt, this);
    this.missions.update(dt);

    // Car-vs-car collisions (player car included).
    var cars = this.allCars();
    for (i = 0; i < cars.length; i++) {
      for (j = i + 1; j < cars.length; j++) {
        if (cars[i].wrecked || cars[j].wrecked) continue;
        var hard = cars[i].collideWith(cars[j], this);
        if (hard && (cars[i].isPolice || cars[j].isPolice) &&
            (cars[i].drivenByPlayer || cars[j].drivenByPlayer)) {
          this.addWanted(CFG.wanted.damagePoliceCar, 'damage-police');
        }
      }
    }

    // Player car vs pedestrians: a hit raises the wanted level.
    if (this.player.inCar && Math.abs(this.player.inCar.speed) > 60) {
      var pc = this.player.inCar;
      for (i = 0; i < this.pedestrians.length; i++) {
        var ped = this.pedestrians[i];
        if (ped.downTimer > 0) continue;
        if (Math.hypot(ped.x - pc.x, ped.y - pc.y) < 30) {
          ped.downTimer = 5;
          this.addWanted(CFG.wanted.hitPedestrian, 'hit-ped');
          this.audio.bump();
          this.spawnSparks(ped.x, ped.y, 6, '#ff8a3d');
        }
      }
    }

    // Bullets: move, hit buildings, peds, officers, police cars.
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      var dead = b.life <= 0 || this.world.collideBuildings(b.x, b.y, 2) || !this.world.onWalkable(b.x, b.y);
      if (!dead && b.fromPlayer) {
        for (j = 0; j < this.pedestrians.length; j++) {
          var pd = this.pedestrians[j];
          if (pd.downTimer > 0) continue;
          if (Math.hypot(pd.x - b.x, pd.y - b.y) < 12) {
            pd.downTimer = 6;
            this.addWanted(CFG.wanted.killPedestrian, 'kill-ped');
            this.spawnSparks(b.x, b.y, 6, '#ff8a3d');
            dead = true; break;
          }
        }
        if (!dead) {
          for (j = 0; j < this.police.officers.length; j++) {
            var of = this.police.officers[j];
            if (of.downTimer > 0) continue;
            if (Math.hypot(of.x - b.x, of.y - b.y) < 12) {
              of.health -= b.damage;
              if (of.health <= 0) { of.downTimer = 8; this.addWanted(CFG.wanted.killOfficer, 'kill-officer'); }
              this.spawnSparks(b.x, b.y, 6, '#ff8a3d');
              dead = true; break;
            }
          }
        }
        if (!dead) {
          for (j = 0; j < this.police.cars.length; j++) {
            var poc = this.police.cars[j];
            if (Math.hypot(poc.x - b.x, poc.y - b.y) < 26) {
              poc.health -= b.damage;
              this.addWanted(CFG.wanted.damagePoliceCar, 'damage-police');
              this.spawnSparks(b.x, b.y, 5, '#ffd94d');
              dead = true; break;
            }
          }
        }
      } else if (!dead && !b.fromPlayer) {
        if (Math.hypot(this.player.x - b.x, this.player.y - b.y) < 14 && !this.player.inCar) {
          this.player.takeDamage(b.damage, this);
          dead = true;
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }

    // Sparks.
    for (i = this.sparks.length - 1; i >= 0; i--) {
      var s = this.sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }

    // Audio follows the game.
    var speed01 = this.player.inCar ? Math.abs(this.player.inCar.speed) / 460 : 0;
    this.audio.setEngine(speed01);
    this.audio.setSiren(this.wanted > 0);
    this.audio.updateMusic(dt);

    // Camera follows the player (or their car), clamped to the world.
    var fx = this.player.x, fy = this.player.y;
    this.camera.x = Math.max(0, Math.min(CFG.worldWidth - CFG.viewWidth, fx - CFG.viewWidth / 2));
    this.camera.y = Math.max(0, Math.min(CFG.worldHeight - CFG.viewHeight, fy - CFG.viewHeight / 2));

    this.input.endFrame();
  };

  Game.prototype.draw = function () {
    var ctx = this.ctx;
    var cam = this.camera;
    ctx.clearRect(0, 0, CFG.viewWidth, CFG.viewHeight);

    // On the start screen, show the city from a fixed scenic angle.
    if (this.state === 'start') {
      cam.x = 600; cam.y = 500;
    }

    this.world.draw(ctx, cam);

    // Landmark labels and markers on the ground.
    this.drawLandmarks(ctx, cam);

    // Mission target beacon.
    var tp = this.missions.targetPoint();
    if (tp && this.state === 'playing') {
      var tx = tp.x - cam.x, ty = tp.y - cam.y;
      var pulse = 1 + Math.sin(this.time * 4) * 0.15;
      ctx.strokeStyle = '#ffdf3d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tx, ty, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffdf3d';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 40);
      ctx.lineTo(tx - 9, ty - 56);
      ctx.lineTo(tx + 9, ty - 56);
      ctx.closePath(); ctx.fill();
    }

    var i;
    for (i = 0; i < this.parkedCars.length; i++) this.parkedCars[i].draw(ctx, cam);
    for (i = 0; i < this.extraCars.length; i++) this.extraCars[i].draw(ctx, cam);
    for (i = 0; i < this.traffic.length; i++) this.traffic[i].car.draw(ctx, cam);
    for (i = 0; i < this.pedestrians.length; i++) this.pedestrians[i].draw(ctx, cam);
    this.police.draw(ctx, cam);
    this.player.draw(ctx, cam);

    // Bullets.
    ctx.fillStyle = '#ffe066';
    for (i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i];
      ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Sparks.
    for (i = 0; i < this.sparks.length; i++) {
      var s = this.sparks[i];
      ctx.globalAlpha = Math.max(0, s.life / 0.35);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - cam.x - 2, s.y - cam.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    if (this.state === 'playing' || this.state === 'paused') this.hud.drawGame(ctx, this);
    if (this.state === 'start') this.hud.drawStart(ctx, this);
    if (this.state === 'paused') this.hud.drawPause(ctx);
    if (this.state === 'wasted') this.hud.drawEnd(ctx, 'WASTED', 'Rex got taken down.', 'Lost $' + this.endPenalty + ' in the chaos. The city waits for no one.');
    if (this.state === 'busted') this.hud.drawEnd(ctx, 'BUSTED', 'The Harbor PD caught Rex.', 'Lost $' + this.endPenalty + ' in fines. Vera is not impressed.');
  };

  Game.prototype.drawLandmarks = function (ctx, cam) {
    var marks = [
      { p: L.safehouse, c: '#57d977', t: 'SAFEHOUSE' },
      { p: L.garage, c: '#ffdf3d', t: "VERA'S GARAGE" },
      { p: L.gunShop, c: '#ff8a3d', t: 'HARBOR ARMS' },
      { p: L.bank, c: '#4db38a', t: 'HARBOR BANK' },
      { p: L.docks, c: '#2fa8d8', t: 'DOCKS' },
      { p: L.market, c: '#e86a92', t: 'MARKET' },
      { p: L.beachHotel, c: '#f2a03d', t: 'BEACH HOTEL' },
      { p: L.cleaner, c: '#b388ff', t: 'CLEANER' }
    ];
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var sx = m.p.x - cam.x, sy = m.p.y - cam.y;
      if (sx < -80 || sx > CFG.viewWidth + 80 || sy < -40 || sy > CFG.viewHeight + 40) continue;
      ctx.fillStyle = m.c;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1c1a26';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,18,32,0.75)';
      var w = ctx.measureText(m.t).width + 12;
      ctx.fillRect(sx - w / 2, sy - 30, w, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(m.t, sx, sy - 18);
    }
    ctx.textAlign = 'left';
  };

  // ?shot= states: real game states, set up deterministically so the
  // screenshots show the actual game, not a mock.
  Game.prototype.applyShotMode = function () {
    var q = NH.Input.queryParams();
    var shot = q.shot;
    if (!shot) return;
    var self = this;
    if (shot === 'start') {
      this.state = 'start';
      return;
    }
    this.state = 'playing';
    this.audio.muted = true;
    if (shot === 'drive') {
      // Downtown, in a Comet GT, traffic and pedestrians around.
      var model = CFG.carModels.filter(function (m) { return m.name === 'Comet GT'; })[0];
      var car = new NH.Car(model, 1350, 950, 0);
      car.occupied = false;
      this.extraCars.push(car);
      this.player.x = 1350; this.player.y = 950;
      this.player.inCar = car;
      car.drivenByPlayer = true;
      car.speed = 220;
      this.missions.index = 0;
      this.missions.stage = 0;
      this.missions.message = 'Vera Kline: "New in town, Rex? Steal any car and bring it to my garage."';
      this.missions.messageTimer = 99;
    } else if (shot === 'chase') {
      // 3-star chase: patrol cars behind, helicopter overhead, mission live.
      var model2 = CFG.carModels.filter(function (m) { return m.name === 'Sunset Coupe'; })[0];
      var car2 = new NH.Car(model2, 950, 950, 0);
      car2.occupied = false;
      this.extraCars.push(car2);
      this.player.x = 950; this.player.y = 950;
      this.player.inCar = car2;
      car2.drivenByPlayer = true;
      car2.speed = 200;
      // Cruise so the getaway car stays ahead of the patrol cars and
      // the frame reads as a chase, not a pile-up.
      this.shotCruise = true;
      // Clear pedestrians from the getaway lane so the opening frame
      // stays a clean 3-star chase (no stray +1 star from a bump).
      // The lane is a wide strip east of the player, where the car runs.
      this.pedestrians = this.pedestrians.filter(function (pd) {
        return !(pd.x > 800 && pd.x < 1900 && pd.y > 700 && pd.y < 1200);
      });
      this.setWanted(3, 'shot');
      this.missions.index = 2;
      this.missions.stage = 1;
      this.missions.showMessage('Coupe lifted! Deliver it to the docks — stay out of sight.', 99);
      this.missions.messageTimer = 99;
      // Pre-spawn the chase so the frame is dense on first paint.
      for (var i = 0; i < 3; i++) {
        var pm = CFG.carModels.filter(function (m) { return m.name === 'Patrol Cruiser'; })[0];
        var pc = new NH.Car(pm, 950 - 140 - i * 90, 950 + (i % 2 ? 40 : -40), 0);
        pc.isPolice = true; pc.occupied = true;
        this.police.cars.push(pc);
      }
      this.police.heli.active = true;
      this.police.heli.x = 950 + 190; this.police.heli.y = 950 - 60;
      this.police.heli.spotAngle = Math.PI;
    } else if (shot === 'mission') {
      // The Big Score holdout at the bank: truck, timer, heat, objective.
      var tm = CFG.carModels.filter(function (m) { return m.name === 'Box Truck'; })[0];
      var truck = new NH.Car(tm, 1480, 700, Math.PI / 2);
      truck.occupied = false;
      this.extraCars.push(truck);
      this.player.x = 1480; this.player.y = 700;
      this.player.inCar = truck;
      truck.drivenByPlayer = true;
      this.setWanted(2, 'shot');
      this.missions.index = 6;
      this.missions.stage = 1;
      this.missions.holdTimer = 14;
      this.missions.targetCar = truck;
      this.missions.showMessage('Vault open! Hold the bank for 20 seconds while the cops close in.', 99);
      this.missions.messageTimer = 99;
      var pm2 = CFG.carModels.filter(function (m) { return m.name === 'Patrol Cruiser'; })[0];
      var pc2 = new NH.Car(pm2, 1480 - 200, 760, 0);
      pc2.isPolice = true; pc2.occupied = true;
      this.police.cars.push(pc2);
    }
    // Settle the camera on the player before the first frame.
    this.camera.x = Math.max(0, Math.min(CFG.worldWidth - CFG.viewWidth, this.player.x - CFG.viewWidth / 2));
    this.camera.y = Math.max(0, Math.min(CFG.worldHeight - CFG.viewHeight, this.player.y - CFG.viewHeight / 2));
    this.update(0.016);
  };

  // Boot.
  Game.boot = function () {
    var canvas = global.document.getElementById('game');
    var game = new Game(canvas);
    global.__neonHarbor = game;
    var last = global.performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.update(dt);
      game.draw();
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
    return game;
  };

  NH.Game = Game;
  global.addEventListener('DOMContentLoaded', function () { Game.boot(); });
})(typeof window !== 'undefined' ? window : globalThis);
