// Neon Harbor — shared constants: world size, road grid, car models, tuning.
// Everything original: fictional city, invented vehicles, no borrowed names.
export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 64; // road width in world units
export const ROAD_HALF = ROAD_W / 2;
export const VERTICAL_ROADS = [300, 700, 1100, 1500, 1900];
export const HORIZONTAL_ROADS = [300, 700, 1100, 1500];
export const WATER_TOP = 1640; // harbor water starts here (south edge)
export const SIDEWALK = 14; // sidewalk strip beside each road

// Car models: invented names, each with its own top speed and handling.
export const CAR_MODELS = {
  comet:    { name: 'Comet GT',      color: '#e33f5f', topSpeed: 520, accel: 560, turn: 2.5, len: 46, wid: 22 },
  taxi:     { name: 'Harbor Taxi',   color: '#f2c230', topSpeed: 430, accel: 480, turn: 2.6, len: 46, wid: 22 },
  coupe:    { name: 'Sunset Coupe',  color: '#ff7a2f', topSpeed: 570, accel: 620, turn: 2.7, len: 48, wid: 22 },
  cruiser:  { name: 'Patrol Cruiser',color: '#2f6fd0', topSpeed: 490, accel: 600, turn: 2.8, len: 48, wid: 23 },
  truck:    { name: 'Box Truck',     color: '#c8ccd4', topSpeed: 340, accel: 380, turn: 1.9, len: 62, wid: 26 },
  sedan:    { name: 'Marlin Sedan',  color: '#7a5fd0', topSpeed: 450, accel: 500, turn: 2.5, len: 46, wid: 22 },
  pickup:   { name: 'Dune Pickup',   color: '#3fae6a', topSpeed: 460, accel: 520, turn: 2.4, len: 48, wid: 23 },
  hatch:    { name: 'Pip Hatch',     color: '#39b8c8', topSpeed: 410, accel: 470, turn: 2.7, len: 40, wid: 20 },
};

export const TRAFFIC_MODELS = ['taxi', 'sedan', 'pickup', 'hatch', 'comet', 'coupe'];
export const MAX_PEDS = 40;
export const MAX_TRAFFIC = 14;
export const WANTED_MAX = 5;
export const PLAYER_WALK = 150;
export const PLAYER_RUN = 250;
export const PLAYER_RADIUS = 13;
export const PISTOL_AMMO_MAX = 12;
export const PISTOL_PRICE = 50;
export const CLEANER_PRICE_PER_STAR = 100;
export const GARAGE_DELIVERY_PAY = 150;
export const SAVE_KEY = 'neon-harbor-save-v1';

// District colours (dusk palette).
export const COLORS = {
  grass: '#2c4630',
  parkGrass: '#35603a',
  road: '#23242c',
  roadEdge: '#3a3b46',
  sidewalk: '#4a4b57',
  lane: '#c9a13b',
  water: '#123a5c',
  waterDeep: '#0d2c48',
  sand: '#8a7a55',
  buildingRoof: '#5a5f73',
  windowLit: '#ffd76a',
  windowDark: '#2b2e3a',
};

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
