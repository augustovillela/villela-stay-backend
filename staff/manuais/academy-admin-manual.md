# Manual do Colaborador — Villela Academy (administração)

A aba **🎓 Villela Academy** do Portal Staff administra a **PLATAFORMA** do
marketplace de cursos e produtos digitais: aqui você aprova produtores e
produtos, acompanha vendas e assinaturas, paga comissões de afiliados, atende
tickets, modera conteúdo e ajusta a configuração comercial.

Não confunda com o painel público: **alunos, produtores e afiliados** usam o
painel deles em **/academy/app** (site: academia.villelastay.com.br). Dúvidas
de uso do produto pelo cliente ficam na central de ajuda pública
**/academy/ajuda** — este manual é só da administração.

A aba aparece para quem tem a área **ti** ou **ceo** no Portal Staff (ou é
administrador do portal). Dentro dela, navegue pelos botões de sub-aba no topo.

## 📊 Painel

Visão geral do marketplace:

1. Cartões com os números do momento: **GMV**, **Receita plataforma**, **MRR**,
   vendas, assinaturas ativas, matrículas ativas, usuários, produtores,
   afiliados e produtos publicados.
2. Cartões de atenção (borda de alerta quando maior que zero): **Em revisão**
   (produtos aguardando você), **Perfis em análise**, **Reembolsos**,
   **Tickets abertos** e **Leads novos**.
3. **📈 Últimos 6 meses** — série mensal de GMV, receita, vendas, novos
   usuários e matrículas, além de conversão de pedidos, churn do mês e
   certificados emitidos.
4. No rodapé, links para o site público, o marketplace (/academy/marketplace)
   e o painel do usuário (/academy/app).

## ✅ Aprovações

Duas filas na mesma tela:

### Perfis aguardando análise (produtores e afiliados)

1. Confira nome, e-mail, tipo (produtor ou afiliado), nome público e a data
   do pedido.
2. Toque em **Aprovar** para liberar o papel, ou em **Rejeitar** — a rejeição
   pede um **motivo**, e o solicitante **vê esse texto**. Escreva de forma
   educada e objetiva.

### Produtos aguardando revisão editorial

1. A lista mostra título, produtor, tipo e preço de cada produto enviado
   para revisão.
2. Toque em **Aprovar** para permitir a publicação, ou em **Rejeitar** com
   motivo (o produtor vê). Revise o conteúdo no marketplace/painel antes de
   aprovar — o produtor não consegue aprovar o próprio produto.

## 🧾 Pedidos

1. O topo resume GMV, receita da plataforma, vendas, pedidos pendentes e
   reembolsos.
2. A tabela lista os últimos pedidos: produto, comprador, valor (ou "grátis"),
   tipo (avulsa/assinatura), status e data.
3. **↩️ Reembolsar** aparece só em pedido **pago com valor**: informe o motivo
   (obrigatório). O reembolso **estorna no Mercado Pago e revoga o acesso** do
   comprador ao produto — a comissão de afiliado ligada à venda é cancelada.
   Confirme a política de reembolso antes de executar.

## 🔁 Assinaturas

1. O topo mostra quantas assinaturas estão ativas e o MRR.
2. A tabela lista clube, assinante, mensalidade, status e data de início.
3. **Cancelar** aparece para assinaturas ativas, pausadas ou pendentes — o
   cancelamento é **imediato**: o assinante perde o acesso na hora. Use com
   critério (inadimplência já pausa sozinha pelo Mercado Pago).

## 💸 Comissões

Comissões de afiliados seguem o ciclo: **pendente** (prazo de garantia) →
**disponível** (pode pagar) → **paga** (repasse feito). Reembolso/chargeback
cancela a comissão.

1. A tabela mostra afiliado, produto, valor (com o % aplicado), status e a
   data em que libera.
2. Quando o status for **disponível**, faça o repasse por **Pix, manualmente**,
   e só então toque em **💸 Marcar paga** — o botão pede confirmação de que a
   transferência já foi feita. Nunca marque antes de transferir.

## 🎧 Suporte

1. A lista mostra os tickets com assunto, autor, categoria, status e última
   atualização. Toque em **Abrir** para ver a conversa.
2. Dentro do ticket, escreva a resposta e toque em **Responder** — o usuário
   recebe a resposta na notificação (sininho 🔔) do painel dele.
3. Resolvido? Toque em **Fechar ticket**. Use **← Voltar** para retornar à lista.

## 🚩 Moderação

### Denúncias abertas

1. Cada denúncia mostra o produto, o motivo e a descrição de quem denunciou.
2. Avalie o produto e escolha **Resolver** (procedente, você tomou providência)
   ou **Descartar** (improcedente). Nos dois casos é pedida uma **resolução**,
   que fica registrada.

### Avaliações

1. A tabela lista produto, aluno, nota, texto e status de cada avaliação.
2. **Ocultar** tira do ar uma avaliação ofensiva ou irregular; **Republicar**
   devolve uma avaliação ocultada. Não edite opinião legítima só por ser
   negativa.

## 📩 Leads

Lista de contatos vindos da landing e das páginas de venda (interesse em
compra, parceria etc.): data, nome, e-mail, interesse, mensagem e status.
Esta tela é **somente leitura** — o acompanhamento comercial é feito fora
da aba.

## ⚙️ Config

1. **Comissões**: campos Plataforma (%), Afiliado padrão (%) e Cookie de
   atribuição (dias). Altere e toque em **Salvar**. Os percentuais oficiais
   são decisão da direção (fonte: regras de negócio) — **não mude por conta
   própria**. Pedidos antigos guardam o percentual da época, então a mudança
   só vale para vendas futuras.
2. **Rotinas**: o botão **▶️ Processar pedidos abandonados agora** dispara na
   hora o lembrete por e-mail para pedidos pendentes (a rotina também roda
   sozinha de tempos em tempos). Ao final, aparece quantos lembretes saíram.

## 📜 Logs

Três blocos, só de consulta:

1. **📜 Auditoria** — quem fez o quê na plataforma (aprovações, config,
   reembolsos etc.), com data e detalhe.
2. **📨 Comunicações** — e-mails, webhooks de saída e notificações internas
   enviados pelo sistema, com template e status. Primeiro lugar para conferir
   "o e-mail saiu?".
3. **🤖 IA** — consultas dos agentes de IA do produto, com modelo, tokens e
   custo estimado (em USD). Serve para acompanhar o consumo.

## Boas práticas

1. Rejeições (perfil ou produto) sempre com motivo claro — o texto chega ao
   solicitante.
2. Reembolso e cancelamento de assinatura são irreversíveis na prática:
   confirme o caso antes.
3. Comissão só vira "paga" depois do Pix real.
4. Problema de uso do cliente (login, aula, certificado)? Aponte primeiro a
   central pública **/academy/ajuda** e o painel **/academy/app**; abra a
   investigação pela aba só se o problema persistir.
