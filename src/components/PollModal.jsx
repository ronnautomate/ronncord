import React, { useState } from 'react';
import { X, BarChart3, Trash2 } from 'lucide-react';
import { buildPoll } from '../lib/poll.js';

// Janela de criar enquete (igual o "Criar enquete" do Discord): pergunta + até 10 opções.
// Campo novo aparece sozinho quando você escreve no último; Enter pula pro próximo.
export function PollModal({ initialQuestion = '', onClose, onSend }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [options, setOptions] = useState(['', '']);
  const [sending, setSending] = useState(false);
  const filled = options.map(o => o.trim()).filter(Boolean);
  const ok = question.trim() && filled.length >= 2;

  function setOpt(i, v) {
    setOptions(prev => {
      const next = prev.map((o, j) => (j === i ? v : o));
      if (i === next.length - 1 && v.trim() && next.length < 10) next.push('');
      return next;
    });
  }

  async function send(e) {
    e?.preventDefault();
    if (!ok || sending) return;
    setSending(true);
    try {
      await onSend(buildPoll(question, filled));
      onClose();
    } catch (err) {
      alert(err.message);
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card poll-modal" onClick={e => e.stopPropagation()} onSubmit={send}>
        <div className="modal-header">
          <h2><BarChart3 size={18} /> Criar enquete</h2>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="poll-modal-field">
          <span>Pergunta</span>
          <input autoFocus maxLength={200} value={question} onChange={e => setQuestion(e.target.value)} placeholder="O que você quer perguntar?" />
        </label>
        <div className="poll-modal-field">
          <span>Opções</span>
          {options.map((o, i) => (
            <div key={i} className="poll-modal-opt">
              <input
                maxLength={80}
                value={o}
                onChange={e => setOpt(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = e.currentTarget.closest('.poll-modal-field').querySelectorAll('input')[i + 1];
                    if (next) next.focus(); else send();
                  }
                }}
                placeholder={`Opção ${i + 1}`}
              />
              {options.length > 2 && (
                <button type="button" className="icon-btn xs" title="Tirar opção" onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={!ok || sending}>{sending ? 'Enviando...' : 'Postar enquete'}</button>
        </div>
      </form>
    </div>
  );
}
