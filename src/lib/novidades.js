// NOVIDADES ("O que há de novo"): janela que aparece sozinha uma vez a cada atualização.
// A cada versão nova: troque `version`, ponha os itens novos NO TOPO e marque os antigos com `since`
// (a versão em que entraram). Imagens ficam em public/novidades/<versão>/.
// Versões comparam como texto: "2026-11-19" < "2026-11-19b" < "2026-11-20".
export const NOVIDADES = {
  version: '2026-11-20',
  date: '20 de novembro de 2026',
  items: [
    {
      title: 'Jogos na call 🚀',
      text: 'Botão de **foguete** na barra da call: **GeoGuessr** e **Truco** (paulista ou mineiro, 1x1, 2x2 ou de 3). Quem inicia chama, os outros recebem o convite e entram se quiserem.'
    },
    {
      title: 'Quem tá assistindo 👁️',
      text: 'Na stream aparece quem está assistindo, e do lado do AO VIVO fica o número.'
    },
    {
      title: 'Janelinha da stream',
      text: 'Saiu da sala pra um canal de texto ou DM? A stream continua numa janelinha no canto, igual o Discord. Arraste pra mudar de lugar e clique pra voltar pra sala.'
    },
    {
      title: 'Stream grande em cima',
      text: 'Com alguém transmitindo, a tela fica grande em cima e o pessoal numa fileira embaixo. Arraste a divisa pra fileira ficar maior ou menor.'
    },
    {
      title: 'Enquete 📊',
      text: 'Botão de gráfico do lado do GIF, ou digite **/poll**. Cada um vota uma vez e dá pra trocar o voto.'
    },
    {
      title: 'Figurinhas',
      text: 'No botão **GIF**, a aba **Figurinhas** busca figurinhas animadas.'
    },
    {
      title: 'Configurações novas ⚙️',
      text: 'Tudo numa tela só, igual o Discord: conta, perfil (com prévia ao vivo), clã, tema, voz e vídeo (saída de áudio e câmera), notificações e volume dos sons.'
    },
    {
      title: 'Amigos de verdade',
      text: 'Pedido de amizade chega na hora, com aviso no ícone de início. Dá pra adicionar clicando no perfil da pessoa.'
    },
    {
      title: 'Notificação com o app fechado',
      text: 'Ligue em Configurações > Notificações: DM, menção e /aviso chegam mesmo com o RONNCORD fechado.'
    },
    {
      title: 'Call mais firme',
      text: 'Se a internet piscar, você volta pra call sozinho e não fica "congelado" (mutado e falando) na lista dos outros.'
    },
    {
      since: '2026-11-19c',
      title: 'Cartão de perfil 🪪',
      text: 'Clicar em alguém (call, membros ou chat) abre um cartão pequeno do lado, igual no Discord, com bio, cargo e um campo pra mandar mensagem na hora.'
    },
    {
      since: '2026-11-19c',
      title: 'Compartilhar tela com som',
      text: 'A tela vai sempre com o som ligado, e **as vozes da call não vão junto** (ninguém escuta a própria voz de volta). A aba do RONNCORD nem aparece mais na lista.'
    },
    {
      since: '2026-11-19c',
      title: 'Call que se ajeita sozinha',
      text: 'Sem tela compartilhada, os blocos crescem e se organizam sozinhos conforme o tamanho da janela e quem entra ou sai.'
    },
    {
      since: '2026-11-19c',
      title: 'Colar e arrastar imagem',
      text: '**Ctrl+V** cola print direto no chat, e dá pra arrastar arquivos pra conversa.'
    },
    {
      since: '2026-11-19c',
      title: 'Player de áudio novo',
      text: 'Áudios e mensagens de voz ganharam um player escuro com barra pra pular e o tempo do lado.'
    },
    {
      since: '2026-11-19c',
      title: 'Troca de chat instantânea',
      text: 'Ir de DM pra canal (e voltar) não tem mais aquele atraso: as conversas já ficam carregadas.'
    },
    {
      since: '2026-11-19c',
      title: 'Ícone da call no servidor',
      text: 'Tá na call e foi pra uma DM? O servidor da call ganha um ícone de som na barra da esquerda.'
    },
    {
      since: '2026-11-19c',
      title: 'Instalar como app 💻',
      text: 'No Chrome, Edge ou Opera do PC, o botão verde de download na barra da esquerda instala o RONNCORD como app, com janela própria.'
    },
    {
      since: '2026-11-19b',
      title: 'Sala de voz nova 🔊',
      text: 'Clique no canal de voz e a sala abre no meio da tela: um bloco por pessoa (foto ou câmera), borda verde em quem fala e botões redondos embaixo. Os blocos se ajeitam sozinhos no espaço.'
    },
    {
      since: '2026-11-19b',
      title: 'Stream do jeito que você quiser',
      text: 'Com alguém transmitindo, a tela fica grande e as câmeras do lado. Arraste a **alça** do meio pra mudar o tamanho. No canto da stream: volume, mutar, **tela cheia** e **sair da stream** sem sair da call.'
    },
    {
      since: '2026-11-19b',
      title: 'Qualidade da stream pra você',
      text: 'Internet ruim? No botão de volume da stream escolha **Original, 720p ou 480p**. Só muda pra você, quem transmite continua mandando no máximo pros outros.'
    },
    {
      since: '2026-11-19b',
      title: 'Volume de cada pessoa',
      text: 'Clique direito no bloco da pessoa: volume de 0 a 400% e **mutar pra mim**.'
    },
    {
      since: '2026-11-19b',
      title: 'DMs na barra da esquerda',
      text: 'As conversas diretas aparecem na barra de ícones da esquerda, com foto e contador, igual no Discord.'
    },
    {
      since: '2026-11-19b',
      title: '/aviso 📢',
      text: 'Digite **/aviso** e o texto: a mensagem sai destacada e avisa todo mundo (som e notificação). Qualquer um pode mandar.'
    },
    {
      since: '2026-11-19b',
      title: 'Sons do Discord',
      text: 'Entrar e sair da call, mutar e menção agora têm os sons do Discord. Mensagem comum não toca: só menção, DM e /aviso (e nada no Não Perturbe).'
    },
    {
      since: '2026-11-19b',
      title: 'Imagem do servidor',
      text: 'Clique no nome do servidor (em cima dos canais) pra trocar o nome e a imagem. Só dono e admins mudam.'
    },
    {
      since: '2026-11-19b',
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
