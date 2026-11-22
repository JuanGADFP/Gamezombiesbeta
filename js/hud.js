'use strict';

// Interfaz en pantalla: vida, estamina, experiencia, armas, minimapa, mensajes
class HUD {
  constructor(game) {
    this.g = game;
    this.font = '"Trebuchet MS", "Segoe UI", sans-serif';
  }

  bar(ctx, x, y, w, h, frac, color, back = 'rgba(0,0,0,0.55)', label = null) {
    ctx.fillStyle = back;
    U.roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    U.roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      U.roundRect(ctx, x, y, Math.max(h * 0.6, w * U.clamp(frac, 0, 1)), h, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 2, y + 1, Math.max(0, w * U.clamp(frac, 0, 1) - 4), h * 0.35);
    }
    if (label) {
      const fs = Math.max(10, h - 6);
      ctx.font = `bold ${fs}px ${this.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  text(ctx, str, x, y, size, color = '#fff', align = 'left', bold = true) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${this.font}`;
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  render(ctx) {
    const g = this.g, p = g.player, s = p.stats;
    const W = g.cw, H = g.ch;

    // viñeta de daño / vida baja
    const low = p.hp / s.maxHp < 0.3 && p.alive ? (0.35 + Math.sin(g.time * 6) * 0.15) : 0;
    const vig = Math.max(g.damageFlash, low);
    if (vig > 0.01) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(150,0,0,0)');
      gr.addColorStop(1, `rgba(150,0,0,${vig * 0.7})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }

    // ---- panel superior izquierdo
    const x = 20, y = 20;
    ctx.fillStyle = 'rgba(10,12,10,0.55)';
    U.roundRect(ctx, x - 10, y - 10, 340, 96, 10);
    ctx.fill();
    // insignia de nivel
    ctx.fillStyle = '#1d2a33';
    ctx.beginPath();
    ctx.arc(x + 30, y + 38, 30, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + 30, y + 38, 28, -Math.PI / 2, -Math.PI / 2 + TAU * (p.xp / p.xpNext));
    ctx.stroke();
    this.text(ctx, 'NIVEL', x + 30, y + 28, 10, '#9fd8f0', 'center');
    this.text(ctx, String(p.level), x + 30, y + 52, 24, '#fff', 'center');

    const bx = x + 72, bw = 240;
    this.bar(ctx, bx, y + 4, bw, 20, p.hp / s.maxHp, p.hp / s.maxHp < 0.3 ? '#ff3b3b' : '#d93636', undefined,
      `${Math.ceil(p.hp)} / ${s.maxHp}`);
    const stColor = p.exhausted ? (Math.floor(g.time * 6) % 2 ? '#c76a1a' : '#8a4a12') : '#e8c547';
    this.bar(ctx, bx, y + 32, bw, 13, p.stamina / s.maxStamina, stColor);
    ctx.font = `bold 10px ${this.font}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.exhausted ? '#fff' : 'rgba(40,30,0,0.75)';
    ctx.fillText(p.exhausted ? 'AGOTADO' : 'ESTAMINA', bx + 6, y + 42);
    this.bar(ctx, bx, y + 54, bw, 9, p.xp / p.xpNext, '#4fc3f7');
    this.text(ctx, `XP ${Math.floor(p.xp)} / ${p.xpNext}`, bx + bw, y + 78, 11, '#9fd8f0', 'right', false);

    // ---- centro superior: reloj, día, amenaza
    const nightIcon = g.nightness > 0.5;
    this.text(ctx, U.formatTime(g.time), W / 2, 44, 32, '#fff', 'center');
    this.text(ctx, `${nightIcon ? '☾' : '☀'}  Día ${g.dayNumber} · ${g.clockString}`, W / 2, 66, 14, nightIcon ? '#9fb4ff' : '#ffe28a', 'center');
    const threat = g.director.threat;
    const tc = threat < 3 ? '#a8d86a' : threat < 6 ? '#ffc04d' : threat < 10 ? '#ff7a3d' : '#ff3b3b';
    this.text(ctx, `AMENAZA ${threat}`, W / 2, 86, 13, tc, 'center');

    // ---- derecha superior
    this.text(ctx, `☠ ${g.kills}`, W - 24, 42, 26, '#e6e6e6', 'right');
    this.text(ctx, `Zombis activos: ${g.zombies.length}`, W - 24, 62, 12, '#bbb', 'right', false);
    if (g.best && g.best.time > 0) this.text(ctx, `Récord: ${U.formatTime(g.best.time)}`, W - 24, 80, 12, '#ffd166', 'right', false);
    const nh = g.director.nextHorde - g.time;
    if (nh > 0 && nh < 30) this.text(ctx, `Horda en ${Math.ceil(nh)}s`, W - 24, 98, 13, '#ff6b6b', 'right');

    // ---- armas (centro inferior)
    const slotW = 88, slotH = 58, gap = 8;
    const total = WEAPON_ORDER.length * slotW + (WEAPON_ORDER.length - 1) * gap;
    let sx = W / 2 - total / 2;
    const sy = H - slotH - 18;
    WEAPON_ORDER.forEach((id, i) => {
      const st = p.weapons[id], w = WEAPONS[id], cur = id === p.current;
      ctx.fillStyle = cur ? 'rgba(255,210,90,0.22)' : 'rgba(10,12,10,0.6)';
      U.roundRect(ctx, sx, sy, slotW, slotH, 8);
      ctx.fill();
      ctx.strokeStyle = cur ? '#ffd25a' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = cur ? 2.5 : 1;
      ctx.stroke();
      ctx.globalAlpha = st.owned ? 1 : 0.3;
      this.text(ctx, String(i + 1), sx + 8, sy + 15, 11, '#aaa');
      this.text(ctx, st.owned ? w.name : '???', sx + slotW / 2, sy + 30, 13, cur ? '#ffe08a' : '#ddd', 'center');
      if (st.owned) {
        const ammo = w.melee ? '∞' : `${st.mag} / ${st.reserve}`;
        const ac = !w.melee && st.mag === 0 && st.reserve === 0 ? '#ff6b6b' : '#fff';
        this.text(ctx, ammo, sx + slotW / 2, sy + 49, 14, ac, 'center');
      }
      ctx.globalAlpha = 1;
      sx += slotW + gap;
    });
    if (p.reloadT > 0) {
      this.bar(ctx, W / 2 - 80, sy - 22, 160, 8, 1 - p.reloadT / p.reloadTotal, '#ffd25a');
      this.text(ctx, 'RECARGANDO', W / 2, sy - 28, 11, '#ffd25a', 'center');
    }

    // ---- minimapa
    this.drawMinimap(ctx, W - 200, H - 200);

    // ---- mensajes
    let my = 112;
    for (const m of g.messages) {
      const a = Math.min(1, m.t / 0.5, (m.max - m.t + 0.01) / 0.25);
      ctx.globalAlpha = U.clamp(a, 0, 1);
      const size = m.big ? 30 : 18;
      my += size;
      this.text(ctx, m.text, W / 2, my, m.big ? size + Math.sin(g.time * 10) * 2 : size, m.color, 'center');
      my += 10;
    }
    ctx.globalAlpha = 1;

    // ---- controles (primeros segundos)
    if (g.time < 14) {
      ctx.globalAlpha = Math.min(1, (14 - g.time) / 2);
      const lines = ['WASD mover · Ratón apuntar · Clic atacar', 'Shift correr · Espacio rodar · R recargar', '1-4 / rueda cambiar arma · Esc pausa · M silencio'];
      lines.forEach((l, i) => this.text(ctx, l, 24, H - 76 + i * 20, 13, '#ddd', 'left', false));
      ctx.globalAlpha = 1;
    }

    // ---- mira
    if (g.state === 'playing') this.drawCrosshair(ctx);
  }

  drawMinimap(ctx, x, y) {
    const g = this.g, r = g.renderer, k = r.mmScale, S = 180;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    U.roundRect(ctx, x - 4, y - 4, S + 8, S + 8, 6);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(r.minimap, x, y);
    ctx.globalAlpha = 1;
    // vista actual
    const hw = g.cw / 2 / g.zoom, hh = g.ch / 2 / g.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + (g.cam.x - hw) * k, y + (g.cam.y - hh) * k, hw * 2 * k, hh * 2 * k);
    ctx.fillStyle = '#ff4a3a';
    for (const z of g.zombies) {
      const s = z.type === 'brute' ? 3 : 2;
      ctx.fillRect(x + z.x * k - s / 2, y + z.y * k - s / 2, s, s);
    }
    for (const p of g.pickups) {
      if (p.type !== 'crate') continue;
      ctx.fillStyle = Math.floor(g.time * 4) % 2 ? '#ffd34d' : '#fff';
      ctx.fillRect(x + p.x * k - 3, y + p.y * k - 3, 6, 6);
    }
    const p = g.player;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + p.x * k, y + p.y * k, 3.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawCrosshair(ctx) {
    const g = this.g, p = g.player, mx = Input.mouse.x, my = Input.mouse.y;
    const w = p.weapon;
    const spread = w.melee ? 6 : 6 + w.spread * 60 + Math.max(0, p.attackCd) * 20;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(mx + dx * spread, my + dy * spread);
      ctx.lineTo(mx + dx * (spread + 7), my + dy * (spread + 7));
    }
    ctx.stroke();
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    if (p.reloadT > 0) {
      ctx.strokeStyle = '#ffd25a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, spread + 12, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.reloadT / p.reloadTotal));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}
