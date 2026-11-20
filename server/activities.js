// ============================================================
//  ATIVIDADES DA CALL (estilo Atividades do Discord): GeoGuessr e Truco
//  - quem inicia vira o host; a call recebe um convite e só joga quem clicar em "Entrar"
//  - o SERVIDOR é o juiz: sorteia os locais, embaralha as cartas, confere cada jogada e conta os pontos
//    (ninguém vê a mão do outro nem a resposta do Geo antes da hora)
//  - estado público vai pra sala `voice:<canal>`; a mão de cada um vai só pra pessoa (`user:<id>`)
//  - saiu da call ou do jogo: o jogo continua pros outros (host passa pro próximo)
//  - ranking semanal do Geo na tabela activity_geo_scores (segunda a domingo, horário de Brasília)
//
//  Uso no server/index.js (depois de criar `voiceRooms`):
//    import { registerActivities } from './activities.js';
//    registerActivities({ app, io, db, authMiddleware, voiceRooms });
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO = JSON.parse(fs.readFileSync(path.join(__dirname, 'activities-geo.json'), 'utf8'));
const GEO_POR_ID = new Map(GEO.locais.map(l => [l.id, l]));

// foto que sumiu do Panoramax (apagada ou bloqueada) sai do sorteio sozinha:
// confere todas ao ligar e de 6 em 6 horas, devagar (4 de cada vez)
const GEO_MORTOS = new Set();
async function conferirFotos() {
  const fila = [...GEO.locais];
  const um = async () => {
    for (let l = fila.shift(); l; l = fila.shift()) {
      try {
        const r = await fetch(l.img, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
        if (r.status === 404 || r.status === 403 || r.status === 410) GEO_MORTOS.add(l.id);
        else if (r.ok) GEO_MORTOS.delete(l.id);
      } catch { /* rede falhou: não marca */ }
    }
  };
  await Promise.all([um(), um(), um(), um()]);
}
setTimeout(() => { conferirFotos(); setInterval(conferirFotos, 6 * 3600 * 1000).unref?.(); }, 15000).unref?.();

const KINDS = ['geo', 'truco'];

// ---------------- utilidades ----------------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
// mesma conta do GeoGuessr no mapa-múndi: 5000 em cima, ~2500 a 1000 km
const geoPontos = km => (km < 0.025 ? 5000 : Math.round(5000 * Math.exp(-km / 1492.7)));

// semana de segunda 00:00 a domingo 23:59 no horário de Brasília (UTC-3, sem horário de verão)
const BRT = 3 * 3600 * 1000;
function inicioSemana(ms = Date.now()) {
  const d = new Date(ms - BRT);
  const dia = (d.getUTCDay() + 6) % 7; // segunda = 0
  const meiaNoite = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dia * 86400000;
  return meiaNoite + BRT;
}

// ---------------- truco: regras ----------------
const TR_VALORES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const TR_NAIPES = ['o', 'e', 'c', 'p']; // ouros < espadas < copas < paus
const TR_REGRAS = {
  paulista: { nome: 'Paulista', base: 1, escada: [1, 3, 6, 9, 12], gritos: { 3: 'TRUCO!', 6: 'SEIS!', 9: 'NOVE!', 12: 'DOZE!' }, especial: 11 },
  mineiro: { nome: 'Mineiro', base: 2, escada: [2, 4, 6, 10, 12], gritos: { 4: 'TRUCO!', 6: 'SEIS!', 10: 'DEZ!', 12: 'DOZE!' }, especial: 10 }
};
const TR_FIXAS = { '4p': 3, '7c': 2, 'Ae': 1, '7o': 0 }; // zap, copas, espadilha, pica-fumo
const TR_MODOS = { 1: '1x1', 2: '2x2', 3: '3 jogadores' };
const trQtdModo = m => (m === 3 ? 3 : m * 2);
const trCartaOk = c => typeof c === 'string' && /^[4567QJKA23][oecp]$/.test(c);
function trManilha(c, variante, vira) {
  if (variante === 'mineiro') return c in TR_FIXAS;
  return !!vira && TR_VALORES[(TR_VALORES.indexOf(vira[0]) + 1) % 10] === c[0];
}
function trForca(c, variante, vira) {
  if (!trCartaOk(c)) return -1; // coberta
  if (variante === 'mineiro' && c in TR_FIXAS) return 100 + TR_FIXAS[c];
  if (variante === 'paulista' && trManilha(c, variante, vira)) return 100 + TR_NAIPES.indexOf(c[1]);
  return TR_VALORES.indexOf(c[0]);
}
// empate: 1ª empatou → quem ganhar a 2ª; 2ª ou 3ª empatou → quem ganhou a 1ª; três empates → ninguém
// (no de 3, se cada um levou uma, ganha quem fez a 1ª)
function trQuemLevou(v) {
  for (const t of new Set(v)) if (t !== -1 && v.filter(x => x === t).length >= 2) return t;
  if (v.length === 2) {
    if (v[0] === -1 && v[1] !== -1) return v[1];
    if (v[0] !== -1 && v[1] === -1) return v[0];
    return null;
  }
  if (v.length === 3) {
    const t = v.find(x => x !== -1);
    return t === undefined ? -1 : t;
  }
  return null;
}

export function registerActivities({ app, io, db, authMiddleware, voiceRooms }) {
  const games = new Map(); // `${channelId}:${kind}` -> jogo
  const presencaVista = new Map(); // id do jogo -> quem estava na call na última conferida
  const key = (channelId, kind) => `${channelId}:${kind}`;

  const ready = db.exec(`
    CREATE TABLE IF NOT EXISTS activity_geo_scores (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      rounds INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_geo_scores_srv ON activity_geo_scores (server_id, created_at)
  `).catch(err => console.error('[ATIVIDADES] não criou a tabela do ranking:', err));

  // ---------------- quem está na call ----------------
  function presentes(channelId) {
    const room = voiceRooms.get(channelId);
    const ids = new Set();
    if (room) for (const p of room.values()) ids.add(p.userId);
    return ids;
  }
  const socketNaCall = (channelId, socketId) => Boolean(voiceRooms.get(channelId)?.has(socketId));
  const perfil = u => ({ name: u.display_name || u.username || '?', avatarUrl: u.avatar_url || null, color: u.avatar_color || '#5865F2' });

  // ---------------- enviar ----------------
  function publico(g) {
    const { priv, saiu, ...rest } = g;
    const out = { ...rest };
    if (g.kind === 'geo') {
      out.restante = g.fimEm ? Math.max(0, g.fimEm - Date.now()) : 0;
      delete out.fimEm;
    }
    if (g.kind === 'truco') {
      const pres = presentes(g.channelId);
      out.ausentes = g.assentos.map((id, i) => (id && (!pres.has(id) || saiu.has(id)) ? i : -1)).filter(i => i >= 0);
    }
    return out;
  }
  function emitir(g, alvo) {
    const msg = { channelId: g.channelId, kind: g.kind, state: publico(g) };
    if (alvo) alvo.emit('act:state', msg);
    else io.to(`voice:${g.channelId}`).emit('act:state', msg);
  }
  function encerrar(g, aviso) {
    clearTimeout(g.priv?.timer);
    presencaVista.delete(g.id);
    if (games.get(key(g.channelId, g.kind)) === g) games.delete(key(g.channelId, g.kind));
    io.to(`voice:${g.channelId}`).emit('act:state', { channelId: g.channelId, kind: g.kind, state: null, id: g.id, aviso: aviso || '' });
  }
  const ativo = g => games.get(key(g.channelId, g.kind)) === g;

  // ============================================================
  //  GEO
  // ============================================================
  function geoNovo(channelId, user, opts = {}) {
    const total = [3, 5, 10].includes(Number(opts.rodadas)) ? Number(opts.rodadas) : 5;
    const tempo = [60, 90, 120, 0].includes(Number(opts.tempo)) ? Number(opts.tempo) : 90;
    return {
      kind: 'geo', id: crypto.randomUUID(), channelId, host: user.id, fase: 'sala', total, tempo, rodada: -1,
      jogadores: [user.id], placar: { [user.id]: 0 }, chutaram: [], local: null, resultado: null, fimEm: 0,
      nomes: { [user.id]: perfil(user) }, priv: { locais: [], chutes: {}, timer: null, jogaram: new Set([user.id]) }
    };
  }
  function geoComecar(g) {
    const lista = shuffle(GEO.locais.filter(l => !GEO_MORTOS.has(l.id)));
    const escolhidos = [], paises = new Set(); // um local por país
    for (const l of lista) if (escolhidos.length < g.total && !paises.has(l.cc)) { escolhidos.push(l.id); paises.add(l.cc); }
    g.priv.locais = escolhidos;
    g.total = escolhidos.length;
    g.rodada = -1;
    g.placar = Object.fromEntries(g.jogadores.map(id => [id, 0]));
    g.priv.jogaram = new Set(g.jogadores);
    geoProxima(g);
  }
  function geoProxima(g) {
    clearTimeout(g.priv.timer);
    if (g.rodada + 1 >= g.total) return geoTerminar(g);
    g.rodada++;
    g.fase = 'chutando';
    const l = GEO_POR_ID.get(g.priv.locais[g.rodada]);
    g.local = { id: l.id, img: l.img, hd: l.hd || null, p360: !!l.p360 }; // sem lat/lon: a resposta só vem no resultado
    g.chutaram = [];
    g.resultado = null;
    g.priv.chutes = {};
    g.fimEm = g.tempo ? Date.now() + g.tempo * 1000 : 0;
    // espera 1,5 s a mais pros chutes de última hora chegarem
    if (g.fimEm) g.priv.timer = setTimeout(() => { if (ativo(g) && g.fase === 'chutando') geoFecharRodada(g); }, g.tempo * 1000 + 1500);
    emitir(g);
  }
  const geoTodoMundoChutou = g => g.jogadores.length > 0 && g.jogadores.every(id => g.priv.chutes[id]);
  function geoFecharRodada(g) {
    if (g.fase !== 'chutando') return;
    clearTimeout(g.priv.timer);
    const l = GEO_POR_ID.get(g.local.id), chutes = {};
    for (const id of g.jogadores) {
      const c = g.priv.chutes[id];
      if (!c) { chutes[id] = null; continue; }
      const km = distanciaKm(c.lat, c.lon, l.lat, l.lon), pts = geoPontos(km);
      chutes[id] = { lat: c.lat, lon: c.lon, km: Math.round(km * 1000) / 1000, pts };
      g.placar[id] = (g.placar[id] || 0) + pts;
    }
    const pais = GEO.paises[l.cc] || null;
    g.fase = 'resultado';
    g.fimEm = 0;
    g.resultado = { local: { lat: l.lat, lon: l.lon, cc: l.cc, perto: l.perto, pais }, chutes };
    emitir(g);
  }
  async function geoTerminar(g) {
    clearTimeout(g.priv.timer);
    g.fase = 'fim';
    g.local = null;
    g.fimEm = 0;
    emitir(g);
    // cada um que jogou ganha a linha no ranking (o servidor conta, ninguém manda os próprios pontos)
    try {
      await ready;
      const ch = await db.get('SELECT server_id FROM channels WHERE id = ?', g.channelId);
      const agora = Date.now();
      for (const id of g.priv.jogaram) {
        const pts = Math.min(g.placar[id] || 0, g.total * 5000);
        await db.run(
          'INSERT INTO activity_geo_scores (id, server_id, channel_id, user_id, game_id, points, rounds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(), ch?.server_id || null, g.channelId, id, g.id, pts, g.total, agora
        );
      }
      io.to(`voice:${g.channelId}`).emit('act:ranking', { channelId: g.channelId });
    } catch (err) {
      console.error('[ATIVIDADES] ranking do geo não salvou:', err);
    }
  }
  function geoSairJogador(g, uid) {
    if (!g.jogadores.includes(uid)) return false;
    g.jogadores = g.jogadores.filter(id => id !== uid); // o placar fica guardado: se voltar, volta com os pontos
    if (g.host === uid) {
      if (!g.jogadores.length) { encerrar(g, 'Todo mundo saiu do GeoGuessr'); return true; }
      g.host = g.jogadores[0];
    }
    if (g.fase === 'chutando' && geoTodoMundoChutou(g)) geoFecharRodada(g);
    else emitir(g);
    return true;
  }
  function geoAcao(g, socket, m) {
    const uid = socket.user.id;
    const host = g.host === uid;
    if (m.a === 'opcoes') {
      if (!host || g.fase !== 'sala') return;
      if ([3, 5, 10].includes(Number(m.rodadas))) g.total = Number(m.rodadas);
      if ([60, 90, 120, 0].includes(Number(m.tempo))) g.tempo = Number(m.tempo);
      return emitir(g);
    }
    if (m.a === 'comecar') {
      if (!host || g.fase !== 'sala') return;
      return geoComecar(g);
    }
    if (m.a === 'chute') {
      if (g.fase !== 'chutando' || Number(m.rodada) !== g.rodada || !g.jogadores.includes(uid) || g.priv.chutes[uid]) return;
      const lat = Number(m.lat), lon = Number(m.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      g.priv.chutes[uid] = { lat, lon };
      g.chutaram = Object.keys(g.priv.chutes);
      if (geoTodoMundoChutou(g)) return geoFecharRodada(g);
      return emitir(g);
    }
    if (m.a === 'proxima') {
      if (!host || g.fase !== 'resultado') return;
      return geoProxima(g);
    }
    if (m.a === 'denovo') {
      if (!host || g.fase !== 'fim') return;
      const pres = presentes(g.channelId);
      g.jogadores = g.jogadores.filter(id => pres.has(id));
      if (!g.jogadores.includes(uid)) g.jogadores.unshift(uid);
      Object.assign(g, { id: crypto.randomUUID(), fase: 'sala', rodada: -1, chutaram: [], local: null, resultado: null, fimEm: 0 });
      g.placar = Object.fromEntries(g.jogadores.map(id => [id, 0]));
      return emitir(g);
    }
  }

  // ============================================================
  //  TRUCO
  // ============================================================
  function trNovo(channelId, user, opts = {}) {
    const modo = [1, 2, 3].includes(Number(opts.modo)) ? Number(opts.modo) : 2;
    const variante = opts.variante === 'mineiro' ? 'mineiro' : 'paulista';
    const n = trQtdModo(modo);
    return {
      kind: 'truco', id: crypto.randomUUID(), channelId, host: user.id, variante, modo,
      assentos: Array.from({ length: n }, (_, i) => (i ? null : user.id)),
      fase: 'sala', placar: [0, 0], mao: 0, pe: n - 1, vira: null, valor: TR_REGRAS[variante].base, pedido: null, naoPode: null,
      fora: [], vez: 0, vazas: [], jogadas: [], mostrando: false, ganhouVaza: null, especial: null, timeEspecial: 0,
      resumo: '', cartas: [], grito: '', gritoId: 0, log: [], vencedor: null,
      nomes: { [user.id]: perfil(user) }, saiu: new Set(), priv: { maos: [], timer: null }
    };
  }
  const trTime = (g, a) => (g.modo === 3 ? a : a % 2);
  const trNTimes = g => (g.modo === 3 ? 3 : 2);
  const trQtd = g => trQtdModo(g.modo);
  const trTimes = g => Array.from({ length: trNTimes(g) }, (_, t) => t);
  const trAtivos = g => Array.from({ length: trQtd(g) }, (_, a) => a).filter(a => !g.fora.includes(a));
  function trProximo(g, a) {
    const n = trQtd(g);
    for (let k = 1; k <= n; k++) { const b = (a + k) % n; if (!g.fora.includes(b)) return b; }
    return a;
  }
  const trNome = (g, uid) => g.nomes[uid]?.name || '?';
  const trNomeTime = (g, t) => g.assentos.filter((id, i) => id && trTime(g, i) === t).map(id => trNome(g, id)).join(' & ') || '—';
  function trLog(g, t) { g.log = [...g.log, t].slice(-6); }
  function trGritar(g, grito, texto) { g.grito = grito; g.gritoId++; trLog(g, texto); }

  function trEnviarMao(g, assento) {
    const uid = g.assentos[assento];
    if (!uid) return;
    const ferro = g.especial === 'ferro';
    const mao = g.priv.maos[assento] || [];
    const cartas = ferro ? mao.map(() => '?') : [...mao];
    let parceiro = null;
    if (g.especial === 'onze' && g.modo === 2 && trTime(g, assento) === g.timeEspecial) parceiro = [...(g.priv.maos[(assento + 2) % 4] || [])];
    io.to(`user:${uid}`).emit('act:hand', { channelId: g.channelId, kind: 'truco', id: g.id, mao: g.mao, cartas, parceiro });
  }
  function trDarCartas(g) {
    const R = TR_REGRAS[g.variante], n = trQtd(g);
    const baralho = [];
    for (const v of TR_VALORES) for (const s of TR_NAIPES) baralho.push(v + s);
    shuffle(baralho);
    g.priv.maos = Array.from({ length: n }, (_, i) => baralho.slice(i * 3, i * 3 + 3));
    g.vira = g.variante === 'paulista' ? baralho[n * 3] : null;
    g.mao++;
    g.pe = (g.pe + 1) % n;
    g.vez = (g.pe + 1) % n;
    Object.assign(g, { valor: R.base, pedido: null, naoPode: null, fora: [], vazas: [], jogadas: [], mostrando: false, ganhouVaza: null, grito: '', resumo: '' });
    g.cartas = Array(n).fill(3);
    const naMarca = g.placar.map((p, t) => (p === R.especial ? t : -1)).filter(t => t >= 0);
    g.especial = naMarca.length >= 2 ? 'ferro' : naMarca.length ? 'onze' : null;
    g.timeEspecial = naMarca[0] || 0;
    g.fase = g.especial === 'onze' ? 'decidir' : 'jogando';
    if (g.especial === 'ferro') trLog(g, `Mais de um na mão de ${R.especial}: mão de ferro, ninguém vê as cartas`);
    if (g.especial === 'onze') trLog(g, `${trNomeTime(g, g.timeEspecial)} na mão de ${R.especial}: decide se joga ou corre`);
    emitir(g);
    for (let i = 0; i < n; i++) trEnviarMao(g, i);
  }
  function trFimMao(g, times, pontos) {
    clearTimeout(g.priv.timer);
    g.pedido = null; g.mostrando = false; g.ganhouVaza = null;
    for (const t of times) g.placar[t] = Math.min(12, g.placar[t] + pontos);
    g.resumo = times.length ? times.map(t => `${trNomeTime(g, t)} +${pontos}`).join(' · ') : 'Ninguém pontua';
    trLog(g, g.resumo);
    const campeao = times.filter(t => g.placar[t] >= 12);
    if (campeao.length) {
      g.fase = 'fim';
      g.vencedor = campeao[0];
      trLog(g, `${trNomeTime(g, campeao[0])} ganhou o jogo!`);
      return emitir(g);
    }
    g.fase = 'fimMao';
    emitir(g);
    g.priv.timer = setTimeout(() => { if (ativo(g) && g.fase === 'fimMao') trDarCartas(g); }, 2600);
  }
  function trFecharVaza(g, ganhou, quem) {
    if (!ativo(g) || g.fase !== 'jogando') return;
    g.vazas.push(ganhou);
    trLog(g, ganhou === -1 ? `Rodada ${g.vazas.length}: empate` : `Rodada ${g.vazas.length}: ${trNome(g, g.assentos[quem])}`);
    const levou = trQuemLevou(g.vazas);
    if (levou === -1) { trLog(g, 'Três empates: ninguém pontua'); return trFimMao(g, [], 0); }
    if (levou !== null) return trFimMao(g, [levou], g.valor);
    const comecou = g.jogadas[0].a;
    g.jogadas = []; g.mostrando = false; g.ganhouVaza = null;
    g.vez = ganhou === -1 ? comecou : quem; // empatou: começa de novo quem abriu
    if (g.fora.includes(g.vez)) g.vez = trProximo(g, g.vez);
    emitir(g);
  }
  function trNovoHost(g) {
    const pres = presentes(g.channelId);
    return g.assentos.find(id => id && pres.has(id) && !g.saiu.has(id)) || null;
  }
  function trAcao(g, socket, m) {
    const uid = socket.user.id;
    const R = TR_REGRAS[g.variante], n = trQtd(g), eu = g.assentos.indexOf(uid);
    const host = g.host === uid;
    const pres = presentes(g.channelId);
    if (m.a === 'opcoes') {
      if (!host || g.fase !== 'sala') return;
      if (m.variante === 'paulista' || m.variante === 'mineiro') { g.variante = m.variante; g.valor = TR_REGRAS[g.variante].base; }
      const modo = Number(m.modo);
      if ([1, 2, 3].includes(modo) && modo !== g.modo) {
        const gente = g.assentos.filter(Boolean);
        g.modo = modo;
        g.assentos = Array.from({ length: trQtdModo(modo) }, (_, i) => gente[i] || null); // menos lugares: quem sobra levanta
        g.placar = Array(trNTimes(g)).fill(0);
        g.pe = trQtd(g) - 1;
      }
      return emitir(g);
    }
    if (m.a === 'sentar') {
      const i = Number(m.i);
      if (g.fase !== 'sala' || !Number.isInteger(i) || i < 0 || i >= n || g.assentos[i]) return;
      if (eu >= 0) g.assentos[eu] = null; // trocar de lugar
      g.assentos[i] = uid;
      g.saiu.delete(uid);
      g.nomes[uid] = perfil(socket.user);
      return emitir(g);
    }
    if (m.a === 'levantar') {
      if (g.fase !== 'sala' || eu < 0 || host) return;
      g.assentos[eu] = null;
      return emitir(g);
    }
    if (m.a === 'assumir') {
      // no meio do jogo: quem tá assistindo senta no lugar de quem saiu e pega a mão dele
      const i = Number(m.i);
      if (g.fase === 'sala' || eu >= 0 || !Number.isInteger(i) || i < 0 || i >= n) return;
      const dono = g.assentos[i];
      if (!dono || (pres.has(dono) && !g.saiu.has(dono))) return;
      g.saiu.delete(dono);
      g.assentos[i] = uid;
      g.nomes[uid] = perfil(socket.user);
      trLog(g, `${trNome(g, uid)} sentou no lugar de ${trNome(g, dono)}`);
      if (!g.host || !pres.has(g.host) || g.saiu.has(g.host) || g.host === dono) g.host = trNovoHost(g) || uid;
      emitir(g);
      return trEnviarMao(g, i);
    }
    if (m.a === 'comecar') {
      if (!host || g.fase !== 'sala') return;
      if (!g.assentos.every(id => id && pres.has(id))) return;
      g.placar = Array(trNTimes(g)).fill(0);
      g.mao = 0;
      g.pe = crypto.randomInt(n);
      g.log = [];
      g.vencedor = null;
      trLog(g, `Começou: ${R.nome}, ${TR_MODOS[g.modo]}`);
      return trDarCartas(g);
    }
    if (m.a === 'denovo') {
      if (!host || g.fase !== 'fim') return;
      if (m.perdedorSai) g.assentos = g.assentos.map((id, i) => (trTime(g, i) === g.vencedor ? id : null));
      g.assentos = g.assentos.map(id => (id && pres.has(id) && !g.saiu.has(id) ? id : null));
      g.saiu.clear();
      Object.assign(g, {
        id: crypto.randomUUID(), fase: 'sala', placar: Array(trNTimes(g)).fill(0), fora: [], resumo: '', mao: 0, vazas: [], jogadas: [],
        pedido: null, especial: null, vira: null, vencedor: null, log: [], grito: '', mostrando: false, ganhouVaza: null, cartas: []
      });
      g.priv.maos = [];
      return emitir(g);
    }
    if (eu < 0) return; // daqui pra baixo só quem tá sentado
    const time = trTime(g, eu), tres = g.modo === 3;
    if (m.a === 'decidir') {
      if (g.fase !== 'decidir' || time !== g.timeEspecial) return;
      if (m.jogar) {
        g.valor = R.escada[1];
        g.fase = 'jogando';
        trLog(g, `${trNome(g, uid)}: vamos jogar! A mão vale ${g.valor}`);
        return emitir(g);
      }
      trLog(g, `${trNome(g, uid)} correu da mão de ${R.especial}`);
      return trFimMao(g, trTimes(g).filter(t => t !== time), R.base);
    }
    if (g.fase !== 'jogando' || g.mostrando || g.fora.includes(eu)) return;
    if (m.a === 'truco') {
      if (g.pedido || eu !== g.vez || g.especial || g.naoPode === time) return;
      const prox = R.escada[R.escada.indexOf(g.valor) + 1];
      if (!prox) return;
      g.pedido = { time, valor: prox, por: eu, faltam: trAtivos(g).filter(a => trTime(g, a) !== time), aceitou: [] };
      trGritar(g, R.gritos[prox], `${trNome(g, uid)} pediu ${R.gritos[prox].replace('!', '')} (${prox})`);
      return emitir(g);
    }
    if (m.a === 'responder') {
      const p = g.pedido;
      if (!p || time === p.time || !p.faltam.includes(eu)) return;
      const prox = R.escada[R.escada.indexOf(p.valor) + 1];
      if (m.r === 'aumentar') {
        if (!prox) return;
        g.valor = p.valor;
        g.naoPode = null;
        g.pedido = { time, valor: prox, por: eu, faltam: trAtivos(g).filter(a => trTime(g, a) !== time), aceitou: [] };
        trGritar(g, R.gritos[prox], `${trNome(g, uid)} aumentou: ${R.gritos[prox].replace('!', '')} (${prox})`);
        return emitir(g);
      }
      if (m.r !== 'aceitar' && m.r !== 'correr') return;
      if (!tres) { // 2 times: um da dupla responde pelos dois
        if (m.r === 'aceitar') {
          g.valor = p.valor; g.naoPode = p.time; g.pedido = null;
          trLog(g, `${trNome(g, uid)} aceitou. A mão vale ${g.valor}`);
          return emitir(g);
        }
        trLog(g, `${trNome(g, uid)} correu`);
        return trFimMao(g, [p.time], g.valor);
      }
      // 3 jogadores: cada um responde por si; quem corre sai da mão
      p.faltam = p.faltam.filter(a => a !== eu);
      if (m.r === 'aceitar') p.aceitou = [...p.aceitou, eu];
      if (m.r === 'correr') { g.fora = [...g.fora, eu]; g.cartas[eu] = 0; trLog(g, `${trNome(g, uid)} correu (fora desta mão)`); }
      else trLog(g, `${trNome(g, uid)} aceitou`);
      if (p.faltam.length) return emitir(g);
      if (!p.aceitou.length) return trFimMao(g, [p.time], g.valor); // todo mundo correu
      g.valor = p.valor; g.naoPode = p.time; g.pedido = null;
      // quem jogou e depois correu não conta mais na vaza
      g.jogadas = g.jogadas.filter(j => !g.fora.includes(j.a));
      if (g.fora.includes(g.vez)) g.vez = trProximo(g, g.vez);
      trLog(g, `A mão vale ${g.valor}`);
      return emitir(g);
    }
    if (m.a === 'jogar') {
      if (g.pedido || eu !== g.vez) return;
      const mao = g.priv.maos[eu], i = Number(m.i);
      if (!Number.isInteger(i) || i < 0 || i >= mao.length) return;
      const coberta = !!m.coberta && g.vazas.length > 0 && g.especial !== 'ferro';
      const carta = mao.splice(i, 1)[0];
      g.jogadas.push({ a: eu, c: coberta ? 'X' : carta });
      g.cartas[eu] = mao.length;
      trEnviarMao(g, eu);
      if (g.jogadas.length < trAtivos(g).length) { g.vez = trProximo(g, g.vez); return emitir(g); }
      let maior = -2, quem = [];
      for (const j of g.jogadas) {
        const f = trForca(j.c, g.variante, g.vira);
        if (f > maior) { maior = f; quem = [j.a]; } else if (f === maior) quem.push(j.a);
      }
      const times = new Set(quem.map(a => trTime(g, a)));
      const ganhou = times.size > 1 ? -1 : trTime(g, quem[0]);
      g.mostrando = true;
      g.ganhouVaza = ganhou === -1 ? null : quem[0];
      emitir(g);
      clearTimeout(g.priv.timer);
      g.priv.timer = setTimeout(() => trFecharVaza(g, ganhou, quem[0]), 1600); // deixa todo mundo ver as cartas
    }
  }
  function trSairJogador(g, uid, explicito) {
    const i = g.assentos.indexOf(uid);
    if (i < 0) return false;
    if (g.fase === 'sala' || g.fase === 'fim') {
      g.assentos[i] = null;
      g.saiu.delete(uid);
    } else if (explicito) {
      g.saiu.add(uid); // no meio do jogo o lugar fica guardado: volta e pega a mão, ou alguém assume
      trLog(g, `${trNome(g, uid)} saiu da mesa`);
    }
    if (g.host === uid) {
      const novo = trNovoHost(g);
      if (!novo) { encerrar(g, 'Todo mundo saiu da mesa de truco'); return true; }
      g.host = novo;
    }
    emitir(g);
    return true;
  }

  // ============================================================
  //  presença: quem saiu da call sai do jogo (sem quebrar pros outros)
  // ============================================================
  function conferirPresenca(g) {
    if (!ativo(g)) return;
    const pres = presentes(g.channelId);
    const assinatura = [...pres].sort().join(',');
    if (presencaVista.get(g.id) === assinatura) return;
    presencaVista.set(g.id, assinatura);
    if (!pres.size) return encerrar(g, 'A call ficou vazia');
    if (g.kind === 'geo') {
      const foram = g.jogadores.filter(id => !pres.has(id));
      if (!foram.length) return emitir(g);
      g.jogadores = g.jogadores.filter(id => pres.has(id));
      if (!pres.has(g.host)) {
        if (!g.jogadores.length) return encerrar(g, 'Todo mundo do GeoGuessr saiu da call');
        g.host = g.jogadores[0];
      }
      if (g.fase === 'chutando' && geoTodoMundoChutou(g)) return geoFecharRodada(g);
      return emitir(g);
    }
    // truco: na sala o lugar libera; no meio do jogo fica guardado
    if (g.fase === 'sala') g.assentos = g.assentos.map(id => (id && pres.has(id) ? id : null));
    if (!pres.has(g.host) || g.saiu.has(g.host)) {
      const novo = trNovoHost(g);
      if (!novo) return encerrar(g, 'Todo mundo da mesa saiu da call');
      g.host = novo;
    }
    emitir(g);
  }
  function conferirCanal(channelId) {
    for (const kind of KINDS) {
      const g = games.get(key(channelId, kind));
      if (g) conferirPresenca(g);
    }
  }
  function conferirTudo() { for (const g of [...games.values()]) conferirPresenca(g); }
  const varredura = setInterval(conferirTudo, 4000);
  varredura.unref?.();

  // manda o estado de tudo que roda no canal pra quem acabou de entrar (espera a entrada na sala de voz)
  function mandarTudo(socket, channelId, tentativas = 0) {
    if (!socketNaCall(channelId, socket.id)) {
      if (tentativas < 12) setTimeout(() => mandarTudo(socket, channelId, tentativas + 1), 250);
      return;
    }
    for (const kind of KINDS) {
      const g = games.get(key(channelId, kind));
      if (!g) { socket.emit('act:state', { channelId, kind, state: null }); continue; }
      emitir(g, socket);
      if (g.kind === 'truco' && g.fase !== 'sala') {
        const i = g.assentos.indexOf(socket.user.id);
        if (i >= 0) trEnviarMao(g, i);
      }
    }
  }

  // ============================================================
  //  eventos de socket
  // ============================================================
  io.on('connection', socket => {
    if (!socket.user) return;
    const uid = socket.user.id;
    const naCall = channelId => typeof channelId === 'string' && socketNaCall(channelId, socket.id);

    socket.on('act:sync', p => { if (typeof p?.channelId === 'string') mandarTudo(socket, p.channelId); });

    socket.on('act:start', p => {
      const channelId = p?.channelId, kind = p?.kind;
      if (!naCall(channelId) || !KINDS.includes(kind)) return;
      const atual = games.get(key(channelId, kind));
      if (atual && atual.fase !== 'fim') {
        // já tem um rodando: entra nele em vez de abrir outro
        return entrar(atual);
      }
      if (atual) clearTimeout(atual.priv?.timer);
      const g = kind === 'geo' ? geoNovo(channelId, socket.user, p.opts) : trNovo(channelId, socket.user, p.opts);
      games.set(key(channelId, kind), g);
      presencaVista.set(g.id, [...presentes(channelId)].sort().join(','));
      emitir(g);
    });

    function entrar(g) {
      g.nomes[uid] = perfil(socket.user);
      if (g.kind === 'geo') {
        if (g.fase === 'fim') return emitir(g, socket);
        if (!g.jogadores.includes(uid)) {
          g.jogadores.push(uid); // no meio do jogo entra valendo (do zero, ou com o que tinha)
          g.placar[uid] = g.placar[uid] || 0;
          if (g.fase !== 'sala') g.priv.jogaram.add(uid);
        }
        return emitir(g);
      }
      // truco: senta no primeiro lugar livre (na sala) ou volta pro próprio lugar (no meio do jogo)
      const i = g.assentos.indexOf(uid);
      if (i >= 0) {
        g.saiu.delete(uid);
        emitir(g);
        if (g.fase !== 'sala') trEnviarMao(g, i);
        return;
      }
      if (g.fase === 'sala') {
        const livre = g.assentos.indexOf(null);
        if (livre >= 0) g.assentos[livre] = uid;
      }
      emitir(g);
    }

    socket.on('act:join', p => {
      if (!naCall(p?.channelId) || !KINDS.includes(p?.kind)) return;
      const g = games.get(key(p.channelId, p.kind));
      if (g) entrar(g);
    });

    socket.on('act:leave', p => {
      if (typeof p?.channelId !== 'string' || !KINDS.includes(p?.kind)) return;
      const g = games.get(key(p.channelId, p.kind));
      if (!g) return;
      if (g.kind === 'geo') geoSairJogador(g, uid);
      else trSairJogador(g, uid, true);
    });

    socket.on('act:end', p => {
      if (typeof p?.channelId !== 'string' || !KINDS.includes(p?.kind)) return;
      const g = games.get(key(p.channelId, p.kind));
      if (!g || g.host !== uid) return;
      const nome = socket.user.display_name || 'O host';
      encerrar(g, `${nome} encerrou ${g.kind === 'geo' ? 'o GeoGuessr' : 'o truco'}`);
    });

    socket.on('act:geo', m => {
      if (!naCall(m?.channelId)) return;
      const g = games.get(key(m.channelId, 'geo'));
      if (g) geoAcao(g, socket, m);
    });

    socket.on('act:truco', m => {
      if (!naCall(m?.channelId)) return;
      const g = games.get(key(m.channelId, 'truco'));
      if (g) trAcao(g, socket, m);
    });

    // entrou numa call: recebe o que tá rodando nela; saiu: confere os jogos (depois do index.js atualizar voiceRooms)
    socket.on('voice:join', p => {
      const channelId = typeof p === 'string' ? p : p?.channelId;
      if (typeof channelId === 'string') mandarTudo(socket, channelId);
      setTimeout(conferirTudo, 400);
    });
    socket.on('voice:leave', channelId => setTimeout(() => (typeof channelId === 'string' ? conferirCanal(channelId) : conferirTudo()), 150));
    socket.on('disconnect', () => setTimeout(conferirTudo, 150));
  });

  // ============================================================
  //  ranking semanal do Geo (por servidor)
  // ============================================================
  async function ranking(serverId, de, ate) {
    return db.all(
      `SELECT s.user_id, SUM(s.points) AS pontos, COUNT(*) AS partidas, SUM(s.rounds) AS rodadas, MAX(s.points) AS melhor,
              u.display_name, u.avatar_url, u.avatar_color
         FROM activity_geo_scores s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.server_id = ? AND s.created_at >= ? AND s.created_at < ?
        GROUP BY s.user_id, u.display_name, u.avatar_url, u.avatar_color
        ORDER BY pontos DESC
        LIMIT 30`,
      serverId, de, ate
    );
  }
  app?.get('/api/activities/geo/ranking/:channelId', authMiddleware, async (req, res) => {
    try {
      await ready;
      const ch = await db.get(
        'SELECT c.server_id FROM channels c JOIN server_members m ON m.server_id = c.server_id WHERE c.id = ? AND m.user_id = ?',
        req.params.channelId, req.user.id
      );
      if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
      const ini = inicioSemana();
      const num = r => ({ ...r, pontos: Number(r.pontos) || 0, partidas: Number(r.partidas) || 0, rodadas: Number(r.rodadas) || 0, melhor: Number(r.melhor) || 0 });
      const semana = (await ranking(ch.server_id, ini, ini + 7 * 86400000)).map(num);
      const passada = (await ranking(ch.server_id, ini - 7 * 86400000, ini)).map(num);
      res.json({ semana, campeao: passada[0] || null, inicio: ini });
    } catch (err) {
      console.error('[ATIVIDADES] ranking:', err);
      res.status(500).json({ error: 'Não deu pra carregar o ranking' });
    }
  });

  return { games };
}
