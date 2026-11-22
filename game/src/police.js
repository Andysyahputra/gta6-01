// Neon Harbor — police.js
// One job: the wanted system. Stars rise on crimes and cool down when
// the player hides; patrol cars chase and ram, officers get out on foot
// (touch = busted), roadblocks appear at 3+ stars, and a police
// helicopter circles with a spotlight at 3+ stars.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;

  function Officer(x, y) {
    this.x = x; this.y = y;
    this.angle = 0;
    this.speed = 185;
    this.health = 50;
    this.shootCooldown = 0;
    this.downTimer = 0;
    this.walkCycle = 0;
  }

  Officer.prototype.update = function (dt, game) {
    if (this.downTimer > 0) { this.downTimer -= dt; return; }
    var p = game.player;
    var tx = p.inCar ? p.inCar.x : p.x;
    var ty = p.inCar ? p.inCar.y : p.y;
    var dx = tx - this.x, dy = ty - this.y;
    var d = Math.hypot(dx, dy);
    this.angle = Math.atan2(dy, dx);
    this.shootCooldown -= dt;

    // On foot, getting touched means busted.
    if (!p.inCar && d < 26) { game.onBusted(); return; }

    if (d > 30) {
      var nx = this.x + Math.cos(this.angle) * this.speed * dt;
      var ny = this.y + Math.sin(this.angle) * this.speed * dt;
      if (!game.world.collideBuildings(nx, ny, 10) && game.world.onWalkable(nx, ny)) {
        this.x = nx; this.y = ny;
      }
      this.walkCycle += dt * 11;
    }

    // Officers shoot when close and the player is on foot.
    if (!p.inCar && d < 320 && d > 40 && this.shootCooldown <= 0) {
      this.shootCooldown = 1.1;
      game.audio.policeShot();
      var spread = (game.rng.next() - 0.5) * 0.35;
      var a = this.angle + spread;
      game.bullets.push({
        x: this.x + Math.cos(a) * 18, y: this.y + Math.sin(a) * 18,
        vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
        life: 0.8, fromPlayer: false, damage: 9
      });
    }
  };

  Officer.prototype.draw = function (ctx, cam) {
    var sx = this.x - cam.x, sy = this.y - cam.y;
    if (this.downTimer > 0) {
      ctx.fillStyle = '#2b4bd8';
      ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, this.angle, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(28,26,38,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 10, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#2b4bd8';
    ctx.fillRect(-7, -6, 14, 12);
    ctx.fillStyle = '#1c1a26';
    ctx.fillRect(-10, -5, 5, 10);
    ctx.fillStyle = '#f2c98a';
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b4bd8';
    ctx.fillRect(4, -7, 8, 4);
    ctx.restore();
  };

  function Helicopter() {
    this.angle = 0;          // orbit angle around the player
    this.radius = 190;
    this.x = 0; this.y = 0;
    this.active = false;
    this.spotAngle = 0;
  }

  Helicopter.prototype.update = function (dt, game) {
    this.active = game.wanted >= 3;
    if (!this.active) return;
    var p = game.player;
    var tx = p.inCar ? p.inCar.x : p.x;
    var ty = p.inCar ? p.inCar.y : p.y;
    // Circle the player, slowly tightening, spotlight tracking them.
    this.angle += dt * 0.55;
    this.radius = Math.max(150, this.radius - dt * 4);
    this.x = tx + Math.cos(this.angle) * this.radius;
    this.y = ty + Math.sin(this.angle) * this.radius - 30;
    this.spotAngle = Math.atan2(ty - this.y, tx - this.x);
  };

  Helicopter.prototype.draw = function (ctx, cam) {
    if (!this.active) return;
    var sx = this.x - cam.x, sy = this.y - cam.y;
    // Spotlight cone onto the player.
    var p = this.spotTarget;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    var a1 = this.spotAngle - 0.22, a2 = this.spotAngle + 0.22;
    var L = 260;
    ctx.lineTo(sx + Math.cos(a1) * L, sy + Math.sin(a1) * L);
    ctx.lineTo(sx + Math.cos(a2) * L, sy + Math.sin(a2) * L);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Rotor blur + body.
    ctx.strokeStyle = 'rgba(43,47,56,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - 26, sy - 4); ctx.lineTo(sx + 26, sy - 4);
    ctx.stroke();
    ctx.fillStyle = '#2b2f38';
    ctx.beginPath(); ctx.ellipse(sx, sy, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fd8ef';
    ctx.beginPath(); ctx.arc(sx + 14, sy - 1, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffdf3d';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AIR-1', sx, sy + 3);
  };

  function Police(game) {
    this.game = game;
    this.cars = [];
    this.officers = [];
    this.heli = new Helicopter();
    this.spawnTimer = 0;
    this.roadblocks = [];
  }

  Police.prototype.wantedCarCount = function (stars) {
    return Math.min(CFG.maxPoliceCars, Math.max(0, stars));
  };

  Police.prototype.update = function (dt, game) {
    var wanted = game.wanted;
    this.heli.spotTarget = null;
    this.heli.update(dt, game);

    // Spawn patrol cars up to the wanted count.
    var want = this.wantedCarCount(wanted);
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      var p = game.player;
      var px = p.inCar ? p.inCar.x : p.x;
      var py = p.inCar ? p.inCar.y : p.y;
      // Spawn off-screen but near: pick a road point 500-700 away.
      var a = game.rng.float(0, Math.PI * 2);
      var sx = px + Math.cos(a) * 620, sy = py + Math.sin(a) * 620;
      sx = Math.max(80, Math.min(CFG.worldWidth - 80, sx));
      sy = Math.max(80, Math.min(CFG.worldHeight - 80, sy));
      var rp = game.world.nearestRoadPoint(sx, sy);
      var model = CFG.carModels.filter(function (m) { return m.name === 'Patrol Cruiser'; })[0];
      var car = new NH.Car(model, rp.x, rp.y, Math.atan2(py - rp.y, px - rp.x));
      car.isPolice = true;
      car.occupied = true;
      this.cars.push(car);
      game.audio.sirenBlip();
    }

    // Roadblocks at 3+ stars: two parked cruisers across the road ahead.
    if (wanted >= 3 && this.roadblocks.length === 0) {
      var pr = game.world.nearestRoadPoint(game.player.x + 420, game.player.y);
      var model2 = CFG.carModels.filter(function (m) { return m.name === 'Patrol Cruiser'; })[0];
      var r1 = new NH.Car(model2, pr.x - 30, pr.y, Math.PI / 2);
      var r2 = new NH.Car(model2, pr.x + 30, pr.y, Math.PI / 2);
      r1.isPolice = true; r2.isPolice = true;
      this.roadblocks = [r1, r2];
    }
    if (wanted < 3) this.roadblocks = [];

    // Chase: steer at the player, faster and more aggressive at 5 stars.
    var i;
    for (i = this.cars.length - 1; i >= 0; i--) {
      var car = this.cars[i];
      var tx = game.player.inCar ? game.player.inCar.x : game.player.x;
      var ty = game.player.inCar ? game.player.inCar.y : game.player.y;
      var dx = tx - car.x, dy = ty - car.y;
      var d = Math.hypot(dx, dy);
      var wantAngle = Math.atan2(dy, dx);
      var diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      var aggression = 1 + wanted * 0.12;
      car.angle += Math.max(-2.6 * aggression * dt, Math.min(2.6 * aggression * dt, diff));
      var top = car.model.topSpeed * (0.82 + wanted * 0.05);
      car.speed += (top - car.speed) * Math.min(1, dt * 1.2);
      var nx = car.x + Math.cos(car.angle) * car.speed * dt;
      var ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!game.world.collideBuildings(nx, ny, 22) && game.world.onWalkable(nx, ny)) {
        car.x = nx; car.y = ny;
      } else {
        car.speed *= 0.4;
        car.angle += 0.6 * dt;
      }

      // Ram the player's car: only a fast impact hurts, so a pile-up
      // grinds paint instead of totalling the player in two seconds.
      var pc = game.player.inCar;
      if (pc && Math.abs(car.speed) > 120 && Math.hypot(pc.x - car.x, pc.y - car.y) < 52) {
        pc.health -= 6 * dt;
        if (Math.abs(pc.speed) > 60) game.spawnSparks(pc.x, pc.y, 3, '#ffd94d');
        if (pc.health <= 0) game.onWasted();
      }

      // Close on foot: two officers bail out and chase.
      if (!game.player.inCar && d < 120 && this.officers.length < 2 && game.time % 1 < dt) {
        this.officers.push(new Officer(car.x + 20, car.y + 14));
        this.officers.push(new Officer(car.x - 20, car.y - 14));
      }

      // Despawn far-away units once the heat is gone.
      if (wanted === 0 && d > 900) this.cars.splice(i, 1);
    }

    for (i = this.officers.length - 1; i >= 0; i--) {
      var o = this.officers[i];
      o.update(dt, game);
      if (wanted === 0 && o.downTimer <= 0) this.officers.splice(i, 1);
      else if (o.health <= 0 && o.downTimer <= 0) { o.downTimer = 6; }
    }
  };

  Police.prototype.draw = function (ctx, cam) {
    var i;
    for (i = 0; i < this.roadblocks.length; i++) this.roadblocks[i].draw(ctx, cam);
    for (i = 0; i < this.cars.length; i++) this.cars[i].draw(ctx, cam);
    for (i = 0; i < this.officers.length; i++) this.officers[i].draw(ctx, cam);
    this.heli.draw(ctx, cam);
  };

  NH.Police = Police;
  NH.Officer = Officer;
  NH.Helicopter = Helicopter;
})(typeof window !== 'undefined' ? window : globalThis);
