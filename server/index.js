import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import { db, sanitizeUser } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(__dirname, 'data', '.jwt-secret');
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}
const JWT_SECRET = resolveJwtSecret();

const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  maxHttpBufferSize: 50 * 1024 * 1024
});

// Security headers + No rate limits — unlimited self-hosted API
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const SAFE_INLINE_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
app.use('/uploads', (req, res, next) => {
  const ext = path.extname(req.path || '').toLowerCase();
  if (!SAFE_INLINE_IMAGE_EXTS.has(ext)) {
    res.setHeader('Content-Disposition', 'attachment');
  }
  next();
}, express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const AVATAR_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C', '#9B59B6', '#E67E22'];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
const makeInviteCode = () => crypto.randomBytes(4).toString('hex');

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = sanitizeUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function hydrateMessage(msg) {
  if (!msg) return null;
  const author = db.prepare(`
    SELECT id, username, display_name, avatar_color, avatar_url, avatar_decoration,
      banner_color, banner_url, pronouns, bio, custom_status, status,
      name_color, nameplate_style, clan_tag, clan_icon, badges_json, profile_effect
    FROM users WHERE id = ?
  `).get(msg.author_id);
  const reactionRows = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(msg.id);
  const grouped = {};
  for (const r of reactionRows) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    grouped[r.emoji].count += 1;
    grouped[r.emoji].users.push(r.user_id);
  }
  let replyTo = null;
  if (msg.reply_to_id) {
    const orig = db.prepare('SELECT m.id, m.content, u.display_name as author_name FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?').get(msg.reply_to_id);
    if (orig) replyTo = orig;
  }
  return {
    id: msg.id,
    channel_id: msg.channel_id,
    dm_thread_id: msg.dm_thread_id,
    author_id: msg.author_id,
    author: author || { id: msg.author_id, username: 'unknown', display_name: 'Unknown', avatar_color: '#5865F2', status: 'offline' },
    content: msg.content,
    attachments: JSON.parse(msg.attachments_json || '[]'),
    reply_to_id: msg.reply_to_id,
    reply_to: replyTo,
    reactions: Object.values(grouped),
    edited_at: msg.edited_at,
    created_at: msg.created_at
  };
}

function ensureDefaultServerForUser(userId) {
  const existing = db.prepare('SELECT server_id FROM server_members WHERE user_id = ? LIMIT 1').get(userId);
  if (existing) return;

  // Check if global RONNCORD Hub exists; if so, join it, otherwise create it
  let hub = db.prepare("SELECT * FROM servers WHERE invite_code = 'ronncord-hub'").get();
  const now = Date.now();
  if (!hub) {
    const serverId = crypto.randomUUID();
    db.prepare('INSERT INTO servers (id, name, icon_color, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      serverId, 'RONNCORD', '#5865F2', userId, 'ronncord-hub', now
    );
    const defaultChannels = [
      { category: 'TEXT CHANNELS', name: 'general', type: 'text', topic: 'Chat geral da comunidade RONNCORD', pos: 0 },
      { category: 'TEXT CHANNELS', name: 'introductions', type: 'text', topic: 'Apresente-se para a galera!', pos: 1 },
      { category: 'TEXT CHANNELS', name: 'gaming', type: 'text', topic: 'Bora jogar!', pos: 2 },
      { category: 'TEXT CHANNELS', name: 'memes', type: 'text', topic: 'Memes e clips', pos: 3 },
      { category: 'VOICE CHANNELS', name: 'General Voice', type: 'voice', topic: '', pos: 4 },
      { category: 'VOICE CHANNELS', name: 'Gaming Room', type: 'voice', topic: '', pos: 5 }
    ];
    const insertCh = db.prepare('INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    let generalId = null;
    for (const ch of defaultChannels) {
      const chId = crypto.randomUUID();
      if (ch.name === 'general') generalId = chId;
      insertCh.run(chId, serverId, ch.category, ch.name, ch.type, ch.topic, ch.pos, now);
    }
    if (generalId) {
      db.prepare('INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(),
        generalId,
        userId,
        'Bem-vindo ao **RONNCORD**! 🚀 Servidor próprio, tempo real via WebSockets e API 100% ilimitada.',
        now
      );
    }
    db.prepare('INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(serverId, userId, 'owner', now);
  } else {
    db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(hub.id, userId, 'member', now);
  }
}

function getFullServersForUser(userId) {
  const servers = db.prepare(`
    SELECT s.*, sm.role as my_role
    FROM servers s
    JOIN server_members sm ON sm.server_id = s.id
    WHERE sm.user_id = ?
    ORDER BY s.created_at ASC
  `).all(userId);

  return servers.map(s => {
    const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC').all(s.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.avatar_decoration,
        u.banner_color, u.banner_url, u.pronouns, u.status, u.custom_status, u.bio,
        u.name_color, u.nameplate_style, u.clan_tag, u.clan_icon, u.badges_json, u.profile_effect,
        sm.role
      FROM server_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?
      ORDER BY sm.role DESC, u.display_name ASC
    `).all(s.id);
    return { ...s, channels, members };
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'ronncord-api', unlimited: true, timestamp: Date.now() });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { username, displayName, email, password } = req.body || {};
  const cleanUser = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  if (!cleanUser || cleanUser.length < 2) {
    return res.status(400).json({ error: 'Username deve ter pelo menos 2 caracteres válidos' });
  }
  if (!password || String(password).length < 4) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)').get(cleanUser, email || null);
  if (exists) {
    return res.status(409).json({ error: 'Username ou email já cadastrado' });
  }

  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(String(password), 10);
  const now = Date.now();
  db.prepare(
    'INSERT INTO users (id, username, display_name, email, password_hash, avatar_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, cleanUser, String(displayName || cleanUser).trim(), email ? String(email).trim() : null, hash, pickColor(), 'online', now);

  ensureDefaultServerForUser(id);
  const user = sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  const token = signToken(id);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const identifier = String(username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  db.prepare("UPDATE users SET status = 'online' WHERE id = ?").run(user.id);
  ensureDefaultServerForUser(user.id);
  const fresh = sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  const token = signToken(user.id);
  res.json({ token, user: fresh });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.patch('/api/auth/profile', authMiddleware, (req, res) => {
  const {
    display_name, status, custom_status, bio, avatar_color, avatar_url,
    banner_color, banner_url, avatar_decoration, pronouns,
    name_color, nameplate_style, clan_tag, clan_icon, badges_json, profile_effect
  } = req.body || {};
  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      status = COALESCE(?, status),
      custom_status = COALESCE(?, custom_status),
      bio = COALESCE(?, bio),
      avatar_color = COALESCE(?, avatar_color),
      avatar_url = ?,
      banner_color = COALESCE(?, banner_color),
      banner_url = ?,
      avatar_decoration = COALESCE(?, avatar_decoration),
      pronouns = COALESCE(?, pronouns),
      name_color = COALESCE(?, name_color),
      nameplate_style = COALESCE(?, nameplate_style),
      clan_tag = COALESCE(?, clan_tag),
      clan_icon = COALESCE(?, clan_icon),
      badges_json = COALESCE(?, badges_json),
      profile_effect = COALESCE(?, profile_effect)
    WHERE id = ?
  `).run(
    display_name ?? null,
    status ?? null,
    custom_status ?? null,
    bio ?? null,
    avatar_color ?? null,
    avatar_url !== undefined ? avatar_url : req.user.avatar_url,
    banner_color ?? null,
    banner_url !== undefined ? banner_url : req.user.banner_url,
    avatar_decoration ?? null,
    pronouns ?? null,
    name_color ?? null,
    nameplate_style ?? null,
    clan_tag !== undefined ? String(clan_tag).slice(0, 6).toUpperCase() : null,
    clan_icon ?? null,
    badges_json !== undefined ? (typeof badges_json === 'string' ? badges_json : JSON.stringify(badges_json)) : null,
    profile_effect ?? null,
    req.user.id
  );
  const updated = sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  io.emit('presence:update', {
    userId: updated.id,
    status: updated.status,
    custom_status: updated.custom_status,
    display_name: updated.display_name,
    avatar_color: updated.avatar_color,
    avatar_url: updated.avatar_url,
    avatar_decoration: updated.avatar_decoration,
    banner_color: updated.banner_color,
    banner_url: updated.banner_url,
    pronouns: updated.pronouns,
    bio: updated.bio,
    name_color: updated.name_color,
    nameplate_style: updated.nameplate_style,
    clan_tag: updated.clan_tag,
    clan_icon: updated.clan_icon,
    badges_json: updated.badges_json,
    profile_effect: updated.profile_effect
  });
  res.json({ user: updated });
});

// Upload route
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// Servers routes
app.get('/api/servers', authMiddleware, (req, res) => {
  res.json({ servers: getFullServersForUser(req.user.id) });
});

app.post('/api/servers', authMiddleware, (req, res) => {
  const { name, icon_color } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome do servidor obrigatório' });

  const serverId = crypto.randomUUID();
  const now = Date.now();
  const inviteCode = makeInviteCode();

  db.prepare('INSERT INTO servers (id, name, icon_color, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    serverId, String(name).trim(), icon_color || pickColor(), req.user.id, inviteCode, now
  );
  db.prepare('INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(serverId, req.user.id, 'owner', now);

  const insertCh = db.prepare('INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertCh.run(crypto.randomUUID(), serverId, 'TEXT CHANNELS', 'general', 'text', 'Canal geral', 0, now);
  insertCh.run(crypto.randomUUID(), serverId, 'VOICE CHANNELS', 'Lobby', 'voice', '', 1, now);

  const created = getFullServersForUser(req.user.id).find(s => s.id === serverId);
  res.status(201).json({ server: created });
});

const DISCORD_PRESETS = {
  gaming: {
    name: 'Squad Gaming',
    channels: [
      { category: 'INFORMAÇÕES', name: 'regras', type: 'text', topic: 'Regras do clã' },
      { category: 'INFORMAÇÕES', name: 'avisos', type: 'text', topic: 'Anúncios e campeonatos' },
      { category: 'COMUNIDADE', name: 'chat-geral', type: 'text', topic: 'Resenha e papo furado' },
      { category: 'COMUNIDADE', name: 'clips-e-highlights', type: 'text', topic: 'Mande suas jogadas!' },
      { category: 'COMUNIDADE', name: 'procurando-duo', type: 'text', topic: 'Monte sua pt aqui' },
      { category: 'CALLS DE JOGO', name: 'Lobby Geral', type: 'voice' },
      { category: 'CALLS DE JOGO', name: 'Ranked 5v5', type: 'voice' },
      { category: 'CALLS DE JOGO', name: 'AFK / Stream', type: 'voice' }
    ]
  },
  community: {
    name: 'Comunidade VIP',
    channels: [
      { category: 'BOAS-VINDAS', name: 'bem-vindo', type: 'text', topic: 'Apresente-se!' },
      { category: 'BOAS-VINDAS', name: 'cargos', type: 'text', topic: 'Escolha seus interesses' },
      { category: 'CONVERSA', name: 'geral', type: 'text', topic: 'Chat principal' },
      { category: 'CONVERSA', name: 'midia-e-memes', type: 'text', topic: 'Fotos, vídeos e GIFs' },
      { category: 'CONVERSA', name: 'musicas-e-filmes', type: 'text', topic: 'Recomendações' },
      { category: 'VOZ', name: 'Bate-Papo', type: 'voice' },
      { category: 'VOZ', name: 'Cinema 1080p60', type: 'voice' }
    ]
  },
  dev: {
    name: 'Dev & Tech Hub',
    channels: [
      { category: 'GERAL', name: 'announcements', type: 'text', topic: 'Novidades e releases' },
      { category: 'GERAL', name: 'general', type: 'text', topic: 'Discussões gerais' },
      { category: 'DESENVOLVIMENTO', name: 'frontend-react', type: 'text', topic: 'UI, CSS e React' },
      { category: 'DESENVOLVIMENTO', name: 'backend-api', type: 'text', topic: 'Node, DBs e Infra' },
      { category: 'DESENVOLVIMENTO', name: 'showcase', type: 'text', topic: 'Mostre seus projetos' },
      { category: 'VOZ', name: 'Daily / Pair Coding', type: 'voice' },
      { category: 'VOZ', name: 'Chill Coding', type: 'voice' }
    ]
  }
};

app.post('/api/servers/import-discord', authMiddleware, async (req, res) => {
  const { templateInput, preset, customName } = req.body || {};
  let serverName = customName ? String(customName).trim() : '';
  let channelsToCreate = [];

  try {
    if (templateInput && String(templateInput).trim()) {
      const raw = String(templateInput).trim();
      const match = raw.match(/(?:discord\.new\/|templates\/)?([A-Za-z0-9]{6,20})$/);
      const code = match ? match[1] : raw;
      const resp = await fetch(`https://discord.com/api/v9/guilds/templates/${encodeURIComponent(code)}`);
      if (!resp.ok) {
        return res.status(400).json({ error: 'Template do Discord inválido ou privado. Use um link discord.new/CODIGO válido ou escolha um modelo pronto.' });
      }
      const tpl = await resp.json();
      const guild = tpl.serialized_source_guild || {};
      if (!serverName) serverName = tpl.name || guild.name || 'Servidor Importado';

      const rawChannels = Array.isArray(guild.channels) ? guild.channels : [];
      const categories = new Map();
      for (const ch of rawChannels) {
        if (ch.type === 4) categories.set(ch.id, ch.name.toUpperCase());
      }
      const sorted = rawChannels
        .filter(ch => ch.type === 0 || ch.type === 2 || ch.type === 5)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      channelsToCreate = sorted.map(ch => ({
        category: (ch.parent_id !== null && categories.get(ch.parent_id)) || (ch.type === 2 ? 'VOICE CHANNELS' : 'TEXT CHANNELS'),
        name: ch.name || 'canal',
        type: ch.type === 2 ? 'voice' : 'text',
        topic: ch.topic || ''
      }));
    } else if (preset && DISCORD_PRESETS[preset]) {
      const p = DISCORD_PRESETS[preset];
      if (!serverName) serverName = p.name;
      channelsToCreate = p.channels;
    } else {
      return res.status(400).json({ error: 'Informe um link/código de template do Discord (discord.new/...) ou selecione um modelo.' });
    }

    if (channelsToCreate.length === 0) {
      channelsToCreate = [
        { category: 'TEXT CHANNELS', name: 'general', type: 'text', topic: '' },
        { category: 'VOICE CHANNELS', name: 'General Voice', type: 'voice', topic: '' }
      ];
    }

    const serverId = crypto.randomUUID();
    const now = Date.now();
    const inviteCode = makeInviteCode();
    db.prepare('INSERT INTO servers (id, name, icon_color, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      serverId, serverName, pickColor(), req.user.id, inviteCode, now
    );
    db.prepare('INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(serverId, req.user.id, 'owner', now);

    const insertCh = db.prepare('INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    channelsToCreate.forEach((ch, idx) => {
      const cleanName = ch.type === 'text'
        ? String(ch.name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') || 'canal'
        : String(ch.name).trim() || 'Voz';
      insertCh.run(crypto.randomUUID(), serverId, ch.category, cleanName, ch.type, ch.topic || '', idx, now);
    });

    const created = getFullServersForUser(req.user.id).find(s => s.id === serverId);
    res.status(201).json({ server: created });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao importar template: ' + err.message });
  }
});

app.post('/api/servers/join/:inviteCode', authMiddleware, (req, res) => {
  const code = String(req.params.inviteCode || '').trim();
  const srv = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!srv) return res.status(404).json({ error: 'Convite inválido ou expirado' });

  db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    srv.id, req.user.id, 'member', Date.now()
  );
  const full = getFullServersForUser(req.user.id).find(s => s.id === srv.id);
  io.to(`server:${srv.id}`).emit('server:member_joined', { serverId: srv.id, user: req.user });
  res.json({ server: full });
});

app.post('/api/servers/:serverId/channels', authMiddleware, (req, res) => {
  const { serverId } = req.params;
  const member = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Sem acesso ao servidor' });

  const { name, type = 'text', category, topic = '' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome do canal obrigatório' });

  const cleanName = type === 'text'
    ? String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
    : String(name).trim();

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) as mp FROM channels WHERE server_id = ?').get(serverId).mp;
  const chId = crypto.randomUUID();
  const chCat = category || (type === 'voice' ? 'VOICE CHANNELS' : 'TEXT CHANNELS');
  db.prepare('INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    chId, serverId, chCat, cleanName || 'channel', type, topic, maxPos + 1, Date.now()
  );
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(chId);
  io.to(`server:${serverId}`).emit('channel:created', channel);
  res.status(201).json({ channel });
});

app.delete('/api/channels/:channelId', authMiddleware, (req, res) => {
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.channelId);
  if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
  const member = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(ch.server_id, req.user.id);
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return res.status(403).json({ error: 'Apenas donos ou admins podem excluir canais' });
  }
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  io.to(`server:${ch.server_id}`).emit('channel:deleted', { serverId: ch.server_id, channelId: ch.id });
  res.json({ ok: true });
});

// Channel Messages
app.get('/api/channels/:channelId/messages', authMiddleware, (req, res) => {
  const { channelId } = req.params;
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
  const member = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(ch.server_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Sem acesso' });

  const limit = Math.min(Number(req.query.limit || 100), 500);
  const rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?').all(channelId, limit);
  res.json({ messages: rows.map(hydrateMessage) });
});

app.post('/api/channels/:channelId/messages', authMiddleware, (req, res) => {
  const { channelId } = req.params;
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
  const member = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(ch.server_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Sem acesso' });

  const { content = '', attachments = [], reply_to_id = null } = req.body || {};
  if (!String(content).trim() && (!Array.isArray(attachments) || attachments.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  const msgId = crypto.randomUUID();
  db.prepare('INSERT INTO messages (id, channel_id, author_id, content, attachments_json, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    msgId, channelId, req.user.id, String(content).trim(), JSON.stringify(attachments), reply_to_id, Date.now()
  );
  const hydrated = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
  io.to(`channel:${channelId}`).emit('message:new', hydrated);
  res.status(201).json({ message: hydrated });
});

app.patch('/api/messages/:messageId', authMiddleware, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.author_id !== req.user.id) return res.status(403).json({ error: 'Você só pode editar suas próprias mensagens' });

  const { content } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'Conteúdo vazio' });
  db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(String(content).trim(), Date.now(), msg.id);
  const hydrated = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id));
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:updated', hydrated);
  res.json({ message: hydrated });
});

app.delete('/api/messages/:messageId', authMiddleware, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.author_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão para apagar' });

  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:deleted', { id: msg.id, channel_id: msg.channel_id, dm_thread_id: msg.dm_thread_id });
  res.json({ ok: true });
});

function userCanAccessChannel(userId, channelId) {
  const ch = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
  if (!ch) return false;
  return Boolean(db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(ch.server_id, userId));
}

function userCanAccessDm(userId, threadId) {
  return Boolean(db.prepare('SELECT 1 FROM dm_threads WHERE id = ? AND (user1_id = ? OR user2_id = ?)').get(threadId, userId, userId));
}

app.post('/api/messages/:messageId/reactions', authMiddleware, (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

  const hasAccess = msg.channel_id
    ? userCanAccessChannel(req.user.id, msg.channel_id)
    : userCanAccessDm(req.user.id, msg.dm_thread_id);
  if (!hasAccess) return res.status(403).json({ error: 'Sem acesso a esta mensagem' });

  const existing = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(msg.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(msg.id, req.user.id, emoji);
  } else {
    db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(msg.id, req.user.id, emoji);
  }
  const hydrated = hydrateMessage(msg);
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:updated', hydrated);
  res.json({ message: hydrated });
});

// Friends & DMs
app.get('/api/friends', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.status, f.requester_id, f.addressee_id,
      u.id as friend_id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.status as user_status, u.custom_status
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE f.requester_id = ? OR f.addressee_id = ?
  `).all(req.user.id, req.user.id, req.user.id);
  res.json({ friends: rows });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const targetName = String(req.body?.username || '').trim().toLowerCase();
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(targetName);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode adicionar a si mesmo' });

  const existing = db.prepare(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).get(req.user.id, target.id, target.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'Solicitação ou amizade já existe' });

  const id = crypto.randomUUID();
  db.prepare("INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(
    id, req.user.id, target.id, Date.now()
  );
  res.status(201).json({ ok: true, id });
});

app.post('/api/friends/:id/accept', authMiddleware, (req, res) => {
  const f = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ?').get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: 'Solicitação não encontrada' });
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(f.id);
  res.json({ ok: true });
});

app.delete('/api/friends/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)').run(req.params.id, req.user.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/users/search', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = q
    ? db.prepare(`
        SELECT id, username, display_name, avatar_color, avatar_url, status, custom_status
        FROM users
        WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
        LIMIT 20
      `).all(req.user.id, `%${q}%`, `%${q}%`)
    : db.prepare(`
        SELECT id, username, display_name, avatar_color, avatar_url, status, custom_status
        FROM users
        WHERE id != ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(req.user.id);
  res.json({ users: rows });
});

app.get('/api/dms', authMiddleware, (req, res) => {
  const threads = db.prepare(`
    SELECT t.*,
      u.id as peer_id, u.username as peer_username, u.display_name as peer_display_name,
      u.avatar_color as peer_avatar_color, u.status as peer_status, u.custom_status as peer_custom_status
    FROM dm_threads t
    JOIN users u ON u.id = CASE WHEN t.user1_id = ? THEN t.user2_id ELSE t.user1_id END
    WHERE t.user1_id = ? OR t.user2_id = ?
    ORDER BY t.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id);
  res.json({ threads });
});

app.post('/api/dms', authMiddleware, (req, res) => {
  const { targetUserId } = req.body || {};
  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Usuário alvo inválido' });
  const [u1, u2] = [req.user.id, targetUserId].sort();
  let thread = db.prepare('SELECT * FROM dm_threads WHERE user1_id = ? AND user2_id = ?').get(u1, u2);
  if (!thread) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO dm_threads (id, user1_id, user2_id, created_at) VALUES (?, ?, ?, ?)').run(id, u1, u2, Date.now());
    thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(id);
  }
  const peer = sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId));
  res.json({
    thread: {
      ...thread,
      peer_id: peer.id,
      peer_username: peer.username,
      peer_display_name: peer.display_name,
      peer_avatar_color: peer.avatar_color,
      peer_status: peer.status,
      peer_custom_status: peer.custom_status
    }
  });
});

app.get('/api/dms/:threadId/messages', authMiddleware, (req, res) => {
  const t = db.prepare('SELECT * FROM dm_threads WHERE id = ? AND (user1_id = ? OR user2_id = ?)').get(req.params.threadId, req.user.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Conversa não encontrada' });
  const rows = db.prepare('SELECT * FROM messages WHERE dm_thread_id = ? ORDER BY created_at ASC LIMIT 200').all(t.id);
  res.json({ messages: rows.map(hydrateMessage) });
});

app.post('/api/dms/:threadId/messages', authMiddleware, (req, res) => {
  const t = db.prepare('SELECT * FROM dm_threads WHERE id = ? AND (user1_id = ? OR user2_id = ?)').get(req.params.threadId, req.user.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Conversa não encontrada' });

  const { content = '', attachments = [], reply_to_id = null } = req.body || {};
  if (!String(content).trim() && (!Array.isArray(attachments) || attachments.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }
  const msgId = crypto.randomUUID();
  db.prepare('INSERT INTO messages (id, dm_thread_id, author_id, content, attachments_json, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    msgId, t.id, req.user.id, String(content).trim(), JSON.stringify(attachments), reply_to_id, Date.now()
  );
  const hydrated = hydrateMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
  io.to(`dm:${t.id}`).emit('message:new', hydrated);
  res.status(201).json({ message: hydrated });
});

// Socket.IO Real-Time + Voice Signaling (ready for Phase 2)
const voiceRooms = new Map(); // channelId -> Map<socketId, userSummary>

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(new Error('Unauthorized'));
    socket.user = sanitizeUser(user);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  socket.join(`user:${userId}`);

  // Join all servers the user belongs to
  const myServers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId);
  for (const s of myServers) socket.join(`server:${s.server_id}`);

  db.prepare("UPDATE users SET status = 'online' WHERE id = ? AND status = 'offline'").run(userId);
  io.emit('presence:update', { userId, status: socket.user.status === 'offline' ? 'online' : socket.user.status });

  socket.on('join_channel', (channelId) => {
    if (!userCanAccessChannel(userId, channelId)) return;
    socket.join(`channel:${channelId}`);
  });
  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel:${channelId}`);
  });
  socket.on('join_dm', (threadId) => {
    if (!userCanAccessDm(userId, threadId)) return;
    socket.join(`dm:${threadId}`);
  });

  socket.on('typing_start', ({ channelId, dmThreadId }) => {
    if (channelId && !userCanAccessChannel(userId, channelId)) return;
    if (dmThreadId && !userCanAccessDm(userId, dmThreadId)) return;
    const room = channelId ? `channel:${channelId}` : `dm:${dmThreadId}`;
    socket.to(room).emit('typing:update', {
      userId,
      displayName: socket.user.display_name,
      channelId,
      dmThreadId,
      isTyping: true
    });
  });

  socket.on('typing_stop', ({ channelId, dmThreadId }) => {
    const room = channelId ? `channel:${channelId}` : `dm:${dmThreadId}`;
    socket.to(room).emit('typing:update', {
      userId,
      displayName: socket.user.display_name,
      channelId,
      dmThreadId,
      isTyping: false
    });
  });

  // Voice room presence & WebRTC signaling relay
  socket.on('voice:join', (channelId) => {
    if (!userCanAccessChannel(userId, channelId)) return;
    // Leave any previous voice room first
    for (const [prevChId, prevRoom] of voiceRooms.entries()) {
      if (prevChId !== channelId && prevRoom.has(socket.id)) {
        prevRoom.delete(socket.id);
        socket.leave(`voice:${prevChId}`);
        io.emit('voice:participants', { channelId: prevChId, participants: Array.from(prevRoom.values()) });
      }
    }

    if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
    const room = voiceRooms.get(channelId);
    const existingPeers = Array.from(room.values());

    room.set(socket.id, {
      socketId: socket.id,
      userId: socket.user.id,
      displayName: socket.user.display_name,
      avatarColor: socket.user.avatar_color,
      muted: false,
      deafened: false,
      speaking: false,
      cameraOn: false,
      screenSharing: false
    });
    socket.join(`voice:${channelId}`);

    // Tell the joiner who is already in the room so they initiate WebRTC offers
    socket.emit('voice:peers', { channelId, peers: existingPeers });
    io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
  });

  socket.on('voice:state', ({ channelId, muted, deafened, speaking, cameraOn, screenSharing }) => {
    const room = voiceRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    const current = room.get(socket.id);
    const updated = {
      ...current,
      ...(muted !== undefined ? { muted } : {}),
      ...(deafened !== undefined ? { deafened } : {}),
      ...(speaking !== undefined ? { speaking } : {}),
      ...(cameraOn !== undefined ? { cameraOn } : {}),
      ...(screenSharing !== undefined ? { screenSharing } : {})
    };
    room.set(socket.id, updated);
    io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
  });

  socket.on('voice:leave', (channelId) => {
    const room = voiceRooms.get(channelId);
    if (room) {
      room.delete(socket.id);
      io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
    }
    socket.leave(`voice:${channelId}`);
  });

  socket.on('webrtc:signal', ({ targetSocketId, channelId, signal }) => {
    io.to(targetSocketId).emit('webrtc:signal', {
      fromSocketId: socket.id,
      channelId,
      user: socket.user,
      signal
    });
  });

  socket.on('disconnect', () => {
    for (const [channelId, room] of voiceRooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
      }
    }
    db.prepare("UPDATE users SET status = 'offline' WHERE id = ?").run(userId);
    io.emit('presence:update', { userId, status: 'offline' });
  });
});

server.listen(PORT, () => {
  console.log(`[RONNCORD API] Running on http://localhost:${PORT} (Unlimited API)`);
});
