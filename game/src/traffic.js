// Neon Harbor — traffic.js
// One job: the living city around the player. Traffic cars that drive
// the road grid (slow at intersections, turn at random) and pedestrians
// who walk the sidewalks and flee from danger. Counts are capped.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;

  function TrafficCar(car, world) {
    this.car = car;
    this.world = world;
    this.targetAngle = car.angle;
    this.turnTimer = 0;
    this.stopped = false;
  }

  TrafficCar.prototype.update = function (dt, game) {
    var c = this.car;
    if (c.wrecked || c.drivenByPlayer) return;
    this.turnTimer -= dt;

    // At an intersection, sometimes pick a new direction.
    var onV = false, onH = false, i;
    for (i = 0; i < this.world.verticalRoads.length; i++) {
      if (Math.abs(c.x - this.world.verticalRoads[i]) < 26) onV = true;
    }
    for (i = 0; i < this.world.horizontalRoads.length; i++) {
      if (Math.abs(c.y - this.world.horizontalRoads[i]) < 26) onH = true;
    }
    if (onV && onH && this.turnTimer <= 0) {
      this.turnTimer = 2.5;
      var r = game.rng;
      if (r.chance(0.4)) {
        var dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        this.targetAngle = r.pick(dirs);
      }
    }

    // Slow down for the car ahead and for the player crossing.
    var ahead = 70;
    var ax = c.x + Math.cos(c.angle) * ahead;
    var ay = c.y + Math.sin(c.angle) * ahead;
    this.stopped = false;
    var cars = game.allCars();
    for (i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === c) continue;
      if (Math.hypot(o.x - ax, o.y - ay) < 34) { this.stopped = true; break; }
    }
    var p = game.player;
    if (!p.inCar && Math.hypot(p.x - ax, p.y - ay) < 30) this.stopped = true;

    // Ease the heading toward the target angle.
    var diff = this.targetAngle - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));

    var want = this.stopped ? 0 : c.model.topSpeed * 0.45;
    c.speed += (want - c.speed) * Math.min(1, dt * 1.4);
    var nx = c.x + Math.cos(c.angle) * c.speed * dt;
    var ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!game.world.collideBuildings(nx, ny, 22) && game.world.onWalkable(nx, ny)) {
      c.x = nx; c.y = ny;
    } else {
      this.targetAngle = c.angle + Math.PI / 2;
      c.speed *= 0.3;
    }

    // Wrap around the city edges so traffic never runs dry.
    if (c.x < 60) c.x = CFG.worldWidth - 70;
    if (c.x > CFG.worldWidth - 60) c.x = 70;
    if (c.y < 60) c.y = CFG.worldHeight - 70;
    if (c.y > CFG.worldHeight - 60) c.y = 70;
  };

  function Pedestrian(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = rng.float(0, Math.PI * 2);
    this.speed = rng.float(40, 70);
    this.color = rng.pick(['#e8543f', '#3fa7d6', '#f2a03d', '#7d5ba6', '#4db38a', '#e86a92']);
    this.fleeing = false;
    this.downTimer = 0;
    this.walkCycle = rng.float(0, 6);
    this.retarget = rng.float(1, 4);
  }

  Pedestrian.prototype.update = function (dt, game) {
    if (this.downTimer > 0) { this.downTimer -= dt; return; }
    var p = game.player;
    var px = p.inCar ? p.inCar.x : p.x;
    var py = p.inCar ? p.inCar.y : p.y;
    var dx = this.x - px, dy = this.y - py;
    var d = Math.hypot(dx, dy);

    // Flee fast cars, gunfire and wanted heat.
    var danger = (p.inCar && Math.abs(p.inCar.speed) > 150 && d < 220) ||
      (game.wanted > 0 && d < 260) || (game.gunfireTimer > 0 && d < 300);
    this.fleeing = danger;
    if (danger && d > 1) {
      this.angle = Math.atan2(dy, dx);
      var sp = 150;
      this.x += Math.cos(this.angle) * sp * dt;
      this.y += Math.sin(this.angle) * sp * dt;
      this.walkCycle += dt * 14;
    } else {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        this.retarget = game.rng.float(1.5, 5);
        this.angle = game.rng.float(0, Math.PI * 2);
      }
      // Stay near sidewalks: drift back toward the nearest road.
      var rp = game.world.nearestRoadPoint(this.x, this.y);
      var rx = rp.x - this.x, ry = rp.y - this.y;
      var rd = Math.hypot(rx, ry);
      if (rd > 60) this.angle = Math.atan2(ry, rx);
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
      this.walkCycle += dt * 8;
    }
    this.x = Math.max(20, Math.min(CFG.worldWidth - 20, this.x));
    this.y = Math.max(20, Math.min(CFG.worldHeight - 20, this.y));
    if (game.world.collideBuildings(this.x, this.y, 8)) {
      this.x -= Math.cos(this.angle) * this.speed * dt * 2;
      this.y -= Math.sin(this.angle) * this.speed * dt * 2;
      this.angle += Math.PI / 2;
    }
  };

  Pedestrian.prototype.draw = function (ctx, cam) {
    var sx = this.x - cam.x, sy = this.y - cam.y;
    if (this.downTimer > 0) {
      // Knocked down: lying flat.
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, this.angle, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var bob = Math.sin(this.walkCycle) * 1.5;
    ctx.fillStyle = 'rgba(28,26,38,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 10, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.fillRect(-7, -6, 14, 12);
    ctx.fillStyle = '#22304a';
    ctx.fillRect(-10, -5, 5, 10);
    ctx.fillStyle = '#f2c98a';
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (this.fleeing) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', sx, sy - 16 + bob);
    }
  };

  function spawnTraffic(game) {
    var list = [];
    for (var i = 0; i < CFG.trafficCount; i++) {
      var p = game.world.randomRoadPoint(game.rng);
      var model = game.rng.pick(CFG.carModels.filter(function (m) { return m.name !== 'Patrol Cruiser' && m.name !== 'Box Truck'; }));
      var car = new NH.Car(model, p.x, p.y, p.angle);
      car.occupied = true;
      list.push(new TrafficCar(car, game.world));
    }
    return list;
  }

  function spawnPedestrians(game) {
    var list = [];
    for (var i = 0; i < CFG.pedestrianCount; i++) {
      var p = game.world.randomRoadPoint(game.rng);
      var x = p.x + game.rng.float(-60, 60);
      var y = p.y + game.rng.float(-60, 60);
      if (game.world.collideBuildings(x, y, 10) || game.world.isWater(x, y)) { i--; continue; }
      list.push(new Pedestrian(x, y, game.rng));
    }
    return list;
  }

  NH.TrafficCar = TrafficCar;
  NH.Pedestrian = Pedestrian;
  NH.spawnTraffic = spawnTraffic;
  NH.spawnPedestrians = spawnPedestrians;
})(typeof window !== 'undefined' ? window : globalThis);
