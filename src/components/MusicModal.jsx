import React, { useState } from 'react';
import { X, Music, Play, Pause, SkipForward, Square, Volume2 } from 'lucide-react';

const STATIONS = [
  { key: 'lofi', label: '🎧 Lo-Fi Beats 24/7' },
  { key: 'synthwave', label: '⚡ Synthwave / Electro' },
  { key: 'chill', label: '🌙 Chillout Mix' },
  { key: 'rock', label: '🎸 Rock & Metal' },
  { key: 'hiphop', label: '🔥 Hip Hop & Trap' }
];

export function MusicModal({
  onClose,
  musicState,
  musicVolume,
  onChangeVolume,
  onPlayQuery,
  onToggle,
  onSkip,
  onStop
}) {
  const [query, setQuery] = useState('');
  const current = musicState?.queue?.[musicState.currentIndex || 0];

  function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    onPlayQuery(query.trim());
    setQuery('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Music size={18} style={{ color: '#5865F2' }} />
            <h2>RonnBot Música (Sincronizado na Call)</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" style={{ marginBottom: 14 }}>
          <label>
            <span>TOCAR LINK DE ÁUDIO (MP3/OGG/RÁDIO) OU ESTILO</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ex: lofi, synthwave ou https://.../musica.mp3"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary">Tocar</button>
            </div>
          </label>
        </form>

        <div style={{ marginBottom: 14 }}>
          <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>ESTAÇÕES INSTANTÂNEAS</span>
          <div className="deco-picker">
            {STATIONS.map(st => (
              <button
                key={st.key}
                type="button"
                className="deco-chip"
                onClick={() => onPlayQuery(st.key)}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {current ? (
          <div className="music-now-playing">
            <div>
              <strong>{current.title}</strong>
              <small>Pedido por {current.requestedBy} • {musicState.playing ? 'Tocando' : 'Pausado'}</small>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="icon-btn circle" onClick={onToggle} title="Play/Pause">
                {musicState.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button type="button" className="icon-btn circle" onClick={onSkip} title="Pular">
                <SkipForward size={16} />
              </button>
              <button type="button" className="icon-btn circle danger" onClick={onStop} title="Parar Bot">
                <Square size={15} />
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Nenhuma música tocando. Você também pode digitar <code>!play lofi</code> no chat!
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Volume2 size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="range"
            min={0}
            max={100}
            value={musicVolume}
            onChange={e => onChangeVolume(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <small style={{ width: 36, textAlign: 'right' }}>{musicVolume}%</small>
        </div>
      </div>
    </div>
  );
}
