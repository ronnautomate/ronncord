import React, { useEffect, useRef, useState } from 'react';
import { Minimize2, LogOut, Power, Volume2, VolumeX } from 'lucide-react';
import { getGameVolume, setGameVolume, SoundFX } from '../../lib/soundEffects.js';
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


// som do jogo: volume dos efeitos (só pra você) e liga/desliga a contagem final
function GameSound({ kind }) {
  const [aberto, setAberto] = useState(false);
  const [vol, setVol] = useState(getGameVolume);
  const [contagem, setContagem] = useState(() => localStorage.getItem('ronncord_game_contagem') !== 'off');
  const [lingua, setLingua] = useState(() => (localStorage.getItem('ronncord_geo_lingua') === 'en' ? 'en' : 'pt'));
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (!ref.current?.contains(e.target)) setAberto(false); };
    window.addEventListener('pointerdown', fora, true);
    return () => window.removeEventListener('pointerdown', fora, true);
  }, [aberto]);
  return (
    <div className="act-som" ref={ref}>
      <button type="button" className="act-btn" title="Som e idioma do jogo" onClick={() => setAberto(v => !v)}>
        {vol === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      {aberto && (
        <div className="act-som-pop">
          <b>Opções do jogo</b>
          <label>
            <span>Efeitos <i>{vol}%</i></span>
            <input
              type="range" min={0} max={100} step={5} value={vol}
              onChange={e => { const v = Number(e.target.value); setVol(v); setGameVolume(v); }}
              onPointerUp={() => kind === 'geo' && SoundFX.geo('chutou')}
            />
          </label>
          {kind === 'geo' && (
            <div className="act-lingua">
              <span>Idioma do mapa</span>
              <div>
                {[['pt', 'Português'], ['en', 'English']].map(([v, r]) => (
                  <button key={v} type="button" className={lingua === v ? 'ativo' : ''} onClick={() => { setLingua(v); localStorage.setItem('ronncord_geo_lingua', v); window.dispatchEvent(new Event('geo-lingua')); }}>{r}</button>
                ))}
              </div>
            </div>
          )}
          {kind === 'geo' && (
            <label className="act-som-check">
              <input type="checkbox" checked={contagem} onChange={e => { setContagem(e.target.checked); localStorage.setItem('ronncord_game_contagem', e.target.checked ? 'on' : 'off'); }} />
              Contagem nos últimos segundos
            </label>
          )}
          <small>Só muda pra você. O volume geral fica em Configurações &gt; Sons.</small>
        </div>
      )}
    </div>
  );
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
      <GameSound kind={kind} />
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

