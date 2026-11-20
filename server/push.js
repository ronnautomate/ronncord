// Notificação com a aba fechada (Web Push), sem pacote extra: só o crypto do Node.
// - Chaves VAPID geradas uma vez e guardadas no banco (tabela app_kv).
// - Cada navegador que liga as notificações manda a inscrição dele (tabela push_subs).
// - A mensagem vai criptografada (aes128gcm, RFC 8291) direto pro serviço de push do navegador.
import crypto from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = str => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let vapid = null; // { publicKey (b64url, 65 bytes), privateKey (KeyObject) }

async function loadVapid(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  let row = await db.get("SELECT value FROM app_kv WHERE key = 'vapid'");
  if (!row) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    await db.run("INSERT OR IGNORE INTO app_kv (key, value) VALUES ('vapid', ?)", JSON.stringify(jwk));
    row = await db.get("SELECT value FROM app_kv WHERE key = 'vapid'");
  }
  const jwk = JSON.parse(row.value);
  const privateKey = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]));
  vapid = { publicKey, privateKey };
}

function vapidHeader(endpoint) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:ronncord@example.com' }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapid.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// criptografa o conteúdo pro navegador (aes128gcm)
export function encryptPayload(sub, payload) {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

let dbRef = null;

export async function sendPushToUser(userId, data) {
  if (!vapid || !dbRef) return;
  const subs = await dbRef.all('SELECT * FROM push_subs WHERE user_id = ?', userId).catch(() => []);
  const payload = JSON.stringify(data).slice(0, 3000);
  await Promise.all(subs.map(async sub => {
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidHeader(sub.endpoint),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400',
          Urgency: 'high'
        },
        body: encryptPayload(sub, payload)
      });
      // inscrição que expirou ou foi cancelada no navegador: apaga
      if (res.status === 404 || res.status === 410) await dbRef.run('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint);
    } catch {}
  }));
}

export async function registerPush({ app, db, authMiddleware }) {
  dbRef = db;
  await db.exec('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)');
  await loadVapid(db);

  app.get('/api/push/key', (_req, res) => res.json({ key: vapid.publicKey }));

  app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
    const sub = req.body?.subscription;
    const endpoint = String(sub?.endpoint || '');
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return res.status(400).json({ error: 'Inscrição inválida' });
    await db.run('DELETE FROM push_subs WHERE endpoint = ?', endpoint);
    await db.run('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)', endpoint, req.user.id, p256dh, auth, Date.now());
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', authMiddleware, async (req, res) => {
    await db.run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', String(req.body?.endpoint || ''), req.user.id);
    res.json({ ok: true });
  });
}
