import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

// Visor de imagem (trazido do discordia): clica na foto do chat e ela abre grande.
// Setas (ou ← →, ou arrastar no celular) passam pelas outras fotos do canal. Esc fecha.
// Clicar na foto alterna entre caber na tela e tamanho real.
export function ImageViewer({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(false);
  const touchX = useRef(null);
  const img = images[index];
  const total = images.length;

  function go(step) {
    if (total < 2) return;
    setZoom(false);
    setIndex(i => (i + step + total) % total);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!img) return null;

  return (
    <div
      className="image-viewer"
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null || zoom) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="image-viewer-top" onClick={e => e.stopPropagation()}>
        <span className="image-viewer-name">
          {img.author ? <strong>{img.author}</strong> : null}
          {img.name ? <span>{img.name}</span> : null}
        </span>
        {total > 1 && <span className="image-viewer-count">{index + 1} / {total}</span>}
        <a href={img.url} target="_blank" rel="noreferrer" title="Abrir original">
          <ExternalLink size={16} /> <span>Original</span>
        </a>
        <button type="button" title="Fechar (Esc)" onClick={onClose}><X size={18} /></button>
      </div>

      <div className={`image-viewer-stage ${zoom ? 'zoom' : ''}`}>
        <img
          key={img.url}
          src={img.url}
          alt={img.name || ''}
          onClick={e => { e.stopPropagation(); setZoom(z => !z); }}
          draggable={false}
        />
      </div>

      {total > 1 && (
        <>
          <button type="button" className="image-viewer-arrow left" title="Anterior (←)" onClick={e => { e.stopPropagation(); go(-1); }}>
            <ChevronLeft size={26} />
          </button>
          <button type="button" className="image-viewer-arrow right" title="Próxima (→)" onClick={e => { e.stopPropagation(); go(1); }}>
            <ChevronRight size={26} />
          </button>
        </>
      )}
    </div>
  );
}
