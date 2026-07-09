# Manual do Colaborador — Villela Projects & Events (administração)

A aba **📋 Villela Projects** do Portal Staff administra a **PLATAFORMA** do
Villela Projects & Events (SaaS de gestão de projetos e eventos): empresas
clientes (tenants), planos e preços, leads, auditoria — e o botão que cria o
workspace interno da Villela.

Não confunda com o produto em si: cada **empresa cliente** usa o próprio
painel em **/vpe/app** (landing pública em **/vpe**), com login e usuários
próprios — que **não** são usuários do Portal Staff. Dúvidas de uso do produto
pelo cliente ficam na central de ajuda pública **/vpe/ajuda**.

A aba aparece para quem tem a área **ti** ou **ceo** no Portal Staff (ações de
escrita exigem admin). Navegue pelas sub-abas no topo.

## 📊 Visão

1. Cartões com o retrato da plataforma: total de **empresas**, quantas em
   **trial**, **ativas**, o **MRR**, o total de **projetos** e os **leads
   novos**.
2. **🏠 Workspace interno Villela** — botão **Semear workspace interno
   (16 projetos)**:
   - Cria (ou completa) o workspace interno da Villela com os 16 projetos do
     portfólio. É **idempotente**: clicar de novo não duplica nada.
   - Na **primeira criação**, a resposta mostra a **senha inicial do dono**
     (augusto.villela@gmail.com) **uma única vez** — copie na hora. Se o
     workspace já existia, a mensagem avisa para usar a senha atual.
   - A resposta traz o link para entrar no painel (/vpe/login).

## 🏢 Empresas

Lista das empresas clientes: nome (o workspace interno aparece com 🏠),
e-mail de contato, slug, status, plano, usuários, projetos e data de criação.

### Detalhe de uma empresa

1. Toque em **Detalhe** na linha da empresa.
2. O cartão mostra status, plano, quantidade de projetos, **uso** (métricas
   consumidas), a data em que o **trial expira** (quando em trial) e a lista
   de **usuários** (nome, e-mail, papel, status).
3. Ações disponíveis (pedem confirmação):
   - **⏸ Suspender** / **▶ Reativar** — tira ou devolve o acesso da empresa.
   - **Trocar plano** — escolha starter, professional, business ou enterprise
     e toque em **Aplicar**.
   - **Estender trial** — informe o número de dias (padrão 15) e toque em
     **Estender**. Útil para negociação comercial em andamento.
4. O **workspace interno 🏠 não pode ser suspenso** — a tela nem mostra as
   ações para ele. É o portfólio da própria Villela.

## 📦 Planos

1. A tabela mostra cada plano com nome, descrição, preço mensal, limites e se
   está ativo (✅/⛔).
2. Para mudar um preço: edite o campo numérico — o valor é em **centavos**
   (ex.: R$ 149,00 = 14900) — e toque em **Salvar preço**.
3. Os limites exibidos na tabela são informativos; a definição de preços é da
   direção — não altere sem alinhamento.

## 📥 Leads

Contatos vindos do formulário da landing **/vpe**: data, nome, e-mail,
empresa e mensagem.

1. Atualize o andamento pelo seletor de status na própria linha:
   **novo → contactado → convertido → descartado**. A mudança salva sozinha.
2. Lead convertido vira empresa na sub-aba 🏢 quando fizer o cadastro/trial.

## 📜 Auditoria

Eventos da **plataforma** — ações do staff sobre o SaaS (suspensões, trocas de
plano, extensões de trial etc.), com quem fez, quando e a entidade afetada.
A auditoria de cada empresa fica no detalhe dela.

## Boas práticas

1. Suspender/reativar tem efeito imediato no acesso do cliente — confirme o
   caso antes.
2. Preços em **centavos** na sub-aba Planos; confira antes de salvar.
3. Trial vencendo e negociação em andamento? Use **Estender trial** no
   detalhe da empresa em vez de deixar o cliente ser bloqueado.
4. O botão de seed do workspace interno pode ser clicado sem medo (não
   duplica), mas a senha inicial só aparece na primeira vez — guarde-a com
   segurança e nunca cole em canal público.
5. Problema de uso relatado por cliente (login, projeto, tarefa): oriente a
   central pública **/vpe/ajuda** e verifique o status/trial da empresa na
   aba antes de escalar à TI.
