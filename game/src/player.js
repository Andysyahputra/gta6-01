// Neon Harbor — player.js
// One job: Rex Marlowe on foot. Walk/run, punch, shoot the pistol,
// steal and enter/exit cars, health and ammo. Driving lives in cars.js.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;

  function Player(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.radius = CFG.player.radius;
    this.health = CFG.player.healthMax;
    this.ammo = 0;
    this.hasPistol = false;
    this.inCar = null;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.punchAnim = 0;
    this.hurtTimer = 0;
    this.lastDamageAt = -99;
    this.walkCycle = 0;
    this.moving = false;
  }

  Player.prototype.reset = function (x, y) {
    this.x = x; this.y = y;
    this.health = CFG.player.healthMax;
    this.inCar = null;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtTimer = 0;
  };

  Player.prototype.update = function (dt, game) {
    var input = game.input;
    var P = CFG.player;

    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchAnim = Math.max(0, this.punchAnim - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    // Slow health regen when out of combat for a while.
    if (game.time - this.lastDamageAt > 8 && this.health > 0 && this.health < P.healthMax) {
      this.health = Math.min(P.healthMax, this.health + 4 * dt);
    }

    // Riding in a car: the car module moves us; we only exit here.
    if (this.inCar) {
      this.x = this.inCar.x;
      this.y = this.inCar.y;
      this.angle = this.inCar.angle;
      if (input.wasPressed('e')) game.exitCar();
      return;
    }

    var mx = input.moveX();
    var my = input.moveY();
    var len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (this.moving) {
      var run = input.down('shift');
      var speed = run ? P.runSpeed : P.walkSpeed;
      mx /= len; my /= len;
      this.angle = Math.atan2(my, mx);
      this.walkCycle += dt * (run ? 14 : 9);
      var nx = this.x + mx * speed * dt;
      var ny = this.y + my * speed * dt;
      this.tryMove(nx, ny, game);
    }

    // Aim at the mouse when the pistol is out.
    if (this.hasPistol) {
      var wx = game.camera.x + input.mouseX;
      var wy = game.camera.y + input.mouseY;
      var dx = wx - this.x, dy = wy - this.y;
      if (dx * dx + dy * dy > 4) this.angle = Math.atan2(dy, dx);
    }

    if (input.wasPressed('e')) game.tryEnterCar();
    if (input.wasPressed('f')) this.punch(game);
    if ((input.wasPressed(' ') || input.mouseClicked) && this.hasPistol) this.shoot(game);
  };

  Player.prototype.tryMove = function (nx, ny, game) {
    var world = game.world;
    // Axis-separated so Rex slides along walls instead of sticking.
    if (world.onWalkable(nx, this.y) && !world.collideBuildings(nx, this.y, this.radius)) this.x = nx;
    if (world.onWalkable(this.x, ny) && !world.collideBuildings(this.x, ny, this.radius)) this.y = ny;
    this.x = Math.max(20, Math.min(CFG.worldWidth - 20, this.x));
    this.y = Math.max(20, Math.min(CFG.worldHeight - 20, this.y));
  };

  Player.prototype.punch = function (game) {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = CFG.player.punchCooldown;
    this.punchAnim = 0.22;
    game.audio.punch();
    var px = this.x + Math.cos(this.angle) * CFG.player.punchRange;
    var py = this.y + Math.sin(this.angle) * CFG.player.punchRange;
    var hit = game.hitNearestPedestrian(px, py, 30, CFG.player.punchDamage);
    if (!hit) hit = game.hitNearestOfficer(px, py, 30, CFG.player.punchDamage);
    if (hit) game.addWanted(1, 'punch');
    game.spawnSparks(px, py, 5, '#ffffff');
  };

  Player.prototype.shoot = function (game) {
    if (this.shootCooldown > 0 || this.ammo <= 0) {
      if (this.ammo <= 0) game.audio.clickEmpty();
      return;
    }
    this.shootCooldown = CFG.player.shootCooldown;
    this.ammo--;
    game.audio.gunshot();
    game.addWanted(1, 'shoot');
    var wx = game.camera.x + game.input.mouseX;
    var wy = game.camera.y + game.input.mouseY;
    var a = Math.atan2(wy - this.y, wx - this.x);
    game.bullets.push({
      x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20,
      vx: Math.cos(a) * CFG.player.bulletSpeed, vy: Math.sin(a) * CFG.player.bulletSpeed,
      life: 0.9, fromPlayer: true, damage: CFG.player.pistolDamage
    });
    game.spawnSparks(this.x + Math.cos(a) * 22, this.y + Math.sin(a) * 22, 4, '#ffe066');
  };

  Player.prototype.takeDamage = function (amount, game) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.hurtTimer = 0.35;
    this.lastDamageAt = game.time;
    if (this.health <= 0) {
      this.health = 0;
      game.onWasted();
    }
  };

  Player.prototype.draw = function (ctx, cam) {
    if (this.inCar) return;
    var sx = this.x - cam.x, sy = this.y - cam.y;
    var bob = this.moving ? Math.sin(this.walkCycle) * 2 : 0;

    // Shadow.
    ctx.fillStyle = 'rgba(28,26,38,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 11, 11, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Body: teal jacket, dark jeans, golden hair — reads at small sizes.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.hurtTimer > 0 ? '#ff6b5e' : '#1f8a70';
    ctx.fillRect(-9, -8 + bob * 0.3, 18, 16);
    ctx.fillStyle = '#22304a';
    ctx.fillRect(-12, -7, 7, 14);
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath(); ctx.arc(10, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1a26';
    ctx.fillRect(13, -4, 6, 8);
    if (this.hasPistol) {
      ctx.fillStyle = '#2b2f38';
      ctx.fillRect(12, 3, 14, 4);
    }
    if (this.punchAnim > 0) {
      ctx.fillStyle = '#ffd9c9';
      ctx.beginPath(); ctx.arc(20, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Health pips above Rex when hurt.
    if (this.health < CFG.player.healthMax) {
      ctx.fillStyle = 'rgba(20,18,32,0.7)';
      ctx.fillRect(sx - 16, sy - 26, 32, 5);
      ctx.fillStyle = this.health > 40 ? '#57d977' : '#ff5347';
      ctx.fillRect(sx - 15, sy - 25, 30 * (this.health / CFG.player.healthMax), 3);
    }
  };

  NH.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
