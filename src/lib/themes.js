// Temas do app (trazidos do discordia). Cada pessoa escolhe o seu em Perfil > Tema.
// Fica salvo só no navegador (localStorage), não vai pro servidor.
export const THEMES = [
  { id: 'ronncord', name: 'RONNCORD', side: '#2b2d31', chat: '#313338', dot: '#5865f2' },
  { id: 'grafite', name: 'Grafite', side: '#23272e', chat: '#2b2f36', dot: '#6b8cae' },
  { id: 'meia-noite', name: 'Meia-noite', side: '#12151c', chat: '#171a22', dot: '#5865f2' },
  { id: 'uva', name: 'Uva', side: '#211b29', chat: '#272030', dot: '#9b6fd0' },
  { id: 'claro', name: 'Claro', side: '#f2f3f5', chat: '#ffffff', dot: '#4a6fa5' }
];

const KEY = 'ronncord_theme';

export function getSavedTheme() {
  const t = localStorage.getItem(KEY);
  return THEMES.some(x => x.id === t) ? t : 'ronncord';
}

export function applyTheme(id) {
  const safe = THEMES.some(x => x.id === id) ? id : 'ronncord';
  if (safe === 'ronncord') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = safe;
  localStorage.setItem(KEY, safe);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEMES.find(x => x.id === safe).side);
  return safe;
}

// cor do nome: o padrão do banco (#f2f3f5, quase branco) segue a cor do tema,
// senão o nome some no tema Claro. Cor escolhida pela pessoa continua valendo.
export function nameColor(c) {
  if (!c || String(c).toLowerCase() === '#f2f3f5') return undefined;
  return c;
}
