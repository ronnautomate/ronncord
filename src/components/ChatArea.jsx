import React, { useEffect, useRef, useState } from 'react';
import {
  Hash, AtSign, Search, Users, PlusCircle, Smile, SendHorizontal,
  Reply, Pencil, Trash2, X, Paperclip, FileText, Pin, Mic, Square, Menu, BarChart3
} from 'lucide-react';
import { parsePoll } from '../lib/poll.js';
import { PollCard } from './PollCard.jsx';
import { PollModal } from './PollModal.jsx';
import { resolveAssetUrl } from '../lib/api.js';
import { GifPicker } from './GifPicker.jsx';
import { ImageViewer } from './ImageViewer.jsx';
import { VoicePlayer } from './VoicePlayer.jsx';
import { isAvisoMessage, avisoText, SLASH_COMMANDS } from '../lib/aviso.js';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '🎉', '💯'];

function isImageAttachment(att) {
  return att?.mimetype?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att?.name || '');
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function extractYouTubeIds(text) {
  if (!text) return [];
  const regex = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  const ids = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids.slice(0, 3);
}

function YouTubeEmbed({ videoId }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="yt-embed-card">
      <div className="yt-embed-header">
        <span className="yt-embed-badge">YouTube</span>
        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
          Assistir no YouTube
        </a>
      </div>
      {playing ? (
        <iframe
          className="yt-embed-iframe"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button type="button" className="yt-embed-thumb" onClick={() => setPlaying(true)} title="Reproduzir vídeo">
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="YouTube preview" loading="lazy" />
          <span className="yt-play-btn">▶</span>
        </button>
      )}
    </div>
  );
}

function renderFormattedText(text) {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s]+|@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      return <pre key={idx} className="code-block"><code>{part.slice(3, -3).trim()}</code></pre>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={idx} href={part} target="_blank" rel="noreferrer">{part}</a>;
    }
    if (/^@[a-zA-Z0-9_.-]+$/.test(part)) {
      return <span key={idx} className="mention-pill">{part}</span>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function ChatArea({
  title,
  topic,
  isDM = false,
  messages,
  members = [],
  currentUser,
  typingUsers = [],
  showMembers,
  onToggleMembers,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTogglePin,
  onUploadFile,
  onTyping,
  onSelectUser,
  onOpenNav,
  onVotePoll
}) {
  const [text, setText] = useState('');
  const [pollDraft, setPollDraft] = useState(null); // null | pergunta inicial da janela de enquete
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [reactingMsgId, setReactingMsgId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [viewer, setViewer] = useState(null); // { images, index } do visor de imagem
  const [tappedId, setTappedId] = useState(null); // celular: mensagem tocada mostra as ações

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, title]);

  function handleTextChange(val) {
    setText(val);
    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (match && members.length > 0) {
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
    if (onTyping) {
      onTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 1800);
    }
  }

  function insertMention(username) {
    setText(prev => prev.replace(/(?:^|\s)@[a-zA-Z0-9_.-]*$/, m => (m.startsWith(' ') ? ` @${username} ` : `@${username} `)));
    setMentionQuery(null);
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await onUploadFile(file);
      setAttachments(prev => [...prev, uploaded]);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // colar (Ctrl+V) e arrastar arquivos pro chat, igual no discordia/Discord
  async function uploadFiles(files) {
    const list = Array.from(files || []).filter(f => f && f.size > 0);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list.slice(0, 10)) {
        // print colado vem sem nome: dá um nome com a data
        const file = f.name && f.name !== 'image.png'
          ? f
          : new File([f], `imagem-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type });
        const uploaded = await onUploadFile(file);
        setAttachments(prev => [...prev, uploaded]);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      textInputRef.current?.focus();
    }
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.items || [])
      .filter(it => it.kind === 'file')
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  const [dragging, setDragging] = useState(false);
  function handleDragOver(e) {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  }
  function handleDrop(e) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setDragging(false);
    uploadFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    const content = text.trim();
    // "/poll" sem as opções abre a janela de enquete com o que já foi escrito
    if (/^\/(poll|enquete)(\s|$)/i.test(content) && !parsePoll(content)) {
      setPollDraft(content.replace(/^\/(poll|enquete)\s*/i, '').split('|')[0].trim());
      setText('');
      return;
    }
    const currentAttachments = [...attachments];
    const currentReply = replyTo?.id || null;

    setText('');
    setAttachments([]);
    setReplyTo(null);
    setShowEmojiPicker(false);
    if (onTyping) onTyping(false);

    await onSendMessage({ content, attachments: currentAttachments, reply_to_id: currentReply });
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editText.trim()) return;
    await onEditMessage(editingId, editText.trim());
    setEditingId(null);
    setEditText('');
  }

  async function startVoiceNote() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      recordChunksRef.current = [];
      mr.ondataavailable = ev => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      mr.onstop = () => stream.getTracks().forEach(t => t.stop());
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = setInterval(() => setRecordSec(s => s + 1), 1000);
    } catch (err) {
      alert('Não foi possível gravar áudio: ' + err.message);
    }
  }

  function cancelVoiceNote() {
    clearInterval(recordTimerRef.current);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setRecording(false);
    setRecordSec(0);
  }

  async function sendVoiceNote() {
    clearInterval(recordTimerRef.current);
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setRecording(false);
    setUploading(true);
    try {
      await new Promise(resolve => {
        const origStop = mr.onstop;
        mr.onstop = () => {
          origStop?.();
          resolve();
        };
        if (mr.state !== 'inactive') mr.stop();
        else resolve();
      });
      const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
      const uploaded = await onUploadFile(file);
      await onSendMessage({ content: '', attachments: [uploaded], reply_to_id: replyTo?.id || null });
      setReplyTo(null);
    } catch (err) {
      alert('Erro ao enviar áudio: ' + err.message);
    } finally {
      setUploading(false);
      setRecordSec(0);
    }
  }

  const pinnedMessages = messages.filter(m => m.pinned);
  // digitou "/" no começo: mostra os comandos (por enquanto o /aviso)
  const slashMatches = /^\/\S*$/.test(text)
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(text.toLowerCase()))
    : [];

  const pendingMentionMatches = mentionQuery !== null
    ? members.filter(m =>
        m.username?.toLowerCase().includes(mentionQuery) ||
        m.display_name?.toLowerCase().includes(mentionQuery)
      ).slice(0, 6)
    : [];

  const visibleMessages = searchQuery.trim()
    ? messages.filter(m =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.author?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // todas as fotos do canal em ordem, pro visor passar de uma pra outra
  const channelImages = [];
  visibleMessages.forEach(m => (m.attachments || []).forEach(att => {
    if (isImageAttachment(att)) {
      channelImages.push({
        url: resolveAssetUrl(att.url),
        name: att.name,
        author: m.author?.display_name || m.author?.username || ''
      });
    }
  }));

  function openViewer(url) {
    const idx = channelImages.findIndex(im => im.url === url);
    setViewer({ images: idx >= 0 ? channelImages : [{ url }], index: Math.max(0, idx) });
  }

  return (
    <main
      className={`chat-area ${dragging ? 'dragging-files' : ''}`}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={handleDrop}
    >
      {dragging && <div className="drop-overlay"><div>Solte pra enviar em {isDM ? '@' : '#'}{title}</div></div>}
      <header className="chat-header">
        <div className="chat-header-title">
          {onOpenNav && (
            <button type="button" className="icon-btn mobile-nav-btn" title="Servidores e canais" onClick={onOpenNav}>
              <Menu size={20} />
            </button>
          )}
          {isDM ? <AtSign size={20} className="header-icon" /> : <Hash size={20} className="header-icon" />}
          <strong>{title}</strong>
          {topic && <span className="chat-topic">{topic}</span>}
        </div>

        <div className="header-actions" style={{ position: 'relative' }}>
          <div className="search-box">
            <Search size={14} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar mensagens..."
            />
            {searchQuery && (
              <button className="icon-btn xs" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
          <button
            className={`icon-btn ${showPinned ? 'active' : ''}`}
            title="Mensagens Fixadas"
            onClick={() => setShowPinned(v => !v)}
            style={{ position: 'relative' }}
          >
            <Pin size={18} />
            {pinnedMessages.length > 0 && <span className="pin-count-dot">{pinnedMessages.length}</span>}
          </button>
          {showPinned && (
            <div className="pinned-popover">
              <div className="pinned-popover-header">
                <strong>Mensagens Fixadas ({pinnedMessages.length})</strong>
                <button className="icon-btn xs" onClick={() => setShowPinned(false)}><X size={14} /></button>
              </div>
              {pinnedMessages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Nenhuma mensagem fixada neste canal.</p>
              ) : (
                pinnedMessages.map(pm => (
                  <div key={pm.id} className="pinned-item">
                    <div>
                      <strong>{pm.author?.display_name}</strong>
                      <p>{pm.content || '📎 Anexo'}</p>
                    </div>
                    {onTogglePin && (
                      <button className="icon-btn xs" title="Desafixar" onClick={() => onTogglePin(pm.id)}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          {!isDM && (
            <button
              className={`icon-btn ${showMembers ? 'active' : ''}`}
              title="Mostrar/Ocultar Membros"
              onClick={onToggleMembers}
            >
              <Users size={18} />
            </button>
          )}
        </div>
      </header>

      <section className="messages">
        <div className="welcome">
          <div className="welcome-icon">{isDM ? '@' : '#'}</div>
          <h1>{isDM ? `Conversa com ${title}` : `Bem-vindo a #${title}`}</h1>
          <p>
            {isDM
              ? `Este é o início do seu histórico de mensagens diretas com ${title}.`
              : `Este é o começo do canal #${title}. ${topic || ''}`}
          </p>
        </div>

        {visibleMessages.map((msg, i) => {
          const prev = visibleMessages[i - 1];
          const isAviso = isAvisoMessage(msg.content);
          const grouped =
            prev &&
            !isAviso &&
            !isAvisoMessage(prev.content) &&
            prev.author_id === msg.author_id &&
            !msg.reply_to &&
            msg.created_at - prev.created_at < 5 * 60 * 1000;
          const isMine = msg.author_id === currentUser.id;
          const authorName = msg.author?.display_name || msg.author?.username || 'Usuário';
          const avatarColor = msg.author?.avatar_color || '#5865F2';

          return (
            <div
              className={`message ${grouped ? 'grouped' : ''} ${isAviso ? 'message-aviso' : ''} ${tappedId === msg.id ? 'tapped' : ''}`}
              key={msg.id}
              onClick={e => {
                // no celular não tem hover: tocar na mensagem mostra reagir/responder/apagar
                if (!window.matchMedia('(hover: none)').matches) return;
                if (e.target.closest('button, a, input, audio, video, iframe')) return;
                setTappedId(id => (id === msg.id ? null : msg.id));
              }}
            >
              {msg.reply_to && (
                <div className="reply-reference">
                  <Reply size={12} />
                  <strong>{msg.reply_to.author_name}</strong>
                  <span>{msg.reply_to.content}</span>
                </div>
              )}

              <div className="message-row">
                {!grouped ? (
                  <div
                    className={`avatar message-avatar clickable deco-${msg.author?.avatar_decoration || 'none'}`}
                    style={{ background: avatarColor }}
                    onClick={() => onSelectUser?.(msg.author)}
                  >
                    {msg.author?.avatar_url ? (
                      <img src={resolveAssetUrl(msg.author.avatar_url)} alt={authorName} className="avatar-img" />
                    ) : (
                      authorName[0].toUpperCase()
                    )}
                  </div>
                ) : (
                  <div className="message-time-gutter">{formatTime(msg.created_at)}</div>
                )}

                <div className="message-body">
                  {!grouped && (
                    <div className="message-meta">
                      <strong className="clickable" onClick={() => onSelectUser?.(msg.author)}>{authorName}</strong>
                      {isAviso && <span className="aviso-tag">📢 AVISO</span>}
                      <small>{formatTime(msg.created_at)}</small>
                    </div>
                  )}

                  {editingId === msg.id ? (
                    <form onSubmit={submitEdit} className="edit-form">
                      <input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setEditingId(null)}
                      />
                      <small>Enter para salvar • Esc para cancelar</small>
                    </form>
                  ) : (
                    msg.content && parsePoll(msg.content) ? (
                      <PollCard
                        poll={parsePoll(msg.content)}
                        votes={msg.poll_votes || []}
                        currentUserId={currentUser?.id}
                        members={members}
                        onVote={onVotePoll ? option => onVotePoll(msg.id, option) : undefined}
                      />
                    ) : msg.content && (
                      <>
                        <p className="message-text">
                          {renderFormattedText(isAviso ? avisoText(msg.content) : msg.content)}
                          {msg.edited_at && <span className="edited-tag">(editado)</span>}
                        </p>
                        {extractYouTubeIds(msg.content).length > 0 && (
                          <div className="yt-embeds-list">
                            {extractYouTubeIds(msg.content).map(vid => (
                              <YouTubeEmbed key={vid} videoId={vid} />
                            ))}
                          </div>
                        )}
                      </>
                    )
                  )}

                  {msg.attachments?.length > 0 && (
                    <div className="attachments-list">
                      {msg.attachments.map((att, idx) => {
                        const fullUrl = resolveAssetUrl(att.url);
                        const isImg = isImageAttachment(att);
                        const isAudio = att.mimetype?.startsWith('audio/') || /\.(webm|ogg|mp3|wav)$/i.test(att.name || '');
                        if (isImg && /^sticker-/i.test(att.name || '')) {
                          // figurinha: pequena e sem moldura, igual Discord
                          return <img key={idx} className="chat-sticker" src={fullUrl} alt={att.name.replace(/^sticker-|\.webp$/gi, '')} loading="lazy" />;
                        }
                        if (isImg) {
                          return (
                            <button
                              key={idx}
                              type="button"
                              className="attachment-image-wrap"
                              title="Abrir imagem"
                              onClick={e => { e.stopPropagation(); openViewer(fullUrl); }}
                            >
                              <img src={fullUrl} alt={att.name} loading="lazy" />
                            </button>
                          );
                        }
                        if (isAudio) {
                          return (
                            <VoicePlayer key={idx} src={fullUrl} name={att.name} />
                          );
                        }
                        return (
                          <a key={idx} href={fullUrl} target="_blank" rel="noreferrer" className="attachment-file">
                            <FileText size={18} />
                            <span>{att.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {msg.reactions?.length > 0 && (
                    <div className="reactions-row">
                      {msg.reactions.map(r => {
                        const iReacted = r.users.includes(currentUser.id);
                        return (
                          <button
                            key={r.emoji}
                            type="button"
                            className={`reaction-pill ${iReacted ? 'mine' : ''}`}
                            onClick={() => onToggleReaction(msg.id, r.emoji)}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="message-actions">
                  <button
                    type="button"
                    title="Reagir"
                    onClick={() => setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)}
                  >
                    <Smile size={15} />
                  </button>
                  <button type="button" title="Responder" onClick={() => setReplyTo(msg)}>
                    <Reply size={15} />
                  </button>
                  {onTogglePin && (
                    <button type="button" title={msg.pinned ? 'Desafixar' : 'Fixar mensagem'} onClick={() => onTogglePin(msg.id)}>
                      <Pin size={15} style={msg.pinned ? { color: 'var(--yellow)' } : undefined} />
                    </button>
                  )}
                  {isMine && (
                    <>
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button type="button" title="Apagar" className="danger" onClick={() => onDeleteMessage(msg.id)}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}

                  {reactingMsgId === msg.id && (
                    <div className="emoji-popover">
                      {QUICK_EMOJIS.map(em => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            onToggleReaction(msg.id, em);
                            setReactingMsgId(null);
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </section>

      <div className="composer-wrapper">
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots"><i /><i /><i /></span>
            <span>
              <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'está digitando...' : 'estão digitando...'}
            </span>
          </div>
        )}

        {replyTo && (
          <div className="reply-banner">
            <span>Respondendo a <strong>{replyTo.author?.display_name}</strong></span>
            <button type="button" className="icon-btn xs" onClick={() => setReplyTo(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="pending-attachments">
            {attachments.map((att, idx) => (
              <div key={idx} className="pending-att-chip">
                <Paperclip size={13} />
                <span>{att.name}</span>
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {slashMatches.length > 0 && (
          <div className="mention-autocomplete">
            {slashMatches.map(c => (
              <button
                key={c.cmd}
                type="button"
                className="mention-option"
                onClick={() => {
                  if (c.window === 'poll') { setText(''); setPollDraft(''); return; }
                  setText(`${c.cmd} `); textInputRef.current?.focus();
                }}
              >
                <strong>{c.cmd}</strong>
                <small style={{ marginLeft: 0 }}>{c.args}</small>
                <small style={{ marginLeft: 'auto' }}>{c.desc}</small>
              </button>
            ))}
          </div>
        )}

        {pendingMentionMatches.length > 0 && (
          <div className="mention-autocomplete">
            {pendingMentionMatches.map(m => (
              <button
                key={m.id}
                type="button"
                className="mention-option"
                onClick={() => insertMention(m.username)}
              >
                <span className="avatar xs" style={{ background: m.avatar_color }}>
                  {(m.display_name || m.username)[0].toUpperCase()}
                </span>
                <strong>{m.display_name}</strong>
                <small>@{m.username}</small>
              </button>
            ))}
          </div>
        )}

        <form className="message-form" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="add-button"
            title="Enviar arquivo ou imagem"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusCircle size={20} />
          </button>

          {recording ? (
            <div className="voice-note-bar">
              <span className="rec-dot" />
              <span>Gravando áudio... {Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')}</span>
              <button type="button" className="btn-ghost xs" onClick={cancelVoiceNote}>Cancelar</button>
              <button type="button" className="btn-primary xs" onClick={sendVoiceNote}>
                <Square size={12} /> Enviar Áudio
              </button>
            </div>
          ) : (
            <input
              ref={textInputRef}
              value={text}
              onChange={e => handleTextChange(e.target.value)}
              placeholder={uploading ? 'Enviando arquivo...' : `Conversar em ${isDM ? '@' : '#'}${title}`}
            />
          )}

          {!recording && (
            <button
              type="button"
              className="icon-btn"
              title="Gravar Mensagem de Áudio"
              disabled={uploading}
              onClick={startVoiceNote}
            >
              <Mic size={19} />
            </button>
          )}

          {!recording && (
            <button type="button" className="icon-btn" title="Criar enquete" onClick={() => setPollDraft('')}>
              <BarChart3 size={19} />
            </button>
          )}

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`gif-btn ${showGifPicker ? 'active' : ''}`}
              title="Enviar GIF"
              onClick={() => { setShowGifPicker(v => !v); setShowEmojiPicker(false); }}
            >
              GIF
            </button>
            {showGifPicker && (
              <GifPicker
                onClose={() => setShowGifPicker(false)}
                onSelectGif={async gif => {
                  setShowGifPicker(false);
                  await onSendMessage({ content: '', attachments: [gif], reply_to_id: replyTo?.id || null });
                  setReplyTo(null);
                }}
              />
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="icon-btn"
              title="Emoji"
              onClick={() => { setShowEmojiPicker(v => !v); setShowGifPicker(false); }}
            >
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <div className="emoji-popover bottom-right">
                {QUICK_EMOJIS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setText(prev => prev + em);
                      setShowEmojiPicker(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="send-button" title="Enviar">
            <SendHorizontal size={18} />
          </button>
        </form>
      </div>

      {viewer && (
        <ImageViewer images={viewer.images} startIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
      {pollDraft !== null && (
        <PollModal
          initialQuestion={pollDraft}
          onClose={() => setPollDraft(null)}
          onSend={content => onSendMessage({ content, attachments: [], reply_to_id: null })}
        />
      )}
    </main>
  );
}
