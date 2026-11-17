import React, { useEffect, useState } from 'react';
import { X, Lock, Plus, Trash2, Save } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

export function NotesModal({ onClose, isDemo }) {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (isDemo) return;
    apiFetch('/api/notes')
      .then(d => {
        setNotes(d.notes || []);
        if (d.notes?.length > 0) {
          setSelectedId(d.notes[0].id);
          setTitle(d.notes[0].title);
          setContent(d.notes[0].content);
        }
      })
      .catch(() => {});
  }, [isDemo]);

  function startNew() {
    setSelectedId(null);
    setTitle('');
    setContent('');
    setStatusMsg('');
  }

  function selectNote(n) {
    setSelectedId(n.id);
    setTitle(n.title);
    setContent(n.content);
    setStatusMsg('');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (isDemo) return;
    setSaving(true);
    setStatusMsg('');
    try {
      const { note } = await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ id: selectedId, title: title || 'Nota sem título', content })
      });
      setNotes(prev => {
        const exists = prev.some(n => n.id === note.id);
        return exists ? prev.map(n => (n.id === note.id ? note : n)) : [note, ...prev];
      });
      setSelectedId(note.id);
      setStatusMsg('Salvo e criptografado!');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err) {
      setStatusMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (isDemo) return;
    await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) startNew();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} style={{ color: '#57F287' }} />
            <h2>Cofre de Notas Pessoais</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="modal-subtitle" style={{ marginBottom: 12 }}>
          Criptografado com <strong>AES-256-GCM</strong> — apenas a sua conta consegue abrir ou ler estas anotações.
        </p>

        <div className="notes-layout">
          <div className="notes-sidebar">
            <button type="button" className="btn-primary xs" style={{ width: '100%', marginBottom: 8 }} onClick={startNew}>
              <Plus size={14} /> Nova Nota
            </button>
            {notes.map(n => (
              <div
                key={n.id}
                className={`note-list-item ${selectedId === n.id ? 'active' : ''}`}
                onClick={() => selectNote(n)}
              >
                <span>{n.title}</span>
                <button
                  type="button"
                  className="icon-btn xs danger"
                  onClick={e => { e.stopPropagation(); handleDelete(n.id); }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleSave} className="notes-editor">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título da anotação..."
              required
            />
            <textarea
              rows={9}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Escreva suas senhas, configs, links ou lembretes secretos aqui..."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: '#57F287' }}>{statusMsg}</small>
              <button type="submit" className="btn-primary xs" disabled={saving}>
                <Save size={14} /> {saving ? 'Criptografando...' : 'Salvar Nota'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
