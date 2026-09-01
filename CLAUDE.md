# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral

App web para acompanhar cotações de ações da B3. Tem login obrigatório, dois papéis de usuário
(administrador e comum), área de administração para gestão de contas, e uma carteira de ações
por usuário. Os preços vêm ao vivo da Yahoo Finance. Todo o texto voltado ao usuário (telas,
mensagens de erro, e-mails) é em português do Brasil — mantenha esse padrão em qualquer alteração.

Roda tanto localmente (`localhost`) quanto publicado na internet, no Railway
(https://painel-acoes-production-8fa2.up.railway.app), a partir do repositório GitHub
`marceloibanez756-boop/painel-acoes` (deploy automático a cada `git push` na branch `main`).
Ainda não há rate limiting nem proteção contra força bruta no login — aceitável por enquanto
dado o volume de uso esperado (poucos usuários conhecidos), mas revisitar se o uso crescer.

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
- **`@anthropic-ai/sdk`** (biblioteca oficial da Anthropic): usada pela função "Análise do Dia"
  (`servidor/ia.js`) para chamar o modelo **Claude Haiku 4.5** (`claude-haiku-4-5`) — o modelo
  mais barato da Anthropic no momento em que essa função foi criada. `require("@anthropic-ai/sdk")`
  já retorna a classe `Anthropic` diretamente (sem precisar de `.default`, diferente da
  `yahoo-finance2`). A chave fica em `ANTHROPIC_API_KEY` (`.env` local / variável de ambiente no
  Railway) — se estiver ausente, a função mostra uma mensagem amigável em vez de dar erro.

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
  rotas-analise.js          # GET /api/analise?range= — "Análise do Dia" (Server-Sent Events)
  ia.js                     # monta o resumo numérico da carteira, chama a Anthropic, cache 15min
  instrucoes-analise-ia.txt # texto de sistema (system prompt) do agente — editável sem mexer em código
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

## Análise do Dia (agente de IA)

Botão flutuante na página Ações que manda um resumo numérico da carteira do usuário logado
(no período selecionado na tela) para o Claude Haiku 4.5 e mostra a resposta chegando aos poucos.

- **`servidor/ia.js`** monta o resumo: para cada ticker, usa `yahoo.buscarSerie(ticker, range)`
  (dados do período escolhido na tela — variação, mínima/máxima com datas) mais
  `yahoo.buscarSerieRecente(ticker)` (~100 dias corridos, sempre diários, adicionada em
  `servidor/yahoo.js`) — essa segunda busca existe porque a tendência (média 20 x 50 dias) e a
  variação dos últimos 5 pregões precisam de dados diários recentes mesmo quando o período da
  tela é curto (ex: "1 mês") ou usa dados semanais (ex: "Máximo"). Números que não podem ser
  calculados (ex: histórico insuficiente para a média de 50 dias) vão marcados como indisponíveis
  no texto enviado à IA — nunca inventados.
- **A IA só recebe texto com números já calculados**, nunca os pontos do gráfico nem notícias.
  As instruções de sistema vêm de `servidor/instrucoes-analise-ia.txt`, lidas do disco a cada
  pedido (edite esse arquivo para ajustar o "jeito de escrever" sem tocar em código nem reiniciar
  o servidor).
- **Streaming**: a rota `GET /api/analise?range=` (`servidor/rotas-analise.js`) responde como
  Server-Sent Events (`text/event-stream`), repassando cada pedaço de texto que chega de
  `client.messages.stream(...)` assim que chega — é isso que faz o texto "aparecer sendo
  digitado" no navegador (`EventSource` em `paginas/app.js`).
- **Cache de 15 minutos**: chave é `usuarioId:range:tickers-ordenados`, guardada em memória (mesmo
  padrão do cache de cotações em `yahoo.js` — reinicia a cada deploy/restart, o que é aceitável
  aqui). Numa resposta em cache, o texto é "reproduzido" em pedacinhos com pequenas pausas
  (`reproduzirTextoEmPedacos`) só para manter o efeito visual de digitação; a hora mostrada é a da
  geração original, não a do clique atual.
- **Erros amigáveis**: `mapearErroAnthropic` em `ia.js` traduz as classes de erro do SDK
  (`Anthropic.AuthenticationError`, `PermissionDeniedError`, `RateLimitError`, `BadRequestError`
  — este último cobre o caso mais comum de crédito esgotado —, `APIConnectionError`, `APIError`)
  em mensagens em português. Chave ausente é verificada antes de chamar a API, com mensagem própria.

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

## Publicação (Railway)

- Projeto Railway `painel-acoes`, serviço `painel-acoes`, ligado ao repositório GitHub
  `marceloibanez756-boop/painel-acoes` (branch `main`) — cada `git push` dispara um novo deploy
  automaticamente (build via Railpack/Nixpacks, comando de start é o `npm start` do `package.json`).
- **Porta**: o Railway injeta a variável `PORT` (em inglês, diferente da `PORTA` local em
  português) — `server.js` lê `process.env.PORT || process.env.PORTA || 3000`, nessa ordem.
- **Dados persistentes**: `servidor/db.js` lê `process.env.DADOS_DIR`; no Railway essa variável
  aponta para `/data`, que é um **Volume** (HD permanente) de 500MB anexado ao serviço. Sem isso,
  `dados/dados.json` viveria no sistema de arquivos do container e seria apagado a cada deploy.
- **Segredos**: `ADMIN_NOME`, `ADMIN_USUARIO`, `ADMIN_EMAIL`, `ADMIN_SENHA`, `CHAVE_SESSAO`,
  `ANTHROPIC_API_KEY` e `NODE_ENV=production` ficam como variáveis de ambiente no Railway, nunca
  em arquivo/repositório. `ANTHROPIC_API_KEY` é opcional: sem ela, o resto do app funciona
  normalmente e só a "Análise do Dia" mostra uma mensagem amigável em vez de gerar o texto.
  `NODE_ENV=production` faz o cookie de sessão usar `secure: true` (só trafega em https) —
  ver `servidor/auth.js`. `server.js` também chama `app.set("trust proxy", 1)` porque o Railway
  fica atrás de um proxy que termina o https antes de repassar a requisição ao container.
- **Corrigir a senha do administrador sem apagar dados**: se `ADMIN_SENHA` for configurada errada
  e o administrador inicial já tiver sido criado, definir a variável `REDEFINIR_SENHA_ADMIN=true`
  no Railway (junto com o `ADMIN_SENHA` correto) faz `server.js` redefinir a senha desse usuário
  (por `ADMIN_USUARIO`) no próximo boot, marcando `precisaTrocarSenha: true`, sem tocar em mais
  nada. Depois de usar, apague a variável `REDEFINIR_SENHA_ADMIN` (ou ela redefiniria de novo a
  cada reinício, se alguém mudar `ADMIN_SENHA` no futuro por outro motivo).
- **CLI usada para tudo isso**: `@railway/cli` (instalado via `npm install -g`, precisa da flag
  `--allow-scripts=@railway/cli` para o binário nativo ser baixado). Duas pegadinhas encontradas
  nessa CLI (versão 5.45.5): `railway volume add --service <nome>` trava com um panic em Rust —
  funciona se omitir `--service` (só há 1 serviço no projeto, ela detecta sozinha); e mudar uma
  variável para o **mesmo valor** que já tinha (ex: `REDEFINIR_SENHA_ADMIN=true` de novo) não
  dispara um novo deploy — nesse caso use `railway redeploy --yes` para forçar.

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
