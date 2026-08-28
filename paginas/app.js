// Lógica do app no navegador: login, navegação entre páginas, carteira, ações e administração.
// Não usa nenhuma biblioteca externa — só JavaScript puro conversando com a API do servidor.

const ROTULOS_PERIODO = {
  "1m": "1 mês",
  "3m": "3 meses",
  "6m": "6 meses",
  ytd: "No ano",
  "1a": "1 ano",
  max: "Máximo",
};
const ORDEM_PERIODOS = ["1m", "3m", "6m", "ytd", "1a", "max"];

const PALETA_CLARO = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9558d6", "#d6478a", "#1a9e9e", "#7a8a99"];
const PALETA_ESCURO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#a875e0", "#e05f9a", "#2bb8b8", "#93a3b3"];

let usuarioAtual = null;
let rangeAtual = "1m";
let ultimoResultadoAcoes = null; // guardado para gerar o CSV sem precisar buscar de novo

function ehEscuro() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function corDaSerie(indice) {
  return (ehEscuro() ? PALETA_ESCURO : PALETA_CLARO)[indice % PALETA_CLARO.length];
}
function formatarMoeda(v) {
  if (v === null || v === undefined) return "—";
  return "R$ " + v.toFixed(2).replace(".", ",");
}
function formatarDataCurta(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}

// ---------- Comunicação com a API ----------
async function api(metodo, url, corpo) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  try {
    dados = await resposta.json();
  } catch (e) {
    // resposta sem corpo JSON
  }
  if (!resposta.ok) {
    const erro = new Error((dados && dados.erro) || "Algo deu errado. Tente novamente.");
    erro.precisaTrocarSenha = dados && dados.precisaTrocarSenha;
    throw erro;
  }
  return dados;
}

// ---------- Inicialização ----------
async function iniciar() {
  try {
    const resposta = await api("GET", "/api/me");
    usuarioAtual = resposta.usuario;
    if (usuarioAtual.precisaTrocarSenha) {
      mostrarTela("tela-trocar-senha");
      renderTrocaDeSenhaObrigatoria();
    } else {
      mostrarTela("app-shell");
      montarShell();
      window.addEventListener("hashchange", renderRota);
      renderRota();
    }
  } catch (e) {
    mostrarTela("tela-login");
  }
}

function mostrarTela(idTela) {
  ["tela-login", "tela-trocar-senha", "app-shell"].forEach((id) => {
    document.getElementById(id).classList.toggle("oculto", id !== idTela);
  });
}

// ---------- Login ----------
document.getElementById("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const usuario = document.getElementById("campo-usuario").value.trim();
  const senha = document.getElementById("campo-senha").value;
  const caixaErro = document.getElementById("erro-login");
  caixaErro.innerHTML = "";
  try {
    await api("POST", "/api/login", { usuario, senha });
    document.getElementById("campo-senha").value = "";
    await iniciar();
  } catch (e) {
    caixaErro.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
  }
});

document.getElementById("botao-sair").addEventListener("click", async () => {
  await api("POST", "/api/logout").catch(() => {});
  usuarioAtual = null;
  location.hash = "";
  mostrarTela("tela-login");
});

// ---------- Troca de senha obrigatória (senha temporária) ----------
function renderTrocaDeSenhaObrigatoria() {
  const alvo = document.getElementById("conteudo-trocar-senha");
  alvo.innerHTML = formularioTrocaSenhaHtml();
  ligarFormularioTrocaSenha(alvo, async () => {
    await iniciar();
  });
}

function formularioTrocaSenhaHtml() {
  return `
    <div id="erro-troca-senha"></div>
    <form id="form-troca-senha">
      <div class="campo">
        <label>Senha atual (a que você usou para entrar)</label>
        <input type="password" name="senhaAtual" required />
      </div>
      <div class="campo">
        <label>Nova senha (mínimo 6 caracteres)</label>
        <input type="password" name="novaSenha" required minlength="6" />
      </div>
      <div class="campo">
        <label>Confirmar nova senha</label>
        <input type="password" name="confirmarSenha" required minlength="6" />
      </div>
      <button type="submit" class="botao bloco">Salvar nova senha</button>
    </form>
  `;
}

function ligarFormularioTrocaSenha(container, aoSalvarComSucesso) {
  const form = container.querySelector("#form-troca-senha");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const dados = Object.fromEntries(new FormData(form).entries());
    const caixaErro = container.querySelector("#erro-troca-senha");
    caixaErro.innerHTML = "";
    try {
      await api("PUT", "/api/conta/senha", dados);
      await aoSalvarComSucesso();
    } catch (e) {
      caixaErro.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });
}

// ---------- Shell (menu lateral) ----------
function montarShell() {
  document.getElementById("rodape-nome").textContent = usuarioAtual.nomeCompleto;
  document.getElementById("rodape-papel").textContent =
    usuarioAtual.tipo === "admin" ? "Administrador" : "Usuário";
  document.getElementById("link-admin").classList.toggle("oculto", usuarioAtual.tipo !== "admin");

  document.querySelectorAll(".link-nav[data-rota]").forEach((botao) => {
    botao.addEventListener("click", () => {
      location.hash = "#/" + botao.dataset.rota;
    });
  });

  if (!location.hash) location.hash = "#/acoes";
}

function rotaAtual() {
  const rota = (location.hash || "#/acoes").replace("#/", "");
  if (rota === "admin" && usuarioAtual.tipo !== "admin") return "acoes";
  if (!["acoes", "carteira", "conta", "admin"].includes(rota)) return "acoes";
  return rota;
}

function renderRota() {
  const rota = rotaAtual();
  document.querySelectorAll(".link-nav[data-rota]").forEach((botao) => {
    botao.classList.toggle("ativo", botao.dataset.rota === rota);
  });
  const funcoes = {
    acoes: renderPaginaAcoes,
    carteira: renderPaginaCarteira,
    conta: renderPaginaConta,
    admin: renderPaginaAdmin,
  };
  funcoes[rota]();
}

// ---------- Página: Ações ----------
async function renderPaginaAcoes() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = `
    <h1>Ações</h1>
    <p class="subtitulo">Cotações da sua carteira, direto da Yahoo Finance (atualizadas a cada 15 minutos).</p>
    <div class="periodo-botoes" id="periodo-botoes"></div>
    <div id="area-acoes">
      <p class="rodape-tabela-vazia">Carregando cotações...</p>
    </div>
  `;

  const botoesEl = document.getElementById("periodo-botoes");
  ORDEM_PERIODOS.forEach((codigo) => {
    const botao = document.createElement("button");
    botao.textContent = ROTULOS_PERIODO[codigo];
    botao.className = codigo === rangeAtual ? "ativo" : "";
    botao.addEventListener("click", () => {
      rangeAtual = codigo;
      renderPaginaAcoes();
    });
    botoesEl.appendChild(botao);
  });

  try {
    const resultado = await api("GET", `/api/acoes?range=${rangeAtual}`);
    ultimoResultadoAcoes = resultado;
    renderConteudoAcoes(resultado);
  } catch (e) {
    document.getElementById("area-acoes").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
  }
}

function renderConteudoAcoes(resultado) {
  const area = document.getElementById("area-acoes");
  const validas = resultado.acoes.filter((a) => !a.erro);

  if (resultado.acoes.length === 0) {
    area.innerHTML = `<p class="rodape-tabela-vazia">Sua carteira está vazia. Adicione ações na página "Minha carteira".</p>`;
    return;
  }

  area.innerHTML = `
    <div class="cards" id="cards-acoes"></div>
    ${
      validas.length > 0
        ? `
    <section class="bloco">
      <h2>Performance no período (base 100)</h2>
      <p class="subtitulo" style="margin-bottom:10px;">Todas as ações partem do mesmo ponto para facilitar a comparação.</p>
      <div class="chart-box">
        <canvas id="grafico-acoes"></canvas>
        <div class="tooltip-grafico" id="tooltip-acoes"></div>
      </div>
      <div class="legenda" id="legenda-acoes"></div>
    </section>
    <section class="bloco">
      <div class="linha-acoes-topo">
        <h2>Resumo do período</h2>
        <button class="botao secundario pequeno" id="botao-csv">Baixar CSV</button>
      </div>
      <table>
        <thead><tr><th>Ação</th><th>Preço inicial</th><th>Preço atual</th><th>Performance</th></tr></thead>
        <tbody id="tabela-acoes"></tbody>
      </table>
    </section>`
        : ""
    }
  `;

  const cardsEl = document.getElementById("cards-acoes");
  resultado.acoes.forEach((acao, i) => {
    const card = document.createElement("div");
    if (acao.erro) {
      card.className = "card card-erro";
      card.innerHTML = `<h3>${acao.ticker}</h3><div class="msg-erro-card">${acao.erro}</div>`;
    } else {
      const up = acao.variacaoPercentual >= 0;
      card.className = "card";
      card.innerHTML = `
        <h3 style="color:${corDaSerie(i)}">${acao.nome} (${acao.ticker})</h3>
        <div class="preco">${formatarMoeda(acao.precoAtual)}</div>
        <div class="perf ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${acao.variacaoPercentual.toFixed(2)}%</div>
        <div class="periodo-texto">Período: ${ROTULOS_PERIODO[rangeAtual]}</div>
      `;
    }
    cardsEl.appendChild(card);
  });

  if (validas.length > 0) {
    const tbody = document.getElementById("tabela-acoes");
    validas.forEach((acao) => {
      const inicial = acao.pontos[0].preco;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${acao.nome} (${acao.ticker})</td><td>${formatarMoeda(inicial)}</td><td>${formatarMoeda(
        acao.precoAtual
      )}</td><td class="${acao.variacaoPercentual >= 0 ? "up" : "down"}">${acao.variacaoPercentual.toFixed(2)}%</td>`;
      tbody.appendChild(tr);
    });

    const legendaEl = document.getElementById("legenda-acoes");
    validas.forEach((acao, i) => {
      const item = document.createElement("span");
      item.innerHTML = `<span class="ponto-cor" style="background:${corDaSerie(i)}"></span>${acao.nome} (${acao.ticker})`;
      legendaEl.appendChild(item);
    });

    desenharGrafico(validas);
    document.getElementById("botao-csv").addEventListener("click", () => baixarCsv(validas));
  }
}

function desenharGrafico(validas) {
  const canvas = document.getElementById("grafico-acoes");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("tooltip-acoes");

  const series = validas.map((acao) => {
    const base = acao.pontos[0].preco;
    return acao.pontos.map((p) => ({ data: p.data, valor: (p.preco / base) * 100 }));
  });
  const referencia = series.reduce((maior, s) => (s.length > maior.length ? s : maior), series[0]);

  function desenhar() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width, h = rect.height;
    const pad = { top: 16, right: 16, bottom: 28, left: 48 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);

    let min = Infinity, max = -Infinity;
    series.forEach((s) => s.forEach((p) => { if (p.valor < min) min = p.valor; if (p.valor > max) max = p.valor; }));
    const margem = (max - min) * 0.08 || 1;
    min -= margem; max += margem;

    const y = (v) => pad.top + plotH - ((v - min) / (max - min)) * plotH;
    const corGrid = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#ddd";
    const corTexto = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#666";

    ctx.strokeStyle = corGrid;
    ctx.fillStyle = corTexto;
    ctx.font = "11px sans-serif";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const v = min + (i / 5) * (max - min);
      const yy = y(v);
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy); ctx.stroke();
      ctx.fillText(v.toFixed(0), 4, yy + 3);
    }

    const passoLabel = Math.max(1, Math.ceil(referencia.length / 8));
    referencia.forEach((p, i) => {
      if (i % passoLabel !== 0) return;
      const xx = pad.left + (i / (referencia.length - 1 || 1)) * plotW;
      ctx.fillText(formatarDataCurta(p.data).slice(0, 5), xx - 12, h - 8);
    });

    series.forEach((s, idx) => {
      ctx.strokeStyle = corDaSerie(idx);
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.forEach((p, i) => {
        const xx = pad.left + (i / (s.length - 1 || 1)) * plotW;
        const yy = y(p.valor);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });

    canvas.onmousemove = (ev) => {
      const r = canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left;
      const fracao = Math.max(0, Math.min(1, (mx - pad.left) / plotW));
      const linhas = validas.map((acao, idx) => {
        const s = series[idx];
        const i = Math.round(fracao * (s.length - 1));
        return `<span style="color:${corDaSerie(idx)}">●</span> ${acao.ticker}: ${s[i].valor.toFixed(1)}`;
      }).join("<br>");
      const iRef = Math.round(fracao * (referencia.length - 1));
      tooltip.innerHTML = `<strong>${formatarDataCurta(referencia[iRef].data)}</strong><br>${linhas}`;
      tooltip.style.display = "block";
      tooltip.style.left = Math.min(mx + 16, w - 180) + "px";
      tooltip.style.top = "10px";
    };
    canvas.onmouseleave = () => { tooltip.style.display = "none"; };
  }

  desenhar();
  window.addEventListener("resize", desenhar);
}

function baixarCsv(validas) {
  const linhas = [["Ticker", "Nome", "Preço inicial", "Preço atual", "Performance (%)"]];
  validas.forEach((acao) => {
    linhas.push([
      acao.ticker,
      acao.nome,
      acao.pontos[0].preco.toFixed(2).replace(".", ","),
      acao.precoAtual.toFixed(2).replace(".", ","),
      acao.variacaoPercentual.toFixed(2).replace(".", ","),
    ]);
  });
  const csv = linhas.map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `acoes-${rangeAtual}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Página: Minha carteira ----------
async function renderPaginaCarteira() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = `
    <h1>Minha carteira</h1>
    <p class="subtitulo">Escolha quais ações você quer acompanhar na página "Ações".</p>
    <div id="mensagem-carteira"></div>
    <div class="form-adicionar">
      <input id="campo-novo-ticker" placeholder="Ex: WEGE3" maxlength="10" />
      <button class="botao" id="botao-adicionar-ticker">Adicionar</button>
    </div>
    <div class="lista-carteira" id="lista-carteira">Carregando...</div>
  `;

  async function carregar() {
    try {
      const { carteira } = await api("GET", "/api/carteira");
      const lista = document.getElementById("lista-carteira");
      if (carteira.length === 0) {
        lista.innerHTML = `<p class="rodape-tabela-vazia">Sua carteira está vazia.</p>`;
        return;
      }
      lista.innerHTML = "";
      carteira.forEach((ticker) => {
        const item = document.createElement("div");
        item.className = "item-carteira";
        item.innerHTML = `<span class="ticker">${ticker}</span>`;
        const botaoRemover = document.createElement("button");
        botaoRemover.className = "botao perigo pequeno";
        botaoRemover.textContent = "Remover";
        botaoRemover.addEventListener("click", async () => {
          document.getElementById("mensagem-carteira").innerHTML = "";
          try {
            await api("DELETE", `/api/carteira/${encodeURIComponent(ticker)}`);
            await carregar();
          } catch (e) {
            document.getElementById("mensagem-carteira").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
          }
        });
        item.appendChild(botaoRemover);
        lista.appendChild(item);
      });
    } catch (e) {
      document.getElementById("lista-carteira").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  }

  document.getElementById("botao-adicionar-ticker").addEventListener("click", async () => {
    const campo = document.getElementById("campo-novo-ticker");
    const ticker = campo.value.trim();
    const msg = document.getElementById("mensagem-carteira");
    msg.innerHTML = "";
    if (!ticker) return;
    try {
      await api("POST", "/api/carteira", { ticker });
      campo.value = "";
      await carregar();
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  await carregar();
}

// ---------- Página: Minha conta ----------
function renderPaginaConta() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = `
    <h1>Minha conta</h1>
    <p class="subtitulo">Seus dados e sua senha.</p>
    <table style="max-width:480px; margin-bottom:28px;">
      <tbody>
        <tr><th>Nome completo</th><td>${usuarioAtual.nomeCompleto}</td></tr>
        <tr><th>Usuário</th><td>${usuarioAtual.usuario}</td></tr>
        <tr><th>E-mail</th><td>${usuarioAtual.email}</td></tr>
        <tr><th>Tipo</th><td>${usuarioAtual.tipo === "admin" ? "Administrador" : "Usuário"}</td></tr>
      </tbody>
    </table>
    <h2>Trocar senha</h2>
    <div class="form-conta">
      ${formularioTrocaSenhaHtml()}
    </div>
  `;
  const container = conteudo.querySelector(".form-conta");
  ligarFormularioTrocaSenha(container, async () => {
    container.querySelector("#erro-troca-senha").innerHTML = `<div class="mensagem-sucesso">Senha alterada com sucesso!</div>`;
    container.querySelector("#form-troca-senha").reset();
  });
}

// ---------- Página: Administração ----------
async function renderPaginaAdmin() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = `
    <h1>Administração</h1>
    <p class="subtitulo">Gerencie quem pode usar o app.</p>
    <div id="mensagem-admin"></div>
    <button class="botao" id="botao-mostrar-form-criar">Criar usuário</button>
    <div id="area-form-criar"></div>
    <div style="height:20px;"></div>
    <table>
      <thead><tr><th>Nome completo</th><th>Usuário</th><th>E-mail</th><th>Tipo</th><th>Ações</th></tr></thead>
      <tbody id="tabela-usuarios"><tr><td colspan="5" class="rodape-tabela-vazia">Carregando...</td></tr></tbody>
    </table>
  `;

  document.getElementById("botao-mostrar-form-criar").addEventListener("click", () => {
    const area = document.getElementById("area-form-criar");
    if (area.innerHTML) { area.innerHTML = ""; return; }
    area.innerHTML = `
      <div class="caixa-form-flutuante">
        <h3>Criar novo usuário</h3>
        <div id="erro-criar-usuario"></div>
        <form id="form-criar-usuario">
          <div class="campo"><label>Nome completo</label><input name="nomeCompleto" required /></div>
          <div class="campo"><label>Nome de usuário</label><input name="usuario" required /></div>
          <div class="campo"><label>E-mail</label><input name="email" type="email" required /></div>
          <button type="submit" class="botao bloco">Criar</button>
        </form>
      </div>
    `;
    document.getElementById("form-criar-usuario").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const dados = Object.fromEntries(new FormData(ev.target).entries());
      const erroEl = document.getElementById("erro-criar-usuario");
      erroEl.innerHTML = "";
      try {
        const resultado = await api("POST", "/api/admin/usuarios", dados);
        area.innerHTML = "";
        mostrarSenhaTemporaria(resultado.senhaTemporaria, `Usuário "${resultado.usuario.usuario}" criado.`);
        await carregarUsuarios();
      } catch (e) {
        erroEl.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
      }
    });
  });

  await carregarUsuarios();
}

function mostrarSenhaTemporaria(senha, titulo) {
  const alvo = document.getElementById("mensagem-admin");
  alvo.innerHTML = `
    <div class="caixa-senha-temporaria">
      <strong>${titulo}</strong>
      <p>Senha temporária (mostrada só agora — anote e repasse à pessoa):</p>
      <span class="valor-senha">${senha}</span>
      <p style="margin-bottom:0;">Ela precisará trocar essa senha no primeiro acesso.</p>
    </div>
  `;
}

async function carregarUsuarios() {
  const tbody = document.getElementById("tabela-usuarios");
  try {
    const { usuarios } = await api("GET", "/api/admin/usuarios");
    tbody.innerHTML = "";
    usuarios.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.nomeCompleto}</td>
        <td>${u.usuario}</td>
        <td>${u.email}</td>
        <td><span class="badge ${u.tipo}">${u.tipo === "admin" ? "Administrador" : "Comum"}</span></td>
        <td class="acoes-tabela"></td>
      `;
      const acoesTd = tr.querySelector(".acoes-tabela");

      const botaoRedefinir = document.createElement("button");
      botaoRedefinir.className = "botao secundario pequeno";
      botaoRedefinir.textContent = "Redefinir senha";
      botaoRedefinir.addEventListener("click", async () => {
        document.getElementById("mensagem-admin").innerHTML = "";
        try {
          const resultado = await api("POST", `/api/admin/usuarios/${u.id}/redefinir-senha`);
          mostrarSenhaTemporaria(resultado.senhaTemporaria, `Nova senha para "${u.usuario}".`);
        } catch (e) {
          document.getElementById("mensagem-admin").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
        }
      });

      const botaoTipo = document.createElement("button");
      botaoTipo.className = "botao secundario pequeno";
      botaoTipo.textContent = u.tipo === "admin" ? "Rebaixar a comum" : "Promover a admin";
      botaoTipo.addEventListener("click", async () => {
        document.getElementById("mensagem-admin").innerHTML = "";
        try {
          await api("POST", `/api/admin/usuarios/${u.id}/tipo`, { tipo: u.tipo === "admin" ? "usuario" : "admin" });
          await carregarUsuarios();
        } catch (e) {
          document.getElementById("mensagem-admin").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
        }
      });

      const botaoExcluir = document.createElement("button");
      botaoExcluir.className = "botao perigo pequeno";
      botaoExcluir.textContent = "Excluir";
      botaoExcluir.addEventListener("click", async () => {
        if (!confirm(`Tem certeza que quer excluir "${u.usuario}"? Essa ação não pode ser desfeita.`)) return;
        document.getElementById("mensagem-admin").innerHTML = "";
        try {
          await api("DELETE", `/api/admin/usuarios/${u.id}`);
          await carregarUsuarios();
        } catch (e) {
          document.getElementById("mensagem-admin").innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
        }
      });

      acoesTd.append(botaoRedefinir, botaoTipo, botaoExcluir);
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="mensagem-erro">${e.message}</div></td></tr>`;
  }
}

iniciar();
