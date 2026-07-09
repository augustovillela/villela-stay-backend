# Manual do Colaborador — Villela Legal SaaS (administração)

A aba **⚖️💼 Legal SaaS** do Portal Staff administra a **plataforma** que vende o
Villela Legal a outros advogados e escritórios. Aqui você cuida do negócio:
escritórios assinantes (tenants), planos, cobrança, custo por cliente, suporte,
leads e logs.

**Três coisas que esta aba NÃO é:**

- Não é a aba **⚖️ Villela Legal** — aquele é o sistema jurídico **interno** do
  nosso escritório (processos, prazos, IA), com manual próprio.
- Não é o painel do assinante: o escritório cliente usa `/juridico/app` (landing
  de vendas em `/juridico`) e acessa o sistema jurídico dele pelo botão
  **⚖️ Meu Jurídico** de lá. Dúvidas de uso: central pública **`/juridico/ajuda`**.
- Não é o `/cliente-juridico` — esse é o portal dos **clientes finais** de um
  escritório, outra camada ainda.

A aba aparece para colaboradores com área **ceo** ou **ti**.

## 📊 Painel

1. Cartões de indicadores: **MRR**, **ARR**, **Custo do mês**, total de
   **Escritórios**, **Ativos**, **Em trial**, **Inadimplentes**,
   **Suspensos/cancelados**, **Trials expirando em 7 dias**, **Tickets abertos**
   e **Leads novos**. Valores que pedem atenção ganham borda de alerta.
2. **Por plano** — quantos escritórios ativos/trial existem em cada plano.
3. **🚩 Feature flags (catálogo global)** — flags do produto com o valor padrão.
   Elas são ligadas **por plano** (aba Planos) e podem ter **override por
   escritório** (detalhe do escritório).

## 🏢 Escritórios (os clientes da plataforma)

### Criar um escritório

1. Abra **➕ Novo escritório**.
2. Preencha **Nome do escritório** e **E-mail de acesso** (obrigatórios); CNPJ,
   **OAB seccional** (ex.: OAB/DF) e plano inicial são opcionais.
3. Toque em **Criar** — você cai no detalhe do escritório criado.

### Detalhe do escritório

Abra pelo botão **Abrir** da lista. No detalhe:

- **Plano**: escolha no seletor e toque em **Aplicar plano**. Se o escritório tem
  assinatura Mercado Pago ativa, aparece o aviso de que ele precisa **reassinar**
  para valer a nova cobrança.
- **Ativar / Suspender / Cancelar**: mudam o status (com confirmação). Suspenso/
  cancelado/inadimplente = acesso ao sistema jurídico bloqueado.
- **💵 Marcar pago**: registra pagamento manual (quando a cobrança não é
  automática pelo Mercado Pago).
- **🔑 Link de acesso**: gera o link para o e-mail do escritório **definir a
  senha** do painel `/juridico/app` (com validade). O link é copiado
  automaticamente para a área de transferência.
- **Uso do mês**: consumo real × limite do plano em cada recurso (advogados,
  processos ativos, consultas de IA etc.; 0 = ilimitado).
- **Módulos liberados** e **Flags**: o que o plano (mais overrides) entrega.
- **💰 Custo do mês**: custos lançados para o escritório por categoria (ia,
  armazenamento, infra, suporte, outro). Para lançar: categoria + valor em R$ +
  detalhe → **Lançar custo**.
- **⚙️ Overrides negociados**: JSON que sobrepõe limites e flags do plano só para
  este escritório (ex.: `{"processos_ativos":5000}`) → **Salvar overrides**.
- **Usuários**: logins do painel do assinante (nome, e-mail, papel, último
  acesso). Somente leitura.

## 💳 Planos

Números comerciais do produto — editáveis aqui:

1. Cada plano tem cartão e formulário próprios.
2. Edite **Nome**, **Preço/mês (R$)** e **Descrição**.
3. Ajuste os **limites** (0 = ilimitado).
4. Marque os **Módulos** (processos, prazos, publicações, audiências, documentos,
   IA, peças, portal do cliente etc.) e as **Flags** do plano.
5. **Plano ativo (aparece na landing)** — desmarque para tirar o plano da página
   pública `/juridico` sem apagá-lo.
6. **Salvar plano**.

Mudança de preço só alcança assinaturas MP já ativas quando o escritório
reassina.

## 💰 Custo/cliente

Tabela **custo × receita por escritório (mês atual)**: receita (preço do plano),
custo (lançamentos de IA/armazenamento/infra) e **margem** — margem negativa em
destaque. Use para achar cliente deficitário.

## 🎧 Suporte (tickets)

1. Lista dos chamados abertos pelos escritórios no painel deles: escritório,
   assunto, prioridade, status, última atualização.
2. **Abrir** mostra a conversa completa.
3. Escreva e toque em **Responder** — o escritório lê no `/juridico/app`.
4. Encerrou? **Marcar resolvido**.

## 📩 Leads

Lista (somente leitura) dos interessados da landing `/juridico`: data, nome,
escritório, e-mail, plano de interesse e status. Tratamento comercial por fora.

## 📜 Logs

1. **Eventos da plataforma** — últimos eventos automáticos (signup, cobrança,
   ciclo de vida).
2. **Auditoria administrativa** — quem fez o quê nesta administração (data,
   usuário, ação, detalhe).
3. **▶️ Rodar ciclo de vida agora (trial/dunning)** — executa na hora a rotina
   que vence trials e suspende inadimplentes (também roda sozinha
   periodicamente); um alerta resume o resultado.

## Boas práticas

1. Suspensão bloqueia o acesso do escritório inteiro na hora — verifique tickets
   abertos e avise o cliente antes.
2. Condição negociada (Enterprise) entra por **override** no detalhe do
   escritório, não como plano novo.
3. Cada escritório tem base de dados **isolada** — dados de um assinante nunca se
   misturam com os de outro nem com o jurídico interno da Villela.
