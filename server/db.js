import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client/http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useTurso = Boolean(process.env.TURSO_DATABASE_URL);

let localDb = null;
let tursoClient = null;

if (useTurso) {
  tursoClient = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined
  });
  console.log('[RONNCORD DB] Connected to Turso Cloud libSQL (Persistent)');
} else {
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.RONNCORD_DB_PATH || path.join(dataDir, 'ronncord.db');
  localDb = new DatabaseSync(dbPath);
  localDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  console.log('[RONNCORD DB] Using local SQLite:', dbPath);
}

export const db = {
  async get(sql, ...args) {
    if (tursoClient) {
      const res = await tursoClient.execute({ sql, args });
      return res.rows[0] ? { ...res.rows[0] } : undefined;
    }
    return localDb.prepare(sql).get(...args);
  },
  async all(sql, ...args) {
    if (tursoClient) {
      const res = await tursoClient.execute({ sql, args });
      return res.rows.map(r => ({ ...r }));
    }
    return localDb.prepare(sql).all(...args);
  },
  async run(sql, ...args) {
    if (tursoClient) {
      return tursoClient.execute({ sql, args });
    }
    return localDb.prepare(sql).run(...args);
  },
  async exec(sql) {
    if (tursoClient) {
      const stmts = sql
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
      for (const s of stmts) {
        await tursoClient.execute(s);
      }
      return;
    }
    localDb.exec(sql);
  }
};

export async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#5865F2',
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'online',
      custom_status TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      banner_color TEXT NOT NULL DEFAULT '#5865F2',
      avatar_decoration TEXT NOT NULL DEFAULT 'none',
      pronouns TEXT NOT NULL DEFAULT '',
      name_color TEXT NOT NULL DEFAULT '#f2f3f5',
      nameplate_style TEXT NOT NULL DEFAULT 'none',
      clan_tag TEXT NOT NULL DEFAULT '',
      clan_icon TEXT NOT NULL DEFAULT '',
      badges_json TEXT NOT NULL DEFAULT '[]',
      profile_effect TEXT NOT NULL DEFAULT 'none',
      banner_url TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_color TEXT NOT NULL DEFAULT '#5865F2',
      icon_url TEXT,
      owner_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'TEXT CHANNELS',
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      topic TEXT DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dm_threads (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user1_id, user2_id),
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT,
      dm_thread_id TEXT,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      reply_to_id TEXT,
      edited_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (dm_thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      UNIQUE(requester_id, addressee_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS private_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(dm_thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);
  `);

  for (const col of [
    "ALTER TABLE users ADD COLUMN banner_color TEXT NOT NULL DEFAULT '#5865F2'",
    "ALTER TABLE users ADD COLUMN avatar_decoration TEXT NOT NULL DEFAULT 'none'",
    "ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN name_color TEXT NOT NULL DEFAULT '#f2f3f5'",
    "ALTER TABLE users ADD COLUMN nameplate_style TEXT NOT NULL DEFAULT 'none'",
    "ALTER TABLE users ADD COLUMN clan_tag TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN clan_icon TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN badges_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE users ADD COLUMN profile_effect TEXT NOT NULL DEFAULT 'none'",
    "ALTER TABLE users ADD COLUMN banner_url TEXT",
    "ALTER TABLE messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
  ]) {
    try { await db.exec(col); } catch {}
  }
}

export function sanitizeUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}
