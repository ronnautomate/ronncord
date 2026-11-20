import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
//  Atividades da call (GeoGuessr e Truco): estado que vem do servidor (server/activities.js)
//  - games: { geo, truco } = estado público de cada jogo rodando nesta call (ou null)
//  - hand: minha mão no truco (só eu recebo)
//  - open: qual jogo está no MEU palco ('geo' | 'truco' | null). Ninguém é puxado:
//    só abre sozinho pra quem entrou no lobby/mesa e a partida começou
//  - o que eu abri e os convites que dispensei ficam guardados enquanto a aba estiver aberta
//    (trocar pro chat e voltar pra call não perde nada)
// ============================================================

export const ACTIVITIES = [
  { kind: 'geo', name: 'GeoGuessr', players: '1 ou mais', desc: 'Adivinhe onde a foto de rua foi tirada' },
  { kind: 'truco', name: 'Truco', players: '2, 3 ou 4', desc: 'Paulista ou Mineiro, 1x1, 2x2 ou 3' }
];

const memo = { open: {}, dismissed: new Set() }; // por aba: canal -> jogo aberto; ids de convites dispensados

// som curtinho de convite (sem arquivo)
function ding() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch { /* sem som, tudo bem */ }
}

// estou jogando? (geo: na lista; truco: sentado e não saí da mesa)
export function isParticipant(kind, g, myId) {
  if (!g || !myId) return false;
  if (kind === 'geo') return g.jogadores.includes(myId);
  const i = g.assentos.indexOf(myId);
  return i >= 0 && !(g.ausentes || []).includes(i);
}

export function useActivities({ socket, channelId, people }) {
  const myId = people.find(p => p.isMe)?.userId || null;
  const [games, setGames] = useState({ geo: null, truco: null });
  const [hand, setHand] = useState(null);
  const [open, setOpenState] = useState(() => memo.open[channelId] || null);
  const [panel, setPanel] = useState(false);
  const [dismissed, setDismissed] = useState(() => new Set(memo.dismissed));
  const [toast, setToast] = useState('');
  const [rankingTick, setRankingTick] = useState(0);
  const gamesRef = useRef(games);
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const setOpen = useCallback(kind => {
    memo.open[channelId] = kind;
    setOpenState(kind);
  }, [channelId]);

  // trocou de call: começa do zero
  useEffect(() => {
    gamesRef.current = { geo: null, truco: null };
    setGames(gamesRef.current);
    setHand(null);
    setOpenState(memo.open[channelId] || null);
  }, [channelId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!socket || !channelId) return;
    const onState = ({ channelId: c, kind, state, aviso }) => {
      if (c !== channelId || !['geo', 'truco'].includes(kind)) return;
      const antes = gamesRef.current[kind];
      const me = myIdRef.current;
      gamesRef.current = { ...gamesRef.current, [kind]: state };
      setGames(gamesRef.current);
      if (!state) {
        if (kind === 'truco') setHand(null);
        if (memo.open[channelId] === kind) setOpen(null);
        if (antes && aviso) setToast(aviso);
        return;
      }
      const novo = !antes || antes.id !== state.id;
      if (kind === 'truco' && novo) setHand(null);
      // convite novo pra quem não abriu: tocar um som (a faixa aparece no topo da call)
      if (novo && state.host !== me && !isParticipant(kind, state, me) && state.fase !== 'fim' && (!antes || antes.fase === 'fim')) ding();
      // eu entrei no lobby/mesa e a partida começou: abre sozinho (eu escolhi jogar)
      const comecou = state.fase !== 'sala' && state.fase !== 'fim' && (novo || antes.fase === 'sala');
      if (comecou && isParticipant(kind, state, me)) setOpen(kind);
    };
    const onHand = h => {
      if (h?.channelId !== channelId || h.kind !== 'truco') return;
      setHand({ id: h.id, mao: h.mao, cartas: Array.isArray(h.cartas) ? h.cartas : [], parceiro: Array.isArray(h.parceiro) ? h.parceiro : null });
    };
    const onRanking = r => { if (r?.channelId === channelId) setRankingTick(t => t + 1); };
    const sync = () => socket.emit('act:sync', { channelId });
    socket.on('act:state', onState);
    socket.on('act:hand', onHand);
    socket.on('act:ranking', onRanking);
    socket.on('connect', sync);
    sync();
    return () => {
      socket.off('act:state', onState);
      socket.off('act:hand', onHand);
      socket.off('act:ranking', onRanking);
      socket.off('connect', sync);
    };
  }, [socket, channelId, setOpen]);

  // o jogo que eu abri acabou/sumiu: volta pras câmeras
  useEffect(() => {
    if (open && !games[open]) {
      const t = setTimeout(() => { if (!gamesRef.current[open] && memo.open[channelId] === open) setOpen(null); }, 1500);
      return () => clearTimeout(t);
    }
  }, [open, games, channelId, setOpen]);

  const emit = useCallback((ev, payload) => socket?.emit(ev, { channelId, ...payload }), [socket, channelId]);

  const act = {
    myId,
    channelId,
    people,
    games,
    hand,
    open,
    panel,
    toast,
    rankingTick,
    setPanel,
    // nome/foto de alguém (quem saiu da call continua com nome pelo que o servidor guardou)
    person(uid, g) {
      const p = people.find(x => x.userId === uid);
      const n = g?.nomes?.[uid];
      return {
        userId: uid,
        name: p?.name || n?.name || '?',
        avatarUrl: p?.avatarUrl || n?.avatarUrl || null,
        color: p?.color || n?.color || '#5865F2',
        inCall: Boolean(p)
      };
    },
    // card do painel: abre um novo (vira host), entra no que já roda ou só mostra
    launch(kind, opts) {
      setPanel(false);
      const g = games[kind];
      if (g && g.fase !== 'fim') {
        if (!isParticipant(kind, g, myId)) emit('act:join', { kind });
      } else {
        emit('act:start', { kind, opts });
      }
      setOpen(kind);
    },
    join(kind) {
      emit('act:join', { kind });
      setOpen(kind);
    },
    watch(kind) { setOpen(kind); },
    leave(kind) {
      const g = games[kind];
      if (g) {
        emit('act:leave', { kind });
        memo.dismissed.add(g.id);
        setDismissed(new Set(memo.dismissed));
      }
      if (open === kind) setOpen(null);
    },
    minimize() { setOpen(null); },
    end(kind) { emit('act:end', { kind }); },
    dismiss(id) {
      memo.dismissed.add(id);
      setDismissed(new Set(memo.dismissed));
    },
    isDismissed: id => dismissed.has(id),
    geo(a, extra = {}) { emit('act:geo', { a, ...extra }); },
    truco(a, extra = {}) { emit('act:truco', { a, ...extra }); }
  };
  return act;
}
