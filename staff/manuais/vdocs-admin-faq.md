# Perguntas Frequentes — Villela Docs (administração)

### Não vejo a aba 🗂️ Villela Docs no menu. Por quê?

A aba só aparece para usuários do Portal Staff com a área **ti** ou **ceo**
(ou administradores do portal). Peça ao administrador para liberar a área no
seu usuário. Ações de escrita (suspender, mudar preço) exigem admin.

### Qual a diferença entre esta aba e o /vdocs/app?

Esta aba administra a **plataforma** (visão do dono do SaaS): empresas,
planos, receita e saúde. O **/vdocs/app** é o painel de cada empresa cliente,
com login próprio — os usuários do produto não são usuários do Portal Staff.
A central de ajuda do cliente é **/vdocs/ajuda**.

### Um cliente diz que não consegue entrar no produto. O que verifico?

Na sub-aba **🏢 Empresas**, abra o **Detalhe** da empresa dele e confira:
o **status** (suspensa ou cancelada bloqueia o acesso), se o **trial venceu**
(o produto bloqueia e a tela do cliente avisa) e se o **usuário** dele aparece
na lista com status normal. Se tudo estiver certo, oriente a central
/vdocs/ajuda e escale à TI.

### Como suspendo (ou reativo) uma empresa?

**🏢 Empresas → Detalhe → ⏸ Suspender** (ou **▶ Reativar**). A ação pede
confirmação e vale na hora: empresa suspensa perde o acesso imediatamente.

### Qual a diferença entre suspender e cancelar?

Suspender é reversível — use para inadimplência ou abuso, e reative depois.
Cancelar encerra a relação com a empresa; use só quando o encerramento for
definitivo. As duas tiram o acesso do cliente.

### Como troco o plano de uma empresa?

No **Detalhe** da empresa, escolha o plano no seletor (starter, professional,
business ou enterprise) e toque em **Aplicar**. A confirmação é pedida antes
de gravar.

### O trial de um cliente está vencendo. O que faço?

A sub-aba **💰 Receita** lista os **trials expirando em 7 dias** — use como
gatilho de contato comercial. Vencido o trial, o produto bloqueia até a
contratação de um plano. A aba não tem botão de estender trial; casos
excepcionais, trate com a TI.

### Como altero o preço de um plano?

Sub-aba **📦 Planos**: edite o campo de preço (valor em **centavos** — R$
249,00 = 24900) e toque em **Salvar preço**. Alinhe com a direção antes; a
mudança vale para novas contratações.

### E os limites do plano (usuários, armazenamento)?

Não são editáveis por essa tela — a própria aba avisa que limites são
alterados pela TI via API, para evitar erro de digitação. Peça à TI.

### De onde vêm os leads e como acompanho?

Do formulário da landing pública **/vdocs**. Na sub-aba **📥 Leads**, atualize
o andamento pelo seletor de status (novo, contactado, convertido, descartado)
— a mudança salva sozinha.

### O que é o "Custo de IA por empresa" na Receita?

O custo estimado (em centavos de USD) das chamadas de IA que cada empresa fez
no produto, com chamadas e tokens. Serve para calcular a margem por cliente —
não é cobrança ao cliente.

### Para que serve a sub-aba 🩺 Saúde?

É o painel técnico: fila de processamento de documentos (jobs/OCR), webhooks
pendentes ou com erro, erros de IA nas últimas 24 h, volumes (documentos,
banco, storage) e as últimas falhas de extração. Erros recorrentes → avise a
TI com um print.

### Onde vejo quem suspendeu uma empresa ou mudou um preço?

Sub-aba **📜 Auditoria** — eventos da plataforma com autor, data e entidade.
As ações dos usuários de uma empresa específica ficam na auditoria do
**Detalhe** dela, na sub-aba Empresas.

### O MRR da Visão não bate com o que caiu no banco. Está errado?

Não necessariamente: o **MRR** soma as assinaturas ativas (receita
recorrente contratada); o **recebido no mês** (sub-aba Receita) mostra o que
de fato entrou. Diferenças vêm de trials, inadimplência e datas de cobrança.
