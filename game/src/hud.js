// Neon Harbor — HUD, minimap and menus. Everything is drawn on the canvas:
// cash, health, ammo, wanted stars, mission objective, clock, mute state, the
// minimap (city grid, markers, police, player), and the start / pause /
// wasted / busted screens plus mission banners and briefings.
import { WORLD, SPOTS } from './config.js';
import { clamp } from './rng.js';

const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px "Segoe UI", Arial, sans-serif`;

export class Hud {
  constructor() {
    this.message = null; // { text, t }
    this.flash = 0;
  }

  showMessage(text, secs = 3) { this.message = { text, t: secs }; }

  draw(ctx, game, W, H) {
    const p = game.player;
    // --- top-left: cash, health, ammo -------------------------------------
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    this.roundRect(ctx, 12, 12, 250, 92, 10);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.font = FONT(26, true);
    ctx.fillText(`$${game.cash.toLocaleString('en-US')}`, 24, 44);
    // Health bar
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(24, 54, 180, 12);
    ctx.fillStyle = p.health > 35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(24, 54, 180 * clamp(p.health / 100, 0, 1), 12);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = FONT(13, true);
    ctx.fillText(`HP ${Math.ceil(p.health)}`, 210, 66);
    ctx.fillStyle = '#fbbf24';
    ctx.font = FONT(15, true);
    const ammoText = p.hasPistol ? `PISTOL  ${p.ammo} / 12` : 'NO WEAPON — finish Mission 2';
    ctx.fillText(ammoText, 24, 92);

    // --- top-right: wanted stars -------------------------------------------
    const stars = game.police.wanted;
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    this.roundRect(ctx, W - 232, 12, 220, 44, 10);
    ctx.fill();
    ctx.font = '26px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < stars ? '#facc15' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', W - 202 + i * 36, 44);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONT(12, true);
    ctx.textAlign = 'right';
    ctx.fillText(game.audio.muted ? 'MUTED [0]' : 'SOUND ON [0]', W - 16, 74);

    // --- top-centre: mission ------------------------------------------------
    const obj = game.missions.objectiveText();
    const mName = game.missions.current ? `MISSION ${game.missions.current.index + 1} — ${game.missions.current.name}` : (game.missions.freeRoam ? 'FREE ROAM' : 'NEON HARBOR');
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    const mw = Math.min(560, ctx.measureText(obj).width + 60);
    this.roundRect(ctx, (W - mw) / 2, 12, mw, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.font = FONT(14, true);
    ctx.fillText(mName, W / 2, 32);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT(15, false);
    ctx.fillText(obj, W / 2, 54);
    if (game.missions.current && game.missions.current.index === 4 && game.missions.current.stage === 2) {
      ctx.fillStyle = '#f87171';
      ctx.font = FONT(20, true);
      ctx.fillText(`HOLDOUT ${Math.ceil(game.missions.current.holdout)}s`, W / 2, 92);
    }

    // --- clock (in-game dusk time) ------------------------------------------
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    this.roundRect(ctx, 12, H - 44, 150, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#e0e7ff';
    ctx.font = FONT(16, true);
    ctx.fillText(game.clockText(), 24, H - 22);

    // --- transient message ---------------------------------------------------
    if (this.message) {
      this.message.t -= game.dt;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,24,0.7)';
      const tw = ctx.measureText(this.message.text).width + 36;
      this.roundRect(ctx, (W - tw) / 2, H - 110, tw, 36, 10);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.font = FONT(16, true);
      ctx.fillText(this.message.text, W / 2, H - 86);
      if (this.message.t <= 0) this.message = null;
    }

    this.drawMinimap(ctx, game, W - 216, H - 166, 204, 154);
    this.drawMarkerArrow(ctx, game, W, H);

    // --- mission banner ------------------------------------------------------
    if (game.missions.banner) {
      const b = game.missions.banner;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,60,20,0.82)';
      this.roundRect(ctx, (W - 520) / 2, H / 2 - 70, 520, 84, 12);
      ctx.fill();
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#bbf7d0';
      ctx.font = FONT(26, true);
      ctx.fillText(b.text, W / 2, H / 2 - 34);
      ctx.fillStyle = '#facc15';
      ctx.font = FONT(24, true);
      ctx.fillText(b.sub, W / 2, H / 2 + 2);
    }

    // --- briefing panel ------------------------------------------------------
    if (game.missions.briefing) {
      const br = game.missions.briefing;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,24,0.85)';
      this.roundRect(ctx, (W - 720) / 2, H - 220, 720, 96, 12);
      ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.font = FONT(17, true);
      ctx.fillText(br.title, W / 2, H - 188);
      ctx.fillStyle = '#f8fafc';
      ctx.font = FONT(15, false);
      this.wrapText(ctx, br.text, W / 2, H - 162, 680, 20);
    }
  }

  drawMinimap(ctx, game, x, y, w, h) {
    const sx = w / WORLD.W, sy = h / WORLD.H;
    ctx.fillStyle = 'rgba(8,10,24,0.72)';
    this.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    // Water
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(x, y + WORLD.WATER_Y * sy, w, h - WORLD.WATER_Y * sy);
    // Ground
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, w, WORLD.WATER_Y * sy);
    // Roads
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    for (const rx of WORLD.V_ROADS) {
      ctx.beginPath(); ctx.moveTo(x + rx * sx, y); ctx.lineTo(x + rx * sx, y + WORLD.WATER_Y * sy); ctx.stroke();
    }
    for (const ry of WORLD.H_ROADS) {
      ctx.beginPath(); ctx.moveTo(x, y + ry * sy); ctx.lineTo(x + w, y + ry * sy); ctx.stroke();
    }
    // Buildings
    ctx.fillStyle = '#64748b';
    for (const b of game.city.buildings) ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
    // Landmarks
    const spots = [
      [SPOTS.safehouse, '#4ade80'], [SPOTS.garage, '#facc15'], [SPOTS.arms, '#f97316'],
      [SPOTS.payphone, '#38bdf8'], [SPOTS.bank, '#e879f9'], [SPOTS.docks, '#22d3ee'],
    ];
    for (const [s, c] of spots) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x + s.x * sx, y + s.y * sy, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Mission marker (blinking)
    const m = game.missions.current && game.missions.current.marker;
    if (m) {
      const blink = Math.floor(performance.now() / 300) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, 8, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Police dots
    ctx.fillStyle = '#38bdf8';
    for (const c of game.police.cars) {
      ctx.beginPath(); ctx.arc(x + c.x * sx, y + c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ef4444';
    for (const o of game.police.officers) {
      ctx.beginPath(); ctx.arc(x + o.x * sx, y + o.y * sy, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow
    const p = game.player;
    ctx.save();
    ctx.translate(x + p.x * sx, y + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = FONT(11, true);
    ctx.textAlign = 'left';
    ctx.fillText('NEON HARBOR', x, y - 8);
  }

  drawMarkerArrow(ctx, game, W, H) {
    const m = game.missions.current && game.missions.current.marker;
    if (!m) return;
    const cam = game.camera;
    const sx = m.x - cam.x, sy = m.y - cam.y;
    if (sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40) return; // on screen already
    const cx = clamp(sx, 60, W - 60), cy = clamp(sy, 100, H - 120);
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#facc15';
    ctx.font = FONT(12, true);
    ctx.textAlign = 'center';
    ctx.fillText(`${m.label} ${Math.round(Math.hypot(m.x - game.player.x, m.y - game.player.y))}m`, cx, cy + 26);
  }

  // --- full screens ----------------------------------------------------------

  drawStart(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(5,5,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f472b6';
    ctx.font = FONT(64, true);
    ctx.fillText('NEON HARBOR', W / 2, 150);
    ctx.fillStyle = '#22d3ee';
    ctx.font = FONT(20, false);
    ctx.fillText('an open-world crime game', W / 2, 186);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT(16, false);
    this.wrapText(ctx, 'Rex Marlowe just rolled into Neon Harbor with a duffel bag and nothing to lose. Vera Kline has work — if you can handle it.', W / 2, 240, 760, 24);
    const lines = [
      'WASD / Arrows — walk or drive      SHIFT — run',
      'E — steal / enter / exit a car      F — punch      SPACE / click — shoot (pistol)',
      'Missions pay cash — follow the yellow marker on the minimap',
      'Lose the cops at the safehouse or pay the Cleaner payphone',
    ];
    ctx.font = FONT(16, false);
    ctx.fillStyle = '#e2e8f0';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 320 + i * 28));
    ctx.fillStyle = '#facc15';
    ctx.font = FONT(26, true);
    ctx.fillText(game.hasSave ? 'Press ENTER to continue — or N for a New Game' : 'Press ENTER to start', W / 2, 480);
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONT(13, false);
    ctx.fillText('Progress saves automatically. Sound: press 0 to mute.', W / 2, 530);
  }

  drawPause(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(5,5,20,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT(44, true);
    ctx.fillText('PAUSED', W / 2, 240);
    ctx.font = FONT(18, false);
    ctx.fillText('ESC — resume      R — restart mission      N — new game', W / 2, 300);
    ctx.fillText(`Cash $${game.cash.toLocaleString('en-US')}   •   Missions done: ${game.missions.completed} / 5   •   Best heat escaped: ${game.bestWanted}★`, W / 2, 340);
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONT(14, false);
    ctx.fillText('Progress saved.', W / 2, 380);
  }

  drawEnd(ctx, game, W, H, kind) {
    ctx.fillStyle = 'rgba(20,2,8,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = kind === 'wasted' ? '#ef4444' : '#38bdf8';
    ctx.font = FONT(64, true);
    ctx.fillText(kind === 'wasted' ? 'WASTED' : 'BUSTED', W / 2, 260);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT(18, false);
    ctx.fillText(game.endPenaltyText, W / 2, 310);
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#facc15';
      ctx.font = FONT(24, true);
      ctx.fillText('Press ENTER to respawn at the safehouse', W / 2, 380);
    }
  }

  drawKing(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(10,8,30,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = FONT(56, true);
    ctx.fillText('NEON HARBOR KING', W / 2, H / 2 - 20);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT(20, false);
    ctx.fillText('Rex Marlowe runs this city now. Free roam — keep earning.', W / 2, H / 2 + 24);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = word;
        yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }
}
