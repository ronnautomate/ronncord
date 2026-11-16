import React, { useState } from 'react';
import { X, Copy, Check, Hash, Volume2 } from 'lucide-react';

export function CreateOrJoinServerModal({ onClose, onCreateServer, onJoinServer }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'create') {
        await onCreateServer(name);
      } else {
        await onJoinServer(inviteCode);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tab === 'create' ? 'Criar um Servidor' : 'Entrar em um Servidor'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="auth-tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={tab === 'create' ? 'active' : ''} onClick={() => { setTab('create'); setError(''); }}>
            Criar Novo
          </button>
          <button type="button" className={tab === 'join' ? 'active' : ''} onClick={() => { setTab('join'); setError(''); }}>
            Usar Convite
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === 'create' ? (
            <label>
              <span>NOME DO SERVIDOR</span>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex: Clã dos Amigos"
                autoFocus
              />
            </label>
          ) : (
            <label>
              <span>CÓDIGO DE CONVITE</span>
              <input
                required
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="ex: ronncord-hub"
                autoFocus
              />
            </label>
          )}
          {error && <div className="auth-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Processando...' : tab === 'create' ? 'Criar Servidor' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CreateChannelModal({ defaultType = 'text', onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onCreate({ name, type, topic });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Criar Canal</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="channel-type-grid">
            <button
              type="button"
              className={`channel-type-option ${type === 'text' ? 'selected' : ''}`}
              onClick={() => setType('text')}
            >
              <Hash size={20} />
              <div>
                <strong>Texto</strong>
                <small>Envie mensagens, imagens e arquivos</small>
              </div>
            </button>
            <button
              type="button"
              className={`channel-type-option ${type === 'voice' ? 'selected' : ''}`}
              onClick={() => setType('voice')}
            >
              <Volume2 size={20} />
              <div>
                <strong>Voz</strong>
                <small>Converse por áudio e vídeo</small>
              </div>
            </button>
          </div>

          <label>
            <span>NOME DO CANAL</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'text' ? 'novo-canal' : 'Sala VIP'}
              autoFocus
            />
          </label>

          {type === 'text' && (
            <label>
              <span>TÓPICO (OPCIONAL)</span>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Sobre o que é este canal?"
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function InviteModal({ server, onClose }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard?.writeText(server.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Convidar amigos para {server.name}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="modal-subtitle">
          Compartilhe este código de convite permanente com quem você quiser trazer para o servidor:
        </p>
        <div className="invite-box">
          <code>{server.invite_code}</code>
          <button type="button" className="btn-primary" onClick={copyCode}>
            {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C', '#9B59B6', '#E67E22'];

export function ProfileModal({ user, onClose, onSave, onLogout }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [customStatus, setCustomStatus] = useState(user.custom_status || '');
  const [bio, setBio] = useState(user.bio || '');
  const [status, setStatus] = useState(user.status || 'online');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#5865F2');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        display_name: displayName,
        custom_status: customStatus,
        bio,
        status,
        avatar_color: avatarColor
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurações de Perfil</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="auth-form">
          <div className="profile-preview">
            <div className="avatar lg" style={{ background: avatarColor }}>
              {(displayName || user.username || 'R')[0].toUpperCase()}
              <span className={`status-dot ${status}`} />
            </div>
            <div>
              <strong>{displayName || user.username}</strong>
              <small>@{user.username}</small>
            </div>
          </div>

          <label>
            <span>COR DO AVATAR</span>
            <div className="color-picker">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${avatarColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setAvatarColor(c)}
                />
              ))}
            </div>
          </label>

          <label>
            <span>NOME DE EXIBIÇÃO</span>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} required />
          </label>

          <label>
            <span>STATUS</span>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="online">🟢 Online</option>
              <option value="idle">🟡 Ausente</option>
              <option value="dnd">🔴 Não Perturbe</option>
              <option value="offline">⚫ Invisível</option>
            </select>
          </label>

          <label>
            <span>STATUS PERSONALIZADO</span>
            <input
              value={customStatus}
              onChange={e => setCustomStatus(e.target.value)}
              placeholder="ex: Programando o Ronncord..."
            />
          </label>

          <label>
            <span>SOBRE MIM (BIO)</span>
            <textarea
              rows={3}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Conte um pouco sobre você..."
            />
          </label>

          <div className="modal-actions between">
            <button type="button" className="btn-danger" onClick={onLogout}>Sair da Conta</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
