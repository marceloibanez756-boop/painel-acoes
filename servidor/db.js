// Camada de dados do app: guarda tudo em um único arquivo JSON dentro da pasta "dados".
// Não é um banco de dados de verdade, mas resolve bem para um app local com poucos usuários.
// Toda gravação é feita em arquivo temporário e depois renomeada, para nunca deixar o arquivo
// principal corrompido caso o processo seja interrompido no meio de uma escrita.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// DADOS_DIR permite apontar para outro lugar (ex: um Volume permanente no Railway).
// Sem essa variável, continua usando a pasta "dados" dentro do projeto, como sempre foi.
const PASTA_DADOS = process.env.DADOS_DIR
  ? path.resolve(process.env.DADOS_DIR)
  : path.join(__dirname, "..", "dados");
const ARQUIVO_DADOS = path.join(PASTA_DADOS, "dados.json");

function estadoInicial() {
  return { usuarios: [], sessoes: [], carteiras: {} };
}

function garantirPasta() {
  if (!fs.existsSync(PASTA_DADOS)) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
  }
}

function carregar() {
  garantirPasta();
  if (!fs.existsSync(ARQUIVO_DADOS)) {
    const inicial = estadoInicial();
    salvar(inicial);
    return inicial;
  }
  const texto = fs.readFileSync(ARQUIVO_DADOS, "utf-8");
  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(
      `O arquivo de dados (${ARQUIVO_DADOS}) está corrompido e não pôde ser lido: ${erro.message}`
    );
  }
}

function salvar(dados) {
  garantirPasta();
  const arquivoTemporario = ARQUIVO_DADOS + ".tmp";
  fs.writeFileSync(arquivoTemporario, JSON.stringify(dados, null, 2), "utf-8");
  fs.renameSync(arquivoTemporario, ARQUIVO_DADOS);
}

function gerarId() {
  return crypto.randomBytes(12).toString("hex");
}

module.exports = { carregar, salvar, gerarId, ARQUIVO_DADOS };
