import React, { useState } from 'react';
import { BarChart3, Check } from 'lucide-react';

// Cartão da enquete no chat: cada opção com barra, porcentagem e quem votou.
// Clicar vota; clicar de novo na mesma tira o voto; clicar em outra troca.
export function PollCard({ poll, votes = [], currentUserId, members = [], onVote }) {
  const [busy, setBusy] = useState(false);
  const total = votes.length;
  const mine = votes.find(v => v.user_id === currentUserId)?.option;
  const nameOf = id => members.find(m => m.id === id)?.display_name || 'alguém';

  async function vote(i) {
    if (!onVote || busy) return;
    setBusy(true);
    try { await onVote(i); } catch (err) { alert(err.message); }
    setBusy(false);
  }

  return (
    <div className="poll-card">
      <div className="poll-question"><BarChart3 size={16} /> {poll.question}</div>
      <small className="poll-sub">{mine === undefined ? 'Escolha uma opção' : 'Clique de novo pra tirar o voto'}</small>
      <div className="poll-options">
        {poll.options.map((opt, i) => {
          const who = votes.filter(v => v.option === i);
          const pct = total ? Math.round((who.length / total) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              className={`poll-option ${mine === i ? 'mine' : ''}`}
              onClick={() => vote(i)}
              disabled={busy}
              title={who.length ? who.map(v => nameOf(v.user_id)).join(', ') : 'Ninguém votou ainda'}
            >
              <i style={{ width: `${pct}%` }} />
              <span className="poll-check">{mine === i && <Check size={13} />}</span>
              <span className="poll-label">{opt}</span>
              <span className="poll-pct">{who.length} • {pct}%</span>
            </button>
          );
        })}
      </div>
      <small className="poll-sub">{total} {total === 1 ? 'voto' : 'votos'}</small>
    </div>
  );
}
