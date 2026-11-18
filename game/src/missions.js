// Neon Harbor — Vera Kline's mission chain (5 missions) and the free-roam
// car-delivery job that opens up after the last one. Each mission has stages,
// a blinking marker, a briefing, and a cash payout.
import { SPOTS, ECONOMY } from './config.js';
import { dist } from './rng.js';

export const MISSION_DEFS = [
  {
    name: 'First Wheels',
    briefing: 'VERA: "New in town, huh? First rule of Neon Harbor: wheels. Steal any car and bring it to my garage."',
    pay: ECONOMY.missionPay[0],
  },
  {
    name: 'The Package',
    briefing: 'VERA: "Take this pistol — you\'ll need it. Pick up a package at the docks and bring it back. Cops will be sniffing."',
    pay: ECONOMY.missionPay[1],
  },
  {
    name: 'Harbor Heist',
    briefing: 'VERA: "A Sunset Coupe is sitting in the Tower Lot downtown. Lift it clean and deliver it to the docks. Get spotted and the job is burned."',
    pay: ECONOMY.missionPay[2],
  },
  {
    name: 'Clean Getaway',
    briefing: 'VERA: "Three stars and every cruiser in the city is on you. Lose them. Get to the safehouse and the heat dies."',
    pay: ECONOMY.missionPay[3],
  },
  {
    name: 'The Big Score',
    briefing: 'VERA: "The big one. Take the box truck, hit Harbor National Bank, hold the lobby while they close in, then vanish. Do this and you run this city."',
    pay: ECONOMY.missionPay[4],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.completed = 0;       // missions finished
    this.current = null;      // active mission state
    this.freeRoam = false;
    this.deliveryCd = 0;
    this.briefing = null;     // { title, text, t }
    this.banner = null;       // { text, sub, t }
    this.titleScreen = null;  // set after mission 5
  }

  get active() { return this.current; }

  objectiveText() {
    if (this.titleScreen) return 'Free Roam — Neon Harbor King';
    if (!this.current) return this.freeRoam ? 'Free Roam — deliver cars to the garage ($150)' : 'No active mission';
    return this.current.objective;
  }

  startMission(i) {
    const def = MISSION_DEFS[i];
    const g = this.game;
    this.current = {
      index: i, name: def.name, stage: 0, objective: '', marker: null,
      timer: 0, holdout: 0, carId: null, pickupT: 0,
    };
    this.briefing = { title: `MISSION ${i + 1} — ${def.name}`, text: def.briefing, t: 6 };
    g.audio.pickup();
    if (i === 1) {
      g.player.hasPistol = true;
      g.player.ammo = ECONOMY.ammoRounds;
      g.hudMessage('Pistol received — 12 rounds');
    }
    if (i === 2) g.ensureCoupeAtLot();
    if (i === 3) { g.police.wanted = 3; g.hudMessage('3 stars! Lose the cops!'); }
    if (i === 4) g.ensureTruckAtDepot();
    this.setStage(0);
  }

  setStage(stage) {
    const m = this.current;
    if (!m) return;
    m.stage = stage;
    const g = this.game;
    switch (m.index) {
      case 0:
        if (stage === 0) { m.objective = 'Steal any car (walk up, press E)'; m.marker = null; }
        else { m.objective = 'Drive the car to Vera\'s Garage'; m.marker = { ...SPOTS.garage, label: 'GARAGE' }; }
        break;
      case 1:
        if (stage === 0) { m.objective = 'Drive to the Harbor Docks'; m.marker = { ...SPOTS.docks, label: 'DOCKS' }; }
        else if (stage === 1) { m.objective = 'Picking up the package…'; m.marker = { ...SPOTS.docks, label: 'DOCKS' }; }
        else { m.objective = 'Package secured! Return to the Garage'; m.marker = { ...SPOTS.garage, label: 'GARAGE' }; }
        break;
      case 2:
        if (stage === 0) { m.objective = 'Steal the Sunset Coupe at the Tower Lot'; m.marker = { ...SPOTS.coupeLot, label: 'SUNSET COUPE' }; }
        else { m.objective = 'Deliver the Coupe to the Docks — stay clean!'; m.marker = { ...SPOTS.docks, label: 'DOCKS' }; }
        break;
      case 3:
        m.objective = 'Lose the heat — reach the Safehouse';
        m.marker = { ...SPOTS.safehouse, label: 'SAFEHOUSE' };
        break;
      case 4:
        if (stage === 0) { m.objective = 'Get the Box Truck at the Depot'; m.marker = { ...SPOTS.truckDepot, label: 'BOX TRUCK' }; }
        else if (stage === 1) { m.objective = 'Drive the truck to the Bank'; m.marker = { ...SPOTS.bank, label: 'BANK' }; }
        else if (stage === 2) { m.objective = 'HOLD THE BANK — stay in the zone!'; m.marker = { ...SPOTS.bank, label: 'BANK' }; }
        else { m.objective = 'Cash grabbed! Escape to the Safehouse'; m.marker = { ...SPOTS.safehouse, label: 'SAFEHOUSE' }; }
        break;
    }
  }

  update(dt) {
    const g = this.game;
    if (this.briefing) { this.briefing.t -= dt; if (this.briefing.t <= 0) this.briefing = null; }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.deliveryCd > 0) this.deliveryCd -= dt;
    const m = this.current;
    if (!m) { this.freeRoamDelivery(); return; }
    const p = g.player;
    const car = g.playerCar;

    const at = (spot, r) => dist(p.x, p.y, spot.x, spot.y) < r;
    switch (m.index) {
      case 0:
        if (m.stage === 0 && car) this.setStage(1);
        else if (m.stage === 1 && car && at(SPOTS.garage, 100)) this.complete();
        break;
      case 1:
        if (m.stage === 0 && at(SPOTS.docks, 100)) { this.setStage(1); m.pickupT = 1.2; }
        else if (m.stage === 1) {
          m.pickupT -= dt;
          if (m.pickupT <= 0) {
            this.setStage(2);
            g.police.addWanted(1, 'package');
            g.hudMessage('Package secured — cops incoming!');
            g.audio.cash();
          }
        } else if (m.stage === 2 && at(SPOTS.garage, 100)) this.complete();
        break;
      case 2:
        if (m.stage === 0 && car && car.model === 'coupe' && car.id === g.missionCarId) this.setStage(1);
        else if (m.stage === 1) {
          if (g.police.wanted >= 3) { this.fail('Spotted! The crew burned the job.'); return; }
          if (car && car.id === g.missionCarId && at(SPOTS.docks, 100)) this.complete();
        }
        break;
      case 3:
        if (at(SPOTS.safehouse, 110)) {
          g.police.clearWanted();
          this.complete();
        }
        break;
      case 4:
        if (m.stage === 0 && car && car.model === 'truck' && car.id === g.missionCarId) this.setStage(1);
        else if (m.stage === 1 && car && car.model === 'truck' && at(SPOTS.bank, 110)) {
          this.setStage(2);
          m.holdout = 20;
          g.police.wanted = Math.max(g.police.wanted, 4);
          g.hudMessage('Hold the bank! 20 seconds!');
        } else if (m.stage === 2) {
          m.holdout -= dt;
          if (!at(SPOTS.bank, 130)) { m.holdout = 20; g.hudMessage('Get back in the bank zone!'); }
          else if (m.holdout <= 0) {
            this.setStage(3);
            g.audio.cash();
            g.hudMessage('Cash grabbed! RUN!');
          }
        } else if (m.stage === 3 && at(SPOTS.safehouse, 110)) this.complete();
        break;
    }
    this.freeRoamDelivery();
  }

  freeRoamDelivery() {
    const g = this.game;
    if (!this.freeRoam || !g.playerCar || this.deliveryCd > 0) return;
    if (dist(g.player.x, g.player.y, SPOTS.garage.x, SPOTS.garage.y) < 100) {
      const car = g.playerCar;
      g.earnCash(ECONOMY.deliveryPay);
      g.removePlayerCar(car);
      this.deliveryCd = 5;
      g.hudMessage(`Car delivered! +$${ECONOMY.deliveryPay}`);
      g.audio.cash();
    }
  }

  complete() {
    const g = this.game;
    const m = this.current;
    const pay = MISSION_DEFS[m.index].pay;
    g.earnCash(pay);
    this.completed = m.index + 1;
    this.banner = { text: `MISSION COMPLETE — ${m.name}`, sub: `+$${pay}`, t: 3.5 };
    g.audio.missionDone();
    g.police.calmTimer = 0;
    this.current = null;
    g.saveGame();
    if (this.completed >= 5) {
      this.freeRoam = true;
      this.titleScreen = { t: 6 };
      g.hudMessage('Free Roam — deliver cars to the garage for $150');
    } else {
      this.startMission(this.completed);
    }
  }

  fail(reason) {
    const g = this.game;
    const idx = this.current.index;
    this.current = null;
    g.hudMessage(reason);
    g.audio.denied();
    this.startMission(idx);
  }

  restartCurrent() {
    if (!this.current) return;
    const idx = this.current.index;
    this.current = null;
    this.startMission(idx);
  }
}
