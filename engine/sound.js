// Sound: retro effects and a little round music, all synthesised with Web
// Audio (no audio files). Browsers only allow sound after the player has
// clicked or pressed a key, so `unlock()` is called on the first input.
// Busy moments are kept listenable by rate-limiting each sound and capping
// how many play at once.

const MIN_GAP = { pop: 0.06, rocket: 0.09, fire: 0.09, dropBoom: 0.08, dropFall: 0.1, laser: 0.07, hit: 0.05, die: 0.045, gem: 0.03, hurt: 0.18, towerHit: 0.9, zap: 0.12, whip: 0.08, gas: 0.2, bonk: 0.1, chat: 0.15, alarm: 3, merge: 0.04, warn: 0.5, gemShot: 0.035, horn: 5, kick: 0.05, thud: 0.09, tackle: 0.1, grab: 0.06, whistle: 0.3, missile: 0.1, boom: 0.06, goal: 1 };
const MAX_VOICES = 28;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } }

export function createSound() {
  let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
  let muted = load('ogw-sound') === 'off';
  let voices = 0;
  const last = new Map();

  let unlocked = false;
  function unlock() {
    // iPhone/iPad: play web audio as media, so the silent switch doesn't mute the game.
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch { return; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = 0.6; sfx.connect(master);
      music = ctx.createGain(); music.gain.value = 0.18; music.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (ambWant !== ambNow) startAmbience(ambWant);
    // Safari only really starts audio once something plays inside the tap itself.
    if (!unlocked) {
      try {
        const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
        src.buffer = b; src.connect(ctx.destination); src.start(0);
        unlocked = ctx.state === 'running';
      } catch { /* try again on the next tap */ }
    }
  }

  /** One oscillator note with a pitch slide and a quick envelope. */
  function tone({ type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.2, delay = 0, dest = sfx, attack = 0.004 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    voices++; o.onended = () => { voices--; };
    o.start(t); o.stop(t + dur + 0.02);
  }
  /** A burst of filtered noise (hits, booms, hiss). */
  function noise({ dur = 0.1, vol = 0.2, type = 'lowpass', f = 1200, f2 = null, delay = 0, dest = sfx, q = 0.8 }) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    voices++; s.onended = () => { voices--; };
    s.start(t); s.stop(t + dur + 0.02);
  }
  const notes = (seq, { type = 'square', step = 0.09, dur = 0.12, vol = 0.16, delay = 0 } = {}) => seq.forEach((f, i) => f && tone({ type, f, dur, vol, delay: delay + i * step }));

  const SFX = {
    laser: () => tone({ type: 'sawtooth', f: 1500, f2: 380, dur: 0.08, vol: 0.07 }),
    hit: () => noise({ dur: 0.035, vol: 0.06, type: 'highpass', f: 2500 }),
    die: () => { tone({ type: 'square', f: 600, f2: 110, dur: 0.1, vol: 0.06 }); noise({ dur: 0.07, vol: 0.05, type: 'bandpass', f: 900 }); },
    gem: (step = 0) => tone({ type: 'triangle', f: 880 * Math.pow(2, Math.min(step, 12) / 12), dur: 0.07, vol: 0.09 }),
    levelup: () => notes([523, 659, 784, 1047, 1319], { type: 'triangle', step: 0.07, dur: 0.18, vol: 0.16 }),
    pick: () => { tone({ type: 'square', f: 880, dur: 0.05, vol: 0.08 }); tone({ type: 'square', f: 1320, dur: 0.08, vol: 0.08, delay: 0.05 }); },
    bonk: () => { tone({ type: 'sine', f: 190, f2: 45, dur: 0.28, vol: 0.38 }); noise({ dur: 0.12, vol: 0.12, f: 600 }); },
    dropFall: () => tone({ type: 'sine', f: 1600, f2: 500, dur: 0.6, vol: 0.05 }),
    dropBoom: () => { noise({ dur: 0.45, vol: 0.22, f: 900, f2: 80 }); tone({ type: 'sine', f: 110, f2: 40, dur: 0.4, vol: 0.3 }); },
    whip: () => noise({ dur: 0.09, vol: 0.12, type: 'bandpass', f: 3500, f2: 900, q: 2 }),
    fire: () => { noise({ dur: 0.28, vol: 0.16, type: 'bandpass', f: 1800, f2: 350, q: 1.2 }); tone({ type: 'sawtooth', f: 220, f2: 90, dur: 0.22, vol: 0.06 }); },
    gas: () => noise({ dur: 0.5, vol: 0.06, type: 'lowpass', f: 700, f2: 300 }),
    zap: () => { tone({ type: 'square', f: 2400, f2: 900, dur: 0.07, vol: 0.05 }); tone({ type: 'square', f: 1800, f2: 600, dur: 0.07, vol: 0.04, delay: 0.03 }); },
    hurt: () => tone({ type: 'square', f: 220, f2: 110, dur: 0.12, vol: 0.12 }),
    towerHit: () => { tone({ type: 'sine', f: 90, f2: 50, dur: 0.2, vol: 0.2 }); noise({ dur: 0.1, vol: 0.06, f: 300 }); },
    alarm: () => { for (let i = 0; i < 3; i++) { tone({ type: 'square', f: 880, dur: 0.12, vol: 0.06, delay: i * 0.3 }); tone({ type: 'square', f: 660, dur: 0.12, vol: 0.06, delay: i * 0.3 + 0.15 }); } },
    down: () => notes([392, 330, 262, 196], { type: 'triangle', step: 0.12, dur: 0.2, vol: 0.14 }),
    revive: () => notes([262, 392, 523, 784], { type: 'triangle', step: 0.06, dur: 0.14, vol: 0.13 }),
    boss: () => { tone({ type: 'sawtooth', f: 98, dur: 1.2, vol: 0.18 }); tone({ type: 'sawtooth', f: 104, dur: 1.2, vol: 0.14 }); tone({ type: 'sawtooth', f: 73, dur: 1.4, vol: 0.14, delay: 0.5 }); },
    surge: () => notes([740, 0, 740, 0, 988], { type: 'square', step: 0.1, dur: 0.09, vol: 0.09 }),
    count: (last = false) => tone({ type: 'square', f: last ? 1320 : 660, dur: last ? 0.3 : 0.1, vol: 0.1 }),
    start: () => notes([392, 523, 659, 784], { type: 'square', step: 0.08, dur: 0.14, vol: 0.12 }),
    nuke: () => {
      noise({ dur: 2.2, vol: 0.4, f: 3000, f2: 60 });
      tone({ type: 'sine', f: 80, f2: 30, dur: 1.8, vol: 0.45 });
      notes([523, 659, 784, 1047, 784, 1047, 1319], { type: 'square', step: 0.11, dur: 0.16, vol: 0.12, delay: 0.5 });
    },
    win: () => notes([523, 523, 523, 659, 784, 0, 659, 784, 1047], { type: 'square', step: 0.11, dur: 0.18, vol: 0.14 }),
    lose: () => notes([392, 370, 349, 330, 262], { type: 'triangle', step: 0.22, dur: 0.35, vol: 0.15 }),
    launch: () => { tone({ type: 'sine', f: 400, f2: 1800, dur: 0.6, vol: 0.06 }); for (let i = 0; i < 4; i++) noise({ dur: 0.25, vol: 0.12, type: 'bandpass', f: 2000 + i * 500, delay: 0.6 + i * 0.15 }); },
    chat: () => tone({ type: 'triangle', f: 1180, dur: 0.05, vol: 0.05 }),
    rocket: () => tone({ type: 'sine', f: 500 + Math.random() * 300, f2: 1900 + Math.random() * 600, dur: 0.45, vol: 0.035 }),
    pop: () => { noise({ dur: 0.28 + Math.random() * 0.2, vol: 0.2, f: 2200, f2: 120 }); tone({ type: 'sine', f: 140, f2: 50, dur: 0.25, vol: 0.18 }); noise({ dur: 0.5, vol: 0.05, type: 'highpass', f: 5000, delay: 0.12 }); },
    party: () => notes([523, 659, 784, 1047, 0, 784, 1047, 1319, 0, 1047, 1319, 1568], { type: 'square', step: 0.1, dur: 0.16, vol: 0.12 }),
    click: () => tone({ type: 'square', f: 1000, dur: 0.03, vol: 0.05 }),
    // PEPE MERGE
    slide: () => noise({ dur: 0.22, vol: 0.07, type: 'bandpass', f: 700, f2: 2600, q: 1.4 }),
    merge: (k = 1) => { const f = 300 * Math.pow(2, Math.min(k, 9) / 5); tone({ type: 'triangle', f, f2: f * 1.5, dur: 0.12, vol: 0.12 }); noise({ dur: 0.06, vol: 0.05, type: 'highpass', f: 3000 }); },
    warn: () => tone({ type: 'square', f: 520, dur: 0.07, vol: 0.05 }),
    // The $IMD zeppelin's horn: two deep notes, like a ship's.
    horn: () => { tone({ type: 'sawtooth', f: 98, dur: 0.7, vol: 0.12 }); tone({ type: 'sawtooth', f: 131, dur: 0.7, vol: 0.09 }); tone({ type: 'sawtooth', f: 98, dur: 1.1, vol: 0.12, delay: 0.85 }); tone({ type: 'sawtooth', f: 123, dur: 1.1, vol: 0.09, delay: 0.85 }); },
    // SWARM GEMS: each gem's shot has its own sound.
    gemShot: (shot = '') => {
      switch (shot) {
        case 'frost': tone({ type: 'triangle', f: 2100, f2: 1500, dur: 0.07, vol: 0.05 }); tone({ type: 'sine', f: 3150, dur: 0.05, vol: 0.03, delay: 0.02 }); break;
        case 'spike': tone({ type: 'square', f: 2600, f2: 1900, dur: 0.035, vol: 0.035 }); break;
        case 'wisp': tone({ type: 'sine', f: 900, f2: 1700, dur: 0.12, vol: 0.04 }); break;
        case 'glob': tone({ type: 'sine', f: 260, f2: 520, dur: 0.08, vol: 0.09 }); break;
        case 'beam': tone({ type: 'sawtooth', f: 420, f2: 300, dur: 0.14, vol: 0.04 }); tone({ type: 'sine', f: 840, dur: 0.12, vol: 0.03 }); break;
        case 'dart': noise({ dur: 0.04, vol: 0.05, type: 'bandpass', f: 2600, q: 3 }); break;
        case 'fire': noise({ dur: 0.16, vol: 0.09, type: 'bandpass', f: 900, f2: 300, q: 1 }); break;
        case 'gold': tone({ type: 'triangle', f: 1760, dur: 0.05, vol: 0.04 }); tone({ type: 'triangle', f: 2640, dur: 0.06, vol: 0.03, delay: 0.03 }); break;
        case 'bolt': tone({ type: 'square', f: 2400, f2: 900, dur: 0.06, vol: 0.04 }); break;
        case 'rock': tone({ type: 'sine', f: 160, f2: 70, dur: 0.09, vol: 0.12 }); break;
        default: tone({ type: 'sawtooth', f: 1500, f2: 380, dur: 0.06, vol: 0.05 });
      }
    },
    // SWARM BALL
    kick: () => { noise({ dur: 0.07, vol: 0.2, type: 'bandpass', f: 1100, f2: 300, q: 1 }); tone({ type: 'sine', f: 190, f2: 70, dur: 0.1, vol: 0.28 }); },
    thud: () => { tone({ type: 'sine', f: 130, f2: 60, dur: 0.08, vol: 0.14 }); noise({ dur: 0.04, vol: 0.06, f: 600 }); },
    tackle: () => { noise({ dur: 0.12, vol: 0.18, type: 'bandpass', f: 600, f2: 200, q: 1 }); tone({ type: 'square', f: 170, f2: 80, dur: 0.09, vol: 0.08 }); },
    grab: () => tone({ type: 'triangle', f: 700, f2: 980, dur: 0.05, vol: 0.07 }),
    missile: () => noise({ dur: 0.3, vol: 0.09, type: 'bandpass', f: 1200, f2: 3200, q: 2 }),
    boom: () => { noise({ dur: 0.5, vol: 0.28, f: 1400, f2: 70 }); tone({ type: 'sine', f: 120, f2: 38, dur: 0.45, vol: 0.34 }); },
    // A referee's whistle: one blast, or n (full time is three).
    whistle: (n = 1) => { for (let i = 0; i < n; i++) { const long = i === n - 1 && n > 1; tone({ type: 'sine', f: 2850, dur: long ? 0.55 : 0.2, vol: 0.07, delay: i * 0.3 }); tone({ type: 'sine', f: 2990, dur: long ? 0.55 : 0.2, vol: 0.05, delay: i * 0.3 }); } },
    // The crowd goes up, and a fanfare if it's your side.
    goal: (mine = true) => {
      noise({ dur: 2.4, vol: 0.22, type: 'bandpass', f: 700, f2: 1100, q: 0.5 });
      noise({ dur: 1.6, vol: 0.12, type: 'bandpass', f: 1800, f2: 1300, q: 0.7, delay: 0.1 });
      if (mine) notes([523, 659, 784, 1047, 0, 784, 1047], { type: 'square', step: 0.1, dur: 0.16, vol: 0.12, delay: 0.15 });
      else notes([330, 311, 294], { type: 'triangle', step: 0.18, dur: 0.25, vol: 0.1, delay: 0.2 });
    },
  };

  function play(name, ...args) {
    if (muted || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, gap = MIN_GAP[name] ?? 0;
    if (gap && now - (last.get(name) ?? -1) < gap) return;
    if (voices > MAX_VOICES && name !== 'nuke' && name !== 'levelup' && name !== 'boss') return;
    last.set(name, now);
    try { SFX[name]?.(...args); } catch { /* never let sound break the game */ }
  }

  // Round music: a minor bassline and arpeggio; drums come in as it gets busy.
  const BASS = [110, 0, 110, 131, 0, 98, 0, 98, 87, 0, 87, 98, 0, 82, 98, 104];
  const ARP = [440, 523, 659, 523, 392, 494, 587, 494, 349, 440, 523, 440, 330, 415, 494, 415];
  let timer = 0, step = 0, nextAt = 0, intensity = 0;
  const STEP = 60 / 138 / 4;
  function schedule() {
    if (!ctx) return;
    while (nextAt < ctx.currentTime + 0.12) {
      const i = step % 16, delay = Math.max(0, nextAt - ctx.currentTime);
      if (BASS[i]) tone({ type: 'triangle', f: BASS[i], dur: STEP * 1.8, vol: 0.5, delay, dest: music });
      if (intensity > 0.15 && i % 2 === 0) tone({ type: 'square', f: ARP[(i + Math.floor(step / 64) * 4) % 16], dur: STEP * 0.9, vol: 0.12 + 0.1 * intensity, delay, dest: music });
      if (intensity > 0.35 && i % 4 === 2) noise({ dur: 0.04, vol: 0.18, type: 'highpass', f: 6000, delay, dest: music });
      if (intensity > 0.6 && i % 8 === 0) tone({ type: 'sine', f: 120, f2: 45, dur: 0.18, vol: 0.6, delay, dest: music });
      nextAt += STEP; step++;
    }
  }
  function startMusic() {
    if (!ctx || timer) return;
    step = 0; nextAt = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 40);
  }
  function stopMusic() { clearInterval(timer); timer = 0; }
  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }

  // Ambience: a breeze on the plaza (birds by day, crickets at night) and a
  // mellow chord pad with a little vinyl crackle in clubs. Very quiet.
  let ambWant = 'none', ambNow = 'none', ambNight = 0, ambGain = null, ambNodes = [], ambTimer = 0, ambStep = 0;
  const PAD = [[220, 277, 330, 415], [196, 247, 294, 370], [175, 220, 262, 330], [165, 208, 247, 311]]; // Amaj7 Gmaj7 Fmaj7 Emaj7-ish
  function stopAmbience() {
    clearInterval(ambTimer); ambTimer = 0;
    if (ambGain) { const g = ambGain, nodes = ambNodes; g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { for (const n of nodes) try { n.stop?.(); n.disconnect(); } catch { /* gone */ } try { g.disconnect(); } catch { /* gone */ } }, 1500); }
    ambGain = null; ambNodes = []; ambNow = 'none';
  }
  function startAmbience(kind) {
    stopAmbience();
    if (!ctx || kind === 'none') return;
    ambNow = kind;
    ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(master);
    ambGain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    if (kind === 'plaza') {
      // Wind: looping noise through a lowpass that slowly breathes.
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
      const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.07; depth.gain.value = 220; lfo.connect(depth); depth.connect(lp.frequency);
      const g = ctx.createGain(); g.gain.value = 0.045;
      src.connect(lp); lp.connect(g); g.connect(ambGain); src.start(); lfo.start();
      ambNodes.push(src, lfo);
    }
    if (kind === 'stadium') {
      // A crowd murmur: noise through a wide band that swells and settles.
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.11; depth.gain.value = 0.02; lfo.connect(depth); depth.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(ambGain); src.start(); lfo.start();
      ambNodes.push(src, lfo);
    }
    ambTimer = setInterval(ambienceTick, 250);
  }
  function ambienceTick() {
    if (!ctx || ctx.state !== 'running' || muted) return;
    ambStep++;
    if (ambNow === 'plaza') {
      if (ambNight > 0.5) {
        // Crickets: quick high chirps in threes.
        if (Math.random() < 0.18) for (let i = 0; i < 3; i++) tone({ type: 'square', f: 4300 + Math.random() * 300, dur: 0.025, vol: 0.006, delay: i * 0.06, dest: ambGain });
      } else if (Math.random() < 0.035) {
        // A bird: two or three little rising whistles.
        const base = 2000 + Math.random() * 900, n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) tone({ type: 'sine', f: base, f2: base * 1.35, dur: 0.09, vol: 0.012, delay: i * 0.13, dest: ambGain });
      }
    } else if (ambNow === 'club') {
      // A soft chord every ~2.5s, and a crackle now and then.
      if (ambStep % 10 === 1) {
        const chord = PAD[Math.floor(ambStep / 10) % PAD.length];
        chord.forEach((f, i) => tone({ type: 'triangle', f, dur: 2.6, vol: 0.012, delay: i * 0.03, attack: 0.5, dest: ambGain }));
        tone({ type: 'sine', f: chord[0] / 2, dur: 2.4, vol: 0.02, attack: 0.2, dest: ambGain });
      }
      if (Math.random() < 0.3) noise({ dur: 0.01, vol: 0.01, type: 'highpass', f: 3000, dest: ambGain });
    }
  }
  /** 'plaza' | 'club' | 'stadium' | 'none'; night (0..1) turns the birds into crickets. */
  function setAmbience(kind, night = 0) {
    ambWant = kind; ambNight = night;
    if (ctx && kind !== ambNow) startAmbience(kind);
  }

  function setMuted(v) {
    muted = v; save('ogw-sound', v ? 'off' : 'on');
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.55, ctx.currentTime, 0.02);
  }

  const state = () => (ctx ? ctx.state : 'none');
  return { unlock, play, state, startMusic, stopMusic, setIntensity, setAmbience, isMuted: () => muted, setMuted, toggle: () => setMuted(!muted) };
}
