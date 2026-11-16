import React, { useState } from 'react';
import { apiFetch, setToken } from '../lib/api.js';

export function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { username, password }
        : { username, displayName: displayName || username, email: email || undefined, password };
      const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      setToken(data.token);
      onAuthSuccess(data.user);
    } catch (err) {
      if (err.message === 'BACKEND_UNAVAILABLE') {
        setError('Servidor indisponível no momento. Aguarde alguns segundos e tente novamente.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-backdrop">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">R</div>
          <div>
            <h1>RONNCORD</h1>
            <p>Conecte-se com seus amigos por voz, vídeo e chat em tempo real</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            <span>NOME DE USUÁRIO {mode === 'login' ? 'OU EMAIL' : ''}</span>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ex: ronn"
              autoFocus
            />
          </label>

          {mode === 'register' && (
            <>
              <label>
                <span>NOME DE EXIBIÇÃO</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="ex: Ronn"
                />
              </label>
              <label>
                <span>EMAIL (OPCIONAL)</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                />
              </label>
            </>
          )}

          <label>
            <span>SENHA</span>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Conectando...' : mode === 'login' ? 'Entrar no RONNCORD' : 'Criar Conta e Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
