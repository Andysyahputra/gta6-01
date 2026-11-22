// Neon Harbor — the city: fixed road grid, seeded buildings, harbor,
// downtown towers, market, park and residential blocks. Collision helpers
// live here too so cars, the player and traffic all share one city.

import { WORLD_W, WORLD_H, PALETTE, LANDMARKS } from './config.js';
import { SeededRandom } from './rng.js';

export const ROAD_X = [200, 500, 800, 1100, 1400, 1700, 2000, 2250];
export const ROAD_Y = [150, 400, 650, 900, 1150, 1400, 1650];
export const ROAD_W = 92;

export function buildCity() {
  const rng = new SeededRandom(20261122);
  const buildings = [];
  const roofs = [PALETTE.buildingRoof, PALETTE.buildingRoof2, PALETTE.buildingRoof3, PALETTE.buildingRoof4, PALETTE.buildingRoof5];
  for (let ix = 0; ix < ROAD_X.length - 1; ix++) {
    for (let iy = 0; iy < ROAD_Y.length - 1; iy++) {
      const x0 = ROAD_X[ix] + ROAD_W / 2 + 14;
      const x1 = ROAD_X[ix + 1] - ROAD_W / 2 - 14;
      const y0 = ROAD_Y[iy] + ROAD_W / 2 + 14;
      const y1 = ROAD_Y[iy + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const downtown = Math.abs(cx - 1150) < 450 && Math.abs(cy - 780) < 350;
      const isPark = ix === 5 && iy === 4;
      if (isPark) continue;
      const n = downtown ? 1 : rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const w = downtown ? rng.float(150, 200) : rng.float(90, 150);
        const h = downtown ? rng.float(130, 180) : rng.float(80, 130);
        const bx = n === 1 ? cx : x0 + w / 2 + rng.float(0, Math.max(0, x1 - x0 - w));
        const by = n === 1 ? cy : y0 + h / 2 + rng.float(0, Math.max(0, y1 - y0 - h));
        buildings.push({ x: bx - w / 2, y: by - h / 2, w, h, roof: rng.pick(roofs), tall: downtown });
      }
    }
  }
  return { w: WORLD_W, h: WORLD_H, buildings, harborY: 1650, landmarks: LANDMARKS };
}

export function pointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

export function resolveCircleBuilding(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; }
      else { p.y = b.y - r; }
    }
  }
  return hit;
}

export function nearestRoadX(x) {
  let best = ROAD_X[0], bd = Infinity;
  for (const rx of ROAD_X) { const d = Math.abs(rx - x); if (d < bd) { bd = d; best = rx; } }
  return best;
}
export function nearestRoadY(y) {
  let best = ROAD_Y[0], bd = Infinity;
  for (const ry of ROAD_Y) { const d = Math.abs(ry - y); if (d < bd) { bd = d; best = ry; } }
  return best;
}
export function onRoad(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function drawCity(ctx, city, cam) {
  const { x: cx, y: cy, w: vw, h: vh } = cam;
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(cx - 40, cy - 40, vw + 80, vh + 80);
  ctx.fillStyle = PALETTE.grass;
  for (let ix = 0; ix < ROAD_X.length - 1; ix++) {
    for (let iy = 0; iy < ROAD_Y.length - 1; iy++) {
      const x0 = ROAD_X[ix] + ROAD_W / 2, y0 = ROAD_Y[iy] + ROAD_W / 2;
      const x1 = ROAD_X[ix + 1] - ROAD_W / 2, y1 = ROAD_Y[iy + 1] - ROAD_W / 2;
      if (x1 < cx || x0 > cx + vw || y1 < cy || y0 > cy + vh) continue;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(1700 + ROAD_W / 2, 1150 + ROAD_W / 2, 300 - ROAD_W, 250 - ROAD_W);
  ctx.fillStyle = PALETTE.parkTree;
  for (const [tx, ty] of [[1780, 1230], [1860, 1300], [1930, 1240], [1800, 1360], [1900, 1370]]) {
    ctx.beginPath(); ctx.arc(tx, ty, 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, 1650 + ROAD_W / 2, WORLD_W, WORLD_H - 1650 - ROAD_W / 2);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, 1720, WORLD_W, 10);
  ctx.fillStyle = PALETTE.dock;
  ctx.fillRect(300, 1660, 500, 26);
  ctx.fillRect(1500, 1660, 500, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('NEON HARBOR  •  DOCKS', 340, 1700);
  ctx.fillStyle = PALETTE.road;
  for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const ry of ROAD_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.fillStyle = PALETTE.roadLine;
  for (const rx of ROAD_X) for (let y = 0; y < WORLD_H; y += 56) ctx.fillRect(rx - 3, y, 6, 28);
  for (const ry of ROAD_Y) for (let x = 0; x < WORLD_W; x += 56) ctx.fillRect(x, ry - 3, 28, 6);
  ctx.strokeStyle = PALETTE.sidewalk;
  ctx.lineWidth = 10;
  for (const rx of ROAD_X) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_W / 2 - 5, 0); ctx.lineTo(rx - ROAD_W / 2 - 5, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2 + 5, 0); ctx.lineTo(rx + ROAD_W / 2 + 5, WORLD_H); ctx.stroke();
  }
  for (const b of city.buildings) {
    if (b.x + b.w < cx || b.x > cx + vw || b.y + b.h < cy || b.y > cy + vh) continue;
    ctx.fillStyle = '#00000033';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10);
    ctx.fillStyle = '#fff8d6';
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect(b.x + 12 + i * 30, b.y + 22 + j * 28, 14, 12);
    if (b.tall) { ctx.fillStyle = '#ffffffcc'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('TOWER', b.x + 10, b.y + 18); }
  }
  ctx.fillStyle = '#123';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('DOWNTOWN', 1020, 620);
  ctx.fillText('MARKET', 520, 1230);
  ctx.fillText('PALM PARK', 1760, 1210);
}
