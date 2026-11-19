import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

// Player de áudio no estilo do discordia (troca o player branco do navegador):
// botão redondo, barra que dá pra clicar pra pular e o tempo do lado.
const mmss = s => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

let playing = null; // só um áudio tocando por vez

export function VoicePlayer({ src, name }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isVoice = /audio-\d+\.webm$/i.test(name || '') || /voice/i.test(name || '');

  useEffect(() => {
    const au = audioRef.current;
    if (!au) return;
    // gravação do navegador (webm) às vezes vem sem duração: pula pro fim pra ele calcular
    const onMeta = () => {
      if (au.duration === Infinity || Number.isNaN(au.duration)) {
        const fix = () => {
          au.removeEventListener('timeupdate', fix);
          setDuration(au.duration);
          au.currentTime = 0;
        };
        au.addEventListener('timeupdate', fix);
        au.currentTime = 1e101;
      } else {
        setDuration(au.duration);
      }
    };
    const onTime = () => setTime(au.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setTime(0); au.currentTime = 0; };
    au.addEventListener('loadedmetadata', onMeta);
    au.addEventListener('timeupdate', onTime);
    au.addEventListener('play', onPlay);
    au.addEventListener('pause', onPause);
    au.addEventListener('ended', onEnded);
    return () => {
      au.removeEventListener('loadedmetadata', onMeta);
      au.removeEventListener('timeupdate', onTime);
      au.removeEventListener('play', onPlay);
      au.removeEventListener('pause', onPause);
      au.removeEventListener('ended', onEnded);
      if (playing === au) playing = null;
    };
  }, [src]);

  function toggle(e) {
    e.stopPropagation();
    const au = audioRef.current;
    if (!au) return;
    if (!au.paused) return au.pause();
    if (playing && playing !== au) playing.pause();
    playing = au;
    au.play().catch(err => alert('Não deu pra tocar: ' + err.message));
  }

  function seek(e) {
    e.stopPropagation();
    const au = audioRef.current;
    if (!au || !duration || !isFinite(duration)) return toggle(e);
    const r = e.currentTarget.getBoundingClientRect();
    au.currentTime = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)) * duration;
    setTime(au.currentTime);
    if (au.paused) toggle(e);
  }

  const pct = duration && isFinite(duration) ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="voice-player" onClick={e => e.stopPropagation()}>
      <button type="button" className="voice-player-btn" title={isPlaying ? 'Pausar' : 'Tocar'} onClick={toggle}>
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="voice-player-bar" onClick={seek}><i style={{ width: `${pct}%` }} /></div>
      <span className="voice-player-time">{mmss(isPlaying || time > 0 ? time : duration)}</span>
      {isVoice ? (
        <span className="voice-player-icon" title="Mensagem de voz"><Mic size={15} /></span>
      ) : (
        <span className="voice-player-name" title={name}>{name}</span>
      )}
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
