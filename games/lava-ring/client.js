import { C, SPELLS, predictFree as free } from './rules.js';
import { ENEMY_SPRITES } from '../../engine/sprites.js';
import { textArt } from '../../engine/text.js';
import { WATCHER } from '../../engine/world.js';

export const predictFree = free;
export function createClient(ctx) {
  const { $, el, send, snd, label } = ctx;
  const R = { open: false, you: 0, host: 0, mode: 'solo', st: 'countdown', startAt: 0, phase: 'ready', round: 0, left: 0, rad: C.RADIUS, me: null, humans: [], bots: [], shots: [], clouds: [], winner: null, aim: { x: 32, y: 32 }, selected: 0, ended: null, again: false, floats: [] };
  const botPlaces = new Map();
  const phone = matchMedia('(pointer: coarse)').matches;
  function apply(s) {
    R.phase = s.phase; R.round = s.round; R.left = s.left; R.rad = s.rad / 10; R.winner = s.winner;
    R.humans = s.p; R.bots = s.b; R.shots = s.s; R.clouds = s.c;
    ctx.world.move(s.p.map(([id, x, y, moving, facing]) => [id, x / 10, y / 10, moving, facing]));
    for (const p of s.p) ctx.world.set(p[0], { ghost: !!p[5] });
    R.me = s.p.find((p) => p[0] === R.you) ?? null;
    const ids = new Set(s.b.map((b) => b[0]));
    for (const id of botPlaces.keys()) if (!ids.has(id)) botPlaces.delete(id);
    for (const b of s.b) {
      const pos = botPlaces.get(b[0]) ?? { x: b[1] / 10, y: b[2] / 10 };
      botPlaces.set(b[0], { fx: pos.x, fy: pos.y, x: b[1] / 10, y: b[2] / 10, at: performance.now() });
    }
  }
  function message(m) {
    switch (m.t) {
      case 'lrw':
        R.open = true; R.you = m.you; R.host = m.host; R.mode = m.mode; R.st = m.st; R.startAt = performance.now() + m.startsIn; R.ended = null; R.again = false;
        $('lr').hidden = false; $('lr-card').hidden = true; $('lr-stick').hidden = !phone;
        ctx.world.enter({ players: m.r, you: m.you }); apply(m.s); panel(); return true;
      case 'lrroster': ctx.world.players(m.r); R.host = m.host; panel(); return true;
      case 'lrgo': R.st = 'running'; snd.play('start'); panel(); return true;
      case 'lrs': R.st = m.st; apply(m); for (const e of m.e ?? []) event(e); panel(); return true;
      case 'lrend': finish(m); return true;
      default: return false;
    }
  }
  function event(e) {
    if (e[0] === 'hit' && e[1] === R.you) { snd.play('hurt'); ctx.shake?.(2); }
    if (e[0] === 'ko' && e[1] === R.you) snd.play('down');
    if (e[0] === 'reflect') snd.play('bonk');
    if (e[0] === 'round') snd.play('start');
    const at = ctx.world.where(e[1]);
    if (at && (e[0] === 'ko' || e[0] === 'out' || e[0] === 'win')) R.floats.push({ x: at[0], y: at[1], text: e[0] === 'win' ? 'ROUND WIN' : e[0] === 'ko' ? 'KNOCKOUT' : 'OUT', born: performance.now() });
  }
  function circle(g, P, r, color, stroke = false) {
    g.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i * Math.PI * 2 / 48, [x, y] = P(C.CX + Math.cos(a) * r, C.CY + Math.sin(a) * r); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); if (stroke) { g.strokeStyle = color; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = color; g.fill(); }
  }
  function ground(g, P, T) {
    if (!R.open) return;
    circle(g, P, C.RADIUS + 1.4, '#ae2e1f');
    circle(g, P, C.RADIUS + 0.6, '#f06b24');
    circle(g, P, R.rad, '#555354');
    circle(g, P, R.rad - 0.12, '#9e9580', true);
    circle(g, P, Math.max(0.5, R.rad - 0.9), 'rgba(242,185,102,.16)', true);
    for (let i = 0; i < 14; i++) {
      const a = i * 6.283 / 14 + Math.sin(T + i) * 0.02, r = C.RADIUS + 0.9, [x, y] = P(C.CX + Math.cos(a) * r, C.CY + Math.sin(a) * r);
      g.fillStyle = i % 2 ? '#ffd15b' : '#f89436'; g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }
  function items(list, g, P, T) {
    if (!R.open) return;
    for (const c of R.clouds) {
      const x = c[0] / 10, y = c[1] / 10;
      list.push({ d: x + y, draw: () => { const [sx, sy] = P(x, y, 5); g.fillStyle = 'rgba(111,173,84,.5)'; g.beginPath(); g.ellipse(sx, sy, 24, 11, 0, 0, Math.PI * 2); g.fill(); } });
    }
    for (const [x, y, kind] of R.shots) {
      const px = x / 10, py = y / 10;
      list.push({ d: px + py, draw: () => { const [sx, sy] = P(px, py, 10); g.fillStyle = kind === 3 ? '#d9e681' : '#ff8d39'; g.fillRect(Math.round(sx) - 3, Math.round(sy) - 3, 7, 7); g.fillStyle = '#fff2b5'; g.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3); } });
    }
    for (const b of R.bots) {
      const pos = botPlaces.get(b[0]); if (!pos) continue;
      const f = Math.min(1, (performance.now() - pos.at) / 100), x = pos.fx + (pos.x - pos.fx) * f, y = pos.fy + (pos.y - pos.fy) * f;
      list.push({ d: x + y, draw: () => {
        const spr = b[0] % 2 ? ENEMY_SPRITES.influencer : ENEMY_SPRITES.kol;
        const img = spr.walk[Math.floor(T * 5 + Math.abs(b[0])) & 3][pos.x < pos.fx ? 'left' : 'right'];
        const [sx, sy] = P(x, y); g.globalAlpha = b[3] ? 1 : 0.35;
        g.drawImage(img, Math.round(sx - spr.w * 0.4), Math.round(sy - spr.h * 0.8 - 4), Math.round(spr.w * 0.8), Math.round(spr.h * 0.8)); g.globalAlpha = 1;
        const title = textArt(b[0] % 2 ? 'INFLUENCER' : 'KOL', '#ffb070'); g.drawImage(title, Math.round(sx - title.width / 2), Math.round(sy - 28));
        g.fillStyle = '#32151a'; g.fillRect(Math.round(sx - 8), Math.round(sy - 22), 16, 2);
        g.fillStyle = '#e8833a'; g.fillRect(Math.round(sx - 8), Math.round(sy - 22), Math.round(16 * b[4] / 100), 2);
      } });
    }
  }
  function overlay(g, P) {
    if (!R.open) return;
    for (const p of R.humans) {
      if (p[5]) continue;
      const [x, y] = P(p[1] / 10, p[2] / 10, 23);
      g.fillStyle = '#32151a'; g.fillRect(Math.round(x - 9), Math.round(y), 18, 2);
      g.fillStyle = p[0] === R.you ? '#c9db4c' : '#ffb070'; g.fillRect(Math.round(x - 9), Math.round(y), Math.round(18 * p[6] / 100), 2);
    }
    const now = performance.now();
    for (const f of R.floats) { const a = 1 - (now - f.born) / 1000, [x, y] = P(f.x, f.y, 35 + 8 * (1 - a)), art = textArt(f.text, '#ffca60'); g.globalAlpha = Math.max(0, a); g.drawImage(art, Math.round(x - art.width / 2), Math.round(y)); g.globalAlpha = 1; }
    R.floats = R.floats.filter((f) => now - f.born < 1000);
  }
  function panel() {
    if (!R.open) return;
    const top = $('lr-top'); top.replaceChildren();
    const hp = R.me?.[6] ?? 100, wins = R.me?.[8] ?? 0, ko = R.me?.[9] ?? 0;
    top.append(el('b', '', `ROUND ${Math.max(1, R.round)} / ${C.ROUNDS}`), el('span', 'gt-hp', R.st === 'countdown' ? `${Math.ceil((R.startAt - performance.now()) / 1000)}S TO START` : `${R.left}S`));
    const bar = el('div', 'gt-castle'), fill = el('i'); fill.style.width = `${hp}%`; bar.append(fill); top.append(bar);
    top.append(el('span', 'gt-time', R.st === 'ended' ? `FINAL · ${wins} WINS · ${ko} KOS` : R.phase === 'shop' ? `SHOP · ${R.me?.[7] ?? 0} GOLD · ${wins} WINS · ${ko} KOS` : hp <= 0 ? `GHOST · WATCH THIS ROUND · ${wins} WINS` : `${hp} HP · ${wins} WINS · ${ko} KOS`));
    $('lr-go').hidden = !(R.st === 'countdown' && R.mode === 'coop' && R.host === R.you);
    const spells = $('lr-spells'); spells.replaceChildren(); spells.hidden = R.phase === 'shop' || R.st === 'ended';
    const keys = ['Q', 'E', 'R', 'F'];
    for (let i = 0; i < 4; i++) {
      const s = i === 0 ? -1 : R.me?.[10]?.[i - 1] ?? -1, name = s < 0 ? (i === 0 ? 'FUD BLAST' : 'EMPTY') : SPELLS[s].name;
      const cooldown = Math.ceil((R.me?.[12]?.[i] ?? 0) / 10);
      const btn = el('button', 'btn ghost' + (R.selected === i ? ' on' : ''), `${keys[i]} · ${name}`);
      btn.type = 'button'; btn.append(el('small', '', cooldown ? `${cooldown}S COOLING` : i === 0 ? '5 DAMAGE · KNOCKBACK' : 'TAP ARENA TO CAST'));
      btn.addEventListener('click', () => { R.selected = i; panel(); }); spells.append(btn);
    }
    const shop = $('lr-shop'); shop.hidden = R.phase !== 'shop';
    if (R.phase === 'shop') {
      shop.replaceChildren(); shop.append(el('h4', '', `SHOP · ${R.me?.[7] ?? 0} GOLD · ${R.left}S`), el('p', '', '1-6 OR TAP TO BUY. THREE SPELLS MAX. EACH HAS THREE RANKS.'));
      for (let i = 0; i < SPELLS.length; i++) {
        const s = SPELLS[i], rank = R.me?.[11]?.[i] ?? 0, held = rank > 0 || (R.me?.[10] ?? []).includes(-1), cost = s.cost[rank] ?? 0;
        const btn = el('button', '', ` ${i + 1} · ${s.name} · RANK ${rank}/3 ${rank < 3 ? '→ ' + (rank + 1) : ''}`);
        btn.type = 'button'; btn.disabled = rank === 3 || !held || cost > (R.me?.[7] ?? 0);
        btn.append(el('b', '', rank === 3 ? 'MAXED' : `${cost} GOLD · ${s.detail[rank]} · ${s.cd[rank]}S CD`));
        btn.append(el('span', '', `R1 ${s.detail[0]} (${s.cd[0]}S) / R2 ${s.detail[1]} (${s.cd[1]}S) / R3 ${s.detail[2]} (${s.cd[2]}S)`));
        btn.addEventListener('click', () => send({ t: 'lrbuy', spell: i })); shop.append(btn);
      }
    }
  }
  function finish(m) {
    R.ended = m; R.st = 'ended'; panel();
    const card = $('lr-card'); card.replaceChildren();
    const mine = m.r.find((p) => p[0] === R.you), won = m.champion === R.you;
    card.append(el('h3', '', won ? 'LAVA RING CHAMPION' : 'THE RING HAS SPOKEN'), el('p', 'mg-sub', `${mine?.[2] ?? 0} ROUND WINS · ${mine?.[3] ?? 0} KNOCKOUTS · +${mine?.[4] ?? 0} $SWARM`));
    for (const [id, pepe, rounds, kos] of m.r) card.append(el('p', 'mg-sub', `${id === R.you ? 'YOU' : label(pepe)} · ${rounds} WINS · ${kos} KOS${id === m.champion ? ' · CHAMPION' : ''}`));
    for (const [id, rounds, kos] of m.b) card.append(el('p', 'mg-sub', `${id % 2 ? 'INFLUENCER' : 'KOL'} · ${rounds} WINS · ${kos} KOS${id === m.champion ? ' · CHAMPION' : ''}`));
    const row = el('div', 'mg-actions'), again = el('button', 'btn', 'PLAY AGAIN'), quit = el('button', 'btn ghost', 'BACK TO TOWN');
    again.type = quit.type = 'button'; again.addEventListener('click', () => { R.again = true; send({ t: 'arenaLeave' }); }); quit.addEventListener('click', () => send({ t: 'arenaLeave' }));
    row.append(again, quit); card.append(row); card.hidden = false; snd.play(won ? 'win' : 'lose');
  }
  function castAt(slot, x, y) { if (R.phase === 'fight' && R.me && R.me[6] > 0) send({ t: 'lrcast', slot, x: Math.max(0, Math.min(63, x)), y: Math.max(0, Math.min(63, y)) }); }
  function key(ev, down) {
    if (!R.open || !down) return false;
    const k = ev.key.toLowerCase();
    if (k === 'escape') { send({ t: 'arenaLeave' }); return true; }
    if (k === 'enter' && R.st === 'countdown' && R.host === R.you) { send({ t: 'arenaGo' }); return true; }
    if (R.phase === 'shop' && /^[1-6]$/.test(k)) { send({ t: 'lrbuy', spell: Number(k) - 1 }); return true; }
    const slot = ['q', 'e', 'r', 'f'].indexOf(k);
    if (slot >= 0) { R.selected = slot; castAt(slot, R.aim.x, R.aim.y); panel(); return true; }
    return false;
  }
  function hover(t) { if (t && Number.isInteger(t.x) && Number.isInteger(t.y)) R.aim = { x: t.x + 0.5, y: t.y + 0.5 }; }
  function click(t) { hover(t); if (t && R.phase === 'fight') { castAt(R.selected, R.aim.x, R.aim.y); return true; } return R.phase === 'shop'; }
  $('lr-go').addEventListener('click', () => send({ t: 'arenaGo' })); $('lr-quit').addEventListener('click', () => send({ t: 'arenaLeave' }));
  const stick = $('lr-stick'), knob = $('lr-stick-knob');
  function stickMove(ev) {
    const rect = stick.getBoundingClientRect(), x = ev.clientX - rect.left - rect.width / 2, y = ev.clientY - rect.top - rect.height / 2, d = Math.max(1, Math.hypot(x, y)), scale = Math.min(33, d) / d;
    knob.style.transform = `translate(${Math.round(x * scale)}px,${Math.round(y * scale)}px)`;
    const sx = Math.abs(x) > 12 ? Math.sign(x) : 0, sy = Math.abs(y) > 12 ? Math.sign(y) : 0;
    send({ t: 'dir', dx: sx, dy: sy });
  }
  stick.addEventListener('pointerdown', (ev) => { stick.setPointerCapture(ev.pointerId); stickMove(ev); });
  stick.addEventListener('pointermove', (ev) => { if (stick.hasPointerCapture(ev.pointerId)) stickMove(ev); });
  const stopStick = () => { knob.style.transform = ''; send({ t: 'dir', dx: 0, dy: 0 }); };
  stick.addEventListener('pointerup', stopStick); stick.addEventListener('pointercancel', stopStick);
  function exit() { if (!R.open) return false; R.open = false; $('lr').hidden = true; ctx.world.exit(); ctx.onClose?.(); return R.again ? R.mode : false; }
  return { exit, isOpen: () => R.open, message, key, hover, click, ground, items, overlay, speed: () => C.SPEED, up: () => !!R.me?.[6], state: R };
}
export function createMap(T, N) {
  const tiles = new Uint8Array(N * N), nodes = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - C.CX, y + 0.5 - C.CY), center = x >= WATCHER.x && x <= WATCHER.x + 1 && y >= WATCHER.y && y <= WATCHER.y + 1;
    tiles[y * N + x] = center ? T.WATCHER : d < C.RADIUS ? T.ASH : d < C.RADIUS + 2.2 ? T.VOID : T.GRASS;
  }
  return { tiles, nodes };
}
