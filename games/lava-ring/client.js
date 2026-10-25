import { C, SPELLS, predictFree as free } from './rules.js';
import { ENEMY_SPRITES } from '../../engine/sprites.js';
import { textArt } from '../../engine/text.js';
import { WATCHER } from '../../engine/world.js';

export const predictFree = free;
export function createClient(ctx) {
  const { $, el, send, snd, label } = ctx;
  const R = { open: false, you: 0, host: 0, mode: 'solo', st: 'countdown', startAt: 0, phase: 'ready', round: 0, left: 0, rad: C.RADIUS, me: null, humans: [], bots: [], shots: [], clouds: [], winner: null, aim: { x: 32, y: 32 }, selected: 0, ended: null, again: false, floats: [], fx: [], flashes: new Map(), impactSoundAt: 0 };
  const botPlaces = new Map();
  const phone = matchMedia('(pointer: coarse)').matches;
  function apply(s) {
    R.phase = s.phase; R.round = s.round; R.left = s.left; R.rad = s.rad / 10; R.winner = s.winner;
    R.humans = s.p; R.bots = s.b;
    R.shots = s.s.map(([id, x, y, kind, vx, vy]) => ({ id, x: x / 10, y: y / 10, kind, vx: vx / 10, vy: vy / 10, at: performance.now() }));
    R.clouds = s.c;
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
  function effect(kind, x, y, ux = 0, uy = 0, power = 0) {
    R.fx.push({ kind, x, y, ux, uy, power, born: performance.now() });
    if (R.fx.length > 40) R.fx.shift();
  }
  function event(e) {
    const now = performance.now();
    if (e[0] === 'hit') {
      const x = e[4] / 10, y = e[5] / 10, ux = e[6] / 100, uy = e[7] / 100;
      effect('hit', x, y, ux, uy, e[8] / 10);
      R.flashes.set(e[1], now + 300);
      R.floats.push({ x, y, text: '-' + e[3], color: '#fff2b5', born: now });
      if (e[1] === R.you) { snd.play('hurt'); ctx.shake?.(5); }
      else if (now - R.impactSoundAt > 120) { snd.play('bonk'); R.impactSoundAt = now; }
    }
    if (e[0] === 'lava') {
      const x = e[2] / 10, y = e[3] / 10;
      effect('lava', x, y);
      R.floats.push({ x, y, text: 'LAVA!', color: '#ffb05b', born: now });
      if (e[1] === R.you) { snd.play('hurt'); ctx.shake?.(4); }
      else snd.play('boom');
    }
    if (e[0] === 'cast') effect('cast', e[3] / 10, e[4] / 10, e[5] / 100, e[6] / 100, e[2]);
    if (e[0] === 'ko') { snd.play('down'); effect('ko', ...(ctx.world.where(e[2]) ?? [32, 32])); }
    if (e[0] === 'reflect') snd.play('bonk');
    if (e[0] === 'round') { snd.play('start'); R.fx.length = 0; R.flashes.clear(); }
    const at = ctx.world.where(e[1]);
    if (at && (e[0] === 'ko' || e[0] === 'out' || e[0] === 'win')) R.floats.push({ x: at[0], y: at[1], text: e[0] === 'win' ? 'ROUND WIN' : e[0] === 'ko' ? 'KNOCKOUT' : 'OUT', color: '#ffca60', born: now });
  }
  function circle(g, P, r, color, stroke = false) {
    g.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i * Math.PI * 2 / 48, [x, y] = P(C.CX + Math.cos(a) * r, C.CY + Math.sin(a) * r); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); if (stroke) { g.strokeStyle = color; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = color; g.fill(); }
  }
  function ground(g, P, T) {
    if (!R.open) return;
    // Layered magma and chipped stone give the combat space a readable edge.
    circle(g, P, C.RADIUS + 1.65, '#101420');
    circle(g, P, C.RADIUS + 1.35, '#681d26');
    circle(g, P, C.RADIUS + 1.02, '#c83f23');
    circle(g, P, C.RADIUS + 0.62, '#ff8a34');
    circle(g, P, C.RADIUS + 0.28, '#f05c23');
    circle(g, P, R.rad, '#4b4c55');
    const shrinkIn = C.CREEP_EVERY - ((C.ROUND_SECONDS - R.left) % C.CREEP_EVERY);
    const warning = R.phase === 'fight' && shrinkIn <= 3;
    circle(g, P, R.rad - 0.06, warning && Math.floor(T * 8) % 2 ? '#ffe487' : '#bd8c57', true);
    circle(g, P, Math.max(0.5, R.rad - 0.55), 'rgba(255,201,122,.24)', true);
    // The same hand-cut plates and fractures appear for everyone.
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI * 2 / 48, r = 2.7 + (i * 17 % 17) * 0.36;
      if (r > R.rad - 0.7) continue;
      const x = C.CX + Math.cos(angle) * r, y = C.CY + Math.sin(angle) * r;
      const [sx, sy] = P(x, y), [ex, ey] = P(x + Math.cos(angle + 0.4) * 0.45, y + Math.sin(angle + 0.4) * 0.45);
      g.strokeStyle = i % 3 ? '#66666b' : '#30333e'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(sx), Math.round(sy)); g.lineTo(Math.round(ex), Math.round(ey)); g.stroke();
      if (i % 4 === 0) { g.fillStyle = '#867664'; g.fillRect(Math.round(sx), Math.round(sy) + 2, 2, 1); }
    }
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28, r = R.rad - 0.2;
      const [x0, y0] = P(C.CX + Math.cos(angle) * r, C.CY + Math.sin(angle) * r);
      const [x1, y1] = P(C.CX + Math.cos(angle) * (r - 0.28), C.CY + Math.sin(angle) * (r - 0.28));
      g.strokeStyle = warning ? '#ffe59a' : i % 2 ? '#d8a569' : '#78695b'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(Math.round(x0), Math.round(y0)); g.lineTo(Math.round(x1), Math.round(y1)); g.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const angle = i * Math.PI * 2 / 22 + Math.sin(T * 1.7 + i) * 0.025;
      const r = C.RADIUS + 0.75 + Math.sin(T * 2.2 + i * 3) * 0.12;
      const [x, y] = P(C.CX + Math.cos(angle) * r, C.CY + Math.sin(angle) * r, 2 + (i % 3) * 2);
      g.fillStyle = i % 3 ? '#ffac44' : '#ffe081';
      g.fillRect(Math.round(x), Math.round(y), i % 5 ? 2 : 3, 2);
    }
  }
  function items(list, g, P, T) {
    if (!R.open) return;
    for (const c of R.clouds) {
      const x = c[0] / 10, y = c[1] / 10;
      list.push({ d: x + y, draw: () => { const [sx, sy] = P(x, y, 5); g.fillStyle = 'rgba(111,173,84,.5)'; g.beginPath(); g.ellipse(sx, sy, 24, 11, 0, 0, Math.PI * 2); g.fill(); } });
    }
    for (const shot of R.shots) {
      const age = Math.min(0.12, (performance.now() - shot.at) / 1000);
      const px = shot.x + shot.vx * age, py = shot.y + shot.vy * age;
      list.push({ d: px + py, draw: () => {
        const colors = shot.kind === 3 ? ['#2e5260', '#78daca', '#f2fff1'] : ['#6d2231', '#ff7543', '#fff1ab'];
        for (let i = 3; i >= 1; i--) {
          const [tx, ty] = P(px - shot.vx * i * 0.045, py - shot.vy * i * 0.045, 13 - i);
          const size = 2 + (3 - i) * 2;
          g.fillStyle = colors[i === 1 ? 1 : 0];
          g.fillRect(Math.round(tx - size / 2), Math.round(ty - size / 2), size, size);
        }
        const [sx, sy] = P(px, py, 13);
        g.fillStyle = '#181c2b'; g.fillRect(Math.round(sx - 5), Math.round(sy - 5), 11, 11);
        g.fillStyle = colors[1]; g.fillRect(Math.round(sx - 4), Math.round(sy - 4), 9, 9);
        g.fillStyle = colors[2]; g.fillRect(Math.round(sx - 2), Math.round(sy - 2), 5, 5);
        g.fillStyle = '#ffffff'; g.fillRect(Math.round(sx), Math.round(sy), 2, 2);
      } });
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
    const now = performance.now();
    for (const p of R.humans) {
      if (p[5]) continue;
      const [x, y] = P(p[1] / 10, p[2] / 10, 23);
      g.fillStyle = '#32151a'; g.fillRect(Math.round(x - 9), Math.round(y), 18, 2);
      g.fillStyle = p[0] === R.you ? '#c9db4c' : '#ffb070';
      g.fillRect(Math.round(x - 9), Math.round(y), Math.round(18 * p[6] / 100), 2);
    }
    for (const [id, until] of R.flashes) {
      if (until <= now) { R.flashes.delete(id); continue; }
      const where = id < 0 ? null : ctx.world.where(id);
      const pos = id < 0 ? botPlaces.get(id) : where && { x: where[0], y: where[1] };
      if (!pos) continue;
      const [sx, sy] = P(pos.x, pos.y, 12);
      g.strokeStyle = Math.floor(now / 60) % 2 ? '#fff7c5' : '#ff7543';
      g.lineWidth = 2; g.strokeRect(Math.round(sx - 11), Math.round(sy - 16), 22, 23);
    }
    for (const f of R.fx) {
      const age = (now - f.born) / 1000;
      const [sx, sy] = P(f.x, f.y, f.kind === 'lava' ? 2 : 13);
      if (f.kind === 'hit' && age < 0.42) {
        const r = 4 + age * 38;
        g.globalAlpha = Math.max(0, 1 - age / 0.42);
        g.strokeStyle = '#fff0ae'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, sy - r * 0.55); g.lineTo(sx + r, sy);
        g.lineTo(sx, sy + r * 0.55); g.lineTo(sx - r, sy); g.closePath(); g.stroke();
        const [dx, dy] = [f.ux * 17 - f.uy * 17, (f.ux + f.uy) * 8];
        g.strokeStyle = '#ff6745'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(sx - dx * 0.4, sy - dy * 0.4);
        g.lineTo(sx + dx * (1 + age), sy + dy * (1 + age)); g.stroke();
        for (let i = 0; i < 7; i++) {
          const a = i * Math.PI * 2 / 7 + f.x, px = sx + Math.cos(a) * (5 + age * 33), py = sy + Math.sin(a) * (4 + age * 19);
          g.fillStyle = i % 2 ? '#fff3b4' : '#ff7e4d'; g.fillRect(Math.round(px), Math.round(py), 3, 3);
        }
        g.globalAlpha = 1;
      } else if (f.kind === 'cast' && age < 0.25) {
        const [tx, ty] = P(f.x + f.ux * (0.4 + age * 2), f.y + f.uy * (0.4 + age * 2), 13);
        g.globalAlpha = 1 - age / 0.25; g.fillStyle = f.power === 3 ? '#a8ffdc' : '#fff0a6';
        g.fillRect(Math.round(tx - 4), Math.round(ty - 4), 8, 8); g.globalAlpha = 1;
      } else if (f.kind === 'lava' && age < 0.7) {
        g.globalAlpha = Math.max(0, 1 - age / 0.7);
        for (let i = 0; i < 9; i++) {
          const a = i * Math.PI * 2 / 9, x = sx + Math.cos(a) * (4 + age * 29);
          const y = sy + Math.sin(a) * (3 + age * 12) - age * (12 + i % 3 * 8);
          g.fillStyle = i % 2 ? '#ffcc62' : '#ff6638'; g.fillRect(Math.round(x), Math.round(y), 4, 5);
        }
        g.globalAlpha = 1;
      } else if (f.kind === 'ko' && age < 0.7) {
        g.globalAlpha = 1 - age / 0.7; g.strokeStyle = '#ffe59a'; g.lineWidth = 3;
        g.beginPath(); g.arc(sx, sy, 8 + age * 42, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    R.fx = R.fx.filter((f) => now - f.born < 800);
    for (const f of R.floats) {
      const k = Math.max(0, Math.min(1, (now - f.born) / 900));
      const [x, y] = P(f.x, f.y, 35 + k * 14);
      const art = textArt(f.text, f.color ?? '#ffca60');
      g.globalAlpha = 1 - k; g.drawImage(art, Math.round(x - art.width / 2), Math.round(y));
      g.globalAlpha = 1;
    }
    R.floats = R.floats.filter((f) => now - f.born < 900);
  }
  function panel() {
    if (!R.open) return;
    const top = $('lr-top'); top.replaceChildren();
    const hp = R.me?.[6] ?? 100, wins = R.me?.[8] ?? 0, ko = R.me?.[9] ?? 0;
    top.append(el('b', '', `ROUND ${Math.max(1, R.round)} / ${C.ROUNDS}`), el('span', 'gt-hp', R.st === 'countdown' ? `${Math.ceil((R.startAt - performance.now()) / 1000)}S TO START` : `${R.left}S`));
    const bar = el('div', 'gt-castle'), fill = el('i'); fill.style.width = `${hp}%`; bar.append(fill); top.append(bar);
    top.append(el('span', 'gt-time', R.st === 'ended' ? `FINAL · ${wins} WINS · ${ko} KOS` : R.phase === 'shop' ? `SHOP · ${R.me?.[7] ?? 0} GOLD · ${wins} WINS · ${ko} KOS` : hp <= 0 ? `GHOST · WATCH THIS ROUND · ${wins} WINS` : R.me?.[15] ? `IN LAVA · -${C.LAVA_DPS} HP/S · STEER EARLY` : `${hp} HP · ${wins} WINS · ${ko} KOS`));
    top.classList.toggle('lr-hot', !!R.me?.[15] && hp > 0);
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
  return { exit, isOpen: () => R.open, message, key, hover, click, ground, items, overlay, up: () => !!R.me?.[6], state: R };
}
export function createMap(T, N) {
  const tiles = new Uint8Array(N * N), nodes = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - C.CX, y + 0.5 - C.CY), center = x >= WATCHER.x && x <= WATCHER.x + 1 && y >= WATCHER.y && y <= WATCHER.y + 1;
    tiles[y * N + x] = center ? T.WATCHER : d < C.RADIUS ? T.ASH : d < C.RADIUS + 2.2 ? T.VOID : T.GRASS;
  }
  return { tiles, nodes };
}

