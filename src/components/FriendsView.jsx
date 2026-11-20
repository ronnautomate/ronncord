import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../lib/api.js';
import { Users, UserPlus, MessageSquare, Check, X, Menu } from 'lucide-react';

export function FriendsView({ friends, currentUserId, onAddFriend, onAcceptFriend, onRemoveFriend, onOpenDM, onOpenNav }) {
  const incoming = friends.filter(f => f.status === 'pending' && f.addressee_id === currentUserId);
  // chegou pedido novo: abre direto em Pendentes (igual Discord)
  const [tab, setTab] = useState(() => (incoming.length ? 'pending' : 'online'));
  const lastIncoming = useRef(incoming.length);
  useEffect(() => {
    if (incoming.length > lastIncoming.current && tab !== 'add') setTab('pending');
    lastIncoming.current = incoming.length;
  }, [incoming.length]);
  const [usernameInput, setUsernameInput] = useState('');
  const [feedback, setFeedback] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setFeedback('');
    try {
      const r = await onAddFriend(usernameInput);
      setUsernameInput('');
      setFeedback(r?.accepted ? 'Ela já tinha te mandado pedido: agora vocês são amigos!' : `Pedido enviado! Quando aceitarem, aparece em Todos.`);
    } catch (err) {
      setFeedback(err.message);
    }
  }

  const accepted = friends.filter(f => f.status === 'accepted');
  const pending = friends.filter(f => f.status === 'pending');
  const online = accepted.filter(f => f.user_status !== 'offline');

  const list = tab === 'online' ? online : tab === 'all' ? accepted : pending;

  return (
    <main className="chat-area">
      <header className="chat-header">
        <div className="chat-header-title">
          {onOpenNav && (
            <button type="button" className="icon-btn mobile-nav-btn" title="Servidores e canais" onClick={onOpenNav}>
              <Menu size={20} />
            </button>
          )}
          <Users size={20} className="header-icon" />
          <strong>Amigos</strong>
          <div className="friends-tabs">
            <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>
              Disponível ({online.length})
            </button>
            <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
              Todos ({accepted.length})
            </button>
            <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
              Pendentes ({pending.length})
            </button>
            <button className={`add-friend-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>
              <UserPlus size={14} /> Adicionar Amigo
            </button>
          </div>
        </div>
      </header>

      <div className="friends-content">
        {tab === 'add' ? (
          <div className="add-friend-panel">
            <h2>ADICIONAR AMIGO</h2>
            <p>Você pode adicionar amigos usando o nome de usuário do RONNCORD.</p>
            <form onSubmit={handleAdd} className="add-friend-form">
              <input
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="Digite o nome de usuário (ex: alex)"
                required
              />
              <button type="submit" className="btn-primary">Enviar Pedido de Amizade</button>
            </form>
            {feedback && <p className="feedback-text">{feedback}</p>}
          </div>
        ) : (
          <div className="friends-list">
            <p className="section-label" style={{ marginBottom: 12 }}>
              {tab === 'online' ? `ONLINE — ${online.length}` : tab === 'all' ? `TODOS OS AMIGOS — ${accepted.length}` : `PENDENTES — ${pending.length}`}
            </p>
            {list.length === 0 ? (
              <div className="empty-friends">
                <p>Nenhum amigo nesta lista ainda.</p>
              </div>
            ) : (
              list.map(f => {
                const isIncoming = f.status === 'pending' && f.addressee_id === currentUserId;
                return (
                  <div className="friend-row" key={f.id}>
                    <div className="friend-info">
                      <div className="avatar" style={{ background: f.avatar_color || '#5865F2' }}>
                        {f.avatar_url ? (
                          <img src={resolveAssetUrl(f.avatar_url)} alt={f.display_name} className="avatar-img" />
                        ) : (
                          (f.display_name || f.username)[0].toUpperCase()
                        )}
                        <span className={`status-dot ${f.user_status || 'offline'}`} />
                      </div>
                      <div>
                        <strong>{f.display_name}</strong>
                        <small>
                          {f.status === 'pending'
                            ? (isIncoming ? 'Pedido de amizade recebido' : 'Pedido de amizade enviado')
                            : `@${f.username} • ${f.custom_status || f.user_status || 'offline'}`}
                        </small>
                      </div>
                    </div>
                    <div className="friend-actions">
                      {f.status === 'accepted' ? (
                        <button className="icon-btn circle" title="Mensagem Direta" onClick={() => onOpenDM(f.friend_id)}>
                          <MessageSquare size={16} />
                        </button>
                      ) : isIncoming ? (
                        <button className="icon-btn circle success" title="Aceitar" onClick={() => onAcceptFriend(f.id)}>
                          <Check size={16} />
                        </button>
                      ) : null}
                      <button
                        className="icon-btn circle danger"
                        title={f.status === 'accepted' ? 'Desfazer amizade' : isIncoming ? 'Recusar' : 'Cancelar pedido'}
                        onClick={() => {
                          if (f.status === 'accepted' && !confirm(`Desfazer amizade com ${f.display_name}?`)) return;
                          onRemoveFriend(f.id);
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </main>
  );
}
