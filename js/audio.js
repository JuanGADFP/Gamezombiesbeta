'use strict';

// Efectos de sonido sintetizados con WebAudio (no requiere archivos)
const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  last: {},

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  },

  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.3, freq = 1000, ftype = 'lowpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = ftype;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const minGap = { hit: 40, hurt: 120, groan: 400, kill: 50, pickup: 50, xp: 35, step: 0 }[name] || 0;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'pistol':
        this.noise(0.12, 0.5, 2500);
        this.tone(180, 0.08, 'square', 0.15, 60);
        break;
      case 'shotgun':
        this.noise(0.3, 0.7, 1400);
        this.tone(120, 0.18, 'sawtooth', 0.25, 40);
        break;
      case 'rifle':
        this.noise(0.08, 0.4, 3200);
        this.tone(220, 0.05, 'square', 0.12, 80);
        break;
      case 'swing':
        this.noise(0.12, 0.25, 900, 'bandpass');
        break;
      case 'hit':
        this.noise(0.08, 0.35, 600);
        this.tone(90, 0.08, 'triangle', 0.25, 50);
        break;
      case 'kill':
        this.noise(0.15, 0.25, 400);
        break;
      case 'hurt':
        this.tone(220, 0.2, 'sawtooth', 0.25, 90);
        this.noise(0.12, 0.2, 800);
        break;
      case 'empty':
        this.tone(900, 0.04, 'square', 0.12);
        break;
      case 'reload':
        this.tone(500, 0.05, 'square', 0.1);
        this.tone(350, 0.05, 'square', 0.1, null, 0.12);
        break;
      case 'reloadDone':
        this.tone(700, 0.06, 'square', 0.12);
        break;
      case 'switch':
        this.tone(400, 0.04, 'triangle', 0.15);
        break;
      case 'dodge':
        this.noise(0.18, 0.2, 1500, 'highpass');
        break;
      case 'xp':
        this.tone(900 + Math.random() * 300, 0.06, 'sine', 0.08);
        break;
      case 'pickup':
        this.tone(600, 0.08, 'triangle', 0.2);
        this.tone(900, 0.1, 'triangle', 0.2, null, 0.07);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.22, null, i * 0.08));
        break;
      case 'explosion':
        this.noise(0.7, 0.9, 500);
        this.tone(80, 0.5, 'sine', 0.5, 30);
        break;
      case 'spit':
        this.noise(0.15, 0.2, 1200, 'bandpass');
        break;
      case 'groan':
        this.tone(70 + Math.random() * 40, 0.6, 'sawtooth', 0.06, 50);
        break;
      case 'horde':
        this.tone(110, 1.2, 'sawtooth', 0.18, 70);
        this.tone(165, 1.2, 'sawtooth', 0.12, 100, 0.1);
        break;
      case 'night':
        this.tone(220, 1.5, 'sine', 0.15, 110);
        break;
      case 'crate':
        this.tone(440, 0.15, 'sine', 0.2);
        this.tone(660, 0.25, 'sine', 0.2, null, 0.15);
        break;
      case 'death':
        this.tone(200, 1.2, 'sawtooth', 0.3, 40);
        this.noise(0.8, 0.3, 300);
        break;
    }
  },
};
