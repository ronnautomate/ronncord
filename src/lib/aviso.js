// /aviso (trazido do discordia): qualquer pessoa manda "/aviso texto" no chat e a mensagem
// aparece destacada, conta como menção pra todo mundo (som + notificação) e fica fácil de ver.
// Fica salvo como texto normal começando com "/aviso ", então não precisa mudar o servidor.
const PREFIX = /^\/aviso\s+/i;

export function isAvisoMessage(content) {
  return typeof content === 'string' && PREFIX.test(content) && content.replace(PREFIX, '').trim().length > 0;
}

export function avisoText(content) {
  return String(content || '').replace(PREFIX, '');
}

// comandos que aparecem quando a pessoa digita "/" no começo da mensagem
export const SLASH_COMMANDS = [
  { cmd: '/aviso', args: 'texto', desc: 'manda um aviso destacado pra todo mundo (notifica geral)' },
  { cmd: '/poll', args: 'pergunta', desc: 'cria uma enquete (abre a janela pra pôr as opções)', window: 'poll' }
];
