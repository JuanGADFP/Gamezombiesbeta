'use strict';

// Mapa: calles, edificios, coches, árboles y rocas + campo de flujo para la IA
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
    this.decor = [];
    this.generate();
    this.buildGrid();
  }

  // ---------------------------------------------------------------- generación
  generate() {
    const cx = this.w / 2, cy = this.h / 2;
    const B = CONFIG.BLOCK, RW = CONFIG.ROAD_W;
    const lines = [];
    for (let k = -4; k <= 4; k++) {
      const p = cx + k * B;
      if (p > 150 && p < this.w - 150) lines.push(p);
    }
    for (const p of lines) {
      this.roads.push({ x: 0, y: p - RW / 2, w: this.w, h: RW, dir: 'h' });
      this.roads.push({ x: p - RW / 2, y: 0, w: RW, h: this.h, dir: 'v' });
    }
    const bounds = [0, ...lines, this.w];
    const margin = 22;

    for (let i = 0; i < bounds.length - 1; i++) {
      for (let j = 0; j < bounds.length - 1; j++) {
        const x0 = bounds[i] + (i === 0 ? 40 : RW / 2 + margin);
        const x1 = bounds[i + 1] - (i + 1 === bounds.length - 1 ? 40 : RW / 2 + margin);
        const y0 = bounds[j] + (j === 0 ? 40 : RW / 2 + margin);
        const y1 = bounds[j + 1] - (j + 1 === bounds.length - 1 ? 40 : RW / 2 + margin);
        if (x1 - x0 < 80 || y1 - y0 < 80) continue;
        const bcx = (x0 + x1) / 2, bcy = (y0 + y1) / 2;
        const d = Math.hypot(bcx - cx, bcy - cy);
        if (d < CONFIG.TOWN_RADIUS) {
          if (Math.random() < 0.82) this.makeTownBlock(x0, y0, x1, y1);
          else this.makePark(x0, y0, x1, y1);
        } else {
          this.makeForest(x0, y0, x1, y1, d);
        }
      }
    }

    // coches abandonados en las calles
    for (const r of this.roads) {
      const len = r.dir === 'h' ? r.w : r.h;
      for (let s = 0; s < len; s += 120) {
        if (Math.random() > 0.08) continue;
        const along = s + U.rand(0, 60);
        let x, y, w, h;
        const lane = U.choice([-1, 1]) * RW * 0.22;
        if (r.dir === 'h') {
          w = 86; h = 42; x = along; y = r.y + r.h / 2 + lane - h / 2;
        } else {
          w = 42; h = 86; y = along; x = r.x + r.w / 2 + lane - w / 2;
        }
        if (Math.hypot(x + w / 2 - cx, y + h / 2 - cy) < 260) continue;
        if (this.overlapsAny(x - 20, y - 20, w + 40, h + 40)) continue;
        this.obstacles.push({
          kind: 'car', shape: 'rect', x, y, w, h, vertical: r.dir === 'v',
          color: U.choice(['#8c2f2f', '#2f4f8c', '#c9c9c9', '#3a3a3a', '#6b8c3a', '#c99a2f', '#5e3a8c']),
          burnt: Math.random() < 0.3,
        });
      }
    }

    // decoración sin colisión
    for (let i = 0; i < 2600; i++) {
      const x = U.rand(0, this.w), y = U.rand(0, this.h);
      if (this.onRoad(x, y)) continue;
      this.decor.push({ x, y, t: U.randInt(0, 3), s: U.rand(0.7, 1.3), c: U.randInt(0, 3) });
    }
  }

  makeTownBlock(x0, y0, x1, y1) {
    const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
    const lots = [[x0, y0, midX, midY], [midX, y0, x1, midY], [x0, midY, midX, y1], [midX, midY, x1, y1]];
    const pad = 26;
    for (const [lx0, ly0, lx1, ly1] of lots) {
      if (Math.random() < 0.2) {
        if (Math.random() < 0.5) this.scatterTrees(lx0, ly0, lx1, ly1, 2);
        continue;
      }
      const maxW = lx1 - lx0 - pad * 2, maxH = ly1 - ly0 - pad * 2;
      const w = U.rand(Math.min(130, maxW), maxW), h = U.rand(Math.min(120, maxH), maxH);
      const x = U.rand(lx0 + pad, lx1 - pad - w), y = U.rand(ly0 + pad, ly1 - pad - h);
      if (this.nearCenter(x, y, w, h)) continue;
      const roof = U.choice(['#6e4a3a', '#4a4f5a', '#7a3b33', '#5a5f44', '#6b6258', '#3e4d5c', '#80664d']);
      this.obstacles.push({
        kind: 'building', shape: 'rect', x, y, w, h,
        height: U.randInt(30, 46), roof,
        wall: U.choice(['#b9a48a', '#9c9a8f', '#a88a74', '#8f9aa0', '#b5ab93']),
        ridge: Math.random() < 0.6 ? (w > h ? 'h' : 'v') : null,
        ac: Math.random() < 0.5,
      });
    }
  }

  makePark(x0, y0, x1, y1) {
    this.scatterTrees(x0, y0, x1, y1, U.randInt(4, 8));
    this.scatterRocks(x0, y0, x1, y1, U.randInt(0, 2));
  }

  makeForest(x0, y0, x1, y1, d) {
    const density = U.clamp((d - CONFIG.TOWN_RADIUS) / 900, 0.3, 1);
    const area = (x1 - x0) * (y1 - y0);
    this.scatterTrees(x0, y0, x1, y1, Math.floor((area / 18000) * density));
    this.scatterRocks(x0, y0, x1, y1, U.randInt(2, 5));
  }

  scatterTrees(x0, y0, x1, y1, count) {
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const r = U.rand(14, 20);
      const x = U.rand(x0 + r, x1 - r), y = U.rand(y0 + r, y1 - r);
      if (this.nearCenter(x - 40, y - 40, 80, 80)) continue;
      if (this.overlapsAny(x - 52, y - 52, 104, 104)) continue;
      this.obstacles.push({
        kind: 'tree', shape: 'circle', x, y, r,
        canopy: r * U.rand(2.3, 2.9),
        tint: U.choice(['#2f5a2a', '#36652e', '#2a4f30', '#3d6a2c', '#4a5e26']),
      });
      i++;
    }
  }

  scatterRocks(x0, y0, x1, y1, count) {
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const r = U.rand(14, 30);
      const x = U.rand(x0 + r, x1 - r), y = U.rand(y0 + r, y1 - r);
      if (this.nearCenter(x - 40, y - 40, 80, 80)) continue;
      if (this.overlapsAny(x - r - 30, y - r - 30, r * 2 + 60, r * 2 + 60)) continue;
      const pts = [];
      const n = U.randInt(7, 10);
      for (let k = 0; k < n; k++) pts.push(U.rand(0.75, 1.1));
      this.obstacles.push({ kind: 'rock', shape: 'circle', x, y, r, pts, shade: U.randInt(0, 2) });
      i++;
    }
  }

  nearCenter(x, y, w, h) {
    const cx = this.w / 2, cy = this.h / 2, R = 230;
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

  onRoad(x, y) {
    for (const r of this.roads) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
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
