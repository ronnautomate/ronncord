import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, Hash, Volume2, Upload, Sparkles, MessageSquare, Search } from 'lucide-react';
import { apiFetch, resolveAssetUrl } from '../lib/api.js';

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

const BANNERS = [
  '#5865F2',
  '#EB459E',
  '#23A559',
  '#E67E22',
  '#111827',
  'linear-gradient(135deg, #5865F2 0%, #EB459E 100%)',
  'linear-gradient(135deg, #23A559 0%, #0EA5E9 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)'
];

const DECORATIONS = [
  { id: 'none', label: 'Sem moldura' },
  { id: 'nitro-glow', label: 'Brilho Roxo' },
  { id: 'cyber-ring', label: 'Neon Ciano' },
  { id: 'fire-aura', label: 'Aura de Fogo' },
  { id: 'gold-crown', label: 'Ouro Real' },
  { id: 'emerald-pulse', label: 'Esmeralda' }
];

export function ProfileModal({ user, onClose, onSave, onUploadAvatar, onLogout }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [pronouns, setPronouns] = useState(user.pronouns || '');
  const [customStatus, setCustomStatus] = useState(user.custom_status || '');
  const [bio, setBio] = useState(user.bio || '');
  const [status, setStatus] = useState(user.status || 'online');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#5865F2');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [bannerColor, setBannerColor] = useState(user.banner_color || '#5865F2');
  const [avatarDecoration, setAvatarDecoration] = useState(user.avatar_decoration || 'none');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    setUploading(true);
    try {
      const uploaded = await onUploadAvatar(file);
      setAvatarUrl(uploaded.url);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        display_name: displayName,
        pronouns,
        custom_status: customStatus,
        bio,
        status,
        avatar_color: avatarColor,
        avatar_url: avatarUrl || null,
        banner_color: bannerColor,
        avatar_decoration: avatarDecoration
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Personalizar Perfil</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="auth-form">
          {/* Live Discord-style Profile Card Preview */}
          <div className="profile-card-preview">
            <div className="profile-banner" style={{ background: bannerColor }} />
            <div className="profile-card-body">
              <div className="profile-avatar-row">
                <div className={`avatar xl deco-${avatarDecoration}`} style={{ background: avatarColor }}>
                  {avatarUrl ? (
                    <img src={resolveAssetUrl(avatarUrl)} alt={displayName} className="avatar-img" />
                  ) : (
                    (displayName || user.username || 'R')[0].toUpperCase()
                  )}
                  <span className={`status-dot ${status}`} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                  <button
                    type="button"
                    className="btn-primary xs"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={13} /> {uploading ? 'Enviando...' : 'Foto / GIF'}
                  </button>
                  {avatarUrl && (
                    <button type="button" className="btn-ghost xs" onClick={() => setAvatarUrl('')}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <div className="profile-preview-names">
                <strong>{displayName || user.username}</strong>
                <span>@{user.username} {pronouns ? `• ${pronouns}` : ''}</span>
                {customStatus && <small className="profile-custom-status">{customStatus}</small>}
              </div>
            </div>
          </div>

          <div className="profile-grid-2">
            <label>
              <span>NOME DE EXIBIÇÃO</span>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} required />
            </label>
            <label>
              <span>PRONOMES (OPCIONAL)</span>
              <input value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="ex: ele/dele" />
            </label>
          </div>

          <div className="profile-grid-2">
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
                placeholder="ex: Jogando Valorant..."
              />
            </label>
          </div>

          <label>
            <span><Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} />MOLDURA DO AVATAR</span>
            <div className="deco-picker">
              {DECORATIONS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className={`deco-chip ${avatarDecoration === d.id ? 'active' : ''}`}
                  onClick={() => setAvatarDecoration(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>BANNER DO PERFIL</span>
            <div className="color-picker">
              {BANNERS.map(b => (
                <button
                  key={b}
                  type="button"
                  className={`color-swatch ${bannerColor === b ? 'active' : ''}`}
                  style={{ background: b }}
                  onClick={() => setBannerColor(b)}
                />
              ))}
            </div>
          </label>

          <label>
            <span>COR DO AVATAR (SEM FOTO)</span>
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
            <span>SOBRE MIM (BIO)</span>
            <textarea
              rows={2}
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
                {saving ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserProfileModal({ member, currentUserId, onClose, onSendDM }) {
  if (!member) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div className="profile-banner" style={{ background: member.banner_color || '#5865F2', height: 96 }} />
        <div className="profile-card-body" style={{ padding: '0 20px 20px' }}>
          <div className="profile-avatar-row">
            <div
              className={`avatar xl deco-${member.avatar_decoration || 'none'}`}
              style={{ background: member.avatar_color || '#5865F2' }}
            >
              {member.avatar_url ? (
                <img src={resolveAssetUrl(member.avatar_url)} alt={member.display_name} className="avatar-img" />
              ) : (
                (member.display_name || member.username || 'U')[0].toUpperCase()
              )}
              <span className={`status-dot ${member.status || 'offline'}`} />
            </div>
            {member.id !== currentUserId && (
              <button
                type="button"
                className="btn-primary xs"
                onClick={() => { onSendDM(member.id); onClose(); }}
              >
                <MessageSquare size={14} /> Enviar Mensagem
              </button>
            )}
          </div>
          <div className="profile-preview-names" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 19 }}>{member.display_name}</strong>
            <span>@{member.username} {member.pronouns ? `• ${member.pronouns}` : ''}</span>
            {member.custom_status && <small className="profile-custom-status">{member.custom_status}</small>}
          </div>
          {member.bio && (
            <div className="profile-bio-box">
              <span>SOBRE MIM</span>
              <p>{member.bio}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NewDmModal({ onClose, onSelectUser }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`)
      .then(d => { if (active) setUsers(d.users || []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nova Mensagem Direta (DM)</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="gif-search-bar" style={{ marginBottom: 12 }}>
          <Search size={14} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar usuário por @username ou nome..."
          />
        </div>

        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Buscando...</p>
          ) : users.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Nenhum usuário encontrado.</p>
          ) : (
            users.map(u => (
              <button
                key={u.id}
                type="button"
                className="channel"
                style={{ width: '100%', justifyContent: 'space-between', border: 'none', background: 'var(--bg-sidebar)' }}
                onClick={() => { onSelectUser(u.id); onClose(); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar xs" style={{ background: u.avatar_color }}>
                    {u.avatar_url ? (
                      <img src={resolveAssetUrl(u.avatar_url)} alt={u.display_name} className="avatar-img" />
                    ) : (
                      (u.display_name || u.username)[0].toUpperCase()
                    )}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <strong style={{ display: 'block', color: 'var(--text)', fontSize: 13 }}>{u.display_name}</strong>
                    <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{u.username}</small>
                  </div>
                </div>
                <MessageSquare size={15} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
