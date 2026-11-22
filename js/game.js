'use strict';

class Game {
  constructor(glCanvas, hudCanvas) {
    this.canvas = hudCanvas;
    this.ctx = hudCanvas.getContext('2d');
    this.cam = { x: CONFIG.WORLD_W / 2, y: CONFIG.WORLD_H / 2, sx: 0, sy: 0, shake: 0 };
    this.renderer = new Renderer(this, glCanvas);
    this.hud = new HUD(this);
    this.best = this.loadBest();
    try { this.renderer.low = localStorage.getItem('zonamuerta_quality') === 'low'; } catch (e) { /* sin almacenamiento */ }
    if (this.renderer.low) this.renderer.setQuality(true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.newRun();
    this.state = 'menu';
    this.ui = new UI(this);
    this.ui.show('menu');
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.canvas.width = Math.floor(this.cw * this.dpr);
    this.canvas.height = Math.floor(this.ch * this.dpr);
    this.canvas.style.width = this.cw + 'px';
    this.canvas.style.height = this.ch + 'px';
    this.renderer.resize(this.cw, this.ch, this.dpr);
    this.viewRadius = this.renderer.viewRadius;
  }

  newRun() {
    this.world = new World();
    this.player = new Player(this.world.w / 2, this.world.h / 2);
    this.zombies = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = new Particles();
    this.decals = [];
    this.lights = [];
    this.messages = [];
    this.time = 0;
    this.kills = 0;
    this.damageFlash = 0;
    this.deathT = 0;
    this.director = new Director(this);
    this.zombieHash = new SpatialHash(64);
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.shake = 0;
    this.world.computeFlow(this.player.x, this.player.y);
    this.renderer.onNewWorld();
    this.hud.buildMinimap();
  }

  startGame() {
    Sound.init();
    this.newRun();
    this.state = 'playing';
    this.ui.hideAll();
    this.message('Sobrevive todo lo que puedas', 4, '#fff');
  }

  // ------------------------------------------------------------ tiempo del día
  get dayPhase() {
    return ((this.time / CONFIG.DAY_CYCLE) + CONFIG.START_PHASE) % 1;
  }
  get dayNumber() {
    return 1 + Math.floor((this.time / CONFIG.DAY_CYCLE) + CONFIG.START_PHASE);
  }
  // 0 = día pleno, 1 = noche cerrada
  get nightness() {
    const ph = this.dayPhase;
    if (ph < 0.45) return 0;
    if (ph < 0.55) return U.smoothstep(0.45, 0.55, ph);
    if (ph < 0.9) return 1;
    return 1 - U.smoothstep(0.9, 1, ph);
  }
  get clockString() {
    const mins = Math.floor((this.dayPhase * 24 * 60 + 7 * 60) % (24 * 60));
    const h = Math.floor(mins / 60), m = Math.floor(mins % 60 / 10) * 10;
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
  }

  // ------------------------------------------------------------ utilidades
  mouseWorld() {
    return this.renderer.screenToWorld(Input.mouse.x, Input.mouse.y);
  }
  // h = altura sobre el suelo
  worldToScreen(x, y, h = 0) {
    return this.renderer.project(x, y, h);
  }
  isOnScreen(x, y, margin = 0) {
    const s = this.worldToScreen(x, y, 0), t = this.worldToScreen(x, y, 40);
    const on = q => q.x > -margin && q.y > -margin && q.x < this.cw + margin && q.y < this.ch + margin;
    return on(s) || on(t);
  }
  addShake(v) {
    this.cam.shake = Math.min(18, this.cam.shake + v);
  }
  addLight(x, y, r, t) {
    this.lights.push({ x, y, r, t, max: t });
  }
  message(text, dur = 3, color = '#fff', big = false) {
    this.messages = this.messages.filter(m => m.text !== text);
    this.messages.push({ text, t: dur, max: dur, color, big });
    if (this.messages.length > 4) this.messages.shift();
  }
  addDecal(kind, x, y, r) {
    const blobs = [];
    const n = kind === 'scorch' ? 1 : U.randInt(2, 5);
    for (let i = 0; i < n; i++) blobs.push([U.rand(-r, r) * 0.7, U.rand(-r, r) * 0.7, r * U.rand(0.4, 1)]);
    if (kind === 'scorch') blobs[0] = [0, 0, r];
    this.decals.push({ kind, x, y, r, blobs, rot: U.rand(0, TAU), life: kind === 'blood' ? 60 : 30 });
    if (this.decals.length > CONFIG.MAX_DECALS) this.decals.shift();
  }

  // ------------------------------------------------------------ eventos
  onZombieKilled(z) {
    this.kills++;
    const p = this.player;
    Sound.play('kill');
    this.particles.blood(z.x, z.y, 10, 0, 0);
    this.decals.push({ kind: 'corpse', x: z.x, y: z.y, r: z.radius, angle: z.angle + Math.PI, type: z.type, shirt: z.shirt, pants: z.pants, skin: z.T.skin, life: 25 });
    this.addDecal('blood', z.x, z.y, z.radius * 0.9);
    const corpses = this.decals.filter(d => d.kind === 'corpse');
    if (corpses.length > CONFIG.MAX_CORPSES) corpses[0].life = Math.min(corpses[0].life, 3);
    if (this.decals.length > CONFIG.MAX_DECALS) this.decals.shift();
    // experiencia en orbes
    let xp = z.T.xp;
    while (xp > 0) {
      const v = Math.min(xp, 5);
      this.pickups.push(new Pickup('xp', z.x + U.rand(-6, 6), z.y + U.rand(-6, 6), v));
      xp -= v;
    }
    const r = Math.random(), lowAmmo = this.playerAmmoLow();
    if (r < (lowAmmo ? 0.1 : 0.05)) this.pickups.push(new Pickup('ammo', z.x, z.y));
    else if (r < (lowAmmo ? 0.13 : 0.08) || (z.type === 'brute' && r < 0.5)) this.pickups.push(new Pickup('med', z.x, z.y));
    if (p.stats.lifesteal > 0 && p.alive) p.heal(p.stats.lifesteal);
  }

  playerAmmoLow() {
    const p = this.player;
    return WEAPON_ORDER.every(id => WEAPONS[id].melee || !p.weapons[id].owned || p.weapons[id].reserve < WEAPONS[id].mag);
  }

  collectPickup(pk) {
    const p = this.player;
    switch (pk.type) {
      case 'xp':
        p.addXp(pk.value);
        Sound.play('xp');
        break;
      case 'ammo':
        p.refillAmmo(0.6);
        Sound.play('pickup');
        this.particles.text(p.x, p.y - 24, '+Munición', '#e8d27a');
        break;
      case 'med':
        p.heal(30);
        Sound.play('pickup');
        this.particles.text(p.x, p.y - 24, '+30 Vida', '#6bff8f');
        break;
      case 'crate': {
        Sound.play('levelup');
        const missing = WEAPON_ORDER.filter(id => !p.weapons[id].owned);
        if (missing.length && Math.random() < 0.75) {
          const id = missing[0];
          p.giveWeapon(id);
          p.switchWeapon(id);
          this.message(`¡Nueva arma: ${WEAPONS[id].name}! [${WEAPON_ORDER.indexOf(id) + 1}]`, 4, '#ffd34d');
        } else {
          p.refillAmmo(2.5);
          this.message('Suministros: munición y botiquín', 3, '#ffd34d');
        }
        p.heal(40);
        p.stamina = p.stats.maxStamina;
        p.exhausted = false;
        this.particles.burst(pk.x, pk.y, 30, '#ffd34d', 200, 0.8, 4, true);
        break;
      }
    }
  }

  explode(x, y, radius, dmgPlayer, dmgZombies) {
    Sound.play('explosion');
    this.addShake(14);
    this.addLight(x, y, radius * 3, 0.35);
    this.particles.burst(x, y, 50, '#ffb347', radius * 2.2, 0.5, 18, true, 12, 140);
    this.particles.burst(x, y, 30, '#ff6a1a', radius * 1.2, 0.35, 26, true, 18, 60);
    this.particles.burst(x, y, 40, '#6a7a2a', radius * 2, 1.0, 4, false, 16, 260);
    for (let i = 0; i < 18; i++) {
      this.particles.add(x + U.rand(-30, 30), y + U.rand(-30, 30), U.rand(-30, 30), U.rand(-30, 30), U.rand(1.5, 2.5), U.rand(24, 36),
        'rgba(50,48,44,0.6)', 0.8, false, U.rand(10, 40), U.rand(30, 70), 0, 2);
    }
    this.addDecal('scorch', x, y, radius * 0.6);
    this.addDecal('acid', x, y, radius * 0.4);
    const p = this.player;
    const dp = U.dist(x, y, p.x, p.y);
    if (dp < radius + p.radius) p.takeDamage(dmgPlayer * (1 - 0.5 * dp / (radius + p.radius)), this);
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = U.dist(x, y, z.x, z.y);
      if (d < radius + z.radius) {
        const k = 1 - 0.5 * d / (radius + z.radius);
        z.takeDamage(dmgZombies * k, (z.x - x) / (d || 1), (z.y - y) / (d || 1), 400, this, false);
      }
    }
  }

  onPlayerDeath() {
    this.deathT = 1.6;
    Sound.play('death');
    this.particles.blood(this.player.x, this.player.y, 30, 0, 0);
    this.addDecal('blood', this.player.x, this.player.y, 20);
    this.addShake(12);
  }

  finishRun() {
    this.state = 'gameover';
    this.messages = [];
    const run = { time: this.time, level: this.player.level, kills: this.kills, day: this.dayNumber };
    const record = !this.best || run.time > this.best.time;
    if (record) {
      this.best = run;
      try { localStorage.setItem('zonamuerta_best', JSON.stringify(run)); } catch (e) { /* sin almacenamiento */ }
    }
    this.ui.showGameOver(run, record);
  }

  loadBest() {
    try { return JSON.parse(localStorage.getItem('zonamuerta_best')) || null; } catch (e) { return null; }
  }

  openLevelUp() {
    this.state = 'levelup';
    Sound.play('levelup');
    this.player.stamina = this.player.stats.maxStamina;
    this.player.exhausted = false;
    this.ui.showLevelUp(this.rollUpgrades());
  }

  rollUpgrades() {
    const p = this.player;
    const pool = UPGRADES.filter(u => !u.max || (p.upgradeCounts[u.id] || 0) < u.max);
    return U.shuffle(pool.slice()).slice(0, 3);
  }

  chooseUpgrade(u) {
    const p = this.player;
    u.apply(p);
    p.upgradeCounts[u.id] = (p.upgradeCounts[u.id] || 0) + 1;
    p.pendingLevels--;
    this.particles.text(p.x, p.y - 30, u.name, u.color, 18);
    if (p.pendingLevels > 0) {
      this.ui.showLevelUp(this.rollUpgrades());
    } else {
      this.state = 'playing';
      this.ui.hideAll();
      Input.mouse.down = false;
    }
  }

  toggleQuality() {
    const low = !this.renderer.low;
    this.renderer.setQuality(low);
    try { localStorage.setItem('zonamuerta_quality', low ? 'low' : 'high'); } catch (e) { /* sin almacenamiento */ }
    return low;
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.show('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.hideAll();
    }
  }

  // ------------------------------------------------------------ bucle
  update(dt) {
    if (Input.wasPressed('KeyM')) {
      const muted = Sound.toggleMute();
      if (this.state === 'playing') this.message(muted ? 'Sonido desactivado' : 'Sonido activado', 1.5);
    }
    if (Input.wasPressed('Escape') || Input.wasPressed('KeyP')) this.togglePause();

    if (this.state === 'menu') {
      // la cámara recorre el mapa de fondo
      this.time += dt;
      this.cam.x = this.world.w / 2 + Math.cos(this.time * 0.04) * 700;
      this.cam.y = this.world.h / 2 + Math.sin(this.time * 0.055) * 500;
      this.time = this.time % 1000;
      this.renderer.updateCamera();
      return;
    }
    if (this.state !== 'playing') return;

    const p = this.player;
    let wdt = dt;
    if (!p.alive) {
      this.deathT -= dt;
      wdt = dt * 0.35;
      if (this.deathT <= 0) {
        this.finishRun();
        return;
      }
    }

    this.time += p.alive ? dt : 0;
    this.zombieHash.clear();
    for (const z of this.zombies) this.zombieHash.insert(z);

    if (p.alive) {
      p.update(dt, this);
      this.world.updateFlow(p.x, p.y, dt);
      this.director.update(dt);
    }
    for (const z of this.zombies) if (!z.dead) z.update(wdt, this);
    for (const pr of this.projectiles) pr.update(wdt, this);
    for (const pk of this.pickups) pk.update(wdt, this);
    this.particles.update(wdt);

    this.zombies = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    this.pickups = this.pickups.filter(pk => !pk.dead);
    for (const d of this.decals) d.life -= dt;
    if (this.decals.length && this.decals[0].life <= 0) this.decals = this.decals.filter(d => d.life > 0);
    for (const l of this.lights) l.t -= dt;
    this.lights = this.lights.filter(l => l.t > 0);
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter(m => m.t > 0);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);

    // gemidos ambientales
    if (this.zombies.length && Math.random() < dt * 0.5) Sound.play('groan');

    // cámara: sigue al jugador adelantándose hacia el ratón
    const mw = this.mouseWorld();
    const lead = 0.22;
    const tx = p.x + U.clamp((mw.x - p.x) * lead, -180, 180);
    const ty = p.y + U.clamp((mw.y - p.y) * lead, -120, 120);
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
    this.cam.sx = U.rand(-1, 1) * this.cam.shake;
    this.cam.sy = U.rand(-1, 1) * this.cam.shake;
    this.renderer.updateCamera();

    if (p.alive && p.pendingLevels > 0) this.openLevelUp();
  }

  render() {
    const ctx = this.ctx;
    this.renderer.render();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.state !== 'menu') this.hud.render(ctx);
    this.canvas.style.cursor = this.state === 'playing' ? 'none' : 'default';
  }
}
