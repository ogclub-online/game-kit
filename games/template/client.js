// COIN DASH in the browser: what the player sees. The host (engine/host.js here, the town engine in OG Club World)
// gives it a ctx and calls these each frame; everything shown comes from the round's messages. Nothing here
// decides anything: the server does (a modified browser can't cheat).
//
// The module exports:
//   createClient(ctx) -> { open?, exit, isOpen, message, key, click, hover, ground, items, overlay, og?, err?, speed?, up? }
//   createMap(T, N)   -> { tiles, nodes }: the ground for this game (T: tile kinds, N: map size)
//   predictFree(x, y) (optional): where your own Pepe can stand, so the host moves you the moment you press a key
// ctx: $ (getElementById), el(tag, class, text), send(msg), snd.play(name), label(characterId), reduceMotion,
//      guest(), onClose(), shake(n), world { enter, players, move, where, set, shift, exit }
// Draw with P(x, y, z): map point (tiles; z pixels up) to canvas pixels. Pixel art: whole pixels, fillRect.
import { FIELD, ROUND, free } from './rules.js';
import { ENEMY_SPRITES } from '../../engine/sprites.js';
import { textArt } from '../../engine/text.js';
import { WATCHER } from '../../engine/world.js';

const now = () => performance.now();
const coins = (n) => `${n} COIN${n === 1 ? '' : 'S'}`;
export const predictFree = free;

export function createClient(ctx) {
  const { $, el, send, snd, label } = ctx;
  const R = { open: false, you: 0, host: 0, mode: 'solo', st: 'countdown', startsAt: 0, coins: [], bots: new Map(), score: 0, goal: 0, left: 0, me: null, floats: [], ended: null, again: false, asking: false };

  // ---------------------------------------------------------------- messages from the round
  function message(m) {
    switch (m.t) {
      case 'cdw': {
        R.open = true; R.you = m.you; R.host = m.host; R.mode = m.mode; R.st = m.st; R.startsAt = now() + m.startsIn; R.ended = null; R.again = false;
        $('cd').hidden = false; $('cd-card').hidden = true;
        ctx.world.enter({ players: m.r, you: m.you });
        state(m.s); panel();
        return true;
      }
      case 'cdroster': ctx.world.players(m.r); R.host = m.host; return true;
      case 'cdgo': R.st = 'running'; snd.play('start'); panel(); return true;
      case 'cds': R.st = m.st; state(m); for (const e of m.e ?? []) event(e); panel(); return true;
      case 'cdend': finish(m); return true;
      default: return false;
    }
  }
  function state(s) {
    ctx.world.move(s.p.map(([id, x, y, moving, facing]) => [id, x / 10, y / 10, moving, facing]));
    for (const [id, , , , , dizzy] of s.p) ctx.world.set(id, { ghost: !!dizzy });
    R.me = s.p.find((p) => p[0] === R.you) ?? null;
    R.coins = s.c.map(([id, x, y]) => ({ id, x: x / 10, y: y / 10 }));
    // Bots glide between updates (each keeps where it was and where it's going).
    const t = now();
    for (const [id, x, y] of s.b) { const b = R.bots.get(id) ?? { x: x / 10, y: y / 10 }; R.bots.set(id, { fx: b.x, fy: b.y, x: x / 10, y: y / 10, at: t }); }
    R.score = s.score; R.goal = s.goal; R.left = s.left;
  }
  function event(e) {
    const at = ctx.world.where(e[1]);
    if (e[0] === 'coin') { snd.play('gem', e[1] === R.you ? 4 : 0); if (at && e[1] === R.you) R.floats.push({ x: at[0], y: at[1], text: '+1', col: '#e3b341', born: now() }); }
    if (e[0] === 'dizzy') { if (e[1] === R.you) { snd.play('hurt'); ctx.shake?.(3); } if (at) R.floats.push({ x: at[0], y: at[1], text: 'DIZZY', col: '#ff8f6b', born: now() }); }
  }

  // ---------------------------------------------------------------- drawing
  function ground(g, P) {
    if (!R.open) return;
    // The field's edge.
    const [x0, y0, x1, y1] = FIELD;
    g.strokeStyle = 'rgba(227,179,65,.7)'; g.lineWidth = 2; g.beginPath();
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]) { const [sx, sy] = P(x, y); g.lineTo(sx, sy); }
    g.stroke();
  }
  function items(list, g, P, T) {
    if (!R.open) return;
    for (const c of R.coins) list.push({ d: c.x + c.y, draw: () => {
      const [sx, sy] = P(c.x, c.y, 6 + Math.sin(T * 4 + c.id) * 2), w = Math.abs(Math.sin(T * 3 + c.id)) * 4 + 1;
      g.fillStyle = '#8a6a10'; g.fillRect(Math.round(sx - w / 2) - 1, Math.round(sy) - 4, Math.round(w) + 2, 9);
      g.fillStyle = '#e3b341'; g.fillRect(Math.round(sx - w / 2), Math.round(sy) - 3, Math.round(w), 7);
    } });
    const t = now();
    for (const [id, b] of R.bots) {
      const f = Math.min(1, (t - b.at) / 100), x = b.fx + (b.x - b.fx) * f, y = b.fy + (b.y - b.fy) * f;
      list.push({ d: x + y, draw: () => {
        const spr = ENEMY_SPRITES.fud, [sx, sy] = P(x, y), img = spr.walk[Math.floor(t / 110 + id) & 3][b.x < b.fx ? 'left' : 'right'];
        g.drawImage(img, Math.round(sx - spr.w * 0.4), Math.round(sy - spr.h * 0.8 - 4), Math.round(spr.w * 0.8), Math.round(spr.h * 0.8));
      } });
    }
  }
  function overlay(g, P) {
    if (!R.open) return;
    const t = now();
    for (const f of R.floats) { const k = (t - f.born) / 900, [sx, sy] = P(f.x, f.y, 34 + k * 14), a = textArt(f.text, f.col); g.globalAlpha = Math.max(0, 1 - k); g.drawImage(a, Math.round(sx - a.width / 2), Math.round(sy)); g.globalAlpha = 1; }
    R.floats = R.floats.filter((f) => t - f.born < 900);
  }

  // ---------------------------------------------------------------- the panel (panel.html) and the end
  function panel() {
    const box = $('cd-top'); if (!box) return;
    box.replaceChildren();
    const bar = el('div', 'gt-castle'), fill = el('i'); fill.style.width = `${R.goal ? Math.min(100, (R.score / R.goal) * 100) : 0}%`; bar.append(fill);
    box.append(el('b', '', `${R.score} / ${R.goal} COINS`), el('span', 'gt-hp', R.st === 'countdown' ? `STARTS IN ${Math.max(0, Math.ceil((R.startsAt - now()) / 1000))}` : `${R.left}S LEFT`), bar);
    if (R.me) box.append(el('span', 'gt-time', `YOU: ${coins(R.me[6])}${R.me[5] ? ' · DIZZY!' : ''}`));
    $('cd-go').hidden = !(R.st === 'countdown' && R.mode === 'coop' && R.host === R.you);
  }
  function finish(m) {
    R.ended = m; R.st = 'ended';
    const box = $('cd-card'); box.replaceChildren();
    box.append(el('h3', '', m.won ? 'THE TEAM MADE IT!' : 'OUT OF TIME'), el('p', 'mg-sub', `${m.score} OF ${m.goal} COINS`));
    for (const [id, pepe, n, pay] of m.r) box.append(el('p', 'mg-sub', `${id === R.you ? 'YOU' : label(pepe)}: ${coins(n)} · +${pay} $SWARM`));
    const row = el('div', 'mg-actions'), a = el('button', 'btn', 'PLAY AGAIN'), b = el('button', 'btn ghost', 'BACK TO TOWN');
    a.type = b.type = 'button';
    a.addEventListener('click', () => { R.again = true; send({ t: 'arenaLeave' }); });
    b.addEventListener('click', () => send({ t: 'arenaLeave' }));
    row.append(a, b); box.append(row); box.hidden = false;
    snd.play(m.won ? 'win' : 'lose');
  }
  $('cd-go').addEventListener('click', () => send({ t: 'arenaGo' }));
  $('cd-quit').addEventListener('click', () => send({ t: 'arenaLeave' }));

  // ---------------------------------------------------------------- input and leaving
  function key(ev, down) {
    if (!R.open || !down) return false;
    if (ev.key === 'Enter' && R.st === 'countdown' && R.host === R.you) { send({ t: 'arenaGo' }); return true; }
    if (ev.key === 'Escape') { send({ t: 'arenaLeave' }); return true; }
    return false;
  }
  /** Back in town: tidy up, and say whether to start another (and which way). */
  function exit() {
    if (!R.open) return false;
    R.open = false; $('cd').hidden = true; ctx.world.exit(); ctx.onClose?.();
    return R.again ? R.mode : false;
  }
  return {
    exit, isOpen: () => R.open, message, key, click: () => false, hover: () => {}, ground, items, overlay,
    /** How fast your Pepe runs, and whether it can (dizzy: no), so the host can move you as you press keys. */
    speed: () => ROUND.SPEED, up: () => !R.me?.[5], state: R,
  };
}

/** The ground: grass inside the field, stone round the Watcher, sand round the edge, water, woods outside. */
export function createMap(T, N) {
  const [x0, y0, x1, y1] = FIELD, tiles = new Uint8Array(N * N), nodes = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const inside = x >= x0 && y >= y0 && x < x1 && y < y1, edge = x >= x0 - 2 && y >= y0 - 2 && x < x1 + 2 && y < y1 + 2, moat = x >= x0 - 4 && y >= y0 - 4 && x < x1 + 4 && y < y1 + 4;
    const nearWatcher = x >= WATCHER.x - 1 && y >= WATCHER.y - 1 && x <= WATCHER.x + 2 && y <= WATCHER.y + 2;
    tiles[y * N + x] = inside ? (nearWatcher ? (x >= WATCHER.x && y >= WATCHER.y && x <= WATCHER.x + 1 && y <= WATCHER.y + 1 ? T.WATCHER : T.PLAZA) : T.GRASS) : edge ? T.SAND : moat ? T.WATER : T.GRASS;
    if (!moat && (x * 13 + y * 7) % 11 === 0) nodes.set(`${x},${y}`, { kind: (x + y) % 5 ? 'tree' : 'rock', x, y, v: (x + y) % 4 });
  }
  return { tiles, nodes };
}
