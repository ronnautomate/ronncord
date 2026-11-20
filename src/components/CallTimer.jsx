import React, { useEffect, useState } from 'react';

// Relógio da call (igual Discord). startedAt vem do servidor; offset = relógio do servidor - o meu,
// pra todo mundo ver o mesmo tempo mesmo com o relógio do PC adiantado/atrasado.
export function formatCallTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function CallTimer({ startedAt, offset = 0, className = 'call-timer' }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  return <span className={className} title="Tempo de call">{formatCallTime(Date.now() + offset - startedAt)}</span>;
}
