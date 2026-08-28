# Minhas Ações

App para acompanhar cotações de ações da B3 (bolsa brasileira), com login, área de administração
e uma carteira de ações para cada pessoa. Roda **só no seu computador** por enquanto — publicar na
internet é um passo futuro.

## O que o app faz

- Pede usuário e senha para entrar. Sem login, não dá para ver nada.
- Cada pessoa tem sua própria carteira de ações (começa com PETR4, ITUB4 e VALE3) e pode
  adicionar ou remover ações à vontade.
- A página "Ações" mostra cards, gráfico comparativo e tabela com os preços reais, buscados
  direto na Yahoo Finance, com botões para escolher o período (1 mês, 3 meses, 6 meses, no ano,
  1 ano, máximo). Dá para baixar os dados em CSV.
- Só o administrador vê a página "Administração", onde é possível: ver todos os usuários, criar
  novos usuários, redefinir a senha de alguém, promover/rebaixar administrador e excluir usuários.
- Ninguém se cadastra sozinho — só o administrador cria contas.
- Toda senha fica guardada de forma criptografada (nem o próprio administrador consegue "ver" a
  senha de ninguém depois de criada).

## Antes de começar: o que já foi feito

- O Node.js (o programa que faz o servidor rodar) já foi instalado no seu computador.
- As dependências do app já foram instaladas (pasta `node_modules`).
- O arquivo `.env` já foi criado com um administrador inicial:
  - **Usuário:** `marceloibanez`
  - **Senha:** a que você me passou na conversa.
- Já testei tudo (login, administração, troca de senha, carteira, gráficos) rodando o servidor
  aqui mesmo — está funcionando. Agora é a sua vez de testar pela sua própria tela (roteiro mais
  abaixo).

> Se um dia você quiser trocar o usuário/senha do administrador inicial, edite o arquivo `.env`
> com o Bloco de Notas **e apague o arquivo `dados/dados.json`** antes da próxima vez que ligar o
> app — o administrador só é criado automaticamente quando não existe absolutamente ninguém
> cadastrado. Isso apaga também qualquer usuário e carteira já criados, então só faça isso se
> quiser realmente recomeçar do zero.

## Como abrir o app no dia a dia

1. Dê duplo clique no arquivo **`Iniciar o app.bat`**, nesta mesma pasta.
2. Vai abrir uma janela preta (o servidor) — não feche ela enquanto estiver usando o app. Alguns
   segundos depois, seu navegador abre sozinho em `http://localhost:3000`.
3. Se o navegador não abrir sozinho, abra você mesmo e digite `http://localhost:3000` na barra de
   endereço.
4. Para desligar o app, feche a janela preta (ou a janela do navegador, e depois a janela preta).

## Primeiro acesso

1. Na tela de entrada, digite o usuário e a senha do administrador (veja acima).
2. Você já pode usar o app normalmente. Se quiser, vá em **Minha conta** e troque a senha para uma
   só sua.

## Como criar um novo usuário (só o administrador vê essa tela)

1. Clique em **Administração**, no menu à esquerda.
2. Clique em **Criar usuário**.
3. Preencha nome completo, nome de usuário (sem espaços, ex: `mariasilva`) e e-mail. Clique em
   **Criar**.
4. Vai aparecer uma caixa amarela com uma **senha temporária** — isso só aparece nessa hora, uma
   única vez. Copie e envie para a pessoa (por WhatsApp, e-mail, etc.).
5. Quando a pessoa entrar com essa senha temporária, o app vai obrigá-la a criar uma senha nova
   antes de deixar ver qualquer outra coisa.

## "Esqueci minha senha" — como resolver

Não existe um link de "esqueci a senha" — quem resolve isso é você, o administrador:

1. Vá em **Administração**.
2. Encontre a pessoa na tabela e clique em **Redefinir senha**.
3. Aparece uma nova senha temporária na tela. Repasse para a pessoa.
4. Ela vai precisar criar uma senha nova no próximo login, igual no primeiro acesso.

## Promover, rebaixar e excluir usuários

Na tabela de **Administração**, cada linha tem botões:

- **Promover a admin / Rebaixar a comum**: troca o tipo do usuário. Você não consegue rebaixar o
  último administrador que sobrar — o app sempre exige pelo menos um.
- **Excluir**: remove o usuário e a carteira dele para sempre (pede confirmação antes). Você não
  consegue excluir a si mesmo.

## Onde ficam os dados guardados

Tudo fica no arquivo `dados/dados.json`, dentro da pasta do app: usuários, senhas (já
criptografadas) e carteiras. Fechar e abrir o app de novo não apaga nada. Se quiser fazer uma
cópia de segurança, basta copiar esse arquivo para outro lugar.

## Roteiro de teste (para você conferir com seus próprios olhos)

1. **Login:** abra o app, tente entrar com uma senha errada (deve aparecer uma mensagem de erro
   educada) e depois com a senha certa (deve entrar).
2. **Continuar logado:** aperte F5 na página. Você deve continuar logado, sem precisar entrar de
   novo.
3. **Ações:** clique em "Ações". Devem aparecer cards com preços reais, um gráfico e uma tabela.
   Clique nos botões de período (1 mês, 3 meses...) e veja o gráfico mudar.
4. **CSV:** clique em "Baixar CSV" e confira se um arquivo foi baixado com os dados da tabela.
5. **Minha carteira:** vá em "Minha carteira", adicione uma ação nova (ex: `BBAS3`), veja que ela
   aparece na lista, depois remova alguma ação e confirme que ela some. Tente adicionar um código
   que não existe (ex: `XPTO99`) e confira se aparece uma mensagem amigável, sem tela de erro feia.
6. **Minha conta:** troque sua própria senha e confira que precisa digitar a senha atual certa
   para conseguir.
7. **Administração:** crie um usuário de teste, copie a senha temporária mostrada, saia do app
   (**Sair**) e entre com esse novo usuário e a senha temporária. Confirme que o app **obriga**
   a trocar a senha antes de deixar ver qualquer página.
8. **Proteções de administrador:** tente excluir a si mesmo (deve barrar) e, se só existir um
   administrador, tente rebaixá-lo (deve barrar também).
9. **Sair:** clique em "Sair" e confirme que volta para a tela de login.

Se algum desses passos não se comportar como descrito, me avise contando exatamente o que
apareceu na tela.

## Problemas comuns e como resolver

**"node não é reconhecido..." apareceu na janela preta.**
Isso pode acontecer se o Windows ainda não "percebeu" que o Node.js foi instalado. Reinicie o
computador uma vez — depois disso o problema não deve voltar a acontecer, mesmo em outros
programas que usem Node.js.

**A janela preta fechou sozinha ou nunca abriu o navegador.**
Abra o navegador você mesmo e digite `http://localhost:3000`. Se ainda assim não funcionar, dê
duplo clique de novo em `Iniciar o app.bat` e me mande uma foto ou o texto que aparece na janela
preta.

**Apareceu "Já existe uma aplicação usando essa porta" ou o navegador não carrega nada.**
Provavelmente o app já estava aberto em outra janela. Feche todas as janelas pretas relacionadas
ao app e tente de novo.

**Uma ação aparece com uma mensagem de erro em vez do preço.**
Normal de vez em quando: pode ser o código digitado errado (confira, por exemplo, `WEGE3` e não
`WEGE33`) ou a Yahoo Finance momentaneamente fora do ar. Espere um pouco e recarregue a página.

**Uma mensagem de erro "feia", cheia de código em inglês, apareceu na tela.**
Isso não deveria acontecer — se acontecer, me avise com o máximo de detalhes (o que você clicou,
o que apareceu) para eu corrigir.

**Preciso ver o que já existia antes desta atualização.**
O app antigo (sem login, com dados fixos) ainda existe, guardado como `index-antigo-backup.html`
— dá para abrir com duplo clique normalmente, sem depender do servidor.

## E se eu quiser publicar isso na internet no futuro?

Dá para fazer, mas exige alguns cuidados extras (HTTPS, um lugar para hospedar o servidor,
proteções contra ataques automatizados) que não fazem sentido enquanto o app roda só no seu
computador. Quando chegar a hora, é só pedir.
