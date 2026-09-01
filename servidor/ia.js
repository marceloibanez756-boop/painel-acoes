// Fala com a IA da Anthropic (Claude) para gerar a "Análise do Dia" da carteira do usuário.
// Regra de ouro: a IA só recebe números já calculados aqui (nunca gráficos, nunca notícias) —
// quem monta o resumo numérico é este arquivo, seguindo exatamente o que o pedido original
// descreveu. Guarda a resposta em cache por 15 minutos e traduz qualquer erro técnico numa
// mensagem amigável, para nunca vazar detalhe técnico pra tela do usuário.

const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const yahoo = require("./yahoo");

// Claude Haiku 4.5: o modelo mais barato da Anthropic no momento em que isso foi escrito.
const MODELO = "claude-haiku-4-5";
const DURACAO_CACHE_MS = 15 * 60 * 1000;
const ARQUIVO_INSTRUCOES = path.join(__dirname, "instrucoes-analise-ia.txt");

const cache = new Map(); // chave: "usuarioId:range:TICKERS" -> { texto, geradoEm, expiraEm }

const ROTULOS_PERIODO = {
  "1m": "1 mês",
  "3m": "3 meses",
  "6m": "6 meses",
  ytd: "no ano (desde 1º de janeiro)",
  "1a": "1 ano",
  max: "o máximo de histórico disponível",
};

function erroAmigavel(mensagem) {
  const erro = new Error(mensagem);
  erro.amigavel = true;
  return erro;
}

// Lida na hora (não guarda em memória) para você poder editar o texto das instruções sem
// precisar reiniciar o servidor.
function lerInstrucoes() {
  return fs.readFileSync(ARQUIVO_INSTRUCOES, "utf8").trim();
}

function chaveCache(usuarioId, range, carteira) {
  const tickers = [...carteira].map((t) => String(t).toUpperCase()).sort().join(",");
  return `${usuarioId}:${range}:${tickers}`;
}

function formatarMoeda(v) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}
function formatarPercentual(v) {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${v.toFixed(2).replace(".", ",")}%`;
}
function formatarDataBr(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Monta os números de uma ação: dados do período escolhido na tela (variação, mínima, máxima)
// mais dados recentes (últimos ~90 dias corridos, sempre diários) para calcular tendência e
// variação de 5 pregões com precisão, mesmo em períodos curtos ou no "Máximo" (que usa dados
// semanais na tela). Se algo faltar, marca como indisponível em vez de inventar.
async function montarResumoAcao(tickerBruto, range) {
  const tickerMaiusculo = String(tickerBruto).toUpperCase();
  let serieP;
  try {
    serieP = await yahoo.buscarSerie(tickerBruto, range);
  } catch (erro) {
    return {
      ticker: tickerMaiusculo,
      semDados: true,
      motivo: erro.amigavel ? erro.message : "Não foi possível obter os dados desta ação agora.",
    };
  }

  const pontos = serieP.pontos;
  if (!pontos || pontos.length < 2) {
    return { ticker: serieP.ticker || tickerMaiusculo, semDados: true, motivo: "Não há pregões suficientes no período selecionado." };
  }

  const ultimo = pontos[pontos.length - 1];
  const primeiro = pontos[0];
  const variacaoPeriodo = (ultimo.preco / primeiro.preco - 1) * 100;

  let minimo = pontos[0];
  let maximo = pontos[0];
  for (const p of pontos) {
    if (p.preco < minimo.preco) minimo = p;
    if (p.preco > maximo.preco) maximo = p;
  }
  const abaixoDaMaxima = ((maximo.preco - ultimo.preco) / maximo.preco) * 100;

  const retornos = [];
  for (let i = 1; i < pontos.length; i++) {
    retornos.push(pontos[i].preco / pontos[i - 1].preco - 1);
  }
  const mediaRetornos = retornos.reduce((a, b) => a + b, 0) / retornos.length;
  const variancia = retornos.reduce((a, b) => a + (b - mediaRetornos) ** 2, 0) / retornos.length;
  const volatilidade = Math.sqrt(variancia) * 100;
  const volatilidadeRotulo = volatilidade < 1.2 ? "baixa" : volatilidade < 2.5 ? "média" : "alta";

  let variacao5Pregoes = null;
  let tendencia = null;
  let media20 = null;
  let media50 = null;
  try {
    const serieR = await yahoo.buscarSerieRecente(tickerBruto);
    const pr = serieR.pontos;
    if (pr.length >= 6) {
      variacao5Pregoes = (pr[pr.length - 1].preco / pr[pr.length - 6].preco - 1) * 100;
    }
    if (pr.length >= 50) {
      media20 = pr.slice(-20).reduce((a, p) => a + p.preco, 0) / 20;
      media50 = pr.slice(-50).reduce((a, p) => a + p.preco, 0) / 50;
      tendencia = media20 > media50 ? "alta" : media20 < media50 ? "baixa" : "neutra";
    }
  } catch (erro) {
    // Mantém tendência/variação de 5 pregões como indisponíveis — não interrompe a análise.
  }

  return {
    ticker: serieP.ticker,
    nome: serieP.nome,
    semDados: false,
    precoAtual: ultimo.preco,
    dataAtual: ultimo.data,
    variacaoPeriodo,
    minimo: minimo.preco,
    dataMinimo: minimo.data,
    maximo: maximo.preco,
    dataMaximo: maximo.data,
    abaixoDaMaxima,
    variacao5Pregoes,
    tendencia,
    media20,
    media50,
    volatilidade,
    volatilidadeRotulo,
  };
}

function formatarBlocoAcao(r) {
  if (r.semDados) {
    return `- ${r.ticker}: SEM DADOS (${r.motivo})`;
  }
  const linhaTendencia =
    r.tendencia === null
      ? `  Tendência (média 20 dias x 50 dias): não disponível (histórico recente insuficiente)`
      : `  Tendência: média de 20 dias (${formatarMoeda(r.media20)}) está ${
          r.tendencia === "neutra" ? "igual à" : r.tendencia === "alta" ? "acima da" : "abaixo da"
        } média de 50 dias (${formatarMoeda(r.media50)})`;
  const linhaVariacao5 =
    r.variacao5Pregoes === null
      ? `  Variação nos últimos 5 pregões: não disponível`
      : `  Variação nos últimos 5 pregões: ${formatarPercentual(r.variacao5Pregoes)}`;

  return [
    `- ${r.ticker} (${r.nome})`,
    `  Preço atual: ${formatarMoeda(r.precoAtual)} em ${formatarDataBr(r.dataAtual)}`,
    `  Variação no período: ${formatarPercentual(r.variacaoPeriodo)}`,
    `  Mínima do período: ${formatarMoeda(r.minimo)} em ${formatarDataBr(r.dataMinimo)}`,
    `  Máxima do período: ${formatarMoeda(r.maximo)} em ${formatarDataBr(r.dataMaximo)}`,
    `  Preço atual está ${r.abaixoDaMaxima.toFixed(2).replace(".", ",")}% abaixo da máxima do período`,
    linhaVariacao5,
    linhaTendencia,
    `  Volatilidade (o quanto o preço oscila): ${r.volatilidade.toFixed(2).replace(".", ",")}% (${r.volatilidadeRotulo})`,
  ].join("\n");
}

async function montarMensagemParaIA({ usuario, carteira, range }) {
  const resumos = await Promise.all(carteira.map((ticker) => montarResumoAcao(ticker, range)));
  const hoje = new Date();
  const dataHoje = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

  const mensagem = [
    `Data de hoje: ${dataHoje}`,
    `Nome do usuário: ${usuario.nomeCompleto}`,
    `Período analisado: ${ROTULOS_PERIODO[range] || range}`,
    ``,
    `Ações da carteira:`,
    resumos.map(formatarBlocoAcao).join("\n\n"),
  ].join("\n");

  return mensagem;
}

// Transforma os erros técnicos do SDK da Anthropic em mensagens amigáveis, sem nunca deixar
// stack trace ou texto de biblioteca chegar até a tela do usuário.
function mapearErroAnthropic(erro) {
  if (erro && erro.amigavel) return erro;
  if (erro instanceof Anthropic.AuthenticationError) {
    return erroAmigavel(
      "A chave de acesso à IA está errada ou expirou. Avise o administrador do app para conferir a chave configurada."
    );
  }
  if (erro instanceof Anthropic.PermissionDeniedError) {
    return erroAmigavel(
      "A chave de acesso à IA não tem permissão para fazer essa análise. Avise o administrador do app."
    );
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return erroAmigavel("Muitas análises foram pedidas em pouco tempo. Espere um minuto e tente de novo.");
  }
  if (erro instanceof Anthropic.BadRequestError) {
    return erroAmigavel(
      "O serviço de IA recusou o pedido agora — isso costuma acontecer quando o crédito da conta acabou. Avise o administrador do app para conferir o saldo na Anthropic."
    );
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return erroAmigavel("Não conseguimos falar com o serviço de IA agora (parece um problema de conexão). Tente novamente em instantes.");
  }
  if (erro instanceof Anthropic.APIError) {
    return erroAmigavel("O serviço de IA está indisponível no momento. Tente novamente em instantes.");
  }
  return erroAmigavel("Não foi possível gerar a análise agora. Tente novamente em instantes.");
}

// Reproduz um texto já pronto (vindo do cache) em pedacinhos, com uma pequena pausa entre eles,
// só para manter o mesmo efeito visual de "digitando" mesmo quando reaproveitamos a análise.
function reproduzirTextoEmPedacos(texto, aoEnviarTrecho) {
  return new Promise((resolve) => {
    const palavras = texto.split(/(?<=\s)/);
    let i = 0;
    function proximo() {
      if (i >= palavras.length) return resolve();
      aoEnviarTrecho(palavras[i]);
      i++;
      setTimeout(proximo, 15);
    }
    proximo();
  });
}

// Função principal: gera (ou reaproveita) a Análise do Dia.
// aoEnviarMeta({ periodo, geradoEm, cache }) é chamado uma vez, assim que sabemos o período e a
// hora da análise. aoEnviarTrecho(texto) é chamado várias vezes, com pedaços do texto.
async function gerarAnaliseDoDia({ usuario, carteira, range, aoEnviarMeta, aoEnviarTrecho }) {
  if (!carteira || carteira.length === 0) {
    throw erroAmigavel('Sua carteira está vazia. Adicione ações em "Minha carteira" antes de pedir uma análise.');
  }

  const chave = chaveCache(usuario.id, range, carteira);
  const emCache = cache.get(chave);
  if (emCache && emCache.expiraEm > Date.now()) {
    aoEnviarMeta({ periodo: range, geradoEm: emCache.geradoEm, cache: true });
    await reproduzirTextoEmPedacos(emCache.texto, aoEnviarTrecho);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw erroAmigavel(
      "A análise por IA ainda não foi configurada neste servidor (falta a chave de acesso). Peça para o administrador configurar e tente novamente."
    );
  }

  const mensagem = await montarMensagemParaIA({ usuario, carteira, range });
  const instrucoes = lerInstrucoes();
  const geradoEm = Date.now();
  aoEnviarMeta({ periodo: range, geradoEm, cache: false });

  const client = new Anthropic();
  let textoCompleto = "";

  try {
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: 1500,
      system: instrucoes,
      messages: [{ role: "user", content: mensagem }],
    });

    for await (const evento of stream) {
      if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        textoCompleto += evento.delta.text;
        aoEnviarTrecho(evento.delta.text);
      }
    }
  } catch (erro) {
    throw mapearErroAnthropic(erro);
  }

  if (!textoCompleto.trim()) {
    throw erroAmigavel("A IA não conseguiu gerar uma análise agora. Tente novamente em instantes.");
  }

  cache.set(chave, { texto: textoCompleto, geradoEm, expiraEm: geradoEm + DURACAO_CACHE_MS });
}

module.exports = { gerarAnaliseDoDia };
