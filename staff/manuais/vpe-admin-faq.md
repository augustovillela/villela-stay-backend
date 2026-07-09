# Perguntas Frequentes — Villela Projects & Events (administração)

### Não vejo a aba 📋 Villela Projects no menu. Por quê?

A aba só aparece para usuários do Portal Staff com a área **ti** ou **ceo**
(ou administradores do portal). Peça ao administrador para liberar a área no
seu usuário. Ações de escrita (suspender, seed, preço) exigem admin.

### Qual a diferença entre esta aba e o /vpe/app?

Esta aba administra a **plataforma** (visão do dono do SaaS): empresas,
planos, leads e auditoria. O **/vpe/app** é o painel de cada empresa cliente,
com login próprio — os usuários do produto não são usuários do Portal Staff.
A central de ajuda do cliente é **/vpe/ajuda**.

### O que é o workspace marcado com 🏠 na lista de empresas?

É o **workspace interno da Villela**, com os 16 projetos do portfólio do
grupo. Ele não é um cliente: não pode ser suspenso (a tela nem mostra as
ações) e não passa por cobrança.

### Posso clicar de novo no botão "Semear workspace interno"?

Pode — o seed é **idempotente**: ele cria só o que faltar e não duplica
projetos. A resposta diz quantos projetos foram criados e o total.

### O seed mostrou uma senha. E se eu perdi essa senha?

A **senha inicial do dono** aparece **uma única vez**, na primeira criação do
workspace. Se o workspace já existia, o botão não mostra senha nenhuma — vale
a senha atual do dono. Perdeu o acesso? Trate a redefinição com a TI; não há
botão de reset nesta aba.

### Um cliente diz que não consegue entrar no produto. O que verifico?

Na sub-aba **🏢 Empresas**, abra o **Detalhe** da empresa: confira o
**status** (suspensa bloqueia o acesso), se o **trial expirou** e se o
usuário dele aparece na lista com status normal. Login do produto é em
**/vpe/login**; a central de ajuda dele é /vpe/ajuda.

### Como estendo o trial de uma empresa?

**🏢 Empresas → Detalhe**: informe os dias no campo "Estender trial" (padrão
15) e toque em **Estender**. A ação pede confirmação e fica registrada na
auditoria. Bom recurso quando a negociação comercial ainda está em andamento.

### Como suspendo (ou reativo) uma empresa?

No **Detalhe** da empresa, **⏸ Suspender** ou **▶ Reativar**, com
confirmação. O efeito é imediato no acesso do cliente. O workspace interno 🏠
é a exceção: não pode ser suspenso.

### Como troco o plano de uma empresa?

No **Detalhe**, escolha o plano no seletor (starter, professional, business
ou enterprise) e toque em **Aplicar**. A confirmação é pedida antes de
gravar.

### Como altero o preço de um plano?

Sub-aba **📦 Planos**: edite o campo de preço (valor em **centavos** — R$
149,00 = 14900) e toque em **Salvar preço**. Preço é decisão da direção —
alinhe antes de mudar.

### De onde vêm os leads e como acompanho?

Do formulário da landing pública **/vpe**. Na sub-aba **📥 Leads**, atualize o
andamento pelo seletor de status (novo, contactado, convertido, descartado) —
a mudança salva sozinha.

### Onde vejo quem suspendeu uma empresa ou estendeu um trial?

Sub-aba **📜 Auditoria** — eventos da plataforma com autor, data e entidade
afetada. A auditoria de cada empresa específica fica no detalhe dela.

### O número de "Projetos" na Visão inclui os projetos internos?

O cartão soma os projetos de toda a plataforma, e a coluna "Projetos" da
lista de empresas mostra o número por empresa — o workspace interno 🏠 entra
na contagem como qualquer outro tenant.
