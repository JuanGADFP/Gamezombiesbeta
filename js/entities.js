'use strict';

// ============================================================ ZOMBI
class Zombie {
  constructor(type, x, y, mods) {
    const T = ZOMBIE_TYPES[type];
    this.type = type;
    this.T = T;
    this.x = x;
    this.y = y;
    this.radius = T.radius;
    this.maxHp = T.hp * mods.hp;
    this.hp = this.maxHp;
    this.speed = T.speed * mods.speed * U.rand(0.88, 1.12);
    this.dmg = T.dmg * mods.dmg;
    this.shirt = U.choice(SHIRTS);
    this.kbx = 0;
    this.kby = 0;
    this.dirX = 0;
    this.dirY = 0;
    this.angle = U.rand(0, TAU);
    this.attackCd = U.rand(0.2, 0.6);
    this.hitFlash = 0;
    this.lunge = 0;
    this.spitCd = U.rand(1, 3);
    this.losT = 0;
    this.hasLos = false;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.fuse = -1;
    this.exploded = false;
    this.dead = false;
    this.walk = U.rand(0, TAU);
    this.wobble = U.rand(0, TAU);
    this.spawnT = 0.4;
  }

  update(dt, game) {
    const p = game.player, world = game.world, T = this.T;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.spawnT -= dt;
    this.walk += dt * this.speed * 0.12;
    this.wobble += dt * 3;

    // --- dirección deseada: directo si está cerca, si no sigue el campo de flujo
    let tx, ty;
    const ci = world.cellIndex(this.x, this.y), fd = world.flowDist[ci];
    if (!p.alive) {
      tx = Math.cos(this.angle); ty = Math.sin(this.angle);
    } else if (d < 110 || fd < 0 || fd <= 2 || (world.flowX[ci] === 0 && world.flowY[ci] === 0)) {
      tx = dx / d; ty = dy / d;
    } else {
      tx = world.flowX[ci]; ty = world.flowY[ci];
    }
    let speedK = 1;

    if (this.type === 'spitter' && p.alive) {
      this.losT -= dt;
      if (this.losT <= 0) {
        this.losT = 0.3;
        this.hasLos = d < T.range && world.lineOfSight(this.x, this.y, p.x, p.y);
      }
      if (this.hasLos) {
        if (d < T.keepDist) { tx = -dx / d; ty = -dy / d; speedK = 0.8; }
        else if (d < T.range * 0.85) { tx = (-dy / d) * this.strafe; ty = (dx / d) * this.strafe; speedK = 0.45; }
        this.spitCd -= dt;
        if (this.spitCd <= 0) {
          this.spitCd = T.spitRate * U.rand(0.8, 1.2);
          const a = Math.atan2(dy, dx) + U.rand(-0.06, 0.06);
          game.projectiles.push(new Projectile(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 16,
            Math.cos(a) * T.spitSpeed, Math.sin(a) * T.spitSpeed, T.spitDmg * (this.dmg / T.dmg || 1),
            { owner: 'enemy', life: 1.6, radius: 6, kind: 'acid' }));
          Sound.play('spit');
          this.lunge = 0.15;
        }
      }
    }

    if (this.type === 'bloater') {
      if (this.fuse < 0 && p.alive && d < this.radius + p.radius + 28) this.fuse = T.fuse;
      if (this.fuse >= 0) {
        this.fuse -= dt;
        speedK = 0.25;
        if (this.fuse <= 0) {
          this.hp = 0;
          this.die(game);
          return;
        }
      }
    }

    // --- separación entre zombis
    let sx = 0, sy = 0;
    const near = game.zombieHash.query(this.x, this.y, this.radius + 26);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === this || o.dead) continue;
      const ox = this.x - o.x, oy = this.y - o.y, min = this.radius + o.radius;
      const dd2 = ox * ox + oy * oy;
      if (dd2 < min * min && dd2 > 0.0001) {
        const dd = Math.sqrt(dd2), push = (min - dd) / min;
        sx += (ox / dd) * push;
        sy += (oy / dd) * push;
        // corrección dura (los grandes empujan más)
        const w = o.radius / (this.radius + o.radius);
        this.x += (ox / dd) * (min - dd) * 0.35 * w;
        this.y += (oy / dd) * (min - dd) * 0.35 * w;
      }
    }

    const k = Math.min(1, dt * 7);
    this.dirX = U.lerp(this.dirX, tx + sx * 1.4, k);
    this.dirY = U.lerp(this.dirY, ty + sy * 1.4, k);
    const dl = Math.hypot(this.dirX, this.dirY);
    let ndx = 0, ndy = 0;
    if (dl > 0.01) { ndx = this.dirX / Math.max(dl, 1); ndy = this.dirY / Math.max(dl, 1); }

    const sp = this.speed * speedK * game.director.speedNight * (this.spawnT > 0 ? 0.3 : 1);
    this.x += (ndx * sp + this.kbx) * dt;
    this.y += (ndy * sp + this.kby) * dt;
    const decay = Math.max(0, 1 - dt * 9);
    this.kbx *= decay;
    this.kby *= decay;
    world.resolveCircle(this);

    // --- orientación
    const faceA = d < 200 && p.alive ? Math.atan2(dy, dx) : Math.atan2(ndy, ndx);
    if (dl > 0.01 || d < 200) this.angle += U.angleDiff(this.angle, faceA) * Math.min(1, dt * 8);

    // --- ataque cuerpo a cuerpo
    this.attackCd -= dt;
    this.hitFlash -= dt;
    this.lunge -= dt;
    if (p.alive && this.type !== 'bloater' && d < this.radius + p.radius + 7 && this.attackCd <= 0) {
      p.takeDamage(this.dmg, game);
      this.attackCd = T.attackRate;
      this.lunge = 0.15;
    }
  }

  takeDamage(dmg, dirX, dirY, kb, game, crit) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.08;
    const res = this.T.kbResist;
    this.kbx += dirX * kb * (1 - res);
    this.kby += dirY * kb * (1 - res);
    game.particles.blood(this.x, this.y, crit ? 8 : 4, dirX, dirY);
    if (crit) game.particles.text(this.x, this.y - this.radius - 6, 'CRÍTICO', '#ffd166', 13);
    if (Math.random() < 0.25) game.addDecal('blood', this.x + dirX * 14, this.y + dirY * 14, U.rand(6, 13));
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    game.onZombieKilled(this);
    if (this.type === 'bloater' && !this.exploded) {
      this.exploded = true;
      const T = this.T;
      game.explode(this.x, this.y, T.blastRadius, T.blastDmg * (this.dmg / (T.dmg || 1) || 1), 90);
    }
  }
}

// ============================================================ PROYECTIL
class Projectile {
  constructor(x, y, vx, vy, dmg, o) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.owner = o.owner;
    this.life = o.life || 1;
    this.pierce = o.pierce || 0;
    this.kb = o.knockback || 0;
    this.crit = !!o.crit;
    this.radius = o.radius || 3;
    this.kind = o.kind || 'bullet';
    this.hit = null;
    this.dead = false;
  }

  update(dt, game) {
    const steps = 3, sdt = dt / steps;
    for (let s = 0; s < steps && !this.dead; s++) {
      this.x += this.vx * sdt;
      this.y += this.vy * sdt;
      if (game.world.pointBlocked(this.x, this.y)) {
        this.dead = true;
        if (this.kind === 'acid') game.particles.burst(this.x, this.y, 8, '#9bd13a', 90, 0.4, 4);
        else game.particles.burst(this.x, this.y, 5, '#ffd27a', 140, 0.2, 2, true);
        break;
      }
      if (this.owner === 'player') {
        const cand = game.zombieHash.query(this.x, this.y, 32);
        for (let i = 0; i < cand.length; i++) {
          const z = cand[i];
          if (z.dead || (this.hit && this.hit.has(z))) continue;
          const rr = z.radius + this.radius;
          if (U.dist2(this.x, this.y, z.x, z.y) < rr * rr) {
            const sp = Math.hypot(this.vx, this.vy) || 1;
            z.takeDamage(this.dmg, this.vx / sp, this.vy / sp, this.kb, game, this.crit);
            if (this.pierce > 0) {
              this.pierce--;
              this.dmg *= 0.7;
              (this.hit || (this.hit = new Set())).add(z);
            } else {
              this.dead = true;
              break;
            }
          }
        }
      } else {
        const p = game.player, rr = p.radius + this.radius;
        if (p.alive && p.dodgeT <= 0 && U.dist2(this.x, this.y, p.x, p.y) < rr * rr) {
          p.takeDamage(this.dmg, game);
          game.particles.burst(this.x, this.y, 10, '#9bd13a', 100, 0.5, 4);
          this.dead = true;
        }
      }
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      if (this.kind === 'acid') game.addDecal('acid', this.x, this.y, 10);
    }
  }
}

// ============================================================ OBJETOS RECOGIBLES
class Pickup {
  constructor(type, x, y, value = 0) {
    this.type = type; // xp | ammo | med | crate
    this.x = x;
    this.y = y;
    this.value = value;
    this.t = U.rand(0, 10);
    this.magnet = false;
    this.pull = 0;
    this.dead = false;
    this.life = type === 'crate' ? Infinity : type === 'xp' ? 90 : 40;
    const a = U.rand(0, TAU), s = type === 'crate' ? 0 : U.rand(20, 90);
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
  }

  update(dt, game) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const drag = Math.max(0, 1 - dt * 5);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= drag;
    this.vy *= drag;
    const p = game.player;
    if (!p.alive) return;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (this.type !== 'crate') {
      if (d < p.stats.pickupRadius * (this.type === 'xp' ? 1 : 0.65)) this.magnet = true;
      if (this.magnet) {
        this.pull += dt * 700;
        const step = Math.min(d, (240 + this.pull) * dt);
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
    }
    if (d < p.radius + (this.type === 'crate' ? 28 : 10)) {
      this.dead = true;
      game.collectPickup(this);
    }
  }
}

// ============================================================ PARTÍCULAS Y TEXTOS
class Particles {
  constructor() {
    this.list = [];
    this.texts = [];
  }

  add(x, y, vx, vy, life, size, color, drag = 4, glow = false) {
    if (this.list.length >= CONFIG.MAX_PARTICLES) this.list.shift();
    this.list.push({ x, y, vx, vy, life, max: life, size, color, drag, glow });
  }

  burst(x, y, n, color, speed, life, size, glow = false) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, TAU), s = U.rand(0.3, 1) * speed;
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * U.rand(0.6, 1.2), size * U.rand(0.6, 1.3), color, 4, glow);
    }
  }

  blood(x, y, n, dx, dy) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + U.rand(-0.9, 0.9);
      const s = (dx || dy ? U.rand(60, 220) : U.rand(20, 120));
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.25, 0.55), U.rand(2, 4.5),
        U.choice(['#8a0f0f', '#a01818', '#6e0b0b', '#5a7a2a']), 6);
    }
  }

  text(x, y, str, color = '#fff', size = 16) {
    this.texts.push({ x, y, str, color, size, life: 1.1, max: 1.1 });
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.max(0, 1 - dt * p.drag);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= k;
      p.vy *= k;
      L[j++] = p;
    }
    L.length = j;
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 28 * dt;
    }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  render(ctx, v) {
    for (const p of this.list) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const a = p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        const s = p.size * (0.4 + a * 0.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      ctx.font = `bold ${t.size}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
