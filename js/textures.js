'use strict';

// Texturas procedurales (canvas) para un look realista sin archivos externos
const Tex = {
  mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    return c;
  },

  toTex(canvas, repeat = true, srgb = true) {
    const t = new THREE.CanvasTexture(canvas);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Tex.maxAniso || 4;
    return t;
  },

  // ruido de baja frecuencia que se repite sin costuras
  blotches(ctx, size, cells, amp, alpha = 1) {
    const s = this.mk(cells * 3, cells * 3), x = s.getContext('2d');
    const id = x.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) {
      const v = 128 + (Math.random() - 0.5) * 2 * amp;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    const t = this.mk(cells), tx = t.getContext('2d');
    tx.putImageData(id, 0, 0);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) x.drawImage(t, a * cells, b * cells);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(s, cells - 0.5, cells - 0.5, cells + 1, cells + 1, 0, 0, size, size);
    ctx.restore();
  },

  fineNoise(ctx, w, h, amp, alpha = 1) {
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp * alpha;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(id, 0, 0);
  },

  surface(size, rgb, blotchAmp, noiseAmp, cells = 8) {
    const c = this.mk(size), x = c.getContext('2d');
    x.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    x.fillRect(0, 0, size, size);
    this.blotches(x, size, cells, blotchAmp);
    this.blotches(x, size, cells * 4, blotchAmp * 0.6, 0.7);
    this.fineNoise(x, size, size, noiseAmp);
    return c;
  },

  // ------------------------------------------------------------------ patrones base
  asphalt() {
    const c = this.surface(256, [58, 58, 60], 40, 26, 6), x = c.getContext('2d');
    for (let i = 0; i < 260; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(150,145,135,0.35)' : 'rgba(20,20,22,0.35)';
      x.fillRect(Math.random() * 256, Math.random() * 256, U.rand(1, 2.5), U.rand(1, 2.5));
    }
    return c;
  },
  concrete(rgb = [128, 124, 116]) {
    return this.surface(256, rgb, 30, 22, 6);
  },
  slabs() {
    const c = this.concrete([132, 128, 120]), x = c.getContext('2d');
    x.strokeStyle = 'rgba(40,38,34,0.55)';
    x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(${U.randInt(40, 90)},${U.randInt(40, 80)},${U.randInt(30, 60)},0.18)`;
      x.fillRect(U.randInt(0, 3) * 64, U.randInt(0, 3) * 64, 64, 64);
    }
    return c;
  },
  dirt() {
    const c = this.surface(256, [86, 78, 64], 50, 30, 5), x = c.getContext('2d');
    for (let i = 0; i < 400; i++) {
      x.fillStyle = U.choice(['rgba(120,112,98,0.6)', 'rgba(50,45,38,0.5)', 'rgba(95,95,70,0.4)']);
      x.beginPath();
      x.arc(Math.random() * 256, Math.random() * 256, U.rand(0.6, 2.4), 0, TAU);
      x.fill();
    }
    // hierba seca
    x.strokeStyle = 'rgba(110,105,60,0.5)';
    x.lineWidth = 1;
    for (let i = 0; i < 300; i++) {
      const px = Math.random() * 256, py = Math.random() * 256;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + U.rand(-2, 2), py - U.rand(2, 5)); x.stroke();
    }
    return c;
  },
  tiles() {
    const c = this.concrete([118, 104, 92]), x = c.getContext('2d');
    x.strokeStyle = 'rgba(40,32,28,0.5)';
    x.lineWidth = 1.5;
    for (let i = 0; i <= 256; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
    return c;
  },

  // ------------------------------------------------------------------ suelo completo de la ciudad
  buildGround(world) {
    const S = 4096, k = S / world.w;
    const c = this.mk(S), x = c.getContext('2d');
    x.scale(k, k);
    const pat = cv => x.createPattern(cv, 'repeat');
    const P = { asphalt: pat(this.asphalt()), slabs: pat(this.slabs()), dirt: pat(this.dirt()), tiles: pat(this.tiles()), concrete: pat(this.concrete([100, 98, 94])) };
    const RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK;

    x.fillStyle = P.dirt;
    x.fillRect(0, 0, world.w, world.h);

    // solares especiales
    for (const a of world.areas) {
      if (a.type === 'parking') {
        x.fillStyle = P.asphalt;
        x.fillRect(a.x, a.y, a.w, a.h);
        x.strokeStyle = 'rgba(210,205,190,0.45)';
        x.lineWidth = 2;
        for (let px = a.x + 10; px < a.x + a.w - 10; px += 56) {
          x.beginPath(); x.moveTo(px, a.y + 8); x.lineTo(px, a.y + 90); x.stroke();
          x.beginPath(); x.moveTo(px, a.y + a.h - 8); x.lineTo(px, a.y + a.h - 90); x.stroke();
        }
      } else if (a.type === 'plaza') {
        x.fillStyle = P.tiles;
        x.fillRect(a.x, a.y, a.w, a.h);
      } else if (a.type === 'building') {
        x.fillStyle = P.concrete;
        x.fillRect(a.x - 8, a.y - 8, a.w + 16, a.h + 16);
      } else if (a.type === 'ruin') {
        x.fillStyle = P.concrete;
        x.fillRect(a.x, a.y, a.w, a.h);
        x.fillStyle = 'rgba(60,55,50,0.35)';
        x.fillRect(a.x, a.y, a.w, a.h);
      }
    }

    // aceras y calzada
    for (const r of world.roads) {
      x.fillStyle = P.slabs;
      if (r.dir === 'h') x.fillRect(r.x, r.y - SW, r.w, r.h + SW * 2);
      else x.fillRect(r.x - SW, r.y, r.w + SW * 2, r.h);
    }
    for (const r of world.roads) {
      x.fillStyle = P.asphalt;
      x.fillRect(r.x, r.y, r.w, r.h);
    }
    // bordillos
    for (const r of world.roads) {
      x.fillStyle = 'rgba(170,165,155,0.9)';
      if (r.dir === 'h') { x.fillRect(r.x, r.y - 3, r.w, 3); x.fillRect(r.x, r.y + r.h, r.w, 3); }
      else { x.fillRect(r.x - 3, r.y, 3, r.h); x.fillRect(r.x + r.w, r.y, 3, r.h); }
    }
    for (const r of world.roads) {
      x.fillStyle = P.asphalt;
      for (const q of world.roads) {
        if (q.dir === r.dir) continue;
        x.fillRect(Math.max(r.x, q.x), Math.max(r.y, q.y), Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x), Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y));
      }
    }

    const inCross = (px, py, pad = 0) => world.intersections.some(i => Math.abs(px - i.x) < RW / 2 + pad && Math.abs(py - i.y) < RW / 2 + pad);

    // marcas viales desgastadas
    for (const r of world.roads) {
      const horiz = r.dir === 'h', len = horiz ? r.w : r.h;
      const c0 = horiz ? r.y + r.h / 2 : r.x + r.w / 2;
      for (let s = 0; s < len; s += 64) {
        const px = horiz ? r.x + s : c0, py = horiz ? c0 : r.y + s;
        if (inCross(px + (horiz ? 16 : 0), py + (horiz ? 0 : 16), 14) || Math.random() < 0.18) continue;
        x.fillStyle = `rgba(205,170,70,${U.rand(0.25, 0.6)})`;
        if (horiz) x.fillRect(px, py - 2, 32, 4); else x.fillRect(px - 2, py, 4, 32);
      }
      // líneas de borde
      x.fillStyle = 'rgba(200,198,190,0.22)';
      for (let s = 0; s < len; s += 40) {
        if (Math.random() < 0.25) continue;
        const a = horiz ? r.x + s : r.x + 8, b = horiz ? r.y + 8 : r.y + s;
        if (inCross(a, b, 4)) continue;
        if (horiz) { x.fillRect(a, b, 40, 2); x.fillRect(a, r.y + r.h - 10, 40, 2); }
        else { x.fillRect(a, b, 2, 40); x.fillRect(r.x + r.w - 10, b, 2, 40); }
      }
    }
    // pasos de cebra
    for (const i of world.intersections) {
      for (const side of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (Math.random() < 0.2) continue;
        const cx = i.x + side[0] * (RW / 2 + 22), cy = i.y + side[1] * (RW / 2 + 22);
        for (let s = -RW / 2 + 10; s < RW / 2 - 10; s += 16) {
          x.fillStyle = `rgba(215,212,200,${U.rand(0.2, 0.5)})`;
          if (side[0] === 0) x.fillRect(i.x + s, cy - 14, 9, 28);
          else x.fillRect(cx - 14, i.y + s, 28, 9);
        }
      }
    }

    // grietas
    x.lineCap = 'round';
    for (let n = 0; n < 1800; n++) {
      const r = U.choice(world.roads);
      let px = U.rand(r.x - 20, r.x + r.w + 20), py = U.rand(r.y - 20, r.y + r.h + 20);
      x.strokeStyle = `rgba(15,15,15,${U.rand(0.35, 0.7)})`;
      x.lineWidth = U.rand(0.6, 1.8);
      x.beginPath();
      x.moveTo(px, py);
      let a = U.rand(0, TAU);
      for (let s = 0, m = U.randInt(4, 12); s < m; s++) {
        a += U.rand(-0.8, 0.8);
        px += Math.cos(a) * U.rand(4, 14);
        py += Math.sin(a) * U.rand(4, 14);
        x.lineTo(px, py);
      }
      x.stroke();
    }
    // manchas: aceite, suciedad, sangre seca
    const blot = (px, py, r, col) => {
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(px, py, r, r * U.rand(0.5, 1), U.rand(0, TAU), 0, TAU);
      x.fill();
    };
    for (let n = 0; n < 500; n++) blot(U.rand(0, world.w), U.rand(0, world.h), U.rand(20, 90), `rgba(10,10,8,${U.rand(0.1, 0.3)})`);
    for (let n = 0; n < 160; n++) {
      const r = U.choice(world.roads);
      blot(U.rand(r.x, r.x + r.w), U.rand(r.y, r.y + r.h), U.rand(8, 22), 'rgba(5,5,5,0.55)');
    }
    for (let n = 0; n < 90; n++) {
      const px = U.rand(0, world.w), py = U.rand(0, world.h);
      for (let k2 = 0; k2 < 5; k2++) blot(px + U.rand(-14, 14), py + U.rand(-14, 14), U.rand(4, 14), 'rgba(70,8,6,0.55)');
      x.strokeStyle = 'rgba(70,10,8,0.35)';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + U.rand(-60, 60), py + U.rand(-60, 60));
      x.stroke();
    }
    // quemaduras y cráteres
    for (const s of world.scorches) blot(s.x, s.y, s.r, `rgba(8,6,4,${s.a || 0.8})`);
    for (const cr of world.craters) {
      blot(cr.x, cr.y, cr.r * 1.6, 'rgba(10,8,6,0.75)');
      x.fillStyle = 'rgba(30,26,22,0.9)';
      x.beginPath();
      x.arc(cr.x, cr.y, cr.r * 0.7, 0, TAU);
      x.fill();
      x.strokeStyle = 'rgba(120,110,95,0.5)';
      x.lineWidth = 4;
      x.stroke();
      for (let k2 = 0; k2 < 14; k2++) {
        const a = U.rand(0, TAU), d = U.rand(cr.r, cr.r * 1.8);
        x.fillStyle = 'rgba(90,85,78,0.8)';
        x.fillRect(cr.x + Math.cos(a) * d, cr.y + Math.sin(a) * d, U.rand(2, 6), U.rand(2, 6));
      }
    }
    // polvo de escombros alrededor de ruinas
    for (const o of world.obstacles) {
      if (o.kind === 'rubble') blot(o.x, o.y, o.r * 1.8, 'rgba(130,122,110,0.45)');
    }
    // alcantarillas
    for (let n = 0; n < 60; n++) {
      const r = U.choice(world.roads);
      const px = r.dir === 'h' ? U.rand(r.x, r.x + r.w) : r.x + r.w * U.choice([0.3, 0.7]);
      const py = r.dir === 'h' ? r.y + r.h * U.choice([0.3, 0.7]) : U.rand(r.y, r.y + r.h);
      if (inCross(px, py)) continue;
      x.fillStyle = '#2a2a2b';
      x.beginPath(); x.arc(px, py, 9, 0, TAU); x.fill();
      x.strokeStyle = '#4a4a4a'; x.lineWidth = 1.5; x.stroke();
      x.strokeStyle = 'rgba(80,80,80,0.6)';
      for (let l = -6; l <= 6; l += 3) { x.beginPath(); x.moveTo(px - 6, py + l); x.lineTo(px + 6, py + l); x.stroke(); }
    }
    const t = this.toTex(c, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  },

  // ------------------------------------------------------------------ fachadas (2 plantas x 4 vanos)
  facade(style, burnt) {
    const W = 512, H = 256, c = this.mk(W, H), x = c.getContext('2d');
    const e = this.mk(W, H), ex = e.getContext('2d');
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, W, H);
    const bases = [[150, 144, 132], [128, 70, 52], [92, 100, 108], U.choice([[168, 150, 120], [140, 150, 130], [160, 130, 120]])];
    const b = bases[style];
    x.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`;
    x.fillRect(0, 0, W, H);
    if (style === 1) {
      // ladrillo
      for (let y = 0; y < H; y += 10) {
        for (let xx = (y / 10) % 2 ? -12 : 0; xx < W; xx += 24) {
          const v = U.randInt(-18, 18);
          x.fillStyle = `rgb(${b[0] + v},${b[1] + v * 0.6},${b[2] + v * 0.5})`;
          x.fillRect(xx + 1, y + 1, 22, 8);
        }
      }
    } else if (style === 0) {
      x.strokeStyle = 'rgba(60,58,52,0.4)';
      x.lineWidth = 2;
      for (let y = 0; y <= H; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
      for (let xx = 0; xx <= W; xx += 128) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); }
    }
    this.blotches(x, Math.max(W, H), 8, 40, 0.8);
    // forjados
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, 124, W, 5);
    x.fillRect(0, 252, W, 4);

    for (let f = 0; f < 2; f++) {
      for (let bay = 0; bay < 4; bay++) {
        const office = style === 2;
        const wx = bay * 128 + (office ? 6 : 30), wy = f * 128 + (office ? 10 : 24);
        const ww = office ? 116 : 68, wh = office ? 104 : 74;
        const r = Math.random();
        const state = r < 0.38 ? 'dark' : r < 0.62 ? 'broken' : r < 0.8 ? 'boarded' : r < 0.9 ? 'burnt' : 'open';
        // marco / alféizar
        if (!office) {
          x.fillStyle = style === 1 ? 'rgba(200,190,170,0.9)' : 'rgba(210,205,195,0.6)';
          x.fillRect(wx - 5, wy + wh, ww + 10, 6);
          if (style === 1) { x.fillStyle = 'rgba(90,40,30,0.9)'; x.fillRect(wx - 4, wy - 7, ww + 8, 7); }
          x.fillStyle = 'rgba(40,40,40,0.8)';
          x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        }
        const gr = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
        gr.addColorStop(0, '#2c3540');
        gr.addColorStop(0.5, '#121820');
        gr.addColorStop(1, '#1d242c');
        x.fillStyle = gr;
        x.fillRect(wx, wy, ww, wh);
        if (state === 'dark' || state === 'open') {
          x.fillStyle = 'rgba(160,180,200,0.12)';
          x.beginPath(); x.moveTo(wx, wy + wh); x.lineTo(wx + ww * 0.4, wy); x.lineTo(wx + ww * 0.6, wy); x.lineTo(wx + ww * 0.2, wy + wh); x.fill();
          if ((state === 'open' && Math.random() < 0.35) || Math.random() < 0.02) {
            ex.fillStyle = Math.random() < 0.5 ? '#ffb45a' : '#ff6a2a';
            ex.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          }
        } else if (state === 'broken') {
          x.fillStyle = '#05070a';
          x.fillRect(wx, wy, ww, wh);
          x.fillStyle = 'rgba(120,140,160,0.3)';
          for (let s = 0; s < 4; s++) {
            const sx = wx + Math.random() * ww, sy = Math.random() < 0.5 ? wy : wy + wh;
            x.beginPath(); x.moveTo(sx - 8, sy); x.lineTo(sx + 8, sy); x.lineTo(sx + U.rand(-6, 6), sy + (sy === wy ? 1 : -1) * U.rand(10, 30)); x.fill();
          }
        } else if (state === 'boarded') {
          x.fillStyle = '#0a0a0a';
          x.fillRect(wx, wy, ww, wh);
          for (let p = 0; p < 4; p++) {
            const v = U.randInt(-15, 15);
            x.save();
            x.translate(wx + ww / 2, wy + 10 + p * (wh / 4));
            x.rotate(U.rand(-0.25, 0.25));
            x.fillStyle = `rgb(${120 + v},${88 + v},${55 + v})`;
            x.fillRect(-ww / 2 - 6, -6, ww + 12, 12);
            x.fillStyle = 'rgba(0,0,0,0.3)';
            x.fillRect(-ww / 2 - 6, 4, ww + 12, 2);
            x.restore();
          }
        } else {
          x.fillStyle = '#030303';
          x.fillRect(wx, wy, ww, wh);
        }
        if (office) {
          x.strokeStyle = 'rgba(70,75,80,0.95)';
          x.lineWidth = 4;
          x.strokeRect(wx, wy, ww, wh);
          x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.stroke();
        }
        // hollín encima de ventanas quemadas
        if (state === 'burnt' || (burnt && Math.random() < 0.6)) {
          const sg = x.createLinearGradient(0, wy + 10, 0, wy - 90);
          sg.addColorStop(0, 'rgba(5,5,5,0.85)');
          sg.addColorStop(1, 'rgba(5,5,5,0)');
          x.fillStyle = sg;
          x.beginPath();
          x.moveTo(wx - 4, wy + 10);
          x.quadraticCurveTo(wx + ww / 2, wy - 120, wx + ww + 4, wy + 10);
          x.fill();
        }
        // regueros de suciedad
        const dg = x.createLinearGradient(0, wy + wh, 0, wy + wh + 60);
        dg.addColorStop(0, 'rgba(30,26,20,0.35)');
        dg.addColorStop(1, 'rgba(30,26,20,0)');
        x.fillStyle = dg;
        x.fillRect(wx + 4, wy + wh + 4, ww - 8, 60);
      }
    }
    // impactos de bala y grietas
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(20,20,20,0.7)';
      x.beginPath(); x.arc(Math.random() * W, Math.random() * H, U.rand(0.8, 2), 0, TAU); x.fill();
    }
    x.strokeStyle = 'rgba(20,20,20,0.5)';
    for (let i = 0; i < 6; i++) {
      let px = Math.random() * W, py = Math.random() * H;
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 8; s++) { px += U.rand(-10, 10); py += U.rand(2, 10); x.lineTo(px, py); }
      x.stroke();
    }
    if (burnt) {
      x.fillStyle = 'rgba(15,12,10,0.45)';
      x.fillRect(0, 0, W, H);
    }
    this.fineNoise(x, W, H, 18);
    return { map: this.toTex(c), emissive: this.toTex(e) };
  },

  shopfront() {
    const W = 512, H = 128, c = this.mk(W, H), x = c.getContext('2d');
    x.fillStyle = '#5a5650';
    x.fillRect(0, 0, W, H);
    // rótulo
    const signs = ['#6b1f1f', '#1f3f6b', '#2f5a2f', '#6b5a1f', '#3a3a3a'];
    x.fillStyle = U.choice(signs);
    x.fillRect(0, 0, W, 26);
    x.fillStyle = 'rgba(230,220,200,0.6)';
    for (let i = 0; i < 9; i++) x.fillRect(30 + i * 22 + U.rand(-2, 2), 7, 14, 12);
    for (let bay = 0; bay < 4; bay++) {
      const bx = bay * 128 + 6, by = 32, bw = 116, bh = 92;
      const r = Math.random();
      if (r < 0.45) {
        // persiana metálica
        for (let y = by; y < by + bh; y += 5) {
          const v = U.randInt(-12, 12);
          x.fillStyle = `rgb(${120 + v},${122 + v},${125 + v})`;
          x.fillRect(bx, y, bw, 4);
        }
        x.fillStyle = 'rgba(90,60,40,0.3)';
        x.fillRect(bx, by + bh - 20, bw, 20);
      } else if (r < 0.75) {
        x.fillStyle = '#06080a';
        x.fillRect(bx, by, bw, bh);
        x.fillStyle = 'rgba(140,160,180,0.35)';
        for (let s = 0; s < 5; s++) {
          const sx = bx + Math.random() * bw;
          x.beginPath(); x.moveTo(sx - 10, by); x.lineTo(sx + 10, by); x.lineTo(sx + U.rand(-8, 8), by + U.rand(15, 45)); x.fill();
        }
      } else {
        x.fillStyle = '#0a0a0a';
        x.fillRect(bx, by, bw, bh);
        for (let p = 0; p < 6; p++) {
          const v = U.randInt(-15, 15);
          x.fillStyle = `rgb(${125 + v},${92 + v},${58 + v})`;
          x.fillRect(bx + p * 20, by + U.rand(-3, 3), 17, bh);
        }
      }
      x.strokeStyle = '#2a2a2a';
      x.lineWidth = 4;
      x.strokeRect(bx, by, bw, bh);
    }
    // grafitis
    for (let g = 0; g < 4; g++) {
      x.strokeStyle = U.choice(['rgba(220,40,40,0.8)', 'rgba(40,180,220,0.8)', 'rgba(240,220,40,0.8)', 'rgba(255,255,255,0.75)', 'rgba(60,220,80,0.7)']);
      x.lineWidth = U.rand(2, 5);
      x.beginPath();
      let px = U.rand(0, W), py = U.rand(40, 110);
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        x.quadraticCurveTo(px + U.rand(-20, 30), py + U.rand(-25, 25), px += U.rand(5, 25), py + U.rand(-15, 15));
      }
      x.stroke();
    }
    this.blotches(x, W, 8, 40, 0.6);
    this.fineNoise(x, W, H, 16);
    return this.toTex(c);
  },

  roof() {
    const c = this.surface(256, [70, 68, 64], 40, 22, 5), x = c.getContext('2d');
    x.strokeStyle = 'rgba(30,30,30,0.35)';
    for (let i = 0; i < 6; i++) {
      const v = U.randInt(30, 100);
      x.fillStyle = `rgba(${v},${v * 0.92 | 0},${v * 0.85 | 0},0.3)`;
      x.fillRect(Math.random() * 200, Math.random() * 200, U.rand(30, 80), U.rand(30, 80));
    }
    return this.toTex(c);
  },

  rust() {
    const c = this.surface(256, [58, 40, 30], 70, 40, 6), x = c.getContext('2d');
    for (let i = 0; i < 80; i++) {
      x.fillStyle = U.choice(['rgba(120,60,25,0.4)', 'rgba(20,16,14,0.6)', 'rgba(90,80,70,0.3)']);
      x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, U.rand(3, 18), 0, TAU); x.fill();
    }
    return this.toTex(c);
  },

  paint(rgb) {
    const c = this.surface(128, rgb, 18, 12, 4), x = c.getContext('2d');
    for (let i = 0; i < 25; i++) {
      x.fillStyle = U.choice(['rgba(90,50,25,0.5)', 'rgba(30,25,20,0.4)']);
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, U.rand(1, 6), 0, TAU); x.fill();
    }
    return this.toTex(c);
  },

  wood() {
    const c = this.mk(128), x = c.getContext('2d');
    x.fillStyle = '#7a5a36';
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 32) {
      x.fillStyle = `rgb(${110 + U.randInt(-15, 15)},${80 + U.randInt(-10, 10)},${48})`;
      x.fillRect(0, i + 1, 128, 30);
      x.strokeStyle = 'rgba(60,40,20,0.5)';
      for (let l = 0; l < 6; l++) { x.beginPath(); x.moveTo(0, i + 4 + l * 5); x.lineTo(128, i + 4 + l * 5 + U.rand(-2, 2)); x.stroke(); }
    }
    x.strokeStyle = '#3e2a16';
    x.lineWidth = 6;
    x.strokeRect(3, 3, 122, 122);
    x.beginPath(); x.moveTo(3, 3); x.lineTo(125, 125); x.stroke();
    this.fineNoise(x, 128, 128, 18);
    return this.toTex(c);
  },

  burlap() {
    const c = this.surface(128, [140, 120, 85], 25, 30, 4), x = c.getContext('2d');
    x.strokeStyle = 'rgba(60,50,30,0.25)';
    for (let i = 0; i < 128; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); }
    return this.toTex(c);
  },

  cloth() {
    // tela gris claro sucia y ensangrentada: se tiñe con el color de cada instancia
    const c = this.surface(128, [200, 200, 200], 30, 30, 4), x = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(${U.randInt(70, 110)},10,8,${U.rand(0.3, 0.7)})`;
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, U.rand(2, 12), 0, TAU); x.fill();
    }
    x.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 6; i++) x.fillRect(Math.random() * 128, Math.random() * 128, U.rand(4, 12), U.rand(2, 6));
    return this.toTex(c);
  },

  skin() {
    const c = this.surface(128, [210, 210, 205], 30, 26, 4), x = c.getContext('2d');
    for (let i = 0; i < 18; i++) {
      x.fillStyle = Math.random() < 0.6 ? `rgba(110,12,10,${U.rand(0.3, 0.7)})` : 'rgba(60,70,40,0.3)';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, U.rand(1, 9), 0, TAU); x.fill();
    }
    return this.toTex(c);
  },

  splat(r, g, b) {
    const c = this.mk(128), x = c.getContext('2d');
    x.fillStyle = `rgb(${r},${g},${b})`;
    x.beginPath(); x.arc(64, 64, 30, 0, TAU); x.fill();
    for (let i = 0; i < 16; i++) {
      const a = U.rand(0, TAU), d = U.rand(20, 52), s = U.rand(3, 12);
      x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, s, 0, TAU); x.fill();
      x.lineWidth = s * 0.7;
      x.strokeStyle = x.fillStyle;
      x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); x.stroke();
    }
    return this.toTex(c, false);
  },

  scorch() {
    const c = this.mk(128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(5,4,3,0.95)');
    g.addColorStop(0.6, 'rgba(15,12,10,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return this.toTex(c, false);
  },

  medkit() {
    const c = this.mk(64), x = c.getContext('2d');
    x.fillStyle = '#e8e6e0';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#c62020';
    x.fillRect(26, 12, 12, 40);
    x.fillRect(12, 26, 40, 12);
    return this.toTex(c, false);
  },

  windowsBand() {
    // ventanillas para autobuses
    const c = this.mk(256, 64), x = c.getContext('2d');
    x.fillStyle = '#c9b25a';
    x.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = Math.random() < 0.4 ? '#050505' : '#1c242c';
      x.fillRect(4 + i * 32, 10, 26, 26);
    }
    this.fineNoise(x, 256, 64, 20);
    return this.toTex(c);
  },
};
