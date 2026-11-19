let audioCtx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundsEnabled() {
  return localStorage.getItem('ronncord_sounds') !== 'off';
}

export function setSoundsEnabled(enabled) {
  localStorage.setItem('ronncord_sounds', enabled ? 'on' : 'off');
}

function playChime(notes, { type = 'sine', volume = 0.16, filterFreq = 2600 } = {}) {
  if (!isSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  filter.connect(ctx.destination);

  let offset = ctx.currentTime;
  for (const { freq, dur, gap = 0.018, slideTo } of notes) {
    const osc = ctx.createOscillator();
    const oscHarm = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    oscHarm.type = 'triangle';
    osc.frequency.setValueAtTime(freq, offset);
    oscHarm.frequency.setValueAtTime(freq * 2, offset);

    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, offset + dur);
      oscHarm.frequency.exponentialRampToValueAtTime(slideTo * 2, offset + dur);
    }

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.18;

    gain.gain.setValueAtTime(0.0001, offset);
    gain.gain.linearRampToValueAtTime(volume, offset + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, offset + dur);

    osc.connect(gain);
    oscHarm.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(filter);

    osc.start(offset);
    oscHarm.start(offset);
    osc.stop(offset + dur + 0.015);
    oscHarm.stop(offset + dur + 0.015);
    offset += dur + gap;
  }
}

// Sons do Discord (os mesmos do discordia): ficam em public/sounds/ e baixam uma vez só.
// Se o arquivo falhar, toca o bipe sintetizado de antes.
const SOUND_FILES = { entrar: 'entrar', sair: 'sair', mencao: 'mencao', mutar: 'mutar' };
const soundBuffers = {};

function loadSound(name) {
  const ctx = getCtx();
  if (!ctx) return Promise.reject(new Error('sem AudioContext'));
  if (!soundBuffers[name]) {
    const base = import.meta.env.BASE_URL || '/';
    soundBuffers[name] = fetch(`${base}sounds/${SOUND_FILES[name]}.mp3`)
      .then(r => {
        if (!r.ok) throw new Error(`som ${name}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buf => ctx.decodeAudioData(buf))
      .catch(err => {
        delete soundBuffers[name];
        throw err;
      });
  }
  return soundBuffers[name];
}

function playFile(name, fallback, volume = 0.6) {
  if (!isSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  loadSound(name)
    .then(buffer => {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start();
    })
    .catch(() => fallback?.());
}

// sons da versão sintetizada (usados como reserva se o mp3 não carregar)
const Chimes = {
  // Entrou na call (G4 -> D5)
  joinVoice() {
    playChime([
      { freq: 392.0, dur: 0.09, gap: 0.015 },
      { freq: 587.33, dur: 0.14, gap: 0 }
    ], { type: 'sine', volume: 0.24, filterFreq: 2600 });
  },
  // Saiu da call (D5 -> G4)
  leaveVoice() {
    playChime([
      { freq: 587.33, dur: 0.085, gap: 0.015 },
      { freq: 392.0, dur: 0.15, gap: 0 }
    ], { type: 'sine', volume: 0.24, filterFreq: 2400 });
  },
  // Outro usuário entrou na call (B4 -> E5)
  userJoined() {
    playChime([
      { freq: 493.88, dur: 0.075, gap: 0.015 },
      { freq: 659.25, dur: 0.12, gap: 0 }
    ], { type: 'sine', volume: 0.28, filterFreq: 2800 });
  },
  // Outro usuário saiu da call (E5 -> B4)
  userLeft() {
    playChime([
      { freq: 659.25, dur: 0.075, gap: 0.015 },
      { freq: 493.88, dur: 0.12, gap: 0 }
    ], { type: 'sine', volume: 0.28, filterFreq: 2400 });
  },
  // Mutar microfone
  mute() {
    playChime([
      { freq: 420, dur: 0.06, slideTo: 210 }
    ], { type: 'sine', volume: 0.16, filterFreq: 1800 });
  },
  // Desmutar microfone
  unmute() {
    playChime([
      { freq: 260, dur: 0.06, slideTo: 520 }
    ], { type: 'sine', volume: 0.16, filterFreq: 2400 });
  },
  // Ensurdecer (deafen)
  deafen() {
    playChime([
      { freq: 440.0, dur: 0.055, gap: 0.015 },
      { freq: 277.18, dur: 0.10, gap: 0 }
    ], { type: 'triangle', volume: 0.15, filterFreq: 1900 });
  },
  // Reativar áudio (undeafen)
  undeafen() {
    playChime([
      { freq: 329.63, dur: 0.055, gap: 0.015 },
      { freq: 554.37, dur: 0.10, gap: 0 }
    ], { type: 'triangle', volume: 0.15, filterFreq: 2500 });
  },
  // Iniciar stream / câmera
  streamStart() {
    playChime([
      { freq: 440.0, dur: 0.06, gap: 0.012 },
      { freq: 554.37, dur: 0.06, gap: 0.012 },
      { freq: 659.25, dur: 0.12, gap: 0 }
    ], { type: 'sine', volume: 0.14, filterFreq: 2800 });
  },
  // Parar stream / câmera
  streamStop() {
    playChime([
      { freq: 659.25, dur: 0.06, gap: 0.012 },
      { freq: 440.0, dur: 0.11, gap: 0 }
    ], { type: 'sine', volume: 0.14, filterFreq: 2200 });
  },
  // Nova mensagem recebida
  message() {
    playChime([
      { freq: 523.25, dur: 0.045, gap: 0.01 },
      { freq: 783.99, dur: 0.075, gap: 0 }
    ], { type: 'sine', volume: 0.09, filterFreq: 2600 });
  }
};

// três bipes do discordia: alguém abriu uma tela na call (mesmas notas e tempos de lá)
function screenShareBeeps() {
  if (!isSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1175, 1568].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  });
}

export const SoundFX = {
  ...Chimes,
  // alguém (eu ou outra pessoa da call) começou a transmitir a tela
  screenShare: screenShareBeeps,
  joinVoice: () => playFile('entrar', Chimes.joinVoice),
  leaveVoice: () => playFile('sair', Chimes.leaveVoice),
  userJoined: () => playFile('entrar', Chimes.userJoined),
  userLeft: () => playFile('sair', Chimes.userLeft),
  mute: () => playFile('mutar', Chimes.mute),
  unmute: () => playFile('mutar', Chimes.unmute),
  deafen: () => playFile('mutar', Chimes.deafen),
  undeafen: () => playFile('mutar', Chimes.undeafen),
  // menção, DM ou /aviso (igual ao discordia: mensagem comum não toca)
  message: () => playFile('mencao', Chimes.message)
};
