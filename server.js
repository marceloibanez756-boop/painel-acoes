// Ponto de entrada do app. Liga o servidor, cria o primeiro administrador (se necessário)
// e conecta todas as rotas da API, além de servir as páginas do navegador.

require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./servidor/db");
const auth = require("./servidor/auth");

function garantirPrimeiroAdministrador() {
  const dados = db.carregar();
  if (dados.usuarios.length > 0) return;

  const { ADMIN_NOME, ADMIN_USUARIO, ADMIN_EMAIL, ADMIN_SENHA } = process.env;
  if (!ADMIN_NOME || !ADMIN_USUARIO || !ADMIN_EMAIL || !ADMIN_SENHA) {
    console.error(
      "\nATENÇÃO: ainda não existe nenhum usuário e faltam dados no arquivo .env.\n" +
        "Preencha ADMIN_NOME, ADMIN_USUARIO, ADMIN_EMAIL e ADMIN_SENHA no arquivo .env e reinicie o app.\n"
    );
    return;
  }

  const id = db.gerarId();
  const usuarioNormalizado = ADMIN_USUARIO.trim().toLowerCase();
  dados.usuarios.push({
    id,
    nomeCompleto: ADMIN_NOME.trim(),
    usuario: usuarioNormalizado,
    email: ADMIN_EMAIL.trim(),
    senhaHash: auth.criarHashSenha(ADMIN_SENHA),
    tipo: "admin",
    precisaTrocarSenha: true,
    criadoEm: new Date().toISOString(),
  });
  dados.carteiras[id] = ["PETR4", "ITUB4", "VALE3"];
  db.salvar(dados);

  console.log(`\nAdministrador inicial criado com sucesso. Usuário: "${usuarioNormalizado}".\n`);
}

garantirPrimeiroAdministrador();

const app = express();
// No Railway, o app fica atrás de um "proxy" que cuida do https — isso avisa o Express
// disso, para o cookie de login funcionar corretamente como seguro.
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

app.use("/api", require("./servidor/rotas-auth"));
app.use("/api/conta", require("./servidor/rotas-conta"));
app.use("/api/carteira", require("./servidor/rotas-carteira"));
app.use("/api/acoes", require("./servidor/rotas-acoes"));
app.use("/api/admin", require("./servidor/rotas-admin"));

app.use(express.static(path.join(__dirname, "paginas")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "paginas", "index.html"));
});

// O Railway define a porta sozinho, na variável PORT. No seu computador, continua usando
// PORTA do arquivo .env (ou 3000, se nada estiver definido).
const PORTA = process.env.PORT || process.env.PORTA || 3000;
app.listen(PORTA, () => {
  console.log(`\nApp rodando! Abra no navegador: http://localhost:${PORTA}\n`);
});
