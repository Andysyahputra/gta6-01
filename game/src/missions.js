// Neon Harbor — missions.js
// One job: Vera Kline's mission chain (7 missions) plus the free-roam
// car-delivery side job. Each mission is a small stage machine: a target
// marker, a condition, and a payout. Completing one unlocks the next.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;
  var L = CFG.landmarks;

  function Missions(game) {
    this.game = game;
    this.index = 0;              // 0-based mission; 7 = chain done
    this.stage = 0;
    this.timer = 0;
    this.holdTimer = 0;
    this.hits = 0;
    this.targetCar = null;
    this.banner = null;
    this.bannerTimer = 0;
    this.deliveryCar = null;
    this.message = null;
    this.messageTimer = 0;
  }

  Missions.prototype.current = function () {
    return CFG.missions[this.index] || null;
  };

  Missions.prototype.isDone = function () {
    return this.index >= CFG.missions.length;
  };

  Missions.prototype.startMission = function (idx) {
    this.index = idx;
    this.stage = 0;
    this.timer = 0;
    this.holdTimer = 0;
    this.hits = 0;
    this.targetCar = null;
    var m = this.current();
    if (!m) return;
    this.showMessage(m.brief, 5);
    if (m.id === 2) {
      this.game.player.hasPistol = true;
      this.game.player.ammo = CFG.player.pistolAmmoMax;
    }
    if (m.id === 4) this.game.setWanted(3, 'mission');
    if (m.id === 6) this.spawnGetawayCar();
    if (m.id === 7) this.spawnTruck();
    this.game.save();
  };

  Missions.prototype.spawnGetawayCar = function () {
    var model = CFG.carModels.filter(function (mm) { return mm.name === 'Comet GT'; })[0];
    var car = new NH.Car(model, 1750, 950, 0);
    car.occupied = true;
    car.isTarget = true;
    this.targetCar = car;
    this.game.extraCars.push(car);
  };

  Missions.prototype.spawnTruck = function () {
    var model = CFG.carModels.filter(function (mm) { return mm.name === 'Box Truck'; })[0];
    var car = new NH.Car(model, L.safehouse.x + 90, L.safehouse.y + 20, 0);
    car.occupied = false;
    car.isTarget = true;
    this.targetCar = car;
    this.game.extraCars.push(car);
  };

  Missions.prototype.showMessage = function (text, seconds) {
    this.message = text;
    this.messageTimer = seconds || 4;
  };

  Missions.prototype.showBanner = function (text, seconds) {
    this.banner = text;
    this.bannerTimer = seconds || 3.5;
  };

  // Where should the minimap/HUD marker point right now?
  Missions.prototype.targetPoint = function () {
    var game = this.game;
    var m = this.current();
    if (!m) {
      // Free roam: garage delivery marker if carrying a car.
      if (game.player.inCar) return { x: L.garage.x, y: L.garage.y, label: 'Garage — deliver for $150' };
      return { x: L.garage.x, y: L.garage.y, label: 'Garage' };
    }
    switch (m.id) {
      case 1: return { x: L.garage.x, y: L.garage.y, label: 'Garage' };
      case 2: return this.stage === 0
        ? { x: L.docks.x, y: L.docks.y, label: 'Package at the docks' }
        : { x: L.garage.x, y: L.garage.y, label: 'Return to Vera' };
      case 3: return this.stage === 0
        ? { x: L.downtownLot.x, y: L.downtownLot.y, label: 'Sunset Coupe' }
        : { x: L.docks.x, y: L.docks.y, label: 'Deliver to the docks' };
      case 4: return { x: L.safehouse.x, y: L.safehouse.y, label: 'Safehouse' };
      case 5: return this.stage === 0
        ? { x: L.market.x, y: L.market.y, label: 'Fare at the market' }
        : { x: L.beachHotel.x, y: L.beachHotel.y, label: 'Beach Hotel' };
      case 6: return this.targetCar
        ? { x: this.targetCar.x, y: this.targetCar.y, label: 'Getaway car' }
        : { x: L.garage.x, y: L.garage.y, label: 'Garage' };
      case 7: return this.stage === 0
        ? { x: L.bank.x, y: L.bank.y, label: 'Harbor Bank' }
        : { x: L.safehouse.x, y: L.safehouse.y, label: 'Escape to the safehouse' };
    }
    return { x: L.garage.x, y: L.garage.y, label: 'Garage' };
  };

  Missions.prototype.near = function (x, y, radius) {
    var p = this.game.player;
    var px = p.inCar ? p.inCar.x : p.x;
    var py = p.inCar ? p.inCar.y : p.y;
    return Math.hypot(px - x, py - y) < radius;
  };

  Missions.prototype.completeMission = function () {
    var game = this.game;
    var m = this.current();
    if (!m) return;
    game.cash += m.pay;
    this.showBanner('MISSION COMPLETE — ' + m.name + '   +$' + m.pay, 4);
    game.audio.payout();
    this.index++;
    this.stage = 0;
    this.timer = 0;
    if (this.targetCar) { this.targetCar.isTarget = false; this.targetCar = null; }
    if (this.isDone()) {
      this.showMessage('NEON HARBOR KING — Vera: "The city is yours now, Rex. Free roam: deliver cars to the garage for $150 each."', 8);
      game.king = true;
    } else {
      this.startMission(this.index);
    }
    game.save();
  };

  Missions.prototype.failMission = function (reason) {
    var game = this.game;
    this.showMessage('MISSION FAILED — ' + reason + '. Vera: "Shake it off. Try again."', 4);
    this.stage = 0;
    this.timer = 0;
    this.holdTimer = 0;
    if (this.current() && this.current().id === 4) game.setWanted(3, 'mission');
    if (this.current() && this.current().id === 6) this.spawnGetawayCar();
    game.save();
  };

  // Called every frame by main.js.
  Missions.prototype.update = function (dt) {
    var game = this.game;
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.bannerTimer <= 0) this.banner = null;
    if (this.messageTimer <= 0) this.message = null;

    var m = this.current();
    if (!m) { this.updateFreeRoam(dt); return; }
    var p = game.player;

    if (m.id === 1) {
      if (p.inCar && this.near(L.garage.x, L.garage.y, 90)) this.completeMission();
    } else if (m.id === 2) {
      if (this.stage === 0) {
        if (this.near(L.docks.x, L.docks.y, 80)) {
          this.stage = 1;
          this.showMessage('Package grabbed! Get it back to Vera — the cops noticed.', 4);
          game.setWanted(1, 'mission');
        }
      } else if (this.near(L.garage.x, L.garage.y, 90)) this.completeMission();
    } else if (m.id === 3) {
      if (this.stage === 0) {
        // The Sunset Coupe waits in the downtown lot; stealing it starts the run.
        if (!this.targetCar) {
          var model = CFG.carModels.filter(function (mm) { return mm.name === 'Sunset Coupe'; })[0];
          var car = new NH.Car(model, L.downtownLot.x, L.downtownLot.y, Math.PI / 2);
          car.occupied = false; car.isTarget = true;
          this.targetCar = car;
          game.extraCars.push(car);
        }
        if (p.inCar === this.targetCar) {
          this.stage = 1;
          this.showMessage('Coupe lifted! Deliver it to the docks — stay out of sight.', 4);
        }
      } else if (p.inCar === this.targetCar && this.near(L.docks.x, L.docks.y, 90)) {
        this.completeMission();
      }
    } else if (m.id === 4) {
      if (game.wanted === 0 && this.near(L.safehouse.x, L.safehouse.y, 90)) this.completeMission();
    } else if (m.id === 5) {
      if (this.stage === 0) {
        if (p.inCar && this.near(L.market.x, L.market.y, 80)) {
          this.stage = 1;
          this.timer = 75;
          this.showMessage('Fare aboard! 75 seconds to the Beach Hotel — step on it.', 4);
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) { this.failMission('Out of time'); return; }
        if (p.inCar && this.near(L.beachHotel.x, L.beachHotel.y, 90)) this.completeMission();
      }
    } else if (m.id === 6) {
      if (this.targetCar) {
        // The getaway car flees along the roads; ramming it counts a hit.
        var t = this.targetCar;
        var tx = p.inCar ? p.inCar.x : p.x;
        var ty = p.inCar ? p.inCar.y : p.y;
        t.angle += Math.sin(game.time * 0.7) * 0.4 * dt;
        t.speed = 300;
        var nx = t.x + Math.cos(t.angle) * t.speed * dt;
        var ny = t.y + Math.sin(t.angle) * t.speed * dt;
        if (!game.world.collideBuildings(nx, ny, 22) && game.world.onWalkable(nx, ny)) { t.x = nx; t.y = ny; }
        else t.angle += Math.PI / 2;
        if (p.inCar && Math.hypot(t.x - tx, t.y - ty) < 60 && game.time - (this.lastHitAt || -99) > 1.2) {
          this.lastHitAt = game.time;
          this.hits++;
          game.audio.bump();
          game.spawnSparks(t.x, t.y, 8, '#ffd94d');
          this.showMessage('Hit ' + this.hits + ' of 3!', 1.5);
          if (this.hits >= 3) { t.wrecked = true; this.completeMission(); }
        }
      }
    } else if (m.id === 7) {
      if (this.stage === 0) {
        if (!this.targetCar) this.spawnTruck();
        var truck = this.targetCar;
        if (p.inCar === truck && this.near(L.bank.x, L.bank.y, 100)) {
          this.stage = 1;
          this.holdTimer = 20;
          this.showMessage('Vault open! Hold the bank for 20 seconds while the cops close in.', 4);
          game.setWanted(3, 'mission');
        }
      } else {
        this.holdTimer -= dt;
        if (this.holdTimer <= 0) {
          this.stage = 2;
          this.showMessage('Cash grabbed! Lose the heat and reach the safehouse.', 4);
        }
        if (this.stage === 2 && this.near(L.safehouse.x, L.safehouse.y, 90)) this.completeMission();
      }
    }
  };

  // After the chain: any stolen car delivered to the garage pays $150.
  Missions.prototype.updateFreeRoam = function (dt) {
    var game = this.game;
    var p = game.player;
    if (p.inCar && !p.inCar.isPolice && this.near(L.garage.x, L.garage.y, 90)) {
      var car = p.inCar;
      game.exitCar();
      game.removeCar(car);
      game.cash += CFG.prices.deliveryPay;
      this.showBanner('CAR DELIVERED   +$' + CFG.prices.deliveryPay, 3);
      game.audio.payout();
      game.save();
    }
  };

  NH.Missions = Missions;
})(typeof window !== 'undefined' ? window : globalThis);
