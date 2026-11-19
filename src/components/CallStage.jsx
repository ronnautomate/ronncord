import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2, VolumeX, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Music, Sliders,
  PhoneOff, Maximize2, MonitorX, Monitor, Minus, Plus, Headphones, HeadphoneOff, Menu
} from 'lucide-react';
import { resolveAssetUrl } from '../lib/api.js';
import { SCREEN_QUALITIES } from '../lib/voiceManager.js';

// ============================================================
//  SALA DE VOZ (layout trazido do discordia)
//  - um bloco por pessoa (foto ou câmera), borda verde em quem fala
//  - com tela compartilhada: tela grande | alça de arrastar | coluna das câmeras
//  - cada um escolhe o tamanho das câmeras (slider) e da coluna (alça), salvo no navegador
//  - volume por pessoa e por stream (botão no canto ou clique direito), mutar a stream
//  - sair da stream sem sair da call (e voltar a assistir)
// ============================================================

const CAM_DEFAULT = 420;
const SIDE_DEFAULT = 200;
const readNum = (key, def) => {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n > 0 ? n : def;
};

function Avatar({ person, size = 72 }) {
  return (
    <span
      className={`avatar call-avatar deco-${person.deco || 'none'}`}
      style={{ background: person.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {person.avatarUrl ? (
        <img src={resolveAssetUrl(person.avatarUrl)} alt={person.name} className="avatar-img" />
      ) : (
        (person.name || '?')[0].toUpperCase()
      )}
    </span>
  );
}

// liga o <video> no stream (só a imagem: o som vai pelos elementos de áudio do voiceManager)
function StreamVideo({ stream, mirror = false, contain = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    const videoOnly = new MediaStream(stream.getVideoTracks());
    el.muted = true;
    el.srcObject = videoOnly;
    el.play?.().catch(() => {});
  }, [stream, stream?.getVideoTracks()[0]?.id]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className={`${mirror ? 'mirror' : ''} ${contain ? 'contain' : ''}`}
    />
  );
}

function goFullscreen(el) {
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else el.requestFullscreen?.();
}

export function CallStage({
  channelName,
  people,              // [{ socketId, userId, name, avatarUrl, color, deco, speaking, muted, deafened, isMe }]
  remoteVideos,        // do voiceManager: { id, socketId, kind: 'camera'|'screen', stream }
  localCameraStream,
  localScreenStream,
  hiddenVideoIds,      // streams que eu saí
  hideMyScreen,
  userVolumes,
  screenVolumes,
  mutedScreenSockets,
  muted,
  deafened,
  isCameraOn,
  isScreenSharing,
  musicPlaying,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreen,
  onOpenMusic,
  onOpenSettings,
  onLeave,
  onLeaveStream,       // (videoId | 'me')
  onWatchStream,       // (videoId | 'me')
  onUserVolume,        // (userId, 0-400)
  onScreenVolume,      // (socketId, 0-100)
  onScreenMute,        // (socketId, bool)
  screenQualities = {}, // socketId -> 'source' | '720' | '480' (o que eu pedi)
  onScreenQuality,     // (socketId, qualidade)
  onSelectUser,
  onOpenNav
}) {
  const [focusId, setFocusId] = useState(null);
  const [camSize, setCamSize] = useState(() => readNum('ronncord_cam_size', CAM_DEFAULT));
  const [side, setSide] = useState(() => readNum('ronncord_stage_side', SIDE_DEFAULT));
  const [menu, setMenu] = useState(null); // { x, y, type: 'voice'|'screen', person, socketId }
  const stageRef = useRef(null);

  useEffect(() => { localStorage.setItem('ronncord_cam_size', String(camSize)); }, [camSize]);
  useEffect(() => { localStorage.setItem('ronncord_stage_side', String(side)); }, [side]);

  // fecha o menu de volume clicando fora ou no Esc
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = e => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  const bySocket = Object.fromEntries(people.map(p => [p.socketId, p]));
  const me = people.find(p => p.isMe);
  const cameraOf = p => (p.isMe ? localCameraStream : remoteVideos.find(v => v.socketId === p.socketId && v.kind === 'camera')?.stream);

  // telas: as dos outros + a minha
  const screens = [];
  if (localScreenStream && me) screens.push({ id: 'me', socketId: me.socketId, person: me, stream: localScreenStream, mine: true });
  for (const v of remoteVideos) {
    if (v.kind === 'camera') continue;
    const person = bySocket[v.socketId] || { name: v.displayName, color: '#5865F2' };
    screens.push({ id: v.id, socketId: v.socketId, person, stream: v.stream, mine: false });
  }
  const isLeft = s => (s.mine ? hideMyScreen : hiddenVideoIds.includes(s.id));
  const visibleScreens = screens.filter(s => !isLeft(s));
  const leftScreens = screens.filter(isLeft);
  const focus = visibleScreens.find(s => s.id === focusId) || visibleScreens[0] || null;

  function openMenu(e, type, person, socketId) {
    e.preventDefault();
    e.stopPropagation();
    if (person?.isMe && type === 'voice') return;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 260));
    const y = Math.max(8, Math.min(e.clientY + 10, window.innerHeight - 200));
    setMenu({ x, y, type, person, socketId });
  }

  // alça entre a tela grande e a coluna das câmeras
  function startDrag(e) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('dragging-stage');
    const right = stageRef.current.getBoundingClientRect().right;
    const width = stageRef.current.clientWidth;
    const move = ev => setSide(Math.round(Math.max(160, Math.min(right - ev.clientX - 8, width - 16 - 240))));
    const stop = () => {
      handle.classList.remove('dragging');
      document.body.classList.remove('dragging-stage');
      handle.removeEventListener('pointermove', move);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop, { once: true });
    handle.addEventListener('pointercancel', stop, { once: true });
  }

  // Ctrl + rodinha nas câmeras muda o tamanho (sem tela)
  function onWheel(e) {
    if (!e.ctrlKey || focus) return;
    e.preventDefault();
    setCamSize(s => Math.max(160, Math.min(1200, s + (e.deltaY < 0 ? 40 : -40))));
  }

  function volTag(p) {
    if (p.isMe) return null;
    const v = userVolumes[p.userId] ?? 100;
    return v === 100 ? null : <span className="vol">{v === 0 ? 'mutado' : `${v}%`}</span>;
  }

  function personTile(p) {
    const cam = cameraOf(p);
    return (
      <div
        key={`p-${p.socketId}`}
        className={`call-tile ${p.speaking ? 'speaking' : ''}`}
        onContextMenu={e => openMenu(e, 'voice', p)}
      >
        {cam ? <StreamVideo stream={cam} mirror={p.isMe} /> : <Avatar person={p} />}
        <div className="call-label">
          <button type="button" className="call-name" onClick={() => onSelectUser?.(p)}>{p.name}</button>
          {volTag(p)}
          {p.muted && <MicOff size={14} className="call-ico-off" />}
          {p.deafened && <HeadphoneOff size={14} className="call-ico-off" />}
        </div>
        <div className="call-corners">
          {!p.isMe && (
            <button type="button" title="Volume" onClick={e => openMenu(e, 'voice', p)}><Volume2 size={15} /></button>
          )}
          {cam && (
            <button type="button" title="Tela cheia" onClick={e => goFullscreen(e.currentTarget.closest('.call-tile'))}><Maximize2 size={15} /></button>
          )}
        </div>
      </div>
    );
  }

  function screenTile(s, big) {
    const vol = s.mine ? null : (mutedScreenSockets.includes(s.socketId) ? 0 : (screenVolumes[s.socketId] ?? 100));
    return (
      <div
        key={`s-${s.id}`}
        className="call-tile screen"
        title={big ? undefined : 'Assistir esta tela'}
        onClick={big ? undefined : () => setFocusId(s.id)}
        onDoubleClick={big ? e => goFullscreen(e.currentTarget) : undefined}
        onContextMenu={s.mine ? undefined : e => openMenu(e, 'screen', s.person, s.socketId)}
      >
        <StreamVideo stream={s.stream} contain />
        <div className="call-label">
          <span>{s.mine ? 'Sua tela' : `${s.person.name} (tela)`}</span>
          {!s.mine && vol !== 100 && <span className="vol">{vol === 0 ? 'mutada' : `${vol}%`}</span>}
          {!s.mine && screenQualities[s.socketId] && screenQualities[s.socketId] !== 'source' && (
            <span className="vol">{screenQualities[s.socketId]}p</span>
          )}
        </div>
        <div className="call-corners">
          {!s.mine && (
            <button type="button" title="Volume da stream" onClick={e => openMenu(e, 'screen', s.person, s.socketId)}>
              {vol === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
          {big && (
            <button type="button" title="Tela cheia" onClick={e => { e.stopPropagation(); goFullscreen(e.currentTarget.closest('.call-tile')); }}>
              <Maximize2 size={15} />
            </button>
          )}
          <button
            type="button"
            title={s.mine ? 'Esconder minha tela (continua transmitindo)' : 'Sair da stream (continua na call)'}
            onClick={e => { e.stopPropagation(); if (document.fullscreenElement) document.exitFullscreen?.(); onLeaveStream(s.id); }}
          >
            <MonitorX size={15} />
          </button>
        </div>
      </div>
    );
  }

  // stream que eu saí: bloco escuro com o botão de voltar
  function leftTile(s) {
    return (
      <div key={`f-${s.id}`} className="call-tile left" onClick={() => { onWatchStream(s.id); setFocusId(s.id); }} title="Assistir">
        <div className="left-inner">
          <Monitor size={30} />
          <p>{s.mine ? 'Você está transmitindo' : `${s.person.name} está transmitindo`}</p>
          <button type="button">{s.mine ? 'Ver minha tela' : 'Assistir'}</button>
        </div>
      </div>
    );
  }

  const menuPerson = menu?.person;
  const menuVoiceVol = menuPerson ? (userVolumes[menuPerson.userId] ?? 100) : 100;
  const menuScreenMuted = menu ? mutedScreenSockets.includes(menu.socketId) : false;
  const menuScreenVol = menu ? (menuScreenMuted ? 0 : (screenVolumes[menu.socketId] ?? 100)) : 100;

  return (
    <main className="call-room">
      <header className="chat-header call-header">
        <div className="chat-header-title">
          {onOpenNav && (
            <button type="button" className="icon-btn mobile-nav-btn" title="Servidores e canais" onClick={onOpenNav}>
              <Menu size={20} />
            </button>
          )}
          <Volume2 size={20} className="header-icon" />
          <strong>{channelName}</strong>
          <span className="chat-topic">{people.length} na sala</span>
        </div>
      </header>

      <div
        ref={stageRef}
        className={`call-stage ${focus ? 'with-screen' : ''}`}
        style={{ '--cam-size': `${camSize}px`, '--side': `${side}px` }}
        onWheel={onWheel}
      >
        {people.length === 0 && <p className="call-empty">Conectando...</p>}
        {focus ? (
          <>
            {screenTile(focus, true)}
            <div className="call-handle" title="Arraste pra mudar o tamanho da tela (duplo clique volta ao normal)" onPointerDown={startDrag} onDoubleClick={() => setSide(SIDE_DEFAULT)} />
            <div className="call-thumbs">
              {visibleScreens.filter(s => s !== focus).map(s => screenTile(s, false))}
              {leftScreens.map(leftTile)}
              {people.map(personTile)}
            </div>
          </>
        ) : (
          <>
            {leftScreens.map(leftTile)}
            {people.map(personTile)}
          </>
        )}
      </div>

      <div className="call-bar">
        {focus && (
          <button type="button" className="call-leave-stream" onClick={() => onLeaveStream(focus.id)} title={focus.mine ? 'Some da sua tela, os outros continuam vendo' : 'Para de assistir e continua na call'}>
            <MonitorX size={18} /> {focus.mine ? 'Esconder minha tela' : 'Sair da stream'}
          </button>
        )}
        <button type="button" className={muted ? 'off' : ''} title={muted ? 'Desmutar' : 'Mutar'} onClick={onToggleMute}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button type="button" className={deafened ? 'off' : ''} title={deafened ? 'Voltar a ouvir' : 'Ensurdecer'} onClick={onToggleDeafen}>
          {deafened ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </button>
        <button type="button" className={isCameraOn ? 'on' : ''} title={isCameraOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={onToggleCamera}>
          {isCameraOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
        <button type="button" className={isScreenSharing ? 'on' : ''} title={isScreenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'} onClick={onToggleScreen}>
          {isScreenSharing ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
        </button>
        <button type="button" className={musicPlaying ? 'on' : ''} title="RonnBot Música" onClick={onOpenMusic}>
          <Music size={22} />
        </button>
        <button type="button" title="Configurações de voz" onClick={onOpenSettings}>
          <Sliders size={22} />
        </button>
        <button type="button" className="leave" title="Sair da call" onClick={onLeave}>
          <PhoneOff size={22} />
        </button>
        {!focus && (
          <div className="call-zoom" title="Tamanho das câmeras (ou Ctrl + rodinha)">
            <button type="button" onClick={() => setCamSize(s => Math.max(160, s - 40))}><Minus size={16} /></button>
            <input type="range" min={160} max={1200} step={10} value={camSize} onChange={e => setCamSize(Number(e.target.value))} />
            <button type="button" onClick={() => setCamSize(s => Math.min(1200, s + 40))}><Plus size={16} /></button>
          </div>
        )}
      </div>

      {menu && (
        <div className="call-volume-menu" style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}>
          {menu.type === 'voice' ? (
            <>
              <b>{menuPerson.name}</b>
              <div className="vol-row"><span>Volume da voz</span><span>{menuVoiceVol}%</span></div>
              <input type="range" min={0} max={400} step={10} value={menuVoiceVol} onChange={e => onUserVolume(menuPerson.userId, Number(e.target.value))} />
              <div className="vol-actions">
                <button type="button" onClick={() => onUserVolume(menuPerson.userId, menuVoiceVol === 0 ? 100 : 0)}>
                  {menuVoiceVol === 0 ? 'Desmutar' : 'Mutar pra mim'}
                </button>
                <button type="button" onClick={() => onUserVolume(menuPerson.userId, 100)}>Voltar a 100%</button>
              </div>
            </>
          ) : (
            <>
              <b>Stream de {menuPerson?.name}</b>
              <div className="vol-row"><span>Volume da stream</span><span>{menuScreenVol}%</span></div>
              <input type="range" min={0} max={100} step={5} value={menuScreenVol} onChange={e => onScreenVolume(menu.socketId, Number(e.target.value))} />
              <div className="vol-actions">
                <button type="button" onClick={() => onScreenMute(menu.socketId, !menuScreenMuted)}>
                  {menuScreenMuted ? 'Desmutar stream' : 'Mutar stream'}
                </button>
              </div>
              <div className="vol-row"><span>Qualidade pra mim</span></div>
              <div className="vol-actions quality">
                {SCREEN_QUALITIES.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    className={(screenQualities[menu.socketId] || 'source') === q.id ? 'active' : ''}
                    onClick={() => onScreenQuality?.(menu.socketId, q.id)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
