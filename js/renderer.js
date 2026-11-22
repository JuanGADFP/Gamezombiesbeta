'use strict';

// Dibujo del mundo en vista cenital con cámara alta (estilo 3/4)
class Renderer {
  constructor(game) {
    this.g = game;
    this.groundPattern = null;
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.minimap = document.createElement('canvas');
  }

  resize() {
    this.dark.width = Math.ceil(this.g.cw / 2);
    this.dark.height = Math.ceil(this.g.ch / 2);
  }

  onNewWorld() {
    if (!this.groundPattern) this.groundPattern = this.makeGround();
    this.buildMinimap();
  }

  makeGround() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#3a4a2c';
    x.fillRect(0, 0, 512, 512);
    const blot = (n, colors, r0, r1) => {
      for (let i = 0; i < n; i++) {
        x.fillStyle = U.choice(colors);
        const px = Math.random() * 512, py = Math.random() * 512, r = U.rand(r0, r1);
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          x.beginPath();
          x.arc(px + ox, py + oy, r, 0, TAU);
          x.fill();
        }
      }
    };
    blot(60, ['rgba(70,90,45,0.35)', 'rgba(45,60,30,0.35)', 'rgba(90,85,50,0.25)'], 20, 60);
    blot(500, ['rgba(80,100,50,0.3)', 'rgba(40,55,28,0.35)', 'rgba(100,95,60,0.2)'], 2, 9);
    x.lineWidth = 1.2;
    for (let i = 0; i < 1600; i++) {
      const px = Math.random() * 512, py = Math.random() * 512;
      x.strokeStyle = U.choice(['rgba(110,140,70,0.45)', 'rgba(50,70,35,0.5)', 'rgba(130,150,80,0.3)']);
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + U.rand(-2, 2), py - U.rand(3, 6));
      x.stroke();
    }
    return this.g.ctx.createPattern(c, 'repeat');
  }

  buildMinimap() {
    const w = this.g.world, S = 180, k = S / w.w;
    this.minimap.width = this.minimap.height = S;
    const m = this.minimap.getContext('2d');
    m.fillStyle = '#26321f';
    m.fillRect(0, 0, S, S);
    m.fillStyle = '#4a4a4f';
    for (const r of w.roads) m.fillRect(r.x * k, r.y * k, Math.max(1.5, r.w * k), Math.max(1.5, r.h * k));
    for (const o of w.obstacles) {
      if (o.kind === 'building') { m.fillStyle = '#8a7f72'; m.fillRect(o.x * k, o.y * k, o.w * k, o.h * k); }
      else if (o.kind === 'tree') { m.fillStyle = '#1d3a1a'; m.fillRect(o.x * k - 1, o.y * k - 1, 2.2, 2.2); }
    }
    this.mmScale = k;
  }

  view() {
    const g = this.g, hw = g.cw / 2 / g.zoom, hh = g.ch / 2 / g.zoom;
    return { x0: g.cam.x - hw - 60, x1: g.cam.x + hw + 60, y0: g.cam.y - hh - 80, y1: g.cam.y + hh + 120 };
  }

  render(ctx) {
    const g = this.g, v = this.view();
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, g.cw, g.ch);
    ctx.save();
    ctx.translate(g.cw / 2, g.ch / 2);
    ctx.scale(g.zoom, g.zoom);
    ctx.translate(-g.cam.x + g.cam.sx, -g.cam.y + g.cam.sy);

    this.drawGround(ctx, v);
    this.drawDecals(ctx, v);
    this.drawLowObstacles(ctx, v);
    for (const p of g.pickups) if (this.inView(p.x, p.y, v)) this.drawPickup(ctx, p);

    // entidades ordenadas por Y
    const ents = [];
    for (const z of g.zombies) if (this.inView(z.x, z.y, v)) ents.push(z);
    if (g.state !== 'menu' && (g.player.alive || g.deathT > 0)) ents.push(g.player);
    for (const e of ents) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(e.x + 4, e.y + 6, e.radius * 1.05, e.radius * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e === g.player) this.drawPlayer(ctx, e);
      else this.drawZombie(ctx, e);
    }

    for (const pr of g.projectiles) if (this.inView(pr.x, pr.y, v)) this.drawProjectile(ctx, pr);
    this.drawTallObstacles(ctx, v);
    g.particles.render(ctx, v);
    ctx.restore();

    this.drawDarkness(ctx);
    this.drawIndicators(ctx);
  }

  inView(x, y, v) {
    return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1;
  }

  // ---------------------------------------------------------------- suelo
  drawGround(ctx, v) {
    const w = this.g.world;
    ctx.fillStyle = this.groundPattern;
    ctx.fillRect(Math.max(0, v.x0), Math.max(0, v.y0), Math.min(w.w, v.x1) - Math.max(0, v.x0), Math.min(w.h, v.y1) - Math.max(0, v.y0));

    // calles
    for (const r of w.roads) {
      if (r.x > v.x1 || r.x + r.w < v.x0 || r.y > v.y1 || r.y + r.h < v.y0) continue;
      ctx.fillStyle = '#6d6a62';
      if (r.dir === 'h') ctx.fillRect(Math.max(r.x, v.x0), r.y - 10, Math.min(r.w, v.x1 - v.x0), r.h + 20);
      else ctx.fillRect(r.x - 10, Math.max(r.y, v.y0), r.w + 20, Math.min(r.h, v.y1 - v.y0));
    }
    for (const r of w.roads) {
      if (r.x > v.x1 || r.x + r.w < v.x0 || r.y > v.y1 || r.y + r.h < v.y0) continue;
      ctx.fillStyle = '#34353a';
      if (r.dir === 'h') ctx.fillRect(Math.max(r.x, v.x0), r.y, Math.min(r.w, v.x1 - v.x0), r.h);
      else ctx.fillRect(r.x, Math.max(r.y, v.y0), r.w, Math.min(r.h, v.y1 - v.y0));
    }
    // líneas centrales discontinuas
    ctx.fillStyle = 'rgba(220,190,90,0.7)';
    for (const r of w.roads) {
      if (r.dir === 'h') {
        if (r.y > v.y1 || r.y + r.h < v.y0) continue;
        const cy = r.y + r.h / 2;
        for (let x = Math.floor(v.x0 / 70) * 70; x < v.x1; x += 70) {
          if (this.crossesRoad(x + 17, cy, 'v')) continue;
          ctx.fillRect(x, cy - 2, 34, 4);
        }
      } else {
        if (r.x > v.x1 || r.x + r.w < v.x0) continue;
        const cx = r.x + r.w / 2;
        for (let y = Math.floor(v.y0 / 70) * 70; y < v.y1; y += 70) {
          if (this.crossesRoad(cx, y + 17, 'h')) continue;
          ctx.fillRect(cx - 2, y, 4, 34);
        }
      }
    }

    // decoración
    for (const d of w.decor) {
      if (!this.inView(d.x, d.y, v)) continue;
      if (d.t === 0) {
        ctx.strokeStyle = ['#5f7d3a', '#6e8a42', '#4f6a30', '#7a8f4a'][d.c];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(d.x + i * 3, d.y);
          ctx.lineTo(d.x + i * 5 * d.s, d.y - 8 * d.s);
        }
        ctx.stroke();
      } else if (d.t === 1) {
        ctx.fillStyle = ['#d9d36a', '#e6e6e6', '#c46aa0', '#d98a4a'][d.c];
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2 * d.s, 0, TAU);
        ctx.fill();
      } else if (d.t === 2) {
        ctx.fillStyle = 'rgba(120,115,100,0.8)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 4 * d.s, 3 * d.s, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(30,40,20,0.35)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 14 * d.s, 8 * d.s, 0, 0, TAU);
        ctx.fill();
      }
    }

    // fuera del mapa
    ctx.fillStyle = '#0d0f0b';
    if (v.x0 < 0) ctx.fillRect(v.x0, v.y0, -v.x0, v.y1 - v.y0);
    if (v.y0 < 0) ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, -v.y0);
    if (v.x1 > w.w) ctx.fillRect(w.w, v.y0, v.x1 - w.w, v.y1 - v.y0);
    if (v.y1 > w.h) ctx.fillRect(v.x0, w.h, v.x1 - v.x0, v.y1 - w.h);
    ctx.strokeStyle = '#5a4a35';
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 10]);
    ctx.strokeRect(0, 0, w.w, w.h);
    ctx.setLineDash([]);
  }

  crossesRoad(x, y, dir) {
    for (const r of this.g.world.roads) {
      if (r.dir === dir && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  drawDecals(ctx, v) {
    for (const d of this.g.decals) {
      if (!this.inView(d.x, d.y, v)) continue;
      const a = Math.min(1, d.life / 4);
      ctx.globalAlpha = a * (d.kind === 'corpse' ? 0.9 : 0.75);
      if (d.kind === 'corpse') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = '#4a0a0a';
        ctx.beginPath();
        ctx.ellipse(4, 2, d.r * 1.5, d.r * 1.1, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = d.shirt;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 0.9, d.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = d.skin;
        ctx.beginPath();
        ctx.arc(d.r * 0.9, 0, d.r * 0.45, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = d.kind === 'acid' ? '#6f9a22' : d.kind === 'scorch' ? '#141210' : '#5e0909';
        for (const b of d.blobs) {
          ctx.beginPath();
          ctx.arc(d.x + b[0], d.y + b[1], b[2], 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- obstáculos
  drawLowObstacles(ctx, v) {
    for (const o of this.g.world.obstacles) {
      if (!this.obInView(o, v)) continue;
      if (o.kind === 'building') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(o.x + 10, o.y + 6, o.w, o.h + 4);
      } else if (o.kind === 'tree') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(o.x + 14, o.y + 10, o.canopy * 0.9, o.canopy * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#4a3523';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * 0.7, 0, TAU);
        ctx.fill();
      } else if (o.kind === 'rock') {
        this.drawRock(ctx, o);
      } else if (o.kind === 'car') {
        this.drawCar(ctx, o);
      }
    }
  }

  drawTallObstacles(ctx, v) {
    const p = this.g.player;
    const list = this.g.world.obstacles.filter(o => (o.kind === 'building' || o.kind === 'tree') && this.obInView(o, v));
    list.sort((a, b) => (a.y + (a.h || 0)) - (b.y + (b.h || 0)));
    for (const o of list) {
      if (o.kind === 'building') {
        const behind = p.x > o.x - 10 && p.x < o.x + o.w + 10 && p.y > o.y - o.height - 20 && p.y < o.y + 10;
        ctx.globalAlpha = behind ? 0.45 : 1;
        this.drawBuilding(ctx, o);
        ctx.globalAlpha = 1;
      } else {
        const under = U.dist2(p.x, p.y, o.x, o.y - 18) < o.canopy * o.canopy;
        ctx.globalAlpha = under ? 0.45 : 0.97;
        this.drawCanopy(ctx, o);
        ctx.globalAlpha = 1;
      }
    }
  }

  obInView(o, v) {
    if (o.shape === 'rect') return o.x < v.x1 && o.x + o.w > v.x0 && o.y - 60 < v.y1 && o.y + o.h > v.y0;
    const r = o.canopy || o.r;
    return o.x + r > v.x0 && o.x - r < v.x1 && o.y + r > v.y0 && o.y - r - 30 < v.y1;
  }

  drawBuilding(ctx, o) {
    const H = o.height;
    // muro frontal (cara sur)
    ctx.fillStyle = o.wall;
    ctx.fillRect(o.x, o.y + o.h - H, o.w, H);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(o.x, o.y + o.h - 6, o.w, 6);
    // ventanas
    const nWin = Math.floor(o.w / 46);
    for (let i = 0; i < nWin; i++) {
      const wx = o.x + (o.w / nWin) * (i + 0.5) - 9;
      ctx.fillStyle = '#2b3138';
      ctx.fillRect(wx, o.y + o.h - H + 9, 18, H - 20);
      ctx.fillStyle = 'rgba(120,140,160,0.25)';
      ctx.fillRect(wx + 2, o.y + o.h - H + 11, 6, H - 24);
    }
    // tejado
    const rx = o.x, ry = o.y - H, rw = o.w, rh = o.h;
    ctx.fillStyle = o.roof;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
    if (o.ridge === 'h') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(rx, ry, rw, rh / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(rx, ry + rh / 2 - 1.5, rw, 3);
    } else if (o.ridge === 'v') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(rx, ry, rw / 2, rh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(rx + rw / 2 - 1.5, ry, 3, rh);
    } else {
      // tejado plano con textura
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      for (let yy = ry + 14; yy < ry + rh; yy += 14) {
        ctx.beginPath();
        ctx.moveTo(rx + 4, yy);
        ctx.lineTo(rx + rw - 4, yy);
        ctx.stroke();
      }
      if (o.ac) {
        ctx.fillStyle = '#9aa0a6';
        ctx.fillRect(rx + rw * 0.6, ry + rh * 0.25, 26, 20);
        ctx.fillStyle = '#5c6166';
        ctx.beginPath();
        ctx.arc(rx + rw * 0.6 + 13, ry + rh * 0.25 + 10, 7, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawCanopy(ctx, o) {
    const cx = o.x, cy = o.y - 18, R = o.canopy;
    ctx.fillStyle = o.tint;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,200,0.07)';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + o.r;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.45 - R * 0.1, cy + Math.sin(a) * R * 0.45 - R * 0.1, R * 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(cx + R * 0.2, cy + R * 0.25, R * 0.6, 0, TAU);
    ctx.fill();
  }

  drawRock(ctx, o) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(o.x + 5, o.y + 6, o.r, o.r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ['#7b7a75', '#6a6964', '#8a877f'][o.shade];
    ctx.beginPath();
    const n = o.pts.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = o.r * o.pts[i];
      const x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.3, o.r * 0.45, 0, TAU);
    ctx.fill();
  }

  drawCar(ctx, o) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    if (o.vertical) ctx.rotate(Math.PI / 2);
    const L = Math.max(o.w, o.h), W = Math.min(o.w, o.h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    U.roundRect(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 8);
    ctx.fill();
    ctx.fillStyle = o.burnt ? '#2a2725' : o.color;
    U.roundRect(ctx, -L / 2, -W / 2, L, W, 8);
    ctx.fill();
    ctx.fillStyle = o.burnt ? '#1a1817' : 'rgba(25,35,45,0.85)';
    U.roundRect(ctx, -L * 0.18, -W / 2 + 4, L * 0.42, W - 8, 4);
    ctx.fill();
    ctx.fillStyle = o.burnt ? 'rgba(60,50,40,0.6)' : 'rgba(255,255,255,0.15)';
    U.roundRect(ctx, -L * 0.1, -W / 2 + 6, L * 0.26, W - 12, 3);
    ctx.fill();
    if (!o.burnt) {
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(L / 2 - 4, -W / 2 + 4, 3, 7);
      ctx.fillRect(L / 2 - 4, W / 2 - 11, 3, 7);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- personajes
  drawPlayer(ctx, p) {
    const g = this.g;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!p.alive) {
      ctx.globalAlpha = Math.max(0, g.deathT / 1.6);
      ctx.fillStyle = '#5e0909';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 16, 0, 0, TAU);
      ctx.fill();
    }
    // línea de mira
    const w = p.weapon;
    if (p.alive && !w.melee) {
      const grad = ctx.createLinearGradient(0, 0, Math.cos(p.angle) * 220, Math.sin(p.angle) * 220);
      grad.addColorStop(0, 'rgba(255,80,60,0.35)');
      grad.addColorStop(1, 'rgba(255,80,60,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(p.angle) * 26, Math.sin(p.angle) * 26);
      ctx.lineTo(Math.cos(p.angle) * 220, Math.sin(p.angle) * 220);
      ctx.stroke();
    }
    // arco del machetazo
    if (p.swingT > 0) {
      const prog = 1 - p.swingT / 0.16;
      ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - prog)})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, WEAPONS.machete.range + 8, p.swingAngle - WEAPONS.machete.arc / 2, p.swingAngle + WEAPONS.machete.arc / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.rotate(p.angle);
    const flash = p.hurtT > 0 && Math.floor(p.hurtT * 30) % 2 === 0;
    if (p.dodgeT > 0) ctx.globalAlpha = 0.65;
    const step = p.moving ? Math.sin(p.walkCycle) * 3 : 0;

    // arma y brazos
    const skin = flash ? '#fff' : '#e0b48c';
    if (w.melee) {
      let ba = 0.9;
      if (p.swingT > 0) {
        const prog = 1 - p.swingT / 0.16;
        ba = U.lerp(-WEAPONS.machete.arc / 2, WEAPONS.machete.arc / 2, prog) * p.swingDir;
      }
      ctx.save();
      ctx.rotate(ba);
      ctx.fillStyle = '#3b2b1d';
      ctx.fillRect(10, -2, 10, 4);
      ctx.fillStyle = '#c9ccd1';
      ctx.beginPath();
      ctx.moveTo(20, -3);
      ctx.lineTo(46, -4);
      ctx.lineTo(50, 0);
      ctx.lineTo(20, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(11, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(4, -12 - step * 0.3, 4.5, 0, TAU);
      ctx.fill();
    } else {
      const len = { pistol: 14, shotgun: 26, rifle: 30 }[p.current];
      const kick = p.muzzleT > 0 ? -3 : 0;
      ctx.fillStyle = '#222';
      ctx.fillRect(12 + kick, -2.5, len, 5);
      if (p.current !== 'pistol') {
        ctx.fillStyle = p.current === 'shotgun' ? '#6b4a2b' : '#3a3f36';
        ctx.fillRect(4 + kick, -3.5, 12, 7);
      }
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(13 + kick, 3, 4.5, 0, TAU);
      ctx.arc(p.current === 'pistol' ? 14 + kick : 22 + kick, -2, 4.5, 0, TAU);
      ctx.fill();
      if (p.muzzleT > 0) {
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(14 + len, 0, 7, 0, TAU);
        ctx.fill();
      }
    }
    // cuerpo
    ctx.fillStyle = flash ? '#fff' : '#3f5f7a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#5a3f2a';
    ctx.fillRect(-9, -3, 4, 6); // mochila
    // cabeza
    ctx.fillStyle = flash ? '#fff' : '#e0b48c';
    ctx.beginPath();
    ctx.arc(1, 0, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#3a2616';
    ctx.beginPath();
    ctx.arc(-1, 0, 6.5, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.restore();
  }

  drawZombie(ctx, z) {
    const T = z.T, r = z.radius;
    ctx.save();
    ctx.translate(z.x, z.y);
    if (z.spawnT > 0) ctx.globalAlpha = 1 - z.spawnT / 0.4;
    let sc = 1;
    if (z.type === 'bloater') sc = 1 + Math.sin(z.wobble * 2) * 0.04 + (z.fuse >= 0 ? (1 - z.fuse / T.fuse) * 0.4 : 0);
    ctx.rotate(z.angle);
    ctx.scale(sc, sc);
    const flash = z.hitFlash > 0;
    const fuseBlink = z.fuse >= 0 && Math.floor(z.fuse * 16) % 2 === 0;
    const skin = flash ? '#fff' : fuseBlink ? '#ff5a3a' : T.skin;
    const sw = Math.sin(z.walk) * r * 0.18;
    const lunge = z.lunge > 0 ? 5 : 0;

    if (z.type !== 'bloater') {
      // brazos extendidos
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(r * 0.75 + sw + lunge, -r * 0.55, r * 0.5, r * 0.17, 0, 0, TAU);
      ctx.ellipse(r * 0.75 - sw + lunge, r * 0.55, r * 0.5, r * 0.17, 0, 0, TAU);
      ctx.fill();
    }
    if (z.type === 'bloater') {
      ctx.fillStyle = flash ? '#fff' : fuseBlink ? '#ff5a3a' : '#7c8a3c';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#b5c25a';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(r * 0.6, 0, r * 0.38, 0, TAU);
      ctx.fill();
    } else {
      // torso
      ctx.fillStyle = flash ? '#fff' : (z.type === 'brute' ? '#3a3328' : z.shirt);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.6, r, 0, 0, TAU);
      ctx.fill();
      if (z.type === 'spitter') {
        ctx.fillStyle = flash ? '#fff' : '#b8e04a';
        ctx.beginPath();
        ctx.arc(-r * 0.45, 0, r * 0.45, 0, TAU);
        ctx.fill();
      }
      if (z.type === 'brute') {
        ctx.fillStyle = 'rgba(120,20,20,0.6)';
        ctx.fillRect(-r * 0.2, -r * 0.6, r * 0.25, r * 0.5);
      }
      // cabeza
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(r * 0.12, 0, r * (z.type === 'brute' ? 0.42 : 0.52), 0, TAU);
      ctx.fill();
    }
    // ojos
    ctx.fillStyle = z.type === 'spitter' ? '#e8ff6a' : '#ff3b2f';
    const ex = r * (z.type === 'bloater' ? 0.8 : 0.45);
    ctx.fillRect(ex, -r * 0.2 - 1, 2.5, 2.5);
    ctx.fillRect(ex, r * 0.2 - 1, 2.5, 2.5);
    ctx.restore();

    if (z.hp < z.maxHp) {
      const w = Math.max(20, r * 2), f = Math.max(0, z.hp / z.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(z.x - w / 2 - 1, z.y - r - 12, w + 2, 5);
      ctx.fillStyle = f > 0.5 ? '#c0d94a' : f > 0.25 ? '#e0a03a' : '#d94a3a';
      ctx.fillRect(z.x - w / 2, z.y - r - 11, w * f, 3);
    }
  }

  drawProjectile(ctx, pr) {
    if (pr.kind === 'acid') {
      ctx.fillStyle = '#9bd13a';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,255,120,0.6)';
      ctx.beginPath();
      ctx.arc(pr.x - 2, pr.y - 2, pr.radius * 0.4, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = pr.crit ? '#ff7b3a' : '#ffe08a';
    ctx.lineWidth = pr.crit ? 3 : 2.2;
    ctx.beginPath();
    ctx.moveTo(pr.x - pr.vx * 0.022, pr.y - pr.vy * 0.022);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
  }

  drawPickup(ctx, p) {
    const bob = Math.sin(p.t * 4) * 2;
    const blink = p.life < 6 && Math.floor(p.life * 6) % 2 === 0;
    if (blink) return;
    if (p.type === 'xp') {
      const r = 3 + Math.min(4, p.value * 0.25);
      ctx.fillStyle = 'rgba(80,200,255,0.25)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, r * 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7fe3ff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r + bob);
      ctx.lineTo(p.x + r * 0.8, p.y + bob);
      ctx.lineTo(p.x, p.y + r + bob);
      ctx.lineTo(p.x - r * 0.8, p.y + bob);
      ctx.closePath();
      ctx.fill();
    } else if (p.type === 'ammo') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(p.x - 9, p.y - 3, 20, 12);
      ctx.fillStyle = '#5a6b3a';
      ctx.fillRect(p.x - 10, p.y - 7 + bob, 20, 13);
      ctx.fillStyle = '#d4a645';
      for (let i = 0; i < 4; i++) ctx.fillRect(p.x - 7 + i * 4, p.y - 11 + bob, 2.5, 6);
    } else if (p.type === 'med') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(p.x - 9, p.y - 3, 20, 14);
      ctx.fillStyle = '#eee';
      U.roundRect(ctx, p.x - 10, p.y - 9 + bob, 20, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#d33';
      ctx.fillRect(p.x - 2, p.y - 6 + bob, 4, 10);
      ctx.fillRect(p.x - 6, p.y - 3 + bob, 12, 4);
    } else if (p.type === 'crate') {
      const pulse = 0.5 + Math.sin(p.t * 5) * 0.5;
      ctx.fillStyle = `rgba(255,210,60,${0.15 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46 + pulse * 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(p.x - 16, p.y - 10, 36, 30);
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(p.x - 18, p.y - 18, 36, 32);
      ctx.strokeStyle = '#5a4322';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 18, p.y - 18, 36, 32);
      ctx.beginPath();
      ctx.moveTo(p.x - 18, p.y - 18);
      ctx.lineTo(p.x + 18, p.y + 14);
      ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(p.x - 6, p.y - 22, 12, 6);
      if (Math.random() < 0.3) this.g.particles.add(p.x + U.rand(-4, 4), p.y - 24, U.rand(-8, 8), U.rand(-40, -20), 1.5, 6, 'rgba(255,90,60,0.5)', 0.5);
    }
  }

  // ---------------------------------------------------------------- noche e indicadores
  drawDarkness(ctx) {
    const g = this.g, n = g.nightness;
    const dusk = Math.max(0, 1 - Math.abs(g.dayPhase - 0.5) / 0.06) * 0.5 + Math.max(0, 1 - Math.abs(g.dayPhase - 0.95) / 0.05) * 0.3;
    if (dusk > 0.01) {
      ctx.fillStyle = `rgba(255,120,40,${dusk * 0.18})`;
      ctx.fillRect(0, 0, g.cw, g.ch);
    }
    if (n < 0.02) return;
    const dc = this.dctx, D = this.dark, s = 0.5;
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, D.width, D.height);
    dc.fillStyle = `rgba(4,6,20,${0.9 * n})`;
    dc.fillRect(0, 0, D.width, D.height);
    dc.globalCompositeOperation = 'destination-out';
    const p = g.player, z = g.zoom * s;
    const ps = g.worldToScreen(p.x, p.y);
    const px = ps.x * s, py = ps.y * s;
    // halo alrededor del jugador
    let gr = dc.createRadialGradient(px, py, 0, px, py, 170 * z);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    dc.fillStyle = gr;
    dc.beginPath();
    dc.arc(px, py, 170 * z, 0, TAU);
    dc.fill();
    // linterna
    if (p.alive) {
      const L = 520 * z, half = 0.42;
      gr = dc.createRadialGradient(px, py, 20 * z, px, py, L);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)');
      gr.addColorStop(0.7, 'rgba(0,0,0,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = gr;
      dc.beginPath();
      dc.moveTo(px, py);
      dc.arc(px, py, L, p.angle - half, p.angle + half);
      dc.closePath();
      dc.fill();
    }
    // luces temporales (disparos, explosiones) y suministros
    const lights = g.lights.slice();
    for (const pk of g.pickups) if (pk.type === 'crate') lights.push({ x: pk.x, y: pk.y, r: 110, t: 1, max: 1 });
    for (const l of lights) {
      const ls = g.worldToScreen(l.x, l.y), lx = ls.x * s, ly = ls.y * s, r = l.r * z;
      if (lx < -r || ly < -r || lx > D.width + r || ly > D.height + r) continue;
      gr = dc.createRadialGradient(lx, ly, 0, lx, ly, r);
      gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, l.t / l.max)})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = gr;
      dc.beginPath();
      dc.arc(lx, ly, r, 0, TAU);
      dc.fill();
    }
    // ojos de zombis brillando en la oscuridad
    dc.globalCompositeOperation = 'source-over';
    if (n > 0.5) {
      dc.fillStyle = `rgba(255,60,40,${(n - 0.5) * 1.6})`;
      for (const zb of g.zombies) {
        const zs = g.worldToScreen(zb.x, zb.y);
        if (zs.x < 0 || zs.y < 0 || zs.x > g.cw || zs.y > g.ch) continue;
        const ex = Math.cos(zb.angle) * zb.radius * 0.45 * g.zoom, ey = Math.sin(zb.angle) * zb.radius * 0.45 * g.zoom;
        const ox = -Math.sin(zb.angle) * 3 * g.zoom, oy = Math.cos(zb.angle) * 3 * g.zoom;
        dc.fillRect((zs.x + ex + ox) * s - 0.6, (zs.y + ey + oy) * s - 0.6, 1.3, 1.3);
        dc.fillRect((zs.x + ex - ox) * s - 0.6, (zs.y + ey - oy) * s - 0.6, 1.3, 1.3);
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(D, 0, 0, g.cw, g.ch);
  }

  drawIndicators(ctx) {
    const g = this.g;
    // flecha hacia el suministro
    for (const pk of g.pickups) {
      if (pk.type !== 'crate' || g.isOnScreen(pk.x, pk.y, -20)) continue;
      const s = g.worldToScreen(pk.x, pk.y);
      const cx = g.cw / 2, cy = g.ch / 2, a = Math.atan2(s.y - cy, s.x - cx);
      const mx = 60, mTop = 130, mBot = 110;
      const ca = Math.cos(a), sa = Math.sin(a);
      const kx = (g.cw / 2 - mx) / Math.abs(ca || 0.001);
      const ky = (sa < 0 ? g.ch / 2 - mTop : g.ch / 2 - mBot) / Math.abs(sa || 0.001);
      const k = Math.min(kx, ky);
      const ax = cx + ca * k, ay = cy + sa * k;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const dist = Math.round(U.dist(g.player.x, g.player.y, pk.x, pk.y) / 10);
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(`${dist} m`, ax - Math.cos(a) * 26, ay - Math.sin(a) * 26 + 4);
    }
  }
}
