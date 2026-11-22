'use strict';

// ============================================================================
//  RENDER 3D (Three.js) — cámara alta en perspectiva, luces y sombras reales.
//  El juego vive en el plano (x, y); en 3D se mapea a (x, altura, y).
// ============================================================================

const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _mC = new THREE.Matrix4(), _mD = new THREE.Matrix4(), _mE = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _col = new THREE.Color(), _col2 = new THREE.Color();

function compose(out, x, y, z, rx, ry, rz, sx = 1, sy = sx, sz = sx, order = 'XYZ') {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_v, _q, _s);
}
// los modelos miran hacia +Z local; en el mapa miran hacia (cos a, sin a)
const yawOf = a => Math.PI / 2 - a;

// une varias geometrías en una (con grupos por material)
function mergeGeos(parts) {
  const sorted = parts.slice().sort((a, b) => (a.group || 0) - (b.group || 0));
  const pos = [], nor = [], uv = [], groups = [];
  let count = 0;
  for (const p of sorted) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    const n = g.attributes.position.count;
    pos.push(g.attributes.position.array);
    nor.push(g.attributes.normal.array);
    uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(n * 2));
    const gi = p.group || 0;
    if (groups.length && groups[groups.length - 1].mi === gi) groups[groups.length - 1].count += n;
    else groups.push({ start: count, count: n, mi: gi });
    count += n;
  }
  const cat = (arrs, k) => {
    const out = new Float32Array(count * k);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat(pos, 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor, 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(cat(uv, 2), 2));
  for (const g of groups) geo.addGroup(g.start, g.count, g.mi);
  return geo;
}

// caja con UV en unidades de mundo (para que las texturas se repitan a escala real)
function boxUV(w, h, d, tileW, tileH, topTile = 256) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === 2 || f === 3) uv.setXY(i, uv.getX(i) * w / topTile, uv.getY(i) * d / topTile);
      else uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / tileW, uv.getY(i) * h / tileH);
    }
  }
  return g;
}

// convierte '#rrggbb' / 'rgba(...)' a componentes 0..1 (con caché)
const _colorCache = new Map();
function parseColor(str) {
  let c = _colorCache.get(str);
  if (c) return c;
  c = { r: 1, g: 1, b: 1, a: 1 };
  if (str[0] === '#') {
    const h = str.length === 4 ? str.slice(1).split('').map(x => x + x).join('') : str.slice(1);
    c.r = parseInt(h.slice(0, 2), 16) / 255;
    c.g = parseInt(h.slice(2, 4), 16) / 255;
    c.b = parseInt(h.slice(4, 6), 16) / 255;
  } else {
    const m = str.match(/[\d.]+/g).map(Number);
    c.r = m[0] / 255; c.g = m[1] / 255; c.b = m[2] / 255; c.a = m[3] !== undefined ? m[3] : 1;
  }
  _colorCache.set(str, c);
  return c;
}

const PARTICLE_VS = `
attribute float size;
attribute vec4 rgba;
varying vec4 vC;
uniform float uScale;
void main() {
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * uScale / -mv.z, 96.0);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
varying vec4 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.12, d));
}`;

class Renderer {
  constructor(game, canvas) {
    this.g = game;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    Tex.maxAniso = Math.min(8, r.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8e877c, 1100, 3600);
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 1, 10, 7000);
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.CAMERA.aimHeight);
    this.fx = new Particles(); // partículas ambientales: fuego, humo, brasas
    this.last = performance.now();
    this.time = 0;
    this.buildings = [];
    this.facadeMats = [];
    this.pickupMeshes = new Map();

    this.setupLights();
    this.setupShared();
    this.setupDynamic();
    this.buildPlayer();
  }

  // ------------------------------------------------------------------ configuración
  setupLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xc9c2b5, 0x4a4036, 1.5);
    s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe0b8, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -1100; sc.right = 1100; sc.top = 1100; sc.bottom = -1100; sc.near = 50; sc.far = 4000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
    s.add(sun, sun.target);

    const fl = this.flash = new THREE.SpotLight(0xfff0d6, 0, 700, 0.43, 0.5, 0);
    fl.castShadow = true;
    fl.shadow.mapSize.set(1024, 1024);
    fl.shadow.camera.near = 10;
    fl.shadow.camera.far = 720;
    fl.shadow.bias = -0.0008;
    s.add(fl, fl.target);
    this.halo = new THREE.PointLight(0xffe2b8, 0, 240, 0);
    s.add(this.halo);
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 300, 0);
      this.pool.push(l);
      s.add(l);
    }
  }

  setupShared() {
    const M = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
    this.facades = [0, 1, 2, 3].map(st => [Tex.facade(st, false), Tex.facade(st, true)]);
    this.shopTex = [Tex.shopfront(), Tex.shopfront(), Tex.shopfront()];
    this.roofTex = Tex.roof();
    const concreteTex = Tex.toTex(Tex.concrete([150, 146, 138]));
    const darkConcrete = Tex.toTex(Tex.concrete([95, 92, 88]));
    this.paintCache = new Map();
    this.mat = {
      concrete: M({ map: concreteTex }),
      darkConcrete: M({ map: darkConcrete }),
      rubble: M({ map: darkConcrete, color: 0xb8ada0 }),
      rust: M({ map: Tex.rust(), roughness: 0.95, metalness: 0.2 }),
      glass: M({ color: 0x1a222a, roughness: 0.15, metalness: 0.7 }),
      darkGlass: M({ color: 0x050505, roughness: 0.6 }),
      tire: M({ color: 0x1a1a1a, roughness: 0.95 }),
      metal: M({ color: 0x8a8d90, roughness: 0.55, metalness: 0.6 }),
      darkMetal: M({ color: 0x3a3c3e, roughness: 0.6, metalness: 0.5 }),
      wood: M({ map: Tex.wood() }),
      burlap: M({ map: Tex.burlap() }),
      bark: M({ color: 0x2e2620, roughness: 1 }),
      plastic: M({ color: 0xffffff, roughness: 0.35 }),
      paper: M({ color: 0xd8d4c8, roughness: 1, side: THREE.DoubleSide }),
      orange: M({ color: 0xd8561a, roughness: 0.6 }),
      bronze: M({ color: 0x4f6a58, roughness: 0.5, metalness: 0.6 }),
      headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.4 }),
      red: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x0030ff, emissiveIntensity: 1.5 }),
      lampGlow: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      busWindows: M({ map: Tex.windowsBand(), roughness: 0.6 }),
      canvasOlive: M({ map: Tex.burlap(), color: 0x7a8a5a }),
      medkit: M({ map: Tex.medkit(), roughness: 0.5 }),
      white: M({ color: 0xe8e6e0, roughness: 0.6 }),
      olive: M({ color: 0x4f5a34, roughness: 0.8 }),
      brass: M({ color: 0xc9a040, roughness: 0.3, metalness: 0.9 }),
    };
    this.splats = { blood: Tex.splat(110, 8, 6), acid: Tex.splat(110, 150, 30), scorch: Tex.scorch() };
  }

  paint(color) {
    let m = this.paintCache.get(color);
    if (!m) {
      const c = new THREE.Color(color);
      m = new THREE.MeshStandardMaterial({ map: Tex.paint([c.r * 255, c.g * 255, c.b * 255].map(v => Math.round(v))), roughness: 0.45, metalness: 0.45 });
      this.paintCache.set(color, m);
    }
    return m;
  }

  // ------------------------------------------------------------------ objetos dinámicos
  setupDynamic() {
    const s = this.scene;
    const MAXZ = 340 + CONFIG.MAX_CORPSES;
    this.MAXZ = MAXZ;
    const inst = (geo, mat, n, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _col.set(1, 1, 1));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = false;
      m.count = 0;
      s.add(m);
      return m;
    };
    this.zrig = new ZombieRig(s, MAXZ, true);

    // proyectiles
    this.bullets = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 500, false);
    this.acid = inst(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9bd13a, emissive: 0x5a9a10, emissiveIntensity: 1.2, roughness: 0.3 }), 100, false);
    // cristales de experiencia
    this.xp = inst(new THREE.OctahedronGeometry(4.5, 0), new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x2fb8ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.3 }), 1500, false);
    // manchas en el suelo
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.decalMesh = {};
    for (const k of ['blood', 'acid', 'scorch']) {
      const m = inst(plane, new THREE.MeshStandardMaterial({ map: this.splats[k], transparent: true, depthWrite: false, roughness: k === 'blood' ? 0.35 : 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), CONFIG.MAX_DECALS, false);
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.decalMesh[k] = m;
    }

    // partículas
    const mkPoints = (additive, n) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('rgba', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 500 } }, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const p = new THREE.Points(geo, mat);
      p.frustumCulled = false;
      p.renderOrder = 5;
      s.add(p);
      return p;
    };
    this.pNormal = mkPoints(false, 4000);
    this.pGlow = mkPoints(true, 4000);
    this.ash = mkPoints(false, 700);
    this.ashData = [];
    for (let i = 0; i < 700; i++) this.ashData.push({ x: U.rand(-1000, 1000), y: U.rand(-700, 900), z: U.rand(0, 260), sp: U.rand(8, 20), ph: U.rand(0, TAU), size: U.rand(1.2, 2.6) });

    // arco del machete y láser de mira
    const ring = new THREE.RingGeometry(16, WEAPONS.machete.range + 10, 24, 1, -WEAPONS.machete.arc / 2, WEAPONS.machete.arc);
    ring.rotateX(Math.PI / 2);
    this.arc = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.arc.position.y = 14;
    s.add(this.arc);
    const lg = new THREE.BufferGeometry();
    const L = 240, w = 0.9;
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -w, 0, 0, w, L, 0, -w, L, 0, w]), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.15, 0.1, 1, 0.15, 0.1, 0, 0, 0, 0, 0, 0]), 3));
    lg.setIndex([0, 2, 1, 1, 2, 3]);
    this.laser = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    s.add(this.laser);
  }

  // ------------------------------------------------------------------ personaje del jugador
  buildPlayer() {
    const M = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));
    const jacket = M({ map: Tex.toTex(Tex.surface(128, [72, 78, 58], 25, 25, 4)) });
    const pants = M({ map: Tex.toTex(Tex.surface(128, [48, 52, 62], 20, 20, 4)) });
    const skin = M({ color: 0xd9a77e, roughness: 0.7 });
    const dark = M({ color: 0x2a2420 });
    const pack = M({ map: Tex.toTex(Tex.surface(128, [92, 70, 44], 25, 25, 4)) });
    this.playerMats = [jacket, pants, skin, dark, pack];
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    const P = this.P = {};
    P.root = new THREE.Group();
    P.roll = new THREE.Group(); P.roll.position.y = 13;
    P.body = new THREE.Group(); P.body.position.y = -13;
    P.root.add(P.roll); P.roll.add(P.body);
    const legGeo = new THREE.CapsuleGeometry(2.6, 9, 3, 8); legGeo.translate(0, -7, 0);
    P.legL = new THREE.Group(); P.legL.position.set(-3.1, 14, 0); P.legL.add(mesh(legGeo, pants));
    P.legR = new THREE.Group(); P.legR.position.set(3.1, 14, 0); P.legR.add(mesh(legGeo, pants));
    const boot = new THREE.BoxGeometry(4.6, 3, 7);
    P.legL.add(mesh(boot, dark, 0, -13, 1)); P.legR.add(mesh(boot, dark, 0, -13, 1));
    P.torso = new THREE.Group(); P.torso.position.y = 14;
    const tg = new THREE.CapsuleGeometry(5.2, 4.5, 4, 10); tg.scale(1.18, 1, 0.72); tg.translate(0, 7, 0);
    P.torso.add(mesh(tg, jacket));
    P.torso.add(mesh(new THREE.BoxGeometry(9, 11, 4.5), pack, 0, 8, -5.5));
    P.torso.add(mesh(new THREE.BoxGeometry(6, 3, 2), dark, 0, 2, -7.5)); // saco de dormir
    const hg = new THREE.SphereGeometry(4.1, 14, 12); hg.scale(0.92, 1.1, 1);
    P.head = new THREE.Group(); P.head.position.set(0, 15.8, 0.5);
    P.head.add(mesh(hg, skin));
    const cap = new THREE.SphereGeometry(4.4, 14, 8, 0, TAU, 0, Math.PI / 2); cap.scale(0.95, 0.8, 1.05);
    P.head.add(mesh(cap, dark, 0, 0.8, -0.2));
    const visor = new THREE.BoxGeometry(6, 0.8, 4);
    P.head.add(mesh(visor, dark, 0, 1.4, 4));
    P.torso.add(P.head);
    const armGeo = new THREE.CapsuleGeometry(2, 9, 3, 8); armGeo.translate(0, -6.5, 0);
    P.armL = new THREE.Group(); P.armL.position.set(-6.8, 12.5, 0);
    P.armR = new THREE.Group(); P.armR.position.set(6.8, 12.5, 0);
    P.armL.add(mesh(armGeo, jacket)); P.armR.add(mesh(armGeo, jacket));
    const hand = new THREE.SphereGeometry(1.9, 8, 6);
    P.armL.add(mesh(hand, skin, 0, -12.5, 0)); P.armR.add(mesh(hand, skin, 0, -12.5, 0));
    P.torso.add(P.armL, P.armR);
    P.body.add(P.legL, P.legR, P.torso);
    // armas (apuntan hacia -Y del brazo = hacia delante con el brazo extendido)
    const gunMetal = this.mat.darkMetal, steel = this.mat.metal;
    const W = P.weapons = {};
    const mk = parts => { const g = new THREE.Group(); for (const p of parts) g.add(p); g.position.y = -12.5; P.armR.add(g); return g; };
    W.machete = mk([mesh(new THREE.BoxGeometry(1.6, 4, 1.6), dark, 0, -1, 0), mesh(new THREE.BoxGeometry(0.6, 22, 3.2), steel, 0, -14, 0.8)]);
    W.pistol = mk([mesh(new THREE.BoxGeometry(1.8, 2, 3.2), gunMetal, 0, -1, -1), mesh(new THREE.BoxGeometry(1.8, 8, 2.2), gunMetal, 0, -4, 1)]);
    W.shotgun = mk([mesh(new THREE.BoxGeometry(2.2, 9, 3), this.mat.wood, 0, 3, 0.5), mesh(new THREE.BoxGeometry(2, 20, 2.2), gunMetal, 0, -8, 0.8)]);
    W.rifle = mk([mesh(new THREE.BoxGeometry(2.2, 8, 3), gunMetal, 0, 3, 0.5), mesh(new THREE.BoxGeometry(2.2, 14, 3.2), gunMetal, 0, -6, 0.8), mesh(new THREE.BoxGeometry(1.2, 10, 1.2), gunMetal, 0, -17, 0.8), mesh(new THREE.BoxGeometry(1.6, 4, 2.4), gunMetal, 0, -5, 3.2)]);
    P.muzzle = mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    P.muzzle.castShadow = false;
    P.armR.add(P.muzzle);
    this.scene.add(P.root);
  }

  // ------------------------------------------------------------------ construcción del mundo
  onNewWorld() {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.userData.ownMats) for (const m of o.userData.ownMats) m.dispose();
      });
      if (this.groundTex) this.groundTex.dispose();
    }
    for (const m of this.pickupMeshes.values()) this.scene.remove(m);
    this.pickupMeshes.clear();
    this.fx = new Particles();
    this.buildings = [];
    this.facadeMats = [];
    const G = this.worldGroup = new THREE.Group();
    this.scene.add(G);
    const w = this.g.world;

    // suelo
    this.groundTex = Tex.buildGround(w);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(w.w / 2, 0, w.h / 2);
    ground.receiveShadow = true;
    ground.userData.ownMats = [ground.material];
    G.add(ground);
    if (this.outerTex) this.outerTex.dispose();
    const outerTex = this.outerTex = Tex.toTex(Tex.asphalt());
    outerTex.repeat.set(60, 60);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ map: outerTex, color: 0x9a948a, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(w.w / 2, -0.6, w.h / 2);
    outer.receiveShadow = true;
    outer.userData.ownMats = [outer.material];
    G.add(outer);

    for (const o of w.obstacles) {
      if (o.kind === 'building') this.makeBuilding(o, true);
      else if (o.kind === 'car') this.makeCar(o);
      else if (o.kind === 'wall') this.makeWall(o);
      else if (o.kind === 'dumpster') this.makeDumpster(o);
      else if (o.kind === 'tent') this.makeTent(o);
      else if (o.kind === 'statue') this.makeStatue(o);
    }
    for (const o of w.border) this.makeBuilding(o, false);
    this.makeQuarantineWall();
    this.makeInstancedProps();
  }

  add(mesh, shadow = true, receive = true) {
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    this.worldGroup.add(mesh);
    return mesh;
  }

  makeBuilding(o, fadeable) {
    const F = CONFIG.FLOOR_H, H = o.height;
    const fac = this.facades[o.style][o.burnt ? 1 : 0];
    const wall = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.92 });
    const roof = new THREE.MeshStandardMaterial({ map: this.roofTex, roughness: 0.95 });
    const edge = new THREE.MeshStandardMaterial({ map: this.mat.darkConcrete.map, roughness: 0.95 });
    const mats = [wall, roof, edge];
    this.facadeMats.push(wall);
    const shopH = o.shop ? F : 0;
    const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
    const body = new THREE.Mesh(boxUV(o.w, H - shopH, o.h, 200, F * 2), [wall, wall, roof, roof, wall, wall]);
    body.position.set(cx, shopH + (H - shopH) / 2, cz);
    body.userData.ownMats = mats;
    this.add(body);
    if (o.shop) {
      const shop = new THREE.MeshStandardMaterial({ map: U.choice(this.shopTex), roughness: 0.85 });
      mats.push(shop);
      const sm = new THREE.Mesh(boxUV(o.w, F, o.h, 200, F), [shop, shop, edge, edge, shop, shop]);
      sm.position.set(cx, F / 2, cz);
      this.add(sm);
      // marquesina
      const aw = new THREE.Mesh(new THREE.BoxGeometry(o.w + 10, 2, o.h + 10), edge);
      aw.position.set(cx, F, cz);
      this.add(aw);
    }
    // cornisa/azotea
    const capM = new THREE.Mesh(boxUV(o.w + 6, 5, o.h + 6, 128, 5, 256), [edge, edge, roof, edge, edge, edge]);
    capM.position.set(cx, H + 2.5, cz);
    this.add(capM);
    if (fadeable) {
      const prop = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.7, metalness: 0.3 });
      mats.push(prop);
      for (const p of o.props) {
        let m;
        if (p.type === 'tank') { m = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 20, 14), prop); m.position.set(p.x, H + 15, p.y); }
        else if (p.type === 'ac') { m = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 14), prop); m.position.set(p.x, H + 11, p.y); }
        else if (p.type === 'shed') { m = new THREE.Mesh(new THREE.BoxGeometry(36, 24, 30), edge); m.position.set(p.x, H + 17, p.y); }
        else { m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 60, 6), prop); m.position.set(p.x, H + 35, p.y); }
        m.rotation.y = p.rot;
        this.add(m);
      }
      this.buildings.push({
        box: new THREE.Box3(new THREE.Vector3(o.x - 8, 0, o.y - 8), new THREE.Vector3(o.x + o.w + 8, H + 40, o.y + o.h + 8)),
        mats, fade: 1, cx, cz,
      });
    }
  }

  makeQuarantineWall() {
    const w = this.g.world, T = 24, H = 110;
    const mat = new THREE.MeshStandardMaterial({ map: this.facades[0][1].map, roughness: 0.95, color: 0x9a968e });
    const segs = [[w.w / 2, -T / 2, w.w + T * 2, T], [w.w / 2, w.h + T / 2, w.w + T * 2, T], [-T / 2, w.h / 2, T, w.h], [w.w + T / 2, w.h / 2, T, w.h]];
    for (const [x, z, sx, sz] of segs) {
      const m = new THREE.Mesh(boxUV(sx, H, sz, 200, 92), mat);
      m.position.set(x, H / 2, z);
      m.userData.ownMats = [mat];
      this.add(m);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(sx + 2, 4, sz + 2), this.mat.darkMetal);
      wire.position.set(x, H + 4, z);
      this.add(wire, false);
    }
  }

  makeCar(o) {
    const M = this.mat, burnt = o.burnt;
    const L = o.vertical ? o.h : o.w, W = o.vertical ? o.w : o.h;
    const g = new THREE.Group();
    g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
    g.rotation.y = (o.vertical ? 0 : Math.PI / 2) + o.yaw;
    const paintColor = { taxi: '#d8a81e', police: '#e8e8e8', military: '#4f5a34', bus: '#c9b25a' }[o.variant] || o.color;
    const body = burnt ? M.rust : this.paint(paintColor);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const glass = burnt ? M.darkGlass : M.glass;
    const wr = o.variant === 'bus' || o.variant === 'military' ? 7 : 5.5;
    if (o.variant === 'bus') {
      box(W, 44, L, [burnt ? M.rust : M.busWindows, burnt ? M.rust : M.busWindows, body, body, glass, glass], 0, wr + 24, 0);
    } else if (o.variant === 'military') {
      box(W, 24, L * 0.3, [body, body, body, body, glass, body], 0, wr + 14, L * 0.33);
      box(W, 30, L * 0.64, burnt ? M.rust : M.canvasOlive, 0, wr + 17, -L * 0.17);
      box(W * 0.9, 6, L * 0.95, body, 0, wr + 2, 0);
    } else if (o.variant === 'van') {
      box(W, 26, L * 0.78, body, 0, wr + 15, -L * 0.1);
      box(W, 14, L * 0.22, body, 0, wr + 8, L * 0.38);
      box(W * 0.9, 10, 2, glass, 0, wr + 22, L * 0.29);
    } else {
      box(W, 11, L, body, 0, wr + 6, 0);
      const cab = box(W * 0.86, 9, L * 0.48, [glass, glass, body, body, glass, glass], 0, wr + 15.5, -L * 0.05);
      if (burnt) cab.scale.y = 0.85;
      if (o.variant === 'taxi' && !burnt) box(8, 3, 4, M.white, 0, wr + 21.5, -L * 0.05);
      if (o.variant === 'police' && !burnt) {
        box(W * 0.9, 1, L * 0.3, M.darkMetal, 0, wr + 11.6, 0);
        box(7, 2.5, 4, M.red, -4, wr + 21, -L * 0.05);
        box(7, 2.5, 4, M.blue, 4, wr + 21, -L * 0.05);
      }
    }
    if (!burnt) {
      box(3, 2.5, 1, M.headlight, -W / 2 + 4, wr + 8, L / 2);
      box(3, 2.5, 1, M.headlight, W / 2 - 4, wr + 8, L / 2);
    }
    const wheel = new THREE.CylinderGeometry(wr, wr, 4, 12);
    wheel.rotateZ(Math.PI / 2);
    const zs = o.variant === 'bus' ? [L * 0.36, L * 0.18, -L * 0.36] : o.variant === 'military' ? [L * 0.33, -L * 0.2, -L * 0.36] : [L * 0.32, -L * 0.32];
    for (const z of zs) {
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(wheel, burnt ? M.darkMetal : M.tire);
        m.position.set(side * (W / 2 - 1.5), burnt ? wr * 0.6 : wr, z);
        if (burnt) m.scale.set(1, 0.7, 0.7);
        m.castShadow = true;
        g.add(m);
      }
    }
    if (burnt) g.position.y = -1.5;
    this.worldGroup.add(g);
  }

  makeWall(o) {
    const fac = this.facades[o.style][1];
    let mat = this.ruinMats && this.ruinMats[o.style];
    if (!mat) {
      this.ruinMats = this.ruinMats || [];
      mat = this.ruinMats[o.style] = new THREE.MeshStandardMaterial({ map: fac.map, roughness: 0.95 });
    }
    const m = new THREE.Mesh(boxUV(o.w, o.height, o.h, 200, CONFIG.FLOOR_H * 2, 64), mat);
    m.position.set(o.x + o.w / 2, o.height / 2, o.y + o.h / 2);
    this.add(m);
  }

  makeDumpster(o) {
    const g = new THREE.Group();
    g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
    g.rotation.y = o.rot;
    const mat = this.paint(o.color);
    const b = new THREE.Mesh(new THREE.BoxGeometry(50, 20, 26), mat);
    b.position.y = 12;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(51, 2, 27), this.mat.darkMetal);
    lid.position.set(0, 23, -2);
    lid.rotation.x = Math.random() < 0.5 ? -0.5 : 0;
    for (const m of [b, lid]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    this.worldGroup.add(g);
  }

  makeTent(o) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    geo.rotateZ(Math.PI / 2);
    geo.rotateX(-Math.PI / 2);
    const c = new THREE.Color(o.color).lerp(new THREE.Color(0xffffff), 0.25);
    const mat = new THREE.MeshStandardMaterial({ map: this.mat.burlap.map, color: c, roughness: 1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(o.w, o.height / 1.5, o.h / 1.732);
    m.position.set(o.x + o.w / 2, o.height / 3, o.y + o.h / 2);
    m.userData.ownMats = [mat];
    this.add(m);
  }

  makeStatue(o) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(44, 26, 44), this.mat.concrete);
    base.position.set(o.x, 13, o.y);
    this.add(base);
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(7, 24, 4, 10), this.mat.bronze);
    fig.position.set(o.x, 26 + 19, o.y);
    fig.rotation.z = 0.08;
    this.add(fig);
    const armM = new THREE.Mesh(new THREE.CapsuleGeometry(2.5, 16, 3, 8), this.mat.bronze);
    armM.position.set(o.x + 9, 26 + 34, o.y);
    armM.rotation.z = -0.9;
    this.add(armM);
  }

  makeInstancedProps() {
    const w = this.g.world, M = this.mat;
    const build = (geo, mat, items, fn, shadow = true, receive = true) => {
      if (!items.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        const c = fn(it, _mA, i);
        m.setMatrixAt(i, _mA);
        if (c && c.isColor) m.setColorAt(i, c);
      });
      m.castShadow = shadow;
      m.receiveShadow = receive;
      this.worldGroup.add(m);
      return m;
    };
    const obs = k => w.obstacles.filter(o => o.kind === k);
    const dec = k => w.decor.filter(d => d.type === k);

    // escombros: montículos + bloques + varillas
    const rubble = obs('rubble');
    const mound = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2);
    build(mound, M.rubble, rubble, o => { compose(_mA, o.x, 0, o.y, 0, o.seed * 6, 0, o.r * 1.1, o.height, o.r * 1.1); return _col.setHSL(0.08, 0.08, U.rand(0.45, 0.6)); });
    const chunks = [];
    for (const o of rubble) for (let i = 0; i < 9; i++) {
      const a = U.rand(0, TAU), d = U.rand(0, o.r);
      chunks.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, z: o.height * (1 - d / o.r) * 0.8, s: U.rand(4, 10) });
    }
    for (const d of dec('debris')) chunks.push({ x: d.x, y: d.y, z: 0, s: 2.5 * d.s });
    for (const d of dec('debris')) if (Math.random() < 0.5) chunks.push({ x: d.x + U.rand(-8, 8), y: d.y + U.rand(-8, 8), z: 0, s: 1.6 * d.s });
    build(new THREE.DodecahedronGeometry(1, 0), M.rubble, chunks, c => { compose(_mA, c.x, c.z + c.s * 0.4, c.y, U.rand(0, 3), U.rand(0, 3), U.rand(0, 3), c.s, c.s * U.rand(0.5, 1), c.s); return _col.setHSL(U.rand(0.05, 0.1), U.rand(0.03, 0.12), U.rand(0.35, 0.6)); });
    const rebar = [];
    for (const o of rubble) for (let i = 0; i < 3; i++) rebar.push({ x: o.x + U.rand(-o.r, o.r) * 0.5, y: o.y + U.rand(-o.r, o.r) * 0.5, h: o.height });
    build(new THREE.CylinderGeometry(0.7, 0.7, 30, 4), M.rust, rebar, b => compose(_mA, b.x, b.h * 0.6, b.y, U.rand(-0.8, 0.8), 0, U.rand(-0.8, 0.8)));

    // barreras de hormigón tipo New Jersey
    const jg = new THREE.BoxGeometry(52, 22, 16, 1, 2, 1);
    const jp = jg.attributes.position;
    for (let i = 0; i < jp.count; i++) {
      const y = jp.getY(i);
      if (y > 10) jp.setZ(i, jp.getZ(i) * 0.3);
      else if (y > -1) jp.setZ(i, jp.getZ(i) * 0.55);
      jp.setY(i, y + 11);
    }
    jg.computeVertexNormals();
    build(jg, M.concrete, obs('barrier'), o => { compose(_mA, o.x + o.w / 2, 0, o.y + o.h / 2, 0, (o.w < o.h ? Math.PI / 2 : 0) + o.rot, 0); return _col.setHSL(0.1, 0.05, U.rand(0.65, 0.85)); });

    // sacos terreros
    const bags = [];
    for (const o of obs('sandbag')) {
      const along = o.w > o.h, len = along ? o.w : o.h;
      for (let layer = 0; layer < 3; layer++) {
        for (let s = 7 + (layer % 2) * 6; s < len - 4; s += 13) {
          bags.push({ x: along ? o.x + s : o.x + o.w / 2, y: along ? o.y + o.h / 2 : o.y + s, z: 3.5 + layer * 6.2, rot: along ? 0 : Math.PI / 2 });
        }
      }
    }
    const bagGeo = new THREE.SphereGeometry(1, 10, 6);
    build(bagGeo, M.burlap, bags, b => { compose(_mA, b.x, b.z, b.y, 0, b.rot + U.rand(-0.1, 0.1), 0, 8, 3.4, 6); return _col.setHSL(0.11, 0.25, U.rand(0.5, 0.7)); });

    // bidones
    const barrels = obs('barrel');
    build(new THREE.CylinderGeometry(10, 10, 26, 14), M.rust, barrels, b => compose(_mA, b.x, 13, b.y, 0, U.rand(0, 3), 0));

    // árboles secos (geometría combinada)
    const parts = [{ geo: new THREE.CylinderGeometry(2.2, 4, 60, 7), matrix: compose(_mB, 0, 30, 0, 0, 0, 0).clone() }];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, h = U.rand(30, 55), tilt = U.rand(0.6, 1.1);
      const br = new THREE.CylinderGeometry(0.6, 1.6, U.rand(18, 30), 5);
      br.translate(0, 12, 0);
      parts.push({ geo: br, matrix: compose(_mB, 0, h, 0, tilt, a, 0, 1, 1, 1, 'YXZ').clone() });
    }
    build(mergeGeos(parts), M.bark, obs('tree'), t => compose(_mA, t.x, 0, t.y, U.rand(-0.08, 0.08), t.rot, U.rand(-0.08, 0.08), t.s));

    // farolas
    const lampParts = [
      { geo: new THREE.CylinderGeometry(1.4, 2, 74, 6), matrix: compose(_mB, 0, 37, 0, 0, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(24, 2, 2), matrix: compose(_mB, 11, 73, 0, 0, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(9, 3, 5), matrix: compose(_mB, 22, 71.5, 0, 0, 0, 0).clone() },
    ];
    const lamps = dec('lamp');
    build(mergeGeos(lampParts), M.darkMetal, lamps, l => compose(_mA, l.x, 0, l.y, l.broken, -l.rot, l.broken * 0.4, 1, 1, 1, 'YXZ'));
    build(new THREE.SphereGeometry(3, 8, 6), M.lampGlow, lamps.filter(l => l.lit), l => compose(_mA, l.x + Math.cos(l.rot) * 22, 69, l.y + Math.sin(l.rot) * 22, 0, 0, 0, 1, 0.6, 1), false, false);
    // focos militares
    const floods = dec('flood');
    build(mergeGeos([
      { geo: new THREE.CylinderGeometry(1.6, 2.4, 80, 6), matrix: compose(_mB, 0, 40, 0, 0, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(18, 12, 6), matrix: compose(_mB, 0, 82, 0, 0.5, 0, 0).clone() },
    ]), M.darkMetal, floods, f => compose(_mA, f.x, 0, f.y, 0, yawOf(f.rot), 0));

    // basura, papeles, neumáticos, bancos, cajas, conos
    build(new THREE.SphereGeometry(1, 8, 6), M.plastic, dec('trash'), d => { compose(_mA, d.x, 2 * d.s, d.y, 0, d.rot, 0, 4.2 * d.s, 3 * d.s, 3.6 * d.s); return Math.random() < 0.7 ? _col.set(0x151515) : _col.set(0x1f2a1a); });
    const paperGeo = new THREE.PlaneGeometry(7, 9);
    paperGeo.rotateX(-Math.PI / 2);
    build(paperGeo, M.paper, dec('paper'), d => { compose(_mA, d.x, 0.4, d.y, U.rand(-0.1, 0.1), d.rot, 0, d.s); return _col.setHSL(0.12, 0.1, U.rand(0.55, 0.85)); }, false);
    const tireGeo = new THREE.TorusGeometry(6, 2.6, 6, 12);
    tireGeo.rotateX(Math.PI / 2);
    build(tireGeo, M.tire, dec('tire'), d => compose(_mA, d.x, 2.6, d.y, 0, d.rot, 0, d.s));
    build(mergeGeos([
      { geo: new THREE.BoxGeometry(34, 2, 10), matrix: compose(_mB, 0, 9, 0, 0, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(34, 8, 2), matrix: compose(_mB, 0, 15, -5, -0.2, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(2, 9, 8), matrix: compose(_mB, -15, 4.5, 0, 0, 0, 0).clone() },
      { geo: new THREE.BoxGeometry(2, 9, 8), matrix: compose(_mB, 15, 4.5, 0, 0, 0, 0).clone() },
    ]), M.wood, dec('bench'), d => compose(_mA, d.x, 0, d.y, 0, d.rot, 0));
    build(new THREE.BoxGeometry(18, 16, 18), M.wood, dec('crate'), d => compose(_mA, d.x, 8 * d.s, d.y, 0, d.rot, 0, d.s));
    build(new THREE.ConeGeometry(4.5, 14, 10), M.orange, dec('cone'), d => Math.random() < 0.5 ? compose(_mA, d.x, 4.5, d.y, Math.PI / 2, d.rot, 0) : compose(_mA, d.x, 7, d.y, 0, d.rot, 0));
  }

  // ------------------------------------------------------------------ calidad gráfica
  setQuality(low) {
    this.low = low;
    this.r.shadowMap.enabled = !low;
    if (this.zrig) this.zrig.setShadows(!low);
    this.scene.traverse(o => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
    if (this.g.cw) this.resize(this.g.cw, this.g.ch, this.g.dpr);
  }

  // ------------------------------------------------------------------ tamaño y cámara
  resize(cw, ch, dpr) {
    this.r.setPixelRatio(this.low ? 1 : Math.min(dpr, 1.5));
    this.r.setSize(cw, ch, false);
    this.camera.aspect = cw / ch;
    this.camera.updateProjectionMatrix();
    const scale = this.r.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    for (const p of [this.pNormal, this.pGlow, this.ash]) p.material.uniforms.uScale.value = scale;
    // radio visible en el suelo con el zoom normal (para generar zombis fuera de pantalla)
    this.viewRadius = this.computeCorners(1).r;
    this.corners = this.computeCorners(this.zoom || 1).corners;
  }

  computeCorners(k) {
    const C = CONFIG.CAMERA;
    this.camera.position.set(0, C.height * k, C.back * k);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    const plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    let r = 0;
    const corners = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      if (this.raycaster.ray.intersectPlane(plane0, hit)) {
        r = Math.max(r, Math.hypot(hit.x, hit.z));
        corners.push({ x: hit.x, y: hit.z });
      }
    }
    if (this.g.cam) this.updateCamera();
    return { r: r || 1200, corners };
  }

  setZoom(k) {
    this.zoom = k;
    this.corners = this.computeCorners(k).corners;
  }

  updateCamera() {
    const c = this.g.cam, C = CONFIG.CAMERA, k = this.zoom || 1;
    this.camera.position.set(c.x + c.sx, C.height * k, c.y + C.back * k + c.sy);
    this.camera.lookAt(c.x + c.sx, 0, c.y + c.sy);
    this.camera.updateMatrixWorld();
  }

  screenToWorld(sx, sy) {
    const g = this.g;
    this.raycaster.setFromCamera(new THREE.Vector2((sx / g.cw) * 2 - 1, -(sy / g.ch) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return { x: g.cam.x, y: g.cam.y };
    return { x: hit.x, y: hit.z };
  }

  project(x, y, h = 0) {
    _v.set(x, h, y).project(this.camera);
    return { x: (_v.x + 1) / 2 * this.g.cw, y: (1 - _v.y) / 2 * this.g.ch, behind: _v.z > 1 };
  }

  // ------------------------------------------------------------------ fotograma
  render() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.g.state === 'bestiary') { this.r.toneMappingExposure = 1.0; this.renderStudio(dt); return; }
    this.updateCamera();
    this.updateLighting(dt);
    this.updateFade(dt);
    this.updatePlayer();
    this.updateZombies();
    this.updateProjectiles();
    this.updatePickups();
    this.updateDecals();
    this.updateAmbient(dt);
    this.updateParticles();
    this.updateLightPool();
    this.r.render(this.scene, this.camera);
  }

  updateLighting() {
    const g = this.g;
    const n = g.state === 'menu' ? 0.3 : g.nightness;
    const ph = g.state === 'menu' ? 0.49 : g.dayPhase;
    const dusk = Math.max(0, 1 - Math.abs(ph - 0.5) / 0.07) + Math.max(0, 1 - Math.abs(ph - 0.95) / 0.05) * 0.6;
    this.n = n;
    // cielo / niebla: polvo de día, naranja al atardecer, azul muy oscuro de noche
    _col.set(0xa39a8c).lerp(_col2.set(0x9a6440), Math.min(1, dusk) * 0.7).lerp(_col2.set(0x05070c), n);
    this.scene.fog.color.copy(_col);
    this.scene.background = this.scene.fog.color;
    this.scene.fog.near = U.lerp(1300, 700, n);
    this.scene.fog.far = U.lerp(4200, 2300, n);
    this.hemi.intensity = U.lerp(1.9, 0.16, n);
    this.hemi.color.set(0xc9c2b5).lerp(_col2.set(0x3a4a72), n);
    this.hemi.groundColor.set(0x4a4036).lerp(_col2.set(0x0a0a10), n);
    const c = g.cam;
    const sunDir = n < 0.5 ? [-0.55, 1, 0.35] : [0.45, 1, -0.4];
    this.sun.position.set(c.x + sunDir[0] * 1400, 1400 * sunDir[1], c.y + sunDir[2] * 1400);
    this.sun.target.position.set(c.x, 0, c.y);
    this.sun.intensity = n < 0.5 ? U.lerp(3.4, 0.7, n * 2) : U.lerp(0.25, 0.32, (n - 0.5) * 2);
    this.sun.color.set(n < 0.5 ? 0xffe0b8 : 0x8fa4d8).lerp(_col2.set(0xff9a5a), Math.min(1, dusk) * 0.6);
    this.r.toneMappingExposure = U.lerp(1.2, 1.3, n);
    for (const m of this.facadeMats) m.emissiveIntensity = n * 0.8;
  }

  // los edificios que tapan al jugador se vuelven transparentes
  updateFade(dt) {
    const p = this.g.player, cam = this.camera.position;
    const ray = new THREE.Ray();
    const targets = [[p.x, 22, p.y], [p.x - 26, 10, p.y], [p.x + 26, 10, p.y]];
    for (const b of this.buildings) {
      let target = 1;
      if (this.g.state !== 'menu' && Math.abs(b.cx - p.x) < 500 && b.cz - p.y > -300 && b.cz - p.y < 900) {
        for (const t of targets) {
          _v.set(t[0], t[1], t[2]);
          ray.origin.copy(_v);
          ray.direction.copy(cam).sub(_v).normalize();
          if (ray.intersectsBox(b.box)) { target = 0.2; break; }
        }
      }
      if (Math.abs(b.fade - target) > 0.001) {
        b.fade += (target - b.fade) * Math.min(1, dt * 8);
        const tr = b.fade < 0.98;
        for (const m of b.mats) {
          m.opacity = b.fade;
          if (m.transparent !== tr) {
            m.transparent = tr;
            m.depthWrite = !tr;
            m.needsUpdate = true;
          }
        }
      }
    }
  }

  updatePlayer() {
    const g = this.g, p = g.player, P = this.P;
    const visible = g.state !== 'menu' && (p.alive || g.deathT > 0);
    P.root.visible = visible;
    this.laser.visible = false;
    this.arc.material.opacity = 0;
    if (!visible) { this.flash.intensity = 0; this.halo.intensity = 0; return; }
    P.root.position.set(p.x, 0, p.y);
    P.root.rotation.y = yawOf(p.angle);
    const t = p.walkCycle;
    const sw = p.moving ? Math.sin(t) * (p.sprinting ? 0.85 : 0.6) : 0;
    P.legL.rotation.x = sw;
    P.legR.rotation.x = -sw;
    P.body.position.y = -13 + (p.moving ? Math.abs(Math.cos(t)) * 1.2 : 0);
    P.torso.rotation.x = p.sprinting ? 0.25 : 0.06;
    for (const k in P.weapons) P.weapons[k].visible = k === p.current;
    const w = p.weapon;
    if (w.melee) {
      let sweep = 0.5;
      if (p.swingT > 0) sweep = U.lerp(w.arc / 2, -w.arc / 2, 1 - p.swingT / 0.16) * p.swingDir;
      P.armR.rotation.set(p.swingT > 0 ? -1.45 : -0.5, p.swingT > 0 ? sweep : 0.3, 0, 'YXZ');
      P.armL.rotation.set(-sw * 0.6, 0, 0.15, 'XYZ');
      P.torso.rotation.y = p.swingT > 0 ? sweep * 0.4 : 0;
    } else {
      const kick = p.muzzleT > 0 ? 0.12 : 0;
      const two = p.current !== 'pistol';
      P.armR.rotation.set(-Math.PI / 2 + kick, two ? 0.05 : 0.15, 0, 'YXZ');
      P.armL.rotation.set(-Math.PI / 2 + kick + (two ? 0.15 : 0), two ? 0.55 : -0.25, 0, 'YXZ');
      P.torso.rotation.y = 0;
    }
    P.muzzle.visible = p.muzzleT > 0 && !w.melee;
    P.muzzle.position.set(0, { pistol: -21, shotgun: -31, rifle: -35 }[p.current] || -20, 0.8);
    P.muzzle.scale.setScalar(U.rand(0.8, 1.4));
    // rodar / morir
    if (p.dodgeT > 0) P.roll.rotation.x = (1 - p.dodgeT / p.stats.dodgeTime) * TAU;
    else if (!p.alive) P.roll.rotation.x = -Math.min(Math.PI / 2, (1.6 - g.deathT) * 4);
    else P.roll.rotation.x = 0;
    P.roll.position.y = !p.alive ? 4 : 13;
    const hurt = p.hurtT > 0 ? p.hurtT * 3 : 0;
    for (const m of this.playerMats) { m.emissive.setRGB(hurt * 0.8, 0, 0); }
    // linterna y halo
    const n = this.n;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    this.flash.position.set(p.x + ca * 8, 26, p.y + sa * 8);
    this.flash.target.position.set(p.x + ca * 300, 0, p.y + sa * 300);
    this.flash.intensity = p.alive ? n * 10 : 0;
    this.halo.position.set(p.x, 60, p.y);
    this.halo.intensity = n * 1.6;
    // láser de mira y arco del machete
    if (p.alive && !w.melee) {
      this.laser.visible = true;
      this.laser.position.set(p.x + ca * 28, 17, p.y + sa * 28);
      this.laser.rotation.y = -p.angle;
    }
    if (p.swingT > 0) {
      this.arc.position.set(p.x, 14, p.y);
      this.arc.rotation.y = -p.swingAngle;
      this.arc.material.opacity = 0.35 * (p.swingT / 0.16);
    }
  }

  updateZombies() {
    const g = this.g, c = g.cam, R = this.viewRadius + 200, rig = this.zrig, p = g.player;
    rig.begin();
    rig.eyeGlow = 0.45 + (this.n || 0) * 1.6;
    for (const z of g.zombies) {
      if (Math.abs(z.x - c.x) > R || Math.abs(z.y - c.y) > R) continue;
      const fuseK = z.fuse >= 0 ? 1 - z.fuse / z.T.fuse : 0;
      rig.draw({
        x: z.x, y: z.y, angle: z.angle, type: z.type, look: z.look, shirt: z.shirt, pants: z.pants, skin: z.skinCol,
        walk: z.walk, wob: z.wobble, t: this.time, lunge: z.lunge > 0 ? 1 : 0, flash: z.hitFlash > 0,
        blink: z.fuse >= 0 && Math.floor(z.fuse * 16) % 2 === 0, swell: 1 + fuseK * 0.35,
        y0: z.spawnT > 0 ? -34 * z.T.model * (z.spawnT / 0.4) : 0, recoil: Math.max(0, z.recoil || 0) * 4,
        near: p.alive && Math.abs(z.x - p.x) + Math.abs(z.y - p.y) < 90, spit: z.type === 'spitter' && z.lunge > 0,
      });
    }
    for (const d of g.decals) {
      if (d.kind !== 'corpse' || Math.abs(d.x - c.x) > R || Math.abs(d.y - c.y) > R) continue;
      rig.draw({
        x: d.x, y: d.y, angle: d.angle, type: d.type, look: d.look, shirt: d.shirt, pants: d.pants, skin: d.skin,
        walk: 0, wob: 0, t: this.time, lunge: 0, dead: true, fall: (25 - d.life) / 0.7, fallDir: d.fallDir,
        sink: d.life < 3 ? (3 - d.life) * 6 : 0,
      });
    }
    rig.end();
  }

  // ------------------------------------------------------------------ bestiario (vista de cerca)
  buildStudio() {
    const s = this.studio = new THREE.Scene();
    s.background = new THREE.Color(0x0b0c0a);
    s.fog = new THREE.Fog(0x0b0c0a, 140, 380);
    const gt = Tex.toTex(Tex.asphalt());
    gt.repeat.set(5, 5);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: this.splats.blood, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
    bl.rotation.x = -Math.PI / 2;
    bl.position.set(8, 0.2, -6);
    s.add(bl);
    s.add(new THREE.HemisphereLight(0x8a90a0, 0x201810, 0.7));
    const key = new THREE.SpotLight(0xffdcb8, 7, 700, 0.45, 0.7, 0);
    key.position.set(-80, 150, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.target.position.set(0, 15, 0);
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x7fa0ff, 2.6);
    rim.position.set(70, 90, -130);
    s.add(rim);
    this.studioFire = new THREE.PointLight(0xff7a2a, 3, 260, 0);
    this.studioFire.position.set(80, 24, -50);
    s.add(this.studioFire);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 26, 14), this.mat.rust);
    barrel.position.set(80, 13, -60);
    barrel.castShadow = true;
    s.add(barrel);
    this.studioFx = new Particles();
    this.studioRig = new ZombieRig(s, 2, true);
    this.studioCam = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    this.studioT = 0;
    // partículas del bestiario (fuego del bidón)
    this.studioPts = [false, true].map(add => {
      const p = new THREE.Points(this.pGlow.geometry.clone(), this.pGlow.material.clone());
      p.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      p.frustumCulled = false;
      s.add(p);
      return p;
    });
  }

  renderStudio(dt) {
    if (!this.studio) this.buildStudio();
    const b = this.g.bestiary, T = ZOMBIE_TYPES[b.type], sc = T.model;
    this.studioT += dt;
    const t = this.studioT;
    const cam = this.studioCam;
    cam.aspect = this.g.cw / this.g.ch;
    cam.updateProjectionMatrix();
    cam.position.set(0, 20 * sc + 8, 96 * sc + 14);
    cam.lookAt(0, 9 * sc, 0);
    const attack = t % 4.5 > 3.6;
    const rig = this.studioRig;
    rig.begin();
    rig.eyeGlow = 1.3;
    rig.draw({
      x: 0, y: 0, angle: Math.PI / 2 + t * 0.45, type: b.type, look: b.look, shirt: b.shirt, pants: b.pants, skin: b.skin,
      walk: t * (b.type === 'runner' ? 10 : 6), wob: t * 1.3, t, lunge: attack ? 1 : 0, near: true, spit: attack && b.type === 'spitter',
      swell: b.type === 'bloater' ? 1 + Math.max(0, Math.sin(t * 2)) * 0.06 : 1,
    });
    rig.end();
    this.studioFire.intensity = 3 + Math.sin(t * 17) * 0.5 + Math.sin(t * 29) * 0.4;
    const fx = this.studioFx;
    if (Math.random() < 0.9) fx.add(80 + U.rand(-6, 6), -60 + U.rand(-6, 6), U.rand(-5, 5), U.rand(-5, 5), U.rand(0.4, 0.7), U.rand(8, 13), U.choice(['#ffd36a', '#ff9a2a', '#ff6a1a']), 1, true, 26, U.rand(35, 60), 0, 0);
    if (Math.random() < 0.15) fx.add(80, -60, U.rand(5, 15), 0, 3, 18, 'rgba(40,38,36,0.5)', 0.2, false, 46, 40, 0, 2.4);
    fx.update(dt);
    for (const [k, pts] of this.studioPts.entries()) {
      const pos = pts.geometry.attributes.position, col = pts.geometry.attributes.rgba, size = pts.geometry.attributes.size;
      let n = 0;
      for (const p of fx.list) {
        if (p.glow !== (k === 1)) continue;
        const a = p.life / p.max, c = parseColor(p.color);
        pos.setXYZ(n, p.x, p.z, p.y);
        col.setXYZW(n, c.r, c.g, c.b, c.a * Math.min(1, a * 2));
        size.setX(n++, p.size * (p.grow ? 1 + (1 - a) * p.grow : 0.45 + 0.55 * a));
      }
      pts.geometry.setDrawRange(0, n);
      pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
    }
    this.r.render(this.studio, cam);
  }

  updateProjectiles() {
    const g = this.g;
    let nb = 0, na = 0;
    for (const pr of g.projectiles) {
      if (pr.kind === 'acid') {
        if (na >= 100) continue;
        compose(_mA, pr.x, 16, pr.y, 0, 0, 0, 1);
        this.acid.setMatrixAt(na++, _mA);
      } else {
        if (nb >= 500) continue;
        const sp = Math.hypot(pr.vx, pr.vy) || 1, len = Math.min(34, sp * 0.03);
        const a = Math.atan2(pr.vy, pr.vx);
        compose(_mA, pr.x - (pr.vx / sp) * len / 2, 17, pr.y - (pr.vy / sp) * len / 2, 0, yawOf(a), 0, pr.crit ? 2.2 : 1.5, pr.crit ? 2.2 : 1.5, len);
        this.bullets.setMatrixAt(nb, _mA);
        this.bullets.setColorAt(nb++, pr.crit ? _col.setRGB(1, 0.5, 0.15) : _col.setRGB(1, 0.85, 0.45));
      }
    }
    this.bullets.count = nb;
    this.acid.count = na;
    this.bullets.instanceMatrix.needsUpdate = this.acid.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;
  }

  updatePickups() {
    const g = this.g, live = new Set();
    let nx = 0;
    for (const p of g.pickups) {
      const blink = p.life < 6 && Math.floor(p.life * 6) % 2 === 0;
      if (p.type === 'xp') {
        if (nx >= 1500) continue;
        compose(_mA, p.x, blink ? -50 : 9 + Math.sin(p.t * 4) * 2, p.y, 0, p.t * 2, 0, 0.7 + Math.min(0.8, p.value * 0.1));
        this.xp.setMatrixAt(nx++, _mA);
        continue;
      }
      live.add(p);
      let m = this.pickupMeshes.get(p);
      if (!m) {
        this.pickupTemplates = this.pickupTemplates || {};
        if (!this.pickupTemplates[p.type]) this.pickupTemplates[p.type] = this.makePickupMesh(p.type);
        m = this.pickupTemplates[p.type].clone();
        this.pickupMeshes.set(p, m);
        this.scene.add(m);
      }
      m.position.set(p.x, p.type === 'crate' ? 0 : Math.sin(p.t * 4) * 1.5 + 2, p.y);
      if (p.type !== 'crate') m.rotation.y = p.t;
      m.visible = !blink;
      if (p.type === 'crate' && Math.random() < 0.5) {
        this.fx.add(p.x + 14, p.y + 10, U.rand(-6, 6) + 10, U.rand(-6, 6), 2.5, 14, 'rgba(230,60,40,0.35)', 0.3, false, 20, 50, 0, 2.5);
      }
    }
    for (const [p, m] of this.pickupMeshes) {
      if (!live.has(p)) { this.scene.remove(m); this.pickupMeshes.delete(p); }
    }
    this.xp.count = nx;
    this.xp.instanceMatrix.needsUpdate = true;
  }

  makePickupMesh(type) {
    const g = new THREE.Group(), M = this.mat;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (type === 'ammo') {
      add(new THREE.BoxGeometry(18, 9, 11), M.olive, 0, 4.5, 0);
      for (let i = -1; i <= 1; i++) add(new THREE.CylinderGeometry(1.2, 1.2, 6, 6), M.brass, i * 4, 11, 0);
    } else if (type === 'med') {
      add(new THREE.BoxGeometry(16, 10, 12), [M.white, M.white, M.medkit, M.white, M.medkit, M.medkit], 0, 5, 0);
    } else {
      add(new THREE.BoxGeometry(36, 30, 36), M.wood, 0, 15, 0);
      add(new THREE.CylinderGeometry(1.5, 1.5, 6, 6), M.red, 14, 33, 10);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 16, 900, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 450;
      g.add(beam);
    }
    return g;
  }

  updateDecals() {
    const g = this.g, counts = { blood: 0, acid: 0, scorch: 0 }, c = g.cam, R = this.viewRadius + 100;
    for (const d of g.decals) {
      if (d.kind === 'corpse') continue;
      if (Math.abs(d.x - c.x) > R || Math.abs(d.y - c.y) > R) continue;
      const mesh = this.decalMesh[d.kind];
      if (!mesh || counts[d.kind] >= CONFIG.MAX_DECALS) continue;
      if (d.rot === undefined) d.rot = Math.random() * TAU;
      const s = d.r * 2.6 * Math.min(1, d.life / 4);
      compose(_mA, d.x, 0.25 + counts[d.kind] * 0.0004, d.y, 0, d.rot, 0, s, 1, s);
      mesh.setMatrixAt(counts[d.kind]++, _mA);
    }
    for (const k in this.decalMesh) {
      this.decalMesh[k].count = counts[k];
      this.decalMesh[k].instanceMatrix.needsUpdate = true;
    }
  }

  // fuego, humo, brasas y ceniza cayendo
  updateAmbient(dt) {
    const g = this.g, c = g.cam, fx = this.fx;
    for (const f of g.world.fires) {
      if (Math.abs(f.x - c.x) > 1300 || Math.abs(f.y - c.y) > 1300) continue;
      const s = f.s;
      let k = dt * 38 * s;
      while (k > 0) {
        if (Math.random() < k) {
          fx.add(f.x + U.rand(-9, 9) * s, f.y + U.rand(-9, 9) * s, U.rand(-8, 8), U.rand(-8, 8), U.rand(0.35, 0.7), U.rand(9, 16) * s,
            U.choice(['#ffd36a', '#ff9a2a', '#ff6a1a', '#ffb347']), 1, true, f.z + U.rand(0, 5), U.rand(35, 70) * s, 0, 0);
        }
        k -= 1;
      }
      if (Math.random() < dt * 9 * s) {
        fx.add(f.x + U.rand(-6, 6), f.y + U.rand(-6, 6), U.rand(8, 22), U.rand(-6, 6), U.rand(2.5, 4), U.rand(16, 24) * s,
          U.choice(['rgba(35,33,31,0.55)', 'rgba(55,52,48,0.45)', 'rgba(25,24,23,0.6)']), 0.2, false, f.z + 22 * s, U.rand(40, 60), 0, 2.4);
      }
      if (Math.random() < dt * 5 * s) {
        fx.add(f.x, f.y, U.rand(-30, 30), U.rand(-30, 30), U.rand(1, 2), 2.5, '#ffb040', 0.5, true, f.z + 10, U.rand(60, 120), -10, 0);
      }
    }
    fx.update(dt);
    // ceniza
    const pos = this.ash.geometry.attributes.position, col = this.ash.geometry.attributes.rgba, size = this.ash.geometry.attributes.size;
    const n = this.n || 0;
    for (let i = 0; i < this.ashData.length; i++) {
      const a = this.ashData[i];
      a.z -= a.sp * dt;
      a.ph += dt;
      a.x += (Math.sin(a.ph) * 6 + 10) * dt;
      if (a.z < 0) { a.z = U.rand(200, 260); a.x = U.rand(-1000, 1000); a.y = U.rand(-700, 900); }
      let wx = c.x + a.x, wy = c.y + a.y;
      pos.setXYZ(i, wx, a.z, wy);
      const v = U.lerp(0.75, 0.35, n);
      col.setXYZW(i, v, v * 0.97, v * 0.93, 0.55);
      size.setX(i, a.size);
      // reciclar si se alejan demasiado de la cámara
      if (a.x > 1000) a.x -= 2000;
    }
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
  }

  updateParticles() {
    const fill = (pts, glow) => {
      const pos = pts.geometry.attributes.position, col = pts.geometry.attributes.rgba, size = pts.geometry.attributes.size;
      const max = pos.count;
      let n = 0;
      for (const list of [this.g.particles.list, this.fx.list]) {
        for (let i = 0; i < list.length && n < max; i++) {
          const p = list[i];
          if (p.glow !== glow) continue;
          const a = p.life / p.max, c = parseColor(p.color);
          pos.setXYZ(n, p.x, p.z, p.y);
          col.setXYZW(n, c.r, c.g, c.b, c.a * Math.min(1, a * (glow ? 1.6 : 2.2)));
          size.setX(n, p.size * (p.grow ? 1 + (1 - a) * p.grow : 0.45 + 0.55 * a));
          n++;
        }
      }
      pts.geometry.setDrawRange(0, n);
      pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
    };
    fill(this.pNormal, false);
    fill(this.pGlow, true);
  }

  // asigna las luces puntuales a las fuentes más cercanas (fuegos, disparos, explosiones...)
  updateLightPool() {
    const g = this.g, c = g.cam, cand = [];
    const consider = (x, y, z, r, color, inten) => {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d > 1300) return;
      cand.push({ x, y, z, r, color, inten, score: inten / (1 + d / 350) });
    };
    for (const f of g.world.fires) {
      const fl = 0.75 + Math.sin(this.time * 17 + f.x) * 0.12 + Math.sin(this.time * 31 + f.y) * 0.1;
      consider(f.x, f.y, f.z + 25, 230 + 120 * f.s, 0xff7a2a, (1.6 + f.s) * fl);
    }
    for (const l of g.world.lightSources) {
      let k = 1;
      if (l.flicker) {
        const t = this.time * 3 + l.x;
        k = Math.sin(t * 7.3) > 0.93 || Math.sin(t * 1.7 + l.y) > 0.97 ? 0.1 : 1;
      }
      consider(l.x, l.y, l.z, l.r, l.color, l.intensity * k * (0.3 + this.n * 0.9));
    }
    for (const l of g.lights) consider(l.x, l.y, 40, l.r * 1.4, 0xffc070, 7 * (l.t / l.max));
    for (const p of g.pickups) if (p.type === 'crate') consider(p.x + 14, p.y + 10, 40, 200, 0xff3020, 2.5 + Math.sin(this.time * 20) * 0.5);
    cand.sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], s = cand[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.set(s.x, s.z, s.y);
      l.distance = s.r;
      l.color.setHex(s.color);
      l.intensity = s.inten;
    }
  }
}
