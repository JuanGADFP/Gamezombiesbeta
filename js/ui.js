'use strict';

// Menús en HTML (inicio, pausa, subida de nivel, fin de partida)
class UI {
  constructor(game) {
    this.g = game;
    this.el = {
      menu: document.getElementById('overlay-menu'),
      pause: document.getElementById('overlay-pause'),
      levelup: document.getElementById('overlay-levelup'),
      gameover: document.getElementById('overlay-gameover'),
    };
    this.cards = [];
    document.getElementById('btn-play').onclick = () => game.startGame();
    document.getElementById('btn-resume').onclick = () => game.togglePause();
    document.getElementById('btn-restart').onclick = () => game.startGame();
    document.getElementById('btn-pause-menu').onclick = () => this.toMenu();
    document.getElementById('btn-retry').onclick = () => game.startGame();
    document.getElementById('btn-gameover-menu').onclick = () => this.toMenu();

    window.addEventListener('keydown', e => {
      if (game.state === 'levelup') {
        const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (i >= 0 && this.cards[i]) this.pick(this.cards[i]);
      } else if ((game.state === 'menu' || game.state === 'gameover') && e.code === 'Enter') {
        game.startGame();
      } else if (game.state === 'gameover' && e.code === 'KeyR') {
        game.startGame();
      }
    });
    this.updateBest();
  }

  hideAll() {
    for (const k in this.el) this.el[k].classList.add('hidden');
  }

  show(name) {
    this.hideAll();
    this.el[name].classList.remove('hidden');
  }

  toMenu() {
    this.g.newRun();
    this.g.state = 'menu';
    this.updateBest();
    this.show('menu');
  }

  updateBest() {
    const b = this.g.best, el = document.getElementById('menu-best');
    el.textContent = b ? `Récord: ${U.formatTime(b.time)} · Nivel ${b.level} · ${b.kills} bajas` : '';
  }

  showLevelUp(options) {
    const g = this.g;
    this.cards = options;
    this.levelupShownAt = performance.now();
    document.getElementById('levelup-title').textContent = `NIVEL ${g.player.level - g.player.pendingLevels + 1}`;
    const box = document.getElementById('upgrade-cards');
    box.innerHTML = '';
    options.forEach((u, i) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.style.setProperty('--accent', u.color);
      const n = g.player.upgradeCounts[u.id] || 0;
      c.innerHTML = `
        <div class="card-key">${i + 1}</div>
        <div class="card-icon">${u.icon}</div>
        <div class="card-name">${u.name}</div>
        <div class="card-desc">${u.desc}</div>
        <div class="card-count">${n ? 'Mejora ' + (n + 1) : 'Nueva'}</div>`;
      c.onclick = () => this.pick(u);
      box.appendChild(c);
    });
    this.show('levelup');
  }

  pick(u) {
    // evita elegir sin querer si se estaba disparando al subir de nivel
    if (performance.now() - this.levelupShownAt < 350) return;
    this.g.chooseUpgrade(u);
  }

  showGameOver(run, record) {
    document.getElementById('go-time').textContent = U.formatTime(run.time);
    document.getElementById('go-level').textContent = run.level;
    document.getElementById('go-kills').textContent = run.kills;
    document.getElementById('go-day').textContent = run.day;
    document.getElementById('go-record').textContent = record ? '¡NUEVO RÉCORD!' : `Récord: ${U.formatTime(this.g.best.time)}`;
    document.getElementById('go-record').className = record ? 'record new' : 'record';
    this.show('gameover');
  }
}
