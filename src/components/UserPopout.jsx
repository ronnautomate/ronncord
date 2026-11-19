import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api.js';
import { nameColor as safeNameColor } from '../lib/themes.js';

// Cartão de perfil pequeno, igual ao do Discord: abre do lado de onde a pessoa clicou
// (call, lista de membros, chat), sem tomar a tela. Clicar fora ou Esc fecha.
// O efeito de perfil (aurora, fogo...) fica só dentro do cartão.

// guarda onde foi o último clique, pra saber onde abrir o cartão
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', e => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
}

const CARD_W = 300;

function parseBadges(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

export function UserPopout({ member, currentUserId, badgesCatalog = [], onClose, onSendDM, onQuickDmMessage, canManageRoles = false, onSetRole }) {
  const [roleBusy, setRoleBusy] = useState(false);
  const [quickMsg, setQuickMsg] = useState('');
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const anchor = useRef(lastPointer);

  // posiciona do lado do clique sem sair da tela
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const { x, y } = anchor.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 640) {
      setPos({ mobile: true });
      return;
    }
    let left = x + 16;
    if (left + CARD_W > vw - 12) left = x - CARD_W - 16;
    left = Math.max(12, Math.min(left, vw - CARD_W - 12));
    const top = Math.max(12, Math.min(y - 60, vh - h - 12));
    setPos({ left, top });
  }, [member?.id]);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!member) return null;
  const userBadges = parseBadges(member.badges_json);
  const effect = member.profile_effect && member.profile_effect !== 'none' ? member.profile_effect : null;
  const isMe = member.id === currentUserId;

  async function handleQuickSend(e) {
    e.preventDefault();
    if (!quickMsg.trim()) return;
    if (onQuickDmMessage) await onQuickDmMessage(member.id, quickMsg.trim());
    else onSendDM?.(member.id);
    setQuickMsg('');
    onClose();
  }

  const style = pos?.mobile ? undefined : pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 };

  return (
    <div className="user-popout-layer" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={cardRef}
        className={`user-popout nameplate-${member.nameplate_style || 'none'} ${effect ? `effect-${effect}` : ''} ${pos?.mobile ? 'mobile' : ''}`}
        style={style}
      >
        {effect && <div className="profile-fx-overlay" aria-hidden="true" />}
        <div
          className="user-popout-banner"
          style={member.banner_url
            ? { backgroundImage: `url(${resolveAssetUrl(member.banner_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: member.banner_color || member.avatar_color || '#5865F2' }}
        />
        <div className="user-popout-body">
          <div className="user-popout-avatar-row">
            <div className={`avatar xl deco-${member.avatar_decoration || 'none'}`} style={{ background: member.avatar_color || '#5865F2' }}>
              {member.avatar_url ? (
                <img src={resolveAssetUrl(member.avatar_url)} alt={member.display_name} className="avatar-img" />
              ) : (
                (member.display_name || member.username || 'U')[0].toUpperCase()
              )}
              <span className={`status-dot ${member.status || 'offline'}`} />
            </div>
            {userBadges.length > 0 && (
              <div className="badges-bar">
                {badgesCatalog.filter(b => userBadges.includes(b.id)).map(b => (
                  <span key={b.id} className="badge-icon-pill" title={b.label}>{b.icon}</span>
                ))}
              </div>
            )}
          </div>

          <div className="user-popout-card">
            <div className="user-popout-names">
              <strong style={{ color: safeNameColor(member.name_color) || 'var(--text)' }}>{member.display_name}</strong>
              {member.clan_tag && <span className="clan-tag-pill">{member.clan_icon || '💀'} {member.clan_tag}</span>}
            </div>
            <span className="user-popout-handle">@{member.username}{member.pronouns ? ` • ${member.pronouns}` : ''}</span>
            {member.custom_status && <p className="user-popout-status">{member.custom_status}</p>}

            {member.bio && (
              <div className="user-popout-section">
                <h4>Sobre mim</h4>
                <p>{member.bio}</p>
              </div>
            )}
            {member.role && (
              <div className="user-popout-section">
                <h4>Cargo</h4>
                <span className="role-pill"><i /> {member.role === 'owner' ? 'DONO' : member.role === 'admin' ? 'ADMIN' : 'MEMBRO'}</span>
              </div>
            )}

            {canManageRoles && !isMe && member.role && member.role !== 'owner' && onSetRole && (
              <button
                type="button"
                className="user-popout-role-btn"
                disabled={roleBusy}
                onClick={async () => {
                  setRoleBusy(true);
                  try { await onSetRole(member.id, member.role === 'admin' ? 'member' : 'admin'); } catch (err) { alert(err.message); }
                  setRoleBusy(false);
                }}
              >
                {member.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}
              </button>
            )}

            {!isMe && (
              <form onSubmit={handleQuickSend} className="quick-dm-form">
                <input
                  value={quickMsg}
                  onChange={e => setQuickMsg(e.target.value)}
                  placeholder={`Mensagem para @${member.username}`}
                  autoFocus={!pos?.mobile}
                />
                <button type="button" className="icon-btn xs" title="Abrir DM" onClick={() => { onSendDM?.(member.id); onClose(); }}>
                  <MessageSquare size={15} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
