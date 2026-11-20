// Soundboard da call (igual o do Discord): os sons são feitos na hora com WebAudio
// (não tem arquivo pra baixar) e quem clica toca pra todo mundo da call.
// Sons próprios: a pessoa sobe um áudio curto e ele fica salvo no navegador dela.
import { getSoundVolume } from './soundEffects.js';

export const SOUNDBOARD = [
  { id: 'buzina', name: 'Buzina', emoji: '📯' },
  { id: 'badumtss', name: 'Ba dum tss', emoji: '🥁' },
  { id: 'aplausos', name: 'Aplausos', emoji: '👏' },
  { id: 'grilo', name: 'Grilo', emoji: '🦗' },
  { id: 'triste', name: 'Trombone triste', emoji: '😢' },
  { id: 'pato', name: 'Pato', emoji: '🦆' },
  { id: 'vitoria', name: 'Vitória', emoji: '🏆' },
  { id: 'suspense', name: 'Suspense', emoji: '😱' }
];

let ctx = null;
function getCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    const id = localStorage.getItem('ronncord_output_device');
    if (ctx.setSinkId && id && id !== 'default') ctx.setSinkId(id).catch(() => {});
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function master(c, vol = 1) {
  const g = c.createGain();
  g.gain.value = 0.5 * vol * (getSoundVolume() / 100);
  g.connect(c.destination);
  return g;
}

function tone(c, out, { type = 'sine', f0, f1 = f0, t = 0, dur = 0.3, vol = 0.5, vibrato = 0, filter = null }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const start = c.currentTime + t;
  o.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, start + dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(start);
    lfo.stop(start + dur);
  }
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.015);
  g.gain.setValueAtTime(vol, start + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = o;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq;
    if (filter.q) f.Q.value = filter.q;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(c, out, { t = 0, dur = 0.2, vol = 0.4, hp = 0, bp = 0, q = 1 }) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  let node = src;
  if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; node.connect(f); node = f; }
  node.connect(g).connect(out);
  src.start(c.currentTime + t);
}

const SYNTHS = {
  buzina(c, o) {
    for (const [t, d] of [[0, 0.22], [0.28, 0.22], [0.56, 0.9]]) {
      for (const f of [466, 554, 698]) tone(c, o, { type: 'sawtooth', f0: f, t, dur: d, vol: 0.16, vibrato: 4, filter: { freq: 2600 } });
    }
  },
  badumtss(c, o) {
    tone(c, o, { f0: 180, f1: 60, t: 0, dur: 0.18, vol: 0.9 });
    tone(c, o, { f0: 220, f1: 70, t: 0.2, dur: 0.18, vol: 0.9 });
    noise(c, o, { t: 0.4, dur: 0.9, vol: 0.35, hp: 6000 });
    tone(c, o, { f0: 150, f1: 50, t: 0.4, dur: 0.2, vol: 0.7 });
  },
  aplausos(c, o) {
    for (let i = 0; i < 70; i++) noise(c, o, { t: Math.random() * 1.8, dur: 0.05, vol: 0.25 + Math.random() * 0.2, bp: 1500 + Math.random() * 1500, q: 0.8 });
  },
  grilo(c, o) {
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 4; i++) tone(c, o, { f0: 4400, t: k * 0.45 + i * 0.035, dur: 0.025, vol: 0.18 });
    }
  },
  triste(c, o) {
    const notes = [[392, 0, 0.45], [370, 0.5, 0.45], [349, 1.0, 0.45], [330, 1.5, 1.2]];
    for (const [f, t, d] of notes) tone(c, o, { type: 'sawtooth', f0: f, f1: t === 1.5 ? f * 0.97 : f, t, dur: d, vol: 0.28, vibrato: t === 1.5 ? 8 : 0, filter: { freq: 1100 } });
  },
  pato(c, o) {
    for (const t of [0, 0.22]) tone(c, o, { type: 'square', f0: 620, f1: 300, t, dur: 0.16, vol: 0.3, filter: { type: 'bandpass', freq: 1200, q: 2 } });
  },
  vitoria(c, o) {
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]];
    for (const [f, t] of seq) tone(c, o, { type: 'triangle', f0: f, t, dur: 0.14, vol: 0.4 });
    for (const f of [523, 659, 784, 1047]) tone(c, o, { type: 'triangle', f0: f, t: 0.52, dur: 0.9, vol: 0.18 });
  },
  suspense(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 147, t: 0, dur: 0.35, vol: 0.35, filter: { freq: 700 } });
    tone(c, o, { type: 'sawtooth', f0: 139, t: 0.45, dur: 0.35, vol: 0.35, filter: { freq: 700 } });
    tone(c, o, { type: 'sawtooth', f0: 131, t: 0.9, dur: 1.4, vol: 0.4, vibrato: 3, filter: { freq: 700 } });
  }
};

export function playBoardSound(id) {
  const c = getCtx();
  const fn = SYNTHS[id];
  if (!c || !fn) return;
  fn(c, master(c));
}

export async function playBoardUrl(url) {
  const c = getCtx();
  if (!c || !url) return;
  try {
    const buf = await fetch(url).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b));
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(master(c, 1.4));
    src.start();
    src.stop(c.currentTime + Math.min(buf.duration, 6)); // som próprio toca no máximo 6 s
  } catch {}
}

// sons próprios (ficam no navegador de quem subiu): [{ id, name, emoji, url }]
export function getCustomSounds() {
  try { return JSON.parse(localStorage.getItem('ronncord_custom_sounds') || '[]'); } catch { return []; }
}
export function saveCustomSounds(list) {
  localStorage.setItem('ronncord_custom_sounds', JSON.stringify(list.slice(0, 12)));
}
