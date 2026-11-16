import { io } from 'socket.io-client';

const DEFAULT_API =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : '');

export const API_URL = DEFAULT_API;

export function getToken() {
  return localStorage.getItem('ronncord_token') || '';
}

export function setToken(token) {
  if (token) localStorage.setItem('ronncord_token', token);
  else localStorage.removeItem('ronncord_token');
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_URL}${url}`;
}

export async function apiFetch(path, options = {}) {
  if (!API_URL) {
    throw new Error('BACKEND_UNAVAILABLE');
  }
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('BACKEND_UNAVAILABLE');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return data;
}

export function connectSocket(token) {
  if (!API_URL || !token) return null;
  return io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5
  });
}
