import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, X, Monitor } from 'lucide-react';

// Janelinha da call (igual Discord): saiu da sala pra um canal de texto ou DM e tem alguém
// transmitindo (ou com câmera)? A stream continua numa janelinha no canto, que dá pra arrastar.
// Clicar abre a sala de novo; o X esconde até a próxima stream.
function Video({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = new MediaStream(stream.getVideoTracks());
    el.muted = true;
    el.play?.().catch(() => {});
  }, [stream, stream?.getVideoTracks()[0]?.id]);
  return <video ref={ref} autoPlay muted playsInline />;
}

export function MiniCall({ videos, people, onOpen }) {
  const [hiddenId, setHiddenId] = useState(null);
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ronncord_mini_pos')) || null; } catch { return null; }
  });
  const boxRef = useRef(null);
  const drag = useRef(null);

  // a stream tem preferência; sem stream, a primeira câmera
  const pick = videos.find(v => v.kind !== 'camera') || videos.find(v => v.kind === 'camera');
  if (!pick || pick.id === hiddenId) return null;
  const person = people.find(p => p.socketId === pick.socketId);
  const label = `${person?.name || pick.displayName || 'Alguém'}${pick.kind === 'camera' ? '' : ' (tela)'}`;

  function onDown(e) {
    if (e.target.closest('button')) return;
    const r = boxRef.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag.current) return;
    const w = boxRef.current.offsetWidth, h = boxRef.current.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - drag.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - drag.current.dy));
    drag.current.moved = true;
    setPos({ x, y });
  }
  function onUp() {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) localStorage.setItem('ronncord_mini_pos', JSON.stringify(pos));
    else onOpen();
  }

  return (
    <div
      ref={boxRef}
      className="mini-call"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      title="Clique pra abrir a sala • arraste pra mudar de lugar"
    >
      <Video stream={pick.stream} />
      <div className="mini-call-bar">
        <span>{pick.kind !== 'camera' && <Monitor size={13} />} {label}</span>
        <div>
          <button type="button" title="Abrir a sala" onClick={onOpen}><Maximize2 size={14} /></button>
          <button type="button" title="Esconder" onClick={() => setHiddenId(pick.id)}><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}
