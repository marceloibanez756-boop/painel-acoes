// Rota da "Análise do Dia": manda os números da carteira do usuário para a IA da Anthropic e
// transmite a resposta aos poucos (Server-Sent Events), para o texto aparecer "sendo digitado"
// na tela em vez de surgir tudo de uma vez.

const express = require("express");
const db = require("./db");
const auth = require("./auth");
const yahoo = require("./yahoo");
const ia = require("./ia");

const router = express.Router();

router.use(auth.exigirLogin, auth.exigirSenhaDefinitiva);

router.get("/", async (req, res) => {
  const range = yahoo.RANGES_VALIDOS.includes(req.query.range) ? req.query.range : "1m";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let conexaoFechada = false;
  req.on("close", () => {
    conexaoFechada = true;
  });

  function enviar(evento, dados) {
    if (conexaoFechada) return;
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  }

  try {
    const dados = db.carregar();
    const carteira = dados.carteiras[req.usuario.id] || ["PETR4", "ITUB4", "VALE3"];

    await ia.gerarAnaliseDoDia({
      usuario: req.usuario,
      carteira,
      range,
      aoEnviarMeta: (meta) => enviar("meta", meta),
      aoEnviarTrecho: (texto) => enviar("chunk", { texto }),
    });

    enviar("fim", {});
  } catch (erro) {
    enviar("erro", {
      mensagem: erro.amigavel ? erro.message : "Não foi possível gerar a análise agora. Tente novamente em instantes.",
    });
  } finally {
    res.end();
  }
});

module.exports = router;
