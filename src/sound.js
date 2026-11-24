// סאונד ללוח המשחק – מוזיקה ואפקטים שמסונתזים בדפדפן (Web Audio), בלי קבצי שמע חיצוניים.
// הדפדפן מאפשר להשמיע צליל רק אחרי לחיצה או הקשה ראשונה על הדף, ולכן יש "שחרור" בפעולה הראשונה.

const MUTE_KEY = 'livequiz-muted';
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let noiseBuf = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';
let wanted = null;
let current = null;
const listeners = new Set();
const lastPlayed = {};

const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

function emit() { listeners.forEach((f) => { try { f(); } catch {} }); }
export function onSoundChange(fn) { listeners.add(fn); }
export function isMuted() { return muted; }
export function isLocked() { return !ctx || ctx.state !== 'running'; }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.3;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.75;
  sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ctx.onstatechange = emit;
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().then(() => { emit(); if (wanted && !current) startMusic(wanted); }).catch(() => {});
  } else if (wanted && !current) startMusic(wanted);
}
let gestureUnlocked = false;
/** האם הלחיצה האחרונה היא זו ששחררה את הסאונד (נקרא פעם אחת) */
export function consumeGestureUnlock() { const v = gestureUnlocked; gestureUnlocked = false; return v; }
export function installUnlock() {
  const fn = () => { gestureUnlocked = isLocked(); unlock(); };
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, fn, { capture: true }));
}
export function setMuted(m) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  emit();
}

// ---------------------------------------------------------------- אבני בניין
function voice(bus, { f, t, d, type = 'triangle', v = 0.2, a = 0.01, f2 = null, filter = null, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let node = o;
  if (filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = filter;
    o.connect(fl);
    node = fl;
  }
  node.connect(g).connect(bus);
  o.start(t);
  o.stop(t + d + 0.05);
}
function noise(bus, { t, d, v = 0.2, type = 'highpass', freq = 6000, q = 0.7, a = 0.002, sweepTo = null }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(freq, t);
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + d);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(fl).connect(g).connect(bus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + d + 0.05);
}
function snare(bus, t, v = 0.18) { noise(bus, { t, d: 0.12, v, type: 'bandpass', freq: 2200, q: 0.8 }); }
function kick(bus, t, v = 0.35) { voice(bus, { f: 120, f2: 45, t, d: 0.18, type: 'sine', v }); }

// ---------------------------------------------------------------- אפקטים
const SFX = {
  join(t) {
    const notes = [72, 74, 76, 79, 81, 84];
    const m = notes[Math.floor(Math.random() * notes.length)];
    voice(sfxBus, { f: N(m), f2: N(m + 7), t, d: 0.16, type: 'sine', v: 0.16 });
  },
  start(t) {
    noise(sfxBus, { t, d: 0.5, v: 0.12, type: 'bandpass', freq: 600, sweepTo: 5000, q: 1.2, a: 0.2 });
    voice(sfxBus, { f: N(79), t: t + 0.32, d: 0.5, v: 0.16 });
    voice(sfxBus, { f: N(86), t: t + 0.44, d: 0.7, v: 0.16 });
  },
  softStart(t) {
    [72, 76, 79].forEach((m, i) => voice(sfxBus, { f: N(m), t: t + i * 0.09, d: 0.9, type: 'sine', v: 0.1 }));
  },
  /** מעבר לשקף – "דפדוף" רך וצליל קצר */
  slide(t) {
    noise(sfxBus, { t, d: 0.28, v: 0.05, type: 'bandpass', freq: 900, sweepTo: 3500, q: 0.9, a: 0.08 });
    voice(sfxBus, { f: N(79), t: t + 0.16, d: 0.7, type: 'sine', v: 0.08 });
    voice(sfxBus, { f: N(84), t: t + 0.24, d: 0.8, type: 'sine', v: 0.06 });
  },
  answer(t) { voice(sfxBus, { f: 1500, f2: 2100, t, d: 0.06, type: 'sine', v: 0.05 }); },
  tick(t, n) {
    const hi = n <= 3;
    voice(sfxBus, { f: hi ? 1400 : 1050, t, d: 0.07, type: 'square', v: hi ? 0.07 : 0.05, filter: 3000 });
    noise(sfxBus, { t, d: 0.03, v: 0.06, freq: 7000 });
  },
  reveal(t) {
    [72, 76, 79, 84].forEach((m, i) => voice(sfxBus, { f: N(m), t: t + i * 0.07, d: 0.9, v: 0.15 }));
    [96, 100, 103].forEach((m, i) => voice(sfxBus, { f: N(m), t: t + 0.3 + i * 0.05, d: 0.6, type: 'sine', v: 0.04 }));
    noise(sfxBus, { t: t + 0.25, d: 0.8, v: 0.03, freq: 9000 });
  },
  leaderboard(t) {
    for (let i = 0; i < 18; i++) snare(sfxBus, t + i * 0.065 * (1 - i * 0.018), 0.05 + i * 0.006);
    const s = t + 1.05;
    kick(sfxBus, s, 0.4);
    [60, 64, 67, 72].forEach((m) => voice(sfxBus, { f: N(m), t: s, d: 1.3, type: 'sawtooth', v: 0.06, filter: 2200 }));
    voice(sfxBus, { f: N(84), t: s, d: 1.1, v: 0.1 });
  },
  pop(t) {
    const m = [76, 79, 81, 84, 86][Math.floor(Math.random() * 5)];
    voice(sfxBus, { f: N(m) * 0.5, f2: N(m), t, d: 0.12, type: 'sine', v: 0.12 });
  },
  finale(t) {
    for (let i = 0; i < 30; i++) snare(sfxBus, t + i * 0.075, 0.04 + i * 0.004);
    const s = t + 2.3;
    kick(sfxBus, s, 0.45);
    const fan = [[67, 0], [72, 0.16], [76, 0.32], [79, 0.48]];
    fan.forEach(([m, dt]) => voice(sfxBus, { f: N(m), t: s + dt, d: 0.3, type: 'sawtooth', v: 0.09, filter: 2600 }));
    [60, 64, 67, 72, 76].forEach((m) => voice(sfxBus, { f: N(m), t: s + 0.64, d: 2.6, type: 'sawtooth', v: 0.05, filter: 2400, a: 0.03 }));
    voice(sfxBus, { f: N(84), t: s + 0.64, d: 2.4, v: 0.1 });
    kick(sfxBus, s + 0.64, 0.4);
    // מחיאות כפיים
    for (let i = 0; i < 90; i++) {
      const tt = s + 0.7 + Math.random() * 3.2;
      noise(sfxBus, { t: tt, d: 0.05 + Math.random() * 0.05, v: 0.025 + Math.random() * 0.03, type: 'bandpass', freq: 1200 + Math.random() * 1600, q: 1 });
    }
  },
  thanks(t) {
    [72, 76, 79, 84, 88].forEach((m, i) => voice(sfxBus, { f: N(m), t: t + i * 0.12, d: 1.4, v: 0.12 }));
  },
};

export function sfx(name, arg, minGapMs = 0) {
  if (!ctx || ctx.state !== 'running' || muted || !SFX[name]) return;
  const now = performance.now();
  if (minGapMs && lastPlayed[name] && now - lastPlayed[name] < minGapMs) return;
  lastPlayed[name] = now;
  SFX[name](ctx.currentTime + 0.02, arg);
}

// ---------------------------------------------------------------- מוזיקת רקע
const MUSIC = {
  // לובי: קליל ואופטימי, דו מז'ור – I-vi-IV-V
  lobby: {
    bpm: 104, steps: 32,
    play(bus, step, t, len) {
      const chords = [[48, [60, 64, 67, 72]], [45, [57, 60, 64, 69]], [41, [57, 60, 65, 69]], [43, [55, 59, 62, 67]]];
      const [bass, tones] = chords[Math.floor(step / 8) % 4];
      const s = step % 8;
      if (s === 0 || s === 4) { voice(bus, { f: N(bass), t, d: len * 3.5, type: 'sine', v: 0.32 }); kick(bus, t, 0.18); }
      if (s === 6) voice(bus, { f: N(bass + 12), t, d: len * 1.5, type: 'sine', v: 0.18 });
      const arp = [0, 1, 2, 3, 2, 1, 2, 3][s];
      voice(bus, { f: N(tones[arp] + 12), t, d: len * 1.8, v: 0.1, filter: 3200 });
      if (s % 2 === 1) noise(bus, { t, d: 0.04, v: 0.035, freq: 8000 });
      if (s === 4) snare(bus, t, 0.05);
    },
  },
  // שאלה: מתח קצבי, לה מינור
  question: {
    bpm: 128, steps: 16,
    play(bus, step, t, len) {
      const chords = [[45, [69, 72, 76]], [41, [69, 72, 77]], [43, [67, 71, 74]], [40, [68, 71, 76]]];
      const [bass, tones] = chords[Math.floor(step / 4) % 4];
      voice(bus, { f: N(step % 2 ? bass + 12 : bass), t, d: len * 0.9, type: 'sawtooth', v: 0.1, filter: 650 });
      voice(bus, { f: N(tones[step % 3]), t, d: len * 0.8, type: 'square', v: 0.035, filter: 2400 });
      if (step % 2 === 0) kick(bus, t, 0.22);
      noise(bus, { t, d: 0.035, v: step % 2 ? 0.05 : 0.03, freq: 9000 });
      if (step % 4 === 2) snare(bus, t, 0.06);
    },
  },
  // פעילויות: רגוע ונעים
  calm: {
    bpm: 72, steps: 16,
    play(bus, step, t, len) {
      const pads = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]];
      if (step % 4 === 0) {
        const p = pads[(step / 4) % 4];
        p.forEach((m) => voice(bus, { f: N(m), t, d: len * 8.5, v: 0.045, a: 0.6, filter: 1600 }));
        voice(bus, { f: N(p[0] - 12), t, d: len * 8, type: 'sine', v: 0.14, a: 0.2 });
      }
      if (step % 2 === 0 && Math.random() < 0.55) {
        const bell = [72, 74, 76, 79, 81, 84][Math.floor(Math.random() * 6)];
        voice(bus, { f: N(bell), t, d: 1.6, type: 'sine', v: 0.06 });
      }
    },
  },
};

function startMusic(name) {
  if (!ctx || ctx.state !== 'running') return;
  const def = MUSIC[name];
  if (!def) return;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
  bus.connect(musicBus);
  const len = 60 / def.bpm / 2; // שמיניות
  let step = 0;
  let next = ctx.currentTime + 0.08;
  const timer = setInterval(() => {
    while (next < ctx.currentTime + 0.25) {
      if (!muted) def.play(bus, step % def.steps, next, len);
      step++;
      next += len;
    }
  }, 40);
  current = {
    name,
    stop() {
      clearInterval(timer);
      const tt = ctx.currentTime;
      bus.gain.cancelScheduledValues(tt);
      bus.gain.setValueAtTime(bus.gain.value || 0.0001, tt);
      bus.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
      setTimeout(() => bus.disconnect(), 900);
    },
  };
}

/** מחליף את מוזיקת הרקע (null = שקט) */
export function music(name) {
  wanted = name || null;
  if (current && current.name === name) return;
  if (current) { current.stop(); current = null; }
  if (name) startMusic(name);
}
