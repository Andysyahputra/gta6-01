// Neon Harbor — shared constants, palette and vehicle definitions.
// Sun-soaked golden-hour look: bright warm ground, saturated buildings,
// deep blue harbor water, so the game reads clearly even shrunk small.

export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const SAVE_KEY = 'neon-harbor-save-v1';

export const PALETTE = {
  grass: '#8fc25e',
  sand: '#f2d38a',
  road: '#4a4a55',
  roadLine: '#ffe9a8',
  sidewalk: '#d9c9a3',
  water: '#2f7fc9',
  waterDeep: '#1f5fa8',
  dock: '#a9805a',
  buildingRoof: '#e2703a',
  buildingRoof2: '#3fa7a0',
  buildingRoof3: '#e8b13c',
  buildingRoof4: '#7a5fc0',
  buildingRoof5: '#d94f6a',
  park: '#5da24a',
  parkTree: '#2f7a33',
};

export const CAR_MODELS = {
  comet:   { name: 'Comet GT',       color: '#e8384f', topSpeed: 430, accel: 300, grip: 3.4, len: 46, wid: 22 },
  taxi:    { name: 'Harbor Taxi',    color: '#ffc21c', topSpeed: 360, accel: 260, grip: 3.0, len: 44, wid: 22 },
  cruiser: { name: 'Patrol Cruiser', color: '#27408b', topSpeed: 400, accel: 290, grip: 3.3, len: 46, wid: 22 },
  truck:   { name: 'Box Truck',      color: '#e8e4da', topSpeed: 300, accel: 200, grip: 2.4, len: 62, wid: 26 },
  coupe:   { name: 'Sunset Coupe',   color: '#ff7a1a', topSpeed: 450, accel: 320, grip: 3.6, len: 44, wid: 21 },
  sedan:   { name: 'Harbor Sedan',   color: '#3fa7a0', topSpeed: 350, accel: 250, grip: 3.0, len: 44, wid: 22 },
  hatch:   { name: 'Bay Hatch',      color: '#7a5fc0', topSpeed: 340, accel: 250, grip: 3.1, len: 40, wid: 21 },
};

export const CAR_COLORS = ['#e8384f', '#3fa7a0', '#ffc21c', '#7a5fc0', '#d94f6a', '#2f8f5b', '#e8e4da', '#ff7a1a'];

export const LANDMARKS = {
  safehouse: { x: 330, y: 300, label: 'Safehouse' },
  garage:    { x: 2050, y: 300, label: 'Garage' },
  armsShop:  { x: 1150, y: 1250, label: 'Harbor Arms' },
  bank:      { x: 1150, y: 780, label: 'Harbor Bank' },
  harbor:    { x: 1150, y: 1680, label: 'Harbor Docks' },
  downtown:  { x: 1150, y: 780, label: 'Downtown' },
  market:    { x: 600, y: 1250, label: 'Market' },
  park:      { x: 1750, y: 1250, label: 'Palm Park' },
  yacht:     { x: 1700, y: 1680, label: 'Yacht Marina' },
  towerLot:  { x: 1400, y: 650, label: 'Tower Lot' },
};
