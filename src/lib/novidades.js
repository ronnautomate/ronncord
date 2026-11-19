// NOVIDADES ("O que há de novo"): janela que aparece sozinha uma vez a cada atualização.
// A cada versão nova: troque `version`, ponha os itens novos NO TOPO e marque os antigos com `since`
// (a versão em que entraram). Imagens ficam em public/novidades/<versão>/.
// Versões comparam como texto: "2026-11-19" < "2026-11-19b" < "2026-11-20".
export const NOVIDADES = {
  version: '2026-11-19b',
  date: '19 de novembro de 2026',
  items: [
    {
      title: 'Sala de voz nova 🔊',
      text: 'Clique no canal de voz e a sala abre no meio da tela: um bloco por pessoa (foto ou câmera), borda verde em quem fala e botões redondos embaixo. O slider no canto muda o tamanho das câmeras.'
    },
    {
      title: 'Stream do jeito que você quiser',
      text: 'Com alguém transmitindo, a tela fica grande e as câmeras do lado. Arraste a **alça** do meio pra mudar o tamanho. No canto da stream: volume, mutar, **tela cheia** e **sair da stream** sem sair da call.'
    },
    {
      title: 'Qualidade da stream pra você',
      text: 'Internet ruim? No botão de volume da stream escolha **Original, 720p ou 480p**. Só muda pra você, quem transmite continua mandando no máximo pros outros.'
    },
    {
      title: 'Volume de cada pessoa',
      text: 'Botão de som no bloco da pessoa (ou clique direito): volume de 0 a 400% e **mutar pra mim**.'
    },
    {
      title: 'DMs na barra da esquerda',
      text: 'As conversas diretas aparecem embaixo dos canais, com foto e contador. Abrir uma DM não some com os canais do servidor.'
    },
    {
      title: '/aviso 📢',
      text: 'Digite **/aviso** e o texto: a mensagem sai destacada e avisa todo mundo (som e notificação). Qualquer um pode mandar.'
    },
    {
      title: 'Sons do Discord',
      text: 'Entrar e sair da call, mutar e menção agora têm os sons do Discord. Mensagem comum não toca: só menção, DM e /aviso (e nada no Não Perturbe).'
    },
    {
      title: 'Imagem do servidor',
      text: 'Clique no nome do servidor (em cima dos canais) pra trocar o nome e a imagem. Só dono e admins mudam. Começa a funcionar assim que o servidor do RONNCORD for atualizado.'
    },
    {
      title: 'Online e offline mais certinho',
      text: 'Dar F5 ou abrir em duas abas não te deixa mais offline à toa, e quem tá na call aparece online.'
    },
    {
      since: '2026-11-19',
      title: 'Temas 🎨',
      text: 'Perfil > aba **Tema**. Escolha entre RONNCORD, Grafite, Meia-noite, Uva e Claro. Muda na hora e só pra você.'
    },
    {
      since: '2026-11-19',
      title: 'GIFs de verdade',
      text: 'O botão **GIF** agora busca qualquer GIF (pelo KLIPY). Digite o que quiser ou use os atalhos. Rolando pra baixo carrega mais.'
    },
    {
      since: '2026-11-19',
      title: 'Visor de imagem',
      text: 'Clique numa foto do chat e ela abre grande. As setas (ou ← →) passam pelas outras fotos do canal, clicar na foto mostra no tamanho real e **Esc** fecha.'
    },
    {
      since: '2026-11-19',
      title: 'RONNCORD no celular 📱',
      text: 'No celular a tela vira uma coluna só: **☰** abre servidores e canais, o ícone de pessoas abre os membros. Toque numa mensagem pra reagir, responder ou apagar.'
    },
    {
      since: '2026-11-19',
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
