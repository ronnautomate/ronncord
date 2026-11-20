// Enquete (trazida do discordia): "/poll Pergunta | opção 1 | opção 2" (2 a 10 opções).
// Fica salva como texto normal; os votos ficam no servidor (tabela poll_votes).
const PREFIX = /^\/(poll|enquete)\s+/i;

export function parsePoll(content) {
  if (typeof content !== 'string' || !PREFIX.test(content)) return null;
  const parts = content.replace(PREFIX, '').split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return { question: parts[0].slice(0, 200), options: parts.slice(1, 11).map(o => o.slice(0, 80)) };
}

export function buildPoll(question, options) {
  const clean = s => String(s || '').replace(/\|/g, '/').trim();
  return `/poll ${clean(question)} | ${options.map(clean).filter(Boolean).join(' | ')}`;
}
