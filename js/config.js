'use strict';

// ============================================================
//  CONFIGURACIÓN GENERAL — ajusta aquí el balance del juego
// ============================================================

const CONFIG = {
  WORLD_W: 4000,
  WORLD_H: 4000,
  TILE: 40,            // tamaño de celda para pathfinding / colisiones
  DAY_CYCLE: 240,      // segundos que dura un día completo (día + noche)
  START_PHASE: 0.08,   // fase del día al empezar (0 = 07:00)
  BLOCK: 640,          // separación entre calles
  ROAD_W: 120,
  SIDEWALK: 24,
  FLOOR_H: 46,         // altura de cada planta de los edificios
  // cámara alta en perspectiva (estilo How to Survive)
  CAMERA: { height: 540, back: 420, fov: 42, aimHeight: 16 },
  MAX_PARTICLES: 3000,
  MAX_DECALS: 500,
  MAX_CORPSES: 80,
};

const PLAYER_BASE = {
  maxHp: 100,
  maxStamina: 100,
  speed: 170,
  staminaRegen: 26,
  hpRegen: 0,
  meleeDmg: 1,
  gunDmg: 1,
  fireRate: 1,
  reloadSpeed: 1,
  armor: 0,
  pickupRadius: 95,
  lifesteal: 0,
  critChance: 0.05,
  sprintMult: 1.55,
  sprintCost: 24,      // estamina por segundo al correr
  dodgeCost: 28,
  dodgeSpeed: 560,
  dodgeTime: 0.22,
};

const WEAPONS = {
  machete: {
    name: 'Machete', melee: true, dmg: 30, range: 64, arc: 1.9,
    cooldown: 0.42, stamina: 12, knockback: 280,
  },
  pistol: {
    name: 'Pistola', dmg: 22, fireRate: 0.26, mag: 12, reload: 1.1, speed: 950,
    spread: 0.035, pellets: 1, ammoPack: 24, startAmmo: 48, knockback: 110,
    pierce: 0, life: 0.7, shake: 2,
  },
  shotgun: {
    name: 'Escopeta', dmg: 15, fireRate: 0.75, mag: 6, reload: 1.7, speed: 820,
    spread: 0.3, pellets: 7, ammoPack: 10, startAmmo: 18, knockback: 230,
    pierce: 0, life: 0.38, shake: 6,
  },
  rifle: {
    name: 'Rifle', dmg: 17, fireRate: 0.095, mag: 30, reload: 1.6, speed: 1150,
    spread: 0.06, pellets: 1, ammoPack: 45, startAmmo: 90, knockback: 80,
    pierce: 1, life: 0.8, shake: 2.5,
  },
};
const WEAPON_ORDER = ['machete', 'pistol', 'shotgun', 'rifle'];

const PANTS = ['#2b3442', '#3a3226', '#2a2a2a', '#4a4236', '#33402c', '#1f2a38'];
const SHIRTS = ['#5b4a3a', '#3f4d5e', '#6b3b3b', '#4c5a3a', '#5a5a5a', '#5e4a63', '#2f4f4f', '#7a6a4f'];

// unlock = segundo de partida en que empiezan a aparecer
const ZOMBIE_TYPES = {
  walker: {
    desc: 'Antiguos vecinos de la ciudad. Lentos y torpes, pero nunca se cansan. Muchos cojean o arrastran un brazo.', model: 1, name: 'Caminantes', hp: 34, speed: 58, dmg: 9, radius: 14, xp: 4,
    attackRate: 0.9, kbResist: 0, skin: '#8e9a7c', unlock: 0, weight: 10,
  },
  runner: {
    desc: 'Infectados recientes: el cuerpo aún responde. Corren con los brazos agitándose y te alcanzan si no ruedas a tiempo.', model: 0.94, name: 'Corredores', hp: 22, speed: 128, dmg: 7, radius: 13, xp: 6,
    attackRate: 0.7, kbResist: 0, skin: '#b8b29c', unlock: 60, weight: 6,
  },
  spitter: {
    desc: 'Su garganta se hincha con un ácido que brilla en la oscuridad. Mantienen la distancia y te escupen.', model: 1, name: 'Escupidores', hp: 40, speed: 52, dmg: 6, radius: 14, xp: 10,
    attackRate: 1, kbResist: 0, skin: '#9cae4c', unlock: 150, weight: 3,
    range: 380, keepDist: 230, spitRate: 2.6, spitDmg: 12, spitSpeed: 340,
  },
  brute: {
    desc: 'Una mole de músculo y rabia. Aguanta muchísimo castigo, apenas retrocede y cada golpe suyo duele.', model: 1.65, name: 'Brutos', hp: 220, speed: 42, dmg: 24, radius: 25, xp: 25,
    attackRate: 1.3, kbResist: 0.8, skin: '#7d8268', unlock: 210, weight: 2.5,
  },
  bloater: {
    desc: 'Hinchado por los gases de la putrefacción y cubierto de pústulas. Revienta al acercarse o al morir.', model: 1.15, name: 'Hinchados', hp: 55, speed: 66, dmg: 0, radius: 19, xp: 12,
    attackRate: 1, kbResist: 0.4, skin: '#a0a462', unlock: 300, weight: 2.5,
    fuse: 0.65, blastRadius: 120, blastDmg: 38,
  },
};

const DIFFICULTY = {
  HORDE_FIRST: 90,     // primera horda
  HORDE_EVERY: 120,    // luego cada N segundos
  HORDE_WARN: 6,
  DROP_FIRST: 40,      // primer suministro aéreo
  DROP_EVERY: 75,
};

function xpForLevel(lv) {
  return Math.floor(16 * Math.pow(lv, 1.45));
}

const UPGRADES = [
  { id: 'vit', name: 'Vitalidad', icon: '♥', color: '#e2504c', desc: '+25 vida máxima y cura 25',
    apply: p => { p.stats.maxHp += 25; p.heal(25); } },
  { id: 'end', name: 'Resistencia', icon: '⚡', color: '#e8c547', desc: '+25 estamina máxima',
    apply: p => { p.stats.maxStamina += 25; p.stamina += 25; } },
  { id: 'rec', name: 'Pulmones de acero', icon: '≋', color: '#9fd356', desc: '+25% regeneración de estamina',
    apply: p => { p.stats.staminaRegen *= 1.25; } },
  { id: 'str', name: 'Fuerza bruta', icon: '⚔', color: '#d98b4a', desc: '+20% daño cuerpo a cuerpo',
    apply: p => { p.stats.meleeDmg += 0.2; } },
  { id: 'aim', name: 'Puntería', icon: '◎', color: '#5fb3e8', desc: '+15% daño con armas de fuego',
    apply: p => { p.stats.gunDmg += 0.15; } },
  { id: 'rof', name: 'Gatillo fácil', icon: '➹', color: '#f08a5d', desc: '+12% cadencia de disparo',
    apply: p => { p.stats.fireRate += 0.12; } },
  { id: 'rld', name: 'Manos rápidas', icon: '↻', color: '#7fd1b9', desc: '+20% velocidad de recarga',
    apply: p => { p.stats.reloadSpeed += 0.2; } },
  { id: 'spd', name: 'Agilidad', icon: '»', color: '#b28dff', desc: '+8% velocidad de movimiento', max: 6,
    apply: p => { p.stats.speed *= 1.08; } },
  { id: 'reg', name: 'Regeneración', icon: '✚', color: '#58d68d', desc: 'Recuperas +0.8 de vida por segundo',
    apply: p => { p.stats.hpRegen += 0.8; } },
  { id: 'arm', name: 'Piel dura', icon: '⛨', color: '#a0a7b4', desc: '-8% daño recibido', max: 6,
    apply: p => { p.stats.armor = Math.min(0.5, p.stats.armor + 0.08); } },
  { id: 'mag', name: 'Imán', icon: '◉', color: '#4fc3f7', desc: '+40% radio de recogida', max: 4,
    apply: p => { p.stats.pickupRadius *= 1.4; } },
  { id: 'vamp', name: 'Sed de sangre', icon: '☠', color: '#c0392b', desc: 'Cada baja te cura 1 de vida',
    apply: p => { p.stats.lifesteal += 1; } },
  { id: 'crit', name: 'Ojo certero', icon: '✸', color: '#ffd166', desc: '+7% prob. de crítico (daño x2)', max: 6,
    apply: p => { p.stats.critChance += 0.07; } },
  { id: 'ammo', name: 'Acopio', icon: '▤', color: '#c8b88a', desc: 'Munición extra para todas tus armas',
    apply: p => { p.refillAmmo(2); } },
];
