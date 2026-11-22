'use strict';

// El "director" controla la dificultad: crece con el tiempo, más fuerte de noche,
// hordas periódicas, nuevos tipos de zombi y suministros aéreos.
class Director {
  constructor(game) {
    this.g = game;
    this.spawnTimer = 2;
    this.nextHorde = DIFFICULTY.HORDE_FIRST;
    this.hordeIdx = 0;
    this.hordeWarned = false;
    this.nextDrop = DIFFICULTY.DROP_FIRST;
    this.unlocked = new Set(['walker']);
    this.wasNight = false;
    this.speedNight = 1;
  }

  get minutes() { return this.g.time / 60; }

  // nivel de amenaza visible en el HUD
  get threat() { return 1 + Math.floor(this.g.time / 60); }

  mods() {
    const m = this.minutes, night = this.g.nightness;
    return {
      hp: 1 + m * 0.13 + night * 0.15,
      dmg: 1 + m * 0.07,
      speed: Math.min(1.45, 1 + m * 0.035),
    };
  }

  update(dt) {
    const g = this.g, t = g.time, m = this.minutes, night = g.nightness;
    this.speedNight = 1 + night * 0.12;

    // tipos nuevos
    for (const [id, T] of Object.entries(ZOMBIE_TYPES)) {
      if (!this.unlocked.has(id) && t >= T.unlock) {
        this.unlocked.add(id);
        g.message(`¡Cuidado! Aparecen ${T.name}`, 4, '#ffb35c');
      }
    }

    // noche
    const isNight = night > 0.6;
    if (isNight && !this.wasNight) {
      g.message('Cae la noche... los muertos se vuelven más agresivos', 4.5, '#9fb4ff');
      Sound.play('night');
      this.spawnHorde(8 + Math.floor(m * 3), 0.35);
    } else if (!isNight && this.wasNight) {
      g.message(`Amanece. Has sobrevivido a la noche ${g.dayNumber - 1}`, 4, '#ffe28a');
      g.player.heal(g.player.stats.maxHp * 0.25);
    }
    this.wasNight = isNight;

    // aparición continua
    const maxAlive = Math.min(320, (24 + m * 14) * (1 + night * 0.35));
    const interval = Math.max(0.16, 1.6 / (1 + m * 0.45)) / (1 + night * 0.8);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = interval * U.rand(0.7, 1.3);
      const batch = 1 + Math.floor(m / 2.5);
      for (let i = 0; i < batch && g.zombies.length < maxAlive; i++) {
        const pt = this.spawnPoint();
        if (pt) this.spawn(this.pickType(), pt.x, pt.y);
      }
    }

    // hordas
    if (!this.hordeWarned && t >= this.nextHorde - DIFFICULTY.HORDE_WARN) {
      this.hordeWarned = true;
      g.message('¡SE ACERCA UNA HORDA!', DIFFICULTY.HORDE_WARN, '#ff4d4d', true);
      Sound.play('horde');
    }
    if (t >= this.nextHorde) {
      this.hordeIdx++;
      this.spawnHorde(14 + this.hordeIdx * 7 + Math.floor(m * 2), 0.7);
      this.nextHorde += DIFFICULTY.HORDE_EVERY;
      this.hordeWarned = false;
    }

    // suministro aéreo
    if (t >= this.nextDrop) {
      this.nextDrop = t + DIFFICULTY.DROP_EVERY;
      if (!g.pickups.some(p => p.type === 'crate')) {
        const pt = this.spawnPoint(350, 850, true);
        if (pt) {
          g.pickups.push(new Pickup('crate', pt.x, pt.y));
          g.message('Suministros lanzados — sigue la flecha amarilla', 4, '#ffd34d');
          Sound.play('crate');
        }
      }
    }
  }

  pickType() {
    const t = this.g.time, items = [];
    for (const [id, T] of Object.entries(ZOMBIE_TYPES)) {
      if (t < T.unlock) continue;
      const ramp = id === 'walker' ? 1 : U.clamp((t - T.unlock) / 60, 0.25, 1);
      items.push({ item: id, w: T.weight * ramp });
    }
    return U.weightedChoice(items);
  }

  // punto fuera de la pantalla, transitable y alcanzable
  spawnPoint(minD, maxD, allowVisible = false) {
    const g = this.g, p = g.player, w = g.world;
    const viewR = Math.hypot(g.cw / 2, g.ch / 2) / g.zoom;
    minD = minD || viewR + 40;
    maxD = maxD || viewR + 320;
    for (let i = 0; i < 24; i++) {
      const a = U.rand(0, TAU), d = U.rand(minD, maxD);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!w.isWalkable(x, y)) continue;
      if (w.flowDist[w.cellIndex(x, y)] < 0) continue;
      if (!allowVisible && g.isOnScreen(x, y, 40)) continue;
      return { x, y };
    }
    return null;
  }

  spawnHorde(count, focus) {
    const g = this.g, p = g.player, w = g.world;
    const base = U.rand(0, TAU);
    const viewR = Math.hypot(g.cw / 2, g.ch / 2) / g.zoom;
    let made = 0;
    for (let i = 0; i < count * 4 && made < count; i++) {
      const a = Math.random() < focus ? base + U.rand(-0.6, 0.6) : U.rand(0, TAU);
      const d = U.rand(viewR + 30, viewR + 380);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!w.isWalkable(x, y) || w.flowDist[w.cellIndex(x, y)] < 0) continue;
      this.spawn(this.pickType(), x, y);
      made++;
    }
  }

  spawn(type, x, y) {
    this.g.zombies.push(new Zombie(type, x, y, this.mods()));
  }
}
