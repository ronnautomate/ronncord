import {
  GtcrnWorkletNode,
  RnnoiseWorkletNode,
  NoiseGateWorkletNode,
  loadGtcrn,
  loadRnnoise
} from '@sapphi-red/web-noise-suppressor';

import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import noiseGateWorkletUrl from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url';

let cachedGtcrnWasm = null;
let cachedRnnoiseWasm = null;

async function addWorkletModuleSafe(ctx, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading worklet`);
  const code = await res.text();
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function getGtcrnBinary() {
  if (!cachedGtcrnWasm) {
    cachedGtcrnWasm = await loadGtcrn({ url: gtcrnWasmUrl });
  }
  return cachedGtcrnWasm.slice(0);
}

async function getRnnoiseBinary() {
  if (!cachedRnnoiseWasm) {
    cachedRnnoiseWasm = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
  }
  return cachedRnnoiseWasm.slice(0);
}

export function getSavedVoiceSettings() {
  try {
    const raw = localStorage.getItem('ronncord_voice_settings');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    noiseMode: 'gtcrn', // 'gtcrn' | 'rnnoise' | 'off'
    gateThresholdDb: -48,
    inputDeviceId: 'default',
    outputDeviceId: 'default'
  };
}

export function saveVoiceSettings(settings) {
  localStorage.setItem('ronncord_voice_settings', JSON.stringify(settings));
}

/**
 * Creates a low-latency 48kHz AudioWorklet pipeline:
 * Mic -> HighPass (85Hz) -> Neural AI Suppressor (GTCRN / RNNoise) -> NoiseGate -> Compressor -> WebRTC Destination
 */
export async function createProcessedMicPipeline(options = {}) {
  const settings = { ...getSavedVoiceSettings(), ...options };
  const useNeural = settings.noiseMode === 'gtcrn' || settings.noiseMode === 'rnnoise';

  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: settings.inputDeviceId && settings.inputDeviceId !== 'default'
        ? { exact: settings.inputDeviceId }
        : undefined,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      autoGainControl: true,
      // Disable browser's basic suppressor when Neural AI is active to avoid muffled speech
      noiseSuppression: !useNeural
    },
    video: false
  });

  const ctx = new AudioContext({
    sampleRate: 48000,
    latencyHint: 'interactive'
  });

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const source = ctx.createMediaStreamSource(rawStream);

  // 1. High-pass filter at 85Hz to eliminate desk bumps, AC hum, and wind rumble
  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 85;
  highPass.Q.value = 0.707;

  let currentNode = highPass;
  source.connect(highPass);

  let aiNode = null;
  let gateNode = null;

  // 2. Neural AI Noise Suppression (GTCRN or RNNoise SIMD)
  try {
    if (settings.noiseMode === 'gtcrn') {
      await addWorkletModuleSafe(ctx, gtcrnWorkletUrl);
      const wasmBinary = await getGtcrnBinary();
      aiNode = new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary });
      currentNode.connect(aiNode);
      currentNode = aiNode;
    } else if (settings.noiseMode === 'rnnoise') {
      await addWorkletModuleSafe(ctx, rnnoiseWorkletUrl);
      const wasmBinary = await getRnnoiseBinary();
      aiNode = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
      currentNode.connect(aiNode);
      currentNode = aiNode;
    }
  } catch (err) {
    console.warn('[RONNCORD] Neural AI worklet fallback:', err);
  }

  // 3. Smart Noise Gate
  if (settings.gateThresholdDb > -70) {
    try {
      await addWorkletModuleSafe(ctx, noiseGateWorkletUrl);
      gateNode = new NoiseGateWorkletNode(ctx, {
        openThreshold: settings.gateThresholdDb,
        closeThreshold: settings.gateThresholdDb - 4,
        holdMs: 180,
        maxChannels: 1
      });
      currentNode.connect(gateNode);
      currentNode = gateNode;
    } catch (err) {
      console.warn('[RONNCORD] NoiseGate worklet fallback:', err);
    }
  }

  // 4. Broadcast Voice Compressor (prevents clipping, keeps quiet voice clear)
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  currentNode.connect(compressor);

  // 5. Analyser for real-time VAD & dB meter
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  compressor.connect(analyser);

  const destination = ctx.createMediaStreamDestination();
  compressor.connect(destination);

  // Optional loopback gain (for Mic Test)
  const monitorGain = ctx.createGain();
  monitorGain.gain.value = 0;
  compressor.connect(monitorGain);
  monitorGain.connect(ctx.destination);

  const timeDomain = new Float32Array(analyser.fftSize);
  let rafId = null;
  let lastSpeaking = false;

  function startMeter(onLevel) {
    function tick() {
      analyser.getFloatTimeDomainData(timeDomain);
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        sum += timeDomain[i] * timeDomain[i];
      }
      const rms = Math.sqrt(sum / timeDomain.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const normalized = Math.max(0, Math.min(1, (db + 65) / 55));
      const speaking = db > -46;
      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;
      }
      onLevel({ db, normalized, speaking });
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function setMonitorEnabled(enabled) {
    monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.015);
  }

  function setMuted(muted) {
    destination.stream.getAudioTracks().forEach(t => {
      t.enabled = !muted;
    });
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    try { aiNode?.destroy?.(); } catch {}
    try { gateNode?.disconnect(); } catch {}
    rawStream.getTracks().forEach(t => t.stop());
    ctx.close().catch(() => {});
  }

  return {
    stream: destination.stream,
    rawStream,
    context: ctx,
    noiseMode: settings.noiseMode,
    startMeter,
    setMonitorEnabled,
    setMuted,
    destroy
  };
}
