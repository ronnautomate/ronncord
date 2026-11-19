import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, Hash, Volume2, Upload, Sparkles, MessageSquare, Search } from 'lucide-react';
import { apiFetch, resolveAssetUrl } from '../lib/api.js';
import { THEMES, getSavedTheme, applyTheme, nameColor as safeNameColor } from '../lib/themes.js';
import { UserPopout } from './UserPopout.jsx';

export function CreateOrJoinServerModal({ onClose, onCreateServer, onJoinServer, onImportDiscord }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [templateInput, setTemplateInput] = useState('');
  const [customJson, setCustomJson] = useState('');
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
        await onImportDiscord({ templateInput, preset, customJson, customName: name });
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
                <span>OU COLE UM JSON EXPORTADO</span>
                <textarea
                  rows={2}
                  value={customJson}
                  onChange={e => { setCustomJson(e.target.value); if (e.target.value) { setPreset(''); setTemplateInput(''); } }}
                  placeholder='{"name":"Meu Server","channels":[{"category":"GERAL","name":"chat","type":"text"}]}'
                />
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
  const [exported, setExported] = useState(false);

  function copyCode() {
    navigator.clipboard?.writeText(server.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function exportServerJson() {
    try {
      const data = await apiFetch(`/api/servers/${server.id}/export`);
      navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch (err) {
      alert(err.message);
    }
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
        <div className="invite-box" style={{ marginBottom: 14 }}>
          <code>{server.invite_code}</code>
          <button type="button" className="btn-primary" onClick={copyCode}>
            {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
          </button>
        </div>

        <div style={{ borderTop: '1px solid #3f4147', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <small style={{ color: 'var(--text-muted)' }}>Exportar canais para clonar depois</small>
          <button type="button" className="btn-ghost xs" onClick={exportServerJson}>
            {exported ? <><Check size={14} /> JSON Copiado!</> : <><Copy size={14} /> Exportar Servidor (JSON)</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export { PROFILE_BADGES } from './SettingsModal.jsx';
import { SettingsModal, PROFILE_BADGES as BADGES_LIST } from './SettingsModal.jsx';

// Configurações do usuário: agora vivem em SettingsModal.jsx
export function ProfileModal(props) {
  return <SettingsModal {...props} />;
}

// Perfil de outra pessoa: agora é o cartãozinho do Discord (UserPopout), aberto do lado do clique
export function UserProfileModal(props) {
  return <UserPopout {...props} badgesCatalog={BADGES_LIST} />;
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
