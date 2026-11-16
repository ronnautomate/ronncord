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

  async join(channelId, voiceSettings = {}) {
    if (this.channelId === channelId) return;
    await this.leave();

    this.channelId = channelId;
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

    this.socket?.emit('voice:join', channelId);
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
    this.stopCamera();
    this.stopScreenShare();
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
    if (peer?.screenGainNodes) {
      for (const gain of peer.screenGainNodes.values()) {
        gain.gain.value = (this.deafened || isMuted) ? 0 : 1;
      }
    }
  }

  setDeafened(deafened) {
    this.deafened = deafened;
    const vols = getSavedUserVolumes();
    for (const peer of this.peers.values()) {
      const targetGain = deafened ? 0 : ((vols[peer.userId] ?? 100) / 100);
      if (peer.gainNodes) {
        for (const gain of peer.gainNodes.values()) {
          gain.gain.value = targetGain;
        }
      }
      for (const audioEl of peer.audioEls.values()) {
        audioEl.muted = true; // audio plays via GainNode for 0-200% boost
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
    for (const peer of this.peers.values()) {
      if (peer.userId === userId && peer.gainNodes) {
        for (const gain of peer.gainNodes.values()) {
          gain.gain.value = clamped / 100;
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
      if (videoTrack) {
        this.socket?.emit('webrtc:signal', {
          targetSocketId: sid,
          channelId: this.channelId,
          signal: { type: 'track-meta', trackId: videoTrack.id, streamKind }
        });
        videoSender = peer.pc.addTrack(videoTrack, stream);
      }
      if (audioTrack) {
        this.socket?.emit('webrtc:signal', {
          targetSocketId: sid,
          channelId: this.channelId,
          signal: { type: 'track-meta', trackId: audioTrack.id, streamKind: 'screen-audio' }
        });
        peer.pc.addTrack(audioTrack, stream);
      }
      await this._renegotiatePeer(sid, peer.pc);
      if (videoSender) {
        await tuneVideoSender(videoSender);
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

  async _handleSignal({ fromSocketId, channelId, user, signal }) {
    if (channelId !== this.channelId) return;
    if (signal.type === 'track-meta') {
      this.trackMetaMap.set(signal.trackId, signal.streamKind);
      const existing = this.remoteVideos.get(`${fromSocketId}:${signal.trackId}`);
      if (existing) {
        existing.kind = signal.streamKind;
        this.callbacks.onRemoteVideos?.(Array.from(this.remoteVideos.values()));
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
    const gainNodes = new Map();
    const screenGainNodes = new Map();
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
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        // Keep element muted so WebAudio GainNode handles 0-200% boost without echo
        audioEl.muted = true;
        audioEl.srcObject = trackStream;
        audioPool.appendChild(audioEl);
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
        const incomingStreamId = event.streams?.[0]?.id || null;
        if (!micStreamId && !(event.streams?.[0]?.getVideoTracks?.().length > 0)) {
          micStreamId = incomingStreamId;
        }
        const isScreenAudio =
          (event.streams?.[0]?.getVideoTracks?.().length > 0) ||
          (micStreamId && incomingStreamId && incomingStreamId !== micStreamId) ||
          gainNodes.size > 0;
        if (isScreenAudio) {
          gainNode.gain.value = (this.deafened || this.screenAudioMuted.has(targetSocketId)) ? 0 : 1;
          screenGainNodes.set(event.track.id, gainNode);
        } else {
          const savedVol = getSavedUserVolumes()[userId] ?? 100;
          gainNode.gain.value = this.deafened ? 0 : (savedVol / 100);
          gainNodes.set(event.track.id, gainNode);
        }
        srcNode.connect(gainNode);
        gainNode.connect(this.playbackCtx.destination);

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
        const kind = this.trackMetaMap.get(event.track.id) || 'screen';
        this.remoteVideos.set(key, {
          id: key,
          socketId: targetSocketId,
          trackId: event.track.id,
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

    this.peers.set(targetSocketId, { pc, micSender, audioEls, gainNodes, screenGainNodes, userId, displayName, pendingCandidates: [] });
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
    this.peers.delete(socketId);
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
