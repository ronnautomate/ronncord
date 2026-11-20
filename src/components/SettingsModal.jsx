import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Sparkles, LogOut, Lock, Mic, Bell, Volume2, Palette, User, IdCard, Shield, Gift, Video, Play } from 'lucide-react';
import { SoundFX, isSoundsEnabled, setSoundsEnabled, getSoundVolume, setSoundVolume, refreshOutputDevice } from '../lib/soundEffects.js';
import '../settings.css';
import { ensurePushSubscription } from '../lib/push.js';
import { resolveAssetUrl } from '../lib/api.js';
import { THEMES, getSavedTheme, applyTheme, nameColor as safeNameColor } from '../lib/themes.js';

// Configurações do usuário no jeito do Discord (e do discordia): menu de seções na esquerda,
// a seção aberta na direita e a prévia do cartão de perfil mudando ao vivo. No celular o menu
// vira abas no topo. Perfil só grava no "Salvar alterações"; tema, sons, saída de áudio e
// notificações valem na hora. O Modals.jsx só reexporta como ProfileModal.

const COLORS = ['#f2f3f5', '#f0b232', '#5865F2', '#57F287', '#EB459E', '#ED4245', '#00e5ff', '#9B59B6'];

const BANNERS = [
  '#5865F2',
  '#EB459E',
  '#23A559',
  '#E67E22',
  '#111827',
  'linear-gradient(135deg, #5865F2 0%, #EB459E 100%)',
  'linear-gradient(135deg, #23A559 0%, #0EA5E9 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)'
];

const DECORATIONS = [
  { id: 'none', label: 'Sem moldura' },
  { id: 'nitro-glow', label: 'Brilho Roxo' },
  { id: 'cyber-ring', label: 'Neon Ciano' },
  { id: 'fire-aura', label: 'Aura de Fogo' },
  { id: 'gold-crown', label: 'Ouro Real' },
  { id: 'emerald-pulse', label: 'Esmeralda' }
];

const NAMEPLATES = [
  { id: 'none', label: 'Padrão' },
  { id: 'aurora-purple', label: 'Aurora Roxa' },
  { id: 'crimson-ember', label: 'Brasa Carmesim' },
  { id: 'cyber-cyan', label: 'Cyber Ciano' },
  { id: 'emerald-matrix', label: 'Esmeralda' },
  { id: 'golden-sunset', label: 'Ouro Solar' }
];

const PROFILE_EFFECTS = [
  { id: 'none', label: 'Sem efeito' },
  { id: 'cyber-glitch', label: '⚡ Cyber Glitch' },
  { id: 'sakura-glow', label: '🌸 Aurora Mística' },
  { id: 'crimson-thunder', label: '🔥 Fúria Carmesim' },
  { id: 'galaxy-portal', label: '🌌 Portal Galáctico' },
  { id: 'matrix-rain', label: '💚 Matrix Neon' }
];

const CLAN_ICONS = ['💀', '🩵', '🔥', '⚡', '👑', '🎮', '💎', '🚀'];

export const PROFILE_BADGES = [
  { id: 'nitro', icon: '🚀', label: 'Nitro' },
  { id: 'gamer', icon: '🎮', label: 'Gamer' },
  { id: 'boost', icon: '💎', label: 'Booster' },
  { id: 'dev', icon: '⚡', label: 'Dev' },
  { id: 'vip', icon: '👑', label: 'VIP' },
  { id: 'verified', icon: '🛡️', label: 'Verificado' }
];

function parseBadges(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

export function SettingsModal({ user, onClose, onSave, onUploadAvatar, onLogout, onOpenVoiceSettings, onOpenWhatsNew, onOpenNotes, onVoiceOutputChange, initialSection = 'conta' }) {
  const [section, setSection] = useState(initialSection);
  const [theme, setTheme] = useState(getSavedTheme);
  const initial = useRef({
    display_name: user.display_name || '',
    pronouns: user.pronouns || '',
    custom_status: user.custom_status || '',
    bio: user.bio || '',
    status: user.status || 'online',
    avatar_color: user.avatar_color || '#5865F2',
    avatar_url: user.avatar_url || '',
    banner_color: user.banner_color || '#5865F2',
    banner_url: user.banner_url || '',
    avatar_decoration: user.avatar_decoration || 'none',
    name_color: user.name_color || '#f2f3f5',
    nameplate_style: user.nameplate_style || 'none',
    clan_tag: user.clan_tag || '',
    clan_icon: user.clan_icon || '💀',
    badges: parseBadges(user.badges_json),
    profile_effect: user.profile_effect || 'none'
  });
  const [form, setForm] = useState(() => ({ ...initial.current }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [effectReplayKey, setEffectReplayKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [shake, setShake] = useState(false);
  const avatarFileRef = useRef(null);
  const bannerFileRef = useRef(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);

  // Esc fecha (se tiver alteração sem salvar, avisa igual o Discord)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function tryClose() {
    if (dirty) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }
    onClose();
  }

  async function handleUpload(e, target) {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    setUploading(true);
    try {
      const uploaded = await onUploadAvatar(file);
      set(target === 'avatar' ? 'avatar_url' : 'banner_url', uploaded.url);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        display_name: form.display_name,
        pronouns: form.pronouns,
        custom_status: form.custom_status,
        bio: form.bio,
        status: form.status,
        avatar_color: form.avatar_color,
        avatar_url: form.avatar_url || null,
        banner_color: form.banner_color,
        banner_url: form.banner_url || null,
        avatar_decoration: form.avatar_decoration,
        name_color: form.name_color,
        nameplate_style: form.nameplate_style,
        clan_tag: form.clan_tag.trim().slice(0, 6).toUpperCase(),
        clan_icon: form.clan_icon,
        badges_json: JSON.stringify(form.badges),
        profile_effect: form.profile_effect
      });
      initial.current = { ...form };
      setForm(f => ({ ...f }));
    } catch (err) {
      setSaveError(err.message || 'Não deu pra salvar');
    } finally {
      setSaving(false);
    }
  }

  const NAV = [
    { group: 'Configurações de usuário' },
    { id: 'conta', label: 'Minha conta', icon: User },
    { id: 'perfil', label: 'Perfil', icon: IdCard },
    { id: 'cla', label: 'Clã e insígnias', icon: Shield },
    { group: 'Configurações do app' },
    { id: 'aparencia', label: 'Aparência', icon: Palette },
    { id: 'voz', label: 'Voz e vídeo', icon: Mic },
    { id: 'notif', label: 'Notificações', icon: Bell },
    { id: 'sons', label: 'Sons', icon: Volume2 }
  ];
  const title = NAV.find(n => n.id === section)?.label || '';
  const showPreview = section === 'conta' || section === 'perfil' || section === 'cla';

  const preview = (
    <div key={effectReplayKey} className={`profile-card-preview settings-preview nameplate-${form.nameplate_style} effect-${form.profile_effect}`}>
      {form.profile_effect !== 'none' && <div className="profile-fx-overlay" aria-hidden="true" />}
      <div
        className="profile-banner"
        style={form.banner_url ? { backgroundImage: `url(${resolveAssetUrl(form.banner_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: form.banner_color }}
      />
      <div className="profile-card-body">
        <div className="profile-avatar-row">
          <div className={`avatar xl deco-${form.avatar_decoration}`} style={{ background: form.avatar_color }}>
            {form.avatar_url ? (
              <img src={resolveAssetUrl(form.avatar_url)} alt={form.display_name} className="avatar-img" />
            ) : (
              (form.display_name || user.username || 'R')[0].toUpperCase()
            )}
            <span className={`status-dot ${form.status}`} />
          </div>
          {form.custom_status && <div className="thought-bubble">{form.custom_status}</div>}
        </div>
        <div className="profile-preview-names">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: safeNameColor(form.name_color) || 'var(--text)' }}>{form.display_name || user.username}</strong>
            {form.clan_tag && <span className="clan-tag-pill">{form.clan_icon} {form.clan_tag}</span>}
          </div>
          <span>@{user.username} {form.pronouns ? `• ${form.pronouns}` : ''}</span>
          {form.badges.length > 0 && (
            <div className="badges-bar" style={{ marginTop: 6 }}>
              {PROFILE_BADGES.filter(b => form.badges.includes(b.id)).map(b => <span key={b.id} className="badge-icon-pill" title={b.label}>{b.icon}</span>)}
            </div>
          )}
          {form.bio && <p className="settings-preview-bio">{form.bio}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`settings-layer ${shake ? 'shake' : ''}`}>
      {form.profile_effect !== 'none' && section === 'perfil' && (
        <div key={`bg-${effectReplayKey}`} className={`fullscreen-fx-overlay effect-${form.profile_effect}`} aria-hidden="true">
          <div className="profile-fx-overlay" />
        </div>
      )}
      <nav className="settings-nav">
        <div className="settings-nav-inner">
          {NAV.map((n, i) => n.group ? (
            <h4 key={`g${i}`}>{n.group}</h4>
          ) : (
            <button key={n.id} type="button" className={section === n.id ? 'active' : ''} onClick={() => setSection(n.id)}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
          <div className="settings-nav-sep" />
          {onOpenNotes && (
            <button type="button" onClick={() => { onClose(); onOpenNotes(); }}>
              <Lock size={16} /> Notas privadas
            </button>
          )}
          {onOpenWhatsNew && (
            <button type="button" onClick={() => { onClose(); onOpenWhatsNew(); }}>
              <Sparkles size={16} /> O que há de novo
            </button>
          )}
          <button type="button" className="danger" onClick={onLogout}>
            <LogOut size={16} /> Sair da conta
          </button>
        </div>
      </nav>

      <main className="settings-content">
        <div className="settings-content-inner">
          <div className="settings-head">
            <h2>{title}</h2>
            <button type="button" className="settings-close" onClick={tryClose} title="Fechar (Esc)">
              <X size={18} />
              <small>ESC</small>
            </button>
          </div>

          <div className={`settings-body ${showPreview ? 'with-preview' : ''}`}>
            <div className="settings-form">
              {section === 'conta' && (
                <>
                  <div className="settings-group">
                    <h3>Foto e banner</h3>
                    <div className="settings-row-wrap">
                      <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e, 'avatar')} />
                      <input ref={bannerFileRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e, 'banner')} />
                      <button type="button" className="btn-primary sm" disabled={uploading} onClick={() => avatarFileRef.current?.click()}>
                        <Upload size={14} /> Trocar avatar
                      </button>
                      <button type="button" className="btn-ghost sm" disabled={uploading} onClick={() => bannerFileRef.current?.click()}>
                        <Upload size={14} /> Trocar banner
                      </button>
                      {form.avatar_url && <button type="button" className="btn-link" onClick={() => set('avatar_url', '')}>Tirar avatar</button>}
                      {form.banner_url && <button type="button" className="btn-link" onClick={() => set('banner_url', '')}>Tirar banner</button>}
                      {uploading && <small>Enviando...</small>}
                    </div>
                    <small className="settings-hint">Foto ou GIF. Sem foto, fica a cor abaixo.</small>
                    <div className="color-picker">
                      {['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C', '#9B59B6', '#E67E22'].map(c => (
                        <button key={c} type="button" className={`color-swatch ${form.avatar_color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('avatar_color', c)} title="Cor do avatar" />
                      ))}
                    </div>
                  </div>

                  <div className="settings-group">
                    <h3>Nome e status</h3>
                    <label className="settings-field">
                      <span>Nome de exibição</span>
                      <input value={form.display_name} maxLength={32} onChange={e => set('display_name', e.target.value)} />
                    </label>
                    <label className="settings-field">
                      <span>Status</span>
                      <select value={form.status} onChange={e => set('status', e.target.value)}>
                        <option value="online">🟢 Online</option>
                        <option value="idle">🌙 Ausente</option>
                        <option value="dnd">⛔ Não perturbe (sem som de menção e sem notificação)</option>
                        <option value="offline">⚫ Invisível</option>
                      </select>
                    </label>
                    <label className="settings-field">
                      <span>Status personalizado</span>
                      <input value={form.custom_status} maxLength={80} onChange={e => set('custom_status', e.target.value)} placeholder="ex: jogando GeoGuessr" />
                    </label>
                    <label className="settings-field">
                      <span>Sobre mim</span>
                      <textarea rows={3} maxLength={500} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Conta um pouco sobre você (aparece quando clicam no seu nome)" />
                    </label>
                  </div>
                </>
              )}

              {section === 'perfil' && (
                <>
                  <div className="settings-group">
                    <h3>Pronomes / subtítulo</h3>
                    <input value={form.pronouns} maxLength={24} onChange={e => set('pronouns', e.target.value)} placeholder="ex: ele/dele" />
                  </div>
                  <div className="settings-group">
                    <h3>Cor do nome</h3>
                    <div className="color-picker">
                      {COLORS.map(c => (
                        <button key={c} type="button" className={`color-swatch ${form.name_color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('name_color', c)} />
                      ))}
                    </div>
                  </div>
                  <div className="settings-group">
                    <h3>Banner</h3>
                    <div className="color-picker">
                      {BANNERS.map(b => (
                        <button key={b} type="button" className={`color-swatch ${form.banner_color === b ? 'active' : ''}`} style={{ background: b }} onClick={() => set('banner_color', b)} />
                      ))}
                    </div>
                    {form.banner_url && <small className="settings-hint">Você tem uma imagem de banner: ela aparece no lugar da cor (dá pra tirar em Minha conta).</small>}
                  </div>
                  <div className="settings-group">
                    <h3><Sparkles size={13} /> Moldura do avatar</h3>
                    <div className="deco-picker">
                      {DECORATIONS.map(d => (
                        <button key={d.id} type="button" className={`deco-chip ${form.avatar_decoration === d.id ? 'active' : ''}`} onClick={() => set('avatar_decoration', d.id)}>{d.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-group">
                    <h3>Placa de fundo (nameplate)</h3>
                    <div className="deco-picker">
                      {NAMEPLATES.map(np => (
                        <button key={np.id} type="button" className={`deco-chip ${form.nameplate_style === np.id ? 'active' : ''}`} onClick={() => set('nameplate_style', np.id)}>{np.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-group">
                    <h3>✨ Efeito do perfil</h3>
                    <div className="deco-picker">
                      {PROFILE_EFFECTS.map(fx => (
                        <button
                          key={fx.id}
                          type="button"
                          className={`deco-chip ${form.profile_effect === fx.id ? 'active' : ''}`}
                          onClick={() => { set('profile_effect', fx.id); setEffectReplayKey(k => k + 1); }}
                        >
                          {fx.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {section === 'cla' && (
                <>
                  <div className="settings-group">
                    <h3>Tag do clã (até 6 letras)</h3>
                    <input maxLength={6} value={form.clan_tag} onChange={e => set('clan_tag', e.target.value.toUpperCase())} placeholder="ex: 0DAY, QSR" />
                  </div>
                  <div className="settings-group">
                    <h3>Ícone da tag</h3>
                    <div className="deco-picker">
                      {CLAN_ICONS.map(ic => (
                        <button key={ic} type="button" className={`deco-chip ${form.clan_icon === ic ? 'active' : ''}`} onClick={() => set('clan_icon', ic)}>{ic}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-group">
                    <h3><Gift size={13} /> Insígnias do perfil</h3>
                    <div className="deco-picker">
                      {PROFILE_BADGES.map(b => (
                        <button
                          key={b.id}
                          type="button"
                          className={`deco-chip ${form.badges.includes(b.id) ? 'active' : ''}`}
                          onClick={() => set('badges', form.badges.includes(b.id) ? form.badges.filter(x => x !== b.id) : [...form.badges, b.id])}
                        >
                          {b.icon} {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {section === 'aparencia' && (
                <div className="settings-group">
                  <h3>Tema</h3>
                  <small className="settings-hint">Muda só pra você, na hora.</small>
                  <div className="theme-grid">
                    {THEMES.map(t => (
                      <button key={t.id} type="button" className={`theme-option ${theme === t.id ? 'active' : ''}`} onClick={() => setTheme(applyTheme(t.id))}>
                        <span className="theme-sample" style={{ background: t.chat }}>
                          <i style={{ background: t.side }} />
                          <b style={{ background: t.dot }} />
                        </span>
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {section === 'voz' && <VoiceVideoSection onOpenVoiceSettings={onOpenVoiceSettings} onVoiceOutputChange={onVoiceOutputChange} />}
              {section === 'notif' && <NotificationsSection />}
              {section === 'sons' && <SoundsSection />}
            </div>

            {showPreview && (
              <aside className="settings-preview-col">
                <h3>Prévia</h3>
                {preview}
              </aside>
            )}
          </div>
        </div>
      </main>

      {dirty && (
        <div className="settings-unsaved">
          <span>{saveError ? `Erro: ${saveError}` : 'Cuidado, você tem alterações que não foram salvas!'}</span>
          <div>
            <button type="button" className="btn-link" onClick={() => setForm({ ...initial.current })}>Redefinir</button>
            <button type="button" className="btn-success" disabled={saving} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Voz e vídeo: aparelhos (o microfone e a supressão de ruído ficam na janela de voz do RONNCORD) =====
function VoiceVideoSection({ onOpenVoiceSettings, onVoiceOutputChange }) {
  const [devices, setDevices] = useState([]);
  const [output, setOutput] = useState(() => localStorage.getItem('ronncord_output_device') || 'default');
  const [camera, setCamera] = useState(() => localStorage.getItem('ronncord_camera') || 'default');
  const [camTest, setCamTest] = useState(null);
  const camRef = useRef(null);

  useEffect(() => {
    // pede permissão uma vez pra o navegador mostrar o nome dos aparelhos
    navigator.mediaDevices?.enumerateDevices?.().then(setDevices).catch(() => {});
    return () => camTest?.getTracks().forEach(t => t.stop());
  }, []);
  useEffect(() => {
    if (camRef.current && camTest) { camRef.current.srcObject = camTest; camRef.current.play?.().catch(() => {}); }
    return () => {};
  }, [camTest]);

  const outputs = devices.filter(d => d.kind === 'audiooutput');
  const cams = devices.filter(d => d.kind === 'videoinput');
  const canPickOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  async function toggleCam() {
    if (camTest) { camTest.getTracks().forEach(t => t.stop()); setCamTest(null); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: camera !== 'default' ? { deviceId: { ideal: camera } } : true });
      setCamTest(s);
      navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
    } catch (err) {
      alert('Não deu pra abrir a câmera: ' + err.message);
    }
  }

  return (
    <>
      <div className="settings-group">
        <h3>Microfone e supressão de ruído</h3>
        <small className="settings-hint">Microfone, modo de entrada (falar livre ou apertar pra falar), supressão de ruído e teste de voz.</small>
        <div><button type="button" className="btn-primary sm" onClick={onOpenVoiceSettings}><Mic size={14} /> Abrir configurações de voz</button></div>
      </div>
      <div className="settings-group">
        <h3>Saída de áudio</h3>
        {canPickOutput ? (
          <div className="settings-row-wrap">
            <select
              value={output}
              onChange={e => {
                setOutput(e.target.value);
                localStorage.setItem('ronncord_output_device', e.target.value);
                refreshOutputDevice();
                onVoiceOutputChange?.();
              }}
              style={{ flex: 1, minWidth: 200 }}
            >
              <option value="default">Padrão do sistema</option>
              {outputs.filter(d => d.deviceId !== 'default').map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Saída de áudio'}</option>
              ))}
            </select>
            <button type="button" className="btn-ghost sm" onClick={() => SoundFX.joinVoice()}><Play size={14} /> Testar</button>
          </div>
        ) : (
          <small className="settings-hint">Este navegador não deixa escolher a saída: usa a do sistema.</small>
        )}
      </div>
      <div className="settings-group">
        <h3><Video size={13} /> Câmera</h3>
        <div className="settings-row-wrap">
          <select
            value={camera}
            onChange={e => { setCamera(e.target.value); localStorage.setItem('ronncord_camera', e.target.value); if (camTest) { camTest.getTracks().forEach(t => t.stop()); setCamTest(null); } }}
            style={{ flex: 1, minWidth: 200 }}
          >
            <option value="default">Padrão</option>
            {cams.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Câmera'}</option>)}
          </select>
          <button type="button" className="btn-ghost sm" onClick={toggleCam}>{camTest ? 'Parar teste' : 'Testar câmera'}</button>
        </div>
        {camTest && <video ref={camRef} className="settings-cam-test" muted playsInline autoPlay />}
      </div>
    </>
  );
}

// ===== Notificações =====
function NotificationsSection() {
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(supported ? Notification.permission : 'unsupported');
  const [mode, setMode] = useState(() => localStorage.getItem('ronncord_notif_mode') || 'mencoes');
  return (
    <>
      <div className="settings-group">
        <h3>Neste aparelho</h3>
        <small className="settings-hint">
          {perm === 'granted' ? 'Ligadas: chega aviso de DM, menção e /aviso mesmo com o RONNCORD fechado.'
            : perm === 'denied' ? 'Bloqueadas no navegador. Libere no cadeado ao lado do endereço do site.'
            : perm === 'unsupported' ? 'Este navegador não tem notificações.'
            : 'Desligadas.'}
        </small>
        {perm === 'default' && (
          <div><button type="button" className="btn-primary sm" onClick={() => Notification.requestPermission().then(p => { setPerm(p); if (p === 'granted') ensurePushSubscription(); })}><Bell size={14} /> Ligar neste aparelho</button></div>
        )}
      </div>
      <div className="settings-group">
        <h3>Me avisar de</h3>
        <select value={mode} onChange={e => { setMode(e.target.value); localStorage.setItem('ronncord_notif_mode', e.target.value); }}>
          <option value="tudo">Todas as mensagens</option>
          <option value="mencoes">Só menções, DMs e /aviso</option>
          <option value="nada">Nada</option>
        </select>
        <small className="settings-hint">No status Não perturbe nada toca nem aparece.</small>
      </div>
    </>
  );
}

// ===== Sons =====
function SoundsSection() {
  const [on, setOn] = useState(isSoundsEnabled);
  const [vol, setVol] = useState(getSoundVolume);
  return (
    <div className="settings-group">
      <h3>Efeitos</h3>
      <label className="settings-check">
        <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setSoundsEnabled(e.target.checked); }} />
        Sons de entrar e sair da call, mutar, menção e transmissão
      </label>
      <div className="settings-row-wrap">
        <Volume2 size={16} />
        <input type="range" min={5} max={100} step={5} value={vol} disabled={!on} onChange={e => { setVol(Number(e.target.value)); setSoundVolume(e.target.value); }} style={{ flex: 1 }} />
        <span className="settings-hint" style={{ minWidth: 38 }}>{vol}%</span>
        <button type="button" className="btn-ghost sm" disabled={!on} onClick={() => SoundFX.joinVoice()}><Play size={14} /> Testar</button>
      </div>
    </div>
  );
}
