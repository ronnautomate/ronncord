import React from 'react';
import { Minimize2, LogOut, Power } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/api.js';
import { isParticipant } from './useActivities.js';
import capaGeo from './capa-geo.svg';
import capaTruco from './capa-truco.svg';

export const CAPAS = { geo: capaGeo, truco: capaTruco };

export function ActAvatar({ person, size = 28, className = '' }) {
  return (
    <span
      className={`act-avatar ${className}`}
      style={{ background: person.color, width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={person.name}
    >
      {person.avatarUrl ? <img src={resolveAssetUrl(person.avatarUrl)} alt="" /> : (person.name || '?')[0].toUpperCase()}
    </span>
  );
}


// quem está jogando (pra card, convite e lobby)
export function playersOf(kind, g) {
  if (!g) return [];
  if (kind === 'geo') return g.jogadores;
  return g.assentos.filter((id, i) => id && !(g.ausentes || []).includes(i));
}


// barra de cima do jogo: nome, info do meio e os botões (encerrar / sair do jogo / voltar pras câmeras)
export function ActTop({ act, kind, children, right }) {
  const g = act.games[kind];
  const host = g && g.host === act.myId;
  const dentro = g && isParticipant(kind, g, act.myId);
  const nome = kind === 'geo' ? 'GeoGuessr' : 'Truco';
  return (
    <div className="act-top">
      <span className="act-top-capa" style={{ backgroundImage: `url("${CAPAS[kind]}")` }} />
      <h2>{nome}</h2>
      {children}
      <span className="act-fill" />
      {right}
      {host && g.fase !== 'fim' && (
        <button
          type="button"
          className="act-btn"
          title="Acaba o jogo pra todo mundo"
          onClick={() => {
            const meio = g.fase !== 'sala';
            if (!meio || window.confirm(`Encerrar ${kind === 'geo' ? 'o GeoGuessr' : 'o truco'} pra todo mundo?`)) act.end(kind);
          }}
        >
          <Power size={15} /> <span className="act-hide-sm">Encerrar</span>
        </button>
      )}
      {(dentro || (g && g.fase === 'fim')) && (
        <button type="button" className="act-btn vermelho-leve" title="Sai do jogo e continua na call" onClick={() => act.leave(kind)}>
          <LogOut size={15} /> <span className="act-hide-sm">Sair do jogo</span>
        </button>
      )}
      <button type="button" className="act-btn" title="Volta pras câmeras (o jogo continua)" onClick={() => act.minimize()}>
        <Minimize2 size={15} /> <span className="act-hide-sm">Ver call</span>
      </button>
    </div>
  );
}

