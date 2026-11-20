import React, { useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { SOUNDBOARD, getCustomSounds, saveCustomSounds } from '../lib/soundboard.js';
import { resolveAssetUrl } from '../lib/api.js';

// Painel do soundboard (abre em cima da barra da call, igual o Discord).
// Clicar toca pra todo mundo da call. "Adicionar som" sobe um áudio curto (fica salvo no seu navegador).
const EMOJIS = ['🎵', '😂', '🔥', '💀', '🤡', '🎉', '😎', '🐐'];

export function Soundboard({ onPlay, onUpload, onClose }) {
  const [custom, setCustom] = useState(getCustomSounds);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [cooldown, setCooldown] = useState(false);

  function play(payload) {
    if (cooldown) return;
    onPlay(payload);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1200); // sem spam
  }

  async function addSound(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) return alert('Som muito grande: até 1 MB (uns 5 segundos).');
    setUploading(true);
    try {
      const up = await onUpload(file);
      const name = (prompt('Nome do som:', file.name.replace(/\.[^.]+$/, '').slice(0, 20)) || 'Meu som').slice(0, 20);
      const next = [...custom, { id: `c${Date.now()}`, name, emoji: EMOJIS[custom.length % EMOJIS.length], url: up.url }];
      setCustom(next);
      saveCustomSounds(next);
    } catch (err) {
      alert('Não deu pra subir o som: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="soundboard-panel" onClick={e => e.stopPropagation()}>
      <div className="soundboard-head">
        <strong>Soundboard</strong>
        <button type="button" className="icon-btn xs" onClick={onClose}><X size={15} /></button>
      </div>
      <small className="soundboard-hint">Toca pra todo mundo da call</small>
      <div className="soundboard-grid">
        {SOUNDBOARD.map(s => (
          <button key={s.id} type="button" disabled={cooldown} onClick={() => play({ sound: s.id, emoji: s.emoji, name: s.name })}>
            <span>{s.emoji}</span>{s.name}
          </button>
        ))}
        {custom.map(s => (
          <div key={s.id} className="soundboard-custom">
            <button type="button" disabled={cooldown} onClick={() => play({ url: resolveAssetUrl(s.url), emoji: s.emoji, name: s.name })}>
              <span>{s.emoji}</span>{s.name}
            </button>
            <button type="button" className="soundboard-del" title="Tirar som" onClick={() => { const n = custom.filter(x => x.id !== s.id); setCustom(n); saveCustomSounds(n); }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="soundboard-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Plus size={16} /> {uploading ? 'Enviando...' : 'Adicionar som'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => { addSound(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
