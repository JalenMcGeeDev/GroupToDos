/**
 * Generate Lottie JSON animation files for reactions and celebration.
 * Run: node scripts/generate-lotties.js
 */
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────
const L = (w, h, fr, op, layers) => ({
  v: '5.5.8', fr, ip: 0, op, w, h, nm: 'anim', ddd: 0, assets: [], layers, markers: []
});

const layer = (ind, nm, shapes, ks, op) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip: 0, op, st: 0, bm: 0
});

const grp = (...items) => ({
  ty: 'gr', it: items, nm: 'G', np: items.length - 1, cix: 2, bm: 0, ix: 1, hd: false
});

const el = (w, h, px, py) => ({
  d: 1, ty: 'el',
  s: { a: 0, k: [w, h], ix: 2 },
  p: { a: 0, k: [px || 0, py || 0], ix: 3 },
  nm: 'E', hd: false
});

const rc = (w, h, r, px, py) => ({
  ty: 'rc', d: 1,
  s: { a: 0, k: [w, h], ix: 2 },
  p: { a: 0, k: [px || 0, py || 0], ix: 3 },
  r: { a: 0, k: r || 0, ix: 4 },
  nm: 'R', hd: false
});

const star = (pts, ir, or) => ({
  ty: 'sr', d: 1, sy: 1,
  pt: { a: 0, k: pts, ix: 3 },
  ir: { a: 0, k: ir, ix: 6 },
  or: { a: 0, k: or, ix: 7 },
  is: { a: 0, k: 0, ix: 8 },
  os: { a: 0, k: 0, ix: 9 },
  p: { a: 0, k: [0, 0], ix: 4 },
  r: { a: 0, k: 0, ix: 5 },
  nm: 'S', hd: false
});

const sh = (v, i, o, c) => ({
  ind: 0, ty: 'sh', ix: 1,
  ks: { a: 0, k: { i, o, v, c: c !== false }, ix: 2 },
  nm: 'P', hd: false
});

const fl = (r, g, b, op) => ({
  ty: 'fl',
  c: { a: 0, k: [r, g, b, 1], ix: 4 },
  o: { a: 0, k: op != null ? op : 100, ix: 5 },
  r: 1, bm: 0, nm: 'F', hd: false
});

const st = (r, g, b, w) => ({
  ty: 'st',
  c: { a: 0, k: [r, g, b, 1], ix: 3 },
  o: { a: 0, k: 100, ix: 4 },
  w: { a: 0, k: w, ix: 5 },
  lc: 2, lj: 2, bm: 0, nm: 'S', hd: false
});

const tr = (px, py) => ({
  ty: 'tr',
  p: { a: 0, k: [px || 0, py || 0], ix: 2 },
  a: { a: 0, k: [0, 0], ix: 1 },
  s: { a: 0, k: [100, 100], ix: 3 },
  r: { a: 0, k: 0, ix: 6 },
  o: { a: 0, k: 100, ix: 7 },
  sk: { a: 0, k: 0, ix: 4 },
  sa: { a: 0, k: 0, ix: 5 },
  nm: 'T'
});

// Static transform
const sks = (opts = {}) => ({
  o: opts.o || { a: 0, k: 100, ix: 11 },
  r: opts.r || { a: 0, k: 0, ix: 10 },
  p: opts.p || { a: 0, k: [0, 0, 0], ix: 2 },
  a: opts.a || { a: 0, k: [0, 0, 0], ix: 1 },
  s: opts.s || { a: 0, k: [100, 100, 100], ix: 6 }
});

// Easing presets
const easeOut = { i: { x: [0.2], y: [1] }, o: { x: [0.6], y: [0] } };
const easeInOut = { i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } };
const bounce = { i: { x: [0.2], y: [1.4] }, o: { x: [0.6], y: [0] } };
const easeOut3 = { i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] }, o: { x: [0.6, 0.6, 0.6], y: [0, 0, 0] } };
const bounce3 = { i: { x: [0.2, 0.2, 0.2], y: [1.4, 1.4, 1] }, o: { x: [0.6, 0.6, 0.6], y: [0, 0, 0] } };
const easeInOut3 = { i: { x: [0.4, 0.4, 0.4], y: [1, 1, 1] }, o: { x: [0.6, 0.6, 0.6], y: [0, 0, 0] } };

// ─── CONFETTI CELEBRATION ───────────────────────────────────
function makeConfetti() {
  const OP = 90;
  const pieces = [
    { c: [1, 0.22, 0.22],    ex: 50,  ey: 25,  rot: 720,  w: 8,  h: 18 },
    { c: [0.22, 0.47, 1],    ex: 350, ey: 50,  rot: -540, w: 6,  h: 20 },
    { c: [0.18, 0.8, 0.34],  ex: 25,  ey: 340, rot: 450,  w: 10, h: 16 },
    { c: [1, 0.84, 0.04],    ex: 375, ey: 355, rot: -630, w: 7,  h: 22 },
    { c: [0.63, 0.25, 0.95], ex: 100, ey: 15,  rot: 360,  w: 8,  h: 14 },
    { c: [1, 0.55, 0.1],     ex: 310, ey: 385, rot: -450, w: 6,  h: 18 },
    { c: [1, 0.36, 0.68],    ex: 35,  ey: 190, rot: 540,  w: 9,  h: 15 },
    { c: [0.06, 0.82, 0.72], ex: 365, ey: 175, rot: -720, w: 7,  h: 20 },
    { c: [1, 0.75, 0],       ex: 175, ey: 380, rot: 630,  w: 8,  h: 17 },
    { c: [0.55, 0.95, 0.22], ex: 225, ey: 15,  rot: -360, w: 10, h: 14 },
    { c: [1, 0.42, 0.42],    ex: 145, ey: 370, rot: 480,  w: 6,  h: 22 },
    { c: [0.2, 0.78, 1],     ex: 275, ey: 25,  rot: -510, w: 9,  h: 16 },
    // Second wave — smaller, offset start
    { c: [0.95, 0.3, 0.6],   ex: 70,  ey: 100, rot: 400,  w: 5,  h: 12 },
    { c: [0.3, 0.6, 0.95],   ex: 330, ey: 120, rot: -380, w: 5,  h: 14 },
    { c: [0.9, 0.85, 0.15],  ex: 130, ey: 50,  rot: 520,  w: 6,  h: 10 },
    { c: [0.4, 0.9, 0.5],    ex: 270, ey: 350, rot: -440, w: 5,  h: 12 },
  ];

  const layers = pieces.map((p, i) => {
    const delay = i >= 12 ? 5 : 0; // second wave starts 5 frames later
    return layer(i + 1, `c${i}`, [grp(rc(p.w, p.h, 2), fl(...p.c), tr())], sks({
      o: { a: 1, k: [
        { t: delay, s: [100], e: [100], ...easeOut },
        { t: 55 + delay, s: [100], e: [0], ...easeInOut },
        { t: OP }
      ], ix: 11 },
      r: { a: 1, k: [
        { t: delay, s: [0], e: [p.rot], i: { x: [0.3], y: [1] }, o: { x: [0.7], y: [0] } },
        { t: OP }
      ], ix: 10 },
      p: { a: 1, k: [
        { t: delay, s: [200, 200, 0], e: [p.ex, p.ey, 0], i: { x: 0.15, y: 1 }, o: { x: 0.85, y: 0 }, to: [0, 0, 0], ti: [0, 0, 0] },
        { t: OP }
      ], ix: 2 },
      s: { a: 1, k: [
        { t: delay, s: [0, 0, 100], e: [100, 100, 100], ...easeOut3 },
        { t: delay + 8 }
      ], ix: 6 }
    }), OP);
  });

  return L(400, 400, 60, OP, layers);
}

// ─── LOVE IT (Heart) ────────────────────────────────────────
function makeLoveIt() {
  const OP = 60, SZ = 40;
  // Simple heart bezier (centered ~20x18)
  const heart = sh(
    [[0, 7], [-9, -2], [-5, -8], [0, -4], [5, -8], [9, -2]],
    [[-4, 3], [-3, -4], [-2, -1], [2, -1], [3, -4], [4, 3]],
    [[4, 3], [0, -4], [2, -1], [-2, -1], [0, -4], [-4, 3]],
    true
  );

  const l = layer(1, 'heart', [grp(heart, fl(0.93, 0.18, 0.28), tr())], sks({
    p: { a: 0, k: [SZ / 2, SZ / 2 + 1, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 0,  s: [0, 0, 100],     e: [130, 130, 100], ...bounce3 },
      { t: 12, s: [130, 130, 100],  e: [95, 95, 100],   ...easeInOut3 },
      { t: 22, s: [95, 95, 100],    e: [110, 110, 100],  ...easeInOut3 },
      { t: 35, s: [110, 110, 100],  e: [100, 100, 100],  ...easeInOut3 },
      { t: 45, s: [100, 100, 100],  e: [105, 105, 100],  ...easeInOut3 },
      { t: 55, s: [105, 105, 100],  e: [100, 100, 100],  ...easeInOut3 },
      { t: OP }
    ], ix: 6 }
  }), OP);

  return L(SZ, SZ, 60, OP, [l]);
}

// ─── GOOD LUCK (Four-leaf clover / shamrock) ────────────────
function makeGoodLuck() {
  const OP = 60, SZ = 40, cx = SZ / 2, cy = SZ / 2;
  // Four circles arranged as a clover
  const offsets = [[0, -5], [-5, 0], [0, 5], [5, 0]];
  const layers = offsets.map((off, i) => {
    return layer(i + 1, `leaf${i}`, [grp(el(10, 10, off[0], off[1]), fl(0.18, 0.72, 0.32), tr())], sks({
      p: { a: 0, k: [cx, cy, 0], ix: 2 },
      s: { a: 1, k: [
        { t: i * 3,       s: [0, 0, 100],     e: [120, 120, 100], ...bounce3 },
        { t: i * 3 + 12,  s: [120, 120, 100],  e: [100, 100, 100], ...easeInOut3 },
        { t: i * 3 + 20 }
      ], ix: 6 },
      r: { a: 1, k: [
        { t: 0, s: [i * 45], e: [i * 45 + 10], ...easeInOut },
        { t: 30, s: [i * 45 + 10], e: [i * 45], ...easeInOut },
        { t: OP }
      ], ix: 10 }
    }), OP);
  });

  // Center stem dot
  layers.push(layer(5, 'center', [grp(el(4, 4), fl(0.12, 0.55, 0.22), tr())], sks({
    p: { a: 0, k: [cx, cy, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 10, s: [0, 0, 100], e: [100, 100, 100], ...bounce3 },
      { t: 22 }
    ], ix: 6 }
  }), OP));

  return L(SZ, SZ, 60, OP, layers);
}

// ─── HAPPY FOR YOU (Smiley face) ────────────────────────────
function makeHappyForYou() {
  const OP = 60, SZ = 40, cx = SZ / 2, cy = SZ / 2;

  // Face circle
  const face = layer(1, 'face', [grp(el(28, 28), fl(1, 0.84, 0.1), tr())], sks({
    p: { a: 0, k: [cx, cy, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 0,  s: [0, 0, 100],     e: [115, 115, 100], ...bounce3 },
      { t: 12, s: [115, 115, 100],  e: [100, 100, 100], ...easeInOut3 },
      { t: 20 }
    ], ix: 6 }
  }), OP);

  // Left eye
  const leftEye = layer(2, 'leye', [grp(el(3.5, 4), fl(0.2, 0.15, 0.1), tr())], sks({
    p: { a: 0, k: [cx - 5, cy - 3, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 10, s: [0, 0, 100], e: [100, 100, 100], ...easeOut3 },
      { t: 18 }
    ], ix: 6 }
  }), OP);

  // Right eye
  const rightEye = layer(3, 'reye', [grp(el(3.5, 4), fl(0.2, 0.15, 0.1), tr())], sks({
    p: { a: 0, k: [cx + 5, cy - 3, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 10, s: [0, 0, 100], e: [100, 100, 100], ...easeOut3 },
      { t: 18 }
    ], ix: 6 }
  }), OP);

  // Smile arc (bezier curve)
  const smile = sh(
    [[-6, 0], [0, 5], [6, 0]],
    [[0, 0], [-3, 0], [0, 0]],
    [[0, 0], [3, 0], [0, 0]],
    false
  );
  const smileLayer = layer(4, 'smile', [grp(smile, st(0.2, 0.15, 0.1, 2), tr())], sks({
    p: { a: 0, k: [cx, cy + 2, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 14, s: [0, 0, 100],   e: [100, 100, 100], ...easeOut3 },
      { t: 24 }
    ], ix: 6 },
    o: { a: 1, k: [
      { t: 14, s: [0], e: [100], ...easeOut },
      { t: 24 }
    ], ix: 11 }
  }), OP);

  // Gentle bounce on whole thing
  const wrapper = layer(5, 'bounce', [], sks({
    p: { a: 1, k: [
      { t: 30, s: [0, 0, 0], e: [0, -3, 0], i: { x: 0.4, y: 1 }, o: { x: 0.6, y: 0 }, to: [0, 0, 0], ti: [0, 0, 0] },
      { t: 42, s: [0, -3, 0], e: [0, 0, 0], i: { x: 0.4, y: 1 }, o: { x: 0.6, y: 0 }, to: [0, 0, 0], ti: [0, 0, 0] },
      { t: OP }
    ], ix: 2 }
  }), OP);

  return L(SZ, SZ, 60, OP, [face, leftEye, rightEye, smileLayer]);
}

// ─── LETS GO (Rocket) ───────────────────────────────────────
function makeLetsGo() {
  const OP = 60, SZ = 40, cx = SZ / 2, cy = SZ / 2;

  // Rocket body (rounded rect)
  const body = layer(1, 'body', [grp(rc(10, 20, 5), fl(0.22, 0.47, 0.95), tr())], sks({
    p: { a: 0, k: [cx, cy, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 0,  s: [0, 0, 100],     e: [110, 110, 100], ...bounce3 },
      { t: 12, s: [110, 110, 100],  e: [100, 100, 100], ...easeInOut3 },
      { t: 20 }
    ], ix: 6 }
  }), OP);

  // Nose cone (triangle-ish via path)
  const nose = sh(
    [[0, -6], [-5, 2], [5, 2]],
    [[0, 0], [0, 0], [0, 0]],
    [[0, 0], [0, 0], [0, 0]],
    true
  );
  const noseLayer = layer(2, 'nose', [grp(nose, fl(0.93, 0.28, 0.22), tr())], sks({
    p: { a: 0, k: [cx, cy - 12, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 5,  s: [0, 0, 100],     e: [100, 100, 100], ...bounce3 },
      { t: 18 }
    ], ix: 6 }
  }), OP);

  // Window (small circle)
  const window = layer(3, 'window', [grp(el(5, 5), fl(0.85, 0.92, 1), tr())], sks({
    p: { a: 0, k: [cx, cy - 2, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 8,  s: [0, 0, 100], e: [100, 100, 100], ...easeOut3 },
      { t: 18 }
    ], ix: 6 }
  }), OP);

  // Flame (orange triangle at bottom)
  const flame = sh(
    [[0, 8], [-4, 0], [4, 0]],
    [[0, 0], [0, 0], [0, 0]],
    [[0, 0], [0, 0], [0, 0]],
    true
  );
  const flameLayer = layer(4, 'flame', [grp(flame, fl(1, 0.55, 0.1), tr())], sks({
    p: { a: 0, k: [cx, cy + 10, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 14, s: [80, 60, 100],  e: [100, 120, 100], ...easeInOut3 },
      { t: 30, s: [100, 120, 100], e: [70, 80, 100], ...easeInOut3 },
      { t: 45, s: [70, 80, 100],  e: [100, 110, 100], ...easeInOut3 },
      { t: OP }
    ], ix: 6 },
    o: { a: 1, k: [
      { t: 10, s: [0], e: [100], ...easeOut },
      { t: 18 }
    ], ix: 11 }
  }), OP);

  return L(SZ, SZ, 60, OP, [flameLayer, body, noseLayer, window]);
}

// ─── YOU GOT THIS (Star) ───────────────────────────────────
function makeYouGotThis() {
  const OP = 60, SZ = 40, cx = SZ / 2, cy = SZ / 2;

  const l = layer(1, 'star', [grp(star(5, 6, 13), fl(1, 0.78, 0.05), tr())], sks({
    p: { a: 0, k: [cx, cy, 0], ix: 2 },
    r: { a: 1, k: [
      { t: 0,  s: [-30], e: [0],  ...easeOut },
      { t: 15, s: [0],   e: [0],  ...easeInOut },
      { t: 35, s: [0],   e: [10], ...easeInOut },
      { t: 50, s: [10],  e: [0],  ...easeInOut },
      { t: OP }
    ], ix: 10 },
    s: { a: 1, k: [
      { t: 0,  s: [0, 0, 100],     e: [120, 120, 100], ...bounce3 },
      { t: 15, s: [120, 120, 100],  e: [95, 95, 100],   ...easeInOut3 },
      { t: 25, s: [95, 95, 100],    e: [105, 105, 100],  ...easeInOut3 },
      { t: 38, s: [105, 105, 100],  e: [100, 100, 100],  ...easeInOut3 },
      { t: OP }
    ], ix: 6 }
  }), OP);

  // Sparkle dots around the star
  const sparkleOffsets = [
    [cx - 14, cy - 10], [cx + 14, cy - 8],
    [cx - 12, cy + 12], [cx + 13, cy + 10],
  ];
  const sparkles = sparkleOffsets.map((pos, i) =>
    layer(i + 2, `sp${i}`, [grp(el(3, 3), fl(1, 0.85, 0.3), tr())], sks({
      p: { a: 0, k: [...pos, 0], ix: 2 },
      s: { a: 1, k: [
        { t: 12 + i * 4, s: [0, 0, 100],   e: [100, 100, 100], ...bounce3 },
        { t: 22 + i * 4, s: [100, 100, 100], e: [0, 0, 100],   ...easeInOut3 },
        { t: 35 + i * 4 }
      ], ix: 6 },
      o: { a: 1, k: [
        { t: 12 + i * 4, s: [0],   e: [100], ...easeOut },
        { t: 18 + i * 4, s: [100], e: [100], ...easeInOut },
        { t: 28 + i * 4, s: [100], e: [0],   ...easeInOut },
        { t: 35 + i * 4 }
      ], ix: 11 }
    }), OP)
  );

  return L(SZ, SZ, 60, OP, [l, ...sparkles]);
}

// ─── FIRE REACTION (Flame) ──────────────────────────────────
function makeFireReaction() {
  const OP = 60, SZ = 40, cx = SZ / 2, cy = SZ / 2;

  // Outer flame (orange)
  const outerFlame = sh(
    [[0, -12], [-8, 2], [-5, 10], [0, 7], [5, 10], [8, 2]],
    [[-3, -3], [-2, 4], [-2, 0], [2, 0], [2, 4], [3, -3]],
    [[3, -3], [0, 4], [2, 0], [-2, 0], [0, 4], [-3, -3]],
    true
  );
  const outer = layer(1, 'outer', [grp(outerFlame, fl(1, 0.45, 0.05), tr())], sks({
    p: { a: 0, k: [cx, cy + 2, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 0,  s: [0, 0, 100],     e: [105, 115, 100], ...bounce3 },
      { t: 12, s: [105, 115, 100],  e: [95, 100, 100],  ...easeInOut3 },
      { t: 24, s: [95, 100, 100],   e: [105, 110, 100], ...easeInOut3 },
      { t: 36, s: [105, 110, 100],  e: [98, 105, 100],  ...easeInOut3 },
      { t: 48, s: [98, 105, 100],   e: [102, 108, 100], ...easeInOut3 },
      { t: OP }
    ], ix: 6 }
  }), OP);

  // Inner flame (yellow)
  const innerFlame = sh(
    [[0, -6], [-4, 2], [-2, 8], [0, 6], [2, 8], [4, 2]],
    [[-2, -2], [-1, 3], [-1, 0], [1, 0], [1, 3], [2, -2]],
    [[2, -2], [0, 3], [1, 0], [-1, 0], [0, 3], [-2, -2]],
    true
  );
  const inner = layer(2, 'inner', [grp(innerFlame, fl(1, 0.82, 0.1), tr())], sks({
    p: { a: 0, k: [cx, cy + 4, 0], ix: 2 },
    s: { a: 1, k: [
      { t: 3,  s: [0, 0, 100],     e: [100, 110, 100], ...bounce3 },
      { t: 15, s: [100, 110, 100],  e: [90, 95, 100],   ...easeInOut3 },
      { t: 27, s: [90, 95, 100],    e: [110, 105, 100],  ...easeInOut3 },
      { t: 39, s: [110, 105, 100],  e: [95, 100, 100],   ...easeInOut3 },
      { t: 51, s: [95, 100, 100],   e: [105, 108, 100],  ...easeInOut3 },
      { t: OP }
    ], ix: 6 }
  }), OP);

  return L(SZ, SZ, 60, OP, [outer, inner]);
}

// ─── WRITE ALL FILES ────────────────────────────────────────
const baseDir = path.join(__dirname, '..', 'assets', 'lottie');
const reactDir = path.join(baseDir, 'reactions');

const files = {
  [path.join(baseDir, 'celebration-confetti.json')]: makeConfetti(),
  [path.join(reactDir, 'love-it.json')]:          makeLoveIt(),
  [path.join(reactDir, 'good-luck.json')]:        makeGoodLuck(),
  [path.join(reactDir, 'happy-for-you.json')]:    makeHappyForYou(),
  [path.join(reactDir, 'lets-go.json')]:          makeLetsGo(),
  [path.join(reactDir, 'you-got-this.json')]:     makeYouGotThis(),
  [path.join(reactDir, 'fire-reaction.json')]:    makeFireReaction(),
};

for (const [fp, data] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data));
  console.log(`✓ ${path.relative(path.join(__dirname, '..'), fp)}`);
}

console.log(`\nDone! Generated ${Object.keys(files).length} Lottie files.`);
