import React, { useEffect, useState } from 'react';
import { ActAvatar, ActTop } from './common.jsx';

// ============================================================
//  TRUCO na call: 1x1, 2x2 (parceiro de frente) ou 3 (cada um por si); Paulista ou Mineiro.
//  O servidor embaralha, dá as cartas e confere cada jogada; aqui só desenha e manda o que eu fiz.
// ============================================================

const VALORES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SIMBOLO = { o: '♦', e: '♠', c: '♥', p: '♣' };
const REGRAS = {
  paulista: { nome: 'Paulista', base: 1, escada: [1, 3, 6, 9, 12], gritos: { 3: 'TRUCO!', 6: 'SEIS!', 9: 'NOVE!', 12: 'DOZE!' }, especial: 11,
    resumo: 'vira uma carta e a seguinte é a manilha · mão vale 1' },
  mineiro: { nome: 'Mineiro', base: 2, escada: [2, 4, 6, 10, 12], gritos: { 4: 'TRUCO!', 6: 'SEIS!', 10: 'DEZ!', 12: 'DOZE!' }, especial: 10,
    resumo: 'manilhas fixas: 4♣ 7♥ A♠ 7♦ · mão vale 2' }
};
const FIXAS = { '4p': 3, '7c': 2, 'Ae': 1, '7o': 0 };
const CORES = ['#5b9bd5', '#e0a050', '#b07ad8'];
const MODOS = { 1: '1x1', 2: '2x2', 3: '3 jogadores' };
const cartaOk = c => typeof c === 'string' && /^[4567QJKA23][oecp]$/.test(c);
const qtdModo = m => (m === 3 ? 3 : m * 2);
const celular = () => window.matchMedia?.('(max-width: 640px)').matches;
function manilha(c, g) {
  if (!cartaOk(c)) return false;
  if (g.variante === 'mineiro') return c in FIXAS;
  return !!g.vira && VALORES[(VALORES.indexOf(g.vira[0]) + 1) % 10] === c[0];
}

function Carta({ c, g, grande, onClick, disabled, extra = '' }) {
  const Tag = onClick || disabled ? 'button' : 'div';
  const props = Tag === 'button' ? { type: 'button', onClick, disabled } : {};
  if (!cartaOk(c)) return <Tag className={`tr-carta virada ${grande ? 'g' : ''} ${extra}`} {...props} />;
  const verm = c[1] === 'o' || c[1] === 'c';
  return (
    <Tag className={`tr-carta ${verm ? 'verm' : ''} ${manilha(c, g) ? 'manilha' : ''} ${grande ? 'g' : ''} ${extra}`} {...props} title={`${c[0]}${SIMBOLO[c[1]]}`}>
      <span className="canto">{c[0]}<i>{SIMBOLO[c[1]]}</i></span>
      <span className="meio">{SIMBOLO[c[1]]}</span>
    </Tag>
  );
}

export function TrucoGame({ act, g, hand }) {
  if (g.fase === 'sala') return <TrucoSala act={act} g={g} />;
  return <TrucoMesa act={act} g={g} hand={hand} />;
}

const timeDe = (g, a) => (g.modo === 3 ? a : a % 2);
const nTimes = g => (g.modo === 3 ? 3 : 2);
const nomeTime = (act, g, t) => g.assentos.filter((id, i) => id && timeDe(g, i) === t).map(id => act.person(id, g).name).join(' & ') || '—';

function Opcoes({ act, g, pode }) {
  const b = (campo, val, ativo, titulo, sub) => (
    <button type="button" className={ativo ? 'ativo' : ''} disabled={!pode} onClick={() => act.truco('opcoes', { [campo]: val })}>
      {titulo}{sub && <small>{sub}</small>}
    </button>
  );
  return (
    <>
      <h3>Regras</h3>
      <div className="act-opcoes tr-opcoes">
        {b('variante', 'paulista', g.variante === 'paulista', 'Paulista', REGRAS.paulista.resumo)}
        {b('variante', 'mineiro', g.variante === 'mineiro', 'Mineiro', REGRAS.mineiro.resumo)}
      </div>
      <h3>Modo</h3>
      <div className="act-opcoes tr-opcoes">
        {b('modo', 1, g.modo === 1, '1x1')}
        {b('modo', 2, g.modo === 2, '2x2', 'parceiro senta de frente')}
        {b('modo', 3, g.modo === 3, '3 jogadores', 'cada um por si · quem corre sai da mão')}
      </div>
    </>
  );
}

// ----- mesa aberta: senta quem quiser, o host começa quando encher -----
function TrucoSala({ act, g }) {
  const host = g.host === act.myId;
  const meu = g.assentos.indexOf(act.myId);
  const n = qtdModo(g.modo);
  const naCall = id => act.people.some(p => p.userId === id);
  const lugar = i => {
    const id = g.assentos[i];
    if (!id) {
      return (
        <div key={i} className="tr-assento vago">
          <button type="button" onClick={() => act.truco('sentar', { i })}>{meu >= 0 ? 'Trocar pra cá' : '+ Sentar aqui'}</button>
        </div>
      );
    }
    const p = act.person(id, g);
    const sub = id === g.host ? 'host' : !naCall(id) ? 'saiu da call' : id === act.myId ? 'você' : '';
    return (
      <div key={i} className="tr-assento">
        <ActAvatar person={p} size={34} />
        <span className="nome">{p.name}{sub && <small>{sub}</small>}</span>
        {id === act.myId && !host && <button type="button" className="act-btn" onClick={() => act.truco('levantar')}>Levantar</button>}
      </div>
    );
  };
  const cheios = g.assentos.filter(id => id && naCall(id)).length;
  const fora = act.people.filter(p => !g.assentos.includes(p.userId));
  const times = Array.from({ length: nTimes(g) }, (_, t) => t);
  return (
    <>
      <ActTop act={act} kind="truco"><span className="act-tag">esperando jogadores</span></ActTop>
      <div className="act-meio">
        <div className="act-cartao">
          <Opcoes act={act} g={g} pode={host} />
          <h3>Lugares</h3>
          <div className="tr-times" style={{ gridTemplateColumns: `repeat(${nTimes(g)}, minmax(0, 1fr))` }}>
            {times.map(t => (
              <div key={t} className="tr-time" style={{ borderColor: CORES[t] }}>
                <h4>{g.modo === 2 ? `Dupla ${t + 1}` : `Jogador ${t + 1}`}</h4>
                {Array.from({ length: n }, (_, i) => i).filter(i => timeDe(g, i) === t).map(lugar)}
              </div>
            ))}
          </div>
          {host && fora.length > 0 && (
            <p className="act-vazio">Convite enviado pra call. Fora da mesa (e não precisam entrar): {fora.map(p => p.name).join(', ')}</p>
          )}
          {host ? (
            <button type="button" className="act-btn forte grande" disabled={cheios !== n} onClick={() => act.truco('comecar')}>
              {cheios === n ? 'Começar' : `Começar (${cheios}/${n} sentados)`}
            </button>
          ) : (
            <p className="act-vazio">{meu >= 0 ? `Você sentou. ${act.person(g.host, g).name} começa quando a mesa encher.` : 'Escolha um lugar livre pra jogar, ou só assista.'}</p>
          )}
        </div>
      </div>
    </>
  );
}

// ----- a mesa rodando -----
function TrucoMesa({ act, g, hand }) {
  const [coberta, setCoberta] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [gritoVisto, setGritoVisto] = useState('');
  const [verLado, setVerLado] = useState(false);
  const R = REGRAS[g.variante];
  const n = qtdModo(g.modo);
  const meu = g.assentos.indexOf(act.myId);
  const sentado = meu >= 0 && !(g.ausentes || []).includes(meu);
  const base = sentado ? meu : 0;
  const meuTime = sentado ? timeDe(g, meu) : 0;
  const ausente = a => (g.ausentes || []).includes(a);
  const minhaMao = hand?.cartas || [];
  const parceiro = hand?.parceiro || null;

  // chegou estado novo: libera o clique; mão nova: desvira o "coberta"
  useEffect(() => { setEsperando(false); }, [g, hand]);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setEsperando(false), 3000); // o servidor recusou: libera de novo
    return () => clearTimeout(t);
  }, [esperando]);
  useEffect(() => { setCoberta(false); }, [g.mao]);
  const gritoId = `${g.id}:${g.gritoId}`;
  useEffect(() => {
    if (!g.grito || !g.gritoId) return;
    const t = setTimeout(() => setGritoVisto(gritoId), 1400);
    return () => clearTimeout(t);
  }, [gritoId]);

  // posições em volta da mesa, a partir de mim (a vez anda pra direita)
  const posicao = a => {
    const d = (a - base + n) % n;
    return n === 2 ? (d ? 'cima' : 'baixo') : n === 3 ? ['baixo', 'dir', 'esq'][d] : ['baixo', 'dir', 'cima', 'esq'][d];
  };
  const lugares = [];
  for (let a = 0; a < n; a++) {
    const id = g.assentos[a], pos = posicao(a);
    if (pos === 'baixo' && sentado) continue; // eu: minhas cartas ficam embaixo
    const p = act.person(id, g);
    const vez = g.fase === 'jogando' && !g.mostrando && !g.pedido && g.vez === a;
    const costas = <div className="tr-costas">{Array.from({ length: g.cartas?.[a] || 0 }, (_, k) => <span key={k} className="c" />)}</div>;
    const info = (
      <div className="info">
        <ActAvatar person={p} size={22} />
        <span className="tr-nome">{p.name}</span>
        <span className="dot" style={{ background: CORES[timeDe(g, a)] }} />
        {vez && <em>jogando...</em>}
        {g.fora.includes(a) && <em>correu</em>}
        {g.pedido?.faltam?.includes(a) && g.modo === 3 && <em>respondendo...</em>}
        {ausente(a) && <em>saiu · esperando</em>}
      </div>
    );
    lugares.push(
      <div key={a} className={`tr-lugar tr-l-${pos} ${vez ? 'vez' : ''} ${ausente(a) ? 'fora' : ''}`}>
        {pos === 'cima' ? <>{costas}{info}</> : <>{info}{costas}</>}
      </div>
    );
  }
  const jogadas = g.jogadas.map((j, k) => (
    <div key={k} className={`tr-jogada j-${posicao(j.a)} ${g.ganhouVaza === j.a ? 'ganhou' : ''}`}><Carta c={j.c} g={g} /></div>
  ));
  const vira = g.variante === 'paulista' && g.vira ? (
    <div className="tr-vira">
      <Carta c={g.vira} g={g} />
      <div className="rot">Vira: {g.vira[0]}<br />Manilha: <b>{VALORES[(VALORES.indexOf(g.vira[0]) + 1) % 10]}</b> ★</div>
    </div>
  ) : null;
  const grito = g.grito && g.gritoId && gritoVisto !== gritoId ? <div className="tr-grito" key={gritoId}>{g.grito}</div> : null;

  // caixa no meio: responder truco, mão de onze, fim de mão, fim de jogo, lugar vago
  let caixa = null;
  const p = g.pedido;
  const vagos = (g.ausentes || []);
  if (!sentado && vagos.length && g.fase !== 'fim') {
    caixa = (
      <div className="tr-caixa">
        <p>{vagos.map(a => act.person(g.assentos[a], g).name).join(' e ')} saiu. A mesa espera voltar, ou alguém assume o lugar.</p>
        <div className="acoes">
          {vagos.map(a => (
            <button key={a} type="button" className="act-btn verde" onClick={() => act.truco('assumir', { i: a })}>
              Assumir o lugar de {act.person(g.assentos[a], g).name}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (g.fase === 'jogando' && p) {
    const quem = act.person(g.assentos[p.por], g).name;
    const prox = R.escada[R.escada.indexOf(p.valor) + 1];
    const tres = g.modo === 3;
    if (sentado && meuTime !== p.time && p.faltam.includes(meu)) {
      caixa = (
        <div className="tr-caixa">
          <p><b>{quem}</b> pediu <b>{R.gritos[p.valor]}</b> Agora a mão vale {p.valor}.</p>
          <div className="acoes">
            <button type="button" className="act-btn verde" onClick={() => act.truco('responder', { r: 'aceitar' })}>Aceitar ({p.valor})</button>
            <button type="button" className="act-btn vermelho" onClick={() => act.truco('responder', { r: 'correr' })}>
              {tres ? 'Correr (você sai desta mão)' : `Correr (eles levam ${g.valor})`}
            </button>
            {prox && <button type="button" className="act-btn forte" onClick={() => act.truco('responder', { r: 'aumentar' })}>{R.gritos[prox]} ({prox})</button>}
          </div>
        </div>
      );
    } else {
      caixa = (
        <div className="tr-caixa">
          <p><b>{quem}</b> pediu <b>{R.gritos[p.valor]}</b> Esperando {p.faltam.map(a => act.person(g.assentos[a], g).name).join(' & ') || 'a resposta'}...</p>
        </div>
      );
    }
  } else if (g.fase === 'decidir') {
    if (sentado && meuTime === g.timeEspecial) {
      caixa = (
        <div className="tr-caixa">
          <p>Mão de <b>{R.especial}</b>: olhe suas cartas{g.modo === 2 ? ' e as do parceiro' : ''}. Jogar (vale <b>{R.escada[1]}</b>) ou correr ({g.modo === 3 ? 'cada um dos outros leva' : 'eles levam'} {R.base})?</p>
          {parceiro?.length > 0 && <div className="parceiro">Parceiro: {parceiro.map((c, k) => <Carta key={k} c={c} g={g} />)}</div>}
          <div className="acoes">
            <button type="button" className="act-btn verde" onClick={() => act.truco('decidir', { jogar: true })}>Jogar ({R.escada[1]})</button>
            <button type="button" className="act-btn vermelho" onClick={() => act.truco('decidir', { jogar: false })}>Correr (+{R.base} pra {g.modo === 3 ? 'cada um dos outros' : 'eles'})</button>
          </div>
        </div>
      );
    } else {
      caixa = <div className="tr-caixa"><p>Mão de <b>{R.especial}</b>: {nomeTime(act, g, g.timeEspecial)} {g.modo === 2 ? 'decidem' : 'decide'} se joga ou corre...</p></div>;
    }
  } else if (g.fase === 'fimMao') {
    caixa = <div className="tr-caixa meio"><p><b>{g.resumo}</b></p><p className="tr-sub">Próxima mão já vem...</p></div>;
  } else if (g.fase === 'fim') {
    const ganhei = sentado && meuTime === g.vencedor;
    caixa = (
      <div className="tr-caixa meio">
        <p className="tr-ganhou">{ganhei ? '🏆 Você ganhou!' : <>🏆 <b>{nomeTime(act, g, g.vencedor)}</b> ganhou</>}</p>
        <p>{g.placar.join(' × ')}</p>
        {g.host === act.myId ? (
          <div className="acoes">
            <button type="button" className="act-btn verde" onClick={() => act.truco('denovo', { perdedorSai: false })}>Jogar de novo (mesmos lugares)</button>
            <button type="button" className="act-btn forte" onClick={() => act.truco('denovo', { perdedorSai: true })}>Quem ganhou fica (quem perdeu levanta)</button>
          </div>
        ) : (
          <p className="tr-sub">{act.person(g.host, g).name} escolhe o que vem agora</p>
        )}
      </div>
    );
  }

  // lado: placar, rodadas, ordem das cartas, o que aconteceu
  const nomeT = t => (g.modo === 2 ? (sentado ? (t === meuTime ? 'Nós' : 'Eles') : `Dupla ${t + 1}`) : nomeTime(act, g, t));
  const ordem = [meuTime, ...Array.from({ length: nTimes(g) }, (_, t) => t).filter(t => t !== meuTime)];
  const ajuda = g.variante === 'paulista'
    ? <><b>Ordem das cartas</b><br />★ manilhas (a seguinte da vira): ♣ &gt; ♥ &gt; ♠ &gt; ♦<br />depois 3 &gt; 2 &gt; A &gt; K &gt; J &gt; Q &gt; 7 &gt; 6 &gt; 5 &gt; 4</>
    : <><b>Ordem das cartas</b><br />★ 4♣ (zap) &gt; 7♥ &gt; A♠ &gt; 7♦<br />depois 3 &gt; 2 &gt; A &gt; K &gt; J &gt; Q &gt; 7 &gt; 6 &gt; 5 &gt; 4</>;
  const placar = (
    <div className="tr-placar">
      <h3>Placar (até 12)</h3>
      {ordem.map(t => (
        <div key={t} className="tr-pl-time">
          <span className="barra" style={{ background: CORES[t] }} />
          <span className="nomes"><b>{nomeT(t)}</b>{g.modo === 2 && <><br /><small>{nomeTime(act, g, t)}</small></>}</span>
          <span className="pts">{g.placar[t]}</span>
        </div>
      ))}
      <div className="tr-vazas">
        {[0, 1, 2].map(i => {
          const v = g.vazas[i];
          if (v === undefined) return <span key={i}>{i + 1}</span>;
          if (v === -1) return <span key={i} title="empate">=</span>;
          return <span key={i} style={{ background: CORES[v], borderColor: CORES[v], color: '#fff' }}>{i + 1}</span>;
        })}
        <span className="tr-vale">vale <b>{g.valor}</b></span>
      </div>
    </div>
  );
  const lado = (
    <div className={`tr-lado ${verLado ? 'aberto' : ''}`}>
      {placar}
      <div className="tr-placar tr-ajuda">{ajuda}</div>
      {g.log.length > 0 && <div className="tr-placar tr-log">{g.log.slice().reverse().map((l, k) => <div key={k}>{l}</div>)}</div>}
    </div>
  );

  // minhas cartas + botões
  let mao;
  if (sentado) {
    const minhaVez = g.fase === 'jogando' && !g.mostrando && !g.pedido && g.vez === meu && !esperando;
    const prox = R.escada[R.escada.indexOf(g.valor) + 1];
    const podeTruco = minhaVez && !g.especial && g.naoPode !== meuTime && prox;
    const podeCobrir = minhaVez && g.vazas.length > 0 && g.especial !== 'ferro';
    const jogar = i => {
      if (!minhaVez) return;
      setEsperando(true);
      act.truco('jogar', { i, coberta: podeCobrir && coberta });
      setCoberta(false);
    };
    let status = null;
    if (minhaVez) status = <p className="tr-status sua">Sua vez: {celular() ? 'toque' : 'clique'} numa carta{g.especial === 'ferro' ? ' (às cegas!)' : ''}</p>;
    else if (g.fora.includes(meu) && g.fase === 'jogando') status = <p className="tr-status">Você correu: fora desta mão</p>;
    else if (g.fase === 'jogando' && !g.pedido && !g.mostrando) status = <p className="tr-status">Vez de {act.person(g.assentos[g.vez], g).name}{ausente(g.vez) ? ' (saiu, esperando voltar)' : ''}</p>;
    mao = (
      <>
        <div className={`tr-mao ${minhaVez ? 'minha-vez' : ''}`}>
          <div className="cartas">
            {minhaMao.map((c, i) => <Carta key={`${c}${i}`} c={c} g={g} grande onClick={minhaVez ? () => jogar(i) : undefined} disabled={!minhaVez} />)}
          </div>
          <div className="botoes">
            {podeTruco && <button type="button" className="tr-btn-truco" onClick={() => { setEsperando(true); act.truco('truco'); }}>{R.gritos[prox]} ({prox})</button>}
            {podeCobrir && (
              <button type="button" className={`tr-toggle ${coberta ? 'ligado' : ''}`} onClick={() => setCoberta(!coberta)}>
                <span className="chave" />Jogar coberta
              </button>
            )}
          </div>
        </div>
        {status}
      </>
    );
  } else {
    mao = <p className="tr-status">Você está assistindo. {g.fase === 'fim' ? '' : 'As cartas na mão ficam escondidas.'}</p>;
  }

  const tag = `${R.nome} · ${MODOS[g.modo]} · mão ${g.mao}${g.especial === 'ferro' ? ' · de ferro' : ''}`;
  return (
    <>
      <ActTop act={act} kind="truco" right={<button type="button" className="act-btn tr-ver-lado" onClick={() => setVerLado(!verLado)}>{verLado ? 'Mesa' : 'Placar'}</button>}>
        <span className="act-tag">{tag}</span>
      </ActTop>
      <div className="tr-placar-mini">
        {ordem.map(t => <span key={t} style={{ borderColor: CORES[t] }}>{nomeT(t)} <b>{g.placar[t]}</b></span>)}
        <span>vale <b>{g.valor}</b></span>
      </div>
      <div className="tr-area">
        <div className="tr-mesa">{lugares}{jogadas}{vira}{grito}{caixa}</div>
        {lado}
      </div>
      {mao}
    </>
  );
}
