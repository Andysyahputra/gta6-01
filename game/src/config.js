// Neon Harbor — world constants, car models, districts and landmark spots.
// Everything here is invented for this game: no names, places or art from any
// commercial game.
export const WORLD = {
  W: 2400,
  H: 1800,
  SEED: 1337,
  ROAD_W: 84,
  // Vertical road centre-lines (x) and horizontal road centre-lines (y).
  V_ROADS: [200, 600, 1000, 1400, 1800, 2200],
  H_ROADS: [200, 600, 1000, 1400],
  // The harbor: water starts at this y; the apron with warehouses sits above it.
  WATER_Y: 1640,
  APRON_Y: 1440,
};

export const DISTRICTS = {
  downtown: { x0: 800, x1: 1600, y0: 400, y1: 1200 },
  market: { x0: 0, x1: 800, y0: 800, y1: 1440 },
  residential: { x0: 1600, x1: 2400, y0: 0, y1: 800 },
  park: { x0: 400, x1: 800, y0: 1000, y1: 1400 },
};

// Landmark spots (all on or beside roads so the player can reach them).
export const SPOTS = {
  spawn: { x: 1000, y: 300 },
  safehouse: { x: 2050, y: 300, name: 'Safehouse', color: '#4ade80' },
  garage: { x: 320, y: 1300, name: "Vera's Garage", color: '#facc15' },
  arms: { x: 700, y: 1520, name: 'Harbor Arms', color: '#f97316' },
  payphone: { x: 1500, y: 320, name: 'Cleaner Payphone', color: '#38bdf8' },
  bank: { x: 1200, y: 1000, name: 'Harbor National Bank', color: '#e879f9' },
  docks: { x: 1200, y: 1560, name: 'Harbor Docks', color: '#22d3ee' },
  coupeLot: { x: 1700, y: 950, name: 'Tower Lot', color: '#fb923c' },
  truckDepot: { x: 500, y: 1500, name: 'Truck Depot', color: '#a78bfa' },
};

// Invented car models: name, colour, top speed (units/s), acceleration, turn rate.
export const CAR_MODELS = {
  sedan: { name: 'Harbor Sedan', color: '#3b82f6', top: 330, accel: 260, turn: 2.6, w: 46, h: 22 },
  comet: { name: 'Comet GT', color: '#ef4444', top: 430, accel: 330, turn: 3.1, w: 46, h: 21 },
  coupe: { name: 'Sunset Coupe', color: '#f97316', top: 410, accel: 310, turn: 3.0, w: 46, h: 21 },
  taxi: { name: 'Harbor Taxi', color: '#facc15', top: 320, accel: 250, turn: 2.7, w: 46, h: 22 },
  truck: { name: 'Box Truck', color: '#e5e7eb', top: 240, accel: 170, turn: 1.9, w: 62, h: 26 },
  pickup: { name: 'Bay Pickup', color: '#22c55e', top: 340, accel: 270, turn: 2.5, w: 50, h: 23 },
  cruiser: { name: 'Patrol Cruiser', color: '#e2e8f0', top: 400, accel: 320, turn: 3.0, w: 48, h: 22 },
};

export const ECONOMY = {
  startCash: 50,
  missionPay: [200, 400, 700, 900, 1500],
  deliveryPay: 150,
  ammoPrice: 50,
  ammoRounds: 12,
  payphonePrice: 100,
  bustedLoss: 0.10,
  wastedLoss: 0.10,
};

export const SAVE_KEY = 'neon-harbor-save-v1';
