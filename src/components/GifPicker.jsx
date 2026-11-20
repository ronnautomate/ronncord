import React, { useEffect, useRef, useState } from 'react';
import { Search, Link2, X } from 'lucide-react';

// GIFs de verdade pela busca do KLIPY (o Tenor fechou a API em 30/06/2026).
// Chave criada em partner.klipy.com > API Keys. Pode trocar pela variável VITE_KLIPY_KEY no build.
// A chave de teste aguenta 100 buscas por hora; se estourar, pedir "Production" no painel do KLIPY.
const KLIPY_KEY = import.meta.env.VITE_KLIPY_KEY || 'NsunZOiWaFhh13bswTa63FOnuyXx02YGKF2wg2EbLiwxU1DG61IWW3hr0NlXhZ0X';

// atalhos de busca (o primeiro mostra o que está em alta)
const QUICK = [
  { id: '', label: 'Em alta' },
  { id: 'kkkkk', label: 'Risada' },
  { id: 'gg', label: 'GG' },
  { id: 'reaction', label: 'Reação' },
  { id: 'triste', label: 'Triste' },
  { id: 'dança', label: 'Dança' }
];

function customerId() {
  let id = localStorage.getItem('ronncord_gif_id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ronncord_gif_id', id);
  }
  return id;
}

// cada GIF vem em vários tamanhos (xs, sm, md, hd), em webp e gif
function pickFile(item, size) {
  const f = item?.file?.[size] || {};
  return f.webp?.url || f.gif?.url || null;
}

export function GifPicker({ onSelectGif, onClose, initialKind = 'gifs' }) {
  const [kind, setKind] = useState(initialKind); // 'gifs' | 'stickers' (figurinhas, também do KLIPY)
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const lastQuery = useRef(null);
  const lastKind = useRef(kind);

  async function load(q, pg) {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      page: String(pg),
      per_page: '24',
      customer_id: customerId(),
      locale: 'br',
      content_filter: 'off'
    });
    if (q) params.set('q', q);
    try {
      const r = await fetch(`https://api.klipy.com/api/v1/${KLIPY_KEY}/${kind}/${q ? 'search' : 'trending'}?${params}`);
      const j = await r.json();
      if (lastQuery.current !== q || lastKind.current !== kind) return; // a pessoa já digitou outra coisa
      const list = (j?.data?.data || [])
        .map(it => ({
          id: it.id,
          title: it.title || 'GIF',
          thumb: pickFile(it, 'sm') || pickFile(it, 'xs') || pickFile(it, 'md'),
          full: pickFile(it, 'md') || pickFile(it, 'hd')
        }))
        .filter(g => g.thumb && g.full);
      setItems(prev => (pg === 1 ? list : [...prev, ...list]));
      setHasMore(Boolean(j?.data?.has_next));
      if (!r.ok || j?.result === false) setError('A busca de GIFs não respondeu agora.');
    } catch {
      if (lastQuery.current === q) setError('A busca de GIFs não respondeu agora.');
    } finally {
      if (lastQuery.current === q) setLoading(false);
    }
  }

  // busca com uma pausa curta depois de parar de digitar
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      lastQuery.current = q;
      lastKind.current = kind;
      setPage(1);
      setItems([]);
      load(q, 1);
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [query, kind]);

  function handleScroll(e) {
    const el = e.currentTarget;
    if (hasMore && !loading && el.scrollTop + el.clientHeight > el.scrollHeight - 120) {
      const next = page + 1;
      setPage(next);
      load(lastQuery.current || '', next);
    }
  }

  function handleCustomSubmit(e) {
    e?.preventDefault();
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) return;
    onSelectGif({ url: trimmed, name: 'gif-custom.gif', mimetype: 'image/gif' });
  }

  const activeChip = query.trim();

  return (
    <div className="gif-picker-popover">
      <div className="gif-kind-tabs">
        <button type="button" className={kind === 'gifs' ? 'active' : ''} onClick={() => setKind('gifs')}>GIFs</button>
        <button type="button" className={kind === 'stickers' ? 'active' : ''} onClick={() => setKind('stickers')}>Figurinhas</button>
      </div>
      <div className="gif-picker-header">
        <div className="gif-search-bar">
          <Search size={14} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={kind === 'stickers' ? 'Buscar figurinhas' : 'Buscar GIFs no KLIPY'}
          />
        </div>
        <button type="button" className="icon-btn xs" onClick={onClose}><X size={15} /></button>
      </div>

      <div className="gif-cats">
        {QUICK.map(c => (
          <button
            key={c.label}
            type="button"
            className={activeChip === c.id ? 'active' : ''}
            onClick={() => setQuery(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={`gif-grid ${kind === 'stickers' ? 'stickers' : ''}`} onScroll={handleScroll}>
        {items.map(g => (
          <button
            key={g.id}
            type="button"
            className="gif-item"
            title={g.title}
            onClick={() => onSelectGif(kind === 'stickers'
              ? { url: g.full, name: `sticker-${g.title}.webp`, mimetype: 'image/webp' }
              : { url: g.full, name: `${g.title}.gif`, mimetype: 'image/gif' })}
          >
            <img src={g.thumb} alt={g.title} loading="lazy" />
          </button>
        ))}
        {!loading && !error && items.length === 0 && (
          <p className="gif-empty">Nada encontrado pra "{activeChip}".</p>
        )}
        {error && items.length === 0 && <p className="gif-empty">{error}</p>}
        {loading && <p className="gif-empty">Carregando...</p>}
      </div>

      {/* div e não form: o seletor fica dentro do formulário do chat, e form dentro de form quebra */}
      <div className="gif-url-form">
        <Link2 size={14} />
        <input
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(e); }}
          placeholder="Ou cole qualquer link de GIF (https://...)"
        />
        <button type="button" className="btn-primary xs" onClick={handleCustomSubmit}>Enviar</button>
      </div>
      <small className="gif-credit">{kind === 'stickers' ? 'Figurinhas' : 'GIFs'} pelo KLIPY</small>
    </div>
  );
}
