# RONNCORD

Plataforma própria de comunicação em tempo real (inspirada no Discord), com **backend, banco de dados SQLite, WebSockets e API 100% ilimitada**.

## Funcionalidades (Fase 1)
- **Autenticação & Perfis:** Cadastro, login JWT, avatar customizável, status (`Online`, `Ausente`, `Não Perturbe`, `Invisível`), status personalizado e bio.
- **Servidores & Convites:** Criação de servidores, entrada via código de convite permanente (`ronncord-hub` por padrão) e lista de membros com cargos.
- **Canais de Texto & Voz:** Criação de canais de texto e voz, chat em tempo real via Socket.IO, indicador de digitação (*typing*), busca de mensagens.
- **Mensagens Ricas:** Respostas (*reply*), edição, exclusão, reações com emoji, formatação Markdown básica e upload de imagens/arquivos (até 50MB).
- **Amigos & Mensagens Diretas (DMs):** Envio/aceite de solicitações de amizade e conversas 1-a-1 em tempo real.
- **Modo Demo Offline:** Funciona automaticamente no GitHub Pages mesmo sem backend conectado.

## Como rodar localmente

```bash
# 1. Instalar dependências do frontend e backend
npm install
npm --prefix server install

# 2. Rodar o backend (porta 4000)
npm run server

# 3. Em outro terminal, rodar o frontend (porta 5173)
npm run dev
```
