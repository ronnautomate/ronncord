import { createProcessedMicPipeline } from './audioPipeline.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USER || '',
    credential: import.meta.env.VITE_TURN_PASSWORD || ''
  });
}

/**
 * Tunes Opus SDP parameters for ultra-low-latency voice (10ms ptime, in-band FEC, 96kbps)
 */
function tuneOpusSdp(sdp) {
  if (!sdp) return sdp;
  const lines = sdp.split('\r\n');
  let opusPayload = null;

  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }
  if (!opusPayload) return sdp;

  const fmtpPrefix = `a=fmtp:${opusPayload} `;
  let foundFmtp = false;
  const tuned = lines.map(line => {
    if (line.startsWith(fmtpPrefix)) {
      foundFmtp = true;
      let params = line.slice(fmtpPrefix.length);
      const extras = ['minptime=10', 'useinbandfec=1', 'usedtx=0', 'maxaveragebitrate=64000', 'stereo=0'];
      for (const kv of extras) {
        const key = kv.split('=')[0];
        if (!params.includes(`${key}=`)) {
          params += (params ? ';' : '') + kv;
        }
      }
      return fmtpPrefix + params;
    }
    return line;
  });

  if (!foundFmtp) {
    const idx = tuned.findIndex(l => l.startsWith(`a=rtpmap:${opusPayload}`));
    if (idx !== -1) {
      tuned.splice(idx + 1, 0, `${fmtpPrefix}minptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=64000`);
    }
  }

  return tuned.join('\r\n');
}

/**
 * Adds high-bitrate video hints (12 Mbps) and prefers VP9 (avoids Windows H.264 green-tint artifacts)
 */
function tuneVideoSdp(sdp) {
  if (!sdp) return sdp;
  let out = sdp.replace(/(m=video[^\r\n]*\r\n)/g, '$1b=AS:12000\r\n');
  const vp9Match = out.match(/a=rtpmap:(\d+)\s+VP9\/90000/i);
  if (vp9Match) {
    const vp9Pt = vp9Match[1];
    out = out.replace(/^(m=video \d+ [^\s]+ )(.+)$/m, (_full, prefix, pts) => {
      const list = pts.split(' ').filter(p => p !== vp9Pt);
      return `${prefix}${vp9Pt} ${list.join(' ')}`;
    });
    const fmtpRegex = new RegExp(`a=fmtp:${vp9Pt} ([^\\r\\n]+)`, 'i');
    if (fmtpRegex.test(out)) {
      out = out.replace(fmtpRegex, `a=fmtp:${vp9Pt} $1;x-google-min-bitrate=3000;x-google-start-bitrate=6000;x-google-max-bitrate=12000`);
    } else {
      out = out.replace(
        new RegExp(`(a=rtpmap:${vp9Pt} VP9\\/90000\\r\\n)`, 'i'),
        `$1a=fmtp:${vp9Pt} x-google-min-bitrate=3000;x-google-start-bitrate=6000;x-google-max-bitrate=12000\r\n`
      );
    }
  }
  return out;
}

/**
 * Configures WebRTC video sender for sharp 1080p 60fps streaming (12 Mbps max bitrate, no downscaling)
 */
async function tuneVideoSender(sender) {
  if (!sender || typeof sender.getParameters !== 'function') return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 12_000_000; // 12 Mbps for razor-sharp 1080p60
    params.encodings[0].maxFramerate = 60;
    params.encodings[0].scaleResolutionDownBy = 1.0;
    params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch {
    // Some browsers ignore specific encoding fields
  }
}

// Qualidade da stream escolhida por quem ASSISTE (cada um pede a sua).
// Como a call é direta entre as pessoas, quem assiste manda um pedido e quem transmite
// ajusta só o envio pra aquela pessoa. 'source' = como sai do PC (1080p 60fps, 12 Mbps).
export const SCREEN_QUALITIES = [
  { id: 'source', label: 'Original', height: null, bitrate: 12_000_000, fps: 60 },
  { id: '720', label: '720p', height: 720, bitrate: 3_500_000, fps: 30 },
  { id: '480', label: '480p', height: 480, bitrate: 1_200_000, fps: 30 }
];

async function applyScreenQuality(sender, qualityId) {
  if (!sender || typeof sender.getParameters !== 'function') return;
  const q = SCREEN_QUALITIES.find(x => x.id === qualityId) || SCREEN_QUALITIES[0];
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    const trackHeight = sender.track?.getSettings?.().height || 1080;
    params.encodings[0].maxBitrate = q.bitrate;
    params.encodings[0].maxFramerate = q.fps;
    params.encodings[0].scaleResolutionDownBy = q.height ? Math.max(1, trackHeight / q.height) : 1.0;
    params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch {
    // navegador ignorou algum campo
  }
}

export function getSavedUserVolumes() {
  try {
    return JSON.parse(localStorage.getItem('ronncord_user_volumes') || '{}');
  } catch {
    return {};
  }
}

export function saveUserVolume(userId, percent) {
  const map = getSavedUserVolumes();
  map[userId] = Math.max(0, Math.min(400, Number(percent)));
  localStorage.setItem('ronncord_user_volumes', JSON.stringify(map));
  return map[userId];
}

export class VoiceManager {
  constructor(socket, callbacks = {}) {
    this.socket = socket;
    this.callbacks = callbacks; // { onPing, onSpeakingChange, onRemoteVideos, onError }
    this.channelId = null;
    this.pipeline = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.playbackCtx = null;
    this.peers = new Map(); // socketId -> { pc, audioEls, gainNodes, userId, displayName, pendingCandidates }
    this.remoteVideos = new Map(); // `${socketId}:${trackId}` -> { id, socketId, trackId, kind, displayName, stream }
    this.screenQualityForPeer = new Map(); // quem transmite: socketId de quem assiste -> qualidade pedida
    this.requestedScreenQuality = new Map(); // quem assiste: socketId de quem transmite -> qualidade que eu pedi
    this.trackMetaMap = new Map(); // trackId -> 'camera' | 'screen'
    this.screenAudioMuted = new Set(); // socketId set for muted screen-share audio
    this.muted = false;
    this.deafened = false;
    this.pingTimer = null;
    this.lastSpeaking = false;

    this._onPeers = this._handlePeers.bind(this);
    this._onSignal = this._handleSignal.bind(this);
    this._onParticipants = this._handleParticipants.bind(this);

    if (this.socket) {
      this.socket.on('voice:peers', this._onPeers);
      this.socket.on('webrtc:signal', this._onSignal);
      this.socket.on('voice:participants', this._onParticipants);
    }
  }

  async join(channelId, voiceSettings = {}, initialState = {}) {
    if (this.channelId === channelId) return;
    await this.leave();

    this.channelId = channelId;
    if (initialState.muted !== undefined) this.muted = Boolean(initialState.muted);
    if (initialState.deafened !== undefined) this.deafened = Boolean(initialState.deafened);
    try {
      this.pipeline = await createProcessedMicPipeline(voiceSettings);
      this.pipeline.setMuted(this.muted);
      this.pipeline.startMeter(({ speaking }) => {
        const actualSpeaking = !this.muted && speaking;
        if (actualSpeaking !== this.lastSpeaking) {
          this.lastSpeaking = actualSpeaking;
          this.callbacks.onSpeakingChange?.(actualSpeaking);
          this.socket?.emit('voice:state', { channelId: this.channelId, speaking: actualSpeaking });
        }
      });
    } catch (err) {
      this.callbacks.onError?.('Não foi possível acessar o microfone: ' + err.message);
      throw err;
    }

    this.socket?.emit('voice:join', {
      channelId,
      muted: this.muted,
      deafened: this.deafened
    });
    this.pingTimer = setInterval(() => this._measurePing(), 2000);
  }

  async reloadPipeline(voiceSettings) {
    if (!this.channelId) return;
    const oldPipeline = this.pipeline;
    this.pipeline = await createProcessedMicPipeline(voiceSettings);
    this.pipeline.setMuted(this.muted);

    const newAudioTrack = this.pipeline.stream.getAudioTracks()[0];
    for (const peer of this.peers.values()) {
      const sender = peer.micSender || peer.pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender && newAudioTrack) {
        await sender.replaceTrack(newAudioTrack);
      }
    }

    this.pipeline.startMeter(({ speaking }) => {
      const actualSpeaking = !this.muted && speaking;
      if (actualSpeaking !== this.lastSpeaking) {
        this.lastSpeaking = actualSpeaking;
        this.callbacks.onSpeakingChange?.(actualSpeaking);
        this.socket?.emit('voice:state', { channelId: this.channelId, speaking: actualSpeaking });
      }
    });

    oldPipeline?.destroy();
  }

  async leave() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.channelId) {
      this.socket?.emit('voice:leave', this.channelId);
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    for (const socketId of Array.from(this.peers.keys())) {
      this._closePeer(socketId);
    }
    this.pipeline?.destroy();
    this.pipeline = null;
    this.channelId = null;
    this.lastSpeaking = false;
    this.callbacks.onPing?.(null);
    this.callbacks.onRemoteVideos?.([]);
  }

  setMuted(muted) {
    this.muted = muted;
    this.pipeline?.setMuted(muted);
    if (this.channelId) {
      this.socket?.emit('voice:state', {
        channelId: this.channelId,
        muted,
        speaking: muted ? false : this.lastSpeaking
      });
    }
  }

  setScreenAudioMuted(socketId, isMuted) {
    if (isMuted) this.screenAudioMuted.add(socketId);
    else this.screenAudioMuted.delete(socketId);
    const peer = this.peers.get(socketId);
    if (!peer) return;
    const shouldMute = this.deafened || isMuted;
    if (peer.screenAudioEls) {
      for (const sEl of peer.screenAudioEls.values()) {
        sEl.muted = shouldMute;
      }
    }
  }

  setScreenAudioVolume(socketId, percent) {
    const clamped = Math.max(0, Math.min(100, Number(percent)));
    if (clamped === 0) this.screenAudioMuted.add(socketId);
    else this.screenAudioMuted.delete(socketId);
    const peer = this.peers.get(socketId);
    if (peer?.screenAudioEls) {
      for (const sEl of peer.screenAudioEls.values()) {
        sEl.muted = this.deafened || clamped === 0;
        sEl.volume = clamped / 100;
      }
    }
    return clamped;
  }

  setDeafened(deafened) {
    this.deafened = deafened;
    const vols = getSavedUserVolumes();
    for (const [sid, peer] of this.peers.entries()) {
      const vol = vols[peer.userId] ?? 100;
      const useBoost = vol > 100;
      for (const audioEl of peer.audioEls.values()) {
        audioEl.muted = deafened || useBoost || vol === 0;
        if (!useBoost) audioEl.volume = Math.min(1, vol / 100);
      }
      if (peer.gainNodes) {
        for (const gain of peer.gainNodes.values()) {
          gain.gain.value = (deafened || !useBoost) ? 0 : (vol / 100);
        }
      }
      const scrMuted = deafened || this.screenAudioMuted.has(sid);
      for (const sEl of (peer.screenAudioEls?.values() || [])) {
        sEl.muted = scrMuted;
      }
    }
    if (this.channelId) {
      this.socket?.emit('voice:state', { channelId: this.channelId, deafened });
    }
  }

  setUserVolume(userId, percent) {
    const clamped = saveUserVolume(userId, percent);
    if (this.playbackCtx?.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }
    if (this.deafened) return clamped;
    const useBoost = clamped > 100;
    for (const peer of this.peers.values()) {
      if (peer.userId === userId) {
        for (const audioEl of peer.audioEls.values()) {
          audioEl.muted = useBoost || clamped === 0;
          if (!useBoost) audioEl.volume = Math.min(1, clamped / 100);
        }
        if (peer.gainNodes) {
          for (const gain of peer.gainNodes.values()) {
            gain.gain.value = useBoost ? (clamped / 100) : 0;
          }
        }
      }
    }
    return clamped;
  }

  async _attachVideoStreamToPeers(stream, streamKind) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    if (!videoTrack && !audioTrack) return;
    if (videoTrack && 'contentHint' in videoTrack) {
      videoTrack.contentHint = 'motion';
    }

    for (const [sid, peer] of this.peers.entries()) {
      let videoSender = null;
      let audioSender = null;
      if (videoTrack) {
        videoSender = peer.pc.addTrack(videoTrack, stream);
      }
      if (audioTrack) {
        audioSender = peer.pc.addTrack(audioTrack, stream);
      }
      await this._renegotiatePeer(sid, peer.pc);
      if (videoSender) {
        const vTrans = peer.pc.getTransceivers().find(t => t.sender === videoSender);
        if (vTrans?.mid) {
          this.socket?.emit('webrtc:signal', {
            targetSocketId: sid,
            channelId: this.channelId,
            signal: { type: 'mid-meta', mid: vTrans.mid, streamKind }
          });
        }
        await tuneVideoSender(videoSender);
        if (streamKind === 'screen') await this._applyScreenQualityFor(sid);
      }
      if (audioSender) {
        const aTrans = peer.pc.getTransceivers().find(t => t.sender === audioSender);
        if (aTrans?.mid) {
          this.socket?.emit('webrtc:signal', {
            targetSocketId: sid,
            channelId: this.channelId,
            signal: { type: 'mid-meta', mid: aTrans.mid, streamKind: 'screen-audio' }
          });
        }
      }
    }
  }

  async _detachVideoStreamFromPeers(stream) {
    if (!stream) return;
    const trackIds = new Set(stream.getTracks().map(t => t.id));
    for (const [sid, peer] of this.peers.entries()) {
      let removed = false;
      for (const sender of peer.pc.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) {
          try {
            peer.pc.removeTrack(sender);
            removed = true;
          } catch {}
        }
      }
      if (removed) {
        for (const tid of trackIds) {
          this.socket?.emit('webrtc:signal', {
            targetSocketId: sid,
            channelId: this.channelId,
            signal: { type: 'track-removed', trackId: tid }
          });
        }
        await this._renegotiatePeer(sid, peer.pc);
      }
    }
  }

  // conta pra pessoa qual transceiver é câmera, tela ou som da tela
  _announceMids(targetSocketId, pc) {
    const camTrack = this.cameraStream?.getVideoTracks()[0];
    const scrTrack = this.screenStream?.getVideoTracks()[0];
    const scrAudio = this.screenStream?.getAudioTracks()[0];
    for (const t of pc.getTransceivers()) {
      const track = t.sender?.track;
      if (!t.mid || !track) continue;
      const streamKind = track === camTrack ? 'camera' : track === scrTrack ? 'screen' : track === scrAudio ? 'screen-audio' : null;
      if (!streamKind) continue;
      this.socket?.emit('webrtc:signal', {
        targetSocketId,
        channelId: this.channelId,
        signal: { type: 'mid-meta', mid: t.mid, streamKind }
      });
    }
  }

  async _renegotiatePeer(targetSocketId, pc) {
    if (pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      offer.sdp = tuneVideoSdp(tuneOpusSdp(offer.sdp));
      await pc.setLocalDescription(offer);
      this.socket?.emit('webrtc:signal', {
        targetSocketId,
        channelId: this.channelId,
        signal: { type: 'offer', sdp: offer.sdp }
      });
    } catch {
      // ignore if peer closed
    }
  }

  async startCamera() {
    if (!this.channelId) return null;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, max: 60 }
      },
      audio: false
    });
    this.cameraStream = stream;
    const videoTrack = stream.getVideoTracks()[0];
    videoTrack.onended = () => this.stopCamera();

    await this._attachVideoStreamToPeers(stream, 'camera');
    this.socket?.emit('voice:state', { channelId: this.channelId, cameraOn: true });
    return stream;
  }

  async stopCamera() {
    if (!this.cameraStream) return;
    const stream = this.cameraStream;
    this.cameraStream = null;
    await this._detachVideoStreamFromPeers(stream);
    stream.getTracks().forEach(t => t.stop());
    if (this.channelId) {
      this.socket?.emit('voice:state', { channelId: this.channelId, cameraOn: false });
    }
  }

  async startScreenShare() {
    if (!this.channelId) return null;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
      },
      audio: {
        suppressLocalAudioPlayback: false,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    this.screenStream = stream;
    // Ensure mic pipeline AudioContext stays running and wasn't interrupted by getDisplayMedia
    if (this.pipeline?.context?.state === 'suspended') {
      await this.pipeline.context.resume().catch(() => {});
    }
    const micTrack = this.pipeline?.rawStream?.getAudioTracks?.()[0];
    if (micTrack && micTrack.readyState !== 'live') {
      await this.reloadPipeline().catch(() => {});
    }
    if (this.playbackCtx?.state === 'suspended') {
      await this.playbackCtx.resume().catch(() => {});
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.applyConstraints?.({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
      }).catch(() => {});
      videoTrack.onended = () => this.stopScreenShare();
    }

    await this._attachVideoStreamToPeers(stream, 'screen');
    this.socket?.emit('voice:state', { channelId: this.channelId, screenSharing: true });
    return stream;
  }

  async stopScreenShare() {
    if (!this.screenStream) return;
    const stream = this.screenStream;
    this.screenStream = null;
    await this._detachVideoStreamFromPeers(stream);
    stream.getTracks().forEach(t => t.stop());
    if (this.channelId) {
      this.socket?.emit('voice:state', { channelId: this.channelId, screenSharing: false });
    }
  }

  async _handlePeers({ channelId, peers }) {
    if (channelId !== this.channelId) return;
    for (const peer of peers) {
      if (peer.socketId === this.socket.id) continue;
      const pc = await this._createPeerConnection(peer.socketId, peer.displayName, peer.userId);
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:signal', {
        targetSocketId: peer.socketId,
        channelId: this.channelId,
        signal: { type: 'offer', sdp: offer.sdp }
      });
    }
  }

  // quem assiste pede a qualidade da tela de alguém
  requestScreenQuality(targetSocketId, qualityId) {
    if (qualityId === 'source') this.requestedScreenQuality.delete(targetSocketId);
    else this.requestedScreenQuality.set(targetSocketId, qualityId);
    this.socket?.emit('webrtc:signal', {
      targetSocketId,
      channelId: this.channelId,
      signal: { type: 'screen-quality', quality: qualityId }
    });
  }

  // quem transmite: ajusta o envio da tela só pra essa pessoa
  async _applyScreenQualityFor(socketId) {
    const peer = this.peers.get(socketId);
    const track = this.screenStream?.getVideoTracks()[0];
    if (!peer || !track) return;
    const sender = peer.pc.getSenders().find(sd => sd.track === track);
    await applyScreenQuality(sender, this.screenQualityForPeer.get(socketId) || 'source');
  }

  async _handleSignal({ fromSocketId, channelId, user, signal }) {
    if (channelId !== this.channelId) return;
    if (signal.type === 'screen-quality') {
      if (signal.quality === 'source') this.screenQualityForPeer.delete(fromSocketId);
      else this.screenQualityForPeer.set(fromSocketId, String(signal.quality));
      await this._applyScreenQualityFor(fromSocketId);
      return;
    }
    if ((signal.type === 'track-meta' || signal.type === 'mid-meta') && signal.streamKind === 'screen' && this.requestedScreenQuality.has(fromSocketId)) {
      const wanted = this.requestedScreenQuality.get(fromSocketId);
      setTimeout(() => this.requestScreenQuality(fromSocketId, wanted), 1500);
    }
    if (signal.type === 'track-meta') {
      this.trackMetaMap.set(signal.trackId, signal.streamKind);
      const existing = this.remoteVideos.get(`${fromSocketId}:${signal.trackId}`);
      if (existing) {
        existing.kind = signal.streamKind;
        this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
      }
      return;
    }
    if (signal.type === 'mid-meta') {
      this.trackMetaMap.set(`mid:${fromSocketId}:${signal.mid}`, signal.streamKind);
      for (const v of this.remoteVideos.values()) {
        if (v.socketId === fromSocketId && v.mid === signal.mid) {
          v.kind = signal.streamKind;
          this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
        }
      }
      return;
    }
    if (signal.type === 'track-removed') {
      this.remoteVideos.delete(`${fromSocketId}:${signal.trackId}`);
      this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
      return;
    }

    let peerObj = this.peers.get(fromSocketId);
    if (!peerObj) {
      await this._createPeerConnection(fromSocketId, user?.display_name || 'Usuário', user?.id || fromSocketId);
      peerObj = this.peers.get(fromSocketId);
    }
    const { pc, pendingCandidates } = peerObj;

    if (signal.type === 'offer') {
      // Glare handling: polite peer rolls back if both sent offers simultaneously
      const polite = this.socket.id < fromSocketId;
      if (pc.signalingState !== 'stable') {
        if (!polite) return;
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
      while (pendingCandidates.length > 0) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()));
        } catch {}
      }
      const answer = await pc.createAnswer();
      answer.sdp = tuneVideoSdp(tuneOpusSdp(answer.sdp));
      await pc.setLocalDescription(answer);
      this.socket.emit('webrtc:signal', {
        targetSocketId: fromSocketId,
        channelId: this.channelId,
        signal: { type: 'answer', sdp: answer.sdp }
      });
      // quem entra depois manda a oferta só com áudio: minha câmera/tela já ligadas ficam de fora
      // dessa resposta. Aí eu renegocio pra pessoa nova receber o que eu já estava transmitindo.
      const pendingVideo = pc.getTransceivers().some(t => !t.mid && t.sender?.track);
      if (pendingVideo) {
        setTimeout(async () => {
          await this._renegotiatePeer(fromSocketId, pc);
          setTimeout(() => this._announceMids(fromSocketId, pc), 800);
        }, 300);
      }
    } else if (signal.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        while (pendingCandidates.length > 0) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()));
          } catch {}
        }
      }
    } else if (signal.candidate) {
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {}
      } else {
        pendingCandidates.push(signal.candidate);
      }
    }
  }

  _handleParticipants({ channelId, participants }) {
    if (channelId !== this.channelId) return;
    const activeIds = new Set(participants.map(p => p.socketId));
    for (const sid of Array.from(this.peers.keys())) {
      if (!activeIds.has(sid)) {
        this._closePeer(sid);
      }
    }
  }

  async _createPeerConnection(targetSocketId, displayName, userId = targetSocketId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    let micSender = null;

    if (this.pipeline?.stream) {
      this.pipeline.stream.getAudioTracks().forEach(track => {
        micSender = pc.addTrack(track, this.pipeline.stream);
      });
    }
    if (this.cameraStream) {
      const track = this.cameraStream.getVideoTracks()[0];
      if (track) {
        this.socket?.emit('webrtc:signal', {
          targetSocketId,
          channelId: this.channelId,
          signal: { type: 'track-meta', trackId: track.id, streamKind: 'camera' }
        });
        const sender = pc.addTrack(track, this.cameraStream);
        await tuneVideoSender(sender);
      }
    }
    if (this.screenStream) {
      const track = this.screenStream.getVideoTracks()[0];
      const audioTrack = this.screenStream.getAudioTracks()[0];
      if (track) {
        this.socket?.emit('webrtc:signal', {
          targetSocketId,
          channelId: this.channelId,
          signal: { type: 'track-meta', trackId: track.id, streamKind: 'screen' }
        });
        const sender = pc.addTrack(track, this.screenStream);
        await tuneVideoSender(sender);
        await this._applyScreenQualityFor(targetSocketId);
      }
      if (audioTrack) {
        pc.addTrack(audioTrack, this.screenStream);
      }
    }

    pc.onicecandidate = event => {
      if (event.candidate) {
        this.socket.emit('webrtc:signal', {
          targetSocketId,
          channelId: this.channelId,
          signal: { candidate: event.candidate }
        });
      }
    };

    const audioPool = (() => {
      let el = document.getElementById('ronncord-audio-pool');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ronncord-audio-pool';
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      return el;
    })();

    const audioEls = new Map();
    const screenAudioEls = new Map();
    const gainNodes = new Map();
    let micStreamId = null;

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce?.(); } catch {}
      } else if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            try { pc.restartIce?.(); } catch {}
          }
        }, 4000);
      }
    };

    pc.ontrack = event => {
      // Zero-delay jitter buffer hint for real-time audio & video
      if (event.receiver) {
        try {
          if ('playoutDelayHint' in event.receiver) event.receiver.playoutDelayHint = 0;
          if ('jitterBufferTarget' in event.receiver) event.receiver.jitterBufferTarget = 0;
        } catch {}
      }

      if (event.track.kind === 'audio') {
        const trackStream = new MediaStream([event.track]);
        const midKey = event.transceiver?.mid ? `mid:${targetSocketId}:${event.transceiver.mid}` : null;
        const incomingStreamId = event.streams?.[0]?.id || null;
        if (!micStreamId && !(event.streams?.[0]?.getVideoTracks?.().length > 0)) {
          micStreamId = incomingStreamId;
        }
        const isScreenAudio =
          (midKey && this.trackMetaMap.get(midKey) === 'screen-audio') ||
          (event.streams?.[0]?.getVideoTracks?.().length > 0) ||
          (micStreamId && incomingStreamId && incomingStreamId !== micStreamId) ||
          audioEls.size > 0;

        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.srcObject = trackStream;
        audioPool.appendChild(audioEl);

        if (isScreenAudio) {
          audioEl.muted = this.deafened || this.screenAudioMuted.has(targetSocketId);
          audioEl.volume = 1.0;
          screenAudioEls.set(event.track.id, audioEl);
          audioEl.play().catch(() => {});
          event.track.onended = () => {
            audioEl.srcObject = null;
            audioEl.remove();
            screenAudioEls.delete(event.track.id);
          };
          return;
        }

        const savedVol = getSavedUserVolumes()[userId] ?? 100;
        const useBoost = savedVol > 100;
        audioEl.muted = this.deafened || useBoost || savedVol === 0;
        audioEl.volume = useBoost ? 1.0 : Math.min(1, savedVol / 100);
        audioEls.set(event.track.id, audioEl);

        if (!this.playbackCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          this.playbackCtx = new Ctx({ latencyHint: 'interactive' });
        }
        if (this.playbackCtx.state === 'suspended') {
          this.playbackCtx.resume().catch(() => {});
        }

        const srcNode = this.playbackCtx.createMediaStreamSource(trackStream);
        const gainNode = this.playbackCtx.createGain();
        gainNode.gain.value = (this.deafened || !useBoost) ? 0 : (savedVol / 100);
        srcNode.connect(gainNode);
        gainNode.connect(this.playbackCtx.destination);
        gainNodes.set(event.track.id, gainNode);

        audioEl.play().catch(() => {
          const unlock = () => {
            this.playbackCtx?.resume().catch(() => {});
            audioEl.play().catch(() => {});
            window.removeEventListener('pointerdown', unlock);
          };
          window.addEventListener('pointerdown', unlock, { once: true });
        });

        event.track.onended = () => {
          try { srcNode.disconnect(); gainNode.disconnect(); } catch {}
          gainNodes.delete(event.track.id);
          audioEl.srcObject = null;
          audioEl.remove();
          audioEls.delete(event.track.id);
        };
      } else if (event.track.kind === 'video') {
        const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
        const key = `${targetSocketId}:${event.track.id}`;
        const midKey = event.transceiver?.mid ? `mid:${targetSocketId}:${event.transceiver.mid}` : null;
        const kind = (midKey && this.trackMetaMap.get(midKey)) || this.trackMetaMap.get(event.track.id) || 'screen';
        this.remoteVideos.set(key, {
          id: key,
          socketId: targetSocketId,
          trackId: event.track.id,
          mid: event.transceiver?.mid || null,
          kind,
          displayName,
          stream: remoteStream
        });
        this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
        event.track.onended = () => {
          this.remoteVideos.delete(key);
          this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
        };
      }
    };

    this.peers.set(targetSocketId, { pc, micSender, audioEls, screenAudioEls, gainNodes, userId, displayName, pendingCandidates: [] });
    return pc;
  }

  _closePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    if (peer.audioEls) {
      for (const audioEl of peer.audioEls.values()) {
        audioEl.srcObject = null;
        audioEl.remove();
      }
      peer.audioEls.clear();
    }
    if (peer.screenAudioEls) {
      for (const sEl of peer.screenAudioEls.values()) {
        sEl.srcObject = null;
        sEl.remove();
      }
      peer.screenAudioEls.clear();
    }
    this.peers.delete(socketId);
    this.screenQualityForPeer.delete(socketId);
    this.requestedScreenQuality.delete(socketId);
    let changed = false;
    for (const [key, val] of this.remoteVideos.entries()) {
      if (val.socketId === socketId) {
        this.remoteVideos.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
    }
  }

  async _measurePing() {
    const first = this.peers.values().next().value;
    if (!first) {
      this.callbacks.onPing?.(null);
      return;
    }
    try {
      const stats = await first.pc.getStats();
      for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
          this.callbacks.onPing?.(Math.round(report.currentRoundTripTime * 1000));
          return;
        }
      }
    } catch {
      // ignore
    }
  }

  destroy() {
    this.leave();
    if (this.socket) {
      this.socket.off('voice:peers', this._onPeers);
      this.socket.off('webrtc:signal', this._onSignal);
      this.socket.off('voice:participants', this._onParticipants);
    }
  }
}
