'use strict';

// Ciudad en ruinas: calles, edificios, ruinas, coches calcinados, barricadas...
// + rejilla de colisión y campo de flujo para la IA de los zombis
class World {
  constructor() {
    this.w = CONFIG.WORLD_W;
    this.h = CONFIG.WORLD_H;
    this.tile = CONFIG.TILE;
    this.cols = Math.ceil(this.w / this.tile);
    this.rows = Math.ceil(this.h / this.tile);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.cellObs = new Array(n).fill(null);
    this.flowDist = new Int32Array(n).fill(-1);
    this.flowX = new Float32Array(n);
    this.flowY = new Float32Array(n);
    this.queue = new Int32Array(n);
    this.flowTimer = 0;
    this.flowCell = -1;

    this.obstacles = [];
    this.roads = [];
    this.intersections = [];
    this.areas = [];       // solares (para la textura del suelo)
    this.decor = [];       // objetos sin colisión: farolas, basura, escombros...
    this.fires = [];       // focos de fuego permanentes
    this.lightSources = [];// farolas que parpadean, focos militares
    this.scorches = [];
    this.craters = [];
    this.border = [];      // edificios de fondo fuera del mapa
    this.generate();
    this.buildGrid();
  }

  // ---------------------------------------------------------------- generación
  generate() {
    const cx = this.w / 2, cy = this.h / 2;
    const B = CONFIG.BLOCK, RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK;
    const lines = [];
    for (let k = -4; k <= 4; k++) {
      const p = cx + k * B;
      if (p > 300 && p < this.w - 300) lines.push(p);
    }
    this.lines = lines;
    for (const p of lines) {
      this.roads.push({ x: 0, y: p - RW / 2, w: this.w, h: RW, dir: 'h' });
      this.roads.push({ x: p - RW / 2, y: 0, w: RW, h: this.h, dir: 'v' });
    }
    for (const a of lines) for (const b of lines) this.intersections.push({ x: a, y: b });

    this.checkpoint(cx, cy);

    const bounds = [0, ...lines, this.w];
    const inset = RW / 2 + SW + 10;
    for (let i = 0; i < bounds.length - 1; i++) {
      for (let j = 0; j < bounds.length - 1; j++) {
        const x0 = bounds[i] + (i === 0 ? 70 : inset);
        const x1 = bounds[i + 1] - (i + 1 === bounds.length - 1 ? 70 : inset);
        const y0 = bounds[j] + (j === 0 ? 70 : inset);
        const y1 = bounds[j + 1] - (j + 1 === bounds.length - 1 ? 70 : inset);
        if (x1 - x0 < 120 || y1 - y0 < 120) continue;
        if (Math.random() < 0.12 && !this.nearCenter(x0, y0, x1 - x0, y1 - y0)) {
          this.makeBuilding(x0 + 20, y0 + 20, x1 - x0 - 40, y1 - y0 - 40, true);
          continue;
        }
        const mx = U.lerp(x0, x1, U.rand(0.4, 0.6)), my = U.lerp(y0, y1, U.rand(0.4, 0.6));
        const lots = [[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]];
        for (const [a, b, c, d] of lots) this.makeLot(a, b, c, d);
      }
    }
    this.streets();
    this.makeBorder();
  }

  makeLot(x0, y0, x1, y1) {
    if (this.nearCenter(x0, y0, x1 - x0, y1 - y0)) return this.makeCamp(x0, y0, x1, y1);
    const r = Math.random();
    const pad = 18;
    if (r < 0.6) this.makeBuilding(x0 + pad, y0 + pad, x1 - x0 - pad * 2, y1 - y0 - pad * 2, false);
    else if (r < 0.76) this.makeRuin(x0 + 10, y0 + 10, x1 - 10, y1 - 10);
    else if (r < 0.88) this.makeParking(x0 + 8, y0 + 8, x1 - 8, y1 - 8);
    else this.makePlaza(x0 + 8, y0 + 8, x1 - 8, y1 - 8);
  }

  makeBuilding(x, y, w, h, big) {
    if (w < 70 || h < 70) return;
    const floors = big ? U.randInt(3, 6) : U.choice([2, 2, 3, 3, 3, 4, 4, 5]);
    const H = floors * CONFIG.FLOOR_H;
    const style = big ? U.choice([0, 2, 2]) : U.randInt(0, 3);
    const burnt = Math.random() < 0.22;
    const props = [];
    const nProps = U.randInt(0, big ? 5 : 3);
    for (let i = 0; i < nProps; i++) {
      props.push({ type: U.choice(['tank', 'ac', 'ac', 'shed', 'antenna']), x: U.rand(x + 20, x + w - 20), y: U.rand(y + 20, y + h - 20), rot: U.rand(0, TAU) });
    }
    this.obstacles.push({ kind: 'building', shape: 'rect', x, y, w, h, floors, height: H, style, burnt, shop: Math.random() < 0.6, props });
    this.areas.push({ type: 'building', x, y, w, h });
    if (burnt) {
      if (Math.random() < 0.35) this.fires.push({ x: U.rand(x + 20, x + w - 20), y: U.rand(y + 20, y + h - 20), z: H, s: U.rand(1.2, 2) });
      this.scorches.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 0.8, a: 0.5 });
    }
    if (Math.random() < 0.25) {
      const side = U.randInt(0, 3);
      const px = side < 2 ? U.rand(x, x + w) : (side === 2 ? x - 14 : x + w + 14);
      const py = side < 2 ? (side === 0 ? y - 14 : y + h + 14) : U.rand(y, y + h);
      this.addRubble(px, py, U.rand(16, 26));
    }
  }

  makeRuin(x0, y0, x1, y1) {
    this.areas.push({ type: 'ruin', x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const style = U.choice([0, 1, 1, 3]);
    const T = 12;
    const sides = [
      [x0, y0, x1, y0, 'h'], [x0, y1 - T, x1, y1 - T, 'h'],
      [x0, y0, x0, y1, 'v'], [x1 - T, y0, x1 - T, y1, 'v'],
    ];
    for (const [ax, ay, bx, by, dir] of sides) {
      const len = dir === 'h' ? bx - ax : by - ay;
      let s = 0;
      while (s < len) {
        const seg = Math.min(len - s, U.rand(30, 80));
        if (Math.random() > 0.3) {
          const height = Math.random() < 0.2 ? U.rand(70, 120) : U.rand(14, 60);
          if (dir === 'h') this.obstacles.push({ kind: 'wall', shape: 'rect', x: ax + s, y: ay, w: seg, h: T, height, style });
          else this.obstacles.push({ kind: 'wall', shape: 'rect', x: ax, y: ay + s, w: T, h: seg, height, style });
        } else {
          s += U.rand(10, 30);
        }
        s += seg + U.rand(0, 6);
      }
    }
    const n = U.randInt(2, 4);
    for (let i = 0; i < n; i++) {
      this.addRubble(U.rand(x0 + 50, x1 - 50), U.rand(y0 + 50, y1 - 50), U.rand(22, 42));
    }
    for (let i = 0; i < 30; i++) this.decor.push({ type: 'debris', x: U.rand(x0, x1), y: U.rand(y0, y1), rot: U.rand(0, TAU), s: U.rand(0.6, 1.8) });
    if (Math.random() < 0.3) {
      const fx = U.rand(x0 + 60, x1 - 60), fy = U.rand(y0 + 60, y1 - 60);
      if (!this.overlapsAny(fx - 20, fy - 20, 40, 40)) this.fires.push({ x: fx, y: fy, z: 0, s: 1.2 });
    }
  }

  makeParking(x0, y0, x1, y1) {
    this.areas.push({ type: 'parking', x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    for (const top of [true, false]) {
      for (let px = x0 + 14; px < x1 - 50; px += 56) {
        if (Math.random() < 0.45) continue;
        const y = top ? y0 + 10 : y1 - 96;
        this.addCar(px + 6 + U.rand(-3, 3), y + U.rand(-3, 3), true, Math.random() < 0.7, 0.15);
      }
    }
    for (let i = 0; i < 12; i++) this.decor.push({ type: U.choice(['trash', 'tire', 'debris']), x: U.rand(x0, x1), y: U.rand(y0, y1), rot: U.rand(0, TAU), s: U.rand(0.7, 1.3) });
  }

  makePlaza(x0, y0, x1, y1) {
    this.areas.push({ type: 'plaza', x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const n = U.randInt(3, 6);
    for (let i = 0, t = 0; i < n && t < 40; t++) {
      const x = U.rand(x0 + 30, x1 - 30), y = U.rand(y0 + 30, y1 - 30);
      if (this.overlapsAny(x - 40, y - 40, 80, 80)) continue;
      this.obstacles.push({ kind: 'tree', shape: 'circle', x, y, r: 9, s: U.rand(0.8, 1.3), rot: U.rand(0, TAU) });
      i++;
    }
    if (Math.random() < 0.5) {
      const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
      if (!this.overlapsAny(x - 40, y - 40, 80, 80)) this.obstacles.push({ kind: 'statue', shape: 'circle', x, y, r: 26 });
    }
    for (let i = 0; i < U.randInt(0, 3); i++) {
      const x = U.rand(x0 + 40, x1 - 80), y = U.rand(y0 + 40, y1 - 70);
      if (!this.overlapsAny(x - 10, y - 10, 70, 60)) this.obstacles.push({ kind: 'tent', shape: 'rect', x, y, w: 50, h: 40, height: 26, color: U.choice(['#3d5a3a', '#6a4a2a', '#2a4a6a', '#7a2a2a']) });
    }
    for (let i = 0; i < 4; i++) this.decor.push({ type: 'bench', x: U.rand(x0 + 20, x1 - 20), y: U.rand(y0 + 20, y1 - 20), rot: U.choice([0, Math.PI / 2]), s: 1 });
    for (let i = 0; i < 10; i++) this.decor.push({ type: U.choice(['trash', 'paper', 'debris']), x: U.rand(x0, x1), y: U.rand(y0, y1), rot: U.rand(0, TAU), s: U.rand(0.7, 1.3) });
    if (Math.random() < 0.4) this.addBarrel(U.rand(x0 + 30, x1 - 30), U.rand(y0 + 30, y1 - 30), true);
  }

  // zona militar abandonada junto al punto de inicio
  makeCamp(x0, y0, x1, y1) {
    this.areas.push({ type: 'building', x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const cx = this.w / 2, cy = this.h / 2;
    const fx = Math.abs(x0 - cx) < Math.abs(x1 - cx) ? x1 : x0;
    const fy = Math.abs(y0 - cy) < Math.abs(y1 - cy) ? y1 : y0;
    const tx = U.lerp(x0, x1, 0.5) + (fx === x0 ? -40 : 40) - 40, ty = U.lerp(y0, y1, 0.5) + (fy === y0 ? -40 : 40) - 30;
    this.obstacles.push({ kind: 'tent', shape: 'rect', x: tx, y: ty, w: 90, h: 64, height: 38, color: '#4a5236' });
    const lx = fx === x0 ? x0 + 30 : x1 - 30, ly = fy === y0 ? y0 + 30 : y1 - 30;
    this.decor.push({ type: 'flood', x: lx, y: ly, rot: Math.atan2(cy - ly, cx - lx), s: 1 });
    this.lightSources.push({ x: U.lerp(lx, cx, 0.25), y: U.lerp(ly, cy, 0.25), z: 60, r: 380, color: 0xdde6ff, intensity: 2.2, flicker: Math.random() < 0.5 });
    for (let i = 0; i < 6; i++) this.decor.push({ type: 'crate', x: U.rand(x0 + 20, x1 - 20), y: U.rand(y0 + 20, y1 - 20), rot: U.rand(0, TAU), s: U.rand(0.8, 1.2) });
  }

  checkpoint(cx, cy) {
    const RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK, D = 250, half = RW / 2 + SW, gap = 34;
    // muros de sacos terreros cortando cada calle con un paso en el centro
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = cx + dx * D, py = cy + dy * D;
      if (dx) {
        this.obstacles.push({ kind: 'sandbag', shape: 'rect', x: px - 9, y: py - half, w: 18, h: half - gap, height: 20 });
        this.obstacles.push({ kind: 'sandbag', shape: 'rect', x: px - 9, y: py + gap, w: 18, h: half - gap, height: 20 });
      } else {
        this.obstacles.push({ kind: 'sandbag', shape: 'rect', x: px - half, y: py - 9, w: half - gap, h: 18, height: 20 });
        this.obstacles.push({ kind: 'sandbag', shape: 'rect', x: px + gap, y: py - 9, w: half - gap, h: 18, height: 20 });
      }
    }
    this.addCar(cx + 110, cy - RW * 0.22 - 25, false, Math.random() < 0.4, 0.05, 'military');
    this.addCar(cx - RW * 0.22 - 25, cy + 90, true, true, 0.05, 'military');
    this.addBarrel(cx - 120, cy - 70, true);
    this.addBarrel(cx + 70, cy + 120, true);
    for (let i = 0; i < 4; i++) {
      const a = U.rand(0, TAU);
      this.decor.push({ type: 'crate', x: cx + Math.cos(a) * U.rand(120, 200), y: cy + Math.sin(a) * U.rand(120, 200), rot: U.rand(0, TAU), s: 1 });
    }
  }

  streets() {
    const RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK, cx = this.w / 2, cy = this.h / 2;
    const stops = [0, ...this.lines, this.w];
    for (const p of this.lines) {
      for (const dir of ['h', 'v']) {
        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i] + (i === 0 ? 0 : RW / 2 + 20), b = stops[i + 1] - (i + 1 === stops.length - 1 ? 0 : RW / 2 + 20);
          const len = b - a;
          const P = (along, off) => (dir === 'h' ? { x: along, y: p + off } : { x: p + off, y: along });
          // coches
          const nCars = U.choice([0, 1, 1, 2, 2, 3]);
          for (let c = 0; c < nCars; c++) {
            const along = U.rand(a + 40, b - 140), lane = U.choice([-1, 1]) * RW * 0.22;
            const pt = P(along, lane);
            const v = Math.random() < 0.05 ? 'bus' : U.choice(['car', 'car', 'car', 'taxi', 'van', 'police', 'car']);
            this.addCar(pt.x, pt.y, dir === 'v', Math.random() < 0.6, 0.25, v, true);
          }
          // barricada de hormigón cruzando la calle
          if (Math.random() < 0.12) {
            const along = U.rand(a + 60, b - 60), gapAt = U.rand(-RW / 2 + 30, RW / 2 - 30);
            for (let off = -RW / 2 - SW + 26; off < RW / 2 + SW - 20; off += 56) {
              if (Math.abs(off - gapAt) < 40) continue;
              const pt = P(along, off);
              const w = dir === 'h' ? 16 : 52, h = dir === 'h' ? 52 : 16;
              if (!this.overlapsAny(pt.x - w / 2, pt.y - h / 2, w, h)) this.obstacles.push({ kind: 'barrier', shape: 'rect', x: pt.x - w / 2, y: pt.y - h / 2, w, h, height: 22, rot: U.rand(-0.15, 0.15) });
            }
          }
          if (Math.random() < 0.14) { const pt = P(U.rand(a, b), U.rand(-RW / 2, RW / 2)); this.addRubble(pt.x, pt.y, U.rand(16, 30)); }
          if (Math.random() < 0.08) { const pt = P(U.rand(a, b), U.rand(-RW / 3, RW / 3)); if (!this.nearCenter(pt.x - 40, pt.y - 40, 80, 80)) this.craters.push({ x: pt.x, y: pt.y, r: U.rand(16, 30) }); }
          // aceras: farolas, contenedores, bidones, basura
          for (const side of [-1, 1]) {
            const off = side * (RW / 2 + 6);
            for (let s = a + U.rand(30, 90); s < b - 20; s += 180) {
              const pt = P(s, off), r = Math.random();
              const lamp = { type: 'lamp', x: pt.x, y: pt.y, rot: dir === 'h' ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (side < 0 ? 0 : Math.PI), s: 1, broken: r < 0.12 ? U.rand(0.15, 0.4) * U.choice([-1, 1]) : 0, lit: r > 0.92 };
              this.decor.push(lamp);
              if (lamp.lit) {
                const ax = Math.cos(lamp.rot) * 22, ay = Math.sin(lamp.rot) * 22;
                this.lightSources.push({ x: pt.x + ax, y: pt.y + ay, z: 70, r: 260, color: 0xffc27a, intensity: 1.6, flicker: true });
              }
            }
            const sideOff = side * (RW / 2 + SW / 2);
            if (Math.random() < 0.12) {
              const pt = P(U.rand(a + 30, b - 60), sideOff);
              const w = dir === 'h' ? 52 : 28, h = dir === 'h' ? 28 : 52;
              if (!this.overlapsAny(pt.x - w / 2, pt.y - h / 2, w, h)) this.obstacles.push({ kind: 'dumpster', shape: 'rect', x: pt.x - w / 2, y: pt.y - h / 2, w, h, height: 24, color: U.choice(['#2f4a2f', '#3a3f4a', '#4a3a2a']), rot: dir === 'h' ? 0 : Math.PI / 2 });
            }
            if (Math.random() < 0.06) { const pt = P(U.rand(a + 20, b - 20), sideOff); this.addBarrel(pt.x, pt.y, Math.random() < 0.7); }
            for (let t = 0; t < 7; t++) {
              const pt = P(U.rand(a, b), side * U.rand(RW / 2 - 10, RW / 2 + SW));
              this.decor.push({ type: U.choice(['trash', 'trash', 'paper', 'debris', 'tire', 'paper']), x: pt.x, y: pt.y, rot: U.rand(0, TAU), s: U.rand(0.6, 1.3) });
            }
          }
          for (let t = 0; t < 5; t++) {
            const pt = P(U.rand(a, b), U.rand(-RW / 2, RW / 2));
            this.decor.push({ type: U.choice(['paper', 'debris', 'cone']), x: pt.x, y: pt.y, rot: U.rand(0, TAU), s: U.rand(0.6, 1.2) });
          }
        }
      }
    }
  }

  // edificios de fondo y muro de cuarentena alrededor del mapa
  makeBorder() {
    const W = this.w, H = this.h;
    const add = (x, y, w, h) => this.border.push({ kind: 'building', x, y, w, h, floors: U.randInt(3, 7), height: 0, style: U.randInt(0, 3), burnt: Math.random() < 0.3, shop: false, props: [] });
    for (let s = -400; s < W + 400; s += U.rand(160, 260)) {
      const w = U.rand(130, 230);
      add(s, -U.rand(260, 330), w, 200);
      add(s, H + U.rand(60, 130), w, 200);
    }
    for (let s = 0; s < H; s += U.rand(160, 260)) {
      const h = U.rand(130, 230);
      add(-U.rand(260, 330), s, 200, h);
      add(W + U.rand(60, 130), s, 200, h);
    }
    for (const b of this.border) b.height = b.floors * CONFIG.FLOOR_H;
  }

  addCar(x, y, vertical, burnt, yawJitter, variant = 'car', checkRoad = false) {
    const dims = { car: [86, 40], taxi: [86, 40], police: [90, 42], van: [98, 46], bus: [210, 54], military: [130, 52] }[variant];
    const w = vertical ? dims[1] : dims[0], h = vertical ? dims[0] : dims[1];
    const ox = x - (checkRoad ? w / 2 : 0), oy = y - (checkRoad ? h / 2 : 0);
    if (this.nearCenter(ox, oy, w, h, 110)) return;
    if (this.overlapsAny(ox - 16, oy - 16, w + 32, h + 32)) return;
    const o = {
      kind: 'car', shape: 'rect', x: ox, y: oy, w, h, vertical, variant, burnt,
      height: variant === 'bus' ? 58 : variant === 'van' ? 36 : variant === 'military' ? 42 : 26,
      yaw: U.rand(-yawJitter, yawJitter) + (Math.random() < 0.5 ? Math.PI : 0),
      color: U.choice(['#7a1f1f', '#1f3a7a', '#bdbdbd', '#2b2b2b', '#4d6b2b', '#a5822a', '#4a2a6b', '#e0e0e0']),
    };
    this.obstacles.push(o);
    if (burnt) {
      this.scorches.push({ x: ox + w / 2, y: oy + h / 2, r: Math.max(w, h) * 0.75, a: 0.75 });
      if (Math.random() < 0.18) this.fires.push({ x: ox + w / 2, y: oy + h / 2, z: o.height * 0.8, s: variant === 'bus' ? 1.8 : 1.1 });
    }
  }

  addRubble(x, y, r) {
    if (this.nearCenter(x - r, y - r, r * 2, r * 2, 120)) return;
    if (this.overlapsAny(x - r - 10, y - r - 10, r * 2 + 20, r * 2 + 20)) return;
    this.obstacles.push({ kind: 'rubble', shape: 'circle', x, y, r, height: r * U.rand(0.5, 0.8), seed: Math.random() });
  }

  addBarrel(x, y, fire) {
    if (this.overlapsAny(x - 14, y - 14, 28, 28)) return;
    this.obstacles.push({ kind: 'barrel', shape: 'circle', x, y, r: 10, fire });
    if (fire) this.fires.push({ x, y, z: 24, s: 0.6 });
  }

  nearCenter(x, y, w, h, R = 260) {
    const cx = this.w / 2, cy = this.h / 2;
    return x < cx + R && x + w > cx - R && y < cy + R && y + h > cy - R;
  }

  overlapsAny(x, y, w, h) {
    for (const o of this.obstacles) {
      let ox, oy, ow, oh;
      if (o.shape === 'rect') { ox = o.x; oy = o.y; ow = o.w; oh = o.h; }
      else { ox = o.x - o.r; oy = o.y - o.r; ow = oh = o.r * 2; }
      if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- rejilla
  buildGrid() {
    const T = this.tile, cols = this.cols;
    for (const o of this.obstacles) {
      let bx0, by0, bx1, by1;
      if (o.shape === 'rect') { bx0 = o.x; by0 = o.y; bx1 = o.x + o.w; by1 = o.y + o.h; }
      else { bx0 = o.x - o.r; by0 = o.y - o.r; bx1 = o.x + o.r; by1 = o.y + o.r; }
      // registro para colisiones (expandido por el radio máximo de entidad)
      const E = 32;
      const cx0 = Math.max(0, Math.floor((bx0 - E) / T)), cx1 = Math.min(cols - 1, Math.floor((bx1 + E) / T));
      const cy0 = Math.max(0, Math.floor((by0 - E) / T)), cy1 = Math.min(this.rows - 1, Math.floor((by1 + E) / T));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const i = cx + cy * cols;
          (this.cellObs[i] || (this.cellObs[i] = [])).push(o);
          // celda bloqueada si su centro cae dentro (con un pequeño margen)
          const px = (cx + 0.5) * T, py = (cy + 0.5) * T, m = 10;
          let inside;
          if (o.shape === 'rect') inside = px > o.x - m && px < o.x + o.w + m && py > o.y - m && py < o.y + o.h + m;
          else inside = U.dist2(px, py, o.x, o.y) < (o.r + m) * (o.r + m);
          if (inside) this.blocked[i] = 1;
        }
      }
    }
  }

  cellIndex(x, y) {
    const cx = U.clamp(Math.floor(x / this.tile), 0, this.cols - 1);
    const cy = U.clamp(Math.floor(y / this.tile), 0, this.rows - 1);
    return cx + cy * this.cols;
  }

  isWalkable(x, y) {
    if (x < 30 || y < 30 || x > this.w - 30 || y > this.h - 30) return false;
    return !this.blocked[this.cellIndex(x, y)];
  }

  // empuja un círculo fuera de los obstáculos
  resolveCircle(e) {
    const list = this.cellObs[this.cellIndex(e.x, e.y)];
    let hit = false;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.shape === 'rect') {
          const nx = U.clamp(e.x, o.x, o.x + o.w), ny = U.clamp(e.y, o.y, o.y + o.h);
          const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
          if (d2 < e.radius * e.radius) {
            hit = true;
            if (d2 > 0.0001) {
              const d = Math.sqrt(d2), push = e.radius - d;
              e.x += (dx / d) * push;
              e.y += (dy / d) * push;
            } else {
              const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
              const m = Math.min(l, r, t, b);
              if (m === l) e.x = o.x - e.radius;
              else if (m === r) e.x = o.x + o.w + e.radius;
              else if (m === t) e.y = o.y - e.radius;
              else e.y = o.y + o.h + e.radius;
            }
          }
        } else {
          const dx = e.x - o.x, dy = e.y - o.y, rr = e.radius + o.r, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            hit = true;
            const d = Math.sqrt(d2) || 0.01;
            e.x = o.x + (dx / d) * rr;
            e.y = o.y + (dy / d) * rr;
          }
        }
      }
    }
    e.x = U.clamp(e.x, e.radius, this.w - e.radius);
    e.y = U.clamp(e.y, e.radius, this.h - e.radius);
    return hit;
  }

  pointBlocked(x, y) {
    if (x < 0 || y < 0 || x > this.w || y > this.h) return true;
    const list = this.cellObs[this.cellIndex(x, y)];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.shape === 'rect') {
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
      } else if (U.dist2(x, y, o.x, o.y) <= o.r * o.r) {
        return true;
      }
    }
    return false;
  }

  lineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / (this.tile * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked[this.cellIndex(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- campo de flujo (BFS desde el jugador)
  updateFlow(px, py, dt) {
    this.flowTimer -= dt;
    const c = this.cellIndex(px, py);
    if (this.flowTimer <= 0 || c !== this.flowCell) {
      this.computeFlow(px, py);
      this.flowTimer = 0.25;
    }
  }

  computeFlow(px, py) {
    const cols = this.cols, rows = this.rows, dist = this.flowDist, blocked = this.blocked, q = this.queue;
    dist.fill(-1);
    let start = this.cellIndex(px, py);
    this.flowCell = start;
    if (blocked[start]) {
      // busca la celda libre más cercana
      const sx = start % cols, sy = (start / cols) | 0;
      let found = -1;
      for (let r = 1; r < 4 && found < 0; r++) {
        for (let dy = -r; dy <= r && found < 0; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (!blocked[nx + ny * cols]) { found = nx + ny * cols; break; }
          }
        }
      }
      if (found < 0) return;
      start = found;
    }
    let head = 0, tail = 0;
    q[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const c = q[head++], cx = c % cols, cy = (c / cols) | 0, nd = dist[c] + 1;
      if (cx > 0 && !blocked[c - 1] && dist[c - 1] < 0) { dist[c - 1] = nd; q[tail++] = c - 1; }
      if (cx < cols - 1 && !blocked[c + 1] && dist[c + 1] < 0) { dist[c + 1] = nd; q[tail++] = c + 1; }
      if (cy > 0 && !blocked[c - cols] && dist[c - cols] < 0) { dist[c - cols] = nd; q[tail++] = c - cols; }
      if (cy < rows - 1 && !blocked[c + cols] && dist[c + cols] < 0) { dist[c + cols] = nd; q[tail++] = c + cols; }
    }
    // dirección hacia el vecino con menor distancia (incluye diagonales sin cortar esquinas)
    const fx = this.flowX, fy = this.flowY;
    for (let k = 0; k < tail; k++) {
      const c = q[k], cx = c % cols, cy = (c / cols) | 0;
      let best = dist[c], bx = 0, by = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = nx + ny * cols;
          if (blocked[n] || dist[n] < 0) continue;
          if (dx && dy && (blocked[cx + dx + cy * cols] || blocked[cx + (cy + dy) * cols])) continue;
          if (dist[n] < best) { best = dist[n]; bx = dx; by = dy; }
        }
      }
      const l = Math.hypot(bx, by) || 1;
      fx[c] = bx / l;
      fy[c] = by / l;
    }
  }
}
