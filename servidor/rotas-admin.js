// Rotas da área de Administração: listar, criar, redefinir senha, promover/rebaixar e excluir usuários.

const express = require("express");
const db = require("./db");
const auth = require("./auth");

const router = express.Router();

router.use(auth.exigirLogin, auth.exigirSenhaDefinitiva, auth.exigirAdmin);

function contarAdmins(usuarios) {
  return usuarios.filter((u) => u.tipo === "admin").length;
}

router.get("/usuarios", (req, res) => {
  const dados = db.carregar();
  res.json({ usuarios: dados.usuarios.map(auth.usuarioPublico) });
});

router.post("/usuarios", (req, res) => {
  const { nomeCompleto, usuario, email } = req.body || {};

  if (!nomeCompleto || !usuario || !email) {
    return res.status(400).json({ erro: "Preencha nome completo, nome de usuário e e-mail." });
  }

  const usuarioNormalizado = String(usuario).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuarioNormalizado)) {
    return res
      .status(400)
      .json({ erro: "O nome de usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou underline." });
  }

  const dados = db.carregar();
  if (dados.usuarios.some((u) => u.usuario.toLowerCase() === usuarioNormalizado)) {
    return res.status(400).json({ erro: `Já existe um usuário com o nome "${usuarioNormalizado}".` });
  }

  const senhaTemporaria = auth.gerarSenhaTemporaria();
  const novoUsuario = {
    id: db.gerarId(),
    nomeCompleto: String(nomeCompleto).trim(),
    usuario: usuarioNormalizado,
    email: String(email).trim(),
    senhaHash: auth.criarHashSenha(senhaTemporaria),
    tipo: "usuario",
    precisaTrocarSenha: true,
    criadoEm: new Date().toISOString(),
  };

  dados.usuarios.push(novoUsuario);
  dados.carteiras[novoUsuario.id] = ["PETR4", "ITUB4", "VALE3"];
  db.salvar(dados);

  res.json({ usuario: auth.usuarioPublico(novoUsuario), senhaTemporaria });
});

router.post("/usuarios/:id/redefinir-senha", (req, res) => {
  const dados = db.carregar();
  const usuario = dados.usuarios.find((u) => u.id === req.params.id);
  if (!usuario) {
    return res.status(404).json({ erro: "Usuário não encontrado." });
  }

  const senhaTemporaria = auth.gerarSenhaTemporaria();
  usuario.senhaHash = auth.criarHashSenha(senhaTemporaria);
  usuario.precisaTrocarSenha = true;
  db.salvar(dados);

  res.json({ senhaTemporaria });
});

router.post("/usuarios/:id/tipo", (req, res) => {
  const { tipo } = req.body || {};
  if (tipo !== "admin" && tipo !== "usuario") {
    return res.status(400).json({ erro: "Tipo inválido." });
  }

  const dados = db.carregar();
  const usuario = dados.usuarios.find((u) => u.id === req.params.id);
  if (!usuario) {
    return res.status(404).json({ erro: "Usuário não encontrado." });
  }

  if (usuario.tipo === "admin" && tipo === "usuario" && contarAdmins(dados.usuarios) <= 1) {
    return res.status(400).json({ erro: "Não é possível rebaixar: precisa existir pelo menos um administrador." });
  }

  usuario.tipo = tipo;
  db.salvar(dados);
  res.json({ usuario: auth.usuarioPublico(usuario) });
});

router.delete("/usuarios/:id", (req, res) => {
  if (req.params.id === req.usuario.id) {
    return res.status(400).json({ erro: "Você não pode excluir a si mesmo." });
  }

  const dados = db.carregar();
  const usuario = dados.usuarios.find((u) => u.id === req.params.id);
  if (!usuario) {
    return res.status(404).json({ erro: "Usuário não encontrado." });
  }

  if (usuario.tipo === "admin" && contarAdmins(dados.usuarios) <= 1) {
    return res.status(400).json({ erro: "Não é possível excluir o último administrador." });
  }

  dados.usuarios = dados.usuarios.filter((u) => u.id !== usuario.id);
  dados.sessoes = dados.sessoes.filter((s) => s.usuarioId !== usuario.id);
  delete dados.carteiras[usuario.id];
  db.salvar(dados);

  res.json({ ok: true });
});

module.exports = router;
