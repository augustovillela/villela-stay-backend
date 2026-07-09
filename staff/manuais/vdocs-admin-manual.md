# Manual do Colaborador — Villela Docs (administração)

A aba **🗂️ Villela Docs** do Portal Staff administra a **PLATAFORMA** do
Villela Docs Intelligence (SaaS de gestão documental): empresas clientes
(tenants), planos e preços, receita, leads, auditoria e saúde técnica.

Não confunda com o produto em si: cada **empresa cliente** usa o próprio
painel em **/vdocs/app** (landing pública em **/vdocs**), com login e usuários
próprios — que **não** são usuários do Portal Staff. Dúvidas de uso do produto
pelo cliente ficam na central de ajuda pública **/vdocs/ajuda**.

A aba aparece para quem tem a área **ti** ou **ceo** no Portal Staff (ações de
escrita, como suspender empresa ou mudar preço, exigem admin). Navegue pelas
sub-abas no topo.

## 📊 Visão

Cartões com o retrato da plataforma: total de **empresas**, quantas estão
**em trial**, **ativas** e **suspensas**, o **MRR**, o total de **usuários**
e os **leads novos**. É a primeira tela para saber "como está o SaaS hoje".

## 💰 Receita

1. Cartões: **MRR** (assinaturas ativas), **recebido no mês**, **trials
   expirando em 7 dias** e o total de assinaturas.
2. **⏳ Trials expirando** — empresas cujo período de teste vence na semana;
   bom gatilho para contato comercial antes do bloqueio.
3. **Assinaturas** — empresa, plano (com preço), status e se a cobrança é
   recorrente pelo Mercado Pago (✅) ou manual.
4. **Recebido por mês** — histórico de pagamentos.
5. **Custo de IA por empresa** — chamadas, tokens e custo estimado (centavos
   de USD) do uso de IA de cada cliente. Serve de insumo para calcular a
   margem por cliente.

## 🏢 Empresas

Lista das empresas clientes: nome, e-mail de contato, slug, status, plano,
número de usuários, fim do trial e data de criação.

### Detalhe de uma empresa

1. Toque em **Detalhe** na linha da empresa.
2. O cartão mostra o status, o plano atual e o **uso do mês** (métricas
   consumidas), a lista de **usuários** da empresa (nome, e-mail, papel,
   status) e a **auditoria recente** dela.
3. Ações disponíveis (pedem confirmação):
   - **⏸ Suspender** — a empresa **perde o acesso** ao produto na hora.
   - **▶ Reativar** — devolve o acesso a uma empresa suspensa.
   - **✖ Cancelar** — encerra a empresa (também perde o acesso).
   - **Trocar plano** — escolha starter, professional, business ou enterprise
     no seletor e toque em **Aplicar**.

Use suspensão para inadimplência ou abuso; cancelamento só quando o
encerramento for definitivo.

## 📦 Planos

1. A tabela mostra cada plano com nome, descrição, preço mensal, limites e se
   está ativo (✅/⛔).
2. Para mudar um preço: edite o campo numérico — o valor é em **centavos**
   (ex.: R$ 99,00 = 9900) — e toque em **Salvar preço**.
3. **Limites** (usuários, armazenamento etc.) não são editados nessa tela —
   a alteração é feita pela TI via API, justamente para evitar erro de
   digitação. Peça à TI quando precisar.

Mudança de preço vale para novas contratações; combine com a direção antes de
alterar.

## 📥 Leads

Contatos vindos do formulário da landing **/vdocs**: data, nome, e-mail,
empresa, telefone e mensagem.

1. Atualize o andamento pelo seletor de status na própria linha:
   **novo → contactado → convertido → descartado**. A mudança salva sozinha.
2. Lead convertido em cliente aparece depois na sub-aba Empresas (após o
   cadastro/trial).

## 📜 Auditoria

Eventos da **plataforma** — ações do staff sobre o SaaS (suspensões, mudanças
de plano/preço etc.), com quem fez, quando e a entidade afetada. A auditoria
interna de cada empresa (ações dos usuários dela) fica no **detalhe da
empresa**, na sub-aba 🏢.

## 🩺 Saúde

Painel técnico da plataforma (cartões ficam em alerta quando há problema):

1. **Jobs**: aguardando, com erro e OCR pendente — fila de processamento de
   documentos.
2. **Webhooks**: pendentes e com erro nas últimas 24 h.
3. **IA**: erros nas últimas 24 h e custo total.
4. **Volumes**: documentos, tamanho do banco e do storage (MB).
5. **Últimas falhas de extração** — documento, erro e quando ocorreu. Sem
   falhas, a tela mostra ✅.

Se aparecerem erros recorrentes de jobs/webhooks, avise a TI com o print da
tela.

## Boas práticas

1. Antes de suspender ou cancelar uma empresa, confirme o caso — o cliente
   perde o acesso imediatamente.
2. Preços em **centavos** na sub-aba Planos; confira duas vezes antes de
   salvar.
3. Trial vencendo? Antecipe o contato comercial pela lista da sub-aba Receita.
4. Problema de uso relatado por cliente (login, documento, busca): oriente a
   central pública **/vdocs/ajuda** e verifique na aba o status da empresa
   (suspensa ou trial vencido bloqueiam o produto) antes de escalar à TI.
