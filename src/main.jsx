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
import './style.css';

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
  const [mutedScreenSockets, setMutedScreenSockets] = useState([]);
  const [voiceSettings, setVoiceSettings] = useState(getSavedVoiceSettings);

  const [showMembers, setShowMembers] = useState(true);
  const [muted, setMuted] = useState(() => localStorage.getItem('ronncord_muted') === '1');
  const [deafened, setDeafened] = useState(() => localStorage.getItem('ronncord_deafened') === '1');
  const [pttActive, setPttActive] = useState(false);
  const [screenVolumes, setScreenVolumes] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [musicState, setMusicState] = useState(null);
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem('ronncord_music_vol'));
    return Number.isFinite(saved) ? saved : 0.35;
  });
  const musicAudioRef = useRef(null);
  const activeChannelIdRef = useRef(null);
  const activeDmIdRef = useRef(null);
  const viewModeRef = useRef('server');

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

  const [modal, setModal] = useState(null); // null | 'server' | 'channel-text' | 'channel-voice' | 'invite' | 'profile' | 'voice-settings' | 'new-dm'
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [volumeTarget, setVolumeTarget] = useState(null);
  const [userVolumes, setUserVolumes] = useState(getSavedUserVolumes);
  const socketRef = useRef(null);
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
    if (socket) {
      socket.on('connect', () => {
        socket.emit('voice:sync');
      });
      socket.on('message:new', msg => {
        const targetKey = msg.channel_id || msg.dm_thread_id;
        const isCurrentlyOpen =
          (viewModeRef.current === 'server' && msg.channel_id === activeChannelIdRef.current) ||
          (viewModeRef.current === 'home' && msg.dm_thread_id === activeDmIdRef.current);

        if (msg.author_id !== user.id) {
          SoundFX.message();
          const mentioned =
            msg.content?.toLowerCase().includes(`@${user.username?.toLowerCase()}`) ||
            Boolean(msg.dm_thread_id);
          if (!isCurrentlyOpen || document.hidden) {
            if (targetKey) {
              setUnreadCounts(prev => ({ ...prev, [targetKey]: (prev[targetKey] || 0) + 1 }));
            }
            if (mentioned && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
              new Notification(`${msg.author?.display_name || 'RONNCORD'}`, {
                body: msg.content || 'Enviou um anexo'
              });
            }
          }
        }

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
        setServers(prev =>
          prev.map(s => (s.id === ch.server_id ? { ...s, channels: [...s.channels, ch] } : s))
        );
      });
      socket.on('channel:deleted', ({ serverId, channelId }) => {
        setServers(prev =>
          prev.map(s => (s.id === serverId ? { ...s, channels: s.channels.filter(c => c.id !== channelId) } : s))
        );
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
      return () => socketRef.current?.emit('leave_channel', activeChannelId);
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
    setUser(updated);
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
  const onlineMembers = activeServer?.members?.filter(m => m.status !== 'offline') || [];
  const offlineMembers = activeServer?.members?.filter(m => m.status === 'offline') || [];

  return (
    <div className="app">
      {/* Server Rail */}
      <aside className="server-rail">
        <button
          className={`server-logo ${viewMode === 'home' ? 'active' : ''}`}
          title="Mensagens Diretas e Amigos"
          onClick={() => { setViewMode('home'); setActiveDmId(null); }}
        >
          <Compass size={22} />
        </button>

        <div className="rail-divider" />

        {servers.map(srv => (
          <button
            key={srv.id}
            className={`server-logo ${viewMode === 'server' && activeServerId === srv.id ? 'active' : ''}`}
            style={viewMode === 'server' && activeServerId === srv.id ? { background: srv.icon_color } : {}}
            title={srv.name}
            onClick={() => {
              setViewMode('server');
              setActiveServerId(srv.id);
              const firstText = srv.channels.find(c => c.type === 'text');
              setActiveChannelId(firstText?.id || null);
            }}
          >
            {srv.name.slice(0, 2).toUpperCase()}
          </button>
        ))}

        <button
          className="server-logo add-server-btn"
          title="Criar ou Entrar em Servidor"
          onClick={() => setModal('server')}
        >
          <Plus size={22} />
        </button>
      </aside>

      {/* Channels / DMs Sidebar */}
      <aside className="sidebar">
        {viewMode === 'server' && activeServer ? (
          <>
            <div className="workspace-title">
              <span>{activeServer.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="icon-btn xs"
                  title="Convidar Amigos"
                  onClick={() => setModal('invite')}
                >
                  <UserPlus size={16} />
                </button>
                <ChevronDown size={16} />
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
                    className={`channel ${activeChannelId === ch.id ? 'selected' : ''}`}
                    onClick={() => {
                      setActiveChannelId(ch.id);
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
                        className={`channel ${connectedHere ? 'selected' : ''}`}
                        onClick={() => toggleVoiceChannel(ch)}
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
                                  setVolumeTarget(prev => (prev?.userId === p.userId ? null : p));
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
                                    if (voiceChannelId !== ch.id) {
                                      await toggleVoiceChannel(ch, true);
                                    }
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
                  onClick={() => setActiveDmId(null)}
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
                {dmThreads.map(t => (
                  <div
                    key={t.id}
                    className={`channel ${activeDmId === t.id ? 'selected' : ''}`}
                    onClick={() => setActiveDmId(t.id)}
                  >
                    <div className="avatar xs" style={{ background: t.peer_avatar_color }}>
                      {(t.peer_display_name || t.peer_username)[0].toUpperCase()}
                    </div>
                    <span style={{ flex: 1 }}>{t.peer_display_name}</span>
                    {unreadCounts[t.id] > 0 && <span className="unread-badge">{unreadCounts[t.id]}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {volumeTarget && (
          <div className="user-volume-popover">
            <div className="user-volume-header">
              <strong>Volume de {volumeTarget.displayName}</strong>
              <span>{userVolumes[volumeTarget.userId] ?? 100}%</span>
            </div>
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
            <div className="user-volume-actions">
              <button
                type="button"
                className="btn-ghost xs"
                onClick={() => {
                  voiceManagerRef.current?.setUserVolume(volumeTarget.userId, 0);
                  setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: 0 }));
                }}
              >
                0%
              </button>
              <button
                type="button"
                className="btn-ghost xs"
                onClick={() => {
                  voiceManagerRef.current?.setUserVolume(volumeTarget.userId, 100);
                  setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: 100 }));
                }}
              >
                100%
              </button>
              <button
                type="button"
                className="btn-ghost xs"
                onClick={() => {
                  voiceManagerRef.current?.setUserVolume(volumeTarget.userId, 250);
                  setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: 250 }));
                }}
              >
                250%
              </button>
              <button
                type="button"
                className="btn-ghost xs"
                onClick={() => {
                  voiceManagerRef.current?.setUserVolume(volumeTarget.userId, 400);
                  setUserVolumes(prev => ({ ...prev, [volumeTarget.userId]: 400 }));
                }}
              >
                400%
              </button>
              <button type="button" className="btn-primary xs" onClick={() => setVolumeTarget(null)}>
                OK
              </button>
            </div>
          </div>
        )}

        {voiceChannelId && (
          <div className="voice-status-bar">
            <div>
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
                onClick={async () => {
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
                }}
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
              <span className={`status-dot ${user.status}`} />
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
        {hiddenVideoIds.length > 0 && remoteVideos.some(v => hiddenVideoIds.includes(v.id)) && (
          <div style={{ background: '#1e1f22', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Transmissão ocultada ({hiddenVideoIds.length})</span>
            <button type="button" className="btn-primary xs" onClick={() => setHiddenVideoIds([])}>
              Mostrar Transmissão
            </button>
          </div>
        )}
        {(localCameraStream || localScreenStream || remoteVideos.some(v => !hiddenVideoIds.includes(v.id))) && (
          <div className="screen-share-stage">
            {localCameraStream && (
              <div className="screen-tile">
                <video
                  className="video-mirror"
                  autoPlay
                  muted
                  playsInline
                  ref={el => {
                    if (el && el.srcObject !== localCameraStream) el.srcObject = localCameraStream;
                  }}
                />
                <div className="screen-label">Sua Câmera • 1080p 60fps</div>
                <button
                  className="screen-fullscreen-btn"
                  title="Tela Cheia"
                  onClick={e => e.currentTarget.parentElement?.querySelector('video')?.requestFullscreen?.()}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            )}
            {localScreenStream && (
              <div className="screen-tile">
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={el => {
                    if (el && el.srcObject !== localScreenStream) el.srcObject = localScreenStream;
                  }}
                />
                <div className="screen-label">Sua Tela • 1080p 60fps</div>
                <div className="screen-tile-controls">
                  <button
                    className="screen-fullscreen-btn"
                    style={{ position: 'static' }}
                    title="Tela Cheia"
                    onClick={e => e.currentTarget.closest('.screen-tile')?.querySelector('video')?.requestFullscreen?.()}
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    className="screen-fullscreen-btn"
                    style={{ position: 'static' }}
                    title="Parar Transmissão"
                    onClick={toggleScreenShare}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            {remoteVideos.filter(v => !hiddenVideoIds.includes(v.id)).map(v => {
              const isScreenMuted = mutedScreenSockets.includes(v.socketId);
              const scrVol = isScreenMuted ? 0 : (screenVolumes[v.socketId] ?? 100);
              return (
              <div key={v.id} className="screen-tile">
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={el => {
                    if (!el) return;
                    el.muted = true;
                    el.volume = 0;
                    const videoOnlyStream = new MediaStream(v.stream.getVideoTracks());
                    if (el.srcObject?.id !== v.stream.id && (!el._srcTrackId || el._srcTrackId !== v.trackId)) {
                      el._srcTrackId = v.trackId;
                      el.srcObject = videoOnlyStream;
                    }
                  }}
                />
                <div className="screen-label">
                  {v.kind === 'camera' ? `Câmera de ${v.displayName}` : `Tela de ${v.displayName} • 1080p 60fps`}
                </div>
                <div className="screen-tile-controls">
                  {v.kind !== 'camera' && (
                    <div className="screen-audio-ctrl">
                      <button
                        className="screen-fullscreen-btn"
                        style={{ position: 'static' }}
                        title={isScreenMuted ? 'Ativar áudio da tela' : 'Mutar áudio da tela'}
                        onClick={() => {
                          const nextMuted = !isScreenMuted;
                          voiceManagerRef.current?.setScreenAudioMuted(v.socketId, nextMuted);
                          setMutedScreenSockets(prev =>
                            nextMuted ? [...prev, v.socketId] : prev.filter(id => id !== v.socketId)
                          );
                        }}
                      >
                        {isScreenMuted || scrVol === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={scrVol}
                        title={`Volume da tela: ${scrVol}%`}
                        className="screen-vol-slider"
                        onChange={e => {
                          const val = Number(e.target.value);
                          voiceManagerRef.current?.setScreenAudioVolume(v.socketId, val);
                          setScreenVolumes(prev => ({ ...prev, [v.socketId]: val }));
                          if (val === 0 && !isScreenMuted) {
                            setMutedScreenSockets(prev => [...prev, v.socketId]);
                          } else if (val > 0 && isScreenMuted) {
                            setMutedScreenSockets(prev => prev.filter(id => id !== v.socketId));
                          }
                        }}
                      />
                    </div>
                  )}
                  <button
                    className="screen-fullscreen-btn"
                    style={{ position: 'static' }}
                    title="Tela Cheia"
                    onClick={e => e.currentTarget.closest('.screen-tile')?.querySelector('video')?.requestFullscreen?.()}
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    className="screen-fullscreen-btn"
                    style={{ position: 'static' }}
                    title="Fechar Visualização"
                    onClick={() => setHiddenVideoIds(prev => [...prev, v.id])}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

      {viewMode === 'server' && activeChannel ? (
        <ChatArea
          title={activeChannel.name}
          topic={activeChannel.topic}
          messages={messages}
          members={activeServer?.members || []}
          currentUser={user}
          typingUsers={typingUsers}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers(v => !v)}
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
        />
      )}
      </div>

      {/* Members Sidebar */}
      {viewMode === 'server' && showMembers && activeServer && (
        <aside className="members">
          <h3>ONLINE — {onlineMembers.length}</h3>
          {onlineMembers.map(m => (
            <div
              className={`member nameplate-${m.nameplate_style || 'none'}`}
              key={m.id}
              onClick={() => setSelectedProfile(m)}
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
                  <span style={{ color: m.name_color || 'inherit' }}>{m.display_name}</span>
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
                  onClick={() => setSelectedProfile(m)}
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
                      <span style={{ color: m.name_color || 'inherit' }}>{m.display_name}</span>
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
