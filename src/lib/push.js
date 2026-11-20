// Notificação com a aba fechada: inscreve este navegador no servidor (Web Push).
// Só funciona com a permissão de notificação dada e o servidor novo no ar.
import { apiFetch } from './api.js';

function keyToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function ensurePushSubscription() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await apiFetch('/api/push/key');
    let sub = await reg.pushManager.getSubscription();
    // chave do servidor mudou: refaz a inscrição
    if (sub && sub.options?.applicationServerKey) {
      const cur = new Uint8Array(sub.options.applicationServerKey);
      const want = keyToBytes(key);
      if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
    await apiFetch('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    return true;
  } catch {
    return false;
  }
}
