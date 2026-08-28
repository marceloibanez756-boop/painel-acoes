// Rotas de login, logout e "quem sou eu".

const express = require("express");
const db = require("./db");
const auth = require("./auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Informe usuário e senha." });
  }

  const dados = db.carregar();
  const usuarioEncontrado = dados.usuarios.find(
    (u) => u.usuario.toLowerCase() === String(usuario).trim().toLowerCase()
  );

  if (!usuarioEncontrado || !auth.conferirSenha(senha, usuarioEncontrado.senhaHash)) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos." });
  }

  const { token, expiraEm } = auth.criarSessao(usuarioEncontrado.id);
  auth.definirCookieSessao(res, token, expiraEm);
  res.json({ usuario: auth.usuarioPublico(usuarioEncontrado) });
});

router.post("/logout", (req, res) => {
  const token = req.cookies ? req.cookies[auth.NOME_COOKIE] : null;
  if (token) auth.destruirSessao(token);
  auth.limparCookieSessao(res);
  res.json({ ok: true });
});

router.get("/me", auth.exigirLogin, (req, res) => {
  res.json({ usuario: auth.usuarioPublico(req.usuario) });
});

module.exports = router;
