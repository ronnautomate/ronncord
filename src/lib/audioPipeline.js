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

let cachedGtcrnWasm = null;
let cachedRnnoiseWasm = null;

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
    noiseMode: 'rnnoise', // 'rnnoise' (SIMD ultra-leve) | 'gtcrn' | 'hybrid' | 'off'
    gateThresholdDb: -56,
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    pttEnabled: false,
    pttKey: 'Space'
  };
}

export function saveVoiceSettings(settings) {
  localStorage.setItem('ronncord_voice_settings', JSON.stringify(settings));
}

/**
 * Creates a low-latency 48kHz AudioWorklet pipeline:
 * Mic (AGC OFF so keyboard clicks aren't boosted)
 * -> Voice Bandpass (110Hz HighPass + 7.5kHz LowPass)
 * -> Dual Neural AI Suppressor (RNNoise SIMD -> GTCRN Deep Learning)
 * -> Tight NoiseGate (-38dB default, 110ms hold)
 * -> Broadcast Compressor -> WebRTC Destination
 */
export async function createProcessedMicPipeline(options = {}) {
  const settings = { ...getSavedVoiceSettings(), ...options };
  const useNeural = settings.noiseMode !== 'off';

  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: settings.inputDeviceId && settings.inputDeviceId !== 'default'
        ? { exact: settings.inputDeviceId }
        : undefined,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      // Keep AGC off when Neural AI is active so quiet keyboard/mouse clicks aren't amplified during silence
      autoGainControl: !useNeural,
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

  // 1a. High-pass filter at 90Hz to cut desk bumps and AC hum without thinning voice
  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 90;
  highPass.Q.value = 0.707;

  // 1b. Low-pass filter at 8.5kHz to attenuate high-pitched mechanical keyboard clacks
  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 8500;
  lowPass.Q.value = 0.707;

  source.connect(highPass);
  highPass.connect(lowPass);
  let currentNode = lowPass;

  const aiNodes = [];
  let gateNode = null;

  // 2. Neural AI Noise Suppression
  try {
    if (settings.noiseMode === 'hybrid' || settings.noiseMode === 'rnnoise') {
      await addWorkletModuleSafe(ctx, rnnoiseWorkletUrl);
      const rnBinary = await getRnnoiseBinary();
      const rnNode = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: rnBinary });
      currentNode.connect(rnNode);
      currentNode = rnNode;
      aiNodes.push(rnNode);
    }

    if (settings.noiseMode === 'hybrid' || settings.noiseMode === 'gtcrn') {
      await addWorkletModuleSafe(ctx, gtcrnWorkletUrl);
      const gtBinary = await getGtcrnBinary();
      const gtNode = new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: gtBinary });
      currentNode.connect(gtNode);
      currentNode = gtNode;
      aiNodes.push(gtNode);
    }
  } catch (err) {
    console.warn('[RONNCORD] Neural AI worklet fallback:', err);
  }

  // 3. Tight Smart Noise Gate (blocks keyboard clicks below threshold)
  if (settings.gateThresholdDb > -70) {
    try {
      await addWorkletModuleSafe(ctx, noiseGateWorkletUrl);
      gateNode = new NoiseGateWorkletNode(ctx, {
        openThreshold: settings.gateThresholdDb,
        closeThreshold: settings.gateThresholdDb - 6,
        holdMs: 280,
        maxChannels: 1
      });
      currentNode.connect(gateNode);
      currentNode = gateNode;
    } catch (err) {
      console.warn('[RONNCORD] NoiseGate worklet fallback:', err);
    }
  }

  // 4. Broadcast Voice Compressor (8ms attack avoids boosting sharp 1ms keyboard transients)
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 16;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.14;
  currentNode.connect(compressor);

  // 5. Analyser for real-time VAD & dB meter
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.25;
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
  let lastSpeakTime = 0;

  function startMeter(onLevel) {
    const openDb = Math.max(-52, settings.gateThresholdDb + 2);
    const releaseHoldMs = 220;
    function tick() {
      analyser.getFloatTimeDomainData(timeDomain);
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        sum += timeDomain[i] * timeDomain[i];
      }
      const rms = Math.sqrt(sum / timeDomain.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const normalized = Math.max(0, Math.min(1, (db + 65) / 55));
      const now = performance.now();
      if (db > openDb) {
        lastSpeakTime = now;
      }
      const speaking = now - lastSpeakTime < releaseHoldMs;
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
    for (const node of aiNodes) {
      try { node?.destroy?.(); } catch {}
    }
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
