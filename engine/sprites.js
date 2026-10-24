// Swarmpocalypse enemies, painted in code (the repo carries no image files):
// all original characters, archetypes rather than real people. Each one is
// built from simple shapes on a pixel grid, gets a dark outline and a soft
// light rim so it reads on dark ground, and comes in animation frames: a
// 4-step walk (or hover, or treads), plus an action pose where it has one
// (the shiller shouting, the rug puller running off with the rug, the FUD bot
// firing). Every frame has a mirrored copy and a white "hit" copy.

const OUT = '#0b0f1a';

/** A blank w x h pixel grid with a few drawing tools. */
function grid(w, h) {
  const c = new Array(w * h).fill(null);
  const g = {
    w, h, c,
    px(x, y, col) { x = Math.round(x); y = Math.round(y); if (col && x >= 0 && y >= 0 && x < w && y < h) c[y * w + x] = col; },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? c[y * w + x] : null; },
    rect(x, y, rw, rh, col) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) g.px(x + i, y + j, col); },
    /** Filled ellipse centred on (cx, cy). */
    ell(cx, cy, rx, ry, col) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35); if (dx * dx + dy * dy <= 1) g.px(x, y, col); } },
    line(x0, y0, x1, y1, col) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) g.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col); },
    /** Shade the lower-right part of everything of colour `col` with `dark` (cheap volume). */
    shadeRight(col, dark, from) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c[y * w + x] === col && (g.get(x + 1, y) !== col || x >= from)) c[y * w + x] = dark; },
  };
  return g;
}
/** Pixel text: a tiny 3x5 font for screens and signs. */
const FONT = { F: ['111', '100', '110', '100', '100'], U: ['101', '101', '101', '101', '111'], D: ['110', '101', '101', '101', '110'], $: ['011', '110', '010', '011', '110'], '!': ['1', '1', '1', '0', '1'] };
function word(g, text, x, y, col) { for (const ch of text) { const f = FONT[ch]; if (!f) { x += 2; continue; } f.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') g.px(x + i, y + j, col); })); x += f[0].length + 1; } }
/** Walking legs: two legs from the hips at (x, top), each `len` long, stepping by frame (0..3). */
function legs(g, x, top, len, f, pants, shoe, gap = 3, width = 2) {
  const step = [0, 1, 0, -1][f], lift = [0, 1, 0, 1][f];
  for (const [side, s] of [[0, step], [1, -step]]) {
    const lx = x + side * gap + s, l = len - (side === (f === 1 ? 0 : 1) ? lift : 0);
    g.rect(lx, top, width, l, pants);
    g.rect(lx - (side ? 0 : 0), top + l, width + 1, 1, shoe);
  }
}

/** Dark outline round the figure (and anywhere it's marked with 'O'). */
function outline(g, col = OUT, pattern = null) {
  const add = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (g.get(x, y)) continue;
    if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) add.push([x, y]);
  }
  for (const [x, y] of add) g.px(x, y, pattern ? pattern(x, y) : col);
}

// ---------------------------------------------------------------- the cast
const C = {
  skin: '#f2c79b', skinD: '#d9a77a', white: '#ffffff', black: '#151821',
  purple: '#8a4fd8', purpleD: '#5f2fa8', purpleL: '#a873f0', gold: '#ffd25e', goldD: '#d9a43a',
  cyan: '#6fd3ff', cyanD: '#2f9fd6', cyanL: '#c8f1ff',
  red: '#ff4d3d', redD: '#a8382a', grey: '#9aa4b4', greyD: '#626b7b', greyL: '#c8d0dc', dark: '#2b2f3a',
  brown: '#8a5f35', brownD: '#553820', brownL: '#a97a49', rug1: '#c0392b', rug2: '#f0dfb0', rug3: '#2f6fb0',
  pink: '#ff7eb6', pinkD: '#d94f8f', pinkL: '#ffc2dc', light: '#fff4c2', cloak: '#2a1f3d', cloakL: '#43325f', ember: '#ff3b30',
  green: '#7fd17f', greenD: '#3f9a4a',
};

/** The Paid Shiller: purple suit, slick hair, shades and a big grin, shouting through a megaphone. */
function shiller(f, act) {
  const g = grid(30, 28), cx = 9;
  // Legs and suit.
  legs(g, cx - 3, 20, 6, f, C.purpleD, C.black);
  g.rect(cx - 5, 11, 10, 10, C.purple); g.rect(cx - 4, 21, 8, 1, C.purpleD);
  g.shadeRight(C.purple, C.purpleD, cx + 3);
  // Shirt, gold tie and a $ pin.
  g.rect(cx - 1, 11, 3, 5, C.white); g.rect(cx, 12, 1, 5, C.gold); g.px(cx, 17, C.goldD);
  g.px(cx - 4, 13, C.gold);
  // Back arm, and the arm holding the megaphone up to the mouth.
  g.rect(cx - 7, 12, 2, 7, C.purpleD); g.rect(cx - 7, 19, 2, 1, C.skin);
  const up = act ? -1 : 0;
  g.rect(cx + 4, 12 + up, 6, 2, C.purple); g.rect(cx + 9, 10 + up, 2, 3, C.skin);
  // Head: slicked hair with a shine, shades, a toothy grin.
  g.ell(cx, 6, 4.5, 5, C.skin); g.rect(cx - 4, 9, 9, 2, C.skinD);
  g.ell(cx, 2.6, 4.8, 2.6, C.black); g.rect(cx - 5, 3, 2, 3, C.black); g.px(cx - 2, 1, '#5a6b8a'); g.px(cx - 1, 1, '#5a6b8a');
  g.rect(cx - 3, 5, 7, 2, C.black); g.px(cx - 2, 5, '#7d8aa6'); g.px(cx + 2, 5, '#7d8aa6');
  g.rect(cx - 2, 8, 5, 2, C.white); g.px(cx - 2, 9, C.redD); g.px(cx + 2, 9, C.redD);
  // Megaphone: a yellow cone opening to the right.
  const my = 7 + up;
  g.rect(cx + 6, my + 1, 3, 3, C.gold);
  for (let i = 0; i < 6; i++) g.rect(cx + 9 + i, my + 1 - Math.floor(i / 2), 1, 3 + Math.floor(i / 2) * 2, i > 3 ? C.goldD : C.gold);
  g.rect(cx + 15, my - 2, 1, 9, act ? C.white : C.goldD);
  if (act) for (const [x, y] of [[cx + 17, my - 3], [cx + 18, my + 2], [cx + 17, my + 7]]) { g.px(x, y, C.white); g.px(x + 1, y, C.white); }
  outline(g);
  return g;
}

/** The Copy-Paste Clone: a cyan figure with a copy icon on its chest and a dashed selection outline. */
function clone(f, act, small = false) {
  const g = grid(small ? 14 : 20, small ? 16 : 24), s = small ? 0.6 : 1, cx = g.w / 2 - 0.5;
  const top = small ? 1 : 1;
  legs(g, Math.round(cx - 2 * s - 0.5), Math.round(top + 16 * s), Math.round(5 * s + 0.5), f, C.cyanD, C.cyanD, small ? 2 : 3, small ? 1 : 2);
  g.ell(cx, top + 11 * s, 5 * s, 5.5 * s, C.cyan);
  g.ell(cx, top + 4.5 * s, 4.2 * s, 4 * s, C.cyan);
  g.shadeRight(C.cyan, C.cyanD, Math.round(cx + 3 * s));
  g.px(cx - 2 * s, top + 2 * s, C.cyanL); g.px(cx - 1 * s, top + 2 * s, C.cyanL);
  // Eyes (blank white) and the copy icon: two overlapping squares.
  g.rect(Math.round(cx - 2 * s), Math.round(top + 4 * s), small ? 1 : 2, small ? 1 : 2, C.white); g.rect(Math.round(cx + 1 * s), Math.round(top + 4 * s), small ? 1 : 2, small ? 1 : 2, C.white);
  if (!small) {
    const ix = Math.round(cx - 3), iy = top + 9;
    for (let i = 0; i < 4; i++) { g.px(ix + i, iy, C.white); g.px(ix + i, iy + 3, C.white); g.px(ix, iy + i, C.white); g.px(ix + 3, iy + i, C.white); }
    for (let i = 0; i < 4; i++) { g.px(ix + 2 + i, iy + 2, C.white); g.px(ix + 2 + i, iy + 5, C.white); g.px(ix + 2, iy + 2 + i, C.white); g.px(ix + 5, iy + 2 + i, C.white); }
  } else g.rect(Math.round(cx - 1), top + 7, 2, 2, C.white);
  // Marching-ants outline, moving with the frame.
  outline(g, OUT, (x, y) => ((x + y + f * 2) % 4 < 2 ? '#ffffff' : OUT));
  return g;
}

/** The FUD Bot: a hovering monitor with a crashing chart on its screen, a blinking antenna and a little thruster. */
function fud(f, act) {
  const g = grid(22, 26), cx = 11;
  // Antenna.
  g.line(cx, 1, cx, 4, C.greyD); g.rect(cx - 1, 0, 3, 2, f % 2 ? C.red : C.redD);
  // Monitor body with a bezel.
  g.rect(cx - 9, 4, 18, 14, C.grey); g.rect(cx - 9, 16, 18, 2, C.greyD); g.rect(cx + 7, 4, 2, 14, C.greyD);
  g.rect(cx - 8, 4, 15, 1, C.greyL);
  g.rect(cx - 7, 6, 14, 9, '#2a0b0b');
  if (act) { g.rect(cx - 7, 6, 14, 9, '#ff6a5a'); word(g, 'FUD', cx - 5, 8, C.white); }
  else {
    // A chart going one way: down.
    const pts = [[-6, 7], [-4, 8], [-3, 7], [-1, 10], [1, 9], [3, 12], [5, 13], [6, 14]];
    for (let i = 1; i < pts.length; i++) g.line(cx + pts[i - 1][0], pts[i - 1][1], cx + pts[i][0], pts[i][1], C.red);
    g.px(cx + 5, 14, '#ffb0a8'); g.px(cx + 6, 13, '#ffb0a8');
    if (f % 2) word(g, '!', cx + 5, 6, '#ffb0a8');
  }
  // Little claw arms.
  g.rect(cx - 12, 10, 3, 2, C.greyD); g.rect(cx - 12, 12, 1, 2, C.greyD);
  g.rect(cx + 9, 10, 3, 2, C.greyD); g.rect(cx + 11, 12, 1, 2, C.greyD);
  // Neck and thruster with a flickering flame.
  g.rect(cx - 2, 18, 4, 2, C.greyD); g.rect(cx - 3, 20, 6, 1, C.dark);
  const fl = [3, 4, 2, 4][f];
  for (let i = 0; i < fl; i++) g.rect(cx - 2 + Math.floor(i / 2), 21 + i, 4 - Math.floor(i / 2) * 2, 1, i === 0 ? C.light : i < 2 ? C.gold : '#ff8a3d');
  outline(g);
  return g;
}

/** The Rug Puller: a hooded thief in a bandit mask, a striped rug rolled over the shoulder (unrolled and flapping when it dashes). */
function rug(f, act) {
  const g = grid(30, 28), cx = act ? 15 : 12;
  const lean = act ? 2 : 0;
  // The rug pulled out behind when running (rolled, it's drawn over the shoulder below).
  if (act) {
    const wave = [0, 1, 0, -1][f];
    for (let i = 0; i < 12; i++) {
      const x = cx - 6 - i, y = 9 + Math.round(Math.sin((i + f) * 0.8) * 1.2) + wave * (i > 6 ? 1 : 0);
      const col = i % 4 === 0 ? C.rug3 : i % 2 ? C.rug2 : C.rug1;
      g.rect(x, y, 1, 8, col);
      if (i === 11) { g.px(x - 1, y + 1, C.rug2); g.px(x - 1, y + 4, C.rug2); g.px(x - 1, y + 7, C.rug2); }
    }
  }
  // Legs, body, hood.
  legs(g, cx - 3 + lean, 20, 6, f, C.brownD, C.black);
  g.rect(cx - 5 + lean, 11, 10, 10, C.brown); g.shadeRight(C.brown, C.brownD, cx + 3 + lean);
  g.rect(cx - 5 + lean, 17, 10, 1, C.brownD);
  g.ell(cx + lean + (act ? 1 : 0), 6, 5, 5.5, C.brown); g.px(cx - 4 + lean, 1, C.brownL); g.px(cx - 3 + lean, 1, C.brownL);
  // Face in the hood's shadow, a bandit mask and sly yellow eyes.
  const fx = cx + lean + (act ? 1 : 0);
  g.ell(fx + 1, 6.5, 3, 3, C.skinD);
  g.rect(fx - 2, 5, 7, 2, C.black); g.px(fx - 1, 5, C.gold); g.px(fx + 2, 5, C.gold);
  g.rect(fx - 1, 8, 4, 1, C.brownD);
  // Arm: gripping the rug (or pumping while running); walking, the rolled rug lies across the back and over the shoulder.
  if (act) { g.rect(cx - 7 + lean, 12, 3, 2, C.brownD); g.rect(cx - 8 + lean, 11, 2, 3, C.skin); }
  else {
    const bob = f % 2;
    for (let i = 0; i < 15; i++) { const x = cx - 9 + i, y = 21 - Math.floor(i * 0.55) + bob; g.rect(x, y - 2, 1, 5, i % 4 === 0 ? C.rug3 : i % 2 ? C.rug2 : C.rug1); }
    g.ell(cx + 6, 13 + bob, 2, 2.5, C.rug2); g.px(cx + 6, 13 + bob, C.rug1); g.px(cx + 7, 12 + bob, C.rug1);
    for (const y of [19, 21, 23]) g.px(cx - 10, y + bob, C.rug2);
    g.rect(cx + 2, 14 + bob, 3, 2, C.skin);
  }
  outline(g);
  return g;
}

/** The Extractor: a vacuum robot on treads, sucking value into a glass tank through a big hose. */
function extractor(f, act) {
  const g = grid(30, 26), cx = 11;
  // Treads.
  g.rect(cx - 9, 21, 18, 4, C.dark);
  for (let i = 0; i < 6; i++) g.rect(cx - 8 + ((i * 3 + f) % 17), 22, 1, 2, C.greyD);
  g.rect(cx - 8, 21, 16, 1, '#3d4250');
  // Body with a glass tank of green goo (bubbles rise by frame).
  g.rect(cx - 8, 10, 16, 11, C.grey); g.rect(cx + 5, 10, 3, 11, C.greyD); g.rect(cx - 7, 10, 12, 1, C.greyL);
  g.rect(cx - 6, 12, 8, 7, '#1d3324'); g.rect(cx - 6, 15 - (act ? 1 : 0), 8, 4 + (act ? 1 : 0), C.green);
  g.rect(cx - 6, 15 - (act ? 1 : 0), 8, 1, '#b8f0b8');
  for (const [bx, by] of [[1, 3], [4, 1], [6, 2]]) g.px(cx - 6 + bx, 13 + ((by + 3 - f) % 4) + 2, '#d8ffd8');
  word(g, '$', cx + 3, 13, C.gold);
  // Dome head with a red scanning visor.
  g.ell(cx - 1, 7, 6, 4, C.greyL); g.rect(cx - 7, 8, 13, 2, C.grey);
  g.rect(cx - 5, 6, 9, 2, C.dark);
  const scan = [0, 2, 4, 2][f];
  g.rect(cx - 5 + scan, 6, 3, 2, C.ember); g.px(cx - 4 + scan, 6, '#ffb0a8');
  g.line(cx + 3, 3, cx + 5, 1, C.greyD); g.px(cx + 5, 0, C.ember);
  // The hose: out of the back, over the top and down to a nozzle in front.
  const hose = [[cx + 8, 12], [cx + 10, 10], [cx + 12, 9], [cx + 14, 9], [cx + 16, 10], [cx + 17, 12], [cx + 18, 14], [cx + 18, 16]];
  for (let i = 1; i < hose.length; i++) { g.line(hose[i - 1][0], hose[i - 1][1], hose[i][0], hose[i][1], C.greyD); g.line(hose[i - 1][0], hose[i - 1][1] + 1, hose[i][0], hose[i][1] + 1, C.dark); }
  g.rect(cx + 16, 17, 5, 3, C.grey); g.rect(cx + 15, 20, 7, 1, C.greyD);
  if (act || f % 2) for (const [x, y] of [[cx + 22, 18], [cx + 24, 17], [cx + 23, 20]]) g.px(x + (f % 2), y, C.green);
  outline(g);
  return g;
}

/** The Bad Influencer (boss): ring light behind, big pink hair, selfie stick out, sparkle and pout. */
function influencer(f, act) {
  const g = grid(44, 46), cx = 20;
  // Ring light.
  for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; for (const r of [15, 16]) g.px(cx + Math.cos(t) * r, 17 + Math.sin(t) * r, a % 8 === f * 2 ? C.white : C.light); }
  // Legs in boots, a pink outfit.
  legs(g, cx - 4, 33, 9, f, C.pinkD, C.white, 5, 3);
  g.ell(cx, 27, 8, 7, C.pink); g.rect(cx - 8, 28, 16, 5, C.pink); g.shadeRight(C.pink, C.pinkD, cx + 5);
  g.rect(cx - 6, 21, 12, 3, C.white); word(g, '!', cx - 1, 25, C.white);
  // Big pink hair, face, heart shades, glossy lips.
  g.ell(cx, 12, 9, 9, C.pinkD); g.ell(cx - 1, 9, 8, 6, C.pink); g.rect(cx - 9, 13, 3, 9, C.pinkD); g.rect(cx + 7, 13, 3, 9, C.pinkD);
  g.ell(cx, 14, 5.5, 6, C.skin); g.rect(cx - 5, 18, 11, 2, C.skinD);
  for (const ox of [-3, 2]) { g.rect(cx + ox - 1, 12, 3, 2, C.pinkD); g.px(cx + ox, 14, C.pinkD); g.px(cx + ox - 1, 12, C.pinkL); }
  g.rect(cx - 1, 17, 3, 1, '#e8335f'); g.px(cx, 18, '#e8335f');
  g.px(cx - 3, 6, C.pinkL); g.px(cx - 2, 5, C.pinkL); g.px(cx - 1, 5, C.pinkL);
  // Arm out with a selfie stick and a glowing phone.
  g.rect(cx + 7, 23, 6, 2, C.pink); g.rect(cx + 12, 22, 2, 2, C.skin);
  g.line(cx + 13, 22, cx + 20, 12, C.dark);
  g.rect(cx + 19, 7, 5, 8, C.dark); g.rect(cx + 20, 8, 3, 6, act || f % 2 ? C.white : C.cyanL);
  outline(g);
  // Sparkles.
  for (const [x, y, on] of [[cx - 13, 6, f < 2], [cx + 11, 2, f >= 2], [cx - 15, 27, f % 2]]) if (on) { g.px(x, y, C.white); g.px(x - 1, y, C.light); g.px(x + 1, y, C.light); g.px(x, y - 1, C.light); g.px(x, y + 1, C.light); }
  return g;
}

/** The Negative KOL (boss): a towering cloaked figure with a gold crown, ember eyes and a crashing-arrow emblem. */
function kol(f, act) {
  const g = grid(46, 50), cx = 23;
  const sway = [0, 1, 0, -1][f];
  // Cloak, flaring at the hem.
  for (let y = 14; y < 46; y++) { const half = 8 + Math.floor((y - 14) * 0.42); g.rect(cx - half + (y > 38 ? sway : 0), y, half * 2, 1, y % 7 === 0 && y > 20 ? C.cloakL : C.cloak); }
  g.shadeRight(C.cloak, '#1a1428', cx + 9);
  // Hem tatters, swaying.
  for (let i = 0; i < 9; i++) if ((i + f) % 2) g.rect(cx - 21 + i * 5 + sway, 46, 2, 2, C.cloak);
  // Gold trim down the front and shoulders.
  g.line(cx - 8, 15, cx - 3, 44, C.gold); g.line(cx + 7, 15, cx + 2, 44, C.gold);
  g.rect(cx - 12, 14, 24, 2, C.goldD);
  // The emblem: a red arrow crashing down.
  g.ell(cx, 27, 5, 5, '#3a1010');
  g.rect(cx - 1, 23, 3, 6, C.ember); for (let i = 0; i < 4; i++) g.rect(cx - 3 + i, 29 + i, 7 - i * 2, 1, C.ember);
  // Hood with a face lost in shadow and two burning eyes.
  g.ell(cx, 9, 8, 8, C.cloakL); g.ell(cx, 10, 5.5, 6, '#0d0a14');
  const glow = act || f % 2 ? '#ff8a7a' : C.ember;
  g.rect(cx - 3, 9, 2, 2, glow); g.rect(cx + 2, 9, 2, 2, glow);
  // Crown with gems.
  g.rect(cx - 6, 1, 13, 3, C.gold); for (const x of [-6, -3, 0, 3, 6]) g.rect(cx + x, -1 + (x === 0 ? 0 : 1), 1, 2, C.gold);
  g.px(cx - 3, 2, C.ember); g.px(cx, 2, C.cyan); g.px(cx + 3, 2, C.ember);
  // Clawed hands out of the sleeves.
  g.rect(cx - 17, 30, 4, 3, '#c9b8e0'); g.rect(cx + 13, 30, 4, 3, '#c9b8e0');
  outline(g);
  return g;
}

// ---------------------------------------------------------------- frames
/** Paint a grid onto a canvas, with a faint light rim just outside the outline so it reads on dark ground. */
function paint(gr, flip, white, rim) {
  const { w, h } = gr;
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const x = c.getContext('2d');
  const solid = (i, j) => gr.get(i, j) !== null;
  if (!white) {
    x.fillStyle = rim;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      if (solid(i, j)) continue;
      if (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1)) x.fillRect((flip ? w - 1 - i : i) + 1, j + 1, 1, 1);
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const col = gr.get(i, j); if (!col) continue;
    x.fillStyle = white ? (col === OUT ? '#ffd9d2' : '#ffffff') : col;
    x.fillRect((flip ? w - 1 - i : i) + 1, j + 1, 1, 1);
  }
  return c;
}
const frame = (gr, rim) => ({ right: paint(gr, false, false, rim), left: paint(gr, true, false, rim), flash: paint(gr, false, true, rim) });

/** kind -> painter, its rim light, whether it hovers, and its anchor (the pixel column it stands on, from the left). */
const CAST = {
  shiller: { make: shiller, rim: 'rgba(200,160,255,.45)' },
  clone: { make: (f, a) => clone(f, a), rim: 'rgba(160,230,255,.4)' },
  mini: { make: (f, a) => clone(f, a, true), rim: 'rgba(160,230,255,.4)' },
  fud: { make: fud, rim: 'rgba(255,140,120,.45)', hover: true },
  rug: { make: rug, rim: 'rgba(255,220,170,.4)' },
  extractor: { make: extractor, rim: 'rgba(200,255,200,.35)' },
  influencer: { make: influencer, rim: 'rgba(255,190,220,.5)' },
  kol: { make: kol, rim: 'rgba(255,90,70,.45)' },
};

/**
 * kind -> { walk: [4 frames], act: [4 frames], w, h, hover, right, left, flash }:
 * each frame { right, left, flash } (canvases w x h). `right`/`left`/`flash`
 * at the top level are the first walk frame (for still pictures).
 */
export const ENEMY_SPRITES = Object.fromEntries(Object.entries(CAST).map(([k, def]) => {
  const walk = [0, 1, 2, 3].map((f) => frame(def.make(f, false), def.rim));
  const act = [0, 1, 2, 3].map((f) => frame(def.make(f, true), def.rim));
  const w = walk[0].right.width, h = walk[0].right.height;
  return [k, { walk, act, w, h, hover: !!def.hover, ...walk[0] }];
}));

/** Colour of an enemy's death puff. */
export const ENEMY_COLORS = { shiller: '#8a4fd8', clone: '#6fd3ff', mini: '#6fd3ff', fud: '#ef6b55', rug: '#c0392b', extractor: '#7fd17f', influencer: '#ff7eb6', kol: '#ff3b30' };
/** What a Paid Shiller shouts now and then, as little speech bubbles (3x5 pixel letters). */
export const SHILLS = ['BUY!', '100X', 'WAGMI', 'NFA', 'LFG', 'MOON'];
const LETTERS = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], F: ['111', '100', '110', '100', '100'], G: ['011', '100', '101', '101', '011'],
  I: ['111', '010', '010', '010', '111'], L: ['100', '100', '100', '100', '111'], M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['010', '101', '101', '101', '010'], U: ['101', '101', '101', '101', '111'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], 0: ['010', '101', '101', '101', '010'], 1: ['010', '110', '010', '010', '111'], '!': ['1', '1', '1', '0', '1'],
};
export const SHILL_BUBBLES = SHILLS.map((text) => {
  const glyphs = [...text].map((ch) => LETTERS[ch]), tw = glyphs.reduce((n, gl) => n + gl[0].length + 1, -1);
  const w = tw + 6, h = 11, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = OUT; x.fillRect(1, 0, w - 2, 9); x.fillRect(0, 1, w, 7); x.fillRect(3, 9, 3, 1); x.fillRect(3, 10, 1, 1);
  x.fillStyle = '#ffffff'; x.fillRect(2, 1, w - 4, 7); x.fillRect(1, 2, w - 2, 5); x.fillRect(4, 8, 1, 1);
  x.fillStyle = '#5f2fa8';
  let cx = 3;
  for (const gl of glyphs) { gl.forEach((r, j) => [...r].forEach((bit, i) => { if (bit === '1') x.fillRect(cx + i, 2 + j, 1, 1); })); cx += gl[0].length + 1; }
  return c;
});
