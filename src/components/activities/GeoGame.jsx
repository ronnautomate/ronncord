import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, resolveAssetUrl } from '../../lib/api.js';
import { ActAvatar, ActTop } from './common.jsx';
import { SoundFX } from '../../lib/soundEffects.js';

// ============================================================
//  GEOGUESSR na call: todo mundo que entrou vê a mesma foto de rua e chuta no mapa.
//  Fotos do Panoramax (grátis, sem chave). Mapa: Leaflet + OpenStreetMap. Foto 360°: Pannellum.
//  O servidor sorteia os locais, conta o tempo e soma os pontos (até 5.000 por rodada).
// ============================================================

const LIBS = {
  css: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css'],
  js: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js']
};
let libsPromise = null;
function loadLibs() {
  if (window.L && window.pannellum) return Promise.resolve();
  if (libsPromise) return libsPromise;
  for (const href of LIBS.css) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }
  const one = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => fail(new Error('não carregou ' + src.split('/')[4]));
    document.head.appendChild(s);
  });
  libsPromise = Promise.all(LIBS.js.map(one)).catch(e => { libsPromise = null; throw e; });
  return libsPromise;
}
function useLibs() {
  const [state, setState] = useState(window.L && window.pannellum ? 'ok' : 'carregando');
  useEffect(() => {
    if (state === 'ok') return;
    let vivo = true;
    loadLibs().then(() => vivo && setState('ok')).catch(e => vivo && setState(e.message));
    return () => { vivo = false; };
  }, []);
  return state;
}

const fmt = n => Number(n || 0).toLocaleString('pt-BR');
const medalha = i => ['🥇', '🥈', '🥉'][i] || i + 1;
const kmTxt = km => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1).replace('.', ',')} km` : `${fmt(Math.round(km))} km`);
const celular = () => window.matchMedia?.('(max-width: 640px)').matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const corOk = c => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#5865F2');
const tileLayer = () => window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' });
function pinIcon(p) {
  const dentro = p.avatarUrl ? `<img src="${esc(resolveAssetUrl(p.avatarUrl))}" alt="">` : esc((p.name || '?')[0].toUpperCase());
  return window.L.divIcon({ className: '', html: `<div class="geo-pino" style="background:${corOk(p.color)}" title="${esc(p.name)}">${dentro}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
// número que sobe animado (igual a contagem de pontos do GeoGuessr)
function useContagem(alvo, atraso = 700, dur = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, ini;
    const t = setTimeout(() => {
      const passo = ts => {
        ini ??= ts;
        const k = Math.min(1, (ts - ini) / dur);
        setV(Math.round(alvo * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    }, atraso);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [alvo]);
  return v;
}

const tempoTxt = v => (!v ? 'Sem limite' : v < 120 ? `${v}s` : `${v / 60} min`);

export function GeoGame({ act, g }) {
  const libs = useLibs();
  if (g.fase === 'sala') return <GeoLobby act={act} g={g} />;
  if (g.fase === 'fim') return <GeoEnd act={act} g={g} />;
  if (libs !== 'ok') {
    return (
      <>
        <ActTop act={act} kind="geo" />
        <div className="geo-aviso">{libs === 'carregando' ? 'Carregando o jogo...' : `Não deu pra carregar o jogo (${libs}). Confira a internet e abra de novo.`}</div>
      </>
    );
  }
  if (g.fase === 'chutando') return <GeoRound key={`${g.id}:${g.rodada}`} act={act} g={g} />;
  return <GeoResult key={`${g.id}:${g.rodada}:r`} act={act} g={g} />;
}

// ----- sala: o host escolhe rodadas e tempo; quem quiser entra -----
function GeoLobby({ act, g }) {
  const host = g.host === act.myId;
  const dentro = g.jogadores.includes(act.myId);
  const fora = act.people.filter(p => !g.jogadores.includes(p.userId));
  const op = (campo, valores, rot, atual) => (
    <div className="act-opcoes">
      {valores.map(v => (
        <button key={v} type="button" className={atual === v ? 'ativo' : ''} disabled={!host} onClick={() => act.geo('opcoes', { [campo]: v })}>{rot(v)}</button>
      ))}
    </div>
  );
  return (
    <>
      <ActTop act={act} kind="geo"><span className="act-tag">sala</span></ActTop>
      <div className="act-meio">
        <div className="act-cartao">
          <p className="act-explica">Todo mundo que entrou vê a mesma foto de rua e marca no mapa onde acha que é. Quanto mais perto, mais pontos (até 5.000 por rodada). Depois de cada rodada vem uma dica de como reconhecer aquele país.</p>
          <h3>Lugares</h3>
          {op('regiao', ['mundo', 'br'], v => (v === 'br' ? '🇧🇷 Só Brasil' : '🌎 Mundo todo'), g.regiao || 'mundo')}
          <h3>Rodadas</h3>
          {op('rodadas', [3, 5, 10], v => v, g.total)}
          <h3>Tempo por rodada</h3>
          {op('tempo', [60, 90, 120, 0], tempoTxt, g.tempo)}
          <h3>Jogando ({g.jogadores.length})</h3>
          <div className="act-chips">
            {g.jogadores.map(id => {
              const p = act.person(id, g);
              return <span key={id} className="act-chip"><ActAvatar person={p} size={26} />{p.name}{id === g.host ? <small>host</small> : null}</span>;
            })}
          </div>
          {host && fora.length > 0 && (
            <p className="act-vazio">Convite enviado pra call. Fora do jogo (e não precisam entrar): {fora.map(p => p.name).join(', ')}</p>
          )}
          {host ? (
            <button type="button" className="act-btn forte grande" onClick={() => act.geo('comecar')}>
              Começar ({g.jogadores.length} jogador{g.jogadores.length > 1 ? 'es' : ''})
            </button>
          ) : dentro ? (
            <p className="act-vazio">Você entrou. {act.person(g.host, g).name} começa quando quiser.</p>
          ) : (
            <button type="button" className="act-btn verde grande" onClick={() => act.join('geo')}>Entrar</button>
          )}
          <h3>🏆 Ranking da semana</h3>
          <GeoRanking act={act} />
        </div>
      </div>
    </>
  );
}

// ----- rodada: foto + mapinha -----
function GeoRound({ act, g }) {
  const [chute, setChute] = useState(null);
  const [tam, setTam] = useState(() => localStorage.getItem('ronncord_geo_mapa') || 'p');
  const [agora, setAgora] = useState(Date.now());
  const [fotoMsg, setFotoMsg] = useState('Carregando a foto...');
  const fimRef = useRef(0);
  const mapDiv = useRef(null);
  const fotoDiv = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);
  const enviadoRef = useRef(false);
  const contouRef = useRef(false);
  const jogador = g.jogadores.includes(act.myId);
  const jaChutei = g.chutaram.includes(act.myId) || enviadoRef.current;
  const meuRef = useRef({ jogador, jaChutei, chute });
  meuRef.current = { jogador, jaChutei, chute };

  // sons: foto nova (swoosh) e quando outra pessoa chuta
  useEffect(() => { SoundFX.geo('swoosh'); }, []);
  const outrosChutes = g.chutaram.filter(id => id !== act.myId).length;
  const outrosRef = useRef(outrosChutes);
  useEffect(() => {
    if (outrosChutes > outrosRef.current) SoundFX.geo('chutou');
    outrosRef.current = outrosChutes;
  }, [outrosChutes]);

  // relógio: o servidor manda quanto falta; aqui vira hora local
  useEffect(() => { fimRef.current = g.restante ? Date.now() + g.restante : 0; }, [g]);
  useEffect(() => {
    const t = setInterval(() => {
      setAgora(Date.now());
      const m = meuRef.current;
      // faltando uns 4 segundos: toca a contagem do GeoGuessr (uma vez por rodada)
      const falta = fimRef.current ? fimRef.current - Date.now() : 0;
      if (!contouRef.current && falta > 0 && falta <= 4100) { contouRef.current = true; SoundFX.geoCountdown(); }
      // acabando o tempo: quem marcou no mapa e não confirmou, vai assim mesmo
      if (fimRef.current && Date.now() >= fimRef.current - 800 && m.chute && !m.jaChutei && m.jogador) enviar(m.chute);
    }, 250);
    return () => clearInterval(t);
  }, []);

  function enviar(c) {
    if (enviadoRef.current || !c) return;
    enviadoRef.current = true;
    act.geo('chute', { rodada: g.rodada, lat: c.lat, lon: c.lng });
    setAgora(Date.now());
  }

  // mapa
  useEffect(() => {
    const L = window.L;
    const map = L.map(mapDiv.current, { worldCopyJump: true, zoomControl: true }).setView([20, 0], 1);
    tileLayer().addTo(map);
    const eu = act.person(act.myId, g);
    map.on('click', e => {
      const m = meuRef.current;
      if (!m.jogador || m.jaChutei) return;
      const ll = e.latlng.wrap();
      if (pinRef.current) pinRef.current.setLatLng(e.latlng);
      else pinRef.current = L.marker(e.latlng, { icon: pinIcon(eu) }).addTo(map);
      setChute(ll);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; pinRef.current = null; };
  }, []);
  useEffect(() => {
    localStorage.setItem('ronncord_geo_mapa', tam);
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [tam]);

  // foto (360 no Pannellum; plana num canvas cortando o carimbo de GPS de cima e de baixo)
  useEffect(() => {
    const caixa = fotoDiv.current, l = g.local;
    if (!caixa || !l) return;
    let viewer = null, vivo = true;
    if (l.p360) {
      setFotoMsg('');
      const usar = (url, reserva) => {
        try { viewer?.destroy(); } catch { /* já foi */ }
        caixa.innerHTML = '';
        viewer = window.pannellum.viewer(caixa, {
          type: 'equirectangular', panorama: url, autoLoad: true, crossOrigin: 'anonymous', hfov: 100,
          showFullscreenCtrl: false, compass: false, keyboardZoom: false, yaw: Math.random() * 360 - 180,
          strings: {
            loadingLabel: 'Carregando a foto...', genericWebGLError: 'Seu navegador não abriu a foto 360°.', iOS8WebGLError: 'Seu navegador não abriu a foto 360°.',
            textureSizeError: 'Foto grande demais pra sua placa de vídeo.', unknownError: 'A foto não abriu 😕', loadButtonLabel: 'Abrir foto', bylineLabel: ''
          }
        });
        viewer.on('error', () => { if (vivo && reserva) usar(reserva, null); });
      };
      const alta = !celular() && l.hd;
      // dá pra andar: fotos do Panoramax (sequência deles) ou fotos extras que vieram com a sequência (nosso servidor)
      const ehPx = (l.fonte ? l.fonte === 'px' : true) && /panoramax\./.test(l.img || '');
      const ehExtra = l.fonte === 'extra' && l.anda;
      const pxId = ehPx || ehExtra ? l.id : null;
      if (!pxId) usar(alta ? l.hd : l.img, alta ? l.img : null);
      else {
        // ===== andar pela rua (modo "Moving" do GeoGuessr) =====
        // As fotos do Panoramax vêm em sequência: busca a foto da frente e a de trás e põe setas no chão.
        // Os pontos continuam contando a partir do lugar onde a rodada começou.
        const API = 'https://panoramax.openstreetmap.fr/api/search?ids=';
        const cache = new Map();
        const info = async id => {
          if (cache.has(id)) return cache.get(id);
          if (ehExtra) {
            const n = await apiFetch(`/api/activities/geo/no/${id}`);
            const out = { id, sd: n.img, hd: n.img, az: Number(n.az) || 0, lat: n.lat, lon: n.lon, viz: n.viz || [] };
            cache.set(id, out);
            return out;
          }
          const r = await fetch(API + id, { signal: AbortSignal.timeout(8000) });
          const f = (await r.json()).features?.[0];
          if (!f) throw new Error('sem foto');
          const out = {
            id, sd: f.assets?.sd?.href, hd: f.assets?.hd?.href, az: Number(f.properties?.['view:azimuth']) || 0,
            lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
            viz: (f.links || []).filter(x => (x.rel === 'next' || x.rel === 'prev') && x.geometry)
              .map(x => ({ id: x.href.split('/').pop(), lat: x.geometry.coordinates[1], lon: x.geometry.coordinates[0] }))
          };
          cache.set(id, out);
          return out;
        };
        const rumo = (a, b) => {
          const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
          const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
          return (Math.atan2(y, x) / r + 360) % 360;
        };
        const norm = v => ((v + 540) % 360) - 180;
        const setas = cur => cur.viz.map(v => ({
          pitch: -12, yaw: norm(rumo(cur, v) - cur.az), type: 'custom', cssClass: 'geo-seta',
          createTooltipFunc: div => { div.innerHTML = '<span>▲</span>'; div.title = 'Andar pra cá'; },
          clickHandlerFunc: () => andar(v.id)
        }));
        const cena = (cur, url) => ({
          type: 'equirectangular', panorama: url, hfov: 100, hotSpots: setas(cur), crossOrigin: 'anonymous'
        });
        let atual = null, andando = false;
        const andar = async id => {
          if (andando || !viewer) return;
          andando = true;
          try {
            const prox = await info(id);
            if (!vivo) return;
            const rumoAgora = norm(viewer.getYaw() + atual.az);
            if (!viewer.getConfig().scenes?.[id]) viewer.addScene(id, cena(prox, prox.sd || prox.hd));
            viewer.loadScene(id, viewer.getPitch(), norm(rumoAgora - prox.az), viewer.getHfov());
            atual = prox;
            voltar.hidden = id === inicioId;
          } catch { /* a foto vizinha não abriu: fica onde está */ }
          andando = false;
        };
        const inicioId = pxId;
        const voltar = document.createElement('button');
        voltar.type = 'button';
        voltar.className = 'geo-voltar';
        voltar.textContent = '↩ Voltar ao começo';
        voltar.hidden = true;
        voltar.onclick = () => andar(inicioId);
        info(pxId).then(cur => {
          if (!vivo) return;
          atual = cur;
          try { viewer?.destroy(); } catch { /* já foi */ }
          caixa.innerHTML = '';
          const url0 = alta && cur.hd ? cur.hd : (cur.sd || l.img);
          viewer = window.pannellum.viewer(caixa, {
            default: { firstScene: pxId, autoLoad: true, showFullscreenCtrl: false, compass: false, keyboardZoom: false, sceneFadeDuration: 400,
              strings: { loadingLabel: 'Carregando a foto...', unknownError: 'A foto não abriu 😕', bylineLabel: '' } },
            scenes: { [pxId]: { ...cena(cur, url0), yaw: Math.random() * 360 - 180 } }
          });
          viewer.on('error', () => { if (vivo && url0 !== cur.sd && cur.sd) { try { viewer.destroy(); } catch { /* */ } usar(cur.sd, null); } });
          caixa.appendChild(voltar);
        }).catch(() => { if (vivo) usar(alta ? l.hd : l.img, alta ? l.img : null); });
      }
    } else {
      caixa.innerHTML = '';
      const plana = document.createElement('div');
      plana.className = 'geo-plana';
      plana.title = 'Clique pra dar zoom (mexa o mouse pra olhar em volta)';
      const tela = document.createElement('canvas');
      plana.appendChild(tela);
      caixa.appendChild(plana);
      const img = new Image();
      img.onload = () => {
        if (!vivo) return;
        const cima = Math.round(img.naturalHeight * 0.07), baixo = Math.round(img.naturalHeight * 0.11);
        tela.width = img.naturalWidth;
        tela.height = img.naturalHeight - cima - baixo;
        tela.getContext('2d').drawImage(img, 0, -cima);
        setFotoMsg('');
      };
      img.onerror = () => vivo && setFotoMsg('A foto não abriu 😕');
      img.src = l.img;
      const ponto = e => {
        const r = plana.getBoundingClientRect(), prop = tela.width / tela.height || 1.5;
        const w = Math.min(r.width, r.height * prop), h = w / prop, x0 = (r.width - w) / 2, y0 = (r.height - h) / 2;
        const x = Math.max(x0, Math.min(x0 + w, e.clientX - r.left)), y = Math.max(y0, Math.min(y0 + h, e.clientY - r.top));
        tela.style.transformOrigin = `${x}px ${y}px`;
      };
      plana.onclick = e => { const z = plana.classList.toggle('ampliada'); ponto(e); tela.style.transform = z ? 'scale(2.5)' : ''; };
      plana.onmousemove = e => { if (plana.classList.contains('ampliada')) ponto(e); };
    }
    return () => { vivo = false; try { viewer?.destroy(); } catch { /* já foi */ } caixa.innerHTML = ''; };
  }, [g.local?.id]);

  const s = fimRef.current ? Math.max(0, Math.ceil((fimRef.current - agora) / 1000)) : null;
  const faltam = g.jogadores.filter(id => !g.chutaram.includes(id)).length;
  let botao;
  if (!jogador) botao = { txt: 'Entrar neste jogo', cls: 'verde', on: () => act.join('geo'), dis: false };
  else if (jaChutei) botao = { txt: faltam ? `Chutou! Esperando ${faltam}` : 'Chutou!', cls: 'verde', on: null, dis: true };
  else if (chute) botao = { txt: 'Chutar', cls: 'forte', on: () => enviar(chute), dis: false };
  else botao = { txt: celular() ? 'Toque no mapa' : 'Clique no mapa', cls: 'forte', on: null, dis: true };

  return (
    <>
      <ActTop act={act} kind="geo">
        <span className={`geo-relogio ${s !== null && s <= 10 ? 'pouco' : ''}`}>{s === null ? 'sem limite' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
        <b className="geo-rodada">Rodada {g.rodada + 1}/{g.total}</b>
        <span className="geo-quem">
          {g.jogadores.map(id => (
            <ActAvatar key={id} person={act.person(id, g)} size={24} className={g.chutaram.includes(id) ? 'chutou' : 'esperando'} />
          ))}
        </span>
      </ActTop>
      <div className="geo-jogo">
        <div className="geo-foto" ref={fotoDiv} />
        {fotoMsg && <div className="geo-carregando">{fotoMsg}</div>}
        <div className={`geo-mapa-caixa ${tam}`}>
          <div className="geo-mapa" ref={mapDiv} />
          <div className="geo-mapa-acoes">
            {[['p', 'P', 'Mapa pequeno'], ['m', 'M', 'Mapa médio'], ['g', 'G', 'Mapa grande']].map(([t, r, tt]) => (
              <button key={t} type="button" data-tam={t} className={`act-btn tam ${tam === t ? 'ativo' : ''}`} title={tt} onClick={() => setTam(t)}>{r}</button>
            ))}
            <button type="button" className={`act-btn ${botao.cls} geo-chutar`} disabled={botao.dis} onClick={botao.on || undefined}>{botao.txt}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ----- resultado: mapa com as linhas + dica do país + placar -----
function GeoResult({ act, g }) {
  const mapDiv = useRef(null);
  const res = g.resultado || { chutes: {} };
  const l = res.local;
  const linhas = g.jogadores.map(id => ({ id, c: res.chutes[id] || null, total: g.placar[id] || 0 })).sort((a, b) => b.total - a.total);
  const perto = linhas.filter(x => x.c).sort((a, b) => a.c.km - b.c.km);
  const ultima = g.rodada + 1 >= g.total;
  const host = g.host === act.myId;

  // sons do resultado: fecha a rodada, conta os pontos e, se for o caso, na mosca ou longe demais
  useEffect(() => {
    const meu = res.chutes[act.myId];
    const timers = [];
    SoundFX.geo('portas');
    timers.push(setTimeout(() => SoundFX.geo('pontos'), 700));
    if (g.jogadores.includes(act.myId)) {
      if (meu && meu.pts >= 4500) timers.push(setTimeout(() => SoundFX.geo('naMosca'), 1900));
      else if (!meu || meu.pts < 500) timers.push(setTimeout(() => SoundFX.geo('longe'), 1900));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = L.map(mapDiv.current, { worldCopyJump: true });
    tileLayer().addTo(map);
    const pontos = [];
    if (l) {
      L.marker([l.lat, l.lon], { icon: L.divIcon({ className: '', html: '<div class="geo-alvo">📍</div>', iconSize: [30, 30], iconAnchor: [15, 28] }), zIndexOffset: 1000 }).addTo(map);
      pontos.push([l.lat, l.lon]);
    }
    for (const x of perto) {
      let lon = x.c.lon;
      if (l) { while (lon - l.lon > 180) lon -= 360; while (lon - l.lon < -180) lon += 360; } // linha pelo caminho mais curto
      const p = act.person(x.id, g);
      L.marker([x.c.lat, lon], { icon: pinIcon(p) }).addTo(map);
      if (l) L.polyline([[x.c.lat, lon], [l.lat, l.lon]], { color: corOk(p.color), weight: 3, dashArray: '6 8' }).addTo(map);
      pontos.push([x.c.lat, lon]);
    }
    if (pontos.length > 1) map.fitBounds(pontos, { padding: [50, 50], maxZoom: 13 });
    else map.setView(pontos[0] || [20, 0], pontos.length ? 5 : 1);
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => { clearTimeout(t); map.remove(); };
  }, []);

  const meu = res.chutes[act.myId];
  const souJogador = g.jogadores.includes(act.myId);
  const meusPts = meu?.pts || 0;
  const contado = useContagem(meusPts);
  const [verDica, setVerDica] = useState(true);

  return (
    <>
      <ActTop act={act} kind="geo"><b className="geo-rodada">Rodada {g.rodada + 1}/{g.total}</b></ActTop>
      <div className="geo-resultado gg">
        <div className="geo-mapa" ref={mapDiv} />
        {l?.pais && verDica && (
          <div className="geo-dica gg-dica">
            <button type="button" className="gg-x" onClick={() => setVerDica(false)} title="Esconder dica">×</button>
            <div className="pais">
              {/^[A-Z]{2}$/.test(l.cc) && <img src={`https://flagcdn.com/w80/${l.cc.toLowerCase()}.png`} alt="" />}
              {l.pais.n}
            </div>
            <small>perto de {l.perto}</small>
            <b className="titulo">Como acertar da próxima</b>
            <p>{l.pais.d}</p>
          </div>
        )}
        <div className="gg-painel">
          <div className="gg-meu">
            {souJogador ? (
              <>
                <div className="gg-pontos"><b>{fmt(contado)}</b> pontos</div>
                <div className="gg-barra"><i style={{ width: `${(contado / 5000) * 100}%` }} /></div>
                <div className="gg-km">{meu ? <>Seu chute foi a <b>{kmTxt(meu.km)}</b> do local certo</> : 'Você não chutou nessa rodada'}</div>
              </>
            ) : (
              <div className="gg-km">{perto.length ? <>🎯 Mais perto: <b>{act.person(perto[0].id, g).name}</b>, a {kmTxt(perto[0].c.km)}</> : 'Ninguém chutou dessa vez 😅'}</div>
            )}
          </div>
          <div className="gg-acao">
            {host
              ? <button type="button" className="gg-btn" onClick={() => act.geo('proxima')}>{ultima ? 'Ver resultado final' : 'Próxima rodada'}</button>
              : <span className="act-vazio act-pouco">{act.person(g.host, g).name} passa pra próxima</span>}
          </div>
          <div className="gg-ranking">
            {linhas.slice(0, 5).map((x, i) => {
              const p = act.person(x.id, g);
              return (
                <div key={x.id} className={`gg-linha ${x.id === act.myId ? 'eu' : ''}`}>
                  <span className="pos">{i + 1}</span>
                  <ActAvatar person={p} size={24} />
                  <span className="nome">{p.name}</span>
                  <span className="mais">{x.c ? `+${fmt(x.c.pts)}` : '—'}</span>
                  <span className="pts">{fmt(x.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// mapa do fim de jogo: todas as rodadas, com o lugar certo numerado e o chute de cada um
function GeoResumoMapa({ act, g }) {
  const div = useRef(null);
  useEffect(() => {
    const L = window.L;
    const map = L.map(div.current, { worldCopyJump: true });
    tileLayer().addTo(map);
    const pts = [];
    g.historico.forEach((r, i) => {
      const l = r.local;
      L.marker([l.lat, l.lon], { icon: L.divIcon({ className: '', html: `<div class="gg-num">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 1000 }).addTo(map);
      pts.push([l.lat, l.lon]);
      for (const [id, c] of Object.entries(r.chutes || {})) {
        if (!c) continue;
        let lon = c.lon;
        while (lon - l.lon > 180) lon -= 360;
        while (lon - l.lon < -180) lon += 360;
        const p = act.person(id, g);
        L.marker([c.lat, lon], { icon: pinIcon(p) }).addTo(map);
        L.polyline([[c.lat, lon], [l.lat, l.lon]], { color: corOk(p.color), weight: 2, dashArray: '4 6', opacity: 0.85 }).addTo(map);
        pts.push([c.lat, lon]);
      }
    });
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 6 });
    else map.setView(pts[0] || [20, 0], 3);
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => { clearTimeout(t); map.remove(); };
  }, []);
  return <div className="gg-mapa-fim" ref={div} />;
}

// ----- fim: pódio + placar + ranking da semana -----
function GeoEnd({ act, g }) {
  const linhas = g.jogadores.map(id => ({ id, total: g.placar[id] || 0 })).sort((a, b) => b.total - a.total);
  const souJogador = g.jogadores.includes(act.myId);
  const venci = linhas[0]?.id === act.myId;
  useEffect(() => { if (souJogador) SoundFX.geo(venci ? 'vitoria' : 'derrota'); }, []);
  const meuTotal = g.placar[act.myId] || 0;
  const maximo = Math.max(1, g.total * 5000);
  const contado = useContagem(meuTotal, 500, 1800);
  const host = g.host === act.myId;
  const degrau = (x, lugar, altura, cor) => {
    if (!x) return <div />;
    const p = act.person(x.id, g);
    return (
      <div>
        <ActAvatar person={p} size={56} />
        <span className="nome">{p.name}</span>
        <span className="pts">{fmt(x.total)}</span>
        <div className="degrau" style={{ height: altura, background: cor }}>{lugar}</div>
      </div>
    );
  };
  return (
    <>
      <ActTop act={act} kind="geo"><b className="geo-rodada">Fim de jogo!</b></ActTop>
      <div className={`act-meio ${window.L && g.historico?.length ? 'gg-fim' : ''}`}>
        {window.L && g.historico?.length > 0 && <GeoResumoMapa act={act} g={g} />}
        <div className="act-cartao">
          {souJogador && (
            <div className="gg-total">
              <div className="gg-pontos"><b>{fmt(contado)}</b> de {fmt(maximo)} pontos</div>
              <div className="gg-barra"><i style={{ width: `${(contado / maximo) * 100}%` }} /></div>
              <div className="gg-km">{venci ? '🏆 Você ganhou!' : `Você ficou em ${linhas.findIndex(x => x.id === act.myId) + 1}º`}</div>
            </div>
          )}
          <div className="geo-podio">
            {degrau(linhas[1], 2, 90, '#8e9aa8')}
            {degrau(linhas[0], 1, 130, '#c9a24a')}
            {degrau(linhas[2], 3, 64, '#a0704a')}
          </div>
          <div className="geo-linhas">
            {linhas.map((x, i) => {
              const p = act.person(x.id, g);
              return (
                <div key={x.id} className={`geo-linha ${x.id === act.myId ? 'eu' : ''}`}>
                  <span className="pos">{medalha(i)}</span>
                  <ActAvatar person={p} size={32} />
                  <span className="nome">{p.name}<small>média de {fmt(Math.round(x.total / Math.max(1, g.total)))} por rodada</small></span>
                  <span className="pts">{fmt(x.total)}</span>
                </div>
              );
            })}
          </div>
          {host
            ? <button type="button" className="act-btn forte grande" onClick={() => act.geo('denovo')}>Jogar de novo</button>
            : <p className="act-vazio">{act.person(g.host, g).name} pode começar outra partida.</p>}
          <h3>🏆 Ranking da semana</h3>
          <GeoRanking act={act} />
        </div>
      </div>
    </>
  );
}

function GeoRanking({ act }) {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    apiFetch(`/api/activities/geo/ranking/${act.channelId}`)
      .then(d => { if (vivo) { setData(d); setErro(''); } })
      .catch(e => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [act.channelId, act.rankingTick]);
  if (erro) return <p className="act-vazio">Não deu pra carregar o ranking.</p>;
  if (!data) return <p className="act-vazio">Carregando...</p>;
  const pessoa = r => ({ name: r.display_name || '?', avatarUrl: r.avatar_url, color: r.avatar_color || '#5865F2' });
  return (
    <div className="geo-ranking">
      {data.campeao && (
        <div className="geo-coroa">👑 Campeão da semana passada: <b>{data.campeao.display_name}</b> ({fmt(data.campeao.pontos)} pontos)</div>
      )}
      {data.semana.length ? (
        <div className="geo-linhas">
          {data.semana.map((r, i) => (
            <div key={r.user_id} className={`geo-linha ${r.user_id === act.myId ? 'eu' : ''}`}>
              <span className="pos">{medalha(i)}</span>
              <ActAvatar person={pessoa(r)} size={32} />
              <span className="nome">{r.display_name || '?'}<small>{r.partidas} partida{r.partidas > 1 ? 's' : ''} · média {fmt(Math.round(r.pontos / Math.max(1, r.rodadas)))} por rodada · melhor {fmt(r.melhor)}</small></span>
              <span className="pts">{fmt(r.pontos)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="act-vazio">Ninguém jogou nesta semana ainda.</p>
      )}
      <p className="act-vazio act-pouco">Soma os pontos de todas as partidas de segunda a domingo neste servidor. Zera toda segunda.</p>
    </div>
  );
}
