// Neon Harbor — cars.js
// One job: cars. The car entity, arcade driving physics (accelerate,
// steer, momentum), collisions with buildings and other cars, and the
// seeded parked cars that line the curbs.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;

  function Car(model, x, y, angle) {
    this.model = model;
    this.x = x; this.y = y;
    this.angle = angle || 0;
    this.speed = 0;
    this.occupied = false;      // has a traffic driver
    this.drivenByPlayer = false;
    this.isPolice = false;
    this.isTarget = false;      // mission target car (Sunset Coupe / getaway)
    this.health = 100;
    this.wrecked = false;
    this.bumpTimer = 0;
    this.driverFled = false;
    this.lastCollideDmgAt = -99;
  }

  Car.prototype.updateDriving = function (dt, game) {
    var input = game.input;
    var m = this.model;
    // Shot mode: the chase screenshot cruises on its own so the player
    // car stays ahead of the patrol cars instead of being piled on.
    var throttle = game.shotCruise ? 1 : input.moveY() * -1;
    var steer = game.shotCruise ? 0 : input.moveX();

    if (throttle > 0) this.speed += m.accel * dt;
    else if (throttle < 0) this.speed -= (this.speed > 5 ? m.accel * 1.2 : m.accel * 0.6) * dt;
    else this.speed -= this.speed * 1.1 * dt;

    // Cap forward and reverse speed.
    if (this.speed > m.topSpeed) this.speed = m.topSpeed;
    if (this.speed < -m.topSpeed * 0.45) this.speed = -m.topSpeed * 0.45;

    // Steering bites less at high speed, reverses when backing up.
    var steerAuthority = 1 - Math.min(0.55, Math.abs(this.speed) / (m.topSpeed * 2.2));
    var dir = this.speed >= 0 ? 1 : -1;
    this.angle += steer * m.grip * steerAuthority * dir * dt * Math.min(1, Math.abs(this.speed) / 60 + 0.15);

    var nx = this.x + Math.cos(this.angle) * this.speed * dt;
    var ny = this.y + Math.sin(this.angle) * this.speed * dt;
    var r = Math.max(m.len, m.wid) * 0.42;

    var hitBuilding = game.world.collideBuildings(nx, ny, r);
    if (hitBuilding || !game.world.onWalkable(nx, ny)) {
      if (Math.abs(this.speed) > 120) {
        game.audio.bump();
        game.spawnSparks(this.x, this.y, 8, '#ffd94d');
        this.health -= 6;
        if (this.drivenByPlayer && this.health <= 0) game.onWasted();
      }
      this.speed *= -0.25;
    } else {
      this.x = nx; this.y = ny;
    }
    this.x = Math.max(24, Math.min(CFG.worldWidth - 24, this.x));
    this.y = Math.max(24, Math.min(CFG.worldHeight - 24, this.y));
    this.bumpTimer = Math.max(0, this.bumpTimer - dt);
  };

  // Soft circle collision between two cars; returns true on a hard hit.
  Car.prototype.collideWith = function (other, game) {
    var dx = other.x - this.x, dy = other.y - this.y;
    var minD = (Math.max(this.model.len, this.model.wid) + Math.max(other.model.len, other.model.wid)) * 0.38;
    var d = Math.hypot(dx, dy);
    if (d <= 0.01 || d >= minD) return false;
    var push = (minD - d) / 2;
    var ux = dx / d, uy = dy / d;
    this.x -= ux * push; this.y -= uy * push;
    other.x += ux * push; other.y += uy * push;
    var impact = Math.abs(this.speed - other.speed);
    if (impact > 140) {
      game.spawnSparks((this.x + other.x) / 2, (this.y + other.y) / 2, 6, '#ffd94d');
      if (impact > 260) game.audio.bump();
      // Damage at most twice a second per car: without this a pile-up
      // of overlapping cars drains a whole health bar in one second.
      if (game.time - this.lastCollideDmgAt > 0.5) {
        this.health -= 3;
        this.lastCollideDmgAt = game.time;
      }
      if (game.time - other.lastCollideDmgAt > 0.5) {
        other.health -= 3;
        other.lastCollideDmgAt = game.time;
      }
      return true;
    }
    return false;
  };

  Car.prototype.draw = function (ctx, cam) {
    var sx = this.x - cam.x, sy = this.y - cam.y;
    var m = this.model;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(28,26,38,0.28)';
    ctx.beginPath(); ctx.ellipse(1, 3, m.len * 0.55, m.wid * 0.55, 0, 0, Math.PI * 2); ctx.fill();

    // Body.
    ctx.fillStyle = this.wrecked ? '#5a5a60' : m.color;
    ctx.beginPath();
    ctx.roundRect(-m.len / 2, -m.wid / 2, m.len, m.wid, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,26,38,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    ctx.beginPath();
    ctx.roundRect(-m.len * 0.18, -m.wid * 0.36, m.len * 0.36, m.wid * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(159,216,239,0.8)';
    ctx.fillRect(m.len * 0.2, -m.wid * 0.32, 4, m.wid * 0.64);

    // Headlights, taillights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(m.len / 2 - 2, -m.wid / 2 + 3, 3, 5);
    ctx.fillRect(m.len / 2 - 2, m.wid / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-m.len / 2 - 1, -m.wid / 2 + 3, 3, 5);
    ctx.fillRect(-m.len / 2 - 1, m.wid / 2 - 8, 3, 5);

    if (this.isPolice) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      // Light bar, alternating flash.
      var flash = (Math.floor(global.NH.__time * 6) % 2 === 0);
      ctx.fillStyle = flash ? '#ff3b30' : '#2b6bff';
      ctx.fillRect(-6, -m.wid / 2 - 4, 12, 4);
      ctx.fillStyle = flash ? '#2b6bff' : '#ff3b30';
      ctx.fillRect(-6, m.wid / 2, 12, 4);
    }
    if (this.isTarget) {
      ctx.strokeStyle = '#ffdf3d';
      ctx.lineWidth = 3;
      ctx.strokeRect(-m.len / 2 - 4, -m.wid / 2 - 4, m.len + 8, m.wid + 8);
    }
    ctx.restore();

    // Mission-target beacon.
    if (this.isTarget) {
      ctx.fillStyle = '#ffdf3d';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 34);
      ctx.lineTo(sx - 8, sy - 48);
      ctx.lineTo(sx + 8, sy - 48);
      ctx.closePath(); ctx.fill();
    }
  };

  // Seed the curbs with parked cars (deterministic per seed).
  function spawnParkedCars(game) {
    var rng = game.rng;
    var cars = [];
    var spots = 0, tries = 0;
    while (spots < 12 && tries < 200) {
      tries++;
      var p = game.world.randomRoadPoint(rng);
      var model = rng.pick(CFG.carModels.filter(function (m) { return m.name !== 'Patrol Cruiser'; }));
      var x = p.x + (p.angle === 0 || p.angle === Math.PI ? 0 : (rng.chance(0.5) ? 44 : -44));
      var y = p.y + (p.angle === 0 || p.angle === Math.PI ? (rng.chance(0.5) ? 44 : -44) : 0);
      if (game.world.collideBuildings(x, y, 30)) continue;
      if (game.world.isWater(x, y)) continue;
      var c = new Car(model, x, y, p.angle);
      c.occupied = false;
      cars.push(c);
      spots++;
    }
    return cars;
  }

  NH.Car = Car;
  NH.spawnParkedCars = spawnParkedCars;
})(typeof window !== 'undefined' ? window : globalThis);
