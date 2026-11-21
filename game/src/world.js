// Neon Harbor — the city: seeded grid layout, districts, landmarks, collision,
// and top-down rendering. The layout is fixed by seed so every run matches.
import {
  WORLD_W, WORLD_H, ROAD_W, ROAD_HALF, VERTICAL_ROADS, HORIZONTAL_ROADS,
  WATER_TOP, SIDEWALK, COLORS, clamp,
} from './config.js';
import { Rng } from './rng.js';

const ROOF_COLORS = ['#5a5f73', '#6b5a73', '#4f6b5a', '#715a4f', '#54506b', '#7a6a4f', '#46586e'];
const TOWER_COLORS = ['#3d4257', '#4a3d57', '#37424f', '#51455a'];

export function buildWorld(seed) {
  const rng = new Rng(seed);
  const buildings = []; // {x,y,w,h,color,roof,windows:[{dx,dy,lit}],tower}
  const trees = []; // {x,y,r}
  const stalls = []; // market stalls {x,y,w,h,color}
  const containers = []; // harbor containers {x,y,w,h,color}

  // Block bounds between roads (with world edges as outer bounds).
  const xs = [0, ...VERTICAL_ROADS, WORLD_W];
  const ys = [0, ...HORIZONTAL_ROADS, WATER_TOP];

  // Named landmarks (fixed positions so missions can rely on them).
  // Defined BEFORE buildings so no building can cover a mission point.
  const landmarks = {
    safehouse: { x: 430, y: 430, label: 'Safehouse', color: '#3fae6a' },
    garage: { x: 2060, y: 1300, label: 'Garage', color: '#f2a230' },
    arms: { x: 1700, y: 1570, label: 'Harbor Arms', color: '#c84fd0' },
    bank: { x: 1230, y: 430, label: 'Harbor Bank', color: '#f2e230' },
    payphone: { x: 742, y: 330, label: 'Cleaner', color: '#39b8c8' },
    vera: { x: 2060, y: 1240, label: "Vera's Garage", color: '#f2a230' },
    harborPickup: { x: 1000, y: 1710, label: 'Package', color: '#ffd76a' },
    docks: { x: 1500, y: 1710, label: 'Docks', color: '#ffd76a' },
    coupeSpot: { x: 1230, y: 830, label: 'Sunset Coupe', color: '#ff7a2f' },
    truckSpot: { x: 1360, y: 520, label: 'Box Truck', color: '#c8ccd4' },
    park: { x: 500, y: 1300, label: 'Palm Park', color: '#3fae6a' },
    market: { x: 900, y: 900, label: 'Night Market', color: '#c84f4f' },
  };
  // Keep-clear zones around every landmark so the player can always stand
  // and drive on the mission points.
  const CLEAR = Object.values(landmarks).map((lm) => ({ x: lm.x - 70, y: lm.y - 70, w: 140, h: 140 }));
  const clearOfLandmarks = (x, y, w, h) =>
    !CLEAR.some((c) => x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y);

  // Special blocks by (col,row): park (0,2), market (1,1), downtown towers (2,0),(3,0),(2,1).
  const special = { '0,2': 'park', '1,1': 'market', '2,0': 'downtown', '3,0': 'downtown', '2,1': 'downtown' };

  for (let c = 0; c < xs.length - 1; c++) {
    for (let r = 0; r < ys.length - 1; r++) {
      const bx0 = xs[c] + ROAD_HALF + SIDEWALK + 10;
      const by0 = ys[r] + ROAD_HALF + SIDEWALK + 10;
      const bx1 = xs[c + 1] - ROAD_HALF - SIDEWALK - 10;
      const by1 = ys[r + 1] - ROAD_HALF - SIDEWALK - 10;
      if (bx1 - bx0 < 60 || by1 - by0 < 60) continue;
      const kind = special[`${c},${r}`] || 'normal';
      if (kind === 'park') {
        for (let i = 0; i < 26; i++) trees.push({ x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20), r: rng.range(9, 15) });
        continue;
      }
      if (kind === 'market') {
        for (let i = 0; i < 8; i++) {
          stalls.push({ x: rng.range(bx0 + 20, bx1 - 50), y: rng.range(by0 + 20, by1 - 30), w: 34, h: 22, color: rng.pick(['#c84f4f', '#4f8ac8', '#c8a24f', '#6ac84f']) });
        }
        continue;
      }
      const n = kind === 'downtown' ? 2 : rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const w = kind === 'downtown' ? rng.range(90, 130) : rng.range(70, 150);
        const h = kind === 'downtown' ? rng.range(90, 130) : rng.range(60, 120);
        const x = rng.range(bx0, Math.max(bx0 + 1, bx1 - w));
        const y = rng.range(by0, Math.max(by0 + 1, by1 - h));
        if (!clearOfLandmarks(x, y, w, h)) continue; // never cover a mission point
        const color = kind === 'downtown' ? rng.pick(TOWER_COLORS) : rng.pick(ROOF_COLORS);
        const b = { x, y, w, h, color, tower: kind === 'downtown', windows: [] };
        const cols = Math.max(1, Math.floor(w / 26));
        const rows = Math.max(1, Math.floor(h / 26));
        for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
          b.windows.push({ dx: 12 + cx * 26, dy: 12 + cy * 26, lit: rng.chance(0.45) });
        }
        buildings.push(b);
      }
    }
  }

  // Harbor containers along the dock road.
  const contColors = ['#b0503c', '#3c6ab0', '#4fae5a', '#b08a3c'];
  for (let i = 0; i < 10; i++) {
    containers.push({ x: 420 + i * 150 + (i % 3) * 8, y: 1560 + (i % 2) * 34, w: 64, h: 26, color: contColors[i % 4] });
  }

  // Piers reaching into the water (walkable/drivable).
  const piers = [
    { x: 960, y: 1640, w: 80, h: 130 },
    { x: 1460, y: 1640, w: 80, h: 130 },
  ];

  return { buildings, trees, stalls, containers, landmarks, piers, rng };
}

// Is a point on a road (or sidewalk)?
export function onRoad(x, y) {
  for (const rx of VERTICAL_ROADS) if (Math.abs(x - rx) <= ROAD_HALF + SIDEWALK) return true;
  for (const ry of HORIZONTAL_ROADS) if (Math.abs(y - ry) <= ROAD_HALF + SIDEWALK) return true;
  return false;
}
export function inWater(x, y) { return y >= WATER_TOP; }

// Resolve a circle (x,y,r) against buildings, containers, water and world
// bounds. Returns the corrected position and whether it hit something.
export function collideCircle(world, x, y, r, obstacles) {
  let hit = false;
  const list = obstacles || world.buildings.concat(world.containers);
  for (const b of list) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; y = cy + (dy / d) * r;
      } else {
        // centre inside the rect: push out along the smallest overlap
        const l = x - b.x, rr = b.x + b.w - x, t = y - b.y, bb = b.y + b.h - y;
        const m = Math.min(l, rr, t, bb);
        if (m === l) x = b.x - r; else if (m === rr) x = b.x + b.w + r;
        else if (m === t) y = b.y - r; else y = b.y + b.h + r;
      }
    }
  }
  // Water blocks movement (except on piers).
  if (y + r > WATER_TOP) {
    const onPier = world.piers.some((p) => x > p.x - 4 && x < p.x + p.w + 4 && y > p.y);
    if (!onPier) { y = WATER_TOP - r; hit = true; }
  }
  if (x < r) { x = r; hit = true; }
  if (x > WORLD_W - r) { x = WORLD_W - r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (y > WORLD_H - r) { y = WORLD_H - r; hit = true; }
  return { x, y, hit };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Circle vs rect test used by cars (returns overlap depth on each axis).
export function circleRectHit(x, y, r, b) {
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

// ---- Rendering ----
export function drawWorld(ctx, world, cam, viewW, viewH, time) {
  const x0 = cam.x - viewW / 2 - 80, y0 = cam.y - viewH / 2 - 80;
  const x1 = cam.x + viewW / 2 + 80, y1 = cam.y + viewH / 2 + 80;
  // Ground.
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Park block.
  ctx.fillStyle = COLORS.parkGrass;
  ctx.fillRect(332, 1132, 336, 336);
  // Sidewalks.
  ctx.fillStyle = COLORS.sidewalk;
  for (const rx of VERTICAL_ROADS) ctx.fillRect(rx - ROAD_HALF - SIDEWALK, Math.max(y0, 0), ROAD_W + SIDEWALK * 2, Math.min(y1, WATER_TOP) - Math.max(y0, 0));
  for (const ry of HORIZONTAL_ROADS) ctx.fillRect(Math.max(x0, 0), ry - ROAD_HALF - SIDEWALK, Math.min(x1, WORLD_W) - Math.max(x0, 0), ROAD_W + SIDEWALK * 2);
  // Roads.
  ctx.fillStyle = COLORS.road;
  for (const rx of VERTICAL_ROADS) ctx.fillRect(rx - ROAD_HALF, Math.max(y0, 0), ROAD_W, Math.min(y1, WATER_TOP) - Math.max(y0, 0));
  for (const ry of HORIZONTAL_ROADS) ctx.fillRect(Math.max(x0, 0), ry - ROAD_HALF, Math.min(x1, WORLD_W) - Math.max(x0, 0), ROAD_W);
  // Lane dashes.
  ctx.fillStyle = COLORS.lane;
  for (const rx of VERTICAL_ROADS) {
    for (let y = Math.max(0, Math.floor(y0 / 44) * 44); y < Math.min(WATER_TOP, y1); y += 44) ctx.fillRect(rx - 2, y, 4, 22);
  }
  for (const ry of HORIZONTAL_ROADS) {
    for (let x = Math.max(0, Math.floor(x0 / 44) * 44); x < Math.min(WORLD_W, x1); x += 44) ctx.fillRect(x, ry - 2, 22, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = '#d8d8d8';
  for (const rx of VERTICAL_ROADS) for (const ry of HORIZONTAL_ROADS) {
    for (let i = -3; i <= 3; i++) ctx.fillRect(rx + i * 9 - 3, ry - ROAD_HALF - 10, 6, 8);
  }
  // Water + beach.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(Math.max(x0, 0), WATER_TOP - 16, Math.min(x1, WORLD_W) - Math.max(x0, 0), 16);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(Math.max(x0, 0), WATER_TOP, Math.min(x1, WORLD_W) - Math.max(x0, 0), Math.min(y1, WORLD_H) - WATER_TOP);
  ctx.fillStyle = COLORS.waterDeep;
  for (let x = Math.max(0, Math.floor(x0 / 180) * 180); x < Math.min(WORLD_W, x1); x += 180) {
    const wob = Math.sin(time * 0.001 + x * 0.01) * 3;
    ctx.fillRect(x, WATER_TOP + 60 + wob, 90, 3);
    ctx.fillRect(x + 40, WATER_TOP + 120 - wob, 70, 3);
  }
  // Piers.
  ctx.fillStyle = '#6b5a44';
  for (const p of world.piers) ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#7d6a52';
  for (const p of world.piers) for (let y = p.y + 8; y < p.y + p.h; y += 22) ctx.fillRect(p.x + 4, y, p.w - 8, 3);
  // Trees.
  for (const t of world.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#1f4d2a'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f7a44'; ctx.beginPath(); ctx.arc(t.x - 2, t.y - 2, t.r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  // Market stalls.
  for (const s of world.stalls) {
    if (!rectsOverlap(s.x, s.y, s.w, s.h, x0, y0, x1 - x0, y1 - y0)) continue;
    ctx.fillStyle = '#3a2c22'; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, s.w, 10);
  }
  // Containers.
  for (const c of world.containers) {
    if (!rectsOverlap(c.x, c.y, c.w, c.h, x0, y0, x1 - x0, y1 - y0)) continue;
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 4; i++) ctx.fillRect(c.x + i * 16, c.y + 3, 2, c.h - 6);
  }
  // Buildings (roof + lit windows, towers get a dusk shadow).
  for (const b of world.buildings) {
    if (!rectsOverlap(b.x, b.y, b.w, b.h, x0, y0, x1 - x0, y1 - y0)) continue;
    if (b.tower) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h); }
    ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(b.x, b.y, b.w, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    for (const w of b.windows) {
      ctx.fillStyle = w.lit ? COLORS.windowLit : COLORS.windowDark;
      ctx.fillRect(b.x + w.dx, b.y + w.dy, 9, 9);
    }
  }
  // Landmark labels (small, drawn in-world).
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const key of ['park', 'market']) {
    const lm = world.landmarks[key];
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(lm.x - 44, lm.y - 10, 88, 18);
    ctx.fillStyle = '#e8f0d8'; ctx.fillText(lm.label, lm.x, lm.y + 3);
  }
  ctx.textAlign = 'left';
}
