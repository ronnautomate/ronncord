import React, { useEffect, useRef } from 'react';
import { Rocket, X, Users } from 'lucide-react';
import { ACTIVITIES, isParticipant } from './useActivities.js';
import { CAPAS, ActAvatar, ActTop, playersOf } from './common.jsx';
import { GeoGame } from './GeoGame.jsx';
import { TrucoGame } from './TrucoGame.jsx';
import './activities.css';

// ============================================================
//  Peças das Atividades na call (estilo Discord):
//  - ActivitiesButton: foguete na barra da call
//  - ActivitiesPanel: painel com os cards dos jogos (capa, nome, quantos jogam, quem tá jogando)
//  - ActivityInvites: faixa de convite no topo da call ("Entrar" / "Agora não")
//  - ActivityStage: o jogo no palco da call (no lugar da tela grande; câmeras na coluna do lado)
// ============================================================

export function ActivitiesButton({ act }) {
  const rolando = ['geo', 'truco'].some(k => act.games[k] && act.games[k].fase !== 'fim');
  return (
    <button
      type="button"
      className={`act-launch ${act.panel || act.open ? 'on' : ''}`}
      title="Atividades (jogos da call)"
      onClick={e => { e.stopPropagation(); act.setPanel(!act.panel); }}
    >
      <Rocket size={22} />
      {rolando && <span className="act-launch-dot" />}
    </button>
  );
}

export function ActivitiesPanel({ act }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!act.panel) return;
    const close = e => { if (!ref.current?.contains(e.target)) act.setPanel(false); };
    const onKey = e => e.key === 'Escape' && act.setPanel(false);
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [act.panel]);
  if (!act.panel) return null;
  return (
    <div className="act-panel" ref={ref} onClick={e => e.stopPropagation()}>
      <div className="act-panel-head">
        <div>
          <b>Atividades</b>
          <small>Jogue com a call. Ninguém é puxado: quem quiser, entra.</small>
        </div>
        <button type="button" className="act-x" title="Fechar" onClick={() => act.setPanel(false)}><X size={18} /></button>
      </div>
      <div className="act-cards">
        {ACTIVITIES.map(a => {
          const g = act.games[a.kind];
          const rolando = g && g.fase !== 'fim';
          const dentro = rolando && isParticipant(a.kind, g, act.myId);
          const quem = playersOf(a.kind, g);
          const label = !rolando ? 'Iniciar' : dentro ? 'Abrir' : a.kind === 'truco' && g.fase !== 'sala' ? 'Assistir' : 'Entrar';
          return (
            <button key={a.kind} type="button" className="act-card" onClick={() => act.launch(a.kind)}>
              <span className="act-card-capa" style={{ backgroundImage: `url("${CAPAS[a.kind]}")` }}>
                {rolando && <span className="act-card-live">AO VIVO</span>}
              </span>
              <span className="act-card-body">
                <b>{a.name}</b>
                <small><Users size={13} /> {a.players} jogadores</small>
                {rolando ? (
                  <span className="act-card-now">
                    <span className="act-faces">{quem.slice(0, 4).map(id => <ActAvatar key={id} person={act.person(id, g)} size={20} />)}</span>
                    {quem.length} jogando
                  </span>
                ) : (
                  <small className="act-card-desc">{a.desc}</small>
                )}
                <span className={`act-card-cta ${rolando && !dentro ? 'verde' : ''}`}>{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityInvites({ act }) {
  const faixas = [];
  for (const a of ACTIVITIES) {
    const g = act.games[a.kind];
    if (!g || g.fase === 'fim' || act.open === a.kind || act.isDismissed(g.id) || g.host === act.myId) continue;
    if (isParticipant(a.kind, g, act.myId)) continue;
    const host = act.person(g.host, g);
    const quem = playersOf(a.kind, g);
    let titulo, sub, botao = 'Entrar';
    if (a.kind === 'geo') {
      titulo = g.fase === 'sala' ? `${host.name} abriu uma sala de GeoGuessr` : `${host.name} está jogando GeoGuessr`;
      sub = `${g.total} rodadas · ${quem.length} jogando · ${g.fase === 'sala' ? `${host.name} começa quando quiser` : 'dá pra entrar no meio'}`;
    } else {
      const livres = g.assentos.filter(x => !x).length;
      const vagos = (g.ausentes || []).length;
      const regra = `${g.variante === 'mineiro' ? 'Mineiro' : 'Paulista'} · ${g.modo === 3 ? '3 jogadores' : g.modo === 1 ? '1x1' : '2x2'}`;
      if (g.fase === 'sala') {
        if (!livres) continue;
        titulo = `${host.name} abriu uma mesa de truco`;
        sub = `${regra} · ${livres} lugar${livres > 1 ? 'es' : ''} livre${livres > 1 ? 's' : ''} · começa quando a mesa encher`;
      } else {
        titulo = `${host.name} está jogando truco`;
        sub = `${regra} · ${vagos ? `${vagos} lugar vago: dá pra assumir` : 'dá pra assistir'}`;
        botao = 'Assistir';
      }
    }
    faixas.push(
      <div key={a.kind} className="act-invite">
        <span className="act-invite-capa" style={{ backgroundImage: `url("${CAPAS[a.kind]}")` }} />
        <div className="act-invite-txt">
          <b>{titulo}</b>
          <small>{sub}</small>
        </div>
        <span className="act-faces">{quem.slice(0, 5).map(id => <ActAvatar key={id} person={act.person(id, g)} size={24} />)}</span>
        <button type="button" className="act-btn verde" onClick={() => (botao === 'Assistir' ? act.watch(a.kind) : act.join(a.kind))}>{botao}</button>
        <button type="button" className="act-btn" onClick={() => act.dismiss(g.id)}>Agora não</button>
      </div>
    );
  }
  return (
    <>
      {act.toast && <div className="act-toast">{act.toast}</div>}
      {faixas.length > 0 && <div className="act-invites">{faixas}</div>}
    </>
  );
}

export function ActivityStage({ act }) {
  const kind = act.open;
  const g = kind ? act.games[kind] : null;
  return (
    <div className="act-stage"><div className="act-inner">
      {!g ? (
        <>
          <ActTop act={act} kind={kind || 'geo'} />
          <div className="act-loading">Carregando...</div>
        </>
      ) : kind === 'geo' ? (
        <GeoGame act={act} g={g} />
      ) : (
        <TrucoGame act={act} g={g} hand={act.hand && act.hand.id === g.id ? act.hand : null} />
      )}
    </div></div>
  );
}
