import React, { useRef, useState } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api.js';

// reduz a imagem pra 256x256 (corte no centro) antes de subir, pra não pesar no banco
function shrinkImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        blob => (blob ? resolve(new File([blob], 'icone-servidor.webp', { type: 'image/webp' })) : reject(new Error('Não deu pra ler a imagem'))),
        'image/webp',
        0.9
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esse arquivo não é uma imagem')); };
    img.src = url;
  });
}

// Configurações do servidor: nome e imagem (dono e admins mudam; o resto só vê)
export function ServerSettingsModal({ server, canEdit, onClose, onSave, onUpload }) {
  const [name, setName] = useState(server.name || '');
  const [iconUrl, setIconUrl] = useState(server.icon_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const small = await shrinkImage(file);
      const uploaded = await onUpload(small);
      setIconUrl(uploaded.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setBusy(true);
    try {
      await onSave({ name: name.trim(), icon_url: iconUrl || null });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurações do servidor</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="auth-form">
          <div className="server-icon-editor">
            <div className="server-icon-preview" style={iconUrl ? undefined : { background: server.icon_color }}>
              {iconUrl ? <img src={resolveAssetUrl(iconUrl)} alt="" /> : (name || '?').slice(0, 2).toUpperCase()}
            </div>
            {canEdit ? (
              <div className="server-icon-actions">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
                <button type="button" className="btn-primary xs" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> {iconUrl ? 'Trocar imagem' : 'Escolher imagem'}
                </button>
                {iconUrl && (
                  <button type="button" className="btn-ghost xs" disabled={busy} onClick={() => setIconUrl('')}>
                    <Trash2 size={13} /> Tirar imagem
                  </button>
                )}
                <small>Quadrada fica melhor. A gente corta no centro.</small>
              </div>
            ) : (
              <small className="server-icon-note">Só o dono e os admins mudam o nome e a imagem.</small>
            )}
          </div>

          <label>
            <span>NOME DO SERVIDOR</span>
            <input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} maxLength={60} required />
          </label>

          {error && <div className="auth-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>{canEdit ? 'Cancelar' : 'Fechar'}</button>
            {canEdit && (
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
