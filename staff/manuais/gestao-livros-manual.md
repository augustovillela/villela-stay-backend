# Manual do Colaborador — Gestão de Livros (Livraria Villela)

A aba **📚 Gestão de Livros** administra a loja pública de livros
(livros.villelastay.com.br): catálogo, pedidos, clientes, cupons, impressos e
relatórios. Dentro dela há sub-abas — você só vê as liberadas pelo seu **papel na
livraria** (admin, editor, financeiro, suporte ou logística), definido pelo
administrador na sub-aba Equipe.

## 📊 Painel

Visão geral da loja:

1. Cartões com os números do momento: receita paga, pedidos pagos, ticket médio,
   pedidos pendentes, downloads, impressos pendentes e reembolsos.
2. **🏆 Mais vendidos** — títulos com mais itens vendidos e a receita de cada um.
3. **⚠️ Pedidos problemáticos** — pedidos que merecem atenção (status de pagamento,
   entrega digital ou impresso com pendência). Clique no número do pedido para abrir.
4. **🎟️ Cupons usados** — códigos aplicados e o desconto concedido.

## 📕 Livros

### Cadastrar ou editar um livro

1. Toque em **➕ Novo livro** (ou em **Editar** na linha de um livro existente).
2. Preencha os campos:
   - **Título** (obrigatório), subtítulo, autor, **slug** (endereço na loja — deixe
     vazio para gerar automaticamente) e categoria.
   - **Descrição curta** (vitrine/SEO) e **descrição longa** (página de venda),
     "para quem é" e sumário.
   - **Benefícios, bônus, depoimentos e FAQ** — campos em formato JSON, seguindo o
     exemplo mostrado no rótulo de cada um.
   - **Preços** de PDF, impresso e combo (só aparecem para quem tem permissão de
     preços; em reais, vazio = formato não vendido).
   - URL da capa, SEO título e SEO descrição.
   - **Ativo** (aparece na loja) e **Destaque**.
3. Toque em **💾 Salvar**.

### PDF privado do livro

O arquivo do livro nunca fica público — o cliente recebe um link seguro após pagar.

1. Com o livro salvo, use a seção **📄 PDF privado**: escolha o arquivo e toque em
   **⬆️ Enviar PDF**.
2. Cada envio cria uma **versão**; a lista mostra qual está ativa. Use **Tornar
   ativo** para trocar a versão entregue aos clientes.

**Excluir** um livro (botão 🗑️ na edição) não afeta pedidos já feitos.

## 🧾 Pedidos

1. Filtre por **Todos / Pendentes / Pagos / Reembolsados** nos botões do topo.
2. Toque em **Ver** para abrir o pedido: dados do cliente, itens, subtotal,
   desconto (com o cupom usado) e total.
3. Ações disponíveis conforme o status:
   - **✅ Marcar pago (manual)** — para pagamento confirmado fora do fluxo
     automático. A confirmação normal chega sozinha pelo webhook do meio de
     pagamento; use o manual só quando tiver certeza do recebimento.
   - **📧 Reenviar link** — gera e envia um novo link de download do PDF
     (os links antigos param de funcionar).
   - **🔒 Bloquear acesso / 🔓 Reativar acesso** — corta ou devolve o acesso ao
     download (ex.: suspeita de fraude ou chargeback).
   - **↩️ Reembolsar** — registra o reembolso e bloqueia o acesso ao PDF
     (pede confirmação).
4. A seção **⬇️ Downloads** mostra cada tentativa de download (quando, resultado,
   IP) e o uso dos tokens (ex.: 2/5 downloads). Se o pedido tem item impresso,
   a seção **📦 Impressos** mostra o status de produção/envio.

## 👥 Clientes

1. Busque por nome, e-mail ou WhatsApp e toque em **Ver**.
2. A ficha traz os dados de contato, um campo de **observações internas**
   (registre atendimentos — toque em 💾 Salvar) e o histórico de **compras**,
   com atalho para abrir cada pedido.

## 🎟️ Cupons

1. No bloco **Novo cupom**: informe o **código**, o tipo (**%** ou **R$ fixo**),
   o **valor**, o **limite de usos** (0 = ilimitado) e a **validade** (opcional).
2. Toque em **➕ Criar**.
3. Na tabela, acompanhe os usos e use **Desativar/Ativar** ou **🗑️** para excluir.

## 📦 Impressos

Fila dos livros impressos vendidos, um card por trabalho, com o livro e o
cliente/cidade de destino.

1. Atualize o **status** conforme o andamento: aguardando produção → enviado à
   gráfica → em produção → enviado → entregue (ou cancelado).
2. Preencha **Fornecedor**, **Rastreio** e os custos de **impressão** e **frete**.
3. Toque em **💾** para salvar o card.

## 📈 Relatórios

Exportações em CSV (abrem no Excel/Planilhas) com vendas, receita, ticket médio e
mais vendidos: **📥 Diário**, **📥 Semanal** e **📥 Mensal**.

## 🔔 Webhooks/Logs

Tela de consulta para diagnosticar entregas e pagamentos:

- **🔗 Webhooks (Mercado Pago)** — eventos de pagamento recebidos, se já foram
  processados e o resultado.
- **📨 Notificações** — e-mails/WhatsApp/integrações disparados pela loja
  (destino, assunto e status).

Se um cliente diz que pagou e não recebeu, comece por aqui: veja se o evento de
pagamento chegou e se a notificação de entrega saiu.

## 📜 Auditoria

Registro das ações sensíveis na livraria (quem fez o quê e quando): criação e
edição de livros, mudanças de preço, reenvio de link, mudanças de status etc.
Somente consulta.

## ⚙️ Equipe (só admin)

Define o **papel funcional** de cada usuário do portal dentro da livraria:

- **admin** — vê tudo;
- **editor** — livros e preços;
- **financeiro** — preços, pedidos, clientes e cupons;
- **suporte** — pedidos e clientes;
- **logística** — pedidos e impressos.

Troque o papel no seletor da linha do usuário. Além do papel, o usuário precisa
ter a área **Livraria** liberada no cadastro de usuários do portal para a aba
📚 aparecer no menu dele.
