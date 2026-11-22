// Neon Harbor — world.js
// One job: the deterministic city. Road grid, blocks, buildings, the
// harbor, park, landmarks and collision. Layout comes only from a seeded
// RNG, so the same seed always builds the same city.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;

  var ROAD_HALF = 34;          // half-width of a road
  var WALK_HALF = 46;          // road + sidewalk half-width

  function World(seed) {
    this.seed = seed;
    this.rng = new NH.SeededRng(seed);
    this.verticalRoads = [150, 550, 950, 1350, 1750, 2150];
    this.horizontalRoads = [150, 550, 950, 1350, 1650];
    this.buildings = [];
    this.trees = [];
    this.palms = [];
    this.buildCity();
  }

  World.prototype.buildCity = function () {
    var rng = this.rng;
    var pal = CFG.palette;
    var v = this.verticalRoads;
    var h = this.horizontalRoads;
    var i, j, k;

    // Buildings fill every block between neighbouring roads.
    for (i = 0; i < v.length - 1; i++) {
      for (j = 0; j < h.length - 1; j++) {
        var x0 = v[i] + WALK_HALF + 8;
        var x1 = v[i + 1] - WALK_HALF - 8;
        var y0 = h[j] + WALK_HALF + 8;
        var y1 = h[j + 1] - WALK_HALF - 8;
        if (x1 - x0 < 90 || y1 - y0 < 70) continue;

        // Palm Park block stays green: trees, no buildings.
        if (i === 1 && j === 2) {
          for (k = 0; k < 14; k++) {
            this.trees.push({ x: rng.float(x0 + 10, x1 - 10), y: rng.float(y0 + 10, y1 - 10), r: rng.float(10, 16) });
          }
          continue;
        }
        // Market Square block: stalls (low wide buildings) + trees.
        if (i === 0 && j === 0) {
          for (k = 0; k < 3; k++) {
            this.buildings.push({
              x: x0 + 12 + k * ((x1 - x0 - 24) / 3), y: y0 + 26,
              w: (x1 - x0 - 48) / 3, h: 60,
              roof: pal.buildingRoof[(k + 1) % pal.buildingRoof.length],
              wall: pal.buildingWall[k % pal.buildingWall.length], tower: false
            });
          }
          for (k = 0; k < 5; k++) {
            this.trees.push({ x: rng.float(x0 + 10, x1 - 10), y: rng.float(y0 + 110, y1 - 10), r: rng.float(9, 13) });
          }
          continue;
        }

        var downtown = (i >= 2 && i <= 3 && j >= 1 && j <= 2);
        var count = downtown ? 2 : rng.int(2, 4);
        for (k = 0; k < count; k++) {
          var bw = rng.float(70, Math.min(150, (x1 - x0) / count - 14));
          var bh = rng.float(60, Math.min(130, y1 - y0 - 20));
          var bx = x0 + 8 + ((x1 - x0 - 16) / count) * k + rng.float(0, 10);
          var by = y0 + 10 + rng.float(0, Math.max(0, y1 - y0 - bh - 20));
          var ci = rng.int(0, pal.buildingRoof.length - 1);
          this.buildings.push({
            x: bx, y: by, w: bw, h: bh,
            roof: pal.buildingRoof[ci], wall: pal.buildingWall[ci],
            tower: downtown && rng.chance(0.55)
          });
        }
      }
    }

    // Palm trees lining the main avenues (seeded, fixed per seed).
    for (i = 0; i < 46; i++) {
      var road = rng.pick(this.verticalRoads);
      this.palms.push({ x: road + (rng.chance(0.5) ? -52 : 52), y: rng.float(80, 1620) });
    }
    for (i = 0; i < 30; i++) {
      var hroad = rng.pick(this.horizontalRoads);
      this.palms.push({ x: rng.float(80, 2320), y: hroad + (rng.chance(0.5) ? -52 : 52) });
    }
  };

  World.prototype.isWater = function (x, y) {
    return y > 1700;
  };

  World.prototype.onRoad = function (x, y) {
    var i;
    for (i = 0; i < this.verticalRoads.length; i++) {
      if (Math.abs(x - this.verticalRoads[i]) < ROAD_HALF) return true;
    }
    for (i = 0; i < this.horizontalRoads.length; i++) {
      if (Math.abs(y - this.horizontalRoads[i]) < ROAD_HALF) return true;
    }
    return false;
  };

  World.prototype.onWalkable = function (x, y) {
    if (x < 20 || x > CFG.worldWidth - 20 || y < 20 || y > CFG.worldHeight - 20) return false;
    if (this.isWater(x, y)) return false;
    return true;
  };

  // Circle vs building rects. Returns the building hit, or null.
  World.prototype.collideBuildings = function (x, y, r) {
    var b = this.buildings;
    for (var i = 0; i < b.length; i++) {
      var bx = Math.max(b[i].x, Math.min(x, b[i].x + b[i].w));
      var by = Math.max(b[i].y, Math.min(y, b[i].y + b[i].h));
      var dx = x - bx, dy = y - by;
      if (dx * dx + dy * dy < r * r) return b[i];
    }
    return null;
  };

  World.prototype.randomRoadPoint = function (rng) {
    var vertical = rng.chance(0.5);
    if (vertical) {
      return { x: rng.pick(this.verticalRoads) + rng.float(-16, 16), y: rng.float(80, 1620), angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
    }
    return { x: rng.float(80, 2320), y: rng.pick(this.horizontalRoads) + rng.float(-16, 16), angle: rng.chance(0.5) ? 0 : Math.PI };
  };

  World.prototype.nearestRoadPoint = function (x, y) {
    var best = null, bestD = 1e9, i, d;
    for (i = 0; i < this.verticalRoads.length; i++) {
      d = Math.abs(x - this.verticalRoads[i]);
      if (d < bestD) { bestD = d; best = { x: this.verticalRoads[i], y: y }; }
    }
    for (i = 0; i < this.horizontalRoads.length; i++) {
      d = Math.abs(y - this.horizontalRoads[i]);
      if (d < bestD) { bestD = d; best = { x: x, y: this.horizontalRoads[i] }; }
    }
    return best;
  };

  // Draw ground, water, roads, sidewalks, park, buildings, palms.
  // Only the visible window is drawn (camera culling).
  World.prototype.draw = function (ctx, cam) {
    var pal = CFG.palette;
    var x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
    var x1 = Math.min(CFG.worldWidth, cam.x + cam.w + 40), y1 = Math.min(CFG.worldHeight, cam.y + cam.h + 40);
    var i, j;

    // Sun-soaked ground: warm grass with a checker of mowed tones.
    ctx.fillStyle = pal.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = pal.grassAlt;
    var cell = 120;
    for (i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }

    // Beach sand along the south shore, then the harbor water.
    ctx.fillStyle = pal.sand;
    ctx.fillRect(x0, Math.max(y0, 1650), x1 - x0, Math.min(y1, 1700) - Math.max(y0, 1650));
    ctx.fillStyle = pal.water;
    ctx.fillRect(x0, Math.max(y0, 1700), x1 - x0, Math.min(y1, CFG.worldHeight) - Math.max(y0, 1700));
    ctx.fillStyle = pal.waterDeep;
    for (i = 0; i < 8; i++) {
      var wy = 1720 + i * 9;
      if (wy > y0 && wy < y1) ctx.fillRect(x0 + ((i * 173) % 200), wy, 120, 2);
    }

    // Docks: wooden piers jutting into the water.
    ctx.fillStyle = pal.dock;
    ctx.fillRect(1000, 1660, 320, 42);
    ctx.fillRect(1080, 1700, 26, 84);
    ctx.fillRect(1220, 1700, 26, 84);

    // Sidewalks then roads.
    ctx.fillStyle = pal.sidewalk;
    for (i = 0; i < this.verticalRoads.length; i++) {
      ctx.fillRect(this.verticalRoads[i] - WALK_HALF, y0, WALK_HALF * 2, y1 - y0);
    }
    for (i = 0; i < this.horizontalRoads.length; i++) {
      ctx.fillRect(x0, this.horizontalRoads[i] - WALK_HALF, x1 - x0, WALK_HALF * 2);
    }
    ctx.fillStyle = pal.road;
    for (i = 0; i < this.verticalRoads.length; i++) {
      ctx.fillRect(this.verticalRoads[i] - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
    }
    for (i = 0; i < this.horizontalRoads.length; i++) {
      ctx.fillRect(x0, this.horizontalRoads[i] - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
    }

    // Dashed centre lines.
    ctx.fillStyle = pal.roadLine;
    for (i = 0; i < this.verticalRoads.length; i++) {
      for (j = Math.floor(y0 / 44); j <= Math.floor(y1 / 44); j++) {
        ctx.fillRect(this.verticalRoads[i] - 2, j * 44, 4, 22);
      }
    }
    for (i = 0; i < this.horizontalRoads.length; i++) {
      for (j = Math.floor(x0 / 44); j <= Math.floor(x1 / 44); j++) {
        ctx.fillRect(j * 44, this.horizontalRoads[i] - 2, 22, 4);
      }
    }

    // Park lawn.
    ctx.fillStyle = pal.park;
    ctx.fillRect(596, 996, 304, 304);

    // Buildings: wall, roof, windows; towers get glass tops.
    for (i = 0; i < this.buildings.length; i++) {
      var b = this.buildings[i];
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.tower) {
        ctx.fillStyle = pal.towerGlass;
        ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(b.x + 14, b.y + 14, 8, b.h - 28);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        var wx, wy;
        for (wx = b.x + 14; wx < b.x + b.w - 12; wx += 22) {
          for (wy = b.y + 14; wy < b.y + b.h - 12; wy += 22) {
            ctx.fillRect(wx, wy, 9, 9);
          }
        }
      }
      ctx.strokeStyle = 'rgba(28,26,38,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // Trees and palms.
    for (i = 0; i < this.trees.length; i++) {
      var t = this.trees[i];
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.fillStyle = '#3f8f2e';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57b53f';
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < this.palms.length; i++) {
      var p = this.palms[i];
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 14); ctx.stroke();
      ctx.fillStyle = '#3fae5a';
      ctx.beginPath(); ctx.arc(p.x + 3, p.y - 16, 9, 0, Math.PI * 2); ctx.fill();
    }

    // Warm golden-hour light wash over everything.
    ctx.fillStyle = 'rgba(255, 190, 90, 0.06)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };

  NH.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
