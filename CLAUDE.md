# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral

App web local (roda só em `localhost`, sem publicação na internet) para acompanhar cotações
de ações da B3. Tem login obrigatório, dois papéis de usuário (administrador e comum), área de
administração para gestão de contas, e uma carteira de ações por usuário. Os preços vêm ao vivo
da Yahoo Finance. Todo o texto voltado ao usuário (telas, mensagens de erro, e-mails) é em
português do Brasil — mantenha esse padrão em qualquer alteração.

Publicar isso na internet é um passo futuro, não coberto por esta versão. Por isso não há HTTPS,
rate limiting, proteção contra força bruta no login, etc. — decisões aceitáveis para uso local,
mas que precisam ser revisitadas antes de expor o app fora do computador do usuário.

## Stack e por que essas escolhas

- **Node.js + Express**: servidor HTTP simples, sem build step no frontend.
- **Sem framework de frontend**: `paginas/` é HTML/CSS/JS puro, uma "SPA" simples com roteamento
  por hash (`#/acoes`, `#/carteira`, `#/conta`, `#/admin`). Isso evita exigir Webpack/Vite/React
  de um usuário iniciante — basta editar e recarregar o navegador.
- **Armazenamento em arquivo JSON (`dados/dados.json`)**, não um banco de dados de verdade.
  Optou-se por isso deliberadamente para evitar dependências nativas (ex: `better-sqlite3`)
  que exigiriam Visual Studio Build Tools no Windows — um obstáculo grande para um usuário que
  "mal usa o terminal". `bcryptjs`, `yahoo-finance2` e `cookie-parser` são JS puro pelo mesmo motivo.
  Se o projeto crescer muito (muitos usuários simultâneos), migrar para SQLite é o próximo passo natural.
- **Sessões próprias (tabela `sessoes` dentro do JSON) em vez de `express-session`**: dá controle
  total sobre expiração e evita depender de um "session store" externo. Cookie httpOnly, 7 dias de duração.
- **`yahoo-finance2` v4**: a v2 está descontinuada (end-of-life). A v4 exige instanciar a classe
  (`new YahooFinance()`), diferente da v2 que exportava uma instância pronta — não confundir ao
  consultar exemplos antigos da lib.

## Estrutura de pastas

```
server.js                  # ponto de entrada; cria o 1º admin e liga o Express
servidor/
  db.js                     # leitura/gravação do dados/dados.json (escrita atômica)
  auth.js                   # hash de senha, sessões, middlewares (exigirLogin, exigirAdmin, ...)
  yahoo.js                  # busca de cotações na Yahoo Finance, com cache de 15 min em memória
  rotas-auth.js             # POST /api/login, /api/logout, GET /api/me
  rotas-conta.js            # PUT /api/conta/senha
  rotas-carteira.js         # GET/POST/DELETE /api/carteira
  rotas-acoes.js            # GET /api/acoes?range=
  rotas-admin.js            # CRUD de usuários em /api/admin/usuarios
paginas/
  index.html                # shell único: tela de login, troca de senha obrigatória, app com sidebar
  app.js                     # toda a lógica de frontend (fetch para a API, gráfico em <canvas>, rotas por hash)
  estilos.css
dados/dados.json            # criado automaticamente na primeira execução — não versionar/commitar
.env                         # segredos locais (não commitar): admin inicial, chave de sessão, porta
.env.exemplo                 # modelo do .env, seguro para versionar
Iniciar o app.bat            # atalho de duplo clique para o usuário leigo: liga o servidor e abre o navegador
```

## Modelo de dados (`dados/dados.json`)

```jsonc
{
  "usuarios": [
    {
      "id": "hex aleatório",
      "nomeCompleto": "string",
      "usuario": "string, único, minúsculo",
      "email": "string",
      "senhaHash": "hash bcrypt — nunca texto puro",
      "tipo": "admin" | "usuario",
      "precisaTrocarSenha": true | false,
      "criadoEm": "ISO 8601"
    }
  ],
  "sessoes": [{ "token": "hex aleatório", "usuarioId": "...", "expiraEm": 1234567890 }],
  "carteiras": { "<usuarioId>": ["PETR4", "ITUB4", "VALE3"] }
}
```

Todo acesso passa por `servidor/db.js` (`carregar()`/`salvar()`), que faz escrita atômica
(grava em `.tmp` e renomeia) para não corromper o arquivo se o processo for interrompido no meio.
Não há bloqueio de concorrência além disso — aceitável para o volume de uso local esperado.

## Autenticação e autorização

- Senhas: `bcryptjs`, custo 10. Senhas temporárias: `auth.gerarSenhaTemporaria()` (10 caracteres,
  alfabeto sem `0/O/1/l/I` para reduzir erro de digitação ao repassar por telefone/mensagem).
- Sessão: cookie `sessao` (httpOnly, `sameSite=lax`, 7 dias), token em `dados.sessoes`.
- Middlewares em `servidor/auth.js`, aplicados em cadeia nas rotas:
  - `exigirLogin` → preenche `req.usuario`.
  - `exigirSenhaDefinitiva` → bloqueia tudo (exceto login/logout/trocar senha) enquanto
    `precisaTrocarSenha` for `true`.
  - `exigirAdmin` → só usuários `tipo === "admin"`.
- Primeiro administrador: `server.js` → `garantirPrimeiroAdministrador()`, executado a cada boot;
  só cria algo se `dados.usuarios` estiver vazio. Lê `ADMIN_NOME`, `ADMIN_USUARIO`, `ADMIN_EMAIL`,
  `ADMIN_SENHA` do `.env`. Se faltar algum, apenas loga um aviso e segue sem criar ninguém — o app
  fica utilizável só para... ninguém, até o `.env` ser corrigido e o processo reiniciado.
- Regras de proteção do admin (em `rotas-admin.js`): não é possível excluir a si mesmo, nem
  rebaixar/excluir o último administrador restante (`contarAdmins`).

## Cotações (Yahoo Finance)

`servidor/yahoo.js` normaliza o ticker (maiúsculo, sufixo `.SA` se não houver ponto),
mapeia os períodos da UI (`1m 3m 6m ytd 1a max`) para uma data inicial e um intervalo
(`1d`, ou `1wk` para `max`, para não trazer milhares de pontos), e cacheia o resultado por
15 minutos em um `Map` em memória (chave `ticker.SA:range`). Qualquer erro da lib (rede,
ticker inexistente) vira um `Error` com `.amigavel = true` e uma mensagem pronta para
mostrar na tela — nunca deixe um erro técnico "vazar" para o frontend; sempre capture e
traduza como fizeram `rotas-acoes.js` (por ação, sem derrubar as demais) e `rotas-carteira.js`
(ao validar um ticker antes de adicioná-lo).

## Frontend (`paginas/app.js`)

SPA simples sem dependências. `iniciar()` roda no carregamento da página, chama `GET /api/me`
e decide entre 3 telas (`tela-login`, `tela-trocar-senha`, `app-shell`). Dentro do shell, a
navegação usa `location.hash` (`renderRota()`), o que faz o F5 manter a página atual. O gráfico
é desenhado à mão em `<canvas>` (sem biblioteca de charts) — ver `desenharGrafico()`; cada série
é indexada à base 100 sobre o primeiro ponto para permitir comparação visual entre papéis com
preços muito diferentes.

## Comandos

```bash
npm install     # instala as dependências (express, bcryptjs, dotenv, cookie-parser, yahoo-finance2)
npm start       # roda node server.js, sobe em http://localhost:$PORTA (padrão 3000)
```

Não há suíte de testes automatizada. Para verificar mudanças na API, use `curl` manualmente
(veja exemplos no histórico do projeto) ou o roteiro de teste manual do `README.md`.

## Pegadinha conhecida do ambiente (Windows)

Depois de instalar o Node.js (ex: via `winget install OpenJS.NodeJS.LTS`), janelas de terminal
**já abertas antes da instalação** — e às vezes até o Explorer — não enxergam o novo PATH até um
logoff/reinício. Por isso `Iniciar o app.bat` força `set "PATH=C:\Program Files\nodejs;%PATH%"`
no próprio script, em vez de confiar no PATH do sistema. Se o caminho de instalação do Node mudar
num ambiente diferente, ajuste essa linha.

## Convenções

- Todo texto voltado ao usuário (UI, mensagens de erro/sucesso, README) em português do Brasil.
- Nomes de arquivos, funções e variáveis do backend/frontend também em português, para o código
  ficar legível para quem está aprendendo a programar.
- Erros voltados ao usuário final devem sempre ter uma mensagem amigável (`erro.amigavel`) —
  nunca expor stack trace ou mensagem de biblioteca externa na tela.
- Sem abstrações prematuras: o projeto é pequeno de propósito (um arquivo JSON, um app.js só).
  Antes de introduzir um framework, um ORM ou um bundler, confirme que o usuário realmente
  precisa — o objetivo é continuar simples de manter por alguém que não programa.
