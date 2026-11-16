import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, Hash, Volume2, Upload, Sparkles, MessageSquare, Search } from 'lucide-react';
import { apiFetch, resolveAssetUrl } from '../lib/api.js';

export function CreateOrJoinServerModal({ onClose, onCreateServer, onJoinServer, onImportDiscord }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [templateInput, setTemplateInput] = useState('');
  const [preset, setPreset] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'create') {
        await onCreateServer(name);
      } else if (tab === 'join') {
        await onJoinServer(inviteCode);
      } else {
        await onImportDiscord({ templateInput, preset, customName: name });
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
      <div className="modal-card wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {tab === 'create' ? 'Criar um Servidor' : tab === 'join' ? 'Entrar em um Servidor' : 'Importar Servidor do Discord'}
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="auth-tabs" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 }}>
          <button type="button" className={tab === 'create' ? 'active' : ''} onClick={() => { setTab('create'); setError(''); }}>
            Criar Novo
          </button>
          <button type="button" className={tab === 'import' ? 'active' : ''} onClick={() => { setTab('import'); setError(''); }}>
            Importar Discord
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
          ) : tab === 'join' ? (
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
          ) : (
            <>
              <label>
                <span>LINK OU CÓDIGO DO MODELO DO DISCORD (OPCIONAL)</span>
                <input
                  value={templateInput}
                  onChange={e => { setTemplateInput(e.target.value); if (e.target.value) setPreset(''); }}
                  placeholder="https://discord.new/xxxxxx ou código do template"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  No Discord: Configurações do Servidor → Modelo do Servidor → Copiar Link.
                </small>
              </label>

              <label>
                <span>OU ESCOLHA UM SERVIDOR PRONTO</span>
                <div className="deco-picker">
                  {[
                    { id: 'gaming', label: '🎮 Squad Gaming' },
                    { id: 'community', label: '🌟 Comunidade VIP' },
                    { id: 'dev', label: '💻 Dev & Tech Hub' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`deco-chip ${preset === p.id ? 'active' : ''}`}
                      onClick={() => { setPreset(p.id); setTemplateInput(''); }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </label>

              <label>
                <span>NOME PERSONALIZADO (OPCIONAL)</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Deixe vazio para usar o nome original do modelo"
                />
              </label>
            </>
          )}
          {error && <div className="auth-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Processando...' : tab === 'create' ? 'Criar Servidor' : tab === 'join' ? 'Entrar' : 'Clonar Servidor'}
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

const COLORS = ['#f2f3f5', '#f0b232', '#5865F2', '#57F287', '#EB459E', '#ED4245', '#00e5ff', '#9B59B6'];

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

const NAMEPLATES = [
  { id: 'none', label: 'Padrão' },
  { id: 'aurora-purple', label: 'Aurora Roxa' },
  { id: 'crimson-ember', label: 'Brasa Carmesim' },
  { id: 'cyber-cyan', label: 'Cyber Ciano' },
  { id: 'emerald-matrix', label: 'Esmeralda' },
  { id: 'golden-sunset', label: 'Ouro Solar' }
];

const PROFILE_EFFECTS = [
  { id: 'none', label: 'Sem efeito' },
  { id: 'cyber-glitch', label: '⚡ Cyber Glitch' },
  { id: 'sakura-glow', label: '🌸 Aurora Mística' },
  { id: 'crimson-thunder', label: '🔥 Fúria Carmesim' },
  { id: 'galaxy-portal', label: '🌌 Portal Galáctico' },
  { id: 'matrix-rain', label: '💚 Matrix Neon' }
];

const CLAN_ICONS = ['💀', '🩵', '🔥', '⚡', '👑', '🎮', '💎', '🚀'];

export const PROFILE_BADGES = [
  { id: 'nitro', icon: '🚀', label: 'Nitro' },
  { id: 'gamer', icon: '🎮', label: 'Gamer' },
  { id: 'boost', icon: '💎', label: 'Booster' },
  { id: 'dev', icon: '⚡', label: 'Dev' },
  { id: 'vip', icon: '👑', label: 'VIP' },
  { id: 'verified', icon: '🛡️', label: 'Verificado' }
];

function parseBadges(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

export function ProfileModal({ user, onClose, onSave, onUploadAvatar, onLogout }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [pronouns, setPronouns] = useState(user.pronouns || '');
  const [customStatus, setCustomStatus] = useState(user.custom_status || '');
  const [bio, setBio] = useState(user.bio || '');
  const [status, setStatus] = useState(user.status || 'online');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#5865F2');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [bannerColor, setBannerColor] = useState(user.banner_color || '#5865F2');
  const [bannerUrl, setBannerUrl] = useState(user.banner_url || '');
  const [avatarDecoration, setAvatarDecoration] = useState(user.avatar_decoration || 'none');
  const [nameColor, setNameColor] = useState(user.name_color || '#f2f3f5');
  const [nameplateStyle, setNameplateStyle] = useState(user.nameplate_style || 'none');
  const [clanTag, setClanTag] = useState(user.clan_tag || '');
  const [clanIcon, setClanIcon] = useState(user.clan_icon || '💀');
  const [badges, setBadges] = useState(() => parseBadges(user.badges_json));
  const [profileEffect, setProfileEffect] = useState(user.profile_effect || 'none');
  const [effectReplayKey, setEffectReplayKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarFileRef = useRef(null);
  const bannerFileRef = useRef(null);

  async function handleUpload(e, target) {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    setUploading(true);
    try {
      const uploaded = await onUploadAvatar(file);
      if (target === 'avatar') setAvatarUrl(uploaded.url);
      else setBannerUrl(uploaded.url);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function toggleBadge(id) {
    setBadges(prev => (prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]));
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
        banner_url: bannerUrl || null,
        avatar_decoration: avatarDecoration,
        name_color: nameColor,
        nameplate_style: nameplateStyle,
        clan_tag: clanTag.trim().slice(0, 6).toUpperCase(),
        clan_icon: clanIcon,
        badges_json: JSON.stringify(badges),
        profile_effect: profileEffect
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" style={{ maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Personalizar Perfil (Estilo Nitro)</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="auth-form">
          {/* Live Discord Nitro Profile Card Preview */}
          <div
            key={effectReplayKey}
            className={`profile-card-preview nameplate-${nameplateStyle} effect-${profileEffect}`}
          >
            {profileEffect !== 'none' && <div className="profile-fx-overlay" aria-hidden="true" />}
            <div
              className="profile-banner"
              style={bannerUrl ? { backgroundImage: `url(${resolveAssetUrl(bannerUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: bannerColor }}
            />
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
                {customStatus && (
                  <div className="thought-bubble">{customStatus}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e, 'avatar')} />
                <input ref={bannerFileRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e, 'banner')} />
                <button type="button" className="btn-primary xs" disabled={uploading} onClick={() => avatarFileRef.current?.click()}>
                  <Upload size={13} /> Avatar (Foto/GIF)
                </button>
                <button type="button" className="btn-primary xs" disabled={uploading} onClick={() => bannerFileRef.current?.click()}>
                  <Upload size={13} /> Banner (Foto/GIF)
                </button>
                {avatarUrl && <button type="button" className="btn-ghost xs" onClick={() => setAvatarUrl('')}>Tirar Avatar</button>}
                {bannerUrl && <button type="button" className="btn-ghost xs" onClick={() => setBannerUrl('')}>Tirar Banner</button>}
              </div>

              <div className="profile-preview-names">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ color: nameColor }}>{displayName || user.username}</strong>
                  {clanTag && (
                    <span className="clan-tag-pill">{clanIcon} {clanTag}</span>
                  )}
                </div>
                <span>@{user.username} {pronouns ? `• ${pronouns}` : ''}</span>
              </div>
            </div>
          </div>

          <div className="profile-grid-2">
            <label>
              <span>NOME DE EXIBIÇÃO</span>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} required />
            </label>
            <label>
              <span>PRONOMES / SUBTÍTULO</span>
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
              <span>BALÃO DE STATUS</span>
              <input
                value={customStatus}
                onChange={e => setCustomStatus(e.target.value)}
                placeholder="ex: www.ronncord.com"
              />
            </label>
          </div>

          <div className="profile-grid-2">
            <label>
              <span>TAG DO CLÃ (ATÉ 4-6 LETRAS)</span>
              <input
                maxLength={6}
                value={clanTag}
                onChange={e => setClanTag(e.target.value.toUpperCase())}
                placeholder="ex: 0DAY, QSR, LOGI"
              />
            </label>
            <label>
              <span>ÍCONE DA TAG</span>
              <div className="deco-picker">
                {CLAN_ICONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    className={`deco-chip ${clanIcon === ic ? 'active' : ''}`}
                    onClick={() => setClanIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label>
            <span>✨ EFEITO DE ENTRADA & TEMA DO PERFIL</span>
            <div className="deco-picker">
              {PROFILE_EFFECTS.map(fx => (
                <button
                  key={fx.id}
                  type="button"
                  className={`deco-chip ${profileEffect === fx.id ? 'active' : ''}`}
                  onClick={() => {
                    setProfileEffect(fx.id);
                    setEffectReplayKey(k => k + 1);
                  }}
                >
                  {fx.label}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>PLACA DE FUNDO (NAMEPLATE NA LISTA DE MEMBROS)</span>
            <div className="deco-picker">
              {NAMEPLATES.map(np => (
                <button
                  key={np.id}
                  type="button"
                  className={`deco-chip ${nameplateStyle === np.id ? 'active' : ''}`}
                  onClick={() => setNameplateStyle(np.id)}
                >
                  {np.label}
                </button>
              ))}
            </div>
          </label>

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
            <span>INSÍGNIAS DO PERFIL</span>
            <div className="deco-picker">
              {PROFILE_BADGES.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`deco-chip ${badges.includes(b.id) ? 'active' : ''}`}
                  onClick={() => toggleBadge(b.id)}
                >
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
          </label>

          <div className="profile-grid-2">
            <label>
              <span>COR DO NOME</span>
              <div className="color-picker">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${nameColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNameColor(c)}
                  />
                ))}
              </div>
            </label>
            <label>
              <span>BANNER GRADIENTE</span>
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
          </div>

          <label>
            <span>SOBRE MIM (BIO)</span>
            <textarea
              rows={2}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Links, bio, descrição..."
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

export function UserProfileModal({ member, currentUserId, onClose, onSendDM, onQuickDmMessage }) {
  const [quickMsg, setQuickMsg] = useState('');
  if (!member) return null;
  const userBadges = parseBadges(member.badges_json);

  async function handleQuickSend(e) {
    e.preventDefault();
    if (!quickMsg.trim()) return;
    if (onQuickDmMessage) {
      await onQuickDmMessage(member.id, quickMsg.trim());
    } else {
      onSendDM(member.id);
    }
    setQuickMsg('');
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card popout nameplate-${member.nameplate_style || 'none'} effect-${member.profile_effect || 'none'}`}
        style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {(member.profile_effect && member.profile_effect !== 'none') && (
          <div className="profile-fx-overlay" aria-hidden="true" />
        )}
        <div
          className="profile-banner"
          style={member.banner_url
            ? { height: 112, backgroundImage: `url(${resolveAssetUrl(member.banner_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { height: 112, background: member.banner_color || '#5865F2' }}
        />
        <div className="profile-card-body" style={{ padding: '0 18px 18px' }}>
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
            {member.custom_status && (
              <div className="thought-bubble">{member.custom_status}</div>
            )}
          </div>

          <div className="profile-preview-names" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 19, color: member.name_color || '#f2f3f5' }}>{member.display_name}</strong>
              {member.clan_tag && (
                <span className="clan-tag-pill">{member.clan_icon || '💀'} {member.clan_tag}</span>
              )}
            </div>
            <span>@{member.username} {member.pronouns ? `• ${member.pronouns}` : ''}</span>
          </div>

          {userBadges.length > 0 && (
            <div className="badges-bar">
              {PROFILE_BADGES.filter(b => userBadges.includes(b.id)).map(b => (
                <span key={b.id} className="badge-icon-pill" title={b.label}>{b.icon}</span>
              ))}
            </div>
          )}

          {member.bio && (
            <div className="profile-bio-box" style={{ marginBottom: 10 }}>
              <span>SOBRE MIM</span>
              <p>{member.bio}</p>
            </div>
          )}

          {member.role && (
            <div className="roles-bar">
              <span className="role-pill"><i /> {member.role.toUpperCase()}</span>
            </div>
          )}

          {member.id !== currentUserId && (
            <form onSubmit={handleQuickSend} className="quick-dm-form">
              <input
                value={quickMsg}
                onChange={e => setQuickMsg(e.target.value)}
                placeholder={`Conversar com @${member.username}...`}
              />
              <button type="button" className="icon-btn xs" title="Abrir DM" onClick={() => { onSendDM(member.id); onClose(); }}>
                <MessageSquare size={15} />
              </button>
            </form>
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
