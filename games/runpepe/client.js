// RUN PEPE RUN in the browser, on the town's own engine: the track round the Watcher, everyone's Pepe running it,
// the swarm wandering the stretches, downed Pepes in glowing circles. The server moves everyone and says who's down
// or back; the swarm isn't sent at all: it's stepped here from the level's seed exactly as the server steps it
// (rules.js), and shown at the moment your own (predicted) Pepe is at, so what you dodge on screen is what
// the server checks.
//
// The host (the town engine in the world, engine/host.js here) hosts it like SWARM SIEGE: ground(), items(), overlay() each frame, click() for the map,
// key() for keys, and the runners kept in its own player list (ctx.world).
import { LEVELS, STEP, ROUND, START, FINISH, SAFE, STRETCHES, KINDS, createSwarm, stepSwarm, copySwarm, addEffect, levelMix, runReward, SKILLS, SKILL_KEYS, ITEMS, MAX_SKILLS, MAX_RANK, SLOTS } from './rules.js';
import { ENEMY_SPRITES, ENEMY_COLORS } from '../../engine/sprites.js';
import { textArt } from '../../engine/text.js';
import { WATCHER } from '../../engine/world.js';
import { STREAM, walkable, freeAt } from './rules.js';

const CAST_KEYS = ['q', 'e', 'r', 'f'];
const FX_COLORS = { root: '#7dff8a', frost: '#9fe3ff', shove: '#ffffff', trap: '#e3b341' };
const COLORS = ['#c9db4c', '#7ad7ff', '#ffb070', '#c6a8ff', '#ff7eb6', '#7dff8a', '#ffe066', '#ff8f6b'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();

export function createRunGame(ctx) {
  const { $, el, send, snd, label, guest } = ctx;
  const reduceMotion = () => !!ctx.reduceMotion;
  const R = {
    open: false, you: 0, host: 0, mode: 'solo', st: 'countdown', startsAt: 0, level: 0, at: 0, seed: 0, pause: 0, cleared: 0,
    roster: new Map(), people: new Map(), sw: null, prev: null, offs: [], rtt: 120, pings: [], pingAt: 0, pingT: 0, shown: 0,
    fx: [], floats: [], ended: null, again: false, asking: false, bannerT: 0, secShown: -1, lastSound: {},
    /** Copies of the swarm every 10 steps (to go back to when a skill lands in the past), the level's skills, things on the track, your own state. */
    copies: new Map(), fxAll: [], items: [], mine: null, mineAt: 0, picking: false,
  };
  const me = () => R.people.get(R.you);
  const colorOf = (id) => R.roster.get(id)?.color ?? '#ffffff';

  // ---------------------------------------------------------------- the server's clock, and the swarm on it
  /** Each update says the server's step: the smallest (arrival - step time) seen lately is our best line on its clock. */
  function heard(s) {
    R.offs.push(now() - s * STEP * 1000);
    if (R.offs.length > 60) R.offs.shift();
  }
  /** The server's step the swarm should be drawn at now: its clock, plus a round trip (that's how far ahead your own Pepe is shown). */
  function stepNow() {
    if (!R.offs.length) return 0;
    const base = Math.min(...R.offs), target = (now() - base + clamp(R.rtt, 30, 400)) / (STEP * 1000);
    // Never backwards, and no sudden lurches forward.
    R.shown = R.shown && target < R.shown ? R.shown : R.shown && target - R.shown > 20 ? target : Math.max(R.shown, target);
    return R.shown;
  }
  function newLevel(level, at, fx = []) {
    R.level = level; R.at = at; R.sw = level ? createSwarm(R.seed, level) : null; R.prev = null; R.copies = new Map(); R.fxAll = [];
    for (const e of fx) skillOnSwarm(e, false);
  }
  /**
   * A skill landed on the swarm at step e[0]. Ours may have run past that already (it runs a round trip ahead): go
   * back to the last copy from before it and play forward again with it in, so it's exactly the server's swarm.
   */
  function skillOnSwarm(e, show = true) {
    if (!R.sw) return;
    R.fxAll.push(e); addEffect(R.sw, e);
    if (R.sw.step > e[0]) {
      let best = -1; for (const k of R.copies.keys()) if (k <= e[0] && k > best) best = k;
      if (best >= 0) { R.sw = copySwarm(R.copies.get(best)); }
      else { const fx = R.fxAll; R.sw = createSwarm(R.seed, R.level); for (const x of fx) addEffect(R.sw, x); }
      for (const k of [...R.copies.keys()]) if (k > best) R.copies.delete(k);
      R.prev = null;
    }
    if (show) {
      const [, kind, x, y, a] = e, col = FX_COLORS[kind] ?? '#ffffff', t = now();
      if (kind === 'trap') bits(x, y, col, 6);
      else R.fx.push({ k: 'ring', x, y, col, r0: 0.3, r1: kind === 'root' ? 1.2 : a, born: t, life: kind === 'shove' ? 260 : 420 });
      play(kind === 'frost' ? 'zap' : kind === 'shove' ? 'bonk' : 'whip', 60);
    }
  }
  /** The swarm at a (fractional) step: stepped up to it, and between its last two steps. */
  function swarmAt(step) {
    const sw = R.sw; if (!sw) return [];
    const k = step - R.at;
    if (k - sw.step > 4000) { newLevel(R.level, R.at); return []; } // far behind: a fresh start next frame
    while (sw.step < Math.floor(k)) {
      if (sw.step % 10 === 0 && !R.copies.has(sw.step)) { R.copies.set(sw.step, copySwarm(sw)); for (const s0 of R.copies.keys()) if (s0 < sw.step - 600) R.copies.delete(s0); }
      if (sw.step === Math.floor(k) - 1) R.prev = sw.creeps.map((c) => [c.x, c.y]);
      stepSwarm(sw);
    }
    const f = clamp(k - Math.floor(k), 0, 1), out = [];
    sw.creeps.forEach((c, i) => { const p = R.prev?.[i]; out.push({ c, x: p && Math.abs(p[0] - c.x) < 1 ? p[0] + (c.x - p[0]) * f : c.x, y: p && Math.abs(p[1] - c.y) < 1 ? p[1] + (c.y - p[1]) * f : c.y }); });
    return out;
  }

  // ---------------------------------------------------------------- what the server says
  function open(w) {
    const was = R.open;
    R.open = true; R.you = w.you; R.host = w.host; R.mode = w.mode; R.st = w.st; R.startsAt = now() + w.startsIn; R.seed = w.seed;
    R.ended = null; R.again = false; R.asking = false; R.fx = []; R.floats = []; R.offs = []; R.shown = 0; R.pause = w.pause; R.cleared = w.cleared;
    setRoster(w.r, w.host);
    $('rp').hidden = false; $('rp-card').hidden = true;
    ctx.world.enter({ players: [...R.roster.entries()].map(([id, r]) => [id, r.pepe]), you: R.you });
    heard(w.s);
    newLevel(w.level, w.at, w.fx ?? []);
    R.items = w.items ?? []; R.picking = false;
    if (w.me) mineIs(w.me);
    people(w.p);
    if (w.rejoined) banner('RECONNECTED', 'BACK ON THE TRACK');
    else if (!was) banner('RUN PEPE RUN', R.mode === 'coop' && R.st === 'countdown' ? 'WAITING FOR FRIENDS · WALK ABOUT' : 'RUN THE LAP · DODGE THE SWARM');
    clearInterval(R.pingT); R.pingT = setInterval(ping, 2000); ping();
    panel();
  }
  function ping() { if (!R.open) return; R.pingAt = now(); send({ t: 'ping' }); }
  function pong() {
    if (!R.open || !R.pingAt) return false;
    R.pings.push(now() - R.pingAt); R.pingAt = 0;
    if (R.pings.length > 6) R.pings.shift();
    R.rtt = Math.min(...R.pings);
    return true;
  }
  function setRoster(r, host) {
    R.roster = new Map(r.map(([id, pepe, off], i) => [id, { pepe, off: !!off, color: COLORS[i % COLORS.length] }]));
    if (host) R.host = host;
    if (R.open) ctx.world.players([...R.roster.entries()].map(([id, x]) => [id, x.pepe]));
  }
  /** Everyone's place and state: moved in the host's list; downed Pepes are see-through in their circles. */
  function people(p) {
    const list = [], was = R.people;
    R.people = new Map();
    for (let i = 0; i < p.length; i += 8) {
      const [id, x, y, fl, facing, saves, downs, lvl] = p.slice(i, i + 8), up = !!(fl & 1);
      R.people.set(id, { id, x: x / 10, y: y / 10, up, safe: !!(fl & 4), sprint: !!(fl & 8), saves, downs, lvl });
      list.push([id, x / 10, y / 10, fl & 2 ? 1 : 0, facing]);
      if (was.get(id)?.up !== up) ctx.world.set(id, { ghost: !up });
    }
    ctx.world.move(list);
  }
  function message(m) {
    switch (m.t) {
      case 'rpw': open(m); return true;
      case 'rproster': setRoster(m.r, m.host); panel(); return true;
      case 'rplevel': {
        heard(m.s); R.st = 'running'; R.pause = 0;
        newLevel(m.level, m.at); people(m.p); R.items = m.items ?? [];
        const { counts } = levelMix(m.level), n = counts.reduce((a, b) => a + b, 0);
        banner(`LEVEL ${m.level}`, m.level === 1 ? 'RUN THE WHOLE LAP TO THE FINISH · RUN THROUGH A DOWNED TEAMMATE TO BRING THEM BACK' : `${n} OF THE SWARM A STRETCH · ${m.level >= LEVELS ? 'THE LAST LAP' : 'FASTER NOW'}`);
        play('start');
        panel();
        return true;
      }
      case 'rps': {
        heard(m.s); R.pause = m.pause; R.cleared = m.cleared;
        people(m.p);
        for (const e of m.e ?? []) event(e);
        if (Math.floor(now() / 250) !== R.panelTick) { R.panelTick = Math.floor(now() / 250); panel(); }
        return true;
      }
      case 'rpend': finish(m); return true;
      case 'rpme': mineIs(m); return true;
      default: return false;
    }
  }
  function event(e) {
    const t = now();
    switch (e[0]) {
      case 'sfx': skillOnSwarm(e.slice(1)); break;
      case 'tp': {
        const [, id, fx, fy, tx, ty] = e;
        bits(fx / 10, fy / 10, '#c6a8ff', 8); bits(tx / 10, ty / 10, '#ffffff', 8); play('zap', 60);
        // Your own blink: move the Pepe you see by the same amount (it's ahead of the server's).
        if (id === R.you) ctx.world.shift?.(id, (tx - fx) / 10, (ty - fy) / 10);
        break;
      }
      case 'pick': {
        const it = R.items.find((x) => x[0] === e[2]); R.items = R.items.filter((x) => x[0] !== e[2]);
        if (it && e[1] === R.you) { R.floats.push({ x: it[2], y: it[3], z: 26, text: e[3] === 'tome' ? 'XP TOME!' : ITEMS[e[3]].name, col: e[3] === 'tome' ? '#c6a8ff' : '#e3b341', born: t, life: 1300 }); play('pick'); }
        else if (it) bits(it[2], it[3], '#e3b341', 5);
        break;
      }
      case 'xp': {
        if (e[1] !== R.you) break;
        const q = ctx.world.where(R.you);
        if (q) R.floats.push({ x: q[0], y: q[1], z: 46, text: `+${e[2]} XP`, col: '#c6a8ff', born: t, life: 1100 });
        break;
      }
      case 'lvl': {
        const q = R.people.get(e[1]);
        if (q) { R.floats.push({ x: q.x, y: q.y, z: 40, text: `LEVEL ${e[2]}!`, col: '#c6a8ff', born: t, life: 1500 }); R.fx.push({ k: 'pillar', x: q.x, y: q.y, born: t, life: 700 }); }
        if (e[1] === R.you) { play('levelup'); R.picking = true; }
        break;
      }
      case 'block': { const q = R.people.get(e[1]); if (q) { R.fx.push({ k: 'ring', x: q.x, y: q.y, col: '#7ad7ff', r0: 0.4, r1: 1.2, born: t, life: 400 }); bits(q.x, q.y, '#7ad7ff', 10); } play('bonk'); break; }
      case 'down': {
        const x = e[2] / 10, y = e[3] / 10;
        bits(x, y, '#ffffff', 10); bits(x, y, colorOf(e[1]), 8);
        R.floats.push({ x, y, z: 30, text: e[1] === R.you ? 'REKT' : `${label(R.roster.get(e[1])?.pepe ?? 0)} DOWN`, col: '#ff8f6b', born: t, life: 1300 });
        if (e[1] === R.you) { ctx.shake?.(4); play('down'); banner("YOU'RE DOWN", 'A TEAMMATE CAN RUN THROUGH YOUR CIRCLE TO BRING YOU BACK'); }
        else play('hurt', 100);
        break;
      }
      case 'save': {
        const q = R.people.get(e[2]); if (q) { bits(q.x, q.y, '#c9db4c', 14); R.fx.push({ k: 'ring', x: q.x, y: q.y, col: '#c9db4c', r0: 0.3, r1: 1.6, born: t, life: 500 }); }
        if (q) R.floats.push({ x: q.x, y: q.y, z: 34, text: e[1] === R.you ? 'SAVED!' : 'BACK', col: '#c9db4c', born: t, life: 1200 });
        play('revive');
        break;
      }
      case 'clear': {
        const who = e[2] === R.you ? 'YOU MADE IT' : `${label(R.roster.get(e[2])?.pepe ?? 0)} MADE IT`;
        banner(`LEVEL ${e[1]} CLEARED`, e[1] >= LEVELS ? `${who} · ALL ${LEVELS} LEVELS!` : `${who} · EVERYONE'S BACK · NEXT LEVEL IN A MOMENT`);
        play('levelup');
        break;
      }
      case 'wipe': banner('EVERYONE DOWN', `THE SWARM GOT YOU ON LEVEL ${e[1]}`); play('lose'); ctx.shake?.(6); break;
    }
  }
  function bits(x, y, col, n, z = 6) {
    if (reduceMotion()) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, sp = 0.6 + Math.random() * 0.8; R.fx.push({ k: 'bit', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, up: 6 + Math.random() * 12, col: i % 3 ? col : '#ffffff', born: now(), life: 450 + Math.random() * 250 }); }
  }
  function play(name, gapMs = 0) { const t = now(); if (gapMs && t - (R.lastSound[name] ?? 0) < gapMs) return; R.lastSound[name] = t; snd.play(name); }
  function banner(text, sub) {
    const b = $('rp-banner'); b.replaceChildren(el('b', '', text), ...(sub ? [el('span', '', sub)] : []));
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(R.bannerT); R.bannerT = setTimeout(() => { b.hidden = true; }, 2800);
  }

  // ---------------------------------------------------------------- drawing, in the host's frame
  function rect(g, P, [x0, y0, x1, y1], fill, stroke, lw = 1) {
    g.beginPath(); for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const [sx, sy] = P(x, y); g.lineTo(sx, sy); } g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }
  function ring(g, P, x, y, r, fill, stroke, lw = 1) {
    const [sx, sy] = P(x, y);
    g.beginPath(); g.ellipse(sx, sy, r * 22.6, r * 11.3, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }
  function label3(g, P, x, y, text, col) { const [sx, sy] = P(x, y, 2), a = textArt(text, col, true); g.drawImage(a, Math.round(sx - a.width / 2), Math.round(sy - a.height / 2)); }
  /** On the ground: the stretches, the safe corners, START and FINISH, arrows round the lap, downed Pepes' circles. */
  function ground(g, P, T) {
    if (!R.open) return;
    const t = now();
    for (const r of STRETCHES) rect(g, P, r, 'rgba(239,107,85,.07)', 'rgba(239,107,85,.35)');
    for (const r of SAFE.slice(1)) rect(g, P, r, 'rgba(201,219,76,.12)', 'rgba(201,219,76,.6)', 2);
    rect(g, P, START, 'rgba(122,215,255,.14)', '#7ad7ff', 2);
    rect(g, P, FINISH, `rgba(227,179,65,${0.16 + (reduceMotion() ? 0 : 0.08 * Math.sin(T * 4))})`, '#e3b341', 2);
    label3(g, P, (START[0] + START[2]) / 2, START[1] + 1.4, 'START', '#7ad7ff');
    label3(g, P, (FINISH[0] + FINISH[2]) / 2, (FINISH[1] + FINISH[3]) / 2, 'FINISH', '#e3b341');
    // Chevrons along the middle of each stretch, the way round.
    const lap = [[[16, 9.5], [48, 9.5]], [[54.5, 16], [54.5, 48]], [[48, 54.5], [16, 54.5]], [[9.5, 48], [9.5, 25]]];
    const off = reduceMotion() ? 0 : (t / 900) % 1;
    g.fillStyle = 'rgba(255,246,216,.35)';
    for (const [[ax, ay], [bx, by]] of lap) {
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let d = off * 4; d < len; d += 4) {
        const cx = ax + ux * d, cy = ay + uy * d, tip = P(cx + ux * 0.5, cy + uy * 0.5), l = P(cx - ux * 0.3 - uy * 0.5, cy - uy * 0.3 + ux * 0.5), r = P(cx - ux * 0.3 + uy * 0.5, cy - uy * 0.3 - ux * 0.5);
        g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(l[0], l[1]); g.lineTo(r[0], r[1]); g.closePath(); g.fill();
      }
    }
    // Downed Pepes' circles: run through one to bring them back.
    for (const p of R.people.values()) {
      if (p.up) continue;
      const pulse = reduceMotion() ? 0 : Math.sin(T * 5 + p.id) * 0.08, col = colorOf(p.id);
      ring(g, P, p.x, p.y, ROUND.REVIVE + pulse, col + '33', col, 2);
      ring(g, P, p.x, p.y, (ROUND.REVIVE + pulse) * 0.6, null, 'rgba(255,255,255,.5)', 1);
    }
    // Snares lying in wait.
    for (const tr of R.sw?.traps ?? []) if (tr.until > R.sw.step) { ring(g, P, tr.x, tr.y, 0.5, 'rgba(227,179,65,.18)', '#e3b341', 1); const [sx, sy] = P(tr.x, tr.y); g.fillStyle = '#7a5532'; g.fillRect(Math.round(sx) - 4, Math.round(sy), 8, 1); g.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 4); }
    // Sprinting: dust behind.
    for (const p of R.people.values()) if (p.up && p.sprint && !reduceMotion() && Math.random() < 0.3) { const at = ctx.world.where(p.id) ?? [p.x, p.y]; R.fx.push({ k: 'bit', x: at[0], y: at[1], z: 1, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, up: 2, col: '#e8d4a0', born: now(), life: 300 }); }
    // Just back (or between levels): a shimmer round them.
    for (const p of R.people.values()) if (p.up && p.safe) { const at = ctx.world.where(p.id) ?? [p.x, p.y]; ring(g, P, at[0], at[1], 0.55, null, `rgba(201,219,76,${0.4 + 0.3 * Math.sin(T * 10)})`, 1); }
  }
  /** The swarm, depth-sorted with everyone else. */
  function items(list, g, P) {
    if (!R.open || !R.sw) return;
    const t = now();
    const at = R.sw.step;
    for (const { c, x, y } of swarmAt(stepNow())) list.push({ d: x + y, draw: () => drawCreep(g, P, c, x, y, t, at) });
    for (const [, kind, x, y] of R.items) list.push({ d: x + y, draw: () => { const [sx, sy] = P(x, y, 6 + (reduceMotion() ? 0 : Math.sin(t / 300 + x) * 2)), img = itemArt(kind, 2); g.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height)); } });
    // The tome on the finish square: whoever's first there.
    if (R.st === 'running' && !R.pause) { const fx = (FINISH[0] + FINISH[2]) / 2, fy = (FINISH[1] + FINISH[3]) / 2 + 1.5; list.push({ d: fx + fy, draw: () => { const [sx, sy] = P(fx, fy, 8 + (reduceMotion() ? 0 : Math.sin(t / 250) * 2)), img = itemArt('tome', 2); g.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height)); } }); }
  }
  /** Little pixel pictures of the things on the track (and in your slots). */
  const art = new Map();
  function itemArt(kind, scale = 1) {
    const key = kind + scale; if (art.has(key)) return art.get(key);
    const c = document.createElement('canvas'); c.width = 12 * scale; c.height = 12 * scale;
    const g = c.getContext('2d'); g.scale(scale, scale);
    const px = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (kind === 'tome') { px('#3a1f6b', 2, 2, 8, 9); px('#7a4fd8', 3, 2, 7, 8); px('#f4f0ff', 3, 9, 7, 1); px('#e3b341', 5, 4, 3, 1); px('#e3b341', 6, 3, 1, 3); px('#c6a8ff', 4, 7, 4, 1); }
    else if (kind === 'sneakers') { px('#ef6b55', 2, 6, 6, 3); px('#ffffff', 2, 9, 8, 1); px('#ef6b55', 7, 7, 3, 2); px('#ffffff', 4, 6, 1, 1); px('#ffffff', 6, 6, 1, 1); }
    else if (kind === 'feather') { px('#c6a8ff', 6, 1, 2, 8); px('#e8d8ff', 4, 3, 2, 5); px('#e8d8ff', 8, 3, 2, 4); px('#8a6bd8', 6, 9, 1, 2); }
    else if (kind === 'wand') { px('#7a5532', 2, 9, 2, 2); px('#7a5532', 4, 7, 2, 2); px('#7a5532', 6, 5, 2, 2); px('#7dff8a', 8, 2, 3, 3); px('#c8ffb0', 9, 3, 1, 1); }
    else if (kind === 'orb') { px('#2b5f80', 3, 3, 6, 6); px('#9fe3ff', 4, 4, 4, 4); px('#ffffff', 5, 4, 1, 1); px('#5aa8d6', 3, 9, 6, 1); }
    else if (kind === 'magnet') { px('#ef6b55', 2, 2, 3, 6); px('#ef6b55', 7, 2, 3, 6); px('#ef6b55', 2, 6, 8, 3); px('#d8dde6', 2, 2, 3, 2); px('#d8dde6', 7, 2, 3, 2); }
    else if (kind === 'clover') { px('#3fae4a', 3, 2, 3, 3); px('#3fae4a', 6, 2, 3, 3); px('#3fae4a', 3, 5, 3, 3); px('#3fae4a', 6, 5, 3, 3); px('#7dff8a', 4, 3, 1, 1); px('#2d6a34', 6, 8, 1, 3); }
    else if (kind === 'charm') { px('#7ad7ff', 2, 2, 8, 6); px('#7ad7ff', 3, 8, 6, 2); px('#7ad7ff', 5, 10, 2, 1); px('#ffffff', 4, 3, 2, 3); px('#2b6f9f', 6, 4, 2, 4); }
    else if (kind === 'flare') { px('#7a2a20', 5, 4, 2, 7); px('#ef6b55', 4, 2, 4, 3); px('#ffe066', 5, 1, 2, 2); px('#ffffff', 5, 2, 1, 1); }
    art.set(key, c); return c;
  }
  function drawCreep(g, P, c, x, y, t, at) {
    // Held by a root or a snare: vines round its feet; frosted: a blue chill.
    if (c.rootUntil > at) { const [vx, vy] = P(x, y); g.strokeStyle = '#3fae4a'; g.lineWidth = 2; g.beginPath(); g.ellipse(vx, vy, c.r * 26, c.r * 13, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#7dff8a'; for (let i = 0; i < 5; i++) { const a = i * 1.26 + c.x; g.fillRect(Math.round(vx + Math.cos(a) * c.r * 24), Math.round(vy + Math.sin(a) * c.r * 12) - 3, 1, 4); } }
    if (c.slowUntil > at) { const [vx, vy] = P(x, y); g.fillStyle = 'rgba(159,227,255,.35)'; g.beginPath(); g.ellipse(vx, vy, c.r * 24, c.r * 12, 0, 0, Math.PI * 2); g.fill(); }
    const [, look] = KINDS[c.kind], spr = ENEMY_SPRITES[look] ?? ENEMY_SPRITES.clone, scale = c.r * 2;
    const [sx, sy] = P(x, y), w = Math.round(spr.w * scale), h = Math.round(spr.h * scale);
    const fr = spr.walk[Math.floor(t / (c.kind === 1 ? 70 : 110) + c.x * 0.3) & 3], img = c.vx - c.vy < 0 ? fr.left : fr.right;
    g.fillStyle = 'rgba(5,10,15,.35)'; g.beginPath(); g.ellipse(sx, sy, c.r * 22, c.r * 11, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + 1 - (spr.hover ? 4 : 0)), w, h);
  }
  function overlay(g, P, T) {
    if (!R.open) return;
    const t = now();
    for (const f of R.fx) {
      const k = clamp((t - f.born) / f.life, 0, 1);
      if (f.k === 'bit') {
        const [sx, sy] = P(f.x + f.vx * k * 0.7, f.y + f.vy * k * 0.7, f.z + Math.sin(k * Math.PI) * f.up);
        g.globalAlpha = 1 - k * k; g.fillStyle = f.col; g.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, k < 0.5 ? 3 : 2, k < 0.5 ? 3 : 2); g.globalAlpha = 1;
      } else if (f.k === 'pillar') {
        const [sx, sy] = P(f.x, f.y);
        g.globalAlpha = (1 - k) * 0.45; g.fillStyle = '#c6a8ff'; g.fillRect(sx - 6, sy - 60, 12, 60);
        g.globalAlpha = (1 - k) * 0.8; g.fillStyle = '#f4f0ff'; g.fillRect(sx - 2, sy - 60, 4, 60); g.globalAlpha = 1;
      } else if (f.k === 'ring') {
        const r = f.r0 + (f.r1 - f.r0) * k, [sx, sy] = P(f.x, f.y, 0);
        g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, r * 22.6, r * 11.3, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    R.fx = R.fx.filter((f) => t - f.born < f.life);
    for (const f of R.floats) {
      const k = (t - f.born) / f.life, [sx, sy] = P(f.x, f.y, f.z + k * 16), art = textArt(f.text, f.col);
      g.globalAlpha = clamp(1 - k, 0, 1); g.drawImage(art, Math.round(sx - art.width / 2), Math.round(sy)); g.globalAlpha = 1;
    }
    R.floats = R.floats.filter((f) => t - f.born < f.life);
    if (Math.floor(T) !== R.secShown) { R.secShown = Math.floor(T); top(); }
    if (Math.floor(t / 100) !== R.barTick) { R.barTick = Math.floor(t / 100); bar(); }
  }

  // ---------------------------------------------------------------- input
  /** A click on the map: just walk there (the host does it). */
  function click() { return false; }
  function hover() {}
  function key(ev, down) {
    if (!R.open || !down) return false;
    const k = ev.key.toLowerCase();
    if (k === 'escape') { if (R.asking) keepPlaying(); else if (R.ended) leave(); else ask(); return true; }
    if (k === 'enter' && R.st === 'countdown' && R.host === R.you) { send({ t: 'arenaGo' }); return true; }
    const ci = CAST_KEYS.indexOf(k);
    if (ev.repeat && (ci >= 0 || /^[1-6]$/.test(k))) return true;
    if (ci >= 0) { castSlot(ci); return true; }
    if (/^[1-6]$/.test(k)) { useSlot(Number(k) - 1); return true; }
    if (k === 'k' || k === 't') { R.picking = !R.picking; picker(); return true; }
    return false;
  }
  function castSlot(i) { const sk = R.mine?.sk[i]; if (!sk || !SKILLS[sk[0]].cd) return; if (cdLeft(i) > 0) { play('warn', 300); return; } send({ t: 'rpcast', i }); }
  function useSlot(i) { const it = R.mine?.inv[i]; if (!it || !ITEMS[it[0]].use) return; send({ t: 'rpuse', i }); }
  /** Your own XP, skills and things, from the server. */
  function mineIs(m) { R.mine = m; R.mineAt = now(); R.mineS = m.s; picker(); bar(true); }
  /** Seconds before skill slot i is ready again (counted down here from the server's word). */
  function cdLeft(i) { const sk = R.mine?.sk[i]; if (!sk) return 0; return Math.max(0, sk[2] * STEP - (now() - R.mineAt) / 1000); }
  /** How fast your Pepe runs now (the host shows your keys at once with it). */
  function speed() { const m = R.mine; if (!m) return ROUND.SPEED; const sprintOver = m.sprint && (now() - R.mineAt) / 1000 > m.sprint * STEP; return ROUND.SPEED * (sprintOver ? 1 : m.spd / 100); }
  /** The bar at the bottom: XP, your four skills (Q E R F) with their cooldowns, your six slots (1-6). */
  function bar(rebuild = false) {
    const box = $('rp-bar'), m = R.mine; if (!box) return;
    box.hidden = !m || R.st === 'ended' || !!R.ended;
    if (!m) return;
    const key = JSON.stringify([m.sk.map((x) => x.slice(0, 2)), m.inv, m.lvl, m.pts]);
    if (rebuild || box.dataset.key !== key) {
      box.dataset.key = key; box.replaceChildren();
      const xp = el('div', 'rp-xp'), fill = el('i'); fill.style.width = `${Math.round((m.xp / m.need) * 100)}%`; xp.append(fill, el('span', '', `LV ${m.lvl} · ${m.xp}/${m.need} XP`));
      const pts = el('button', 'rp-pts', m.pts ? `+${m.pts} SKILL POINT${m.pts > 1 ? 'S' : ''} (K)` : 'SKILLS (K)'); pts.type = 'button'; pts.classList.toggle('on', m.pts > 0);
      pts.addEventListener('click', () => { R.picking = !R.picking; picker(); });
      xp.append(pts); box.append(xp);
      const row = el('div', 'rp-slots');
      for (let i = 0; i < MAX_SKILLS; i++) {
        const sk = m.sk[i], b = el('button', 'rp-slot skill'); b.type = 'button';
        if (sk) { const s = SKILLS[sk[0]]; b.append(el('b', '', s.name), el('small', '', `${'●'.repeat(sk[1])}${'○'.repeat(MAX_RANK - sk[1])}`), el('kbd', '', CAST_KEYS[i].toUpperCase()), el('i', 'cd')); b.title = `${s.name}: ${s.about}`; if (!s.cd) b.classList.add('passive'); b.addEventListener('click', () => castSlot(i)); }
        else { b.disabled = true; b.append(el('kbd', '', CAST_KEYS[i].toUpperCase())); }
        row.append(b);
      }
      row.append(el('span', 'rp-gap'));
      for (let i = 0; i < SLOTS; i++) {
        const it = m.inv[i], b = el('button', 'rp-slot item'); b.type = 'button';
        if (it) { const img = itemArt(it[0], 3); img.className = 'rp-item'; b.append(img); if (it[1] > 1) b.append(el('small', 'rp-n', String(it[1]))); b.title = `${ITEMS[it[0]].name}: ${ITEMS[it[0]].about}`; if (!ITEMS[it[0]].use) b.classList.add('passive'); b.addEventListener('click', () => useSlot(i)); }
        else b.disabled = true;
        b.append(el('kbd', '', String(i + 1)));
        row.append(b);
      }
      box.append(row);
    }
    // Cooldowns, every tenth of a second.
    box.querySelectorAll('.rp-slot.skill').forEach((b, i) => { const cd = b.querySelector('.cd'); if (!cd) return; const left = cdLeft(i), full = SKILLS[m.sk[i]?.[0]]?.cd?.[(m.sk[i]?.[1] ?? 1) - 1] ?? 1; cd.style.height = `${Math.min(100, (left / full) * 100)}%`; cd.textContent = left > 0 ? String(Math.ceil(left)) : ''; });
  }
  /** Spending skill points: the eight skills, what you have of each. */
  function picker() {
    const box = $('rp-pick'), m = R.mine; if (!box) return;
    box.hidden = !R.picking || !m || !!R.ended;
    if (box.hidden) return;
    box.replaceChildren();
    const head = el('div', 'gt-bookhead'), close = el('button', 'btn ghost', '×'); close.type = 'button'; close.addEventListener('click', () => { R.picking = false; picker(); });
    head.append(el('b', '', m.pts ? `PICK A SKILL · ${m.pts} POINT${m.pts > 1 ? 'S' : ''}` : 'SKILLS · LEVEL UP FOR POINTS'), close); box.append(head);
    box.append(el('p', 'dim', `LEARN UP TO ${MAX_SKILLS} OF THE ${SKILL_KEYS.length}, EACH UP TO RANK ${MAX_RANK}. XP: FIRST TO THE FINISH TAKES THE TOME, TOMES ON THE TRACK, BRINGING TEAMMATES BACK.`));
    const list = el('div', 'rp-skills'), known = new Map(m.sk.map((x) => [x[0], x[1]]));
    for (const k of SKILL_KEYS) {
      const s = SKILLS[k], r = known.get(k) ?? 0, b = el('button', `rp-skill${r ? ' have' : ''}`); b.type = 'button';
      b.disabled = !m.pts || r >= MAX_RANK || (!r && known.size >= MAX_SKILLS);
      b.append(el('b', '', `${s.name} ${'●'.repeat(r)}${'○'.repeat(MAX_RANK - r)}`), el('span', '', s.about), el('small', '', s.cd ? `ACTIVE · ${s.cd.join('/')}S COOLDOWN` : 'PASSIVE'));
      b.addEventListener('click', () => { send({ t: 'rplearn', k }); play('click'); });
      list.append(b);
    }
    box.append(list);
  }
  const SAY = { COOLDOWN: 'NOT READY YET', FOUR_SKILLS: 'FOUR SKILLS IS THE MOST · RANK ONE UP INSTEAD', MAX_RANK: 'THAT ONE IS MAXED', PASSIVE: 'THAT ONE WORKS ON ITS OWN', NOT_NOW: 'NOT NOW' };
  function err(code) { if (!R.open) return false; const q = ctx.world.where(R.you); if (q) R.floats.push({ x: q[0], y: q[1], z: 40, text: SAY[code] ?? 'NOT NOW', col: '#ffb0a6', born: now(), life: 1200 }); play('warn', 200); return true; }
  /** Is your Pepe up (the host only shows your keys at once while it is)? */
  const up = () => !!me()?.up;

  // ---------------------------------------------------------------- the panel
  function top() {
    if (!R.open) return;
    const box = $('rp-top'); box.replaceChildren();
    const ppl = [...R.people.values()], upN = ppl.filter((p) => p.up).length;
    const bar = el('div', 'gt-castle'), fill = el('i'); fill.style.width = `${ppl.length ? (upN / ppl.length) * 100 : 0}%`; bar.append(fill);
    box.append(el('b', '', `LEVEL ${Math.max(1, R.level)} / ${LEVELS}`), el('span', 'gt-hp', `${upN} OF ${ppl.length} UP`), bar);
    if (R.st === 'countdown') box.append(el('span', 'gt-time', `STARTS IN ${Math.max(0, Math.ceil((R.startsAt - now()) / 1000))}${R.mode === 'coop' ? ' · OTHERS CAN JOIN FROM THE GAMES PAGE' : ''}`));
    if (R.cleared > 0 && !R.ended && !guest()) box.append(el('span', 'gt-sofar', `${runReward({ cleared: R.cleared, won: false, saves: me()?.saves ?? 0 })} $SWARM SO FAR`));
  }
  function panel() {
    if (!R.open) return;
    top();
    const help = $('rp-help'), p = me(); help.replaceChildren();
    help.append(el('p', 'gt-step', R.st === 'countdown' ? 'GET READY · WASD, ARROWS OR CLICK TO RUN' : p && !p.up ? "YOU'RE DOWN · WAIT FOR A TEAMMATE TO RUN THROUGH YOUR CIRCLE" : 'RUN THE LAP CLOCKWISE TO THE FINISH · THE CORNERS ARE SAFE · RUN THROUGH A DOWNED TEAMMATE TO BRING THEM BACK'));
    const tm = $('rp-team'), key = [...R.roster].map(([id, r]) => `${id}.${r.off}`).join() + R.host;
    if (tm.dataset.key !== key) {
      tm.dataset.key = key; tm.replaceChildren(); R.spans = new Map();
      tm.append(el('h5', '', 'THE TEAM'));
      for (const [id, r] of R.roster) {
        const li = el('div', 'gt-mate'), dot = el('i'), s = el('span', 'dim', '');
        dot.style.background = r.color;
        li.append(dot, el('span', '', `${id === R.you ? 'YOU' : label(r.pepe)}${r.off ? ' (AWAY)' : ''}${id === R.host ? ' · HOST' : ''}`), s);
        tm.append(li); R.spans.set(id, s);
      }
    }
    for (const [id, s] of R.spans ?? []) { const q = R.people.get(id); s.textContent = q ? `LV ${q.lvl ?? 1} · ${q.up ? 'UP' : 'DOWN'} · ${q.saves} SAVES` : ''; s.classList.toggle('rp-down', !!q && !q.up); }
    $('rp-go').hidden = !(R.st === 'countdown' && R.mode === 'coop' && R.host === R.you);
  }
  $('rp-go').addEventListener('click', () => send({ t: 'arenaGo' }));
  $('rp-quit').addEventListener('click', () => (R.ended ? leave() : ask()));
  $('rp-fold').addEventListener('click', () => $('rp').classList.toggle('folded'));

  // ---------------------------------------------------------------- the end
  function finish(m) {
    R.ended = m; R.st = 'ended';
    const box = $('rp-card'); box.replaceChildren();
    box.append(el('h3', '', m.won ? `ALL ${LEVELS} LEVELS · THE SWARM COULDN'T CATCH YOU` : `THE SWARM GOT YOU ON LEVEL ${m.level}`));
    box.append(el('p', 'mg-sub', `${m.cleared} ${m.cleared === 1 ? 'LEVEL' : 'LEVELS'} CLEARED`));
    const ol = el('ol', 'gt-best');
    for (const [id, pepe, saves, downs] of [...m.r].sort((a, b) => b[2] - a[2])) {
      const li = el('li'), dot = el('i', 'rp-dot'); dot.style.background = colorOf(id);
      li.append(dot, el('span', '', id === R.you ? 'YOU' : label(pepe)), el('span', 'dim', `${saves} SAVES · ${downs} DOWNS`)); ol.append(li);
    }
    box.append(el('h5', '', 'THE TEAM'), ol);
    const mine = m.r.find((x) => x[0] === R.you);
    const og = el('p', 'mg-sub', guest() ? 'GUESTS PLAY FOR FUN' : mine?.[4] ? `+${mine[4]} $SWARM` : '');
    og.id = 'rp-og'; box.append(og);
    const row = el('div', 'mg-actions');
    const a = el('button', 'btn', 'PLAY AGAIN'); a.type = 'button'; a.addEventListener('click', () => { R.again = true; leave(); });
    const b2 = el('button', 'btn ghost', 'BACK TO TOWN'); b2.type = 'button'; b2.addEventListener('click', leave);
    row.append(a, b2); box.append(row);
    box.hidden = false;
    play(m.won ? 'win' : 'lose');
    panel();
  }
  function og(gained) { const p = $('rp-og'); if (p) { p.textContent = `+${gained} $SWARM · BUILD AND DECORATE WITH THEM`; p.classList.add('og'); } }
  function ask() {
    R.asking = true;
    const box = $('rp-card'); box.replaceChildren();
    box.append(el('h3', '', 'LEAVE THE RUN?'), el('p', 'mg-sub', R.mode === 'coop' && R.roster.size > 1 ? 'THE OTHERS RUN ON WITHOUT YOU.' : 'THE RUN ENDS HERE.'));
    const row = el('div', 'mg-actions');
    const a = el('button', 'btn', 'KEEP PLAYING'); a.type = 'button'; a.addEventListener('click', keepPlaying);
    const b2 = el('button', 'btn ghost', 'LEAVE'); b2.type = 'button'; b2.addEventListener('click', leave);
    row.append(a, b2); box.append(row); box.hidden = false;
  }
  function keepPlaying() { R.asking = false; $('rp-card').hidden = true; }
  function leave() { send({ t: 'arenaLeave' }); }
  function exit() {
    if (!R.open) return false;
    R.open = false; clearInterval(R.pingT);
    $('rp').hidden = true; $('rp-card').hidden = true; $('rp-banner').hidden = true; R.mine = null; R.picking = false;
    ctx.world.exit();
    ctx.onClose?.();
    return R.again ? R.mode : false;
  }
  return { open, exit, isOpen: () => R.open, key, message, pong, og, err, click, hover, ground, items, overlay, up, speed, state: R };
}

/** The kit's name for this game's browser module (the world calls it createRunGame). */
export const createClient = createRunGame;
/** Where your own Pepe can stand: the host uses it to move you at once when you press keys (the server confirms). */
export const predictFree = (x, y) => freeAt(x, y);
/** The track: sand stretches, stone safe corners, the stream, the Watcher's park in the middle, water round it. */
export function createMap(T, N) {
  const tiles = new Uint8Array(N * N);
  const inR = ([x0, y0, x1, y1], x, y) => x >= x0 && y >= y0 && x < x1 && y < y1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const safe = SAFE.some((r) => inR(r, x, y)) || inR(FINISH, x, y), inner = x >= 13 && y >= 13 && x < 51 && y < 51;
    const near = Math.max(Math.abs(x + 0.5 - (WATCHER.x + 1)), Math.abs(y + 0.5 - (WATCHER.y + 1)));
    tiles[y * N + x] = inR(STREAM, x, y) ? T.WATER : safe ? T.PLAZA : walkable(x, y) ? T.SAND : inner ? (near <= 1 ? T.WATCHER : near <= 4 ? T.PLAZA : T.GRASS) : x >= 3 && y >= 3 && x < 61 && y < 61 ? T.WATER : T.GRASS;
  }
  const nodes = new Map();
  let r = 211;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let y = 14; y < 50; y++) for (let x = 14; x < 50; x++) if (tiles[y * N + x] === T.GRASS && rnd() < 0.12) nodes.set(`${x},${y}`, { kind: rnd() < 0.8 ? 'tree' : 'rock', x, y, v: Math.floor(rnd() * 4) });
  return { tiles, nodes };
}
