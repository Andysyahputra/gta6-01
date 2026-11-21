// Neon Harbor — Vera Kline's 5-mission story chain, then free roam with paid
// car deliveries. Each mission has a briefing, a minimap marker and a payout.
import { GARAGE_DELIVERY_PAY } from './config.js';
import { Car } from './entities.js';
import { dist2 } from './config.js';

const MISSIONS = [
  {
    id: 1, name: 'First Wheels', pay: 200,
    briefing: 'Vera Kline: "New in town, huh? Everybody needs wheels. Steal any car and bring it to my garage."',
    objective: 'Steal a car and bring it to the garage',
  },
  {
    id: 2, name: 'The Package', pay: 400,
    briefing: 'Vera Kline: "Take this pistol — you will need it. Pick up my package at the harbor docks and bring it back. The harbor police are nosy."',
    objective: 'Pick up the package at the harbor',
  },
  {
    id: 3, name: 'Harbor Heist', pay: 700,
    briefing: 'Vera Kline: "A Sunset Coupe is parked by the downtown towers. Lift it and deliver it to the docks. Do not get spotted."',
    objective: 'Steal the Sunset Coupe downtown',
  },
  {
    id: 4, name: 'Clean Getaway', pay: 900,
    briefing: 'Vera Kline: "Three stars on you, Rex. Lose them and get to the safehouse. Do not stop for anyone."',
    objective: 'Lose the heat — reach the safehouse',
  },
  {
    id: 5, name: 'The Big Score', pay: 1500,
    briefing: 'Vera Kline: "The big one. Take the box truck to Harbor Bank, grab the cash, hold the line, then vanish to the safehouse. You pull this off, you run this city."',
    objective: 'Take the box truck to Harbor Bank',
  },
];

export class MissionChain {
  constructor(g) {
    this.g = g; // game context: player, world, traffic, police, audio, hooks
    this.index = 0; // 0-based mission index; 5 = all done (free roam)
    this.stage = 0;
    this.timer = 0;
    this.active = false;
    this.hasPackage = false;
    this.missionCar = null; // special car for missions 3 and 5
    this.holdout = 0;
    this.completedCount = 0;
    this.startPos = null; // where the current mission was started
    this.leftStart = false; // true once the player drove/walked away from it
  }
  get done() { return this.index >= MISSIONS.length; }
  get current() { return MISSIONS[this.index] || null; }
  objectiveText() {
    if (this.done) return 'Free Roam — deliver stolen cars to the garage ($150 each)';
    const m = this.current;
    if (m.id === 2 && this.stage === 1) return 'Bring the package back to Vera at the garage';
    if (m.id === 3 && this.stage === 1) return 'Deliver the Sunset Coupe to the docks — stay unseen';
    if (m.id === 5 && this.stage === 1) return 'Reach Harbor Bank in the box truck';
    if (m.id === 5 && this.stage === 2) return `Hold the bank! Survive ${Math.ceil(this.holdout)}s`;
    if (m.id === 5 && this.stage === 3) return 'Escape to the safehouse with the cash';
    return m.objective;
  }
  targetPos() {
    const L = this.g.world.landmarks;
    if (this.done) return L.garage;
    const m = this.current;
    if (m.id === 1) return L.garage;
    if (m.id === 2) return this.stage === 0 ? L.harborPickup : L.vera;
    if (m.id === 3) return this.stage === 0 ? L.coupeSpot : L.docks;
    if (m.id === 4) return L.safehouse;
    if (m.id === 5) {
      if (this.stage === 0) return L.truckSpot;
      if (this.stage === 1) return L.bank;
      if (this.stage === 2) return L.bank;
      return L.safehouse;
    }
    return L.garage;
  }
  start() {
    if (this.done || this.active) return;
    const m = this.current;
    this.active = true; this.stage = 0; this.timer = 0;
    this.startPos = this.g.missionStartPos();
    this.leftStart = false;
    this.g.showBriefing(m.name, m.briefing);
    this.g.audio.pickup();
    if (m.id === 2 && !this.g.player.pistol) {
      this.g.player.pistol = true;
      this.g.player.ammo = 12;
    }
    if (m.id === 3) {
      const L = this.g.world.landmarks;
      const c = new Car('coupe', L.coupeSpot.x, L.coupeSpot.y, 0);
      c.driver = 'parked'; c.isMissionCar = true;
      this.g.traffic.parked.push(c);
      this.missionCar = c;
    }
    if (m.id === 4) this.g.setWanted(3);
    if (m.id === 5) {
      const L = this.g.world.landmarks;
      const c = new Car('truck', L.truckSpot.x, L.truckSpot.y, Math.PI / 2);
      c.driver = 'parked'; c.isMissionCar = true;
      this.g.traffic.parked.push(c);
      this.missionCar = c;
    }
  }
  complete() {
    const m = this.current;
    const pay = m.pay;
    this.g.player.cash += pay;
    this.completedCount++;
    this.g.audio.cash();
    this.g.showBanner(`MISSION COMPLETE — ${m.name}  +$${pay}`);
    this.index++;
    this.active = false; this.stage = 0; this.hasPackage = false;
    this.missionCar = null;
    this.startPos = null; this.leftStart = false;
    this.g.saveGame();
    if (this.done) {
      this.g.showBanner('NEON HARBOR KING — free roam! Deliver cars to the garage for $150 each.');
      this.g.king = true;
    }
  }
  near(x, y, r) {
    const p = this.g.player.pos();
    return dist2(p.x, p.y, x, y) < r * r;
  }
  update(dt) {
    if (!this.active || this.done) return;
    const m = this.current;
    const L = this.g.world.landmarks;
    const player = this.g.player;
    // The player must leave the start area before a return-to-start mission
    // can complete, so starting on top of the target never auto-completes it.
    if (this.startPos) {
      const p = player.pos();
      if (dist2(p.x, p.y, this.startPos.x, this.startPos.y) > 260 * 260) this.leftStart = true;
    }
    if (m.id === 1) {
      if (this.leftStart && player.inCar && this.near(L.garage.x, L.garage.y, 110)) this.complete();
    } else if (m.id === 2) {
      if (this.stage === 0 && this.near(L.harborPickup.x, L.harborPickup.y, 70)) {
        this.stage = 1; this.hasPackage = true;
        this.g.setWanted(1);
        this.g.audio.pickup();
        this.g.showBanner('Package secured — get back to Vera!');
      } else if (this.stage === 1 && this.leftStart && this.near(L.vera.x, L.vera.y, 110)) this.complete();
    } else if (m.id === 3) {
      if (this.stage === 0 && player.inCar === this.missionCar) {
        this.stage = 1;
        this.g.addWanted(1);
        this.g.showBanner('Spotted! Get the Coupe to the docks!');
      } else if (this.stage === 1 && player.inCar === this.missionCar && this.near(L.docks.x, L.docks.y, 110)) {
        this.complete();
      }
    } else if (m.id === 4) {
      if (this.leftStart && this.near(L.safehouse.x, L.safehouse.y, 110)) this.complete();
    } else if (m.id === 5) {
      if (this.stage === 0 && player.inCar === this.missionCar) {
        this.stage = 1;
        this.g.showBanner('Truck secured — drive to Harbor Bank!');
      } else if (this.stage === 1 && player.inCar === this.missionCar && this.near(L.bank.x, L.bank.y, 110)) {
        this.stage = 2; this.holdout = 20;
        this.g.setWanted(4);
        this.g.showBanner('Grab the cash! Hold out while the HPD closes in!');
      } else if (this.stage === 2) {
        this.holdout -= dt;
        if (this.holdout <= 0) {
          this.stage = 3;
          this.g.showBanner('Cash grabbed! Escape to the safehouse!');
        }
      } else if (this.stage === 3 && this.leftStart && this.near(L.safehouse.x, L.safehouse.y, 110)) {
        this.complete();
      }
    }
  }
  // Free-roam delivery: any stolen car brought to the garage pays $150.
  tryDelivery() {
    if (!this.done) return false;
    const player = this.g.player;
    const L = this.g.world.landmarks;
    if (player.inCar && !player.inCar.delivered && this.near(L.garage.x, L.garage.y, 110)) {
      player.inCar.delivered = true;
      player.cash += GARAGE_DELIVERY_PAY;
      this.g.audio.cash();
      this.g.showBanner(`Car delivered  +$${GARAGE_DELIVERY_PAY}`);
      return true;
    }
    return false;
  }
}
