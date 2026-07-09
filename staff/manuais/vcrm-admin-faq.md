# Perguntas Frequentes — Villela CRM (administração)

### Não vejo a aba 🤝 Villela CRM. Por quê?

Ela aparece para colaboradores com área **ti**, **ceo** ou **vendas**. Peça a um
administrador do Portal Staff para revisar as suas áreas.

### Qual a diferença entre a aba 🤝 Villela CRM e a aba 📈 CRM / Funil?

São coisas diferentes. A **📈 CRM / Funil** é o CRM interno legado da Villela
Stay (nossos próprios leads de hospedagem). A **🤝 Villela CRM** administra o
**produto SaaS** Villela CRM, vendido a outras empresas: assinantes, planos,
leads da landing e tickets. As duas convivem — nada do legado foi removido.

### Onde o cliente usa o CRM de verdade (Kanban, contatos, propostas)?

No painel do assinante, em **`/crm/app`** (atalho no topo da aba). Esta aba do
staff é só a administração da plataforma. Dúvidas de uso: **`/crm/ajuda`**.

### Como cadastro uma empresa assinante?

**➕ Nova empresa assinante** → Nome e E-mail do owner (obrigatórios), slug e
plano opcionais → **Criar empresa**. Depois gere o **🔑 Link acesso** para o
owner definir a senha.

### O cliente não consegue entrar no /crm/app. O que verifico?

1. Status da empresa na tabela (suspensa/cancelada/inadimplente bloqueia);
2. Se ele está usando o e-mail do owner cadastrado;
3. Se o link de definição de senha não venceu (validade de **7 dias**) — gere um
   novo em **🔑 Link acesso**.

### Como suspendo uma empresa?

Na linha da empresa, seletor de **status** → `suspensa`. A mudança vale na hora.
Para reativar, escolha `ativa` no mesmo seletor.

### Como mudo o plano de uma empresa?

Na linha da empresa, seletor de **plano** → escolha o novo (trial, starter,
professional, business, enterprise). É aplicado imediatamente.

### Escolhi o status/plano errado no seletor. E agora?

Sem pânico: escolha o valor correto no mesmo seletor — a alteração é imediata e
reversível.

### Para que serve o botão "Importar CRM legado → tenant villela-stay"?

Migra os contatos do CRM interno (📈) para dentro do produto, no tenant da
Villela Stay. Duplicados são mesclados e leads em estágio aberto viram
oportunidades no funil de hospedagem. Pode rodar mais de uma vez sem duplicar.

### A importação deu erro dizendo que o tenant não existe. O que faço?

Crie primeiro a empresa com slug exatamente **`villela-stay`** no formulário
➕ Nova empresa assinante e rode a importação de novo.

### Importar o legado apaga a aba 📈 CRM / Funil?

Não. O CRM legado continua funcionando normalmente; a importação só copia os
contatos para o produto.

### De onde vêm os leads listados na aba?

Do formulário da landing pública `/crm`. A lista mostra os 15 mais recentes e é
somente leitura — o contato comercial é feito por fora.

### Onde respondo os tickets dos assinantes?

Nesta aba os tickets aparecem como lista de acompanhamento (empresa, assunto,
status). O tratamento é feito no fluxo de suporte da plataforma; use a lista para
saber o que está aberto.

### Posso informar preços dos planos ao cliente?

Os preços são geridos e editáveis pela administração da plataforma. Confirme o
valor vigente antes de citar — não prometa condições fora do que está
configurado.
