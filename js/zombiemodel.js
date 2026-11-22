'use strict';

// ============================================================================
//  MODELOS DE ZOMBI DETALLADOS (generados por código)
//  Cada parte del cuerpo es una geometría "esculpida" y pintada por vértice:
//  - clase 0: color fijo (sangre, hueso, dientes, uniformes...)
//  - clase 1: tela teñida con el color de cada zombi
//  - clase 2: piel teñida con el tono de cada zombi
//  Las partes se dibujan con instancias: todos los zombis cuestan pocas llamadas de dibujo.
// ============================================================================

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = t => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
function fbm(x, y, z) {
  return vnoise(x, y, z) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.1;
}

const ZC = {
  blood: [0.2, 0.012, 0.01], fresh: [0.36, 0.025, 0.02], flesh: [0.42, 0.1, 0.08], cavity: [0.1, 0.005, 0.005],
  bone: [0.84, 0.79, 0.66], teeth: [0.76, 0.7, 0.48], dark: [0.05, 0.035, 0.03], mouth: [0.22, 0.03, 0.04],
  slime: [0.52, 0.66, 0.14], pus: [0.74, 0.76, 0.3],
};
const fix = (c, k = 1) => [c[0] * k, c[1] * k, c[2] * k, 0];

// ------------------------------------------------------------------ primitivas
function gEll(rx, ry, rz, x = 0, y = 0, z = 0, ws = 12, hs = 9) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

// tronco de secciones elípticas: prof = [[t, rx, rz, zoff], ...]; de y=0 a y=h
function gTrunk(h, prof, seg = 16, rings = 10, shape = null) {
  const at = t => {
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i], b = prof[i + 1];
      if (t <= b[0] + 1e-6) {
        let k = (t - a[0]) / (b[0] - a[0] || 1);
        k = k * k * (3 - 2 * k);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    const l = prof[prof.length - 1];
    return [l[1], l[2], l[3]];
  };
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, p = at(t), y = t * h;
    for (let s = 0; s <= seg; s++) {
      const a = Math.PI + (s / seg) * TAU;
      let x = Math.sin(a) * p[0], z = Math.cos(a) * p[1] + p[2];
      if (shape) { const o = shape(x, y, z, t, Math.cos(a)); x = o[0]; z = o[1]; }
      pos.push(x, y, z);
      uv.push(s / seg, t);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const p0 = at(0), p1 = at(1);
  const cb = pos.length / 3; pos.push(0, 0, p0[2]); uv.push(0.5, 0);
  const ct = pos.length / 3; pos.push(0, h, p1[2]); uv.push(0.5, 1);
  for (let s = 0; s < seg; s++) {
    idx.push(cb, s + 1, s);
    const top = rings * (seg + 1);
    idx.push(ct, top + s, top + s + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// extremidad: pivote arriba (y=0), se extiende hacia -y
function gLimb(len, r0, r1, seg = 10, rings = 5, bulge = 0, bulgeAt = 0.55) {
  const mid = (r0 + r1) / 2 * (1 + bulge);
  const g = gTrunk(len, [[0, r1, r1, 0], [1 - bulgeAt, mid, mid * 0.95, bulge * 0.4], [1, r0, r0, 0]], seg, rings);
  g.translate(0, -len, 0);
  return g;
}

// desplaza los vértices a lo largo de la normal
function displace(g, fn) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), d = fn(x, y, z);
    if (d) P.setXYZ(i, x + N.getX(i) * d, y + N.getY(i) * d, z + N.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

// une piezas pintadas en una sola geometría con color por vértice y clase de tinte
class PartBuilder {
  constructor() { this.pieces = []; }
  add(geo, paint) { this.pieces.push({ geo, paint }); return this; }
  build() {
    const gs = this.pieces.map(p => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      return g;
    });
    const total = gs.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const col = new Float32Array(total * 3), cls = new Float32Array(total);
    let o = 0;
    gs.forEach((g, i) => {
      const paint = this.pieces[i].paint, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
      for (let k = 0; k < P.count; k++) {
        const x = P.getX(k), y = P.getY(k), z = P.getZ(k), j = o + k;
        pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
        nor[j * 3] = N.getX(k); nor[j * 3 + 1] = N.getY(k); nor[j * 3 + 2] = N.getZ(k);
        if (UV) { uv[j * 2] = UV.getX(k); uv[j * 2 + 1] = UV.getY(k); }
        const c = paint(x, y, z);
        const ao = 0.62 + 0.38 * (N.getY(k) * 0.5 + 0.5);
        col[j * 3] = c[0] * ao; col[j * 3 + 1] = c[1] * ao; col[j * 3 + 2] = c[2] * ao;
        cls[j] = c[3];
      }
      o += P.count;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(cls, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ pintura
const ZPaint = {
  skin(seed, o = {}) {
    const wound = (o.wound ?? 0.73) + 0.03, drip = o.drip ?? 0.8, dirtY = o.dirtY;
    return (x, y, z) => {
      let v = 0.6 + fbm(x * 0.45 + seed, y * 0.45, z * 0.45) * 0.34;
      if (dirtY !== undefined && y < dirtY) v *= 0.7;
      if (Math.abs(vnoise(x * 1.3 + seed * 3, y * 0.55, z * 1.3) - 0.5) < 0.035) v *= 0.6; // venas
      const w = fbm(x * 0.33 + seed * 11, y * 0.33 + seed, z * 0.33);
      if (w > wound + 0.06) return fix(ZC.flesh, 0.7 + (w - wound) * 2);
      if (w > wound) return fix(ZC.blood);
      if (vnoise(x * 0.9 + seed * 5, y * 0.13 + seed, z * 0.9) > drip) return fix(ZC.blood, 1.2);
      if (vnoise(x * 0.3 + seed * 7, y * 0.3, z * 0.3) > 0.68) return [v * 0.74, v * 0.6, v * 0.82, 2]; // moratón
      return [v, v, v, 2];
    };
  },
  cloth(seed, o = {}) {
    const skin = ZPaint.skin(seed + 50, { wound: 0.68 });
    const tear = o.tear ?? 0.74, blood = o.blood ?? 0.71, rgb = o.rgb, gy = o.grimeY ?? -99;
    return (x, y, z) => {
      const t = fbm(x * 0.42 + seed, y * 0.42 + seed, z * 0.42);
      if (t > tear + 0.025) return skin(x, y, z);
      if (t > tear) return [0.1, 0.08, 0.07, 0];
      const st = vnoise(x * 0.5 + seed * 3, y * 0.2 + seed, z * 0.5);
      if (st > blood + 0.07) return fix(ZC.blood);
      if (st > blood) return [0.26, 0.07, 0.05, 0];
      let v = 0.62 + vnoise(x * 1.8, y * 1.8, z * 1.8) * 0.16 - fbm(x * 0.3 + seed, y * 0.3, z * 0.3) * 0.14;
      v *= U.clamp(0.72 + (y - gy) * 0.05, 0.6, 1);
      return rgb ? [rgb[0] * v, rgb[1] * v, rgb[2] * v, 0] : [v, v, v, 1];
    };
  },
  solid(rgb, k = 0.15) {
    return (x, y, z) => { const v = 1 - k + vnoise(x * 1.5, y * 1.5, z * 1.5) * k; return [rgb[0] * v, rgb[1] * v, rgb[2] * v, 0]; };
  },
};

// ------------------------------------------------------------------ construcción de partes
const TORSO_PROF = [[0, 4.0, 2.7, 0], [0.22, 3.8, 2.6, 0.1], [0.5, 4.4, 2.9, 0.25], [0.74, 5.0, 3.2, 0.35], [0.88, 5.2, 3.0, 0.2], [0.96, 3.6, 2.3, 0.1], [1, 1.7, 1.6, 0.25]];
const bump = (t, a, b) => (t < a || t > b ? 0 : Math.sin((t - a) / (b - a) * Math.PI));

const ZKit = {
  TORSOS: ['tshirt', 'office', 'hoodie', 'police', 'gown', 'vest', 'ribs', 'tank', 'bloat'],
  HEADS: ['bald', 'short', 'long', 'skull', 'spitter'],
  UARMS: ['short', 'long', 'bare', 'stump'],
  FARMS: ['skin', 'sleeve'],

  build() {
    if (this.geo) return;
    const G = this.geo = {};
    G.pelvis = [this.pelvis(11)];
    G.thigh = [this.thigh(12)];
    G.shin = [this.shin(13, false), this.shin(14, true)];
    G.foot = [this.foot(15, false), this.foot(16, true)];
    G.torso = this.TORSOS.map((k, i) => this.torso(k, 20 + i * 3));
    G.head = this.HEADS.map((k, i) => this.head(k, 60 + i * 5));
    G.jaw = [this.jaw(90, false), this.jaw(91, true)];
    G.uarm = this.UARMS.map((k, i) => this.upperArm(k, 100 + i));
    G.farm = this.FARMS.map((k, i) => this.forearm(k, 110 + i));
    G.hand = [this.hand(120)];
  },

  randomLook(type) {
    const L = {
      torso: U.choice([0, 0, 1, 2, 3, 4, 5, 6]), head: U.choice([0, 1, 1, 2, 3]), sleeve: U.choice([0, 0, 1, 2]),
      shin: U.choice([0, 0, 1]), foot: U.choice([0, 0, 0, 1]), missingArm: Math.random() < 0.12,
      armsDown: Math.random() < 0.3, limp: Math.random() < 0.45 ? U.rand(0.3, 1) : 0,
      tilt: U.rand(-0.35, 0.35), jawPh: U.rand(0, TAU), thin: 1, lean: U.rand(-0.05, 0.12),
    };
    if (L.torso === 1 || L.torso === 3) L.sleeve = 1;
    if (L.torso === 4 || L.torso === 6) L.sleeve = 2;
    if (type === 'brute') Object.assign(L, { torso: 7, sleeve: 2, missingArm: false, armsDown: true, limp: 0 });
    if (type === 'bloater') Object.assign(L, { torso: 8, sleeve: 2, armsDown: false, missingArm: false });
    if (type === 'spitter') L.head = 4;
    if (type === 'runner') Object.assign(L, { thin: 0.86, armsDown: false, limp: 0 });
    return L;
  },

  shirtFor(look) {
    if (look.torso === 1) return U.choice(['#e0ded6', '#bccbdc', '#dcd0bc', '#c8d2c0']);
    if (look.torso === 3) return '#1c2438';
    if (look.torso === 7) return U.choice(['#e0e0d8', '#3a3a38', '#5a4a3a']);
    return U.choice(SHIRTS);
  },

  pelvis(seed) {
    const cloth = ZPaint.cloth(seed, { tear: 0.8 });
    const belt = (x, y, z) => (y > 1.4 && y < 2.2 ? (Math.abs(x) < 0.7 && z > 1 ? [0.55, 0.45, 0.2, 0] : [0.09, 0.07, 0.05, 0]) : cloth(x, y, z));
    return new PartBuilder().add(gEll(4.2, 2.9, 2.9, 0, 0, 0, 14, 8), belt).build();
  },
  thigh(seed) {
    const cloth = ZPaint.cloth(seed, { tear: 0.76 });
    return new PartBuilder()
      .add(gLimb(6.8, 2.3, 1.75, 12, 5, 0.1), cloth)
      .add(gEll(1.8, 1.8, 1.85, 0, -6.8, 0.15, 10, 7), cloth).build();
  },
  shin(seed, torn) {
    const cloth = ZPaint.cloth(seed, { tear: 0.78, grimeY: -6 }), skin = ZPaint.skin(seed, { wound: 0.68, dirtY: -4 });
    const paint = torn ? (x, y, z) => (y > -2.4 + vnoise(x * 2, 0, z * 2) * 1.2 ? cloth(x, y, z) : skin(x, y, z)) : cloth;
    const g = gLimb(6.0, 1.75, 1.2, 10, 5, 0.14, 0.4);
    return new PartBuilder().add(g, paint).build();
  },
  foot(seed, bare) {
    const pb = new PartBuilder();
    if (!bare) {
      const shoe = U.choice([[0.12, 0.09, 0.07], [0.2, 0.2, 0.22], [0.3, 0.2, 0.12]]);
      const g = gEll(1.45, 1.0, 2.8, 0, -0.35, 0.9, 12, 8);
      displace(g, (x, y) => (y < -0.9 ? -0.15 : 0));
      pb.add(g, (x, y, z) => (y < -0.95 ? [0.05, 0.05, 0.05, 0] : (z > 1.2 && y > -0.1 && Math.abs(x) < 0.5 ? [0.6, 0.58, 0.5, 0] : ZPaint.solid(shoe)(x, y, z))));
    } else {
      const skin = ZPaint.skin(seed, { wound: 0.7, dirtY: 0.5 });
      pb.add(gEll(1.3, 0.8, 2.6, 0, -0.3, 0.9, 10, 7), skin);
      for (let i = 0; i < 4; i++) pb.add(gEll(0.32, 0.3, 0.42, -0.7 + i * 0.46, -0.45, 3.3 - Math.abs(i - 1.5) * 0.2, 6, 4), (x, y, z) => [0.35, 0.32, 0.28, 2]);
    }
    return pb.build();
  },

  torso(kind, seed) {
    const pb = new PartBuilder();
    const H = 11.5;
    let prof = TORSO_PROF, scaleX = 1, scaleZ = 1;
    if (kind === 'tank') { scaleX = 1.25; scaleZ = 1.2; }
    const P = prof.map(p => [p[0], p[1] * scaleX, p[2] * scaleZ, p[3]]);
    const shape = (x, y, z, t, front) => {
      if (front > 0) z += 0.38 * bump(t, 0.58, 0.88) * front * front * scaleZ; // pecho
      return [x, z];
    };
    const body = gTrunk(H, P, 18, 12, shape);
    const deltR = kind === 'tank' ? 2.45 : 2.1;
    const deltL = gEll(deltR, deltR * 1.1, deltR, -4.9 * scaleX, 9.7, 0, 10, 8);
    const deltRt = gEll(deltR, deltR * 1.1, deltR, 4.9 * scaleX, 9.7, 0, 10, 8);
    let paint, deltPaint;
    const skin = ZPaint.skin(seed, { wound: 0.7 });
    const neckSkin = (p) => (x, y, z) => (y > 10.4 && z > -0.6 ? skin(x, y, z) : p(x, y, z));
    switch (kind) {
      case 'tshirt': {
        const c = ZPaint.cloth(seed);
        const logo = [U.rand(0.5, 1), U.rand(0.2, 0.9), U.rand(0.1, 0.5)];
        paint = neckSkin((x, y, z) => (z > 2.5 && Math.hypot(x, y - 7.4) < 1.3 ? [logo[0], logo[1], logo[2], 0] : c(x, y, z)));
        deltPaint = c;
        break;
      }
      case 'office': {
        const c = ZPaint.cloth(seed, { tear: 0.78, blood: 0.66 });
        paint = (x, y, z) => {
          if (z > 2 && Math.abs(x) < 0.5 + (y > 9.6 ? 0.4 : 0) && y > 3 && y < 10.8) return fix([0.38, 0.05, 0.09], 0.85 + vnoise(x * 3, y * 3, 0) * 0.2); // corbata
          if (y > 10.2 && z > 0.5 && Math.abs(x) < 2.4) return [0.95, 0.95, 0.92, 1];
          return c(x, y, z);
        };
        deltPaint = c;
        break;
      }
      case 'hoodie': {
        const c = ZPaint.cloth(seed, { tear: 0.79 });
        paint = (x, y, z) => (z > 2.3 && y > 1.2 && y < 4.4 && Math.abs(x) < 2.8 ? (() => { const r = c(x, y, z); return [r[0] * 0.8, r[1] * 0.8, r[2] * 0.8, r[3]]; })() : c(x, y, z));
        pb.add(gEll(3.3, 1.9, 2.5, 0, 10.6, -1.9, 12, 8), c); // capucha
        for (const sx of [-0.8, 0.8]) pb.add(gLimb(3.2, 0.14, 0.14, 4, 1).translate(sx, 10.4, 2.9), (x, y, z) => [0.85, 0.85, 0.8, 0]);
        deltPaint = c;
        break;
      }
      case 'police': {
        const c = ZPaint.cloth(seed, { rgb: [0.11, 0.14, 0.24], tear: 0.8 });
        paint = neckSkin((x, y, z) => {
          if (y < 0.9) return Math.abs(x) < 0.8 && z > 1 ? [0.75, 0.62, 0.25, 0] : [0.05, 0.05, 0.05, 0];
          return c(x, y, z);
        });
        pb.add(new THREE.BoxGeometry(1.1, 1.3, 0.4).translate(2.0, 8.4, 3.35), (x, y, z) => [0.85, 0.7, 0.25, 0]); // placa
        pb.add(new THREE.BoxGeometry(1.6, 0.5, 0.3).translate(-2.0, 8.0, 3.35), (x, y, z) => [0.8, 0.8, 0.78, 0]);
        pb.add(new THREE.BoxGeometry(1.2, 2.0, 1.0).translate(-3.2, 0.6, 2.0), (x, y, z) => [0.06, 0.06, 0.06, 0]); // funda
        deltPaint = (x, y, z) => (y > 10.3 && y < 11.2 ? [0.7, 0.6, 0.25, 0] : c(x, y, z));
        break;
      }
      case 'gown': {
        const c = ZPaint.cloth(seed, { rgb: [0.56, 0.69, 0.71], blood: 0.6, tear: 0.82 });
        paint = neckSkin((x, y, z) => {
          if (z < -1.6 && Math.abs(x) < 1.4 + y * 0.05) return skin(x, y, z); // espalda abierta
          const r = c(x, y, z);
          if (r[3] === 0 && r[1] > 0.4 && vnoise(x * 4, y * 4, z * 4) > 0.82) return [r[0] * 0.75, r[1] * 0.8, r[2] * 0.9, 0];
          return r;
        });
        deltPaint = c;
        break;
      }
      case 'vest': {
        const c = ZPaint.cloth(seed);
        paint = neckSkin((x, y, z) => {
          const base = c(x, y, z);
          if (base[3] === 2 || y > 10.0) return base;
          if ((y > 3.4 && y < 4.1) || (y > 6.7 && y < 7.4)) return [0.82, 0.82, 0.76, 0];
          if (base[0] < 0.45 && base[3] === 0) return base;
          return [0.95 * base[0], 0.42 * base[0], 0.05, 0];
        });
        deltPaint = c;
        break;
      }
      case 'ribs': {
        const band = ZPaint.cloth(seed);
        paint = (x, y, z) => {
          if (y < 1.6) return band(x, y, z);
          if (x < -1.8 && y > 3.8 && y < 9.4 && z > -1.8) return fix(x < -3 ? ZC.cavity : ZC.flesh, 0.9);
          return skin(x, y, z);
        };
        displace(body, (x, y, z) => (x < -1.8 && y > 3.8 && y < 9.4 && z > -1.8 ? -0.6 : 0));
        // costillas a la vista
        for (let i = 0; i < 5; i++) {
          const y = 4.4 + i * 1.0, rx = 4.3 + i * 0.12, rz = 2.8 + i * 0.07, zo = 0.25;
          for (let k = 0; k < 4; k++) {
            const a0 = -1.25 - k * 0.38, a1 = a0 - 0.38;
            const p0 = new THREE.Vector3(Math.sin(a0) * rx, y, Math.cos(a0) * rz + zo), p1 = new THREE.Vector3(Math.sin(a1) * rx, y - 0.15, Math.cos(a1) * rz + zo);
            const dir = p1.clone().sub(p0), len = dir.length();
            const g = new THREE.CapsuleGeometry(0.2, len, 1, 5);
            const m = new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1));
            g.applyMatrix4(m);
            pb.add(g, (x, y2, z) => fix(ZC.bone, 0.9 + vnoise(x * 4, y2 * 4, z * 4) * 0.15));
          }
        }
        deltPaint = skin;
        break;
      }
      case 'tank': {
        const c = ZPaint.cloth(seed, { tear: 0.78 });
        displace(body, (x, y, z) => {
          let d = 0;
          if (z > 0.5 && y > 1.5 && y < 6) d += 0.22 * Math.max(0, Math.sin(x * 1.5 + 0.8)) * Math.max(0, Math.sin(y * 1.6)); // abdominales
          if (z > 1 && y > 7 && y < 10) d += 0.3; // pectorales
          return d + (fbm(x * 0.5, y * 0.5, z * 0.5) - 0.5) * 0.3;
        });
        paint = (x, y, z) => (Math.abs(x) < 3.4 && y < 10.6 && y > 0.4 ? c(x, y, z) : skin(x, y, z));
        deltPaint = skin;
        break;
      }
      case 'bloat': {
        const top = ZPaint.cloth(seed, { tear: 0.7 });
        const sk = ZPaint.skin(seed, { wound: 0.8, drip: 0.86 });
        const veins = (x, y, z) => {
          const r = sk(x, y, z);
          if (r[3] === 2 && Math.abs(vnoise(x * 0.9, y * 0.9, z * 0.9) - 0.5) < 0.04) return [0.35, 0.25, 0.4, 0];
          return r;
        };
        paint = (x, y, z) => (y > 8.6 ? top(x, y, z) : veins(x, y, z));
        const belly = gEll(6.2, 5.9, 6.0, 0, 5.0, 2.3, 18, 14);
        displace(belly, (x, y, z) => (fbm(x * 0.4, y * 0.4, z * 0.4) - 0.5) * 0.9);
        pb.add(belly, veins);
        for (let i = 0; i < 16; i++) {
          const a = U.rand(-1.3, 1.3), b = U.rand(-0.9, 0.9);
          const px = Math.sin(a) * Math.cos(b) * 6.0, py = 5.0 + Math.sin(b) * 5.7, pz = 2.3 + Math.cos(a) * Math.cos(b) * 5.8;
          const r = U.rand(0.45, 1.1);
          pb.add(gEll(r, r, r * 0.8, px, py, pz, 7, 5), (x, y, z) => fix(ZC.pus, 0.85 + vnoise(x * 3, y * 3, z * 3) * 0.3));
        }
        deltPaint = sk;
        break;
      }
    }
    if (['tshirt', 'office', 'hoodie', 'gown', 'vest', 'tank', 'police'].includes(kind)) {
      const rag = ZPaint.cloth(seed + 9, { tear: 2, rgb: kind === 'police' ? [0.11, 0.14, 0.24] : kind === 'gown' ? [0.56, 0.69, 0.71] : undefined });
      const n = kind === 'gown' ? 9 : U.randInt(3, 6);
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, TAU), len = U.rand(1.6, kind === 'gown' ? 5 : 3.2);
        const g = new THREE.BoxGeometry(U.rand(0.6, 1.3), len, 0.14);
        g.translate(0, -len / 2 + 0.3, 0);
        g.rotateX(Math.cos(a) * 0.12);
        g.rotateY(a);
        g.translate(Math.sin(a) * 3.95 * scaleX, 0.2, Math.cos(a) * 2.65 * scaleZ);
        pb.add(g, rag);
      }
    }
    pb.add(body, paint);
    pb.add(deltL, deltPaint);
    pb.add(deltRt, deltPaint);
    return pb.build();
  },

  head(kind, seed) {
    const pb = new PartBuilder();
    const skin = ZPaint.skin(seed, { wound: kind === 'bald' ? 0.68 : 0.74, drip: kind === 'bald' ? 0.72 : 0.8 });
    const skull = gEll(3.1, 3.7, 3.4, 0, 3.7, 0.3, 18, 14);
    const eyes = [[-1.25, 4.2, 3.25], [1.25, 4.2, 3.25]];
    displace(skull, (x, y, z) => {
      let d = 0;
      for (const e of eyes) {
        const q = Math.hypot(x - e[0], y - e[1], z - e[2]);
        if (q < 1.15) d -= 0.5 * (1 - q / 1.15);
      }
      if (y > 4.8 && y < 5.4 && z > 2.4) d += 0.22; // arco superciliar
      if (y < 3.2 && Math.abs(x) > 1.6) d -= 0.25; // mejillas hundidas
      return d + (fbm(x * 0.8 + seed, y * 0.8, z * 0.8) - 0.5) * 0.25;
    });
    const face = (x, y, z) => {
      for (const e of eyes) if (Math.hypot(x - e[0], y - e[1], z - e[2]) < 1.0) return fix(ZC.dark);
      if (Math.hypot(x, (y - 2.5) * 1.4, z - 3.2) < 1.5 && z > 2.3) return fix(kind === 'spitter' ? ZC.slime : ZC.mouth);
      if (kind === 'skull' && x < 0.6 && y > 4.6 && fbm(x * 0.6 + seed, y * 0.6, z * 0.6) > 0.42) {
        return fbm(x * 0.6 + seed, y * 0.6, z * 0.6) > 0.47 ? fix(ZC.bone, 0.9) : fix(ZC.fresh);
      }
      return skin(x, y, z);
    };
    pb.add(skull, face);
    pb.add(gLimb(2.4, kind === 'spitter' ? 2.4 : 1.5, kind === 'spitter' ? 2.2 : 1.6, 10, 2).translate(0, 1.8, 0), kind === 'spitter' ? ZPaint.skin(seed + 1, { wound: 0.6 }) : skin);
    for (const sx of [-1, 1]) pb.add(gEll(0.45, 1.0, 0.75, sx * 3.05, 3.7, 0.2, 7, 5), skin); // orejas
    if (Math.random() < 0.75) pb.add(gEll(0.55, 0.85, 0.6, 0, 3.45, 3.55, 7, 5), skin); // nariz
    // dientes superiores (algunos faltan)
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.2) continue;
      const a = -0.75 + i * 0.21;
      pb.add(new THREE.BoxGeometry(0.42, 0.75, 0.32).translate(Math.sin(a) * 2.15, 2.45, 1.15 + Math.cos(a) * 2.15), (x, y, z) => fix(ZC.teeth, 0.8 + Math.random() * 0.3));
    }
    const hairCol = U.choice([[0.08, 0.06, 0.05], [0.25, 0.16, 0.09], [0.55, 0.45, 0.28], [0.45, 0.43, 0.4]]);
    const hair = (x, y, z) => (fbm(x * 0.7 + seed, y * 0.7, z * 0.7) > 0.68 ? skin(x, y, z) : ZPaint.solid(hairCol, 0.35)(x, y, z));
    if (kind === 'short' || kind === 'long') {
      const cap = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, 1.3);
      cap.scale(3.3, 3.85, 3.6);
      cap.rotateX(-0.35);
      cap.translate(0, 3.8, 0.1);
      displace(cap, (x, y, z) => (fbm(x * 1.2 + seed, y * 1.2, z * 1.2) - 0.4) * 0.35);
      pb.add(cap, hair);
      if (kind === 'long') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 8) * Math.PI;
          const g = new THREE.CapsuleGeometry(0.42, U.rand(3.5, 5.5), 2, 5);
          g.translate(0, -2.5, 0);
          g.rotateX(-0.25 + U.rand(-0.15, 0.15));
          g.rotateZ(U.rand(-0.15, 0.15));
          g.translate(Math.cos(a) * 3.0, 5.6, Math.sin(a) * -2.9 + 0.3);
          pb.add(g, hair);
        }
      }
    }
    return pb.build();
  },

  jaw(seed, open) {
    const pb = new PartBuilder();
    const skin = ZPaint.skin(seed, { wound: 0.7, drip: 0.62 });
    const g = new THREE.SphereGeometry(1, 14, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
    g.scale(2.55, 1.7, 2.5);
    g.translate(0, 0.1, 1.35);
    pb.add(g, (x, y, z) => (y > -0.1 && z > 0 ? fix(ZC.mouth) : skin(x, y, z)));
    for (let i = 0; i < 7; i++) {
      if (Math.random() < 0.25) continue;
      const a = -0.65 + i * 0.22;
      pb.add(new THREE.BoxGeometry(0.4, 0.65, 0.3).translate(Math.sin(a) * 2.0, 0.35, 1.35 + Math.cos(a) * 2.0), (x, y, z) => fix(ZC.teeth, 0.75 + Math.random() * 0.3));
    }
    return pb.build();
  },

  upperArm(kind, seed) {
    const pb = new PartBuilder();
    const cloth = ZPaint.cloth(seed), skin = ZPaint.skin(seed, { wound: 0.68 });
    let paint;
    if (kind === 'short') paint = (x, y, z) => (y > -2.8 + vnoise(x * 2, 0, z * 2) * 0.9 ? cloth(x, y, z) : skin(x, y, z));
    else if (kind === 'long') paint = cloth;
    else if (kind === 'stump') paint = (x, y, z) => (y < -4.3 ? (y < -5.2 ? fix(ZC.flesh) : fix(ZC.fresh)) : skin(x, y, z));
    else paint = skin;
    pb.add(gLimb(kind === 'stump' ? 5.4 : 5.8, 1.8, 1.45, 10, 4, 0.12), paint);
    if (kind === 'stump') pb.add(gLimb(1.0, 0.35, 0.3, 5, 1).translate(0, -5.4, 0), (x, y, z) => fix(ZC.bone));
    else pb.add(gEll(1.45, 1.45, 1.45, 0, -5.8, 0, 8, 6), paint);
    return pb.build();
  },

  forearm(kind, seed) {
    const cloth = ZPaint.cloth(seed), skin = ZPaint.skin(seed, { wound: 0.66, drip: 0.72 });
    const paint = kind === 'sleeve' ? (x, y, z) => (y > -4.3 ? cloth(x, y, z) : skin(x, y, z)) : skin;
    return new PartBuilder().add(gLimb(5.4, 1.45, 1.05, 9, 4, 0.1, 0.65), paint).build();
  },

  hand(seed) {
    const pb = new PartBuilder();
    const skin = ZPaint.skin(seed, { wound: 0.7, drip: 0.66, dirtY: -2.6 });
    pb.add(gEll(1.15, 1.5, 0.62, 0, -1.3, 0.1, 9, 7), skin);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CapsuleGeometry(0.26, 1.3 - Math.abs(i - 1.5) * 0.15, 2, 5);
      g.translate(0, -0.75, 0);
      g.rotateX(0.75); // dedos curvados como garras
      g.translate(-0.72 + i * 0.48, -2.65, 0.2);
      pb.add(g, (x, y, z) => (y < -3.5 ? [0.18, 0.13, 0.09, 0] : skin(x, y, z)));
    }
    const th = new THREE.CapsuleGeometry(0.28, 1.1, 2, 5);
    th.translate(0, -0.6, 0);
    th.rotateZ(0.7);
    th.rotateX(0.5);
    th.translate(0.95, -1.4, 0.45);
    pb.add(th, skin);
    return pb.build();
  },
};

// ------------------------------------------------------------------ material con tintes por instancia
function makeZombieMaterial() {
  const grunge = Tex.toTex(Tex.surface(256, [225, 225, 225], 70, 40, 8));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: grunge, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute vec3 aSkin;\nattribute vec2 aFx;')
      .replace('#include <color_vertex>', `
        vColor = vec3(1.0);
        vColor *= color;
        float isCloth = 1.0 - min(abs(aTint - 1.0), 1.0);
        float isSkin = 1.0 - min(abs(aTint - 2.0), 1.0);
        vColor *= mix(vec3(1.0), instanceColor.rgb, isCloth);
        vColor *= mix(vec3(1.0), aSkin, isSkin);
        vColor = mix(vColor, vec3(1.0, 0.22, 0.08), aFx.y);
        vColor *= 1.0 + aFx.x * 2.5;`);
  };
  m.customProgramCacheKey = () => 'zombie-tint-v1';
  return m;
}

// ------------------------------------------------------------------ rig: dibuja zombis con instancias
const PAIRED = { thigh: 1, shin: 1, foot: 1, uarm: 1, farm: 1, hand: 1 };

class ZombieRig {
  constructor(scene, max, shadows = true) {
    ZKit.build();
    this.max = max;
    this.mat = makeZombieMaterial();
    this.parts = {};
    for (const k in ZKit.geo) {
      this.parts[k] = ZKit.geo[k].map(src => this.mkInst(scene, src, max * (PAIRED[k] ? 2 : 1), shadows));
    }
    const eyeGeo = new THREE.SphereGeometry(0.55, 6, 4);
    this.eyes = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false }), max * 2);
    this.sac = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshStandardMaterial({ color: 0xb8e04a, emissive: 0x6aa010, emissiveIntensity: 1, roughness: 0.25, transparent: true, opacity: 0.88 }), 150);
    for (const m of [this.eyes, this.sac]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.eyes.setColorAt(0, _col.set(1, 0, 0));
    this.sac.castShadow = shadows;
    this.eyeGlow = 1;
    this.m = Array.from({ length: 12 }, () => new THREE.Matrix4());
    this.c1 = new THREE.Color(); this.c2 = new THREE.Color(); this.c3 = new THREE.Color();
  }

  mkInst(scene, src, n, shadows) {
    const g = new THREE.BufferGeometry();
    for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
    g.boundingSphere = src.boundingSphere;
    g.setAttribute('aSkin', new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.InstancedMesh(g, this.mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, _col.set(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = shadows;
    m.count = 0;
    scene.add(m);
    return m;
  }

  setShadows(on) {
    for (const k in this.parts) for (const m of this.parts[k]) m.castShadow = on;
    this.sac.castShadow = on;
  }

  begin() {
    for (const k in this.parts) for (const m of this.parts[k]) m.count = 0;
    this.eyes.count = 0;
    this.sac.count = 0;
  }

  end() {
    const upd = m => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (m.geometry.attributes.aSkin) { m.geometry.attributes.aSkin.needsUpdate = true; m.geometry.attributes.aFx.needsUpdate = true; }
    };
    for (const k in this.parts) for (const m of this.parts[k]) upd(m);
    upd(this.eyes);
    upd(this.sac);
  }

  put(key, variant, matrix, tint, fx) {
    const m = this.parts[key][variant];
    if (m.count >= m.instanceMatrix.count) return;
    const i = m.count++;
    m.setMatrixAt(i, matrix);
    m.setColorAt(i, tint);
    m.geometry.attributes.aSkin.setXYZ(i, this.c3.r, this.c3.g, this.c3.b);
    m.geometry.attributes.aFx.setXY(i, fx[0], fx[1]);
  }

  // st: estado de un zombi (vivo o cadáver) con su apariencia y animación
  draw(st) {
    if (this.parts.torso[0].count >= this.max) return;
    const T = ZOMBIE_TYPES[st.type], L = st.look, M = this.m;
    const shirt = this.c1.set(st.shirt), pants = this.c2.set(st.pants);
    this.c3.set(st.skin);
    const fx = [st.flash ? 1 : 0, st.blink ? 0.85 : 0];
    const s = T.model * (st.swell || 1);
    const ph = st.walk, runner = st.type === 'runner', brute = st.type === 'brute', bloat = st.type === 'bloater';
    const fall = st.dead ? Math.min(1, st.fall) : 0, ef = fall * fall * (3 - 2 * fall);
    const buckle = st.dead ? Math.sin(Math.PI * Math.min(1, fall * 1.2)) : 0;
    const moving = st.dead ? 0 : 1;

    // raíz (en los pies) + caída al morir
    compose(M[0], st.x, (st.y0 || 0) - (st.sink || 0) + ef * 3 * s, st.y, 0, yawOf(st.angle), 0, s * L.thin, s, s * (L.thin + 1) / 2, 'YXZ');
    if (st.dead) M[0].multiply(compose(M[11], 0, 0, 0, st.fallDir * ef * Math.PI / 2, 0, 0));

    const A = (runner ? 0.95 : brute ? 0.42 : bloat ? 0.38 : 0.55) * moving;
    const bob = moving * Math.abs(Math.cos(ph)) * (runner ? 1.4 : 0.9);
    const sway = moving * Math.sin(ph) * (bloat ? 0.16 : brute ? 0.09 : 0.05 + L.limp * 0.06);
    // pelvis
    compose(M[11], 0, 14.2 + bob - buckle * 4, 0, 0, moving * Math.sin(ph) * 0.12, sway);
    M[1].multiplyMatrices(M[0], M[11]);
    this.put('pelvis', 0, M[1], pants, fx);
    // piernas
    for (const side of [-1, 1]) {
      const phi = ph + (side > 0 ? Math.PI : 0);
      const lim = side < 0 ? 1 - L.limp * 0.55 : 1;
      const thighA = -Math.sin(phi) * A * lim - buckle * 0.9;
      const kneeA = (0.5 + 0.5 * Math.cos(phi + 0.7)) * A * 1.5 * lim + buckle * 1.6 + (side < 0 ? L.limp * 0.15 * moving : 0);
      compose(M[11], side * 2.3, -0.6, 0, thighA, 0, side * (0.04 + (st.dead ? ef * 0.15 : 0)));
      M[2].multiplyMatrices(M[1], M[11]);
      this.put('thigh', 0, M[2], pants, fx);
      compose(M[11], 0, -6.8, 0, kneeA, 0, 0);
      M[3].multiplyMatrices(M[2], M[11]);
      this.put('shin', L.shin, M[3], pants, fx);
      compose(M[11], 0, -6.0, 0, -(thighA + kneeA) * 0.6 + (side < 0 ? L.limp * 0.3 * moving : 0), 0, 0);
      M[4].multiplyMatrices(M[3], M[11]);
      this.put('foot', L.foot, M[4], pants, fx);
    }
    // columna / torso
    const baseLean = runner ? 0.55 : brute ? 0.2 : bloat ? -0.08 : st.type === 'spitter' ? 0.22 : 0.26;
    const lean = st.dead ? buckle * 0.5 : baseLean + L.lean + st.lunge * 0.35 - (st.recoil || 0) * 0.6;
    compose(M[11], 0, 1.0, 0, lean, -moving * Math.sin(ph) * 0.14, -sway * 0.6);
    M[5].multiplyMatrices(M[1], M[11]);
    this.put('torso', L.torso, M[5], shirt, fx);
    // cabeza y mandíbula
    const near = st.near ? 1 : 0;
    const nod = st.dead ? 0.4 * ef : -lean * 0.65 + Math.sin(st.wob) * 0.12 - (st.recoil || 0) * 0.7 + (st.spit ? -0.5 : 0);
    compose(M[11], 0, 11.2, 0.4, nod, st.dead ? 0.6 * ef : Math.sin(st.wob * 0.7) * 0.25, L.tilt + Math.sin(st.wob * 0.5) * 0.1);
    M[6].multiplyMatrices(M[5], M[11]);
    this.put('head', L.head, M[6], shirt, fx);
    const jawOpen = st.dead ? 0.55 : Math.max(st.lunge * 0.75, st.spit ? 0.85 : 0, 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(st.t * (near ? 15 : 4) + L.jawPh)) * (0.6 + near * 0.6));
    compose(M[11], 0, 2.35, 0.1, jawOpen, 0, 0);
    M[7].multiplyMatrices(M[6], M[11]);
    this.put('jaw', 0, M[7], shirt, fx);
    if (!st.dead && this.eyes.count < this.eyes.instanceMatrix.count - 1) {
      const ec = st.type === 'spitter' ? [0.7, 1, 0.2] : brute ? [1, 0.05, 0.02] : [1, 0.28, 0.12];
      for (const ex of [-1.25, 1.25]) {
        M[8].multiplyMatrices(M[6], compose(M[11], ex, 4.2, 2.95, 0, 0, 0));
        const i = this.eyes.count++;
        this.eyes.setMatrixAt(i, M[8]);
        this.eyes.setColorAt(i, _col.setRGB(ec[0] * this.eyeGlow, ec[1] * this.eyeGlow, ec[2] * this.eyeGlow));
      }
    }
    if (st.type === 'spitter' && !st.dead && this.sac.count < 150) {
      const pulse = 2.3 * (1 + Math.sin(st.t * 6) * 0.12 + (st.spit ? 0.35 : 0));
      M[8].multiplyMatrices(M[5], compose(M[11], 0, 11.0, 2.3, 0, 0, 0, pulse, pulse * 0.85, pulse));
      this.sac.setMatrixAt(this.sac.count++, M[8]);
    }
    // brazos
    const sleeveVar = L.sleeve, farmVar = sleeveVar === 1 ? 1 : 0;
    for (const side of [-1, 1]) {
      const phi = ph + (side > 0 ? 0 : Math.PI);
      let rx, rz, elbow, wrist = 0.35;
      if (st.dead) {
        rx = -2.6 * ef * (side < 0 ? 1 : 0.8); rz = -side * (0.3 + 0.9 * ef); elbow = 0.3; wrist = 0.2;
      } else if (st.lunge > 0) {
        rx = -1.65; rz = -side * 0.05; elbow = 0.05; wrist = 0.1;
      } else if (runner) {
        rx = Math.sin(phi) * 1.1 - 0.3; rz = -side * 0.12; elbow = -1.2; wrist = 0.2;
      } else if (brute) {
        rx = Math.sin(phi) * 0.3 - 0.1; rz = -side * 0.32; elbow = -0.35; wrist = 0.25;
      } else if (bloat) {
        rx = -0.55 + Math.sin(phi) * 0.15; rz = -side * 1.0; elbow = -0.5;
      } else if (L.armsDown) {
        rx = Math.sin(phi) * 0.35 - 0.1; rz = -side * 0.12; elbow = -0.3 - Math.abs(Math.sin(phi)) * 0.2;
      } else {
        rx = -1.32 + side * Math.sin(ph) * 0.15; rz = side * 0.1; elbow = 0.22 + Math.sin(st.wob + side) * 0.1;
      }
      const sx = (st.type === 'brute' ? 5.9 : 5.3) * (L.torso === 7 ? 1.12 : 1);
      compose(M[11], side * sx, 9.9, 0, rx, 0, rz, 1, 1, 1, 'XYZ');
      M[8].multiplyMatrices(M[5], M[11]);
      const stump = L.missingArm && side < 0;
      this.put('uarm', stump ? 3 : sleeveVar, M[8], shirt, fx);
      if (stump) continue;
      compose(M[11], 0, -5.8, 0, elbow, 0, 0);
      M[9].multiplyMatrices(M[8], M[11]);
      this.put('farm', farmVar, M[9], shirt, fx);
      compose(M[11], 0, -5.4, 0, wrist, 0, 0);
      M[10].multiplyMatrices(M[9], M[11]);
      this.put('hand', 0, M[10], shirt, fx);
    }
  }
}
