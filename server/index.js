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
import { db, initDatabase, sanitizeUser } from './db.js';

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
const MSG_ENC_KEY = crypto
  .createHash('sha256')
  .update('ronncord-msg-v1:' + (process.env.MESSAGE_ENCRYPTION_KEY || JWT_SECRET))
  .digest();

function encryptMessageText(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MSG_ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptMessageText(stored) {
  if (!stored) return '';
  const s = String(stored);
  if (!s.startsWith('enc:v1:')) return s;
  try {
    const [, , ivB64, tagB64, ctB64] = s.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MSG_ENC_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '[Mensagem criptografada]';
  }
}

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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const AVATAR_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C', '#9B59B6', '#E67E22'];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
const makeInviteCode = () => crypto.randomBytes(4).toString('hex');

function sanitizeAssetUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (s.startsWith('/api/files/') || s.startsWith('/uploads/') || /^https?:\/\//i.test(s)) return s;
  return null;
}

function sanitizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(a => ({ ...a, url: sanitizeAssetUrl(a?.url) }))
    .filter(a => Boolean(a.url));
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT * FROM users WHERE id = ?', payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = sanitizeUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

async function hydrateMessage(msg) {
  if (!msg) return null;
  const author = await db.get(
    `SELECT id, username, display_name, avatar_color, avatar_url, avatar_decoration,
      banner_color, banner_url, pronouns, bio, custom_status, status,
      name_color, nameplate_style, clan_tag, clan_icon, badges_json, profile_effect
     FROM users WHERE id = ?`,
    msg.author_id
  );
  const reactionRows = await db.all('SELECT emoji, user_id FROM reactions WHERE message_id = ?', msg.id);
  const grouped = {};
  for (const r of reactionRows) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    grouped[r.emoji].count += 1;
    grouped[r.emoji].users.push(r.user_id);
  }
  let replyTo = null;
  if (msg.reply_to_id) {
    const orig = await db.get(
      'SELECT m.id, m.content, u.display_name as author_name FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?',
      msg.reply_to_id
    );
    if (orig) replyTo = { ...orig, content: decryptMessageText(orig.content) };
  }
  return {
    id: msg.id,
    channel_id: msg.channel_id,
    dm_thread_id: msg.dm_thread_id,
    author_id: msg.author_id,
    author: author || { id: msg.author_id, username: 'unknown', display_name: 'Unknown', avatar_color: '#5865F2', status: 'offline' },
    content: decryptMessageText(msg.content),
    attachments: JSON.parse(msg.attachments_json || '[]'),
    reply_to_id: msg.reply_to_id,
    reply_to: replyTo,
    reactions: Object.values(grouped),
    pinned: Boolean(msg.pinned),
    edited_at: msg.edited_at,
    created_at: msg.created_at
  };
}

async function getFullServersForUser(userId) {
  const servers = await db.all(
    `SELECT s.*, sm.role as my_role
     FROM servers s
     JOIN server_members sm ON sm.server_id = s.id
     WHERE sm.user_id = ?
     ORDER BY s.created_at ASC`,
    userId
  );

  const result = [];
  for (const s of servers) {
    const channels = await db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC', s.id);
    const members = await db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.avatar_decoration,
        u.banner_color, u.banner_url, u.pronouns, u.status, u.custom_status, u.bio,
        u.name_color, u.nameplate_style, u.clan_tag, u.clan_icon, u.badges_json, u.profile_effect,
        sm.role
       FROM server_members sm
       JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ?
       ORDER BY sm.role DESC, u.display_name ASC`,
      s.id
    );
    result.push({ ...s, channels, members });
  }
  return result;
}

async function userCanAccessChannel(userId, channelId) {
  const ch = await db.get('SELECT server_id FROM channels WHERE id = ?', channelId);
  if (!ch) return false;
  return Boolean(await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', ch.server_id, userId));
}

async function userCanAccessDm(userId, threadId) {
  return Boolean(await db.get('SELECT 1 FROM dm_threads WHERE id = ? AND (user1_id = ? OR user2_id = ?)', threadId, userId, userId));
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'ronncord-api',
    unlimited: true,
    persistentDb: Boolean(process.env.TURSO_DATABASE_URL),
    timestamp: Date.now()
  });
});

// Persistent DB-backed file serving
app.get('/api/files/:id/:name?', async (req, res) => {
  const file = await db.get('SELECT * FROM files WHERE id = ?', req.params.id);
  if (!file) return res.status(404).send('Arquivo não encontrado');
  const ext = path.extname(file.filename || '').toLowerCase();
  res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (!SAFE_INLINE_IMAGE_EXTS.has(ext)) {
    res.setHeader('Content-Disposition', 'attachment');
  }
  res.send(Buffer.from(file.data_base64, 'base64'));
});

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const id = crypto.randomUUID();
  const safeName = (req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  await db.run(
    'INSERT INTO files (id, filename, mimetype, data_base64, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    safeName,
    req.file.mimetype || 'application/octet-stream',
    req.file.buffer.toString('base64'),
    Date.now()
  );
  res.json({
    url: `/api/files/${id}/${safeName}`,
    name: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
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

  const exists = await db.get('SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)', cleanUser, email || null);
  if (exists) {
    return res.status(409).json({ error: 'Username ou email já cadastrado' });
  }

  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(String(password), 12);
  const now = Date.now();
  await db.run(
    'INSERT INTO users (id, username, display_name, email, password_hash, avatar_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, cleanUser, String(displayName || cleanUser).trim(), email ? String(email).trim() : null, hash, pickColor(), 'online', now
  );

  const user = sanitizeUser(await db.get('SELECT * FROM users WHERE id = ?', id));
  const token = signToken(id);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const identifier = String(username || '').trim().toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', identifier, identifier);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  await db.run("UPDATE users SET status = 'online' WHERE id = ?", user.id);
  const fresh = sanitizeUser(await db.get('SELECT * FROM users WHERE id = ?', user.id));
  const token = signToken(user.id);
  res.json({ token, user: fresh });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user, token: signToken(req.user.id) });
});

app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
  const {
    display_name, status, custom_status, bio, avatar_color, avatar_url,
    banner_color, banner_url, avatar_decoration, pronouns,
    name_color, nameplate_style, clan_tag, clan_icon, badges_json, profile_effect
  } = req.body || {};

  await db.run(
    `UPDATE users SET
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
     WHERE id = ?`,
    display_name !== undefined ? String(display_name).trim().slice(0, 32) : null,
    status !== undefined && ['online', 'idle', 'dnd', 'offline'].includes(status) ? status : null,
    custom_status !== undefined ? String(custom_status).slice(0, 80) : null,
    bio !== undefined ? String(bio).slice(0, 500) : null,
    avatar_color ?? null,
    avatar_url !== undefined ? sanitizeAssetUrl(avatar_url) : req.user.avatar_url,
    banner_color ?? null,
    banner_url !== undefined ? sanitizeAssetUrl(banner_url) : req.user.banner_url,
    avatar_decoration ?? null,
    pronouns !== undefined ? String(pronouns).slice(0, 24) : null,
    name_color ?? null,
    nameplate_style ?? null,
    clan_tag !== undefined ? String(clan_tag).slice(0, 6).toUpperCase() : null,
    clan_icon !== undefined ? String(clan_icon).slice(0, 4) : null,
    badges_json !== undefined ? (typeof badges_json === 'string' ? badges_json : JSON.stringify(badges_json)) : null,
    profile_effect ?? null,
    req.user.id
  );

  const updated = sanitizeUser(await db.get('SELECT * FROM users WHERE id = ?', req.user.id));
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
  for (const [chId, room] of voiceRooms.entries()) {
    let changed = false;
    for (const [sid, p] of room.entries()) {
      if (p.userId === updated.id) {
        room.set(sid, {
          ...p,
          displayName: updated.display_name,
          avatarColor: updated.avatar_color,
          avatarUrl: updated.avatar_url || null,
          avatarDecoration: updated.avatar_decoration || 'none'
        });
        changed = true;
      }
    }
    if (changed) {
      io.emit('voice:participants', { channelId: chId, participants: Array.from(room.values()) });
    }
  }
  res.json({ user: updated });
});

// Servers routes
app.get('/api/servers', authMiddleware, async (req, res) => {
  res.json({ servers: await getFullServersForUser(req.user.id) });
});

app.post('/api/servers', authMiddleware, async (req, res) => {
  const { name, icon_color } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome do servidor obrigatório' });

  const serverId = crypto.randomUUID();
  const now = Date.now();
  const inviteCode = makeInviteCode();

  await db.run(
    'INSERT INTO servers (id, name, icon_color, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    serverId, String(name).trim(), icon_color || pickColor(), req.user.id, inviteCode, now
  );
  await db.run(
    'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    serverId, req.user.id, 'owner', now
  );
  await db.run(
    'INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(), serverId, 'TEXT CHANNELS', 'general', 'text', 'Canal geral', 0, now
  );
  await db.run(
    'INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(), serverId, 'VOICE CHANNELS', 'Lobby', 'voice', '', 1, now
  );

  const created = (await getFullServersForUser(req.user.id)).find(s => s.id === serverId);
  io.in(`user:${req.user.id}`).socketsJoin(`server:${serverId}`);
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

app.get('/api/servers/:serverId/export', authMiddleware, async (req, res) => {
  const { serverId } = req.params;
  const member = await db.get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', serverId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Sem acesso' });
  const srv = await db.get('SELECT name FROM servers WHERE id = ?', serverId);
  if (!srv) return res.status(404).json({ error: 'Servidor não encontrado' });
  const channels = await db.all('SELECT category, name, type, topic FROM channels WHERE server_id = ? ORDER BY position ASC', serverId);
  res.json({ name: srv.name, channels });
});

app.post('/api/servers/import-discord', authMiddleware, async (req, res) => {
  const { templateInput, preset, customJson, customName } = req.body || {};
  let serverName = customName ? String(customName).trim() : '';
  let channelsToCreate = [];

  try {
    if (customJson && String(customJson).trim()) {
      const parsed = JSON.parse(String(customJson));
      if (!serverName) serverName = String(parsed.name || 'Servidor Importado').trim();
      if (Array.isArray(parsed.channels)) {
        channelsToCreate = parsed.channels.map(ch => ({
          category: String(ch.category || (ch.type === 'voice' ? 'VOICE CHANNELS' : 'TEXT CHANNELS')),
          name: String(ch.name || 'canal'),
          type: ch.type === 'voice' ? 'voice' : 'text',
          topic: String(ch.topic || '')
        }));
      }
    } else if (templateInput && String(templateInput).trim()) {
      const cleanRaw = String(templateInput).trim().split('?')[0].replace(/\/+$/, '');
      const match = cleanRaw.match(/(?:discord\.new\/|template\/|templates\/)?([A-Za-z0-9_-]{4,32})$/i);
      const code = match ? match[1] : cleanRaw;
      const resp = await fetch(`https://discord.com/api/v9/guilds/templates/${encodeURIComponent(code)}`, {
        headers: { 'User-Agent': 'RonncordBot/1.0' }
      });
      if (!resp.ok) {
        return res.status(400).json({ error: 'Template do Discord inválido ou expirado. Verifique o link (ex: discord.new/CODIGO) ou escolha um modelo pronto.' });
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
      return res.status(400).json({ error: 'Cole um link discord.new/CODIGO, um JSON exportado ou selecione um modelo pronto.' });
    }

    if (channelsToCreate.length > 60) {
      channelsToCreate = channelsToCreate.slice(0, 60);
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
    await db.run(
      'INSERT INTO servers (id, name, icon_color, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      serverId, serverName, pickColor(), req.user.id, inviteCode, now
    );
    await db.run(
      'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      serverId, req.user.id, 'owner', now
    );

    for (let idx = 0; idx < channelsToCreate.length; idx++) {
      const ch = channelsToCreate[idx];
      const cleanName = ch.type === 'text'
        ? String(ch.name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') || 'canal'
        : String(ch.name).trim() || 'Voz';
      await db.run(
        'INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), serverId, ch.category, cleanName, ch.type, ch.topic || '', idx, now
      );
    }

    const created = (await getFullServersForUser(req.user.id)).find(s => s.id === serverId);
    io.in(`user:${req.user.id}`).socketsJoin(`server:${serverId}`);
    res.status(201).json({ server: created });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao importar template: ' + err.message });
  }
});

app.post('/api/servers/join/:inviteCode', authMiddleware, async (req, res) => {
  const code = String(req.params.inviteCode || '').trim();
  const srv = await db.get('SELECT * FROM servers WHERE invite_code = ?', code);
  if (!srv) return res.status(404).json({ error: 'Convite inválido ou expirado' });

  await db.run(
    'INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    srv.id, req.user.id, 'member', Date.now()
  );
  const full = (await getFullServersForUser(req.user.id)).find(s => s.id === srv.id);
  const memberObj = full?.members?.find(m => m.id === req.user.id) || { ...req.user, role: 'member' };
  io.in(`user:${req.user.id}`).socketsJoin(`server:${srv.id}`);
  io.to(`server:${srv.id}`).emit('server:member_joined', { serverId: srv.id, member: memberObj });
  res.json({ server: full });
});

app.post('/api/servers/:serverId/channels', authMiddleware, async (req, res) => {
  const { serverId } = req.params;
  const member = await db.get('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?', serverId, req.user.id);
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return res.status(403).json({ error: 'Apenas donos ou admins podem criar canais' });
  }

  const { name, type = 'text', category, topic = '' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome do canal obrigatório' });

  const cleanName = type === 'text'
    ? String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
    : String(name).trim();

  const maxRow = await db.get('SELECT COALESCE(MAX(position), 0) as mp FROM channels WHERE server_id = ?', serverId);
  const chId = crypto.randomUUID();
  const chCat = category || (type === 'voice' ? 'VOICE CHANNELS' : 'TEXT CHANNELS');
  await db.run(
    'INSERT INTO channels (id, server_id, category, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    chId, serverId, chCat, cleanName || 'channel', type, topic, (maxRow?.mp || 0) + 1, Date.now()
  );
  const channel = await db.get('SELECT * FROM channels WHERE id = ?', chId);
  io.to(`server:${serverId}`).emit('channel:created', channel);
  res.status(201).json({ channel });
});

app.delete('/api/channels/:channelId', authMiddleware, async (req, res) => {
  const ch = await db.get('SELECT * FROM channels WHERE id = ?', req.params.channelId);
  if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
  const member = await db.get('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?', ch.server_id, req.user.id);
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return res.status(403).json({ error: 'Apenas donos ou admins podem excluir canais' });
  }
  await db.run('DELETE FROM channels WHERE id = ?', ch.id);
  io.to(`server:${ch.server_id}`).emit('channel:deleted', { serverId: ch.server_id, channelId: ch.id });
  res.json({ ok: true });
});

// Channel Messages
app.get('/api/channels/:channelId/messages', authMiddleware, async (req, res) => {
  const { channelId } = req.params;
  if (!(await userCanAccessChannel(req.user.id, channelId))) {
    return res.status(403).json({ error: 'Sem acesso' });
  }
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const rows = await db.all('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?', channelId, limit);
  const messages = await Promise.all(rows.map(hydrateMessage));
  res.json({ messages });
});

app.post('/api/channels/:channelId/messages', authMiddleware, async (req, res) => {
  const { channelId } = req.params;
  if (!(await userCanAccessChannel(req.user.id, channelId))) {
    return res.status(403).json({ error: 'Sem acesso' });
  }

  const { content = '', attachments = [], reply_to_id = null } = req.body || {};
  const trimmed = String(content).trim().slice(0, 4000);
  if (!trimmed && (!Array.isArray(attachments) || attachments.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  let validReplyId = null;
  if (reply_to_id) {
    const targetMsg = await db.get('SELECT id FROM messages WHERE id = ? AND channel_id = ?', reply_to_id, channelId);
    if (!targetMsg) return res.status(403).json({ error: 'Mensagem respondida não pertence a este canal' });
    validReplyId = targetMsg.id;
  }

  const msgId = crypto.randomUUID();
  const safeAtts = sanitizeAttachments(attachments);
  await db.run(
    'INSERT INTO messages (id, channel_id, author_id, content, attachments_json, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    msgId, channelId, req.user.id, encryptMessageText(trimmed), JSON.stringify(safeAtts), validReplyId, Date.now()
  );
  const hydrated = await hydrateMessage(await db.get('SELECT * FROM messages WHERE id = ?', msgId));
  io.to(`channel:${channelId}`).emit('message:new', hydrated);
  res.status(201).json({ message: hydrated });
});

app.patch('/api/messages/:messageId', authMiddleware, async (req, res) => {
  const msg = await db.get('SELECT * FROM messages WHERE id = ?', req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.author_id !== req.user.id) return res.status(403).json({ error: 'Você só pode editar suas próprias mensagens' });

  const { content } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'Conteúdo vazio' });
  await db.run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', encryptMessageText(String(content).trim().slice(0, 4000)), Date.now(), msg.id);
  const hydrated = await hydrateMessage(await db.get('SELECT * FROM messages WHERE id = ?', msg.id));
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:updated', hydrated);
  res.json({ message: hydrated });
});

app.delete('/api/messages/:messageId', authMiddleware, async (req, res) => {
  const msg = await db.get('SELECT * FROM messages WHERE id = ?', req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.author_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão para apagar' });

  await db.run('DELETE FROM messages WHERE id = ?', msg.id);
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:deleted', { id: msg.id, channel_id: msg.channel_id, dm_thread_id: msg.dm_thread_id });
  res.json({ ok: true });
});

app.post('/api/messages/:messageId/reactions', authMiddleware, async (req, res) => {
  const { emoji } = req.body || {};
  if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const msg = await db.get('SELECT * FROM messages WHERE id = ?', req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

  const hasAccess = msg.channel_id
    ? await userCanAccessChannel(req.user.id, msg.channel_id)
    : await userCanAccessDm(req.user.id, msg.dm_thread_id);
  if (!hasAccess) return res.status(403).json({ error: 'Sem acesso a esta mensagem' });

  const existing = await db.get('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', msg.id, req.user.id, emoji);
  if (existing) {
    await db.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', msg.id, req.user.id, emoji);
  } else {
    await db.run('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', msg.id, req.user.id, emoji);
  }
  const hydrated = await hydrateMessage(msg);
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:updated', hydrated);
  res.json({ message: hydrated });
});

app.post('/api/messages/:messageId/pin', authMiddleware, async (req, res) => {
  const msg = await db.get('SELECT * FROM messages WHERE id = ?', req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

  const hasAccess = msg.channel_id
    ? await userCanAccessChannel(req.user.id, msg.channel_id)
    : await userCanAccessDm(req.user.id, msg.dm_thread_id);
  if (!hasAccess) return res.status(403).json({ error: 'Sem acesso a esta mensagem' });

  const nextPinned = msg.pinned ? 0 : 1;
  await db.run('UPDATE messages SET pinned = ? WHERE id = ?', nextPinned, msg.id);
  const hydrated = await hydrateMessage(await db.get('SELECT * FROM messages WHERE id = ?', msg.id));
  const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
  io.to(room).emit('message:updated', hydrated);
  res.json({ message: hydrated });
});

// Friends & DMs
app.get('/api/friends', authMiddleware, async (req, res) => {
  const rows = await db.all(
    `SELECT f.id, f.status, f.requester_id, f.addressee_id,
      u.id as friend_id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.status as user_status, u.custom_status
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
     WHERE f.requester_id = ? OR f.addressee_id = ?`,
    req.user.id, req.user.id, req.user.id
  );
  res.json({ friends: rows });
});

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  const targetName = String(req.body?.username || '').trim().toLowerCase();
  const target = await db.get('SELECT * FROM users WHERE username = ?', targetName);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode adicionar a si mesmo' });

  const existing = await db.get(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)',
    req.user.id, target.id, target.id, req.user.id
  );
  if (existing) return res.status(409).json({ error: 'Solicitação ou amizade já existe' });

  const id = crypto.randomUUID();
  await db.run(
    "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
    id, req.user.id, target.id, Date.now()
  );
  res.status(201).json({ ok: true, id });
});

app.post('/api/friends/:id/accept', authMiddleware, async (req, res) => {
  const f = await db.get('SELECT * FROM friendships WHERE id = ? AND addressee_id = ?', req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: 'Solicitação não encontrada' });
  await db.run("UPDATE friendships SET status = 'accepted' WHERE id = ?", f.id);
  res.json({ ok: true });
});

app.delete('/api/friends/:id', authMiddleware, async (req, res) => {
  await db.run('DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)', req.params.id, req.user.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/users/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const rows = await db.all(
    `SELECT id, username, display_name, avatar_color, avatar_url, status, custom_status
     FROM users WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?) LIMIT 20`,
    req.user.id, `%${q}%`, `%${q}%`
  );
  res.json({ users: rows });
});

app.get('/api/dms', authMiddleware, async (req, res) => {
  const threads = await db.all(
    `SELECT t.*,
      u.id as peer_id, u.username as peer_username, u.display_name as peer_display_name,
      u.avatar_color as peer_avatar_color, u.status as peer_status, u.custom_status as peer_custom_status
     FROM dm_threads t
     JOIN users u ON u.id = CASE WHEN t.user1_id = ? THEN t.user2_id ELSE t.user1_id END
     WHERE t.user1_id = ? OR t.user2_id = ?
     ORDER BY t.created_at DESC`,
    req.user.id, req.user.id, req.user.id
  );
  res.json({ threads });
});

app.post('/api/dms', authMiddleware, async (req, res) => {
  const { targetUserId } = req.body || {};
  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Usuário alvo inválido' });
  const [u1, u2] = [req.user.id, targetUserId].sort();
  let thread = await db.get('SELECT * FROM dm_threads WHERE user1_id = ? AND user2_id = ?', u1, u2);
  if (!thread) {
    const id = crypto.randomUUID();
    await db.run('INSERT INTO dm_threads (id, user1_id, user2_id, created_at) VALUES (?, ?, ?, ?)', id, u1, u2, Date.now());
    thread = await db.get('SELECT * FROM dm_threads WHERE id = ?', id);
  }
  const peer = sanitizeUser(await db.get('SELECT * FROM users WHERE id = ?', targetUserId));
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

app.get('/api/dms/:threadId/messages', authMiddleware, async (req, res) => {
  if (!(await userCanAccessDm(req.user.id, req.params.threadId))) {
    return res.status(404).json({ error: 'Conversa não encontrada' });
  }
  const rows = await db.all('SELECT * FROM messages WHERE dm_thread_id = ? ORDER BY created_at ASC LIMIT 200', req.params.threadId);
  res.json({ messages: await Promise.all(rows.map(hydrateMessage)) });
});

app.post('/api/dms/:threadId/messages', authMiddleware, async (req, res) => {
  if (!(await userCanAccessDm(req.user.id, req.params.threadId))) {
    return res.status(404).json({ error: 'Conversa não encontrada' });
  }

  const { content = '', attachments = [], reply_to_id = null } = req.body || {};
  const trimmed = String(content).trim().slice(0, 4000);
  if (!trimmed && (!Array.isArray(attachments) || attachments.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }
  let validReplyId = null;
  if (reply_to_id) {
    const targetMsg = await db.get('SELECT id FROM messages WHERE id = ? AND dm_thread_id = ?', reply_to_id, req.params.threadId);
    if (!targetMsg) return res.status(403).json({ error: 'Mensagem respondida não pertence a esta DM' });
    validReplyId = targetMsg.id;
  }
  const msgId = crypto.randomUUID();
  const safeAtts = sanitizeAttachments(attachments);
  await db.run(
    'INSERT INTO messages (id, dm_thread_id, author_id, content, attachments_json, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    msgId, req.params.threadId, req.user.id, encryptMessageText(trimmed), JSON.stringify(safeAtts), validReplyId, Date.now()
  );
  const hydrated = await hydrateMessage(await db.get('SELECT * FROM messages WHERE id = ?', msgId));
  io.to(`dm:${req.params.threadId}`).emit('message:new', hydrated);
  res.status(201).json({ message: hydrated });
});

// Private Encrypted Notes (AES-256-GCM, strict user_id isolation)
app.get('/api/notes', authMiddleware, async (req, res) => {
  const rows = await db.all(
    'SELECT id, title, content, updated_at FROM private_notes WHERE user_id = ? ORDER BY updated_at DESC',
    req.user.id
  );
  res.json({
    notes: rows.map(n => ({
      id: n.id,
      title: decryptMessageText(n.title),
      content: decryptMessageText(n.content),
      updated_at: n.updated_at
    }))
  });
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  const { id, title = 'Sem título', content = '' } = req.body || {};
  const cleanTitle = String(title).trim().slice(0, 120) || 'Sem título';
  const cleanContent = String(content).slice(0, 10000);
  const now = Date.now();

  if (id) {
    const existing = await db.get('SELECT id FROM private_notes WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!existing) return res.status(403).json({ error: 'Nota não encontrada ou sem acesso' });
    await db.run(
      'UPDATE private_notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      encryptMessageText(cleanTitle),
      encryptMessageText(cleanContent),
      now,
      id,
      req.user.id
    );
    return res.json({ note: { id, title: cleanTitle, content: cleanContent, updated_at: now } });
  }

  const noteId = crypto.randomUUID();
  await db.run(
    'INSERT INTO private_notes (id, user_id, title, content, updated_at) VALUES (?, ?, ?, ?, ?)',
    noteId,
    req.user.id,
    encryptMessageText(cleanTitle),
    encryptMessageText(cleanContent),
    now
  );
  res.status(201).json({ note: { id: noteId, title: cleanTitle, content: cleanContent, updated_at: now } });
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  await db.run('DELETE FROM private_notes WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// Socket.IO Real-Time + Voice Signaling + Music Bot
const voiceRooms = new Map();
const musicRooms = new Map(); // channelId -> { queue: [{ id, title, url, requestedBy }], playing: boolean, currentIndex: number, startedAt: number }

const MUSIC_PRESETS = [
  { key: 'lofi', title: 'Lofi Hip Hop Beats (Rádio 24/7)', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { key: 'chill', title: 'Chillout & Ambient Mix', url: 'https://streams.ilovemusic.de/iloveradio7.mp3' },
  { key: 'synthwave', title: 'Synthwave & Gaming Electro', url: 'https://streams.ilovemusic.de/iloveradio2.mp3' },
  { key: 'rock', title: 'Rock & Metal Arena', url: 'https://streams.ilovemusic.de/iloveradio4.mp3' },
  { key: 'hiphop', title: 'Hip Hop & Trap Beats', url: 'https://streams.ilovemusic.de/iloveradio3.mp3' }
];

function resolveMusicTrack(query, requestedBy) {
  const q = String(query || '').trim();
  if (!q) return null;
  if (/^https?:\/\//i.test(q)) {
    return { id: crypto.randomUUID(), title: q.split('/').pop()?.slice(0, 48) || 'Faixa Personalizada', url: q, requestedBy };
  }
  const lower = q.toLowerCase();
  const match = MUSIC_PRESETS.find(p => p.key === lower || p.title.toLowerCase().includes(lower)) || MUSIC_PRESETS[0];
  return { id: crypto.randomUUID(), title: match.title, url: match.url, requestedBy };
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT * FROM users WHERE id = ?', payload.sub);
    if (!user) return next(new Error('Unauthorized'));
    socket.user = sanitizeUser(user);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.user.id;
  socket.join(`user:${userId}`);

  const myServers = await db.all('SELECT server_id FROM server_members WHERE user_id = ?', userId);
  const myServerIds = new Set(myServers.map(s => s.server_id));
  for (const s of myServers) socket.join(`server:${s.server_id}`);

  // Send active voice room participants immediately so user sees who is in calls before joining
  for (const [chId, room] of voiceRooms.entries()) {
    if (room.size > 0) {
      const ch = await db.get('SELECT server_id FROM channels WHERE id = ?', chId);
      if (ch && myServerIds.has(ch.server_id)) {
        socket.emit('voice:participants', { channelId: chId, participants: Array.from(room.values()) });
      }
    }
  }

  await db.run("UPDATE users SET status = 'online' WHERE id = ? AND status = 'offline'", userId);
  io.emit('presence:update', { userId, status: socket.user.status === 'offline' ? 'online' : socket.user.status });

  socket.on('join_channel', async (channelId) => {
    if (!(await userCanAccessChannel(userId, channelId))) return;
    socket.join(`channel:${channelId}`);
  });
  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel:${channelId}`);
  });
  socket.on('join_dm', async (threadId) => {
    if (!(await userCanAccessDm(userId, threadId))) return;
    socket.join(`dm:${threadId}`);
  });

  socket.on('typing_start', async ({ channelId, dmThreadId }) => {
    if (channelId && !(await userCanAccessChannel(userId, channelId))) return;
    if (dmThreadId && !(await userCanAccessDm(userId, dmThreadId))) return;
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

  socket.on('voice:join', async (payload) => {
    const channelId = typeof payload === 'string' ? payload : payload?.channelId;
    const initMuted = typeof payload === 'object' ? Boolean(payload?.muted) : false;
    const initDeafened = typeof payload === 'object' ? Boolean(payload?.deafened) : false;
    if (!channelId || !(await userCanAccessChannel(userId, channelId))) return;

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
      avatarUrl: socket.user.avatar_url || null,
      avatarDecoration: socket.user.avatar_decoration || 'none',
      muted: initMuted,
      deafened: initDeafened,
      speaking: false,
      cameraOn: false,
      screenSharing: false
    });
    socket.join(`voice:${channelId}`);

    socket.emit('voice:peers', { channelId, peers: existingPeers });
    io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
    const mState = musicRooms.get(channelId);
    if (mState) socket.emit('music:state', { channelId, ...mState });
  });

  socket.on('music:play', ({ channelId, query }) => {
    const room = voiceRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    const track = resolveMusicTrack(query, socket.user.display_name);
    if (!track) return;
    let state = musicRooms.get(channelId);
    if (!state) {
      state = { queue: [track], currentIndex: 0, playing: true, startedAt: Date.now() };
      musicRooms.set(channelId, state);
    } else {
      state.queue.push(track);
      if (!state.playing) {
        state.currentIndex = state.queue.length - 1;
        state.playing = true;
        state.startedAt = Date.now();
      }
    }
    io.to(`voice:${channelId}`).emit('music:state', { channelId, ...state });
  });

  socket.on('music:toggle', ({ channelId }) => {
    const room = voiceRooms.get(channelId);
    const state = musicRooms.get(channelId);
    if (!room || !room.has(socket.id) || !state) return;
    state.playing = !state.playing;
    io.to(`voice:${channelId}`).emit('music:state', { channelId, ...state });
  });

  socket.on('music:skip', ({ channelId }) => {
    const room = voiceRooms.get(channelId);
    const state = musicRooms.get(channelId);
    if (!room || !room.has(socket.id) || !state) return;
    if (state.currentIndex + 1 < state.queue.length) {
      state.currentIndex += 1;
      state.playing = true;
      state.startedAt = Date.now();
    } else {
      musicRooms.delete(channelId);
      io.to(`voice:${channelId}`).emit('music:state', { channelId, queue: [], currentIndex: 0, playing: false });
      return;
    }
    io.to(`voice:${channelId}`).emit('music:state', { channelId, ...state });
  });

  socket.on('music:stop', ({ channelId }) => {
    const room = voiceRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    musicRooms.delete(channelId);
    io.to(`voice:${channelId}`).emit('music:state', { channelId, queue: [], currentIndex: 0, playing: false });
  });

  socket.on('voice:state', ({ channelId, muted, deafened, speaking, cameraOn, screenSharing }) => {
    const room = voiceRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    const current = room.get(socket.id);
    const updated = {
      ...current,
      ...(muted !== undefined ? { muted: Boolean(muted) } : {}),
      ...(deafened !== undefined ? { deafened: Boolean(deafened) } : {}),
      ...(speaking !== undefined ? { speaking: Boolean(speaking) } : {}),
      ...(cameraOn !== undefined ? { cameraOn: Boolean(cameraOn) } : {}),
      ...(screenSharing !== undefined ? { screenSharing: Boolean(screenSharing) } : {})
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
    const room = voiceRooms.get(channelId);
    if (!room || !room.has(socket.id) || !room.has(targetSocketId)) return;
    io.to(targetSocketId).emit('webrtc:signal', {
      fromSocketId: socket.id,
      channelId,
      user: socket.user,
      signal
    });
  });

  socket.on('disconnect', async () => {
    for (const [channelId, room] of voiceRooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        io.emit('voice:participants', { channelId, participants: Array.from(room.values()) });
      }
    }
    await db.run("UPDATE users SET status = 'offline' WHERE id = ?", userId);
    io.emit('presence:update', { userId, status: 'offline' });
  });
});

await initDatabase();
server.listen(PORT, () => {
  console.log(`[RONNCORD API] Running on http://localhost:${PORT} (Unlimited API)`);
});
