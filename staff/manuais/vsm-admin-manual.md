# Manual do Colaborador — Villela Stay Manager (administração)

A aba **🏨 Stay Manager** do Portal Staff administra a **plataforma** Villela Stay
Manager — o SaaS que vende o sistema de gestão de hospedagem por temporada a outros
anfitriões e gestores. Aqui você cuida do negócio: operações (clientes/tenants),
planos, cobrança, custo por cliente, suporte, leads e logs.

**Não confunda com o produto em si**: o assinante usa o painel público dele em
`/gestao/app` (landing de vendas em `/gestao`). Dúvidas de USO do produto pelo
cliente são respondidas pela central de ajuda pública **`/gestao/ajuda`** — este
manual é só da administração.

A aba aparece para colaboradores com área **ti** ou **ceo**.

## 📊 Painel

Visão executiva da plataforma:

1. Cartões de indicadores: **MRR**, **ARR**, **Custo do mês**, total de
   **Operações**, **Ativas**, **Em trial**, **Inadimplentes**,
   **Suspensas/canceladas**, **Trials expirando em 7 dias**, **Tickets abertos** e
   **Leads novos**. Cartões com valor de atenção ficam com borda de alerta.
2. **Por plano** — quantas operações ativas/trial existem em cada plano.
3. **🚩 Feature flags (catálogo global)** — lista das flags do produto com o valor
   padrão. As flags são ligadas/desligadas **por plano** (aba Planos) e podem ter
   **override por operação** (detalhe da operação).

## 🏨 Operações (os clientes da plataforma)

Cada "operação" é um tenant: um anfitrião/gestor que assina o produto.

### Criar uma operação

1. Abra **➕ Nova operação**.
2. Preencha **Nome da operação** e **E-mail de acesso** (obrigatórios); CNPJ, site
   ou perfil (ex.: link do Airbnb) e o **plano** inicial são opcionais.
3. Toque em **Criar** — você cai direto no detalhe da operação criada.

### Detalhe da operação

Abra qualquer operação pelo botão **Abrir** da lista. No detalhe você tem:

- **Plano**: escolha no seletor e toque em **Aplicar plano** (upgrade ou
  downgrade). Se a operação tem assinatura Mercado Pago ativa, aparece o aviso de
  que ela precisa **reassinar** para valer a nova cobrança.
- **Ativar / Suspender / Cancelar**: mudam o status do tenant (com confirmação).
  Suspensa/cancelada/inadimplente = entrega bloqueada no produto.
- **💵 Marcar pago**: registra pagamento manual (usado quando a cobrança não é
  automática pelo Mercado Pago).
- **🔑 Link de acesso**: gera o link para o e-mail do cliente **definir a senha**
  do painel `/gestao/app` (com validade). O link é copiado automaticamente para a
  área de transferência — envie ao cliente pelo canal combinado.
- **Uso do mês**: consumo real × limite de cada recurso do plano (0 = ilimitado).
- **Módulos liberados** e **Flags**: o que o plano (mais overrides) entrega.
- **💰 Custo do mês**: lançamentos de custo da operação por categoria (ia,
  armazenamento, infra, canais, suporte, outro). Para lançar: escolha a categoria,
  informe o valor em R$ e um detalhe, e toque em **Lançar custo**.
- **⚙️ Overrides negociados**: JSON opcional que sobrepõe limites e flags do plano
  para ESTA operação (ex.: Enterprise negociado). Exemplo de limites:
  `{"imoveis":100}`. Toque em **Salvar overrides**.
- **Usuários**: quem tem login no painel do assinante (nome, e-mail, papel e
  último acesso). Somente leitura.

## 💳 Planos

Os planos são os números comerciais do produto — tudo editável aqui:

1. Cada plano tem um cartão com formulário próprio.
2. Edite **Nome**, **Preço/mês (R$)** e **Descrição**.
3. Ajuste os **limites** numéricos (0 = ilimitado).
4. Marque os **Módulos** que o plano entrega (imóveis, reservas, canais, limpeza,
   manutenção, financeiro etc.) e as **Flags** (recursos especiais).
5. **Plano ativo (aparece na landing)** — desmarque para tirar o plano da página
   pública `/gestao` sem apagar nada.
6. Toque em **Salvar plano**.

Mudança de preço em plano com assinaturas Mercado Pago ativas só passa a valer
quando cada operação reassina.

## 💰 Custo/cliente

Tabela **custo × receita por operação (mês atual)**: receita (preço do plano),
custo (soma dos lançamentos de custo) e **margem** — margem negativa aparece em
destaque de alerta. Use para identificar cliente que custa mais do que paga.

## 🎧 Suporte (tickets)

1. A lista mostra os chamados abertos pelas operações no painel delas: operação,
   assunto, prioridade, status e última atualização.
2. Toque em **Abrir** para ver a conversa completa (mensagens da operação e da
   plataforma).
3. Escreva no campo e toque em **Responder** — o cliente vê a resposta no painel
   `/gestao/app` dele.
4. Resolvido? Toque em **Marcar resolvido**.

## 📩 Leads

Lista (somente leitura) dos interessados que preencheram o formulário da landing
`/gestao`: data, nome, operação, e-mail, plano de interesse e status. O
tratamento comercial (contato, proposta) é feito fora desta aba.

## 📜 Logs

1. **Eventos da plataforma** — últimos eventos automáticos (signup, cobrança,
   ciclo de vida etc.).
2. **Auditoria administrativa** — quem fez o quê na administração (data, usuário,
   ação, detalhe). Toda ação sua aqui fica registrada.
3. **▶️ Rodar ciclo de vida agora (trial/dunning)** — executa na hora a rotina que
   vence trials expirados e suspende inadimplentes; o resumo aparece num alerta.
   A rotina também roda sozinha periodicamente — o botão é para não esperar.

## Boas práticas

1. Antes de suspender ou cancelar uma operação, confira os tickets abertos dela e
   avise o cliente — suspensão bloqueia o acesso ao produto na hora.
2. Alterou plano/limite negociado por fora? Registre pelo campo de **overrides**,
   não criando plano novo, para o catálogo público continuar limpo.
3. Lance os custos por cliente no mês em que ocorrem — a aba Custo/cliente só é
   útil se os lançamentos estiverem em dia.
