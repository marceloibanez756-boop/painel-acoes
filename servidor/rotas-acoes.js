// Rota da página "Ações": busca as cotações da carteira do usuário logado.

const express = require("express");
const db = require("./db");
const auth = require("./auth");
const yahoo = require("./yahoo");

const router = express.Router();

router.use(auth.exigirLogin, auth.exigirSenhaDefinitiva);

router.get("/", async (req, res) => {
  const range = yahoo.RANGES_VALIDOS.includes(req.query.range) ? req.query.range : "1m";

  const dados = db.carregar();
  const carteira = dados.carteiras[req.usuario.id] || ["PETR4", "ITUB4", "VALE3"];

  const resultados = await Promise.all(
    carteira.map(async (ticker) => {
      try {
        const serie = await yahoo.buscarSerie(ticker, range);
        const precoInicial = serie.pontos[0].preco;
        const precoAtual = serie.pontos[serie.pontos.length - 1].preco;
        const variacaoPercentual = ((precoAtual / precoInicial) - 1) * 100;
        return {
          ticker: serie.ticker,
          nome: serie.nome,
          pontos: serie.pontos,
          precoAtual,
          variacaoPercentual,
          erro: null,
        };
      } catch (erro) {
        return {
          ticker,
          nome: ticker,
          pontos: [],
          precoAtual: null,
          variacaoPercentual: null,
          erro: erro.amigavel ? erro.message : "Não foi possível buscar esta ação agora.",
        };
      }
    })
  );

  res.json({ range, acoes: resultados });
});

module.exports = router;
