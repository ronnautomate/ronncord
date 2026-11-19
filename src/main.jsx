import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Hash, Volume2, VolumeX, Plus, Settings, Mic, MicOff, Headphones, HeadphoneOff,
  UserPlus, Users, Compass, ChevronDown, Crown, Shield, PhoneOff,
  MonitorUp, MonitorOff, Sliders, Sparkles, Video, VideoOff, Maximize2, X,
  Lock, Music
} from 'lucide-react';
import { apiFetch, connectSocket, getToken, setToken, resolveAssetUrl } from './lib/api.js';
import { VoiceManager, getSavedUserVolumes } from './lib/voiceManager.js';
import { getSavedVoiceSettings } from './lib/audioPipeline.js';
import { SoundFX } from './lib/soundEffects.js';
import { AuthScreen } from './components/AuthScreen.jsx';
import { ChatArea } from './components/ChatArea.jsx';
import { FriendsView } from './components/FriendsView.jsx';
import {
  CreateOrJoinServerModal,
  CreateChannelModal,
  InviteModal,
  ProfileModal,
  UserProfileModal,
  NewDmModal
} from './components/Modals.jsx';
import { VoiceSettingsModal } from './components/VoiceSettingsModal.jsx';
import { NotesModal } from './components/NotesModal.jsx';
import { MusicModal } from './components/MusicModal.jsx';
import { WhatsNewModal } from './components/WhatsNewModal.jsx';
import { ServerSettingsModal } from './components/ServerSettingsModal.jsx';
import { CallStage } from './components/CallStage.jsx';
import { NOVIDADES, isNew, markSeen } from './lib/novidades.js';
import './style.css';
import './discordia-extras.css';
import './discordia-extras-2.css';
import { applyTheme, getSavedTheme, nameColor } from './lib/themes.js';
import { isAvisoMessage, avisoText } from './lib/aviso.js';

applyTheme(getSavedTheme());

const DEMO_USER = {
  id: 'demo-user',
  username: 'ronn',
  display_name: 'Ronn (Demo)',
  avatar_color: '#5865F2',
  status: 'online',
  custom_status: 'Modo Demo Offline',
  bio: 'Criador do RONNCORD'
};

const DEMO_SERVERS = [
  {
    id: 'demo-srv-1',
    name: 'RONNCORD',
    icon_color: '#5865F2',
    invite_code: 'ronncord-hub',
    owner_id: 'demo-user',
    my_role: 'owner',
    channels: [
      { id: 'demo-ch-1', server_id: 'demo-srv-1', category: 'TEXT CHANNELS', name: 'general', type: 'text', topic: 'Chat geral da comunidade RONNCORD' },
      { id: 'demo-ch-2', server_id: 'demo-srv-1', category: 'TEXT CHANNELS', name: 'introductions', type: 'text', topic: 'Apresente-se!' },
      { id: 'demo-ch-3', server_id: 'demo-srv-1', category: 'TEXT CHANNELS', name: 'gaming', type: 'text', topic: 'Partidas e calls' },
      { id: 'demo-ch-4', server_id: 'demo-srv-1', category: 'VOICE CHANNELS', name: 'General Voice', type: 'voice', topic: '' },
      { id: 'demo-ch-5', server_id: 'demo-srv-1', category: 'VOICE CHANNELS', name: 'Gaming Room', type: 'voice', topic: '' }
    ],
    members: [
      DEMO_USER,
      { id: 'demo-alex', username: 'alex', display_name: 'Alex', avatar_color: '#57F287', status: 'online', custom_status: 'Jogando Valorant', role: 'admin' },
      { id: 'demo-sam', username: 'sam', display_name: 'Sam', avatar_color: '#EB459E', status: 'idle', custom_status: '', role: 'member' }
    ]
  }
];

const DEMO_INITIAL_MESSAGES = {
  'demo-ch-1': [
    {
      id: 'm1',
      channel_id: 'demo-ch-1',
      author_id: 'demo-user',
      author: DEMO_USER,
      content: 'Bem-vindo ao **RONNCORD**! 🚀 Plataforma própria com API ilimitada.',
      attachments: [],
      reactions: [{ emoji: '🚀', count: 2, users: ['demo-user', 'demo-alex'] }],
      created_at: Date.now() - 120000
    },
    {
      id: 'm2',
      channel_id: 'demo-ch-1',
      author_id: 'demo-alex',
      author: { id: 'demo-alex', username: 'alex', display_name: 'Alex', avatar_color: '#57F287', status: 'online' },
      content: 'Inicie o backend (`npm run server`) para usar tempo real com múltiplos usuários, upload de arquivos e WebSockets!',
      attachments: [],
      reactions: [],
      created_at: Date.now() - 60000
    }
  ]
};

function App() {
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [booting, setBooting] = useState(true);

  const [servers, setServers] = useState([]);
  const [viewMode, setViewMode] = useState('server'); // 'server' | 'home'
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);

  const [friends, setFriends] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [activeDmId, setActiveDmId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [demoMessagesMap, setDemoMessagesMap] = useState(DEMO_INITIAL_MESSAGES);
  const [typingMap, setTypingMap] = useState({});
  const [voiceChannelId, setVoiceChannelId] = useState(null);
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [voicePing, setVoicePing] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteVideos, setRemoteVideos] = useState([]);
  const [hiddenVideoIds, setHiddenVideoIds] = useState([]);
  const [screenQualities, setScreenQualities] = useState({}); // socketId de quem transmite -> qualidade que eu pedi
  const [hideMyScreen, setHideMyScreen] = useState(false); // escondi minha tela da sala (continua transmitindo)
  const [mutedScreenSockets, setMutedScreenSockets] = useState([]);
  const [voiceSettings, setVoiceSettings] = useState(getSavedVoiceSettings);

  const [showMembers, setShowMembers] = useState(true);
  const [muted, setMuted] = useState(() => localStorage.getItem('ronncord_muted') === '1');
  const [deafened, setDeafened] = useState(() => localStorage.getItem('ronncord_deafened') === '1');
  const [pttActive, setPttActive] = useState(false);
  const [screenVolumes, setScreenVolumes] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [dmActivity, setDmActivity] = useState({}); // threadId -> hora da última mensagem (ordena as DMs na barrinha)
  const [musicState, setMusicState] = useState(null);
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem('ronncord_music_vol'));
    return Number.isFinite(saved) ? saved : 0.35;
  });
  const musicAudioRef = useRef(null);
  const activeChannelIdRef = useRef(null);
  const activeDmIdRef = useRef(null);
  const viewModeRef = useRef('server');
  const userStatusRef = useRef('online');
  const dmThreadsRef = useRef([]);

  useEffect(() => { userStatusRef.current = user?.status || 'online'; }, [user?.status]);
  useEffect(() => { dmThreadsRef.current = dmThreads; }, [dmThreads]);
  // abrir canal (ou criar/entrar em servidor) volta a barra esquerda pro servidor
  useEffect(() => { if (viewMode === 'server') setSidebarMode('server'); }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('ronncord_music_vol', String(musicVolume));
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = deafened ? 0 : musicVolume;
    }
  }, [musicVolume, deafened]);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (!voiceChannelId || !musicState?.current) {
      audio.pause();
      if (audio.src) audio.removeAttribute('src');
      return;
    }
    if (audio.src !== musicState.current.url) {
      audio.src = musicState.current.url;
    }
    audio.volume = deafened ? 0 : musicVolume;
    if (musicState.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [musicState, voiceChannelId, deafened, musicVolume]);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    activeDmIdRef.current = activeDmId;
    viewModeRef.current = viewMode;
    const key = viewMode === 'server' ? activeChannelId : activeDmId;
    if (key) {
      setUnreadCounts(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [activeChannelId, activeDmId, viewMode]);

  const [drawer, setDrawer] = useState(null); // celular: null | 'nav' (servidores+canais) | 'members'
  const [whatsNew, setWhatsNew] = useState(null); // null | 'new' (sozinho) | 'all' (botão ✨)
  const [hasNews, setHasNews] = useState(() => NOVIDADES.items.some(it => isNew(it)));
  const [modal, setModal] = useState(null); // null | 'server' | 'channel-text' | 'channel-voice' | 'invite' | 'profile' | 'voice-settings' | 'new-dm'
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [volumeTarget, setVolumeTarget] = useState(null);
  const [userVolumes, setUserVolumes] = useState(getSavedUserVolumes);
  const socketRef = useRef(null);
  const lastReassertRef = useRef(0);
  const [sidebarMode, setSidebarMode] = useState('server'); // barra esquerda: 'server' (canais + DMs) | 'home' (amigos + DMs)
  const voiceManagerRef = useRef(null);
  const voiceChannelIdRef = useRef(null);
  const voiceCountRef = useRef(0);

  const activeServer = useMemo(
    () => servers.find(s => s.id === activeServerId) || null,
    [servers, activeServerId]
  );

  const activeChannel = useMemo(
    () => activeServer?.channels?.find(c => c.id === activeChannelId) || null,
    [activeServer, activeChannelId]
  );

  const activeDm = useMemo(
    () => dmThreads.find(t => t.id === activeDmId) || null,
    [dmThreads, activeDmId]
  );

  // Boot auth check
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    apiFetch('/api/auth/me')
      .then(data => {
        if (data.token) setToken(data.token);
        setUser(data.user);
      })
      .catch(() => setToken(''))
      .finally(() => setBooting(false));
  }, []);

  // Load servers, friends, DMs & Socket.IO when user logs in
  useEffect(() => {
    if (!user || isDemo) return;
    let mounted = true;

    async function loadInitial() {
      try {
        const [srvData, frData, dmData] = await Promise.all([
          apiFetch('/api/servers'),
          apiFetch('/api/friends'),
          apiFetch('/api/dms')
        ]);
        if (!mounted) return;
        setServers(srvData.servers);
        if (srvData.voiceParticipants) {
          setVoiceParticipants(prev => ({ ...srvData.voiceParticipants, ...prev }));
        }
        setFriends(frData.friends);
        setDmThreads(dmData.threads);
        joinAllRooms(srvData.servers, dmData.threads);

        if (srvData.servers.length > 0) {
          const first = srvData.servers[0];
          setViewMode('server');
          setActiveServerId(first.id);
          const firstText = first.channels.find(c => c.type === 'text');
          if (firstText) setActiveChannelId(firstText.id);
        } else {
          setViewMode('home');
          setActiveServerId(null);
          setActiveChannelId(null);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadInitial();

    const socket = connectSocket(getToken());
    socketRef.current = socket;

    // entra na sala de todos os canais de texto e DMs: assim a contagem de não lidas funciona
    // em qualquer canal e as DMs chegam mesmo sem estar abertas (como no discordia)
    const joinedRooms = new Set();
    function joinAllRooms(srvList, threads) {
      if (!socket?.connected) return;
      for (const srv of srvList || []) {
        for (const ch of srv.channels || []) {
          if (ch.type === 'text' && !joinedRooms.has(`c:${ch.id}`)) {
            joinedRooms.add(`c:${ch.id}`);
            socket.emit('join_channel', ch.id);
          }
        }
      }
      for (const t of threads || []) {
        if (!joinedRooms.has(`d:${t.id}`)) {
          joinedRooms.add(`d:${t.id}`);
          socket.emit('join_dm', t.id);
        }
      }
    }
    async function refreshDmThreads() {
      try {
        const d = await apiFetch('/api/dms');
        if (!mounted) return;
        setDmThreads(d.threads);
        joinAllRooms([], d.threads);
      } catch {}
    }
    // DM nova que outra pessoa abriu comigo aparece na lista sem precisar dar F5
    const dmPoll = setInterval(refreshDmThreads, 45000);

    if (socket) {
      socket.on('connect', () => {
        socket.emit('voice:sync');
        joinedRooms.clear();
        Promise.all([apiFetch('/api/servers'), apiFetch('/api/dms')])
          .then(([srv, dms]) => joinAllRooms(srv.servers, dms.threads))
          .catch(() => {});
      });
      socket.on('message:new', msg => {
        const targetKey = msg.channel_id || msg.dm_thread_id;
        const isCurrentlyOpen =
          (viewModeRef.current === 'server' && msg.channel_id === activeChannelIdRef.current) ||
          (viewModeRef.current === 'home' && msg.dm_thread_id === activeDmIdRef.current);

        if (msg.author_id !== user.id) {
          const isAviso = isAvisoMessage(msg.content);
          const mentioned =
            msg.content?.toLowerCase().includes(`@${user.username?.toLowerCase()}`) ||
            Boolean(msg.dm_thread_id) ||
            isAviso;
          // igual ao discordia: som só pra menção, DM ou /aviso, e nunca em Não Perturbe
          if (mentioned && userStatusRef.current !== 'dnd') SoundFX.message();
          if (msg.dm_thread_id && !dmThreadsRef.current.some(t => t.id === msg.dm_thread_id)) refreshDmThreads();
          if (!isCurrentlyOpen || document.hidden) {
            if (targetKey) {
              setUnreadCounts(prev => ({ ...prev, [targetKey]: (prev[targetKey] || 0) + 1 }));
            }
            if (mentioned && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
              new Notification(`${isAviso ? '📢 Aviso de ' : ''}${msg.author?.display_name || 'RONNCORD'}`, {
                body: (isAviso ? avisoText(msg.content) : msg.content) || 'Enviou um anexo'
              });
            }
          }
        }

        if (msg.dm_thread_id) setDmActivity(prev => ({ ...prev, [msg.dm_thread_id]: msg.created_at || Date.now() }));

        if (isCurrentlyOpen) {
          setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
        }
      });
      socket.on('message:updated', msg => {
        setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)));
      });
      socket.on('message:deleted', ({ id }) => {
        setMessages(prev => prev.filter(m => m.id !== id));
      });
      socket.on('channel:created', ch => {
        if (ch.type === 'text' && !joinedRooms.has(`c:${ch.id}`)) {
          joinedRooms.add(`c:${ch.id}`);
          socket.emit('join_channel', ch.id);
        }
        setServers(prev =>
          prev.map(s => (s.id === ch.server_id ? { ...s, channels: [...s.channels, ch] } : s))
        );
      });
      socket.on('channel:deleted', ({ serverId, channelId }) => {
        setServers(prev =>
          prev.map(s => (s.id === serverId ? { ...s, channels: s.channels.filter(c => c.id !== channelId) } : s))
        );
      });
      socket.on('server:updated', srv => {
        if (!srv?.id) return;
        setServers(prev => prev.map(s => (s.id === srv.id ? { ...s, name: srv.name, icon_color: srv.icon_color, icon_url: srv.icon_url } : s)));
      });
      socket.on('server:member_joined', ({ serverId, member }) => {
        if (!member) return;
        setServers(prev =>
          prev.map(s =>
            s.id === serverId && !s.members.some(m => m.id === member.id)
              ? { ...s, members: [...s.members, member] }
              : s
          )
        );
      });
      socket.on('presence:update', ({
        userId, status, custom_status, display_name, avatar_color, avatar_url,
        avatar_decoration, banner_color, banner_url, pronouns, bio,
        name_color, nameplate_style, clan_tag, clan_icon, badges_json, profile_effect
      }) => {
        // servidor antigo marca a gente offline quando uma aba fecha ou no F5 (a conexão velha cai
        // depois da nova). Se chegou "offline" pra mim e eu tô conectado, reafirmo meu status.
        if (userId === user.id && status === 'offline' && socket.connected) {
          const chosen = localStorage.getItem('ronncord_my_status') || 'online';
          if (chosen !== 'offline' && Date.now() - lastReassertRef.current > 5000) {
            lastReassertRef.current = Date.now();
            setTimeout(() => {
              apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ status: chosen }) })
                .then(d => d?.user && setUser(u => ({ ...u, status: d.user.status })))
                .catch(() => {});
            }, 1500);
          }
        }
        setServers(prev =>
          prev.map(s => ({
            ...s,
            members: s.members.map(m =>
              m.id === userId
                ? {
                    ...m,
                    status: status ?? m.status,
                    custom_status: custom_status ?? m.custom_status,
                    display_name: display_name ?? m.display_name,
                    avatar_color: avatar_color ?? m.avatar_color,
                    avatar_url: avatar_url !== undefined ? avatar_url : m.avatar_url,
                    avatar_decoration: avatar_decoration ?? m.avatar_decoration,
                    banner_color: banner_color ?? m.banner_color,
                    banner_url: banner_url !== undefined ? banner_url : m.banner_url,
                    pronouns: pronouns ?? m.pronouns,
                    bio: bio ?? m.bio,
                    name_color: name_color ?? m.name_color,
                    nameplate_style: nameplate_style ?? m.nameplate_style,
                    clan_tag: clan_tag ?? m.clan_tag,
                    clan_icon: clan_icon ?? m.clan_icon,
                    badges_json: badges_json ?? m.badges_json,
                    profile_effect: profile_effect ?? m.profile_effect
                  }
                : m
            )
          }))
        );
        setMessages(prev =>
          prev.map(msg =>
            msg.author_id === userId
              ? {
                  ...msg,
                  author: {
                    ...msg.author,
                    display_name: display_name ?? msg.author?.display_name,
                    avatar_color: avatar_color ?? msg.author?.avatar_color,
                    avatar_url: avatar_url !== undefined ? avatar_url : msg.author?.avatar_url,
                    avatar_decoration: avatar_decoration ?? msg.author?.avatar_decoration,
                    banner_color: banner_color ?? msg.author?.banner_color,
                    banner_url: banner_url !== undefined ? banner_url : msg.author?.banner_url,
                    name_color: name_color ?? msg.author?.name_color,
                    nameplate_style: nameplate_style ?? msg.author?.nameplate_style,
                    clan_tag: clan_tag ?? msg.author?.clan_tag,
                    clan_icon: clan_icon ?? msg.author?.clan_icon,
                    badges_json: badges_json ?? msg.author?.badges_json,
                    profile_effect: profile_effect ?? msg.author?.profile_effect
                  }
                }
              : msg
          )
        );
      });
      socket.on('typing:update', ({ userId, displayName, channelId, dmThreadId, isTyping }) => {
        if (userId === user.id) return;
        const key = channelId || dmThreadId;
        setTypingMap(prev => {
          const cur = prev[key] || {};
          const next = { ...cur };
          if (isTyping) next[userId] = displayName;
          else delete next[userId];
          return { ...prev, [key]: next };
        });
      });
      socket.on('voice:participants', ({ channelId, participants }) => {
        if (voiceChannelIdRef.current === channelId) {
          const prevCount = voiceCountRef.current;
          if (participants.length > prevCount && prevCount > 0) SoundFX.userJoined();
          else if (participants.length < prevCount && participants.length > 0) SoundFX.userLeft();
          voiceCountRef.current = participants.length;
        }
        setVoiceParticipants(prev => ({ ...prev, [channelId]: participants }));
      });
      socket.on('music:state', state => {
        if (voiceChannelIdRef.current === state?.channelId) {
          setMusicState(state);
        }
      });

      voiceManagerRef.current = new VoiceManager(socket, {
        onPing: setVoicePing,
        onSpeakingChange: setIsSpeaking,
        onRemoteVideos: videos => {
          setRemoteVideos(videos);
          setHiddenVideoIds(prev => prev.filter(id => videos.some(v => v.id === id)));
        },
        onError: msg => alert(msg)
      });
    }

    return () => {
      mounted = false;
      clearInterval(dmPoll);
      voiceManagerRef.current?.destroy();
      voiceManagerRef.current = null;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, isDemo]);

  // Load channel or DM messages
  useEffect(() => {
    if (!user) return;
    if (viewMode === 'server' && activeChannelId) {
      if (isDemo) {
        setMessages(demoMessagesMap[activeChannelId] || []);
        return;
      }
      socketRef.current?.emit('join_channel', activeChannelId);
      apiFetch(`/api/channels/${activeChannelId}/messages`)
        .then(data => setMessages(data.messages))
        .catch(console.error);
      return;
    }
    if (viewMode === 'home' && activeDmId) {
      if (isDemo) {
        setMessages(demoMessagesMap[activeDmId] || []);
        return;
      }
      socketRef.current?.emit('join_dm', activeDmId);
      apiFetch(`/api/dms/${activeDmId}/messages`)
        .then(data => setMessages(data.messages))
        .catch(console.error);
    }
  }, [user, isDemo, viewMode, activeChannelId, activeDmId]);

  function enterDemoMode() {
    setIsDemo(true);
    setUser(DEMO_USER);
    setServers(DEMO_SERVERS);
    setActiveServerId('demo-srv-1');
    setActiveChannelId('demo-ch-1');
    setMessages(DEMO_INITIAL_MESSAGES['demo-ch-1']);
  }

  function handleLogout() {
    setToken('');
    socketRef.current?.disconnect();
    setUser(null);
    setIsDemo(false);
    setServers([]);
    setMessages([]);
    setModal(null);
  }

  async function handleCreateServer(name) {
    if (isDemo) {
      const id = `demo-srv-${Date.now()}`;
      const chId = `demo-ch-${Date.now()}`;
      const srv = {
        id,
        name,
        icon_color: '#57F287',
        invite_code: `demo-${Math.random().toString(36).slice(2, 6)}`,
        owner_id: user.id,
        my_role: 'owner',
        channels: [{ id: chId, server_id: id, category: 'TEXT CHANNELS', name: 'general', type: 'text', topic: 'Canal geral' }],
        members: [user]
      };
      setServers(prev => [...prev, srv]);
      setViewMode('server');
      setActiveServerId(id);
      setActiveChannelId(chId);
      return;
    }
    const { server } = await apiFetch('/api/servers', { method: 'POST', body: JSON.stringify({ name }) });
    setServers(prev => [...prev, server]);
    setViewMode('server');
    setActiveServerId(server.id);
    const firstText = server.channels.find(c => c.type === 'text');
    if (firstText) setActiveChannelId(firstText.id);
  }

  async function handleJoinServer(inviteCode) {
    if (isDemo) throw new Error('Entre com uma conta real para entrar em servidores por convite.');
    const { server } = await apiFetch(`/api/servers/join/${encodeURIComponent(inviteCode)}`, { method: 'POST' });
    setServers(prev => (prev.some(s => s.id === server.id) ? prev : [...prev, server]));
    setViewMode('server');
    setActiveServerId(server.id);
    const firstText = server.channels.find(c => c.type === 'text');
    if (firstText) setActiveChannelId(firstText.id);
  }

  async function handleImportDiscord(payload) {
    if (isDemo) throw new Error('Entre com uma conta real para importar servidores do Discord.');
    const { server } = await apiFetch('/api/servers/import-discord', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setServers(prev => [...prev, server]);
    setViewMode('server');
    setActiveServerId(server.id);
    const firstText = server.channels.find(c => c.type === 'text');
    if (firstText) setActiveChannelId(firstText.id);
  }

  async function handleCreateChannel({ name, type, topic }) {
    if (!activeServer) return;
    if (isDemo) {
      const ch = {
        id: `demo-ch-${Date.now()}`,
        server_id: activeServer.id,
        category: type === 'voice' ? 'VOICE CHANNELS' : 'TEXT CHANNELS',
        name,
        type,
        topic
      };
      setServers(prev => prev.map(s => (s.id === activeServer.id ? { ...s, channels: [...s.channels, ch] } : s)));
      if (type === 'text') setActiveChannelId(ch.id);
      return;
    }
    const { channel } = await apiFetch(`/api/servers/${activeServer.id}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type, topic })
    });
    setServers(prev =>
      prev.map(s =>
        s.id === activeServer.id && !s.channels.some(c => c.id === channel.id)
          ? { ...s, channels: [...s.channels, channel] }
          : s
      )
    );
    if (channel.type === 'text') setActiveChannelId(channel.id);
  }

  async function handleSendMessage(payload) {
    if (isDemo) {
      const targetId = viewMode === 'server' ? activeChannelId : activeDmId;
      const newMsg = {
        id: `m-${Date.now()}`,
        channel_id: viewMode === 'server' ? targetId : null,
        dm_thread_id: viewMode === 'home' ? targetId : null,
        author_id: user.id,
        author: user,
        content: payload.content,
        attachments: payload.attachments || [],
        reply_to_id: payload.reply_to_id,
        reactions: [],
        created_at: Date.now()
      };
      setDemoMessagesMap(prev => ({ ...prev, [targetId]: [...(prev[targetId] || []), newMsg] }));
      setMessages(prev => [...prev, newMsg]);
      return;
    }

    const trimmed = (payload.content || '').trim();
    if (trimmed.startsWith('!play ') || trimmed === '!skip' || trimmed === '!stop') {
      if (!voiceChannelId) {
        alert('Entre em um canal de voz primeiro para usar os comandos do RonnBot Música.');
        return;
      }
      if (trimmed.startsWith('!play ')) {
        socketRef.current?.emit('music:play', { channelId: voiceChannelId, query: trimmed.slice(6).trim() });
      } else if (trimmed === '!skip') {
        socketRef.current?.emit('music:skip', { channelId: voiceChannelId });
      } else if (trimmed === '!stop') {
        socketRef.current?.emit('music:stop', { channelId: voiceChannelId });
      }
      return;
    }

    if (viewMode === 'server' && activeChannelId) {
      await apiFetch(`/api/channels/${activeChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } else if (viewMode === 'home' && activeDmId) {
      await apiFetch(`/api/dms/${activeDmId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  }

  async function handleEditMessage(messageId, content) {
    if (isDemo) {
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, content, edited_at: Date.now() } : m)));
      return;
    }
    await apiFetch(`/api/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ content }) });
  }

  async function handleDeleteMessage(messageId) {
    if (isDemo) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }
    await apiFetch(`/api/messages/${messageId}`, { method: 'DELETE' });
  }

  async function handleToggleReaction(messageId, emoji) {
    if (isDemo) {
      setMessages(prev =>
        prev.map(m => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find(r => r.emoji === emoji);
          let next;
          if (existing) {
            const hasMine = existing.users.includes(user.id);
            const users = hasMine ? existing.users.filter(u => u !== user.id) : [...existing.users, user.id];
            next = users.length ? m.reactions.map(r => (r.emoji === emoji ? { emoji, count: users.length, users } : r)) : m.reactions.filter(r => r.emoji !== emoji);
          } else {
            next = [...m.reactions, { emoji, count: 1, users: [user.id] }];
          }
          return { ...m, reactions: next };
        })
      );
      return;
    }
    await apiFetch(`/api/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });
  }

  async function handleTogglePin(messageId) {
    if (isDemo) {
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, pinned: !m.pinned } : m)));
      return;
    }
    await apiFetch(`/api/messages/${messageId}/pin`, { method: 'POST' });
  }

  async function handleUploadFile(file) {
    if (isDemo) {
      return {
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        mimetype: file.type
      };
    }
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch('/api/upload', { method: 'POST', body: fd });
  }

  async function handleSaveProfile(updates) {
    if (isDemo) {
      setUser(prev => ({ ...prev, ...updates }));
      return;
    }
    const { user: updated } = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    if (updates.status) localStorage.setItem('ronncord_my_status', updates.status);
    setUser(updated);
  }

  async function handleSaveServer(updates) {
    if (!activeServer) return;
    if (isDemo) {
      setServers(prev => prev.map(s => (s.id === activeServer.id ? { ...s, ...updates } : s)));
      return;
    }
    try {
      const { server } = await apiFetch(`/api/servers/${activeServer.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      setServers(prev => prev.map(s => (s.id === server.id ? { ...s, name: server.name, icon_color: server.icon_color, icon_url: server.icon_url } : s)));
    } catch (err) {
      if (err.message === 'Erro 404') {
        throw new Error('O servidor do RONNCORD ainda não tem essa função: falta fazer o deploy da versão nova no Render.');
      }
      throw err;
    }
  }

  async function handleOpenDM(targetUserId) {
    if (targetUserId === user.id) return;
    if (isDemo) {
      alert('Mensagens diretas em tempo real requerem o backend ativo.');
      return;
    }
    const { thread } = await apiFetch('/api/dms', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    });
    setDmThreads(prev => (prev.some(t => t.id === thread.id) ? prev : [thread, ...prev]));
    setViewMode('home');
    setActiveDmId(thread.id);
  }

  // Push-to-Talk (Pressionar para Falar)
  useEffect(() => {
    if (!voiceChannelId || !voiceSettings.pttEnabled) {
      setPttActive(false);
      return;
    }
    const targetKey = voiceSettings.pttKey || 'Space';
    // Keep mic muted while PTT is active until key is pressed
    voiceManagerRef.current?.setMuted(true);

    const onKeyDown = e => {
      if (e.code !== targetKey || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (targetKey === 'Space') e.preventDefault();
      setPttActive(true);
      if (!muted) voiceManagerRef.current?.setMuted(false);
    };
    const onKeyUp = e => {
      if (e.code !== targetKey) return;
      setPttActive(false);
      voiceManagerRef.current?.setMuted(true);
    };
    const onBlur = () => {
      setPttActive(false);
      voiceManagerRef.current?.setMuted(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [voiceChannelId, voiceSettings.pttEnabled, voiceSettings.pttKey, muted]);

  async function toggleVoiceChannel(ch, forceJoin = false) {
    if (isDemo) {
      alert('Salas de voz, câmera e tela 1080p60 WebRTC requerem o backend ativo (`npm run server`). Você já pode testar seu microfone no ícone de Configurações de Voz (Sliders)!');
      return;
    }
    if (voiceChannelId === ch.id && !forceJoin) {
      SoundFX.leaveVoice();
      voiceChannelIdRef.current = null;
      voiceCountRef.current = 0;
      await voiceManagerRef.current?.leave();
      setVoiceChannelId(null);
      setIsCameraOn(false);
      setIsScreenSharing(false);
      setLocalCameraStream(null);
      setLocalScreenStream(null);
    } else if (voiceChannelId !== ch.id) {
      voiceChannelIdRef.current = ch.id;
      voiceCountRef.current = 0;
      const effectiveMuted = voiceSettings.pttEnabled ? true : muted;
      await voiceManagerRef.current?.join(ch.id, voiceSettings, {
        muted: effectiveMuted,
        deafened
      });
      setVoiceChannelId(ch.id);
      SoundFX.joinVoice();
    }
  }

  async function leaveVoice() {
    SoundFX.leaveVoice();
    voiceChannelIdRef.current = null;
    voiceCountRef.current = 0;
    try {
      await voiceManagerRef.current?.leave();
    } catch {}
    setVoiceChannelId(null);
    setMusicState(null);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setLocalCameraStream(null);
    setLocalScreenStream(null);
    setRemoteVideos([]);
    setHiddenVideoIds([]);
    setHideMyScreen(false);
    setViewMode(v => (v === 'voice' ? 'server' : v));
  }

  // entra na call (se ainda não estiver) e abre a sala, igual no discordia
  async function openVoiceRoom(ch) {
    if (isDemo) return toggleVoiceChannel(ch);
    if (voiceChannelId !== ch.id) await toggleVoiceChannel(ch, true);
    setSidebarMode('server');
    setViewMode('voice');
    setDrawer(null);
  }

  // sair / voltar a assistir uma stream sem sair da call (o som da tela muta junto)
  function leaveStream(id) {
    if (id === 'me') return setHideMyScreen(true);
    setHiddenVideoIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    const v = remoteVideos.find(x => x.id === id);
    if (v) voiceManagerRef.current?.setScreenAudioMuted(v.socketId, true);
  }
  function watchStream(id) {
    if (id === 'me') return setHideMyScreen(false);
    setHiddenVideoIds(prev => prev.filter(x => x !== id));
    const v = remoteVideos.find(x => x.id === id);
    if (v && !mutedScreenSockets.includes(v.socketId)) voiceManagerRef.current?.setScreenAudioMuted(v.socketId, false);
  }

  async function toggleCamera() {
    if (!voiceChannelId) return;
    if (isCameraOn) {
      await voiceManagerRef.current?.stopCamera();
      setIsCameraOn(false);
      setLocalCameraStream(null);
      SoundFX.streamStop();
    } else {
      try {
        const stream = await voiceManagerRef.current?.startCamera();
        setIsCameraOn(true);
        setLocalCameraStream(stream || null);
        SoundFX.streamStart();
      } catch (err) {
        alert('Não foi possível ligar a câmera: ' + err.message);
      }
    }
  }

  async function toggleScreenShare() {
    if (!voiceChannelId) return;
    if (isScreenSharing) {
      await voiceManagerRef.current?.stopScreenShare();
      setHideMyScreen(false);
      setIsScreenSharing(false);
      setLocalScreenStream(null);
      SoundFX.streamStop();
    } else {
      try {
        const stream = await voiceManagerRef.current?.startScreenShare();
        setIsScreenSharing(true);
        setLocalScreenStream(stream || null);
        SoundFX.streamStart();
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          alert('Erro ao compartilhar tela: ' + err.message);
        }
      }
    }
  }

  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('ronncord_muted', next ? '1' : '0');
    voiceManagerRef.current?.setMuted(next || (voiceSettings.pttEnabled && !pttActive));
    if (next) SoundFX.mute();
    else SoundFX.unmute();
  }

  function handleToggleDeafen() {
    const next = !deafened;
    setDeafened(next);
    localStorage.setItem('ronncord_deafened', next ? '1' : '0');
    voiceManagerRef.current?.setDeafened(next);
    if (next) SoundFX.deafen();
    else SoundFX.undeafen();
  }

  // O que há de novo: abre sozinho uma vez quando sai versão nova (depois do login)
  useEffect(() => {
    if (user && hasNews && whatsNew === null && !sessionStorage.getItem('ronncord_news_shown')) {
      sessionStorage.setItem('ronncord_news_shown', '1');
      setWhatsNew('new');
    }
  }, [user]);

  function closeWhatsNew() {
    markSeen();
    setHasNews(false);
    setWhatsNew(null);
  }

  const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

  useEffect(() => {
    if (!volumeTarget) return;
    const onKey = e => e.key === 'Escape' && setVolumeTarget(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [volumeTarget]);

  // pessoa da DM: a foto e o status vêm da lista de membros dos servidores (a API de DMs só manda a cor)
  function findPerson(userId) {
    for (const srv of servers) {
      const m = srv.members?.find(x => x.id === userId);
      if (m) return m;
    }
    return null;
  }

  const callPeople = (voiceParticipants[voiceChannelId] || []).map(p => {
    const isMe = p.userId === user?.id;
    const m = findPerson(p.userId);
    return {
      socketId: p.socketId,
      userId: p.userId,
      name: p.displayName || m?.display_name || '?',
      avatarUrl: p.avatarUrl || (isMe ? user?.avatar_url : null) || m?.avatar_url || null,
      color: p.avatarColor || (isMe ? user?.avatar_color : null) || m?.avatar_color || '#5865F2',
      deco: (p.avatarDecoration && p.avatarDecoration !== 'none' ? p.avatarDecoration : m?.avatar_decoration) || 'none',
      speaking: Boolean(p.speaking || (isMe && isSpeaking)),
      muted: isMe ? muted : Boolean(p.muted),
      deafened: isMe ? deafened : Boolean(p.deafened),
      isMe
    };
  });

  const railDms = dmThreads
    .map((t, i) => ({ t, i }))
    .sort((a, b) =>
      ((unreadCounts[b.t.id] || 0) > 0) - ((unreadCounts[a.t.id] || 0) > 0) ||
      (dmActivity[b.t.id] || 0) - (dmActivity[a.t.id] || 0) ||
      a.i - b.i
    )
    .map(x => x.t);

  function renderDmRow(t) {
    const person = findPerson(t.peer_id);
    const name = t.peer_display_name || t.peer_username || '?';
    const status = person?.status || t.peer_status || 'offline';
    return (
      <div
        key={t.id}
        className={`channel dm-row ${viewMode === 'home' && activeDmId === t.id ? 'selected' : ''} ${unreadCounts[t.id] > 0 ? 'has-unread' : ''}`}
        onClick={() => { setViewMode('home'); setActiveDmId(t.id); setDrawer(null); }}
      >
        <div className="avatar xs" style={{ background: person?.avatar_color || t.peer_avatar_color }}>
          {person?.avatar_url ? (
            <img src={resolveAssetUrl(person.avatar_url)} alt={name} className="avatar-img" />
          ) : (
            name[0].toUpperCase()
          )}
          <span className={`status-dot ${status}`} />
        </div>
        <span style={{ flex: 1 }}>{name}</span>
        {unreadCounts[t.id] > 0 && <span className="unread-badge">{unreadCounts[t.id]}</span>}
      </div>
    );
  }

  if (booting) {
    return <div className="boot-screen">Carregando RONNCORD...</div>;
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={setUser} onEnterDemo={enterDemoMode} />;
  }

  const currentTypingKey = viewMode === 'server' ? activeChannelId : activeDmId;
  const typingUsers = Object.values(typingMap[currentTypingKey] || {});

  const textChannels = activeServer?.channels?.filter(c => c.type === 'text') || [];
  const voiceChannels = activeServer?.channels?.filter(c => c.type === 'voice') || [];
  // quem tá numa call conta como online mesmo se a presença atrasou (igual ao discordia)
  const inSomeCall = new Set(Object.values(voiceParticipants).flat().map(p => p.userId));
  // meu status: o que eu escolhi (o banco do servidor antigo às vezes fica "offline" por engano)
  const chosenStatus = localStorage.getItem('ronncord_my_status') || 'online';
  const myStatus = chosenStatus === 'offline' ? 'offline' : (user.status && user.status !== 'offline' ? user.status : chosenStatus);
  const withLiveStatus = (activeServer?.members || []).map(m =>
    m.status === 'offline' && (inSomeCall.has(m.id) || m.id === user.id)
      ? { ...m, status: m.id === user.id ? myStatus : 'online' }
      : m
  );
  const onlineMembers = withLiveStatus.filter(m => m.status !== 'offline');
  const offlineMembers = withLiveStatus.filter(m => m.status === 'offline');

  return (
    <div className={`app ${drawer ? `drawer-${drawer}` : ''}`}>
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)} />}
      {/* Server Rail */}
      <aside className="server-rail">
        <button
          className={`server-logo ${sidebarMode === 'home' ? 'active' : ''}`}
          title="Mensagens Diretas e Amigos"
          onClick={() => { setSidebarMode('home'); setViewMode('home'); setActiveDmId(null); }}
        >
          <Compass size={22} />
        </button>

        {railDms.map(t => {
          const person = findPerson(t.peer_id);
          const name = t.peer_display_name || t.peer_username || '?';
          const unread = unreadCounts[t.id] || 0;
          return (
            <button
              key={`dm-${t.id}`}
              className={`server-logo rail-dm ${viewMode === 'home' && activeDmId === t.id ? 'active' : ''}`}
              style={{ background: person?.avatar_color || t.peer_avatar_color }}
              title={`DM com ${name}`}
              onClick={() => { setSidebarMode('home'); setViewMode('home'); setActiveDmId(t.id); setDrawer(null); }}
            >
              {person?.avatar_url ? (
                <img src={resolveAssetUrl(person.avatar_url)} alt={name} className="server-icon-img" />
              ) : (
                name[0].toUpperCase()
              )}
              {unread > 0 && <span className="rail-dm-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
          );
        })}

        <div className="rail-divider" />

        {servers.map(srv => (
          <button
            key={srv.id}
            className={`server-logo ${sidebarMode === 'server' && activeServerId === srv.id ? 'active' : ''} ${srv.icon_url ? 'has-icon' : ''}`}
            style={sidebarMode === 'server' && activeServerId === srv.id && !srv.icon_url ? { background: srv.icon_color } : {}}
            title={srv.name}
            onClick={() => {
              setSidebarMode('server');
              setViewMode('server');
              setActiveServerId(srv.id);
              const firstText = srv.channels.find(c => c.type === 'text');
              setActiveChannelId(firstText?.id || null);
            }}
          >
            {srv.icon_url ? (
              <img src={resolveAssetUrl(srv.icon_url)} alt={srv.name} className="server-icon-img" />
            ) : (
              srv.name.slice(0, 2).toUpperCase()
            )}
          </button>
        ))}

        <button
          className="server-logo add-server-btn"
          title="Criar ou Entrar em Servidor"
          onClick={() => setModal('server')}
        >
          <Plus size={22} />
        </button>

        <button
          className={`server-logo whats-new-btn ${hasNews ? 'has-new' : ''}`}
          title="O que há de novo"
          onClick={() => { setDrawer(null); setWhatsNew('all'); }}
        >
          <Sparkles size={20} />
        </button>
      </aside>

      {/* Channels / DMs Sidebar */}
      <aside className="sidebar">
        {sidebarMode === 'server' && activeServer ? (
          <>
            <div className="workspace-title">
              <button
                type="button"
                className="workspace-name-btn"
                title="Configurações do servidor (nome e imagem)"
                onClick={() => setModal('server-settings')}
              >
                {activeServer.name}
              </button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="icon-btn xs"
                  title="Convidar Amigos"
                  onClick={() => setModal('invite')}
                >
                  <UserPlus size={16} />
                </button>
                <button
                  className="icon-btn xs"
                  title="Configurações do servidor (nome e imagem)"
                  onClick={() => setModal('server-settings')}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>

            <div className="sidebar-scroll">
              <div className="sidebar-section">
                <div className="section-heading">
                  <p className="section-label">CANAIS DE TEXTO</p>
                  <button className="icon-btn xs" title="Criar Canal de Texto" onClick={() => setModal('channel-text')}>
                    <Plus size={14} />
                  </button>
                </div>
                {textChannels.map(ch => (
                  <div
                    key={ch.id}
                    className={`channel ${viewMode === 'server' && activeChannelId === ch.id ? 'selected' : ''}`}
                    onClick={() => {
                      setViewMode('server');
                      setActiveChannelId(ch.id);
                      setDrawer(null);
                      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                        Notification.requestPermission().catch(() => {});
                      }
                    }}
                  >
                    <Hash size={16} />
                    <span style={{ flex: 1 }}>{ch.name}</span>
                    {unreadCounts[ch.id] > 0 && <span className="unread-badge">{unreadCounts[ch.id]}</span>}
                  </div>
                ))}
              </div>

              <div className="sidebar-section">
                <div className="section-heading">
                  <p className="section-label">CANAIS DE VOZ</p>
                  <button className="icon-btn xs" title="Criar Canal de Voz" onClick={() => setModal('channel-voice')}>
                    <Plus size={14} />
                  </button>
                </div>
                {voiceChannels.map(ch => {
                  const participants = voiceParticipants[ch.id] || [];
                  const connectedHere = voiceChannelId === ch.id;
                  return (
                    <div key={ch.id}>
                      <div
                        className={`channel ${connectedHere && viewMode === 'voice' ? 'selected' : ''} ${connectedHere ? 'connected' : ''}`}
                        title={connectedHere ? 'Abrir a sala' : 'Entrar na call'}
                        onClick={() => openVoiceRoom(ch)}
                      >
                        <Volume2 size={16} />
                        <span>{ch.name}</span>
                      </div>
                      {participants.length > 0 && (
                        <div className="voice-participants">
                          {participants.map(p => {
                            const isMe = p.userId === user.id;
                            const srvMember = activeServer?.members?.find(m => m.id === p.userId);
                            const vAvatarUrl = p.avatarUrl || (isMe ? user.avatar_url : null) || srvMember?.avatar_url;
                            const vDeco = (p.avatarDecoration && p.avatarDecoration !== 'none'
                              ? p.avatarDecoration
                              : (isMe ? user.avatar_decoration : null) || srvMember?.avatar_decoration) || 'none';
                            const vColor = p.avatarColor || (isMe ? user.avatar_color : null) || srvMember?.avatar_color || '#5865F2';
                            return (
                            <div
                              key={p.socketId}
                              className={`voice-user clickable ${p.speaking ? 'speaking' : ''}`}
                              title={p.userId !== user.id ? 'Clique: ver perfil / DM • Botão direito: volume (0%-400%)' : p.displayName}
                              onClick={() => {
                                if (srvMember) {
                                  setSelectedProfile(srvMember);
                                } else {
                                  setSelectedProfile({
                                    id: p.userId,
                                    username: p.displayName.toLowerCase(),
                                    display_name: p.displayName,
                                    avatar_color: vColor,
                                    avatar_url: vAvatarUrl,
                                    avatar_decoration: vDeco,
                                    status: 'online'
                                  });
                                }
                              }}
                              onContextMenu={e => {
                                if (p.userId !== user.id) {
                                  e.preventDefault();
                                  // mesmo menu flutuante da sala (abre onde clicou)
                                  setVolumeTarget({
                                    ...p,
                                    x: Math.max(8, Math.min(e.clientX, window.innerWidth - 260)),
                                    y: Math.max(8, Math.min(e.clientY + 10, window.innerHeight - 180))
                                  });
                                }
                              }}
                            >
                              <span
                                className={`avatar xs ${p.speaking ? 'speaking-ring' : ''} deco-${vDeco}`}
                                style={{ background: vColor }}
                              >
                                {vAvatarUrl ? (
                                  <img src={resolveAssetUrl(vAvatarUrl)} alt={p.displayName} className="avatar-img" />
                                ) : (
                                  p.displayName[0].toUpperCase()
                                )}
                              </span>
                              <span className="voice-user-name">{p.displayName}</span>
                              {p.userId !== user.id && (userVolumes[p.userId] ?? 100) !== 100 && (
                                <small className="vol-tag">{userVolumes[p.userId]}%</small>
                              )}
                              {p.muted && <MicOff size={12} className="voice-badge-muted" />}
                              {p.deafened && <HeadphoneOff size={12} className="voice-badge-muted" />}
                              {p.cameraOn && <Video size={12} style={{ color: '#57F287' }} />}
                              {p.screenSharing && (
                                <button
                                  type="button"
                                  className="live-badge clickable"
                                  title="Assistir transmissão"
                                  onClick={async e => {
                                    e.stopPropagation();
                                    setHiddenVideoIds([]);
                                    await openVoiceRoom(ch);
                                  }}
                                >
                                  AO VIVO
                                </button>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="workspace-title">
              <span>Início</span>
            </div>
            <div className="sidebar-scroll">
              <div className="sidebar-section">
                <div
                  className={`channel ${!activeDmId ? 'selected' : ''}`}
                  onClick={() => { setViewMode('home'); setActiveDmId(null); setDrawer(null); }}
                >
                  <Users size={16} />
                  <span>Amigos</span>
                </div>
              </div>
              <div className="sidebar-section">
                <div className="section-heading">
                  <p className="section-label">MENSAGENS DIRETAS</p>
                  <button className="icon-btn xs" title="Nova Mensagem Direta" onClick={() => setModal('new-dm')}>
                    <Plus size={14} />
                  </button>
                </div>
                {dmThreads.map(t => renderDmRow(t))}
              </div>
            </div>
          </>
        )}

        {volumeTarget && (
          <>
            <div className="volume-menu-backdrop" onClick={() => setVolumeTarget(null)} onContextMenu={e => { e.preventDefault(); setVolumeTarget(null); }} />
            <div className="call-volume-menu" style={{ left: volumeTarget.x, top: volumeTarget.y }}>
              <b>{volumeTarget.displayName}</b>
              <div className="vol-row"><span>Volume da voz</span><span>{userVolumes[volumeTarget.userId] ?? 100}%</span></div>
              <input
                type="range"
                min={0}
                max={400}
                step={10}
                value={userVolumes[volumeTarget.userId] ?? 100}
                onChange={e => {
                  const val = Number(e.target.value);
                  voiceManagerRef.current?.setUserVolume(volumeTarget.userId, val);
                  setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: val }));
                }}
              />
              <div className="vol-actions">
                <button
                  type="button"
                  onClick={() => {
                    const next = (userVolumes[volumeTarget.userId] ?? 100) === 0 ? 100 : 0;
                    voiceManagerRef.current?.setUserVolume(volumeTarget.userId, next);
                    setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: next }));
                  }}
                >
                  {(userVolumes[volumeTarget.userId] ?? 100) === 0 ? 'Desmutar' : 'Mutar pra mim'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    voiceManagerRef.current?.setUserVolume(volumeTarget.userId, 100);
                    setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: 100 }));
                  }}
                >
                  Voltar a 100%
                </button>
              </div>
            </div>
          </>
        )}

        {voiceChannelId && (
          <div className="voice-status-bar">
            <div
              className="voice-status-open"
              title="Abrir a sala"
              onClick={() => {
                const ch = activeServer?.channels?.find(c => c.id === voiceChannelId) ||
                  servers.flatMap(sv => sv.channels || []).find(c => c.id === voiceChannelId);
                if (ch) openVoiceRoom(ch);
              }}
            >
              <strong>
                <Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} />
                Voz Conectada {voicePing !== null ? `• ${voicePing} ms` : ''}
              </strong>
              <small>
                {voiceSettings.noiseMode === 'hybrid'
                  ? 'AI Max (RNNoise+GTCRN) • Opus 10ms'
                  : voiceSettings.noiseMode === 'gtcrn'
                  ? 'AI Ultra (GTCRN) • Opus 10ms'
                  : voiceSettings.noiseMode === 'rnnoise'
                  ? 'RNNoise SIMD • Opus 10ms'
                  : 'Estúdio Puro • Opus 10ms'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`icon-btn ${isCameraOn ? 'active' : ''}`}
                title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera (1080p 60fps)'}
                onClick={toggleCamera}
              >
                {isCameraOn ? <VideoOff size={16} /> : <Video size={16} />}
              </button>
              <button
                className={`icon-btn ${isScreenSharing ? 'active' : ''}`}
                title={isScreenSharing ? 'Parar Compartilhamento' : 'Compartilhar Tela (1080p 60fps)'}
                onClick={toggleScreenShare}
              >
                {isScreenSharing ? <MonitorOff size={16} /> : <MonitorUp size={16} />}
              </button>
              <button
                className={`icon-btn ${musicState?.isPlaying ? 'active' : ''}`}
                title="RonnBot Música"
                onClick={() => setModal('music')}
              >
                <Music size={16} />
              </button>
              <button
                className="icon-btn"
                title="Configurações de Voz e Supressão IA"
                onClick={() => setModal('voice-settings')}
              >
                <Sliders size={16} />
              </button>
              <button
                className="icon-btn danger"
                title="Desconectar"
                onClick={leaveVoice}
              >
                <PhoneOff size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="user-panel">
          <div className="user-panel-left" onClick={() => setModal('profile')}>
            <div className={`avatar ${isSpeaking ? 'speaking-ring' : ''} deco-${user.avatar_decoration || 'none'}`} style={{ background: user.avatar_color }}>
              {user.avatar_url ? (
                <img src={resolveAssetUrl(user.avatar_url)} alt={user.display_name} className="avatar-img" />
              ) : (
                (user.display_name || user.username)[0].toUpperCase()
              )}
              <span className={`status-dot ${myStatus}`} />
            </div>
            <div className="user-details">
              <strong>{user.display_name}</strong>
              <small>{user.custom_status || `@${user.username}`}</small>
            </div>
          </div>
          <div className="user-panel-actions">
            <button className={`icon-btn xs ${muted ? 'danger' : ''}`} onClick={handleToggleMute} title="Silenciar Microfone">
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button className={`icon-btn xs ${deafened ? 'danger' : ''}`} onClick={handleToggleDeafen} title="Desativar Áudio">
              {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
            </button>
            <button className="icon-btn xs" onClick={() => setModal('notes')} title="Notas Privadas (Criptografadas)">
              <Lock size={16} />
            </button>
            <button className="icon-btn xs" onClick={() => setModal('voice-settings')} title="Áudio & Supressão de Ruído IA">
              <Sliders size={16} />
            </button>
            <button className="icon-btn xs" onClick={() => setModal('profile')} title="Configurações de Perfil">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-stage">
      {viewMode === 'voice' && voiceChannelId ? (
        <CallStage
          channelName={(servers.flatMap(sv => sv.channels || []).find(c => c.id === voiceChannelId) || {}).name || 'Sala'}
          people={callPeople}
          remoteVideos={remoteVideos}
          localCameraStream={localCameraStream}
          localScreenStream={localScreenStream}
          hiddenVideoIds={hiddenVideoIds}
          hideMyScreen={hideMyScreen}
          userVolumes={userVolumes}
          screenVolumes={screenVolumes}
          mutedScreenSockets={mutedScreenSockets}
          muted={muted}
          deafened={deafened}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
          musicPlaying={Boolean(musicState?.isPlaying)}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
          onToggleCamera={toggleCamera}
          onToggleScreen={toggleScreenShare}
          onOpenMusic={() => setModal('music')}
          onOpenSettings={() => setModal('voice-settings')}
          onLeave={leaveVoice}
          onLeaveStream={leaveStream}
          onWatchStream={watchStream}
          onUserVolume={(userId, val) => {
            voiceManagerRef.current?.setUserVolume(userId, val);
            setUserVolumes(prev => ({ ...prev, [userId]: val }));
          }}
          onScreenVolume={(socketId, val) => {
            voiceManagerRef.current?.setScreenAudioVolume(socketId, val);
            setScreenVolumes(prev => ({ ...prev, [socketId]: val }));
            setMutedScreenSockets(prev => (val === 0 ? (prev.includes(socketId) ? prev : [...prev, socketId]) : prev.filter(id => id !== socketId)));
          }}
          onScreenMute={(socketId, isMuted) => {
            voiceManagerRef.current?.setScreenAudioMuted(socketId, isMuted);
            if (!isMuted) voiceManagerRef.current?.setScreenAudioVolume(socketId, screenVolumes[socketId] || 100);
            setMutedScreenSockets(prev => (isMuted ? [...prev, socketId] : prev.filter(id => id !== socketId)));
          }}
          screenQualities={screenQualities}
          onScreenQuality={(socketId, q) => {
            voiceManagerRef.current?.requestScreenQuality(socketId, q);
            setScreenQualities(prev => ({ ...prev, [socketId]: q }));
          }}
          onSelectUser={p => setSelectedProfile(findPerson(p.userId) || {
            id: p.userId, username: (p.name || '').toLowerCase(), display_name: p.name,
            avatar_color: p.color, avatar_url: p.avatarUrl, status: 'online'
          })}
          onOpenNav={() => setDrawer('nav')}
        />
      ) : viewMode === 'server' && activeChannel ? (
        <ChatArea
          title={activeChannel.name}
          topic={activeChannel.topic}
          messages={messages}
          members={activeServer?.members || []}
          currentUser={user}
          typingUsers={typingUsers}
          showMembers={showMembers}
          onToggleMembers={() => {
            if (isMobile()) { setShowMembers(true); setDrawer(d => (d === 'members' ? null : 'members')); }
            else setShowMembers(v => !v);
          }}
          onOpenNav={() => setDrawer('nav')}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onToggleReaction={handleToggleReaction}
          onTogglePin={handleTogglePin}
          onUploadFile={handleUploadFile}
          onSelectUser={setSelectedProfile}
          onTyping={isTyping =>
            socketRef.current?.emit(isTyping ? 'typing_start' : 'typing_stop', { channelId: activeChannel.id })
          }
        />
      ) : viewMode === 'home' && activeDm ? (
        <ChatArea
          title={activeDm.peer_display_name}
          topic={`@${activeDm.peer_username}`}
          isDM
          onOpenNav={() => setDrawer('nav')}
          messages={messages}
          currentUser={user}
          typingUsers={typingUsers}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onToggleReaction={handleToggleReaction}
          onTogglePin={handleTogglePin}
          onUploadFile={handleUploadFile}
          onSelectUser={setSelectedProfile}
          onTyping={isTyping =>
            socketRef.current?.emit(isTyping ? 'typing_start' : 'typing_stop', { dmThreadId: activeDm.id })
          }
        />
      ) : (
        <FriendsView
          friends={friends}
          currentUserId={user.id}
          onAddFriend={async username => {
            if (isDemo) throw new Error('Disponível com o backend ativo.');
            await apiFetch('/api/friends/request', { method: 'POST', body: JSON.stringify({ username }) });
            const d = await apiFetch('/api/friends');
            setFriends(d.friends);
          }}
          onAcceptFriend={async id => {
            await apiFetch(`/api/friends/${id}/accept`, { method: 'POST' });
            const d = await apiFetch('/api/friends');
            setFriends(d.friends);
          }}
          onRemoveFriend={async id => {
            await apiFetch(`/api/friends/${id}`, { method: 'DELETE' });
            const d = await apiFetch('/api/friends');
            setFriends(d.friends);
          }}
          onOpenDM={handleOpenDM}
          onOpenNav={() => setDrawer('nav')}
        />
      )}
      </div>

      {/* Members Sidebar */}
      {(viewMode === 'server' || viewMode === 'voice') && showMembers && activeServer && (
        <aside className="members">
          <h3>ONLINE — {onlineMembers.length}</h3>
          {onlineMembers.map(m => (
            <div
              className={`member nameplate-${m.nameplate_style || 'none'}`}
              key={m.id}
              onClick={() => { setSelectedProfile(m); setDrawer(null); }}
              title="Clique para ver perfil"
            >
              <div className={`avatar deco-${m.avatar_decoration || 'none'}`} style={{ background: m.avatar_color }}>
                {m.avatar_url ? (
                  <img src={resolveAssetUrl(m.avatar_url)} alt={m.display_name} className="avatar-img" />
                ) : (
                  (m.display_name || m.username)[0].toUpperCase()
                )}
                <span className={`status-dot ${m.status}`} />
              </div>
              <div className="member-info">
                <div className="member-name">
                  <span style={{ color: nameColor(m.name_color) || 'inherit' }}>{m.display_name}</span>
                  {m.clan_tag && (
                    <span className="clan-tag-pill sm">{m.clan_icon || '💀'} {m.clan_tag}</span>
                  )}
                  {m.role === 'owner' && <Crown size={12} className="role-crown" />}
                  {m.role === 'admin' && <Shield size={12} className="role-admin" />}
                </div>
                {m.custom_status && <small>{m.custom_status}</small>}
              </div>
            </div>
          ))}

          {offlineMembers.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>OFFLINE — {offlineMembers.length}</h3>
              {offlineMembers.map(m => (
                <div
                  className={`member offline nameplate-${m.nameplate_style || 'none'}`}
                  key={m.id}
                  onClick={() => { setSelectedProfile(m); setDrawer(null); }}
                  title="Clique para ver perfil"
                >
                  <div className={`avatar deco-${m.avatar_decoration || 'none'}`} style={{ background: m.avatar_color }}>
                    {m.avatar_url ? (
                      <img src={resolveAssetUrl(m.avatar_url)} alt={m.display_name} className="avatar-img" />
                    ) : (
                      (m.display_name || m.username)[0].toUpperCase()
                    )}
                    <span className="status-dot offline" />
                  </div>
                  <div className="member-info">
                    <div className="member-name">
                      <span style={{ color: nameColor(m.name_color) || 'inherit' }}>{m.display_name}</span>
                      {m.clan_tag && (
                        <span className="clan-tag-pill sm">{m.clan_icon || '💀'} {m.clan_tag}</span>
                      )}
                      {m.role === 'owner' && <Crown size={12} className="role-crown" />}
                      {m.role === 'admin' && <Shield size={12} className="role-admin" />}
                    </div>
                    {m.custom_status && <small>{m.custom_status}</small>}
                  </div>
                </div>
              ))}
            </>
          )}
        </aside>
      )}

      {/* Modals */}
      {modal === 'server' && (
        <CreateOrJoinServerModal
          onClose={() => setModal(null)}
          onCreateServer={handleCreateServer}
          onJoinServer={handleJoinServer}
          onImportDiscord={handleImportDiscord}
        />
      )}
      {(modal === 'channel-text' || modal === 'channel-voice') && (
        <CreateChannelModal
          defaultType={modal === 'channel-voice' ? 'voice' : 'text'}
          onClose={() => setModal(null)}
          onCreate={handleCreateChannel}
        />
      )}
      {modal === 'invite' && activeServer && (
        <InviteModal server={activeServer} onClose={() => setModal(null)} />
      )}
      {modal === 'profile' && (
        <ProfileModal
          user={user}
          onClose={() => setModal(null)}
          onSave={handleSaveProfile}
          onUploadAvatar={handleUploadFile}
          onLogout={handleLogout}
        />
      )}
      {modal === 'new-dm' && (
        <NewDmModal
          onClose={() => setModal(null)}
          onSelectUser={handleOpenDM}
        />
      )}
      {selectedProfile && (
        <UserProfileModal
          member={selectedProfile}
          currentUserId={user.id}
          onClose={() => setSelectedProfile(null)}
          onSendDM={handleOpenDM}
          onQuickDmMessage={async (targetUserId, content) => {
            if (isDemo) return;
            const { thread } = await apiFetch('/api/dms', {
              method: 'POST',
              body: JSON.stringify({ targetUserId })
            });
            await apiFetch(`/api/dms/${thread.id}/messages`, {
              method: 'POST',
              body: JSON.stringify({ content })
            });
            setDmThreads(prev => (prev.some(t => t.id === thread.id) ? prev : [thread, ...prev]));
            setViewMode('home');
            setActiveDmId(thread.id);
          }}
        />
      )}
      {modal === 'voice-settings' && (
        <VoiceSettingsModal
          onClose={() => setModal(null)}
          onApplySettings={async newSettings => {
            setVoiceSettings(newSettings);
            await voiceManagerRef.current?.reloadPipeline(newSettings);
          }}
        />
      )}
      {whatsNew && <WhatsNewModal all={whatsNew === 'all'} onClose={closeWhatsNew} />}
      {modal === 'server-settings' && activeServer && (
        <ServerSettingsModal
          server={activeServer}
          canEdit={isDemo || activeServer.my_role === 'owner' || activeServer.my_role === 'admin'}
          onClose={() => setModal(null)}
          onSave={handleSaveServer}
          onUpload={handleUploadFile}
        />
      )}
      {modal === 'notes' && (
        <NotesModal onClose={() => setModal(null)} isDemo={isDemo} />
      )}
      {modal === 'music' && (
        <MusicModal
          onClose={() => setModal(null)}
          musicState={musicState}
          musicVolume={musicVolume}
          onChangeVolume={setMusicVolume}
          onPlayQuery={query => {
            if (!voiceChannelId) return;
            socketRef.current?.emit('music:play', { channelId: voiceChannelId, query });
          }}
          onToggle={() => {
            if (!voiceChannelId) return;
            socketRef.current?.emit('music:toggle', { channelId: voiceChannelId });
          }}
          onSkip={() => {
            if (!voiceChannelId) return;
            socketRef.current?.emit('music:skip', { channelId: voiceChannelId });
          }}
          onStop={() => {
            if (!voiceChannelId) return;
            socketRef.current?.emit('music:stop', { channelId: voiceChannelId });
          }}
        />
      )}
      <audio
        ref={musicAudioRef}
        crossOrigin="anonymous"
        onEnded={() => {
          if (voiceChannelId) socketRef.current?.emit('music:skip', { channelId: voiceChannelId });
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
