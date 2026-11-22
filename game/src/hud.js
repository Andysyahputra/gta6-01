// Neon Harbor — HUD, minimap and menu screens. Drawn over the world
// on the same canvas: cash, health, ammo, wanted stars, mission text,
// clock, mute button, minimap with player / police / marker dots.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H } from './config.js';

export function drawHUD(ctx, G) {
  const p = G.player;
  // Top-left panel: cash, health, ammo
  ctx.fillStyle = '#00000088';
  ctx.fillRect(12, 12, 250, 86);
  ctx.fillStyle = '#7be0a3';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`$${p.cash}`, 24, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.fillText(`AMMO ${p.hasPistol ? p.ammo : '—'}   ${G.audio.muted ? 'MUTED (0)' : 'SOUND ON (0)'}`, 24, 62);
  // Health bar
  ctx.fillStyle = '#33333d';
  ctx.fillRect(24, 72, 200, 12);
  ctx.fillStyle = p.health > 40 ? '#7be0a3' : '#ff5533';
  ctx.fillRect(24, 72, 200 * (p.health / p.maxHealth), 12);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('HP', 226, 84);
  // Wanted stars top-centre
  ctx.fillStyle = '#00000088';
  ctx.fillRect(VIEW_W / 2 - 130, 12, 260, 44);
  ctx.font = 'bold 26px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffdd33' : '#ffffff33';
    ctx.fillText('★', VIEW_W / 2 - 110 + i * 48, 44);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.fillText(G.wanted > 0 ? 'WANTED' : 'CLEAN', VIEW_W / 2 + 118, 34);
  // Mission objective bar
  const obj = G.missions.objectiveText();
  ctx.fillStyle = '#00000088';
  ctx.fillRect(12, VIEW_H - 64, 560, 52);
  ctx.fillStyle = '#ffdd33';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('MISSION', 24, VIEW_H - 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.fillText(obj.slice(0, 72), 24, VIEW_H - 24);
  // Clock + car name
  const mins = Math.floor(G.time / 60);
  const hh = 17 + Math.floor(mins / 60), mm = mins % 60;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(VIEW_W - 250, VIEW_H - 64, 238, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  GOLDEN HOUR`, VIEW_W - 238, VIEW_H - 44);
  ctx.font = '14px sans-serif';
  ctx.fillText(p.inCar ? p.inCar.model.name : 'ON FOOT — press E near a car', VIEW_W - 238, VIEW_H - 24);
  // Banner
  if (G.missions.bannerTimer > 0 && G.missions.banner) {
    ctx.fillStyle = '#111111cc';
    const bw = Math.min(900, ctx.measureText(G.missions.banner).width + 40);
    ctx.fillRect(VIEW_W / 2 - bw / 2, 70, bw, 46);
    ctx.fillStyle = '#ffdd33';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.missions.banner.slice(0, 110), VIEW_W / 2, 99);
    ctx.textAlign = 'left';
  }
  // Floating texts
  ctx.font = 'bold 16px sans-serif';
  for (const ft of G.floatTexts) {
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x - G.cam.x, ft.y - G.cam.y - (1 - ft.life) * 30);
  }
  // Controls hint (fades after a while)
  if (G.time < 25) {
    ctx.fillStyle = '#ffffffcc';
    ctx.font = '13px sans-serif';
    ctx.fillText('WASD move/drive • E steal car • F punch • SPACE fire • ESC pause • 0 mute', 24, VIEW_H - 76);
  }
  drawMinimap(ctx, G);
}

export function drawMinimap(ctx, G) {
  const mw = 210, mh = 158;
  const mx = VIEW_W - mw - 12, my = 12;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = '#f2d38a';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#4a4a55';
  for (const rx of [200, 500, 800, 1100, 1400, 1700, 2000, 2250]) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
  for (const ry of [150, 400, 650, 900, 1150, 1400, 1650]) ctx.fillRect(mx, my + ry * sy - 2, mw, 4);
  ctx.fillStyle = '#2f7fc9';
  ctx.fillRect(mx, my + 1650 * sy, mw, mh - 1650 * sy);
  // Safehouse / garage / shop icons
  const icons = [
    [330, 300, '#7be0a3', 'H'], [2050, 300, '#ffdd33', 'G'],
    [1150, 1250, '#ff8a5c', 'A'], [1150, 780, '#ffffff', '$'],
  ];
  for (const [ix, iy, col, ch] of icons) {
    ctx.fillStyle = col;
    ctx.fillRect(mx + ix * sx - 5, my + iy * sy - 5, 10, 10);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(ch, mx + ix * sx - 3, my + iy * sy + 3);
  }
  // Mission marker (blinking)
  if (G.missions.target && Math.floor(G.time * 3) % 2 === 0) {
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(mx + G.missions.target.x * sx, my + G.missions.target.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots
  ctx.fillStyle = '#2266ff';
  for (const c of G.police.cars) {
    ctx.beginPath(); ctx.arc(mx + c.x * sx, my + c.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (G.police.heli.active) {
    ctx.fillStyle = '#ff5533';
    ctx.beginPath(); ctx.arc(mx + G.police.heli.x * sx, my + G.police.heli.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Player dot + direction
  const p = G.player.inCar || G.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx + p.x * sx, my + p.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(mx + p.x * sx, my + p.y * sy);
  ctx.lineTo(mx + (p.x + Math.cos(p.angle) * 90) * sx, my + (p.y + Math.sin(p.angle) * 90) * sy);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('NEON HARBOR', mx, my + mh + 16);
}

export function drawStartScreen(ctx, G) {
  // Warm translucent wash so the city drawn behind still shows through.
  ctx.fillStyle = 'rgba(247, 200, 115, 0.93)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#e2703a';
  ctx.fillRect(0, 0, VIEW_W, 14);
  ctx.fillStyle = '#27408b';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEON HARBOR', VIEW_W / 2, 180);
  ctx.fillStyle = '#d94f6a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('— a sun-soaked open-world crime story —', VIEW_W / 2, 228);
  ctx.fillStyle = '#123';
  ctx.font = '20px sans-serif';
  ctx.fillText('Rex Marlowe just rolled into town with nothing but a duffel bag.', VIEW_W / 2, 290);
  ctx.fillText('Fixer Vera Kline has work for him. Seven missions. One city. No rules.', VIEW_W / 2, 320);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(VIEW_W / 2 - 320, 350, 640, 190);
  ctx.fillStyle = '#123';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  const lines = [
    'WASD / Arrows — walk & drive    •    SHIFT — run',
    'E — steal / enter / exit a car    •    F — punch',
    'SPACE / Click — fire pistol (from Mission 2)',
    'ESC — pause    •    0 — mute    •    Progress auto-saves',
    'Steal cars, dodge the cops, run 7 missions for Vera.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2 - 300, 386 + i * 32));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8384f';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(G.hasSave ? 'PRESS ENTER — CONTINUE' : 'PRESS ENTER — START', VIEW_W / 2, 600);
  ctx.fillStyle = '#123';
  ctx.font = '16px sans-serif';
  ctx.fillText('N — New Game (clears save)', VIEW_W / 2, 636);
  ctx.textAlign = 'left';
}

export function drawPauseScreen(ctx) {
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.font = '20px sans-serif';
  ctx.fillText('ESC — resume    •    R — restart mission    •    Progress saved', VIEW_W / 2, 360);
  ctx.textAlign = 'left';
}

export function drawEndScreen(ctx, G) {
  ctx.fillStyle = G.endKind === 'wasted' ? '#7a1010cc' : '#101a7acc';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(G.endKind === 'wasted' ? 'WASTED' : 'BUSTED', VIEW_W / 2, 300);
  ctx.font = '20px sans-serif';
  ctx.fillText(G.endText || '', VIEW_W / 2, 350);
  ctx.fillText(`You lost $${G.penalty} — respawned at the safehouse.`, VIEW_W / 2, 385);
  ctx.fillStyle = '#ffdd33';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('PRESS ENTER TO GET BACK OUT THERE', VIEW_W / 2, 450);
  ctx.textAlign = 'left';
}

export function drawKingScreen(ctx) {
  ctx.fillStyle = '#00000088';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffdd33';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEON HARBOR KING', VIEW_W / 2, 330);
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px sans-serif';
  ctx.fillText('Rex Marlowe owns this city. Free roam continues — deliver cars to the garage.', VIEW_W / 2, 380);
  ctx.textAlign = 'left';
}
