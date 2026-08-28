// Funções relacionadas a login, senhas e sessões (o "estou logado" que sobrevive a um F5).

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const NOME_COOKIE = "sessao";

// Letras e números fáceis de digitar, sem caracteres que costumam confundir (0/O, 1/l/I).
const ALFABETO_SENHA_TEMPORARIA = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function gerarSenhaTemporaria() {
  let senha = "";
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) {
    senha += ALFABETO_SENHA_TEMPORARIA[bytes[i] % ALFABETO_SENHA_TEMPORARIA.length];
  }
  return senha;
}

function criarHashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}

function conferirSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

function criarSessao(usuarioId) {
  const dados = db.carregar();
  const token = crypto.randomBytes(32).toString("hex");
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  dados.sessoes = dados.sessoes.filter((s) => s.expiraEm > Date.now());
  dados.sessoes.push({ token, usuarioId, expiraEm });
  db.salvar(dados);
  return { token, expiraEm };
}

function destruirSessao(token) {
  const dados = db.carregar();
  dados.sessoes = dados.sessoes.filter((s) => s.token !== token);
  db.salvar(dados);
}

function usuarioDaSessao(token) {
  if (!token) return null;
  const dados = db.carregar();
  const sessao = dados.sessoes.find((s) => s.token === token);
  if (!sessao || sessao.expiraEm <= Date.now()) return null;
  return dados.usuarios.find((u) => u.id === sessao.usuarioId) || null;
}

function definirCookieSessao(res, token, expiraEm) {
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // "secure" faz o navegador só enviar o cookie por https — correto quando o app está
    // publicado na internet (Railway define NODE_ENV=production automaticamente).
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiraEm),
  });
}

function limparCookieSessao(res) {
  res.clearCookie(NOME_COOKIE);
}

// Middleware: exige estar logado. Preenche req.usuario.
function exigirLogin(req, res, next) {
  const token = req.cookies ? req.cookies[NOME_COOKIE] : null;
  const usuario = usuarioDaSessao(token);
  if (!usuario) {
    return res.status(401).json({ erro: "Você precisa entrar para acessar isso." });
  }
  req.usuario = usuario;
  req.tokenSessao = token;
  next();
}

// Middleware: exige estar logado E já ter trocado a senha temporária.
function exigirSenhaDefinitiva(req, res, next) {
  if (req.usuario.precisaTrocarSenha) {
    return res
      .status(403)
      .json({ erro: "Antes de continuar, defina uma nova senha em sua conta.", precisaTrocarSenha: true });
  }
  next();
}

// Middleware: exige ser administrador.
function exigirAdmin(req, res, next) {
  if (req.usuario.tipo !== "admin") {
    return res.status(403).json({ erro: "Só administradores podem fazer isso." });
  }
  next();
}

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nomeCompleto: usuario.nomeCompleto,
    usuario: usuario.usuario,
    email: usuario.email,
    tipo: usuario.tipo,
    precisaTrocarSenha: usuario.precisaTrocarSenha,
  };
}

module.exports = {
  NOME_COOKIE,
  gerarSenhaTemporaria,
  criarHashSenha,
  conferirSenha,
  criarSessao,
  destruirSessao,
  usuarioDaSessao,
  definirCookieSessao,
  limparCookieSessao,
  exigirLogin,
  exigirSenhaDefinitiva,
  exigirAdmin,
  usuarioPublico,
};
