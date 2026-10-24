// The browser host: a stand-in for the OG Club World's town engine, enough to play a game made with this kit the
// way players will. It loads a game (games/<id>/), runs its round locally (engine/local.js, optionally with lag
// and bots), draws the town-sized map in the world's isometric view with everyone's Pepe on it, and hands the
// game's browser module the same things the world does:
//
//   ctx  { $, el, send, snd, label, reduceMotion, guest, onClose, shake, world }
//   each frame: ground(g, P, T) under everything, items(list, g, P, T) depth-sorted with Pepes and trees,
//   overlay(g, P, T) on top; clicks on the map: click(tile) (false: walk there), hover(tile), key(ev, down)
//
// P(x, y, z) turns a map point (tiles, z in pixels up) into a point on the canvas: tile (x, y)'s top corner is
// P(x, y); a tile is 32 pixels wide and 16 tall. Draw in those pixels; the canvas is scaled up for you.
import { N, T, WATCHER } from './world.js';
import { LocalServer } from './local.js';
import { glide, camStep, predict } from './motion.js';
import { createSound } from './sound.js';
import { textArt } from './text.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const label = (id) => '#' + String(id).padStart(4, '0');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const COLORS = ['#c9db4c', '#7ad7ff', '#ffb070', '#c6a8ff', '#ff7eb6', '#7dff8a', '#ffe066', '#ff8f6b'];
const TILE_COLORS = {
  [T.GRASS]: ['#3d7a37', '#437f3c'], [T.PATH]: ['#7e7a70', '#86827a'], [T.WATER]: ['#25557f', '#2a5c88'], [T.PLOT]: ['#4a6b3a', '#4f703f'],
  [T.SAND]: ['#c4a46a', '#cbab72'], [T.FOUNTAIN]: ['#3a76a8', '#3f7cae'], [T.PLAZA]: ['#8e98a3', '#959fab'], [T.WATCHER]: ['#5b6577', '#606a7c'],
  [T.ASH]: ['#4a4440', '#4f4945'], [T.CLUB]: ['#6b4a3a', '#705040'], [T.VOID]: ['#0b0f1a', '#0b0f1a'], [T.DOCK]: ['#7a5532', '#805a36'],
};

const S = {
  game: null, manifest: null, client: null, server: null, me: null, meId: 0, players: new Map(), d: null, ground: null,
  cam: { x: 32, y: 32 }, zoom: Number(params.get('zoom')) || 2, t: 0, shake: 0, keys: new Set(), dirNow: [0, 0], sentDir: '0,0', hover: null, bots: [],
};
const snd = createSound();
const canvas = $('view'), g = canvas.getContext('2d');

// ---------------------------------------------------------------- the world module a game talks to
/** What the game's browser module uses to put Pepes on the map (the same calls the town engine has). */
function world() {
  return {
    enter({ players, you }) {
      S.meId = you; S.players = new Map(); this.players(players);
      document.body.classList.add('in-game');
    },
    players(list) {
      const ids = new Set(list.map(([id]) => id));
      for (const id of [...S.players.keys()]) if (!ids.has(id)) S.players.delete(id);
      list.forEach(([id, pepe], i) => { if (!S.players.has(id)) S.players.set(id, { id, pepeId: pepe, x: 32, y: 32, tx: 32, ty: 32, facing: 1, moving: false, fresh: true, color: COLORS[i % COLORS.length] }); });
      S.me = S.players.get(S.meId) ?? null;
    },
    move(list) {
      for (const [id, x, y, moving, facing] of list) {
        const p = S.players.get(id); if (!p) continue;
        if (p.fresh) { p.x = x; p.y = y; p.fresh = false; if (p === S.me) S.cam = { x, y }; }
        p.tx = x; p.ty = y; p.moving = !!moving; p.srvMoving = !!moving; if (facing) p.facing = facing;
      }
    },
    stones() {},
    where(id) { const p = S.players.get(id); return p ? [p.x, p.y] : null; },
    set(id, props) { const p = S.players.get(id); if (p) Object.assign(p, props); },
    shift(id, dx, dy) { const p = S.players.get(id); if (!p) return; p.x += dx; p.y += dy; p.gx = p.tx; p.gy = p.ty; if (p === S.me) { S.cam.x += dx; S.cam.y += dy; } },
    exit() { document.body.classList.remove('in-game'); },
  };
}

// ---------------------------------------------------------------- loading a game, starting rounds
async function load(id) {
  const base = `../games/${id}/`;
  S.manifest = await (await fetch(base + 'game.json')).json();
  const [{ Round }, mod] = await Promise.all([import(base + 'round.js'), import(base + 'client.js')]);
  S.Round = Round;
  $('hud').insertAdjacentHTML('beforeend', await (await fetch(base + (S.manifest.panel ?? 'panel.html'))).text());
  if (S.manifest.style) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + S.manifest.style; document.head.append(css); }
  S.mod = mod;
  S.d = mod.createMap(T, N);
  S.ground = null;
  S.client = mod.createClient({ $, el, send, snd, label, reduceMotion, guest: () => false, onClose: onClosed, shake: (n) => { S.shake = Math.max(S.shake, n); }, world: world() });
  document.title = `${S.manifest.name} · OG CLUB GAME KIT`;
  $('kit-title').textContent = S.manifest.name;
}
function start() {
  const mode = $('kit-mode').value, bots = Number($('kit-bots').value), lag = Number($('kit-lag').value);
  $('kit-start').hidden = true;
  S.server = new LocalServer(S.Round, {
    mode, lag,
    onSend: (id, msg) => { if (id === S.myServerId) receive(msg); },
    onRecord: (r) => console.info('[kit] round recorded', r),
    onOver: () => { const again = S.client.exit(); if (again) setTimeout(start, 100); },
  });
  S.myServerId = S.server.nextId; // the next player made is you (its welcome comes as it's made)
  S.server.open(11);
  S.bots = [];
  if (mode === 'coop') for (let i = 0; i < bots; i++) { const b = S.server.join(20 + i); if (b) S.bots.push({ id: b.id, next: 0 }); }
  S.server.start();
}
/** Back to the start screen (left, or the results are over). */
function onClosed() { S.server?.stop(); S.server = null; $('kit-start').hidden = false; }
function send(msg) {
  if (!S.server) return;
  if (msg.t === 'arenaLeave') { S.server.message(S.myServerId, msg); setTimeout(() => { const again = S.client.exit(); if (again) start(); }, S.server?.lag ?? 0); return; }
  S.server.message(S.myServerId, msg);
}
function receive(msg) {
  if (msg.t === 'pong') { S.client.pong?.(); return; }
  if (msg.t === 'err') { if (!S.client.err?.(String(msg.code).replace(/^[A-Z]+_/, ''))) toast(msg.code); return; }
  if (!S.client.message(msg)) console.warn('[kit] the game did not handle', msg.t);
}
function toast(text) { const t = $('kit-toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2000); }

// ---------------------------------------------------------------- drawing
function view() {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const z = S.zoom * dpr, sh = S.shake > 0 && !reduceMotion ? (Math.random() - 0.5) * S.shake : 0;
  const ox = Math.round(canvas.width / z / 2 - (S.cam.x - S.cam.y) * 16 + sh), oy = Math.round(canvas.height / z / 2 - (S.cam.x + S.cam.y) * 8 + sh);
  return { z, ox, oy, P: (x, y, zz = 0) => [ox + (x - y) * 16, oy + (x + y) * 8 - zz] };
}
/** The map's ground, drawn once into its own canvas. */
function groundCanvas() {
  const c = document.createElement('canvas'); c.width = N * 32 + 32; c.height = N * 16 + 16;
  const cg = c.getContext('2d'), tiles = S.d.tiles;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const kind = tiles[y * N + x], cols = TILE_COLORS[kind] ?? TILE_COLORS[T.GRASS], hx = (x - y) * 16 + N * 16, hy = (x + y) * 8;
    cg.fillStyle = cols[(x * 7 + y * 13) % 5 === 0 ? 1 : 0];
    cg.beginPath(); cg.moveTo(hx, hy); cg.lineTo(hx + 16, hy + 8); cg.lineTo(hx, hy + 16); cg.lineTo(hx - 16, hy + 8); cg.closePath(); cg.fill();
    if (kind === T.GRASS && (x * 31 + y * 17) % 9 === 0) { cg.fillStyle = '#5a9a4c'; cg.fillRect(hx - 2, hy + 7, 1, 2); cg.fillRect(hx + 3, hy + 9, 1, 2); }
    if (kind === T.WATER && (x * 5 + y * 11) % 7 === 0) { cg.fillStyle = '#3f78a8'; cg.fillRect(hx - 4, hy + 8, 6, 1); }
  }
  return c;
}
function drawTree(P, n) {
  const [x, y] = P(n.x + 0.5, n.y + 0.5);
  if (n.kind === 'rock') { g.fillStyle = '#6b7380'; g.fillRect(x - 6, y - 6, 12, 7); g.fillStyle = '#8a93a0'; g.fillRect(x - 5, y - 7, 8, 3); return; }
  g.fillStyle = '#5a3a22'; g.fillRect(x - 1, y - 10, 3, 10);
  g.fillStyle = n.v % 2 ? '#2f6b34' : '#3a7a3a'; g.fillRect(x - 7, y - 24, 15, 14); g.fillRect(x - 5, y - 28, 11, 4);
  g.fillStyle = '#4c9246'; g.fillRect(x - 5, y - 23, 5, 4);
}
/** The Swarm Watcher: a tall dark tower with a lime cap on its 2 by 2 tiles. */
function drawWatcher(P) {
  const { x, y } = WATCHER, x1 = x + 2, y1 = y + 2, h = 52;
  const q = (pts, col) => { g.fillStyle = col; g.beginPath(); for (const [a, b, c] of pts) { const [sx, sy] = P(a, b, c); g.lineTo(sx, sy); } g.closePath(); g.fill(); };
  const box = (x0, y0, xa, ya, z0, hh, top, l, r) => { q([[x0, ya, z0], [xa, ya, z0], [xa, ya, z0 + hh], [x0, ya, z0 + hh]], l); q([[xa, y0, z0], [xa, ya, z0], [xa, ya, z0 + hh], [xa, y0, z0 + hh]], r); q([[x0, y0, z0 + hh], [xa, y0, z0 + hh], [xa, ya, z0 + hh], [x0, ya, z0 + hh]], top); };
  box(x + 0.05, y + 0.05, x1 - 0.05, y1 - 0.05, 0, 6, '#b6c0cd', '#7d8796', '#9aa5b5');
  box(x + 0.45, y + 0.45, x1 - 0.45, y1 - 0.45, 6, h, '#1b2a44', '#0b1220', '#132036');
  box(x + 0.35, y + 0.35, x1 - 0.35, y1 - 0.35, 6 + h, 5, '#c9db4c', '#8a9a24', '#a8b838');
  for (let i = 0; i < 6; i++) { const [sx, sy] = P(x + 0.6, y1 - 0.45, 14 + i * 7); g.fillStyle = i % 2 ? '#c9db4c' : '#3a475c'; g.fillRect(Math.round(sx), Math.round(sy), 6, 2); }
}
/** Everyone's Pepe: a little frog in their colour (the world draws each player's own Pepe art). */
function drawPepe(P, p) {
  const [sx, sy] = P(p.x, p.y), x = Math.round(sx), y = Math.round(sy), bob = p.moving && !reduceMotion ? Math.floor(S.t * 10) % 2 : 0;
  g.globalAlpha = p.ghost ? 0.4 : 1;
  g.fillStyle = 'rgba(5,10,15,.35)'; g.beginPath(); g.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2); g.fill();
  const f = p.facing < 0 ? -1 : 1;
  g.fillStyle = '#3f8f3a'; g.fillRect(x - 6, y - 12 - bob, 12, 10); g.fillRect(x - 5, y - 14 - bob, 10, 2);
  g.fillStyle = '#5fbf55'; g.fillRect(x - 4, y - 10 - bob, 8, 6);
  g.fillStyle = '#ffffff'; g.fillRect(x - 5 + f, y - 17 - bob, 4, 4); g.fillRect(x + 1 + f, y - 17 - bob, 4, 4);
  g.fillStyle = '#0b0f1a'; g.fillRect(x - 4 + f + (f > 0 ? 1 : 0), y - 16 - bob, 2, 2); g.fillRect(x + 2 + f + (f > 0 ? 1 : 0), y - 16 - bob, 2, 2);
  g.fillStyle = '#c0392b'; g.fillRect(x - 3, y - 6 - bob, 6, 1);
  g.fillStyle = p.color; g.fillRect(x - 6, y - 3 - bob, 12, 2);
  g.globalAlpha = 1;
  const name = textArt(p === S.me ? 'YOU' : label(p.pepeId), p === S.me ? '#c9db4c' : '#e8eadf');
  g.drawImage(name, x - Math.round(name.width / 2), y - 26 - bob);
}
function frame() {
  if (!S.d) return;
  const { z, P, ox, oy } = view();
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#070b14'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(z, 0, 0, z, 0, 0); g.imageSmoothingEnabled = false;
  if (!S.ground) S.ground = groundCanvas();
  g.drawImage(S.ground, ox - N * 16, oy);
  const T2 = S.t;
  S.client.ground(g, P, T2);
  const list = [];
  for (const n of S.d.nodes.values()) list.push({ d: n.x + n.y + 1, draw: () => drawTree(P, n) });
  if (S.manifest.watcher) list.push({ d: WATCHER.x + WATCHER.y + 2, draw: () => drawWatcher(P) });
  for (const p of S.players.values()) list.push({ d: p.x + p.y, draw: () => drawPepe(P, p) });
  S.client.items(list, g, P, T2);
  list.sort((a, b) => a.d - b.d);
  for (const it of list) it.draw();
  S.client.overlay(g, P, T2);
}
function update(dt) {
  S.t += dt;
  S.shake = Math.max(0, S.shake - dt * 20);
  const live = S.client?.isOpen();
  for (const p of S.players.values()) {
    // Your own key walking is shown at once where the game says how (its speed and where you can stand).
    const own = p === S.me && live && S.client.speed && S.client.up?.() !== false && S.mod.predictFree
      && predict(p, S.dirNow, dt, S.t, (x, y) => S.mod.predictFree(x, y), S.client.speed());
    if (!own) glide(p, S.t, dt);
  }
  if (S.me) camStep(S.cam, [S.me.x, S.me.y], dt);
  // Bots wander: a new direction now and then.
  if (S.server) for (const b of S.bots) if (S.t > b.next) {
    b.next = S.t + 0.8 + Math.random() * 1.5;
    const dx = Math.floor(Math.random() * 3) - 1, dy = Math.floor(Math.random() * 3) - 1;
    S.server.message(b.id, { t: 'dir', dx, dy });
  }
}

// ---------------------------------------------------------------- input
function tileAt(ev) {
  const { z, ox, oy } = view(), r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const sx = ((ev.clientX - r.left) * dpr) / z, sy = ((ev.clientY - r.top) * dpr) / z;
  const a = (sx - ox) / 16, b = (sy - oy) / 8;
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}
canvas.addEventListener('pointerdown', (ev) => {
  snd.unlock?.();
  if (!S.client?.isOpen()) return;
  const t = tileAt(ev);
  S.client.hover(t);
  if (!S.client.click(t) && t.x >= 0 && t.y >= 0 && t.x < N && t.y < N) send({ t: 'walk', x: t.x, y: t.y });
});
canvas.addEventListener('pointermove', (ev) => { if (S.client?.isOpen()) S.client.hover(tileAt(ev)); });
canvas.addEventListener('wheel', (ev) => { S.zoom = Math.max(1, Math.min(4, S.zoom + (ev.deltaY < 0 ? 1 : -1))); ev.preventDefault(); }, { passive: false });
const MOVE = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
function steer() {
  let sx = 0, sy = 0;
  for (const k of S.keys) { const m = MOVE[k]; if (m) { sx += m[0]; sy += m[1]; } }
  sx = Math.sign(sx); sy = Math.sign(sy);
  const v = `${sx},${sy}`;
  if (v !== S.sentDir) { S.sentDir = v; S.dirNow = [sx, sy]; send({ t: 'dir', dx: sx, dy: sy }); }
}
addEventListener('keydown', (ev) => {
  snd.unlock?.();
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
  if (S.client?.isOpen() && S.client.key(ev, true)) { ev.preventDefault(); return; }
  const k = ev.key.toLowerCase();
  if (MOVE[k]) { S.keys.add(k); steer(); ev.preventDefault(); }
  if (k === '+' || k === '=') S.zoom = Math.min(4, S.zoom + 1);
  if (k === '-') S.zoom = Math.max(1, S.zoom - 1);
});
addEventListener('keyup', (ev) => { const k = ev.key.toLowerCase(); if (S.keys.delete(k)) steer(); });
addEventListener('blur', () => { S.keys.clear(); steer(); });

// ---------------------------------------------------------------- go
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { update(dt); frame(); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
(async () => {
  const id = params.get('game') ?? 'template';
  try { await load(id); } catch (err) { $('kit-title').textContent = `COULDN'T LOAD games/${id}: ${err.message}`; console.error(err); return; }
  if (params.get('mode')) $('kit-mode').value = params.get('mode');
  if (params.get('bots')) $('kit-bots').value = params.get('bots');
  if (params.get('lag')) $('kit-lag').value = params.get('lag');
  $('kit-go').addEventListener('click', start);
  $('kit-how').replaceChildren(...(S.manifest.howto ?? []).map((line) => el('li', '', line)));
  requestAnimationFrame(loop);
  if (params.get('autostart')) start();
  window.__kit = S;
})();
