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
      const extras = ['minptime=10', 'ptime=10', 'useinbandfec=1', 'usedtx=0', 'maxaveragebitrate=96000', 'stereo=0'];
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
      tuned.splice(idx + 1, 0, `${fmtpPrefix}minptime=10;ptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=96000`);
    }
  }

  return tuned.join('\r\n');
}

export class VoiceManager {
  constructor(socket, callbacks = {}) {
    this.socket = socket;
    this.callbacks = callbacks; // { onPing, onSpeakingChange, onRemoteStreams, onError }
    this.channelId = null;
    this.pipeline = null;
    this.screenStream = null;
    this.peers = new Map(); // socketId -> { pc, audioEl, stream, videoTrack }
    this.remoteScreens = new Map(); // socketId -> { user, stream }
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
    for (const { pc } of this.peers.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
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
    this.stopScreenShare();
    for (const socketId of Array.from(this.peers.keys())) {
      this._closePeer(socketId);
    }
    this.pipeline?.destroy();
    this.pipeline = null;
    this.channelId = null;
    this.lastSpeaking = false;
    this.callbacks.onPing?.(null);
    this.callbacks.onRemoteStreams?.([]);
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

  setDeafened(deafened) {
    this.deafened = deafened;
    for (const { audioEl } of this.peers.values()) {
      if (audioEl) audioEl.muted = deafened;
    }
    if (this.channelId) {
      this.socket?.emit('voice:state', { channelId: this.channelId, deafened });
    }
  }

  async startScreenShare() {
    if (!this.channelId) return null;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    this.screenStream = stream;
    const videoTrack = stream.getVideoTracks()[0];
    videoTrack.onended = () => this.stopScreenShare();

    for (const { pc } of this.peers.values()) {
      pc.addTrack(videoTrack, stream);
      const offer = await pc.createOffer();
      offer.sdp = tuneOpusSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      // Renegotiate
      for (const [sid, p] of this.peers.entries()) {
        if (p.pc === pc) {
          this.socket?.emit('webrtc:signal', {
            targetSocketId: sid,
            channelId: this.channelId,
            signal: { type: 'offer', sdp: offer.sdp }
          });
        }
      }
    }

    this.socket?.emit('voice:state', { channelId: this.channelId, screenSharing: true });
    return stream;
  }

  stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach(t => t.stop());
    for (const { pc } of this.peers.values()) {
      pc.getSenders().forEach(sender => {
        if (sender.track?.kind === 'video') {
          try { pc.removeTrack(sender); } catch {}
        }
      });
    }
    this.screenStream = null;
    if (this.channelId) {
      this.socket?.emit('voice:state', { channelId: this.channelId, screenSharing: false });
    }
  }

  async _handlePeers({ channelId, peers }) {
    if (channelId !== this.channelId) return;
    for (const peer of peers) {
      if (peer.socketId === this.socket.id) continue;
      const pc = this._createPeerConnection(peer.socketId, peer.displayName);
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
    let peerObj = this.peers.get(fromSocketId);
    if (!peerObj) {
      this._createPeerConnection(fromSocketId, user?.display_name || 'Usuário');
      peerObj = this.peers.get(fromSocketId);
    }
    const { pc } = peerObj;

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
      const answer = await pc.createAnswer();
      answer.sdp = tuneOpusSdp(answer.sdp);
      await pc.setLocalDescription(answer);
      this.socket.emit('webrtc:signal', {
        targetSocketId: fromSocketId,
        channelId: this.channelId,
        signal: { type: 'answer', sdp: answer.sdp }
      });
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        // ignore stale ICE
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

  _createPeerConnection(targetSocketId, displayName) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (this.pipeline?.stream) {
      this.pipeline.stream.getAudioTracks().forEach(track => {
        pc.addTrack(track, this.pipeline.stream);
      });
    }
    if (this.screenStream) {
      this.screenStream.getVideoTracks().forEach(track => {
        pc.addTrack(track, this.screenStream);
      });
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

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.muted = this.deafened;

    pc.ontrack = event => {
      const [remoteStream] = event.streams;
      if (event.track.kind === 'audio') {
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(() => {});
      } else if (event.track.kind === 'video') {
        this.remoteScreens.set(targetSocketId, { socketId: targetSocketId, displayName, stream: remoteStream });
        this.callbacks.onRemoteStreams?.(Array.from(this.remoteScreens.values()));
        event.track.onended = () => {
          this.remoteScreens.delete(targetSocketId);
          this.callbacks.onRemoteStreams?.(Array.from(this.remoteScreens.values()));
        };
      }
    };

    this.peers.set(targetSocketId, { pc, audioEl, displayName });
    return pc;
  }

  _closePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    if (peer.audioEl) {
      peer.audioEl.srcObject = null;
    }
    this.peers.delete(socketId);
    if (this.remoteScreens.has(socketId)) {
      this.remoteScreens.delete(socketId);
      this.callbacks.onRemoteStreams?.(Array.from(this.remoteScreens.values()));
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
