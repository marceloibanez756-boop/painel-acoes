// Rota da página "Minha conta": trocar a própria senha.

const express = require("express");
const db = require("./db");
const auth = require("./auth");

const router = express.Router();

router.put("/senha", auth.exigirLogin, (req, res) => {
  const { senhaAtual, novaSenha, confirmarSenha } = req.body || {};

  if (!senhaAtual || !novaSenha || !confirmarSenha) {
    return res.status(400).json({ erro: "Preencha a senha atual e a nova senha (duas vezes)." });
  }
  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 6 caracteres." });
  }
  if (novaSenha !== confirmarSenha) {
    return res.status(400).json({ erro: "A confirmação não é igual à nova senha." });
  }

  const dados = db.carregar();
  const usuario = dados.usuarios.find((u) => u.id === req.usuario.id);
  if (!usuario) {
    return res.status(404).json({ erro: "Usuário não encontrado." });
  }
  if (!auth.conferirSenha(senhaAtual, usuario.senhaHash)) {
    return res.status(401).json({ erro: "A senha atual informada está incorreta." });
  }

  usuario.senhaHash = auth.criarHashSenha(novaSenha);
  usuario.precisaTrocarSenha = false;
  db.salvar(dados);

  res.json({ ok: true });
});

module.exports = router;
