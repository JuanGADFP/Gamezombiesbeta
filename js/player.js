'use strict';

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.angle = 0;
    this.stats = Object.assign({}, PLAYER_BASE);
    this.hp = this.stats.maxHp;
    this.stamina = this.stats.maxStamina;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.pendingLevels = 0;
    this.upgradeCounts = {};

    this.weapons = {};
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      this.weapons[id] = {
        owned: id === 'machete' || id === 'pistol',
        mag: w.mag || 0,
        reserve: w.startAmmo || 0,
      };
    }
    this.current = 'pistol';
    this.prevWeapon = 'machete';

    this.attackCd = 0;
    this.reloadT = 0;
    this.reloadTotal = 1;
    this.swingT = 0;
    this.swingAngle = 0;
    this.swingDir = 1;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.dodgeX = 0;
    this.dodgeY = 0;
    this.staminaDelay = 0;
    this.exhausted = false;
    this.sprinting = false;
    this.moving = false;
    this.hurtT = 0;
    this.muzzleT = 0;
    this.walkCycle = 0;
    this.alive = true;
    this.emptyMsgT = 0;
  }

  get weapon() { return WEAPONS[this.current]; }

  heal(v) {
    this.hp = Math.min(this.stats.maxHp, this.hp + v);
  }

  refillAmmo(packs) {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      if (!w.melee && this.weapons[id].owned) this.weapons[id].reserve += Math.round(w.ammoPack * packs);
    }
  }

  giveWeapon(id) {
    const st = this.weapons[id];
    st.owned = true;
    st.mag = WEAPONS[id].mag;
    st.reserve += WEAPONS[id].startAmmo;
  }

  switchWeapon(id) {
    if (!this.weapons[id].owned || id === this.current) return;
    this.prevWeapon = this.current;
    this.current = id;
    this.reloadT = 0;
    this.attackCd = Math.max(this.attackCd, 0.15);
    Sound.play('switch');
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter(id => this.weapons[id].owned);
    const i = owned.indexOf(this.current);
    this.switchWeapon(owned[(i + dir + owned.length) % owned.length]);
  }

  useStamina(v, delay) {
    this.stamina -= v;
    this.staminaDelay = Math.max(this.staminaDelay, delay);
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.exhausted = true;
    }
  }

  update(dt, game) {
    const s = this.stats;
    const mw = game.mouseWorld();
    this.angle = Math.atan2(mw.y - this.y, mw.x - this.x);

    // --- cambio de arma
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (Input.wasPressed('Digit' + (i + 1))) this.switchWeapon(WEAPON_ORDER[i]);
    }
    if (Input.wheel) this.cycleWeapon(Input.wheel > 0 ? 1 : -1);
    if (Input.wasPressed('KeyQ')) this.switchWeapon(this.prevWeapon);

    // --- movimiento
    let mx = 0, my = 0;
    if (Input.isDown('KeyW') || Input.isDown('ArrowUp')) my -= 1;
    if (Input.isDown('KeyS') || Input.isDown('ArrowDown')) my += 1;
    if (Input.isDown('KeyA') || Input.isDown('ArrowLeft')) mx -= 1;
    if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) mx += 1;
    const ml = Math.hypot(mx, my);
    if (ml > 0) { mx /= ml; my /= ml; }
    this.moving = ml > 0;

    this.attackCd -= dt;
    this.dodgeCd -= dt;
    this.staminaDelay -= dt;
    this.hurtT -= dt;
    this.muzzleT -= dt;
    this.swingT -= dt;
    this.emptyMsgT -= dt;

    // --- esquivar (rodar)
    if (Input.wasPressed('Space') && this.dodgeT <= 0 && this.dodgeCd <= 0 && !this.exhausted && this.stamina >= s.dodgeCost) {
      this.dodgeX = this.moving ? mx : Math.cos(this.angle);
      this.dodgeY = this.moving ? my : Math.sin(this.angle);
      this.dodgeT = s.dodgeTime;
      this.dodgeCd = 0.45;
      this.useStamina(s.dodgeCost, 0.8);
      Sound.play('dodge');
    }

    // --- correr
    this.sprinting = false;
    if ((Input.isDown('ShiftLeft') || Input.isDown('ShiftRight')) && this.moving && !this.exhausted && this.stamina > 0 && this.dodgeT <= 0) {
      this.sprinting = true;
      this.useStamina(s.sprintCost * dt, 0.5);
    }

    // --- regeneración de estamina
    if (this.staminaDelay <= 0) {
      const k = (this.exhausted ? 0.7 : 1) * (this.moving ? 0.75 : 1);
      this.stamina = Math.min(s.maxStamina, this.stamina + s.staminaRegen * k * dt);
    }
    if (this.exhausted && this.stamina >= s.maxStamina * 0.35) this.exhausted = false;

    let vx, vy;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = this.dodgeX * s.dodgeSpeed;
      vy = this.dodgeY * s.dodgeSpeed;
      if (Math.random() < 0.6) game.particles.add(this.x, this.y + 8, U.rand(-20, 20), U.rand(-20, 20), 0.4, 6, 'rgba(160,150,120,0.5)', 3);
    } else {
      let sp = s.speed * (this.sprinting ? s.sprintMult : 1) * (this.exhausted ? 0.82 : 1);
      if (this.reloadT > 0) sp *= 0.85;
      vx = mx * sp;
      vy = my * sp;
    }
    this.x += vx * dt;
    this.y += vy * dt;
    game.world.resolveCircle(this);
    if (this.moving) this.walkCycle += dt * (this.sprinting ? 15 : 10);

    // --- recarga
    const w = this.weapon, ws = this.weapons[this.current];
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(w.mag - ws.mag, ws.reserve);
        ws.mag += take;
        ws.reserve -= take;
        Sound.play('reloadDone');
      }
    }
    if (Input.wasPressed('KeyR')) this.startReload();

    // --- ataque
    if (Input.mouse.down && this.attackCd <= 0 && this.dodgeT <= 0 && this.reloadT <= 0) {
      if (w.melee) this.melee(game);
      else this.shoot(game);
    }

    if (s.hpRegen > 0) this.heal(s.hpRegen * dt);
  }

  startReload() {
    const w = this.weapon, ws = this.weapons[this.current];
    if (w.melee || this.reloadT > 0 || ws.mag >= w.mag || ws.reserve <= 0) return;
    this.reloadTotal = w.reload / this.stats.reloadSpeed;
    this.reloadT = this.reloadTotal;
    Sound.play('reload');
  }

  melee(game) {
    const w = this.weapon, s = this.stats;
    const weak = this.exhausted || this.stamina < w.stamina;
    if (!weak) this.useStamina(w.stamina, 0.5);
    this.attackCd = w.cooldown * (weak ? 1.5 : 1);
    this.swingT = 0.16;
    this.swingAngle = this.angle;
    this.swingDir = -this.swingDir;
    Sound.play('swing');
    let hits = 0;
    for (const z of game.zombieHash.query(this.x, this.y, w.range + 30)) {
      if (z.dead) continue;
      const dx = z.x - this.x, dy = z.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d - z.radius > w.range) continue;
      if (Math.abs(U.angleDiff(this.angle, Math.atan2(dy, dx))) > w.arc / 2 && d > z.radius + this.radius + 4) continue;
      const crit = Math.random() < s.critChance;
      const dmg = w.dmg * s.meleeDmg * (weak ? 0.5 : 1) * (crit ? 2 : 1);
      z.takeDamage(dmg, dx / d, dy / d, w.knockback * (weak ? 0.5 : 1), game, crit);
      hits++;
    }
    if (hits) {
      Sound.play('hit');
      game.addShake(2 + Math.min(hits, 4));
    }
  }

  shoot(game) {
    const w = this.weapon, ws = this.weapons[this.current], s = this.stats;
    if (ws.mag <= 0) {
      if (ws.reserve > 0) {
        this.startReload();
      } else {
        this.attackCd = 0.3;
        Sound.play('empty');
        if (this.emptyMsgT <= 0) {
          game.message('¡Sin munición! Usa el machete [1]', 2.5, '#ff9a6b');
          this.emptyMsgT = 3;
        }
      }
      return;
    }
    ws.mag--;
    this.attackCd = w.fireRate / s.fireRate;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const mx = this.x + ca * 26, my = this.y + sa * 26;
    for (let i = 0; i < w.pellets; i++) {
      const a = this.angle + U.rand(-w.spread, w.spread);
      const sp = w.speed * (w.pellets > 1 ? U.rand(0.85, 1.1) : 1);
      const crit = Math.random() < s.critChance;
      game.projectiles.push(new Projectile(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, w.dmg * s.gunDmg * (crit ? 2 : 1), {
        owner: 'player', life: w.life, pierce: w.pierce, knockback: w.knockback, crit,
      }));
    }
    this.muzzleT = 0.05;
    game.addShake(w.shake);
    game.addLight(mx, my, 160, 0.07);
    game.particles.add(mx, my, ca * 60, sa * 60, 0.08, 10, '#ffe08a', 0, true);
    game.particles.add(this.x + ca * 10, this.y + sa * 10, -sa * U.rand(60, 110), ca * U.rand(60, 110), 0.5, 2.5, '#d4a645', 5);
    Sound.play(this.current);
    if (ws.mag === 0 && ws.reserve > 0) this.startReload();
  }

  takeDamage(amount, game) {
    if (!this.alive || this.dodgeT > 0) return;
    amount *= 1 - this.stats.armor;
    this.hp -= amount;
    this.hurtT = 0.25;
    game.damageFlash = Math.min(1, game.damageFlash + amount / 25);
    game.addShake(3 + amount * 0.25);
    Sound.play('hurt');
    game.particles.blood(this.x, this.y, 6, 0, 0);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      game.onPlayerDeath();
    }
  }

  addXp(v) {
    this.xp += v;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      this.pendingLevels++;
    }
  }
}
