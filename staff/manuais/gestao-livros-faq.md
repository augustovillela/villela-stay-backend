# Perguntas Frequentes — Gestão de Livros (Livraria Villela)

### Não vejo a aba 📚 Gestão de Livros (ou vejo poucas sub-abas). Por quê?

O acesso tem duas camadas: a área **Livraria** liberada no seu usuário do portal
(faz a aba aparecer) e o **papel funcional** na livraria (define as sub-abas —
editor, financeiro, suporte, logística ou admin). Peça ao administrador para
ajustar o que faltar.

### Cadastrei um livro e ele não aparece na loja. O que confiro?

Três coisas na edição do livro: se **Ativo** está marcado, se há **preço**
preenchido em pelo menos um formato (PDF, impresso ou combo) e se o **PDF privado**
foi enviado (para venda digital). Sem preço, o formato não é vendido.

### Como troco o arquivo PDF de um livro já publicado?

Na edição do livro, seção **📄 PDF privado**: envie o novo arquivo (vira uma nova
versão) e toque em **Tornar ativo** nela. Os próximos downloads passam a entregar
a versão ativa.

### O cliente pagou e não recebeu o link do livro. O que faço?

Abra o pedido na sub-aba **🧾 Pedidos**. Se o status já está "pago", use
**📧 Reenviar link** — um novo link é gerado e enviado (os antigos deixam de
funcionar). Se ainda está "pendente", confira em **🔔 Webhooks/Logs** se o evento
de pagamento chegou.

### Quando devo usar "Marcar pago (manual)"?

Só quando o pagamento foi confirmado fora do fluxo automático (ex.: transferência
combinada diretamente) e você tem certeza do recebimento. No fluxo normal, o
pedido vira "pago" sozinho quando o meio de pagamento confirma.

### O link de download expira?

Sim — cada link tem validade e limite de downloads. Na tela do pedido, a seção
Downloads mostra o uso (ex.: 2/5) e cada tentativa registrada. Se o cliente
estourou o limite por motivo legítimo, reenvie o link.

### Como bloqueio o download em caso de chargeback ou fraude?

Na tela do pedido, use **🔒 Bloquear acesso**. O cliente para de conseguir baixar
o PDF. Dá para reverter depois com **🔓 Reativar acesso**. O **↩️ Reembolsar**
também bloqueia o acesso automaticamente.

### Como crio um cupom de desconto?

Sub-aba **🎟️ Cupons**: informe o código, escolha % ou valor fixo em R$, o valor,
o limite de usos (0 = ilimitado) e a validade se quiser. O cliente digita o
código no checkout da loja.

### Chegou um pedido com livro impresso. Qual é o meu fluxo?

Ele entra na sub-aba **📦 Impressos**. Atualize o status a cada etapa
(aguardando produção → enviado à gráfica → em produção → enviado → entregue),
preencha fornecedor, código de rastreio e os custos, e salve com **💾**.

### Onde anoto um atendimento feito a um cliente da loja?

Na ficha do cliente (sub-aba **👥 Clientes** → Ver), no campo **Observações
internas**. É interno da equipe — o cliente não vê.

### Como tiro um relatório de vendas para fechar o mês?

Sub-aba **📈 Relatórios**: baixe o CSV **Mensal** (há também diário e semanal).
O arquivo abre no Excel/Planilhas com vendas, receita, ticket médio e mais
vendidos.

### O que são os "pedidos problemáticos" do Painel?

Pedidos com alguma pendência que merece olhar humano — pagamento não concluído,
entrega digital com problema ou impresso travado. Clique no número do pedido
para abrir e resolver.

### Excluir um livro apaga os pedidos dele?

Não. A exclusão tira o livro do catálogo, mas os pedidos já feitos continuam
íntegros, com o título gravado no item do pedido.

### Alterei um preço. Isso fica registrado em algum lugar?

Sim. Mudanças de preço, criação/edição de livros, reenvio de link e outras ações
sensíveis entram na sub-aba **📜 Auditoria**, com quem fez e quando.
