// Neon Harbor — HUD (cash, health, ammo, wanted stars, mission, clock) and the
// minimap: whole-city view with player, mission marker, police and icons.
import { WORLD_W, WORLD_H, WANTED_MAX } from './config.js';

export class Hud {
  constructor(doc) {
    this.el = {
      cash: doc.getElementById('hud-cash'),
      healthFill: doc.getElementById('hud-health-fill'),
      healthText: doc.getElementById('hud-health-text'),
      ammo: doc.getElementById('hud-ammo'),
      stars: doc.getElementById('hud-stars'),
      mission: doc.getElementById('hud-mission-name'),
      objective: doc.getElementById('hud-objective'),
      clock: doc.getElementById('hud-clock'),
      mute: doc.getElementById('hud-mute'),
      banner: doc.getElementById('banner'),
      briefing: doc.getElementById('briefing'),
      briefingTitle: doc.getElementById('briefing-title'),
      briefingText: doc.getElementById('briefing-text'),
    };
    this.minimap = doc.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.briefingTimer = 0;
  }
  showBanner(text, seconds) {
    this.el.banner.textContent = text;
    this.el.banner.classList.add('show');
    this.bannerTimer = seconds || 3.5;
  }
  showBriefing(title, text) {
    this.el.briefingTitle.textContent = title;
    this.el.briefingText.textContent = text;
    this.el.briefing.classList.add('show');
    this.briefingTimer = 6;
  }
  update(dt, g) {
    const p = g.player;
    this.el.cash.textContent = '$' + p.cash.toLocaleString('en-US');
    const hp = Math.max(0, Math.round(p.inCar ? p.inCar.health : p.health));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.style.background = hp > 50 ? '#3fae6a' : hp > 25 ? '#f2a230' : '#e33f5f';
    this.el.healthText.textContent = hp;
    this.el.ammo.textContent = p.pistol ? `PISTOL ${p.ammo}/12` : 'NO WEAPON — F to punch';
    let stars = '';
    for (let i = 0; i < WANTED_MAX; i++) stars += i < g.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = g.wanted > 0 ? '#ffd23f' : '#8a8a9a';
    const m = g.missions.current;
    this.el.mission.textContent = g.missions.done ? 'FREE ROAM' : `MISSION ${m.id}/5 — ${m.name}`;
    this.el.objective.textContent = g.missions.objectiveText();
    const mins = 18 * 60 + 24 + Math.floor(g.gameTime / 60);
    const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}  DUSK`;
    this.el.mute.textContent = g.audio.muted ? '🔇 MUTED (0)' : '🔊 SOUND (0)';
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.briefingTimer > 0) {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) this.el.briefing.classList.remove('show');
    }
    this.drawMinimap(g);
  }
  drawMinimap(g) {
    const ctx = this.mm;
    const W = this.minimap.width, H = this.minimap.height;
    const sx = W / WORLD_W, sy = H / WORLD_H;
    ctx.clearRect(0, 0, W, H);
    // City base.
    ctx.fillStyle = '#1a2b1e'; ctx.fillRect(0, 0, W, H);
    // Roads.
    ctx.fillStyle = '#3a3b46';
    for (const rx of [300, 700, 1100, 1500, 1900]) ctx.fillRect(rx * sx - 3, 0, 6, H);
    for (const ry of [300, 700, 1100, 1500]) ctx.fillRect(0, ry * sy - 3, W, 6);
    // Water.
    ctx.fillStyle = '#123a5c'; ctx.fillRect(0, 1640 * sy, W, H - 1640 * sy);
    // Buildings.
    ctx.fillStyle = '#5a5f73';
    for (const b of g.world.buildings) ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    // Landmark icons.
    const L = g.world.landmarks;
    const icon = (lm, color, letter) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(lm.x * sx, lm.y * sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(letter, lm.x * sx, lm.y * sy + 2.5);
    };
    icon(L.safehouse, '#3fae6a', 'H');
    icon(L.garage, '#f2a230', 'G');
    icon(L.arms, '#c84fd0', 'A');
    icon(L.bank, '#f2e230', '$');
    // Mission marker (blinking).
    const target = g.missions.targetPos();
    if (target && Math.floor(g.time * 3) % 2 === 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(target.x * sx, target.y * sy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', target.x * sx, target.y * sy + 3);
    }
    // Police dots.
    ctx.fillStyle = '#ff3b30';
    for (const c of g.police.cars) {
      ctx.beginPath(); ctx.arc(c.x * sx, c.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const p = g.player.pos();
    ctx.save();
    ctx.translate(p.x * sx, p.y * sy);
    ctx.rotate(g.player.inCar ? g.player.inCar.angle : g.player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Viewport box.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect((g.cam.x - g.viewW / 2) * sx, (g.cam.y - g.viewH / 2) * sy, g.viewW * sx, g.viewH * sy);
  }
}
