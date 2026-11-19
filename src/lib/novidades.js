// NOVIDADES ("O que há de novo"): janela que aparece sozinha uma vez a cada atualização.
// A cada versão nova: troque `version`, ponha os itens novos NO TOPO e marque os antigos com `since`
// (a versão em que entraram). Imagens ficam em public/novidades/<versão>/.
// Versões comparam como texto: "2026-11-19" < "2026-11-19b" < "2026-11-20".
export const NOVIDADES = {
  version: '2026-11-19',
  date: '19 de novembro de 2026',
  items: [
    {
      title: 'Temas 🎨',
      text: 'Perfil > aba **Tema**. Escolha entre RONNCORD, Grafite, Meia-noite, Uva e Claro. Muda na hora e só pra você.'
    },
    {
      title: 'GIFs de verdade',
      text: 'O botão **GIF** agora busca qualquer GIF (pelo KLIPY). Digite o que quiser ou use os atalhos. Rolando pra baixo carrega mais.'
    },
    {
      title: 'Visor de imagem',
      text: 'Clique numa foto do chat e ela abre grande. As setas (ou ← →) passam pelas outras fotos do canal, clicar na foto mostra no tamanho real e **Esc** fecha.'
    },
    {
      title: 'RONNCORD no celular 📱',
      text: 'No celular a tela vira uma coluna só: **☰** abre servidores e canais, o ícone de pessoas abre os membros. Toque numa mensagem pra reagir, responder ou apagar.'
    },
    {
      title: 'O que há de novo',
      text: 'Esta janela. Ela aparece sozinha quando sai atualização, e o botão **✨** na barra da esquerda abre de novo quando quiser.'
    }
  ]
};

const KEY = 'ronncord_seen_version';

export function seenVersion() {
  return localStorage.getItem(KEY) || '';
}

export function markSeen() {
  localStorage.setItem(KEY, NOVIDADES.version);
}

// item é novo pra quem ainda não viu a versão em que ele entrou.
// quem nunca abriu a janela vê só os itens da última versão.
export function isNew(item, seen = seenVersion()) {
  const v = item.since || NOVIDADES.version;
  return seen ? v > seen : !item.since;
}
