import React, { useState } from 'react';
import { X } from 'lucide-react';
import { NOVIDADES, isNew, seenVersion } from '../lib/novidades.js';

function formatText(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

// sozinho: só o que a pessoa ainda não viu. Botão ✨ (all): a última atualização
// (mais o que ainda não viu) e o histórico só se ela pedir.
export function WhatsNewModal({ all = false, onClose }) {
  const [seen] = useState(seenVersion);
  const [history, setHistory] = useState(false);
  const recent = NOVIDADES.items.filter(it => (it.since || NOVIDADES.version) === NOVIDADES.version || isNew(it, seen));
  const list = all ? (history ? NOVIDADES.items : recent) : NOVIDADES.items.filter(it => isNew(it, seen));
  const hasOlder = all && !history && recent.length < NOVIDADES.items.length;
  const base = import.meta.env.BASE_URL || '/';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card whats-new" onClick={e => e.stopPropagation()}>
        <div className="whats-new-top">
          <div>
            <h2>✨ O que há de novo</h2>
            <small>{NOVIDADES.date}</small>
          </div>
          <button className="icon-btn" title="Fechar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="whats-new-list">
          {list.map(it => (
            <div className="whats-new-item" key={it.title}>
              <h3>
                {isNew(it, seen) && <span className="whats-new-tag">NOVO</span>}
                {it.title}
              </h3>
              <p>{formatText(it.text)}</p>
              {it.img && (
                <img src={`${base}novidades/${it.since || NOVIDADES.version}/${it.img}`} alt="" loading="lazy" />
              )}
            </div>
          ))}
          {hasOlder && (
            <button type="button" className="whats-new-older" onClick={() => setHistory(true)}>Ver atualizações anteriores</button>
          )}
        </div>
        <div className="whats-new-footer">
          <button type="button" className="btn-primary" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
