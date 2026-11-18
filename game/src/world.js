// Neon Harbor — the city. A fixed seeded layout: roads on a grid, blocks filled with
// buildings by district (downtown towers, market shops, residential houses, a park,
// harbor warehouses), the harbor water along the south edge with docks.
import { WORLD, DISTRICTS } from './config.js';
import { makeRng, clamp } from './rng.js';

const PALETTES = {
  downtown: ['#312e81', '#1e3a8a', '#4c1d95', '#0f766e', '#7c2d12', '#334155'],
  market: ['#b45309', '#9a3412', '#a16207', '#7f1d1d', '#065f46', '#92400e'],
  residential: ['#78350f', '#854d0e', '#57534e', '#44403c', '#713f12', '#365314'],
  warehouse: ['#475569', '#64748b', '#57534e', '#44403c'],
};

export function districtAt(x, y) {
  if (x >= DISTRICTS.downtown.x0 && x <= DISTRICTS.downtown.x1 &&
      y >= DISTRICTS.downtown.y0 && y <= DISTRICTS.downtown.y1) return 'downtown';
  if (x >= DISTRICTS.park.x0 && x <= DISTRICTS.park.x1 &&
      y >= DISTRICTS.park.y0 && y <= DISTRICTS.park.y1) return 'park';
  if (x >= DISTRICTS.market.x0 && x <= DISTRICTS.market.x1 &&
      y >= DISTRICTS.market.y0 && y <= DISTRICTS.market.y1) return 'market';
  if (x >= DISTRICTS.residential.x0 && x <= DISTRICTS.residential.x1 &&
      y >= DISTRICTS.residential.y0 && y <= DISTRICTS.residential.y1) return 'residential';
  return 'mixed';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const containers = [];

  // Blocks are the rectangles between neighbouring roads.
  const xs = [0, ...WORLD.V_ROADS, WORLD.W];
  const ys = [0, ...WORLD.H_ROADS, WORLD.APRON_Y, WORLD.H];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + WORLD.ROAD_W / 2 + 14;
      const x1 = xs[bi + 1] - WORLD.ROAD_W / 2 - 14;
      const y0 = ys[bj] + WORLD.ROAD_W / 2 + 14;
      const y1 = ys[bj + 1] - WORLD.ROAD_W / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      if (d === 'park') {
        // Park: trees and paths, no buildings.
        const n = rng.int(10, 16);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(9, 15) });
        }
        continue;
      }
      if (cy > WORLD.APRON_Y) {
        // Harbor apron: long warehouses + stacked containers.
        const n = rng.int(1, 2);
        for (let i = 0; i < n; i++) {
          const w = rng.range(120, Math.min(260, x1 - x0 - 20));
          const h = rng.range(50, 80);
          buildings.push({
            x: rng.range(x0, x1 - w), y: rng.range(y0, y1 - h), w, h,
            color: rng.pick(PALETTES.warehouse), tall: false, district: 'warehouse',
            windows: 0, name: '',
          });
        }
        for (let i = 0; i < rng.int(4, 8); i++) {
          containers.push({ x: rng.range(x0, x1 - 46), y: rng.range(y0, y1 - 26), w: 46, h: 24, color: rng.pick(['#dc2626', '#2563eb', '#059669', '#d97706']) });
        }
        continue;
      }
      // Normal block: 1-3 buildings with a margin from the block edge.
      const palette = PALETTES[d] || PALETTES.market;
      const count = d === 'downtown' ? rng.int(1, 2) : rng.int(2, 3);
      const cols = count === 1 ? 1 : 2;
      const rows = Math.ceil(count / cols);
      const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
      for (let i = 0; i < count; i++) {
        const gx = x0 + (i % cols) * cw, gy = y0 + Math.floor(i / cols) * ch;
        const w = rng.range(cw * 0.45, cw * 0.8);
        const h = rng.range(ch * 0.45, ch * 0.8);
        const tall = d === 'downtown';
        buildings.push({
          x: gx + (cw - w) / 2, y: gy + (ch - h) / 2, w, h,
          color: rng.pick(palette), tall, district: d,
          windows: tall ? rng.int(6, 14) : rng.int(2, 5),
          name: '',
        });
      }
    }
  }

  // Named landmark towers downtown (drawn with a sign band).
  const bank = buildings.reduce((best, b) => {
    if (b.district !== 'downtown') return best;
    const d = Math.hypot(b.x + b.w / 2 - 1200, b.y + b.h / 2 - 800);
    return !best || d < best.d ? { b, d } : best;
  }, null);
  if (bank) { bank.b.name = 'HARBOR NATIONAL BANK'; bank.b.color = '#581c87'; }

  return { buildings, trees, containers };
}

// ---- collision / geography helpers ---------------------------------------

export function onRoad(x, y) {
  for (const rx of WORLD.V_ROADS) if (Math.abs(x - rx) < WORLD.ROAD_W / 2) return true;
  for (const ry of WORLD.H_ROADS) if (Math.abs(y - ry) < WORLD.ROAD_W / 2) return true;
  return false;
}

export function inWater(x, y) { return y >= WORLD.WATER_Y; }

export function nearestRoadPoint(x, y) {
  let bx = WORLD.V_ROADS[0], bd = Infinity;
  for (const rx of WORLD.V_ROADS) { const d = Math.abs(x - rx); if (d < bd) { bd = d; bx = rx; } }
  let by = WORLD.H_ROADS[0]; bd = Infinity;
  for (const ry of WORLD.H_ROADS) { const d = Math.abs(y - ry); if (d < bd) { bd = d; by = ry; } }
  // Return the closer road axis point.
  return Math.abs(x - bx) < Math.abs(y - by) ? { x: bx, y } : { x, y: by };
}

// Push a circle (x,y,r) out of every building and the water/bounds; returns true
// if any push happened. Mutates pos in place.
export function collideCircle(pos, r, city) {
  let hit = false;
  pos.x = clamp(pos.x, r + 4, WORLD.W - r - 4);
  pos.y = clamp(pos.y, r + 4, WORLD.H - r - 4);
  if (pos.y + r > WORLD.WATER_Y) { pos.y = WORLD.WATER_Y - r; hit = true; }
  for (const b of city.buildings) {
    const nx = clamp(pos.x, b.x, b.x + b.w);
    const ny = clamp(pos.y, b.y, b.y + b.h);
    const dx = pos.x - nx, dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest overlap axis.
        const l = pos.x - b.x, rr = b.x + b.w - pos.x, t = pos.y - b.y, bb = b.y + b.h - pos.y;
        const m = Math.min(l, rr, t, bb);
        if (m === l) pos.x = b.x - r; else if (m === rr) pos.x = b.x + b.w + r;
        else if (m === t) pos.y = b.y - r; else pos.y = b.y + b.h + r;
      }
    }
  }
  return hit;
}

// Is a point inside any building (used for spawn validation)?
export function insideBuilding(x, y, city) {
  for (const b of city.buildings) {
    if (x > b.x - 6 && x < b.x + b.w + 6 && y > b.y - 6 && y < b.y + b.h + 6) return true;
  }
  return false;
}
