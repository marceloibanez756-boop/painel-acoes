// Busca de cotações na Yahoo Finance, com uma memória de curto prazo (cache) de 15 minutos
// para não ficar buscando o mesmo papel toda hora.

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DURACAO_CACHE_MS = 15 * 60 * 1000;
const cache = new Map(); // chave: "TICKER.SA:range" -> { dados, expiraEm }

const RANGES_VALIDOS = ["1m", "3m", "6m", "ytd", "1a", "max"];

function erroAmigavel(mensagem) {
  const erro = new Error(mensagem);
  erro.amigavel = true;
  return erro;
}

function normalizarTicker(tickerBruto) {
  const t = String(tickerBruto || "").trim().toUpperCase();
  if (!t) return null;
  return t.includes(".") ? t : `${t}.SA`;
}

function apelidoTicker(ticker) {
  return ticker.replace(/\.SA$/i, "");
}

function dataInicial(range) {
  const agora = new Date();
  const d = new Date(agora);
  switch (range) {
    case "1m":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3m":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "6m":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "ytd":
      return new Date(agora.getFullYear(), 0, 1);
    case "1a":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "max":
      return new Date(2000, 0, 1);
    default:
      d.setMonth(d.getMonth() - 1);
      return d;
  }
}

async function buscarSerie(tickerBruto, range) {
  const ticker = normalizarTicker(tickerBruto);
  if (!ticker) {
    throw erroAmigavel("Informe o código de uma ação (por exemplo: PETR4).");
  }
  const rangeValido = RANGES_VALIDOS.includes(range) ? range : "1m";
  const chave = `${ticker}:${rangeValido}`;

  const emCache = cache.get(chave);
  if (emCache && emCache.expiraEm > Date.now()) {
    return emCache.dados;
  }

  const period1 = dataInicial(rangeValido);
  const interval = rangeValido === "max" ? "1wk" : "1d";

  let resultado;
  try {
    resultado = await yahooFinance.chart(ticker, { period1, interval });
  } catch (erroOriginal) {
    throw erroAmigavel(
      `Não encontramos a ação "${apelidoTicker(ticker)}". Confira se o código está certo (ex: PETR4, ITUB4, VALE3) e tente novamente.`
    );
  }

  const pontos = (resultado.quotes || [])
    .filter((q) => q && q.close !== null && q.close !== undefined && q.date)
    .map((q) => ({ data: q.date.toISOString().slice(0, 10), preco: Number(q.close.toFixed(2)) }));

  if (pontos.length === 0) {
    throw erroAmigavel(
      `Não conseguimos dados para "${apelidoTicker(ticker)}" nesse período. O código pode não existir ou não ter negociações recentes.`
    );
  }

  const nome =
    (resultado.meta && (resultado.meta.longName || resultado.meta.shortName)) || apelidoTicker(ticker);

  const dadosSerie = { ticker: apelidoTicker(ticker), nome, pontos };
  cache.set(chave, { dados: dadosSerie, expiraEm: Date.now() + DURACAO_CACHE_MS });
  return dadosSerie;
}

module.exports = { buscarSerie, normalizarTicker, apelidoTicker, RANGES_VALIDOS, erroAmigavel };
