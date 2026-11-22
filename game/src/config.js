// Neon Harbor — config.js
// One job: every tunable number, the sun-soaked palette, car models,
// mission payouts and landmark positions. Nothing else lives here.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});

  NH.config = {
    worldWidth: 2400,
    worldHeight: 1800,
    viewWidth: 1280,
    viewHeight: 720,

    // Golden-hour daylight palette: bright, warm, high contrast so the
    // game still reads when shrunk to a contact-sheet cell.
    palette: {
      grass: '#7ec850',
      grassAlt: '#74bd47',
      park: '#5da83c',
      sand: '#f2d492',
      road: '#3d3a4a',
      roadLine: '#ffd94d',
      sidewalk: '#d9c9a3',
      water: '#2fa8d8',
      waterDeep: '#1e7fb8',
      dock: '#8a6f4d',
      buildingRoof: ['#e8543f', '#f2a03d', '#3fa7d6', '#7d5ba6', '#e86a92', '#4db38a', '#f2d13d'],
      buildingWall: ['#ffd9c9', '#ffe9b8', '#cfe8ff', '#e3d4ff', '#ffc9d6', '#c9f0dd', '#fff3b0'],
      towerGlass: '#9fd8ef',
      player: '#ffcf3f',
      playerOutline: '#1c1a26',
      police: '#2b4bd8',
      policeLight: '#ff3b30',
      heli: '#2b2f38',
      marker: '#ffdf3d',
      text: '#1c1a26',
      hudBg: 'rgba(20, 18, 32, 0.72)',
      hudText: '#ffffff',
      gold: '#ffcf3f'
    },

    player: {
      walkSpeed: 170,
      runSpeed: 265,
      radius: 13,
      healthMax: 100,
      punchRange: 34,
      punchDamage: 25,
      punchCooldown: 0.45,
      shootCooldown: 0.28,
      pistolAmmoMax: 12,
      pistolDamage: 34,
      bulletSpeed: 640
    },

    carModels: [
      { name: 'Comet GT', color: '#e8543f', topSpeed: 430, accel: 300, grip: 3.4, len: 46, wid: 22 },
      { name: 'Sunset Coupe', color: '#f2a03d', topSpeed: 460, accel: 320, grip: 3.6, len: 44, wid: 21 },
      { name: 'Harbor Taxi', color: '#f2d13d', topSpeed: 360, accel: 260, grip: 3.1, len: 46, wid: 22 },
      { name: 'Box Truck', color: '#ff8a1a', topSpeed: 300, accel: 200, grip: 2.6, len: 62, wid: 26 },
      { name: 'Patrol Cruiser', color: '#2b4bd8', topSpeed: 440, accel: 330, grip: 3.8, len: 48, wid: 22 },
      { name: 'City Sedan', color: '#3fa7d6', topSpeed: 380, accel: 270, grip: 3.2, len: 45, wid: 22 },
      { name: 'Palm Convertible', color: '#e86a92', topSpeed: 400, accel: 290, grip: 3.3, len: 44, wid: 21 }
    ],

    trafficCount: 14,
    pedestrianCount: 26,
    maxPoliceCars: 5,

    wanted: {
      stealOccupied: 1,
      hitPedestrian: 1,
      shootPublic: 1,
      killPedestrian: 2,
      killOfficer: 2,
      damagePoliceCar: 1,
      coolDownSeconds: 9,
      hideBonusSeconds: 4
    },

    missions: [
      { id: 1, name: 'First Wheels', pay: 200,
        brief: 'Vera Kline: "New in town, Rex? Steal any car and bring it to my garage."',
        objective: 'Steal a car and drive it to the garage marker' },
      { id: 2, name: 'The Package', pay: 400,
        brief: 'Vera: "Take this pistol. Grab my package at the harbor docks and bring it back."',
        objective: 'Pick up the package at the docks, then return to Vera' },
      { id: 3, name: 'Harbor Heist', pay: 700,
        brief: 'Vera: "A Sunset Coupe is parked by the downtown towers. Lift it and bring it to the docks."',
        objective: 'Steal the Sunset Coupe downtown and deliver it to the docks' },
      { id: 4, name: 'Clean Getaway', pay: 900,
        brief: 'Vera: "Heat is on you, three stars. Lose the cops and get to the safehouse."',
        objective: 'Lose your 3-star wanted level and reach the safehouse' },
      { id: 5, name: 'Sunset Fare', pay: 600,
        brief: 'Vera: "A fare is waiting at the market. Pick them up and beat the clock to the beach hotel."',
        objective: 'Pick up the fare at the market, then reach the beach hotel in time' },
      { id: 6, name: 'Vigilante Sweep', pay: 800,
        brief: 'Vera: "A getaway driver is tearing up Palm Row. Ram his car three times to stop him."',
        objective: 'Ram the getaway car 3 times' },
      { id: 7, name: 'The Big Score', pay: 1500,
        brief: 'Vera: "The bank vault is open for twenty seconds. Grab the cash, then vanish to the safehouse."',
        objective: 'Drive the box truck to the bank, hold the vault, escape to the safehouse' }
    ],

    // Fixed landmark spots (world coordinates).
    landmarks: {
      safehouse: { x: 320, y: 1240, label: 'Safehouse' },
      garage: { x: 1080, y: 760, label: 'Vera\'s Garage' },
      gunShop: { x: 1520, y: 420, label: 'Harbor Arms' },
      bank: { x: 1480, y: 760, label: 'Harbor Bank' },
      docks: { x: 1150, y: 1690, label: 'Harbor Docks' },
      market: { x: 620, y: 420, label: 'Market Square' },
      beachHotel: { x: 2050, y: 1560, label: 'Beach Hotel' },
      park: { x: 760, y: 1080, label: 'Palm Park' },
      cleaner: { x: 1900, y: 1080, label: 'Cleaner Phone' },
      downtownLot: { x: 1520, y: 1080, label: 'Tower Lot' }
    },

    prices: { ammoRefill: 50, ammoRounds: 12, cleaner: 150, deliveryPay: 150 },
    saveKey: 'neon-harbor-save-v3'
  };
})(typeof window !== 'undefined' ? window : globalThis);
