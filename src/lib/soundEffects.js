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

function playToneSequence(notes, type = 'sine', volume = 0.14) {
  if (!isSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  let offset = ctx.currentTime;
  for (const { freq, dur, gap = 0.015, slideTo } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, offset);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, offset + dur);
    }

    gain.gain.setValueAtTime(0.001, offset);
    gain.gain.linearRampToValueAtTime(volume, offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, offset + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(offset);
    osc.stop(offset + dur + 0.01);
    offset += dur + gap;
  }
}

export const SoundFX = {
  // Entrou na call (acorde ascendente estilo Discord)
  joinVoice() {
    playToneSequence([
      { freq: 440, dur: 0.08, gap: 0.02 },
      { freq: 587.33, dur: 0.12, gap: 0 }
    ], 'triangle', 0.16);
  },
  // Saiu da call (acorde descendente)
  leaveVoice() {
    playToneSequence([
      { freq: 523.25, dur: 0.08, gap: 0.02 },
      { freq: 349.23, dur: 0.14, gap: 0 }
    ], 'triangle', 0.16);
  },
  // Outro amigo entrou na call
  userJoined() {
    playToneSequence([
      { freq: 520, dur: 0.06, gap: 0.015 },
      { freq: 680, dur: 0.09, gap: 0 }
    ], 'sine', 0.11);
  },
  // Outro amigo saiu da call
  userLeft() {
    playToneSequence([
      { freq: 480, dur: 0.06, gap: 0.015 },
      { freq: 340, dur: 0.09, gap: 0 }
    ], 'sine', 0.11);
  },
  // Mutar microfone
  mute() {
    playToneSequence([
      { freq: 380, dur: 0.055, slideTo: 240 }
    ], 'sine', 0.14);
  },
  // Desmutar microfone
  unmute() {
    playToneSequence([
      { freq: 320, dur: 0.055, slideTo: 520 }
    ], 'sine', 0.14);
  },
  // Ensurdecer (deafen)
  deafen() {
    playToneSequence([
      { freq: 440, dur: 0.05, gap: 0.02 },
      { freq: 293.66, dur: 0.09, gap: 0 }
    ], 'triangle', 0.14);
  },
  // Reativar áudio (undeafen)
  undeafen() {
    playToneSequence([
      { freq: 329.63, dur: 0.05, gap: 0.02 },
      { freq: 523.25, dur: 0.09, gap: 0 }
    ], 'triangle', 0.14);
  },
  // Iniciar stream / câmera
  streamStart() {
    playToneSequence([
      { freq: 493.88, dur: 0.06, gap: 0.02 },
      { freq: 659.25, dur: 0.06, gap: 0.02 },
      { freq: 783.99, dur: 0.11, gap: 0 }
    ], 'sine', 0.12);
  },
  // Parar stream / câmera
  streamStop() {
    playToneSequence([
      { freq: 659.25, dur: 0.06, gap: 0.02 },
      { freq: 440, dur: 0.1, gap: 0 }
    ], 'sine', 0.12);
  },
  // Nova mensagem recebida
  message() {
    playToneSequence([
      { freq: 660, dur: 0.045, gap: 0.01 },
      { freq: 880, dur: 0.065, gap: 0 }
    ], 'sine', 0.08);
  }
};
