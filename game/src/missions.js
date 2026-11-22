// Neon Harbor — the story: 7 missions from fixer Vera Kline, one at a
// time, each with a briefing, a blinking marker and a payout. After the
// chain, free roam with $150 car deliveries to the garage.

import { LANDMARKS } from './config.js';
import { createCar } from './cars.js';

export const MISSION_LIST = [
  { id: 1, name: 'First Wheels', pay: 200, brief: 'VERA: Rex, you need wheels. Steal any car and bring it to the garage on the east side.' },
  { id: 2, name: 'The Package', pay: 400, brief: 'VERA: Take this pistol. Fetch my package at the harbor docks and bring it back. Cops will notice.' },
  { id: 3, name: 'Harbor Heist', pay: 700, brief: 'VERA: A Sunset Coupe sits in the downtown tower lot. Lift it and deliver it to the docks. Quietly.' },
  { id: 4, name: 'Clean Getaway', pay: 900, brief: 'VERA: You are hot — 3 stars. Lose the heat and reach the safehouse. Do not get caught.' },
  { id: 5, name: 'Sunset Taxi', pay: 600, brief: 'VERA: My client waits at the market. Pick him up in a taxi and get him downtown before the clock runs out.' },
  { id: 6, name: 'The Big Score', pay: 1500, brief: 'VERA: Drive the box truck to Harbor Bank, grab the cash, hold out while the cops close in, then run for the safehouse.' },
  { id: 7, name: 'Neon Harbor King', pay: 2000, brief: 'VERA: Last job, Rex. Lose a 5-star chase and bring a Comet GT to the yacht marina. Then this city is yours.' },
];

export class MissionSystem {
  constructor(G) {
    this.G = G;
    this.index = 0; // 0-based into MISSION_LIST; 7 = free roam
    this.stage = 0;
    this.target = null;
    this.timer = 0;
    this.holdout = 0;
    this.banner = '';
    this.bannerTimer = 0;
    this.active = false;
    this.targetCar = null;
    this.deliveries = 0;
    this.setupCurrent();
  }
  current() { return MISSION_LIST[this.index] || null; }
  objectiveText() {
    const m = this.current();
    if (!m) return 'FREE ROAM — deliver any car to the garage for $150';
    const t = this.target;
    const where = t ? t.label : '';
    if (this.index === 0) return `M1 First Wheels: bring any car to the Garage`;
    if (this.index === 1) return this.stage === 0 ? `M2 The Package: pick up at Harbor Docks` : `M2 The Package: return to the Safehouse`;
    if (this.index === 2) return this.stage === 0 ? `M3 Harbor Heist: steal the Sunset Coupe (${where})` : `M3 Harbor Heist: deliver the Coupe to the Docks`;
    if (this.index === 3) return `M4 Clean Getaway: lose the heat, reach the Safehouse`;
    if (this.index === 4) return this.stage === 0 ? `M5 Sunset Taxi: pick up the client at the Market (${Math.ceil(this.timer)}s)` : `M5 Sunset Taxi: deliver him Downtown (${Math.ceil(this.timer)}s)`;
    if (this.index === 5) return this.stage === 0 ? `M6 The Big Score: drive the truck to Harbor Bank` : this.stage === 1 ? `M6 The Big Score: HOLD OUT ${Math.ceil(this.holdout)}s!` : `M6 The Big Score: escape to the Safehouse`;
    if (this.index === 6) return `M7 Neon Harbor King: lose 5 stars, bring a Comet GT to the Yacht Marina`;
    return m.name;
  }
  setupCurrent() {
    const G = this.G;
    const L = LANDMARKS;
    this.stage = 0; this.timer = 0; this.holdout = 0; this.targetCar = null;
    this.active = this.index < MISSION_LIST.length;
    if (!this.active) { this.target = { x: L.garage.x, y: L.garage.y, label: 'Garage — $150 per car' }; return; }
    switch (this.index) {
      case 0: this.target = { x: L.garage.x, y: L.garage.y, label: 'Garage' }; break;
      case 1: this.target = { x: L.harbor.x, y: L.harbor.y, label: 'Harbor Docks' }; G.player.hasPistol = true; G.player.ammo = 12; break;
      case 2: {
        this.target = { x: L.towerLot.x, y: L.towerLot.y, label: 'Tower Lot' };
        const c = createCar('coupe', L.towerLot.x, L.towerLot.y, 0, { parked: true, driver: false });
        this.targetCar = c; G.cars.push(c);
        break;
      }
      case 3: this.target = { x: L.safehouse.x, y: L.safehouse.y, label: 'Safehouse' }; G.setWanted(3, 'mission heat'); break;
      case 4: this.target = { x: L.market.x, y: L.market.y, label: 'Market pickup' }; this.timer = 75; break;
      case 5: {
        this.target = { x: L.bank.x, y: L.bank.y, label: 'Harbor Bank' };
        const c = createCar('truck', 900, 900, 0, { parked: true, driver: false });
        this.targetCar = c; G.cars.push(c);
        break;
      }
      case 6: this.target = { x: L.yacht.x, y: L.yacht.y, label: 'Yacht Marina' }; G.setWanted(5, 'final heat'); break;
      default: this.target = { x: L.garage.x, y: L.garage.y, label: 'Garage' };
    }
    const m = this.current();
    if (m) this.showBanner(`${m.name} — ${m.brief}`);
  }
  showBanner(text) { this.banner = text; this.bannerTimer = 6; }
  completeMission() {
    const G = this.G;
    const m = this.current();
    if (!m) return;
    G.player.cash += m.pay;
    G.audio.cash();
    this.showBanner(`MISSION COMPLETE: ${m.name} — +$${m.pay}`);
    G.addFloatText(G.player.x, G.player.y - 40, `+$${m.pay}`, '#7be0a3');
    G.saveGame();
    this.index++;
    if (this.index >= MISSION_LIST.length) {
      this.showBanner('NEON HARBOR KING — Rex owns this city. Free roam: deliver cars to the garage for $150.');
      G.king = true;
    }
    this.setupCurrent();
  }
  atTarget(d = 70) {
    const p = this.G.player.inCar || this.G.player;
    return this.target && Math.hypot(p.x - this.target.x, p.y - this.target.y) < d;
  }
  update(dt) {
    const G = this.G;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (!this.active) {
      // Free roam deliveries
      if (G.player.inCar && this.atTarget(80)) {
        const car = G.player.inCar;
        G.player.cash += 150; this.deliveries++;
        G.audio.cash();
        this.showBanner(`Car delivered! +$150 (deliveries: ${this.deliveries})`);
        G.cars = G.cars.filter((c) => c !== car);
        G.player.inCar = null;
        G.saveGame();
      }
      return;
    }
    if (this.index === 4 && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.showBanner('Too slow! The client walked away. Mission reset.'); this.setupCurrent(); return; }
    }
    if (this.index === 5 && this.stage === 1) {
      this.holdout -= dt;
      if (this.holdout <= 0) { this.stage = 2; this.target = { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, label: 'Safehouse' }; this.showBanner('Cash grabbed! Now escape to the safehouse!'); }
      return;
    }
    if (!this.atTarget()) return;
    switch (this.index) {
      case 0:
        if (G.player.inCar) this.completeMission();
        break;
      case 1:
        if (this.stage === 0) {
          this.stage = 1; this.target = { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, label: 'Safehouse' };
          G.setWanted(1, 'package pickup'); G.audio.pickup();
          this.showBanner('Package secured! Get back to the safehouse — cops are coming.');
        } else this.completeMission();
        break;
      case 2:
        if (this.stage === 0) {
          if (G.player.inCar && G.player.inCar === this.targetCar) {
            this.stage = 1; this.target = { x: LANDMARKS.harbor.x, y: LANDMARKS.harbor.y, label: 'Harbor Docks' };
            G.addWanted(1, 'stolen coupe spotted');
            this.showBanner('Coupe stolen! Deliver it to the docks.');
          }
        } else if (G.player.inCar === this.targetCar) this.completeMission();
        break;
      case 3:
        if (G.wanted === 0) this.completeMission();
        else this.showBanner('Still hot! Lose the stars first — stay out of sight.');
        break;
      case 4:
        if (this.stage === 0) {
          this.stage = 1; this.target = { x: LANDMARKS.downtown.x, y: LANDMARKS.downtown.y, label: 'Downtown' };
          this.timer = 75; this.showBanner('Client aboard! Downtown, fast!');
        } else this.completeMission();
        break;
      case 5:
        if (this.stage === 0) {
          if (G.player.inCar && G.player.inCar === this.targetCar) {
            this.stage = 1; this.holdout = 12; G.setWanted(3, 'bank alarm');
            this.showBanner('Alarm tripped! Hold out 12 seconds!');
          }
        } else if (this.stage === 2) this.completeMission();
        break;
      case 6:
        if (G.wanted === 0 && G.player.inCar && G.player.inCar.modelKey === 'comet') this.completeMission();
        else if (G.wanted > 0) this.showBanner('Still 5 stars! Lose the heat first, then bring a Comet GT here.');
        else this.showBanner('Bring a Comet GT to the marina to finish!');
        break;
      default: break;
    }
  }
  drawMarker(ctx, t) {
    if (!this.target) return;
    const pulse = 1 + Math.sin(t * 5) * 0.15;
    const { x, y, label } = this.target;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffdd33';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 26 * pulse);
    ctx.lineTo(16 * pulse, -6);
    ctx.lineTo(0, -26 * pulse);
    ctx.lineTo(-16 * pulse, -6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#111';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.strokeText(label, 20, -18);
    ctx.fillText(label, 20, -18);
    ctx.restore();
  }
}
