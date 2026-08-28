// Rotas da página "Minha carteira": adicionar e remover ações da lista de cada usuário.

const express = require("express");
const db = require("./db");
const auth = require("./auth");
const yahoo = require("./yahoo");

const router = express.Router();

router.use(auth.exigirLogin, auth.exigirSenhaDefinitiva);

function carteiraDoUsuario(dados, usuarioId) {
  if (!dados.carteiras[usuarioId]) {
    dados.carteiras[usuarioId] = ["PETR4", "ITUB4", "VALE3"];
  }
  return dados.carteiras[usuarioId];
}

router.get("/", (req, res) => {
  const dados = db.carregar();
  res.json({ carteira: carteiraDoUsuario(dados, req.usuario.id) });
});

router.post("/", async (req, res) => {
  const tickerBruto = (req.body && req.body.ticker) || "";
  const apelido = yahoo.apelidoTicker(yahoo.normalizarTicker(tickerBruto) || "");

  if (!apelido) {
    return res.status(400).json({ erro: "Digite o código de uma ação, por exemplo WEGE3." });
  }

  const dados = db.carregar();
  const carteira = carteiraDoUsuario(dados, req.usuario.id);

  if (carteira.some((t) => t.toUpperCase() === apelido.toUpperCase())) {
    return res.status(400).json({ erro: `${apelido} já está na sua carteira.` });
  }

  try {
    await yahoo.buscarSerie(apelido, "1m");
  } catch (erro) {
    return res.status(400).json({ erro: erro.amigavel ? erro.message : "Não foi possível confirmar esse código agora. Tente novamente." });
  }

  carteira.push(apelido.toUpperCase());
  db.salvar(dados);
  res.json({ carteira });
});

router.delete("/:ticker", (req, res) => {
  const alvo = String(req.params.ticker || "").toUpperCase();
  const dados = db.carregar();
  const carteira = carteiraDoUsuario(dados, req.usuario.id);
  const nova = carteira.filter((t) => t.toUpperCase() !== alvo);

  if (nova.length === carteira.length) {
    return res.status(404).json({ erro: `${alvo} não está na sua carteira.` });
  }

  dados.carteiras[req.usuario.id] = nova;
  db.salvar(dados);
  res.json({ carteira: nova });
});

module.exports = router;
