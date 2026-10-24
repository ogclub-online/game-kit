// SWARM SIEGE in the browser, on the town's own engine like SWARM GEMS: the field is a plus of four lanes round
// the Swarm Watcher, everyone's Pepe is a builder walking about it, Firewall blocks and towers stand on it, and the
// swarm's cast walks down every open lane. The match runs on the server (rules.js has the rules); this sends
// where to walk or build and what to upgrade, sell or tip, draws what the server says (creeps a moment behind, so
// they glide between its updates), works out the way through itself to show it, and keeps the side panel.
//
// The host (the town engine in the world, engine/host.js here) hosts it: it hands over the drawing context and the iso projection P(x, y, z) each frame (ground(),
// items(), overlay()), passes clicks on the map (click()), and keeps the builders in its own player list (ctx.world).
import {
  GRID, FO, MIX, LANE, SPAWNS, LANE_NAMES, ROUND, TOWERS, WAVES, WAVES_TOTAL, TRAITS, HEART, idx, zone, flowField, trace, flowsWith,
  buildSpot, mayBuild, openLanes, upgradesOf, creepDef, hpAt, siegeReward, keepClear, isCore, RING,
} from './rules.js';
import { ENEMY_SPRITES, ENEMY_COLORS } from '../../engine/sprites.js';
import { textArt } from '../../engine/text.js';

/** Creeps are drawn this far behind the server's updates (ms), so they move smoothly between them. */
const BEHIND = 130;
/** Each lane's colour (its player's too). */
export const LANE_COLORS = ['#c9db4c', '#7ad7ff', '#ffb070', '#c6a8ff'];
const UPGRADE_KEYS = ['laser', 'cold', 'drop', 'gas', 'oracle', 'valid'];
const SAY = {
  NO_BUILD: "CAN'T BUILD THERE", NOT_YOUR_LANE: "THAT'S A TEAMMATE'S LANE · BUILD IN YOURS OR THE MIXER", TAKEN: 'SOMETHING IS ALREADY THERE',
  SOMEONE_THERE: 'SOMETHING IS STANDING THERE', BLOCKS: "THAT WOULD WALL THE SWARM IN · THEY MUST HAVE A WAY", GOLD: 'NOT ENOUGH GOLD', BUSY: 'YOUR PEPE HAS ENOUGH TO BUILD',
  NOT_YOURS: "THAT'S A TEAMMATE'S", NOT_NOW: 'NOT NOW', NO_WAY: "YOUR PEPE CAN'T GET THERE",
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
/** What's gone into a tower so far (a block, then each upgrade): a sale gives three quarters back. */
const spentOn = (kind) => (kind ? TOWERS[kind].cost + spentOn(TOWERS[kind].from) : 0);
const traitText = (flags) => [...flags].map((f) => TRAITS[f]).filter(Boolean).join(' · ');

export function createSiegeGame(ctx) {
  const { $, el, send, snd, label, guest } = ctx;
  const reduceMotion = () => !!ctx.reduceMotion;
  const R = {
    open: false, you: 0, host: 0, mode: 'solo', st: 'countdown', startsAt: 0, wave: 0, next: 0, nextAt: 0, out: false, lives: 20, max: 20,
    lanes: [-1, -1, -1, -1], towers: new Map(), cells: new Uint8Array(GRID * GRID), players: new Map(), roster: new Map(),
    snaps: [], fx: [], floats: [], hover: -1, sel: -1, orders: new Map(), ended: null, again: false, asking: false,
    paths: [], flows: null, preview: null, fired: new Map(), seen: new Map(), lastSound: {}, secShown: -1, bannerT: 0, frame: { t: -1, at: new Map() },
  };
  const me = () => R.players.get(R.you);
  const W = (c) => [c % GRID + FO, Math.floor(c / GRID) + FO];
  const fieldCell = (t) => { const fx = t.x - FO, fy = t.y - FO; return fx >= 0 && fy >= 0 && fx < GRID && fy < GRID ? idx(fx, fy) : -1; };
  const colorOf = (pid) => { const lane = R.players.get(pid)?.lane ?? R.roster.get(pid)?.lane; return lane >= 0 ? LANE_COLORS[lane] : '#ffffff'; };

  // ---------------------------------------------------------------- what the server says
  function open(w) {
    const was = R.open;
    R.open = true; R.you = w.you; R.host = w.host; R.mode = w.mode; R.st = w.st; R.startsAt = now() + w.startsIn;
    R.ended = null; R.again = false; R.asking = false; R.snaps = []; R.fx = []; R.floats = []; R.sel = -1; R.hover = -1; R.orders = new Map();
    setRoster(w.r, w.host);
    $('sg').hidden = false; $('sg-card').hidden = true;
    ctx.world.enter({ players: [...R.roster.entries()].map(([id, r]) => [id, r.pepe]), you: R.you });
    field(w.f);
    builders(w.b, w.o);
    if (w.rejoined) banner('RECONNECTED', 'BACK ON THE WALLS');
    else if (!was) banner('SWARM SIEGE', R.st === 'countdown' && R.mode === 'coop' ? 'ONE LANE EACH · WAITING FOR FRIENDS' : 'BUILD A MAZE DOWN YOUR LANE · CLICK TO PLACE FIREWALLS');
    panel();
  }
  function setRoster(r, host) {
    R.roster = new Map(r.map(([id, pepe, off, lane]) => [id, { pepe, off: !!off, lane }]));
    if (host) R.host = host;
    if (R.open) ctx.world.players([...R.roster.entries()].map(([id, x]) => [id, x.pepe]));
  }
  function field(f) {
    R.st = f.st; R.wave = f.wave; R.next = f.next; R.nextAt = now(); R.lives = f.lives; R.max = f.max; R.out = !!f.out;
    const lanesChanged = R.lanes.join() !== f.lanes.join();
    R.lanes = f.lanes;
    const was = R.towers;
    R.towers = new Map(f.tw.map(([c, kind, owner, kills]) => [c, { kind, owner, kills }]));
    const cells = new Uint8Array(GRID * GRID);
    let changed = lanesChanged;
    for (const [c, t] of R.towers) {
      cells[c] = 1;
      const o = was.get(c);
      if (!o) { changed = true; R.seen.set(c, now()); if (t.owner === R.you) play('gem', 0, 0); }
      else if (o.kind !== t.kind) { sparkle(c, TOWERS[t.kind].tier === 2 ? 18 : 10); play('levelup', 200); }
    }
    for (const c of was.keys()) if (!R.towers.has(c)) { changed = true; puffAt(...W(c), '#c9a27a', 8); }
    R.cells = cells;
    R.players = new Map(f.pl.map(([id, lane, gold, kills]) => [id, { lane, gold, kills }]));
    if (!R.towers.has(R.sel)) R.sel = -1;
    if (changed || !R.flows) reroute();
    R.preview = null;
    panel();
  }
  /** The way through each open lane, worked out here from what's built (the server does the same). */
  function reroute() {
    R.flows = [0, 1, 2, 3].map((i) => (R.lanes[i] >= 0 ? flowField(R.cells, i) : null));
    R.paths = [0, 1, 2, 3].map((i) => (R.flows[i] ? cellsToPts(trace(R.flows[i], R.cells, i)) : null));
    R.baseLens = R.paths.map((p) => (p ? p.length : 0));
  }
  function cellsToPts(cells) {
    if (!cells) return null;
    const pts = cells.map((c) => [c % GRID + 0.5, Math.floor(c / GRID) + 0.5]), at = [0];
    for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, at, length: at[at.length - 1] };
  }
  function builders(b, o) {
    if (!b) return;
    const list = [];
    for (let i = 0; i < b.length; i += 5) list.push([b[i], b[i + 1] / 10, b[i + 2] / 10, b[i + 3], b[i + 4]]);
    ctx.world.move(list);
    R.orders = new Map((o ?? []).map(([id, ...cells]) => [id, cells]));
  }
  function message(m) {
    switch (m.t) {
      case 'sgw': open(m); return true;
      case 'sgroster': setRoster(m.r, m.host); panel(); return true;
      case 'sgf': field(m); return true;
      case 'sgwave': {
        R.wave = m.wave; R.snaps.length = 0;
        const [name, , n, , , , flags] = WAVES[m.wave - 1], boss = flags.includes('B');
        banner(boss ? `BOSS · WAVE ${m.wave}` : `WAVE ${m.wave}`, `${name}${boss ? '' : ` ×${n} A LANE`}${traitText(flags) ? ' · ' + traitText(flags) : ''}`);
        play(boss ? 'boss' : 'start');
        if (boss) ctx.shake?.(5);
        panel();
        return true;
      }
      case 'sgs': state(m); return true;
      case 'sgend': finish(m); return true;
      default: return false;
    }
  }
  /** An update: the builders, the creeps and what happened since the last. */
  function state(m) {
    const t = now();
    builders(m.b, m.o);
    const creeps = new Map();
    for (let i = 0; i < m.c.length; i += 6) creeps.set(m.c[i], { id: m.c[i], type: m.c[i + 1], x: m.c[i + 2] / 10, y: m.c[i + 3] / 10, hp: m.c[i + 4] / 1000, slow: !!m.c[i + 5] });
    R.snaps.push({ t, creeps });
    while (R.snaps.length > 6) R.snaps.shift();
    if (m.lives < R.lives) ctx.shake?.(2);
    R.lives = m.lives;
    if (m.next !== R.next) { R.next = m.next; R.nextAt = t; }
    let goldChanged = false;
    for (const [id, gold, kills] of m.gold ?? []) { const p = R.players.get(id); if (p && (p.gold !== gold || p.kills !== kills)) { p.gold = gold; p.kills = kills ?? p.kills; goldChanged = true; } }
    for (let i = 0; i < m.h.length; i += 2) shot(m.h[i], m.h[i + 1], t);
    for (const e of m.e ?? []) event(e, t);
    // Gold and kills change often: the panel follows at most four times a second.
    if (goldChanged && t - (R.panelAt ?? 0) > 250) { R.panelAt = t; panel(); }
  }
  function event(e, t) {
    const at = (id) => creepNow(id, t);
    switch (e[0]) {
      case 'die': {
        const p = at(e[1]);
        if (p) {
          R.fx.push({ k: 'pop', x: p[0], y: p[1], big: p[3], born: t, life: 300 });
          bits(p[0], p[1], ENEMY_COLORS[p[4]] ?? '#ffffff', p[3] ? 22 : 7);
          if (e[2] === R.you) R.floats.push({ x: p[0], y: p[1], z: 22, text: `+${e[3]}`, col: '#e3b341', born: t, life: 700 });
          if (p[3]) ctx.shake?.(6);
        }
        play('die', 50);
        break;
      }
      case 'leak': { R.floats.push({ x: HEART[0] + FO, y: HEART[1] + FO, z: 60, text: `-${e[2]} ${e[2] === 1 ? 'LIFE' : 'LIVES'}`, col: '#ef6b55', born: t, life: 1300 }); play('towerHit', 80); ctx.shake?.(3); break; }
      case 'zap': { const a = at(e[1]), b2 = at(e[2]); if (a && b2) R.fx.push({ k: 'zap', a, b: b2, born: t, life: 220 }); play('zap', 90); break; }
      case 'boom': { const x = e[1] / 10 + FO, y = e[2] / 10 + FO, r = e[3] / 10; R.fx.push({ k: 'ring', x, y, col: '#ffb070', r0: 0.2, r1: r, born: t + 180, life: 300 }); setTimeout(() => { bits(x, y, '#e8833a', 6); play('thud', 80); }, 180); break; }
      case 'heal': { const p = at(e[1]); if (p) R.fx.push({ k: 'ring', x: p[0], y: p[1], col: '#7dff8a', r0: 0.2, r1: 1.6, born: t, life: 500 }); break; }
      case 'nobuild': if (e[1] === R.you) { say(SAY[e[3]] ?? "CAN'T BUILD THERE NOW"); play('warn'); } break;
      case 'sold': play('pick'); break;
      case 'tip': if (e[2] === R.you) { say(`+${e[3]} GOLD FROM ${label(R.roster.get(e[1])?.pepe ?? 0)}`, '#e3b341'); play('levelup'); } break;
    }
  }
  /** A tower fires at a creep: it kicks and flashes, and its own kind of shot flies. */
  function shot(cell, id, t) {
    const tw = R.towers.get(cell); if (!tw) return;
    R.fired.set(cell, t);
    if (R.fx.length > 400) return;
    const base = tw.kind.replace('2', ''), to = creepNow(id, t), [x, y] = W(cell);
    const tiles = to ? Math.hypot(to[0] - x - 0.5, to[1] - y - 0.5) : 3;
    const life = base === 'laser' ? 90 : base === 'gas' ? 140 : base === 'drop' ? 180 : 60 + tiles * 45;
    R.fx.push({ k: 'shot', cell, id, base, big: TOWERS[tw.kind].tier === 2, born: t, life, to });
    play('gemShot', 60, { laser: 'beam', cold: 'frost', drop: 'rock', gas: 'bolt', oracle: 'wisp' }[base]);
  }
  function bits(x, y, col, n, z = 4) {
    if (reduceMotion()) n = Math.min(n, 3);
    if (R.fx.length > 600) n = Math.min(n, 1);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, sp = 0.6 + Math.random() * 0.7; R.fx.push({ k: 'bit', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, up: 6 + Math.random() * 10, col: i % 3 ? col : '#ffffff', born: now(), life: 450 + Math.random() * 200 }); }
  }
  const puffAt = (x, y, col, n) => bits(x + 0.5, y + 0.5, col, n);
  function sparkle(cell, n) { const [x, y] = W(cell); bits(x + 0.5, y + 0.5, '#ffffff', n); bits(x + 0.5, y + 0.5, '#e3b341', Math.round(n / 2)); R.fx.push({ k: 'pillar', x: x + 0.5, y: y + 0.5, born: now(), life: 700 }); }
  function play(name, gapMs = 0, arg) { const t = now(), key = name + (arg ?? ''); if (gapMs && t - (R.lastSound[key] ?? 0) < gapMs) return; R.lastSound[key] = t; snd.play(name, arg); }
  function banner(text, sub) {
    const b = $('sg-banner'); b.replaceChildren(el('b', '', text), ...(sub ? [el('span', '', sub)] : []));
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(R.bannerT); R.bannerT = setTimeout(() => { b.hidden = true; }, 2800);
  }
  function say(text, col = '#ffb0a6') { const s = ctx.world.where(R.you); R.floats.push({ x: s?.[0] ?? HEART[0] + FO, y: s?.[1] ?? HEART[1] + FO, z: 44, text, col, born: now(), life: 1900 }); }
  /** A refusal from the server (its code without the SIEGE_). */
  function err(code) { if (!R.open) return false; say(SAY[code] ?? 'NOT NOW'); play('warn'); return true; }

  // ---------------------------------------------------------------- creeps between updates
  function creepsAt(t) {
    const S = R.snaps; if (!S.length) return [];
    let a = S[0], b = S[0];
    for (let i = 0; i < S.length; i++) { if (S[i].t <= t) a = S[i]; if (S[i].t >= t) { b = S[i]; break; } b = S[i]; }
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1, out = [];
    for (const c of b.creeps.values()) {
      const p = a.creeps.get(c.id);
      const x = p ? p.x + (c.x - p.x) * f : c.x, y = p ? p.y + (c.y - p.y) * f : c.y;
      out.push({ ...c, x, y, face: p && (c.x - c.y) - (p.x - p.y) < -0.001 ? -1 : 1 });
    }
    return out;
  }
  function creepsNow(t) { if (R.frame.t !== t) { R.frame.t = t; R.frame.at = new Map(creepsAt(t - BEHIND).map((c) => [c.id, c])); } return R.frame.at; }
  /** A creep's place in the world [x, y], flying, its look, boss, its wave entry. */
  function creepNow(id, t) {
    const c = creepsNow(t).get(id) ?? R.snaps.at(-1)?.creeps.get(id);
    if (!c) return null;
    const d = creepDef(c.type);
    return [c.x + FO + (c.type === 0 ? (c.id % 2 ? 0.15 : -0.15) : 0), c.y + FO, d[6].includes('F'), d[6].includes('B'), d[1]];
  }

  // ---------------------------------------------------------------- drawing, in the host's frame
  function ring(g, P, x, y, r, fill, stroke, dash) {
    const [sx, sy] = P(x, y);
    g.beginPath(); g.ellipse(sx, sy, r * 22.6, r * 11.3, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; if (dash) g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
  }
  function tileFill(g, P, x, y, fill) { const [hx, hy] = P(x, y); g.fillStyle = fill; for (let i = 0; i < 16; i++) { const w = i < 8 ? (i + 1) * 4 : (16 - i) * 4; g.fillRect(hx - w / 2, hy + i, w, 1); } }
  function tileLine(g, P, x, y, col) { const [hx, hy] = P(x, y); g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + 0.5, hy + 0.5); g.lineTo(hx + 16.5, hy + 8.5); g.lineTo(hx + 0.5, hy + 16.5); g.lineTo(hx - 15.5, hy + 8.5); g.closePath(); g.stroke(); }
  /** A rectangle of field cells (inclusive) as a flat iso shape. */
  function rect(g, P, x0, y0, x1, y1, fill, stroke, lw = 1) {
    g.beginPath();
    for (const [x, y] of [[x0, y0], [x1 + 1, y0], [x1 + 1, y1 + 1], [x0, y1 + 1]]) { const [sx, sy] = P(x + FO, y + FO); g.lineTo(sx, sy); }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }
  /** The lanes' and the Mixer's rectangles (field cells, inclusive). */
  const LANE_RECTS = [[LANE[0], 0, LANE[1], MIX[0] - 1], [MIX[1] + 1, LANE[0], GRID - 1, LANE[1]], [LANE[0], MIX[1] + 1, LANE[1], GRID - 1], [0, LANE[0], MIX[0] - 1, LANE[1]]];
  /** On the ground: the lanes and the Mixer, their grids, the spawns, the ways through, orders, the pointer and ranges. */
  function ground(g, P, T) {
    if (!R.open) return;
    const t = now();
    // The lanes (tinted their player's colour; a closed lane is dark) and the Mixer.
    LANE_RECTS.forEach(([x0, y0, x1, y1], i) => {
      const closed = R.lanes[i] < 0 && R.st !== 'countdown';
      rect(g, P, x0, y0, x1, y1, closed ? 'rgba(10,14,24,.55)' : LANE_COLORS[i] + '22', closed ? 'rgba(255,255,255,.08)' : LANE_COLORS[i] + '88', 2);
    });
    rect(g, P, MIX[0], MIX[0], MIX[1], MIX[1], 'rgba(227,179,65,.06)', 'rgba(227,179,65,.6)', 2);
    // A faint grid where building is allowed.
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    const lines = (x0, y0, x1, y1) => {
      for (let x = x0; x <= x1 + 1; x++) { const [ax, ay] = P(x + FO, y0 + FO), [bx, by] = P(x + FO, y1 + 1 + FO); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
      for (let y = y0; y <= y1 + 1; y++) { const [ax, ay] = P(x0 + FO, y + FO), [bx, by] = P(x1 + 1 + FO, y + FO); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    };
    LANE_RECTS.forEach((r, i) => { if (R.lanes[i] >= 0 || R.st === 'countdown') lines(...r); });
    lines(MIX[0], MIX[0], MIX[1], MIX[1]);
    // The ways through: a trodden trail, and bright marks running along it toward the Watcher.
    for (let i = 0; i < 4; i++) {
      const path = R.paths[i]; if (!path) continue;
      g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = 'rgba(92,64,30,.35)'; g.lineWidth = 7;
      g.beginPath(); path.pts.forEach(([x, y], k) => { const [sx, sy] = P(x + FO, y + FO); if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy); }); g.stroke();
      g.lineWidth = 1;
      const off = reduceMotion() ? 0 : (t / 260) % 1.6;
      g.fillStyle = LANE_COLORS[i];
      for (let d = off; d < path.length; d += 1.6) { const [x, y] = along(path, d), [sx, sy] = P(x + FO, y + FO); g.fillRect(sx - 1, sy - 1, 3, 2); }
    }
    // The spawns: a swirling portal at the head of each open lane.
    SPAWNS.forEach(([x, y], i) => {
      if (R.lanes[i] < 0 && R.st !== 'countdown') return;
      const wx = x + FO + 0.5, wy = y + FO + 0.5;
      for (let k = 0; k < 3; k++) ring(g, P, wx, wy, 0.95 - k * 0.27, ['#2a1250', '#6a2fd0', '#c49aff'][k]);
      for (let k = 0; k < 6; k++) { const a = T * 3 + k + i, [sx, sy] = P(wx + Math.cos(a) * 0.62, wy + Math.sin(a) * 0.62, 2 + (k % 3) * 3); g.fillStyle = '#e8d8ff'; g.fillRect(sx, sy, 2, 2); }
    });
    // Orders on the way, in their builder's colour.
    for (const [id, cells] of R.orders) for (const c of cells) { const [x, y] = W(c), col = colorOf(id); tileFill(g, P, x, y, col + '33'); tileLine(g, P, x, y, col); }
    // The pointer: a tower's reach, or whether a block can go here (and how much longer the way gets).
    const c = R.hover >= 0 && !R.towers.has(R.hover) ? R.hover : -1;
    for (const sc of new Set([R.sel, R.towers.has(R.hover) ? R.hover : -1])) {
      if (sc < 0) continue;
      const tw = R.towers.get(sc), s = tw && TOWERS[tw.kind]; if (!s) continue;
      const [x, y] = W(sc);
      tileLine(g, P, x, y, sc === R.sel ? '#e8833a' : '#ffffff');
      const r = s.range ?? s.aura?.r;
      if (r) ring(g, P, x + 0.5, y + 0.5, r, 'rgba(255,255,255,.05)', s.aura ? 'rgba(125,255,200,.7)' : 'rgba(255,255,255,.55)', true);
    }
    if (c >= 0 && canBuildNow()) {
      const x = c % GRID, y = Math.floor(c / GRID), [wx, wy] = W(c);
      if (!R.preview || R.preview.c !== c) R.preview = previewAt(c);
      const { ok, why, alt, delta } = R.preview;
      if (ok && alt) {
        g.strokeStyle = 'rgba(140,220,255,.9)'; g.lineWidth = 2; g.setLineDash([4, 3]);
        g.beginPath(); alt.pts.forEach(([px, py], k) => { const [sx, sy] = P(px + FO, py + FO); if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy); }); g.stroke();
        g.setLineDash([]); g.lineWidth = 1;
      }
      tileFill(g, P, wx, wy, ok ? 'rgba(201,219,76,.42)' : 'rgba(239,107,85,.45)');
      const [sx, sy] = P(wx + 0.5, wy + 0.5, 26);
      const art = ok ? (delta ? textArt(`${delta > 0 ? '+' : ''}${delta} TILES · ${TOWERS.wall.cost}G`, delta > 0 ? '#c9db4c' : '#ffb0a6') : textArt(`FIREWALL · ${TOWERS.wall.cost}G`, '#fff6d8')) : textArt(why, '#ffb0a6');
      g.drawImage(art, Math.round(sx - art.width / 2), Math.round(sy));
      void x; void y;
    }
  }
  function along(path, d) {
    const { pts, at } = path;
    if (d <= 0) return pts[0];
    if (d >= at[at.length - 1]) return pts[pts.length - 1];
    let lo = 0, hi = at.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at[m] <= d) lo = m; else hi = m; }
    const f = (d - at[lo]) / (at[hi] - at[lo] || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  }
  const canBuildNow = () => R.st === 'running' && !R.ended && !!me();
  /** The field with everyone's queued blocks on it too (they're as good as built). */
  function planned() { const b = R.cells.slice(); for (const cells of R.orders.values()) for (const c of cells) b[c] = 1; return b; }
  /** A block at c: allowed? why not, the way through its lane would take, and how many tiles longer. */
  function previewAt(c) {
    const x = c % GRID, y = Math.floor(c / GRID);
    if (!buildSpot(R.lanes, x, y)) return { c, ok: false, why: keepClear(x, y) ? 'KEEP CLEAR' : zone(x, y) >= 0 && zone(x, y) < 4 && R.lanes[zone(x, y)] < 0 ? 'CLOSED LANE' : "CAN'T BUILD HERE" };
    if (!mayBuild(R.lanes, R.you, x, y)) return { c, ok: false, why: "A TEAMMATE'S LANE" };
    if (R.cells[c] || [...R.orders.values()].some((o) => o.includes(c))) return { c, ok: false, why: 'TAKEN' };
    if ((me()?.gold ?? 0) < TOWERS.wall.cost * (1 + (R.orders.get(R.you)?.length ?? 0))) return { c, ok: false, why: 'NOT ENOUGH GOLD' };
    const b = planned(), flows = flowsWith(b, R.lanes, c);
    if (!flows) return { c, ok: false, why: 'WOULD BLOCK THE WAY' };
    // Show the lane the block is in (the Mixer: the longest change of any lane).
    const z = zone(x, y), lanes = z < 4 ? [z] : openLanes(R.lanes);
    let best = null, delta = 0;
    const base = flowsWith(b, R.lanes) ?? [];
    for (const i of lanes) {
      const before = base[i] ? base[i][idx(...SPAWNS[i])] : 0, after = flows[i][idx(...SPAWNS[i])], d = Math.round(after - before);
      if (!best || Math.abs(d) > Math.abs(delta)) { delta = d; b[c] = 1; best = cellsToPts(trace(flows[i], b, i)); }
    }
    return { c, ok: true, alt: delta ? best : null, delta };
  }
  /** Standing things, depth-sorted with everything else: blocks, towers, creeps. */
  function items(list, g, P, T) {
    if (!R.open) return;
    const t = now();
    for (const [c, tw] of R.towers) { const [x, y] = W(c); list.push({ d: x + y + 1, draw: () => drawTower(g, P, x, y, tw, c, t, T) }); }
    for (const c of R.snaps.length ? creepsAt(t - BEHIND) : []) {
      const d = creepDef(c.type), fly = d[6].includes('F'), x = c.x + FO + (c.type === 0 ? (c.id % 2 ? 0.15 : -0.15) : 0), y = c.y + FO;
      list.push({ d: x + y + (fly ? 2 : 0), draw: () => drawCreep(g, P, c, d, x, y, fly, t) });
    }
  }
  /** An iso box: corners (x0, y0)-(x1, y1) on the ground, from height z0 up h, faces left (+y), right (+x) and top. */
  function box(g, P, x0, y0, x1, y1, z0, h, top, left, right) {
    const q = (pts, col) => { g.fillStyle = col; g.beginPath(); for (const [x, y, z] of pts) { const [sx, sy] = P(x, y, z); g.lineTo(Math.round(sx), Math.round(sy)); } g.closePath(); g.fill(); };
    q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z0 + h], [x0, y1, z0 + h]], left);
    q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z0 + h], [x1, y0, z0 + h]], right);
    q([[x0, y0, z0 + h], [x1, y0, z0 + h], [x1, y1, z0 + h], [x0, y1, z0 + h]], top);
  }
  /**
   * A Firewall block is a squat brick block with a little flame; each tower stands on one: a Laser Node is a dark
   * pylon with a red lens, a Cold Wallet an ice-blue strongbox, an Airdrop a crate on a launcher, a Gas Spike a green
   * metal spike, an Oracle a violet obelisk with an eye, a Validator a teal node with a ring round it. The second
   * tier is taller with a gold band.
   */
  function drawTower(g, P, x, y, tw, c, t, T) {
    const rise = reduceMotion() ? 1 : clamp((t - (R.seen.get(c) ?? 0)) / 260, 0, 1);
    const kick = clamp(1 - (t - (R.fired.get(c) ?? -1e9)) / 140, 0, 1), base = tw.kind.replace('2', ''), big = TOWERS[tw.kind].tier === 2;
    const m = 0.1, bh = (tw.kind === 'wall' ? 10 : 6) * rise;
    const own = tw.owner && R.players.get(tw.owner) ? colorOf(tw.owner) : '#8a8f98';
    box(g, P, x + m, y + m, x + 1 - m, y + 1 - m, 0, bh, '#d8643a', '#8a3420', '#b5482a');
    // Mortar lines and the owner's stripe on the front faces.
    g.fillStyle = 'rgba(40,12,6,.55)';
    { const [ax, ay] = P(x + m, y + 1 - m, bh / 2), [bx, by] = P(x + 1 - m, y + 1 - m, bh / 2); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by + 1); g.lineTo(ax, ay + 1); g.fill(); }
    { const [ax, ay] = P(x + 1 - m, y + m, 1), [bx, by] = P(x + 1 - m, y + 1 - m, 1); g.strokeStyle = own; g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    if (rise < 1) return;
    const cx = x + 0.5, cy = y + 0.5, flick = reduceMotion() ? 0 : Math.sin(T * 12 + c) > 0 ? 1 : 0;
    if (tw.kind === 'wall') {
      const [fx, fy] = P(cx, cy, bh);
      g.fillStyle = '#ffb070'; g.fillRect(Math.round(fx) - 1, Math.round(fy) - 3 - flick, 2, 3 + flick);
      g.fillStyle = '#fff2a8'; g.fillRect(Math.round(fx), Math.round(fy) - 2, 1, 2);
      return;
    }
    const z0 = bh, up = big ? 1.35 : 1, k = kick * (reduceMotion() ? 0 : 1.5);
    if (base === 'laser') {
      box(g, P, cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, z0, 18 * up - k, '#5b6577', '#262c38', '#39414f');
      const [lx, ly] = P(cx, cy, z0 + 18 * up - k + 3);
      g.fillStyle = kick > 0 ? '#ffffff' : '#ff4d4d'; g.fillRect(Math.round(lx) - 2, Math.round(ly) - 2, 4, 4);
      g.fillStyle = '#ffd0d0'; g.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 1, 1);
      if (big) { g.fillStyle = '#ff4d4d'; g.fillRect(Math.round(lx) - 5, Math.round(ly) + 4, 2, 2); g.fillRect(Math.round(lx) + 3, Math.round(ly) + 4, 2, 2); }
    } else if (base === 'cold') {
      const s = big ? 0.32 : 0.26;
      box(g, P, cx - s, cy - s, cx + s, cy + s, z0, 11 * up - k * 0.5, '#e8f6ff', '#5aa8d6', '#8fd0f5');
      const [hx, hy] = P(cx + s, cy, z0 + 5 * up); g.fillStyle = '#2b5f80'; g.fillRect(Math.round(hx) - 1, Math.round(hy) - 2, 2, 3);
      if (!reduceMotion()) for (let i = 0; i < (big ? 4 : 2); i++) { const a = T * 1.6 + i * 1.7 + c, [px, py] = P(cx + Math.cos(a) * 0.4, cy + Math.sin(a) * 0.4, z0 + 12 * up + (i % 2) * 4); g.fillStyle = '#e8f6ff'; g.fillRect(Math.round(px), Math.round(py), 1, 1); }
    } else if (base === 'drop') {
      box(g, P, cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3, z0, 3, '#4b5563', '#1f2937', '#374151');
      const s = big ? 0.27 : 0.22, lift = k * 2;
      box(g, P, cx - s, cy - s, cx + s, cy + s, z0 + 3 + lift, 9 * up, '#c9a27a', '#7a5532', '#9c7148');
      const [ax, ay] = P(cx - s, cy + s, z0 + 3 + lift), [bx, by] = P(cx + s, cy + s, z0 + 3 + lift + 9 * up);
      g.strokeStyle = '#5a3a1e'; g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (big) { const [px, py] = P(cx, cy, z0 + 3 + lift + 9 * up + 4); g.fillStyle = '#ef6b55'; g.fillRect(Math.round(px) - 5, Math.round(py) - 2, 10, 2); g.fillRect(Math.round(px), Math.round(py), 1, 3); }
    } else if (base === 'gas') {
      const h = 22 * up, [bx, by] = P(cx, cy, z0), [tx, ty] = P(cx, cy, z0 + h - k);
      g.fillStyle = '#3d6b4a'; g.beginPath(); g.moveTo(bx - 6, by); g.lineTo(tx, ty); g.lineTo(bx + 6, by); g.closePath(); g.fill();
      g.fillStyle = '#7fd17f'; g.beginPath(); g.moveTo(bx, by + 2); g.lineTo(tx, ty); g.lineTo(bx + 6, by); g.closePath(); g.fill();
      if (!reduceMotion() && (flick || kick > 0)) { g.strokeStyle = '#c8ffb0'; g.lineWidth = 1; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 4, ty + 4); g.lineTo(tx - 2, ty + 8); g.stroke(); }
      if (big) { g.fillStyle = '#e3b341'; g.fillRect(Math.round(bx) - 4, Math.round(by) - 6, 8, 2); }
    } else if (base === 'oracle') {
      const h = 20 * up;
      box(g, P, cx - 0.16, cy - 0.16, cx + 0.16, cy + 0.16, z0, h, '#b18cff', '#4a2a8a', '#6d45b8');
      const [tx, ty] = P(cx, cy, z0 + h);
      g.fillStyle = '#d9c4ff'; g.beginPath(); g.moveTo(tx - 6, ty); g.lineTo(tx, ty - 6); g.lineTo(tx + 6, ty); g.lineTo(tx, ty + 3); g.closePath(); g.fill();
      const [ex, ey] = P(cx + 0.16, cy + 0.02, z0 + h - 6);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(ex) - 2, Math.round(ey) - 1, 4, 3);
      g.fillStyle = kick > 0 ? '#ff4dff' : '#1b1030'; g.fillRect(Math.round(ex) - 1 + (Math.sin(T * 2 + c) > 0 ? 1 : 0), Math.round(ey), 1, 1);
      if (big) { g.fillStyle = '#e3b341'; g.fillRect(Math.round(tx) - 1, Math.round(ty) - 10, 2, 3); }
    } else if (base === 'valid') {
      const s = big ? 0.22 : 0.18, h = 10 * up, bob = reduceMotion() ? 0 : Math.sin(T * 2 + c) * 1.5;
      box(g, P, cx - s, cy - s, cx + s, cy + s, z0 + 4 + bob, h, '#8ff5d8', '#1f7a66', '#2fb393');
      const [rx, ry] = P(cx, cy, z0 + 4 + bob + h / 2), a = T * 2;
      g.strokeStyle = big ? '#e3b341' : '#c8fff0'; g.lineWidth = 1; g.beginPath(); g.ellipse(rx, ry, 11 + Math.sin(a) * 1, 5, 0, 0, Math.PI * 2); g.stroke();
      const [px, py] = [rx + Math.cos(a) * 11, ry + Math.sin(a) * 5]; g.fillStyle = '#ffffff'; g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
    }
    if (big) { const [gx, gy] = P(x + m, y + 1 - m, z0); const [hx, hy] = P(x + 1 - m, y + 1 - m, z0); g.strokeStyle = '#e3b341'; g.lineWidth = 2; g.beginPath(); g.moveTo(gx, gy - 1); g.lineTo(hx, hy - 1); g.stroke(); }
  }
  function drawCreep(g, P, c, d, x, y, fly, t) {
    const spr = ENEMY_SPRITES[d[1]] ?? ENEMY_SPRITES.clone;
    const boss = d[6].includes('B'), invis = d[6].includes('I'), scale = boss ? 1.7 : c.type === 0 ? 0.6 : 0.8;
    const [sx, sy] = P(x, y);
    const fr = spr.walk[Math.floor(t / 110 + c.id * 0.37) & 3], img = c.face < 0 ? fr.left : fr.right;
    const lift = fly ? 16 + Math.round(Math.sin(t / 250 + c.id) * 2) : spr.hover ? 6 : 0;
    g.fillStyle = 'rgba(5,10,15,.35)'; g.beginPath(); g.ellipse(sx, sy, spr.w * 0.3 * scale, boss ? 4 : 2.5, 0, 0, Math.PI * 2); g.fill();
    const w = Math.round(spr.w * scale), h = Math.round(spr.h * scale), x0 = Math.round(sx - w / 2), y0 = Math.round(sy - h + 1 - lift);
    g.globalAlpha = invis ? 0.4 : 1; g.drawImage(img, x0, y0, w, h); g.globalAlpha = 1;
    if (fly) { g.fillStyle = '#f2f2f2'; g.fillRect(x0 - 2, y0 + 3, 2, 1); g.fillRect(x0 + w, y0 + 3, 2, 1); }
    if (c.slow) { g.fillStyle = '#9fd3ef'; g.fillRect(sx - 4, y0 - 2, 2, 2); g.fillRect(sx + 2, y0 - 3, 2, 2); }
    if (c.hp < 1) {
      const bw = boss ? 26 : 12;
      g.fillStyle = '#070b14'; g.fillRect(Math.round(sx - bw / 2) - 1, y0 - 5, bw + 2, 3);
      g.fillStyle = c.hp > 0.5 ? '#c9db4c' : c.hp > 0.25 ? '#e3b341' : '#ef6b55'; g.fillRect(Math.round(sx - bw / 2), y0 - 4, Math.max(1, Math.round(bw * c.hp)), 1);
    }
  }
  /** Over everything: shots, lightning, bursts, sparks, words. */
  function overlay(g, P, T) {
    if (!R.open) return;
    const t = now();
    for (const f of R.fx) {
      if (t < f.born) continue;
      const k = clamp((t - f.born) / f.life, 0, 1);
      if (f.k === 'shot') {
        const to = creepNow(f.id, t) ?? f.to; if (!to) continue;
        f.to = to;
        const [x, y] = W(f.cell), [ax, ay] = P(x + 0.5, y + 0.5, f.base === 'laser' ? (f.big ? 34 : 27) : 18), [bx, by] = P(to[0], to[1], to[2] ? 22 : 8);
        if (f.base === 'laser') {
          g.globalAlpha = 1 - k; g.strokeStyle = '#ff4d4d'; g.lineWidth = f.big ? 3 : 2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
          g.strokeStyle = '#ffe0e0'; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
        } else if (f.base === 'gas') {
          g.globalAlpha = 1 - k; g.strokeStyle = '#b8ff9a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay);
          for (let i = 1; i < 5; i++) g.lineTo(ax + (bx - ax) * (i / 5) + (Math.random() - 0.5) * 8, ay + (by - ay) * (i / 5) + (Math.random() - 0.5) * 8);
          g.lineTo(bx, by); g.stroke(); g.globalAlpha = 1;
        } else if (f.base === 'drop') {
          const px = ax + (bx - ax) * k, py = ay + (by - ay) * k - Math.sin(k * Math.PI) * 26;
          g.fillStyle = '#9c7148'; g.fillRect(Math.round(px) - 2, Math.round(py) - 2, f.big ? 5 : 4, f.big ? 5 : 4);
          g.fillStyle = '#5a3a1e'; g.fillRect(Math.round(px) - 2, Math.round(py), f.big ? 5 : 4, 1);
        } else {
          const px = ax + (bx - ax) * k, py = ay + (by - ay) * k, col = f.base === 'cold' ? '#d8f2ff' : '#e0b8ff';
          g.fillStyle = col; g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
          g.globalAlpha = 0.5; g.fillRect(Math.round(px - (bx - ax) * 0.06) - 1, Math.round(py - (by - ay) * 0.06), 2, 2); g.globalAlpha = 1;
          if (k >= 1 && !f.landed) { f.landed = true; bits(to[0], to[1], col, 3, to[2] ? 20 : 8); }
        }
      } else if (f.k === 'ring') {
        const r = f.r0 + (f.r1 - f.r0) * k, [sx, sy] = P(f.x, f.y, 0);
        g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, Math.max(0.5, r * 22.6), Math.max(0.5, r * 11.3), 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = (1 - k) * 0.25; g.fillStyle = f.col; g.fill(); g.globalAlpha = 1;
      } else if (f.k === 'zap') {
        const [ax, ay] = P(f.a[0], f.a[1], 10), [bx, by] = P(f.b[0], f.b[1], 10);
        g.globalAlpha = 1 - k; g.strokeStyle = '#b8ff9a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay);
        for (let i = 1; i < 5; i++) g.lineTo(ax + (bx - ax) * (i / 5) + (Math.random() - 0.5) * 8, ay + (by - ay) * (i / 5) + (Math.random() - 0.5) * 8);
        g.lineTo(bx, by); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
      } else if (f.k === 'bit') {
        const [sx, sy] = P(f.x + f.vx * k * 0.7, f.y + f.vy * k * 0.7, (f.z ?? 4) + Math.sin(k * Math.PI) * f.up);
        g.globalAlpha = 1 - k * k; g.fillStyle = f.col; g.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, k < 0.5 ? 3 : 2, k < 0.5 ? 3 : 2); g.globalAlpha = 1;
      } else if (f.k === 'pop') {
        const [sx, sy] = P(f.x, f.y, 8), r = (f.big ? 6 : 3) + k * (f.big ? 22 : 9);
        g.globalAlpha = 1 - k; g.fillStyle = '#ffffff';
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r * 0.6), 2, 2); }
        g.globalAlpha = 1;
      } else if (f.k === 'pillar') {
        const [sx, sy] = P(f.x, f.y);
        g.globalAlpha = (1 - k) * 0.45; g.fillStyle = '#e3b341'; g.fillRect(sx - 6, sy - 60, 12, 60);
        g.globalAlpha = (1 - k) * 0.8; g.fillStyle = '#fff6c8'; g.fillRect(sx - 2, sy - 60, 4, 60); g.globalAlpha = 1;
      }
    }
    R.fx = R.fx.filter((f) => t < f.born || t - f.born < f.life);
    for (const f of R.floats) {
      const k = (t - f.born) / f.life, [sx, sy] = P(f.x, f.y, f.z + k * 16), art = textArt(f.text, f.col);
      g.globalAlpha = clamp(1 - k, 0, 1); g.drawImage(art, Math.round(sx - art.width / 2), Math.round(sy)); g.globalAlpha = 1;
    }
    R.floats = R.floats.filter((f) => t - f.born < f.life);
    if (Math.floor(T) !== R.secShown) { R.secShown = Math.floor(T); top(); }
  }

  // ---------------------------------------------------------------- input (map clicks come from the host)
  function hover(t) { const c = t ? fieldCell(t) : -1; if (c !== R.hover) { R.hover = c; R.preview = null; } }
  /** A click on the map: pick a tower, or put a block down; false means the host walks you there. */
  function click(t) {
    if (!R.open) return false;
    const c = fieldCell(t); if (c < 0) { if (R.sel >= 0) { R.sel = -1; panel(); } return false; }
    R.hover = c;
    if (R.towers.has(c)) { R.sel = c === R.sel ? -1 : c; panel(); play('click'); return true; }
    if (R.sel >= 0) { R.sel = -1; panel(); }
    const x = c % GRID, y = Math.floor(c / GRID);
    if (!canBuildNow() || zone(x, y) < 0) return false;
    const p = previewAt(c);
    if (!p.ok) { say(p.why); play('warn'); return true; }
    send({ t: 'sgbuild', x, y }); play('click');
    R.orders.set(R.you, [...(R.orders.get(R.you) ?? []), c]); R.preview = null;
    return true;
  }
  function key(ev, down) {
    if (!R.open || !down) return false;
    const k = ev.key.toLowerCase();
    if (k === 'escape') { if (R.sel >= 0) { R.sel = -1; panel(); } else if (R.asking) keepPlaying(); else if (R.ended) leave(); else ask(); return true; }
    if (k === 'enter' && R.st === 'countdown' && R.host === R.you) { send({ t: 'arenaGo' }); return true; }
    if (k === 'n' && R.host === R.you) { send({ t: 'sgnext' }); return true; }
    if (R.sel >= 0) {
      const tw = R.towers.get(R.sel); if (!tw) return false;
      const ups = upgradesOf(tw.kind), x = R.sel % GRID, y = Math.floor(R.sel / GRID);
      if (/^[1-6]$/.test(k)) { const kind = tw.kind === 'wall' ? UPGRADE_KEYS[Number(k) - 1] : ups[Number(k) - 1]; if (kind) { send({ t: 'sgup', x, y, k: kind }); return true; } }
      if (k === 'u' && ups.length === 1) { send({ t: 'sgup', x, y, k: ups[0] }); return true; }
      if (k === 'x' || k === 'delete' || k === 'backspace') { send({ t: 'sgsell', x, y }); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- the panel
  function top() {
    if (!R.open) return;
    const box = $('sg-top'); box.replaceChildren();
    const bar = el('div', 'gt-castle'), fill = el('i'); fill.style.width = `${clamp((R.lives / R.max) * 100, 0, 100)}%`; bar.append(fill);
    box.append(el('b', '', `WAVE ${R.wave} / ${WAVES_TOTAL}`), el('span', 'gt-hp', `${R.lives} ${R.lives === 1 ? 'LIFE' : 'LIVES'}`), bar);
    if (R.st === 'countdown') box.append(el('span', 'gt-time', `STARTS IN ${Math.max(0, Math.ceil((R.startsAt - now()) / 1000))}${R.mode === 'coop' ? ' · OTHERS CAN JOIN FROM THE GAMES PAGE' : ''}`));
    else if (R.st === 'running' && !R.ended && R.wave < WAVES_TOTAL) {
      const left = Math.max(0, Math.round(R.next - (now() - R.nextAt) / 1000));
      box.append(el('span', 'gt-time', `WAVE ${R.wave + 1} IN ${left}S`));
    }
    if (R.st === 'running' && !R.ended && R.wave > 0 && !guest()) box.append(el('span', 'gt-sofar', `${siegeReward({ reached: R.wave, won: false })} $SWARM SO FAR`));
    $('sg-next').disabled = !(R.st === 'running' && R.host === R.you && !R.out && R.wave < WAVES_TOTAL);
  }
  function meLine() {
    const p = me(), box = $('sg-me'); if (!p || !box) return;
    box.replaceChildren();
    const laneName = p.lane >= 0 ? `${LANE_NAMES[p.lane]} LANE` : '';
    const head = el('div', 'gt-infohead'), dot = el('i', 'sg-dot'); dot.style.background = LANE_COLORS[p.lane] ?? '#fff';
    head.append(dot, el('div', 'gt-gold', `${p.gold} GOLD`), el('span', 'dim', laneName));
    box.append(head);
  }
  function panel() {
    if (!R.open) return;
    top(); meLine(); selBox();
    const w = R.wave + 1, def = WAVES[w - 1], nx = $('sg-wave'); nx.replaceChildren();
    if (def) {
      const [name, , n, hp, ms, armor, flags] = def, boss = flags.includes('B');
      nx.append(el('h5', '', `NEXT: WAVE ${w}${boss ? ' · BOSS' : ''}`), el('div', '', `${name} ×${n} A LANE · ${Math.round(hpAt(w) * hp).toLocaleString('en-US')} HP${armor || flags.includes('A') ? ' · ARMOURED' : ''}${ms >= 2 ? ' · FAST' : ''}`));
      const tr = traitText(flags.replace(/[AQB]/g, '')); if (tr) nx.append(el('div', 'gt-trait', tr));
      if (boss) nx.append(el('div', 'gt-trait', `IF ONE GETS THROUGH: −${w >= WAVES_TOTAL ? ROUND.FINAL_LEAK : ROUND.BOSS_LEAK} LIVES`));
    }
    const help = $('sg-help'); help.replaceChildren();
    if (R.st === 'countdown') help.append(el('p', 'gt-step', R.mode === 'coop' ? 'WAITING FOR FRIENDS · WALK ABOUT (CLICK OR WASD) · EACH PLAYER GETS A LANE' : 'GET READY · CLICK OR WASD TO WALK'));
    else if (R.st === 'running' && R.sel < 0) help.append(el('p', 'gt-step', `CLICK YOUR LANE${R.lanes.some((l) => l === 0) ? ', A FREE LANE' : ''} OR THE GOLD MIXER TO PUT DOWN A FIREWALL (${TOWERS.wall.cost} GOLD). MAKE THE SWARM WALK. CLICK A BLOCK TO TURN IT INTO A TOWER.`));
    team();
    $('sg-go').hidden = !(R.st === 'countdown' && R.mode === 'coop' && R.host === R.you);
  }
  /**
   * The team: each player's lane colour, gold and kills, and tip buttons. Rebuilt only when who's there (or what you
   * can afford to tip) changes, so a button isn't swapped out from under a click; the numbers update in place.
   */
  function team() {
    const tm = $('sg-team'), gold = me()?.gold ?? 0, live = R.st === 'running' && !R.ended;
    const key = [...R.roster].map(([id, r]) => `${id}.${r.off ? 1 : 0}.${R.players.get(id)?.lane ?? r.lane}`).join() + `|${R.host}|${live}|${[10, 25, 50].map((n) => gold >= n).join()}|${R.mode}`;
    if (tm.dataset.key !== key) {
      tm.dataset.key = key; tm.replaceChildren(); R.teamSpans = new Map();
      if (R.roster.size > 1 || R.mode === 'coop') {
        tm.append(el('h5', '', 'THE TEAM'));
        for (const [id, r] of R.roster) {
          const pl = R.players.get(id), li = el('div', 'gt-mate'), dot = el('i'), nums = el('span', 'dim', '');
          dot.style.background = LANE_COLORS[pl?.lane ?? r.lane] ?? '#fff';
          li.append(dot, el('span', '', `${id === R.you ? 'YOU' : label(r.pepe)}${r.off ? ' (AWAY)' : ''}${id === R.host ? ' · HOST' : ''}`), nums);
          tm.append(li); R.teamSpans.set(id, nums);
          if (id !== R.you && pl && live) {
            const row = el('div', 'sg-tips');
            for (const n of [10, 25, 50]) { const b = el('button', 'btn ghost', `TIP ${n}`); b.type = 'button'; b.disabled = gold < n; b.addEventListener('click', () => { send({ t: 'sgtip', to: id, n }); play('click'); }); row.append(b); }
            tm.append(row);
          }
        }
      }
    }
    for (const [id, span] of R.teamSpans ?? []) { const pl = R.players.get(id); span.textContent = pl ? `${pl.gold}G · ${pl.kills} KILLS` : ''; }
  }
  /** The selected block or tower: what it does, what it can become, and selling it (rebuilt only when that changes). */
  function selBox() {
    const box = $('sg-sel'); if (!box) return;
    const tw = R.towers.get(R.sel), gold = me()?.gold ?? 0;
    const key = tw ? `${R.sel}|${tw.kind}|${tw.owner}|${tw.kills}|${upgradesOf(tw.kind).map((k) => gold >= TOWERS[k].cost).join()}` : '';
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren();
    if (!tw) return;
    const s = TOWERS[tw.kind], mine = tw.owner === R.you || !tw.owner || !R.players.has(tw.owner);
    const head = el('div', 'gt-infohead'); head.append(towerIcon(tw.kind), el('b', '', s.name));
    box.append(head, el('div', 'dim', s.about));
    if (s.dmg) box.append(el('div', 'dim', `DAMAGE ${s.dmg} · EVERY ${s.rate}S · RANGE ${s.range} · ${s.type === 'magic' ? 'IGNORES ARMOUR' : 'PHYSICAL'}${s.air === false ? ' · GROUND ONLY' : ''}`));
    if (tw.kills) box.append(el('div', 'dim', `${tw.kills} KILLS`));
    if (!mine) box.append(el('div', 'dim', `${label(R.roster.get(tw.owner)?.pepe ?? 0)}'S`));
    else {
      const ups = upgradesOf(tw.kind);
      ups.forEach((k, i) => {
        const u = TOWERS[k], b = el('button', 'btn');
        b.type = 'button'; b.disabled = gold < u.cost;
        b.append(towerIcon(k), el('span', '', `${i + 1} · ${u.name} · ${u.cost}G`));
        b.title = u.about;
        b.addEventListener('click', () => { send({ t: 'sgup', x: R.sel % GRID, y: Math.floor(R.sel / GRID), k }); play('click'); });
        box.append(b);
      });
      if (!ups.length) box.append(el('div', 'dim', 'FULLY UPGRADED'));
      const sellB = el('button', 'btn ghost', `SELL · +${Math.floor(spentOn(tw.kind) * ROUND.SELL)}G (X)`); sellB.type = 'button';
      sellB.addEventListener('click', () => send({ t: 'sgsell', x: R.sel % GRID, y: Math.floor(R.sel / GRID) }));
      box.append(sellB);
    }
  }
  /** A little picture of a block or tower for the panel. */
  const icons = new Map();
  function towerIcon(kind) {
    let src = icons.get(kind);
    if (!src) {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const g = c.getContext('2d'), P = (x, y, z = 0) => [12 + (x - y) * 10, 15 + (x + y) * 5 - z * 0.6];
      drawTower(g, P, -0.5, -0.5, { kind, owner: 0 }, -1, 1e12, 0);
      src = c.toDataURL(); icons.set(kind, src);
    }
    const img = el('img', 'gt-icon'); img.src = src; img.alt = '';
    return img;
  }
  $('sg-go').addEventListener('click', () => send({ t: 'arenaGo' }));
  $('sg-next').addEventListener('click', () => send({ t: 'sgnext' }));
  $('sg-quit').addEventListener('click', () => (R.ended ? leave() : ask()));
  $('sg-fold').addEventListener('click', () => $('sg').classList.toggle('folded'));

  // ---------------------------------------------------------------- the end
  function finish(m) {
    R.ended = m; R.st = 'ended'; R.sel = -1;
    const box = $('sg-card'); box.replaceChildren();
    box.append(el('h3', '', m.won ? `THE WATCHER STANDS · ALL ${WAVES_TOTAL} WAVES` : `THE WATCHER FELL ON WAVE ${m.wave}`));
    box.append(el('p', 'mg-sub', `${m.waves} ${m.waves === 1 ? 'WAVE' : 'WAVES'} HELD · ${m.kills} OF THE SWARM DOWN · ${m.leaks} GOT THROUGH`));
    if (m.best?.length) {
      const ol = el('ol', 'gt-best');
      for (const [kind, dmg, kills] of m.best) { const li = el('li'); li.append(towerIcon(kind), el('span', '', TOWERS[kind].name), el('span', 'dim', `${dmg.toLocaleString('en-US')} DAMAGE · ${kills} KILLS`)); ol.append(li); }
      box.append(el('h5', '', 'THE BEST TOWERS'), ol);
    }
    if (m.r?.length > 1) {
      const ol = el('ol', 'gt-best');
      for (const [id, pepe, kills, dmg] of m.r) { const li = el('li'), dot = el('i', 'sg-dot'); dot.style.background = colorOf(id); li.append(dot, el('span', '', id === R.you ? 'YOU' : label(pepe)), el('span', 'dim', `${kills} KILLS · ${dmg.toLocaleString('en-US')} DAMAGE`)); ol.append(li); }
      box.append(el('h5', '', 'THE TEAM'), ol);
    }
    const og = el('p', 'mg-sub', guest() ? 'GUESTS PLAY FOR FUN' : m.pay ? `+${m.pay} $SWARM FOR REACHING WAVE ${m.wave}` : '');
    og.id = 'sg-og'; box.append(og);
    const row = el('div', 'mg-actions');
    const a = el('button', 'btn', 'PLAY AGAIN'); a.type = 'button'; a.addEventListener('click', () => { R.again = true; leave(); });
    const b2 = el('button', 'btn ghost', 'BACK TO TOWN'); b2.type = 'button'; b2.addEventListener('click', leave);
    row.append(a, b2); box.append(row);
    box.hidden = false;
    play(m.won ? 'win' : 'lose');
    panel();
  }
  function og(gained) { const p = $('sg-og'); if (p) { p.textContent = `+${gained} $SWARM · BUILD AND DECORATE WITH THEM`; p.classList.add('og'); } }
  function ask() {
    R.asking = true;
    const box = $('sg-card'); box.replaceChildren();
    box.append(el('h3', '', 'LEAVE THE SIEGE?'), el('p', 'mg-sub', R.mode === 'coop' && R.roster.size > 1 ? 'THE OTHERS HOLD ON WITHOUT YOU (YOUR LANE BECOMES ANYONE\'S).' : 'THE RUN ENDS HERE.'));
    const row = el('div', 'mg-actions');
    const a = el('button', 'btn', 'KEEP PLAYING'); a.type = 'button'; a.addEventListener('click', keepPlaying);
    const b2 = el('button', 'btn ghost', 'LEAVE'); b2.type = 'button'; b2.addEventListener('click', leave);
    row.append(a, b2); box.append(row); box.hidden = false;
  }
  function keepPlaying() { R.asking = false; $('sg-card').hidden = true; }
  function leave() { send({ t: 'arenaLeave' }); }
  /** Back in town: close, and say whether they asked to go again (and which way). */
  function exit() {
    if (!R.open) return false;
    R.open = false;
    $('sg').hidden = true; $('sg-card').hidden = true; $('sg-banner').hidden = true;
    ctx.world.exit();
    ctx.onClose?.();
    return R.again ? R.mode : false;
  }
  return { open, exit, isOpen: () => R.open, key, message, og, err, click, hover, ground, items, overlay, state: R };
}

/** The kit's name for this game's browser module (the world calls it createSiegeGame). */
export const createClient = createSiegeGame;
/**
 * The map: lanes and the Mixer are grass, the corners cobbled walkways, the Watcher on its square, sand and water
 * round it all, woods outside. (T: tile kinds, N: map size.)
 */
export function createMap(T, N) {
  const tiles = new Uint8Array(N * N);
  const lo = FO - RING, hi = FO + GRID + RING;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x - FO, fy = y - FO, inField = fx >= 0 && fy >= 0 && fx < GRID && fy < GRID;
    const ring = x >= lo && y >= lo && x < hi && y < hi, moat = x >= lo - 2 && y >= lo - 2 && x < hi + 2 && y < hi + 2;
    tiles[y * N + x] = inField ? (isCore(fx, fy) ? T.WATCHER : keepClear(fx, fy) && zone(fx, fy) === 4 ? T.PLAZA : zone(fx, fy) >= 0 ? T.GRASS : T.PATH) : ring ? T.SAND : moat ? T.WATER : T.GRASS;
  }
  const nodes = new Map();
  let r = 131;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (tiles[y * N + x] !== T.GRASS || (x >= lo - 2 && y >= lo - 2 && x < hi + 2 && y < hi + 2)) continue;
    if (rnd() < 0.18) nodes.set(`${x},${y}`, { kind: rnd() < 0.8 ? 'tree' : 'rock', x, y, v: Math.floor(rnd() * 4) });
  }
  return { tiles, nodes };
}
