import React, { useState } from 'react';
import { Search, Link2, X } from 'lucide-react';

const CURATED_GIFS = [
  { id: 'g1', title: 'GG Well Played', cat: 'gaming', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { id: 'g2', title: 'Celebrate Party', cat: 'trending', url: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif' },
  { id: 'g3', title: 'Mind Blown', cat: 'reactions', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { id: 'g4', title: 'Cat Typing Fast', cat: 'memes', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' },
  { id: 'g5', title: 'Thumbs Up Approved', cat: 'reactions', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { id: 'g6', title: 'Fire Lit', cat: 'trending', url: 'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif' },
  { id: 'g7', title: 'Victory Dance', cat: 'gaming', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: 'g8', title: 'Shocked Pikachu', cat: 'memes', url: 'https://media.giphy.com/media/6nWhy3ulBL7GSCvKw6/giphy.gif' },
  { id: 'g9', title: 'Clapping Applause', cat: 'reactions', url: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif' },
  { id: 'g10', title: 'Rocket Launch', cat: 'trending', url: 'https://media.giphy.com/media/mi6DsSSNKDbUY/giphy.gif' },
  { id: 'g11', title: 'Hacker Coding', cat: 'gaming', url: 'https://media.giphy.com/media/YQitE4YNQNahy/giphy.gif' },
  { id: 'g12', title: 'Laughing Hard', cat: 'memes', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif' }
];

const CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'trending', label: 'Em Alta' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'reactions', label: 'Reações' },
  { id: 'memes', label: 'Memes' }
];

export function GifPicker({ onSelectGif, onClose }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [customUrl, setCustomUrl] = useState('');

  const filtered = CURATED_GIFS.filter(g => {
    const matchCat = cat === 'all' || g.cat === cat;
    const matchQuery = !query.trim() || g.title.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQuery;
  });

  function handleCustomSubmit(e) {
    e.preventDefault();
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) return;
    onSelectGif({ url: trimmed, name: 'gif-custom.gif', mimetype: 'image/gif' });
  }

  return (
    <div className="gif-picker-popover">
      <div className="gif-picker-header">
        <div className="gif-search-bar">
          <Search size={14} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar GIF (ex: gg, fire, cat)..."
          />
        </div>
        <button type="button" className="icon-btn xs" onClick={onClose}><X size={15} /></button>
      </div>

      <div className="gif-cats">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            type="button"
            className={cat === c.id ? 'active' : ''}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="gif-grid">
        {filtered.map(g => (
          <button
            key={g.id}
            type="button"
            className="gif-item"
            title={g.title}
            onClick={() => onSelectGif({ url: g.url, name: `${g.title}.gif`, mimetype: 'image/gif' })}
          >
            <img src={g.url} alt={g.title} loading="lazy" />
            <span>{g.title}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} className="gif-url-form">
        <Link2 size={14} />
        <input
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          placeholder="Ou cole qualquer link de GIF (https://...)"
        />
        <button type="submit" className="btn-primary xs">Enviar</button>
      </form>
    </div>
  );
}
