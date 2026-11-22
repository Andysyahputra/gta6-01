// Neon Harbor — hud.js
// One job: everything drawn over the world. Cash/health/ammo, wanted
// stars, mission name and objective, clock, minimap, start/pause/
// wasted/busted screens, mission banners and Vera's dialogue.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});
  var CFG = NH.config;
  var L = CFG.landmarks;

  function Hud(game) {
    this.game = game;
  }

  Hud.prototype.drawStars = function (ctx, x, y, stars) {
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = i < stars ? '#ffdf3d' : 'rgba(255,255,255,0.35)';
      ctx.fillText('★', x + i * 28, y);
    }
  };

  Hud.prototype.drawBar = function (ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#3a3648';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, w * frac), h);
  };

  Hud.prototype.drawMinimap = function (ctx, game) {
    var mw = 218, mh = 164;
    var x = CFG.viewWidth - mw - 14, y = 14;
    var sx = mw / CFG.worldWidth, sy = mh / CFG.worldHeight;
    ctx.fillStyle = 'rgba(20,18,32,0.78)';
    ctx.fillRect(x - 4, y - 4, mw + 8, mh + 8);
    ctx.strokeStyle = '#ffdf3d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 4, mw + 8, mh + 8);

    // City blocks (bright, so the map reads at a glance).
    ctx.fillStyle = '#7ec850';
    ctx.fillRect(x, y, mw, mh);
    ctx.fillStyle = '#2fa8d8';
    ctx.fillRect(x, y + mh - 8, mw, 8);
    ctx.fillStyle = '#3d3a4a';
    var w = game.world;
    var i;
    for (i = 0; i < w.verticalRoads.length; i++) {
      ctx.fillRect(x + w.verticalRoads[i] * sx - 2, y, 4, mh);
    }
    for (i = 0; i < w.horizontalRoads.length; i++) {
      ctx.fillRect(x, y + w.horizontalRoads[i] * sy, mw, 4);
    }

    // Landmark dots.
    var icons = [
      [L.safehouse, '#57d977', 'S'], [L.garage, '#ffdf3d', 'G'],
      [L.gunShop, '#ff8a3d', 'A'], [L.bank, '#4db38a', '$'],
      [L.docks, '#2fa8d8', 'D'], [L.market, '#e86a92', 'M']
    ];
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < icons.length; i++) {
      ctx.fillStyle = icons[i][1];
      ctx.beginPath(); ctx.arc(x + icons[i][0].x * sx, y + icons[i][0].y * sy, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Police dots (red) and helicopter (white ring).
    ctx.fillStyle = '#ff3b30';
    for (i = 0; i < game.police.cars.length; i++) {
      ctx.beginPath(); ctx.arc(x + game.police.cars[i].x * sx, y + game.police.cars[i].y * sy, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (game.police.heli.active) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + game.police.heli.x * sx, y + game.police.heli.y * sy, 6, 0, Math.PI * 2); ctx.stroke();
    }

    // Mission marker: blinking gold diamond.
    var tp = game.missions.targetPoint();
    if (tp && Math.floor(game.time * 2.5) % 2 === 0) {
      var mx = x + tp.x * sx, my = y + tp.y * sy;
      ctx.fillStyle = '#ffdf3d';
      ctx.beginPath();
      ctx.moveTo(mx, my - 8); ctx.lineTo(mx + 7, my); ctx.lineTo(mx, my + 8); ctx.lineTo(mx - 7, my);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1c1a26';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Player arrow.
    var p = game.player;
    var px = x + p.x * sx, py = y + p.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1c1a26';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NEON HARBOR', x, y + mh + 16);
  };

  Hud.prototype.drawGame = function (ctx, game) {
    var pal = CFG.palette;
    var p = game.player;
    var m = game.missions.current();

    // Top-left status panel.
    ctx.fillStyle = pal.hudBg;
    ctx.fillRect(12, 12, 250, 108);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('$' + game.cash, 24, 30);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#c9c4d6';
    ctx.fillText('Rex Marlowe', 24, 52);
    this.drawBar(ctx, 24, 62, 140, 10, p.health / CFG.player.healthMax, p.health > 40 ? '#57d977' : '#ff5347');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('HP ' + Math.ceil(p.health), 170, 67);
    if (p.hasPistol) {
      ctx.fillStyle = '#ffdf3d';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('PISTOL  ' + p.ammo + ' / ' + CFG.player.pistolAmmoMax, 24, 92);
    } else {
      ctx.fillStyle = '#c9c4d6';
      ctx.font = '13px sans-serif';
      ctx.fillText('No pistol yet — Vera gives you one in Mission 2', 24, 92);
    }
    if (p.inCar) {
      ctx.fillStyle = '#9fd8ef';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(p.inCar.model.name + '  •  E to exit', 24, 110);
    }

    // Wanted stars + clock, top centre-right.
    ctx.fillStyle = pal.hudBg;
    ctx.fillRect(CFG.viewWidth - 250, 192, 236, 52);
    this.drawStars(ctx, CFG.viewWidth - 238, 210, game.wanted);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    var hh = Math.floor(game.clock / 60) % 24;
    var mm = Math.floor(game.clock % 60);
    ctx.fillText((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + '  •  Day 1', CFG.viewWidth - 26, 232);
    ctx.textAlign = 'left';

    this.drawMinimap(ctx, game);

    // Mission objective bar, bottom centre.
    ctx.fillStyle = pal.hudBg;
    var bw = 620;
    ctx.fillRect((CFG.viewWidth - bw) / 2, CFG.viewHeight - 52, bw, 40);
    ctx.fillStyle = '#ffdf3d';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    if (m) {
      ctx.fillText('MISSION ' + m.id + ' — ' + m.name.toUpperCase(), CFG.viewWidth / 2, CFG.viewHeight - 38);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px sans-serif';
      var obj = m.objective;
      if (m.id === 5 && game.missions.stage === 1) obj += '  •  ' + Math.ceil(game.missions.timer) + 's left';
      if (m.id === 6) obj += '  •  Hits: ' + game.missions.hits + '/3';
      if (m.id === 7 && game.missions.stage === 1) obj += '  •  Hold: ' + Math.ceil(game.missions.holdTimer) + 's';
      ctx.fillText(obj, CFG.viewWidth / 2, CFG.viewHeight - 20);
    } else {
      ctx.fillText('FREE ROAM', CFG.viewWidth / 2, CFG.viewHeight - 38);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px sans-serif';
      ctx.fillText('Deliver a stolen car to the garage for $150  •  Press E near a car to steal it', CFG.viewWidth / 2, CFG.viewHeight - 20);
    }
    ctx.textAlign = 'left';

    // Mute + controls hint, bottom left.
    ctx.fillStyle = 'rgba(20,18,32,0.6)';
    ctx.fillRect(12, CFG.viewHeight - 40, 300, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText('WASD move/drive  •  E steal car  •  F punch  •  Space shoot  •  Esc pause  •  0 ' + (game.audio.muted ? 'unmute' : 'mute'), 20, CFG.viewHeight - 26);

    // Vera dialogue / message.
    if (game.missions.message) {
      ctx.fillStyle = 'rgba(20,18,32,0.82)';
      var mw2 = 760;
      ctx.fillRect((CFG.viewWidth - mw2) / 2, 120, mw2, 56);
      ctx.strokeStyle = '#ffdf3d';
      ctx.lineWidth = 2;
      ctx.strokeRect((CFG.viewWidth - mw2) / 2, 120, mw2, 56);
      ctx.fillStyle = '#ffdf3d';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('VERA KLINE', (CFG.viewWidth - mw2) / 2 + 16, 138);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      this.wrapText(ctx, game.missions.message, (CFG.viewWidth - mw2) / 2 + 16, 158, mw2 - 32, 17);
    }

    // Mission-complete banner.
    if (game.missions.banner) {
      ctx.fillStyle = 'rgba(255,223,61,0.94)';
      ctx.fillRect(0, CFG.viewHeight / 2 - 34, CFG.viewWidth, 68);
      ctx.fillStyle = '#1c1a26';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(game.missions.banner, CFG.viewWidth / 2, CFG.viewHeight / 2 - 2);
      ctx.font = '14px sans-serif';
      ctx.fillText(game.king ? 'NEON HARBOR KING' : 'Keep going, Rex.', CFG.viewWidth / 2, CFG.viewHeight / 2 + 22);
      ctx.textAlign = 'left';
    }

    // Wasted / busted overlays are drawn by main.js via drawEndScreen.
  };

  Hud.prototype.wrapText = function (ctx, text, x, y, maxW, lh) {
    var words = text.split(' ');
    var line = '';
    var yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  };

  Hud.prototype.drawStart = function (ctx, game) {
    // City vista behind the title: the world is already drawn underneath.
    ctx.fillStyle = 'rgba(20,18,32,0.45)';
    ctx.fillRect(0, 0, CFG.viewWidth, CFG.viewHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdf3d';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('NEON HARBOR', CFG.viewWidth / 2, 150);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('A sun-soaked open-world crime game', CFG.viewWidth / 2, 190);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffe9b8';
    ctx.fillText('Rex Marlowe just arrived with nothing but a duffel bag. Vera Kline has work for him.', CFG.viewWidth / 2, 222);
    ctx.fillText('Steal cars, run missions, dodge the Harbor PD — and take the city.', CFG.viewWidth / 2, 246);

    ctx.fillStyle = 'rgba(20,18,32,0.72)';
    ctx.fillRect(CFG.viewWidth / 2 - 330, 280, 660, 190);
    ctx.strokeStyle = '#ffdf3d';
    ctx.lineWidth = 2;
    ctx.strokeRect(CFG.viewWidth / 2 - 330, 280, 660, 190);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px sans-serif';
    var lines = [
      'WASD / Arrows — walk or drive (Shift to run)',
      'E — steal a car / get in / get out',
      'F — punch      Space / Click — fire pistol (Mission 2)',
      'Missions from Vera — follow the gold marker on the minimap',
      'Wanted stars bring the police, roadblocks and the AIR-1 helicopter',
      'Esc — pause      0 — mute sound'
    ];
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], CFG.viewWidth / 2, 312 + i * 26);
    }

    if (Math.floor(game.time * 1.6) % 2 === 0) {
      ctx.fillStyle = '#ffdf3d';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('PRESS ENTER TO START', CFG.viewWidth / 2, 530);
    }
    ctx.fillStyle = '#c9c4d6';
    ctx.font = '14px sans-serif';
    ctx.fillText(game.hasSave ? 'Save found — Enter continues your game (N for New Game)' : 'New game — your progress saves automatically',
      CFG.viewWidth / 2, 566);
    ctx.fillText('7 missions  •  free-roam car deliveries  •  original city, story and music — no Rockstar content',
      CFG.viewWidth / 2, 596);
    ctx.textAlign = 'left';
  };

  Hud.prototype.drawPause = function (ctx) {
    ctx.fillStyle = 'rgba(20,18,32,0.7)';
    ctx.fillRect(0, 0, CFG.viewWidth, CFG.viewHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('PAUSED', CFG.viewWidth / 2, 300);
    ctx.font = '18px sans-serif';
    ctx.fillText('Esc — resume      R — restart mission      N — new game', CFG.viewWidth / 2, 350);
    ctx.textAlign = 'left';
  };

  Hud.prototype.drawEnd = function (ctx, title, subtitle, detail) {
    ctx.fillStyle = title === 'WASTED' ? 'rgba(120,10,10,0.72)' : 'rgba(10,20,90,0.72)';
    ctx.fillRect(0, 0, CFG.viewWidth, CFG.viewHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(title, CFG.viewWidth / 2, 320);
    ctx.font = '20px sans-serif';
    ctx.fillText(subtitle, CFG.viewWidth / 2, 368);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#ffe9b8';
    ctx.fillText(detail, CFG.viewWidth / 2, 400);
    ctx.fillStyle = '#ffdf3d';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('PRESS ENTER TO RESPAWN AT THE SAFEHOUSE', CFG.viewWidth / 2, 460);
    ctx.textAlign = 'left';
  };

  NH.Hud = Hud;
})(typeof window !== 'undefined' ? window : globalThis);
