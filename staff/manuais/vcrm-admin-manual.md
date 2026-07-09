# Manual do Colaborador — Villela CRM (administração)

A aba **🤝 Villela CRM** do Portal Staff administra a **plataforma** Villela CRM —
o produto SaaS de CRM inteligente multicanal vendido a outras empresas. Aqui você
gerencia as empresas assinantes (tenants), planos, leads da landing e tickets.

**Duas confusões para evitar:**

- Esta aba **não é o CRM de uso**. O funil Kanban, contatos, propostas e
  campanhas ficam no painel do **assinante**, em `/crm/app` (landing de vendas em
  `/crm`). Dúvidas de uso do produto: central de ajuda pública **`/crm/ajuda`**.
- Esta aba **não é a aba 📈 CRM / Funil** do Portal Staff. A 📈 é o CRM **interno
  legado** da Villela Stay (leads de hospedagem do nosso próprio negócio) e
  continua funcionando normalmente. A 🤝 administra o **produto** Villela CRM.

A aba aparece para colaboradores com área **ti**, **ceo** ou **vendas**.

## Barra de atalhos

No topo da aba:

1. **🌐 Landing /crm** — abre a página pública de vendas do produto.
2. **🖥️ Painel do assinante** — abre `/crm/app` (o app que o cliente usa).
3. **⬆ Importar CRM legado → tenant villela-stay** — ver a seção de importação.

## Cartões de resumo

Números da plataforma: **Empresas** (total de tenants), **Em trial**, **Ativas**,
**Inadimpl./susp.**, **MRR**, **Leads novos**, **Tickets abertos** e **Contatos**
(soma de contatos de todos os tenants).

## Empresas assinantes

### Criar uma empresa

1. Abra **➕ Nova empresa assinante**.
2. Preencha **Nome** e **E-mail do owner** (obrigatórios). O **slug** é opcional
   (identificador curto, ex.: `villela-stay`) e o **plano** inicial pode ser
   trial, starter, professional, business ou enterprise.
3. Toque em **Criar empresa**.

### Gerenciar uma empresa (ações na linha da tabela)

Cada linha da tabela mostra nome, slug, e-mail do owner, status (badge colorida)
e plano. Na coluna Ações:

1. **🔑 Link acesso** — gera o link para o owner **definir a senha** do painel
   `/crm/app` (validade de 7 dias). O link aparece numa caixa para você copiar e
   enviar ao cliente.
2. **Seletor de status** — muda o status do tenant: trial, ativa, inadimplente,
   suspensa ou cancelada. A mudança é aplicada assim que você escolhe.
3. **Seletor de plano** — aplica outro plano (trial, starter, professional,
   business, enterprise) na hora.

Status suspensa/cancelada/inadimplente bloqueia a entrega do produto para a
empresa.

## Leads da landing

Se houver leads, aparece a lista dos últimos 15 vindos do formulário de `/crm`:
nome, empresa, e-mail, telefone e status. Somente leitura — o contato comercial é
feito por fora desta aba.

## Tickets

Se houver chamados, aparece a lista dos últimos 15: empresa, assunto e status
(badge verde = resolvido/fechado). Nesta aba a lista é de acompanhamento
(somente leitura).

## Importar o CRM legado do staff

O botão **⬆ Importar CRM legado → tenant villela-stay** migra os contatos do CRM
interno (aba 📈 CRM / Funil) para dentro do produto, no tenant da própria Villela
Stay:

1. **Antes de importar**, crie a empresa com slug exatamente **`villela-stay`**
   no formulário ➕ (se não existir, a importação avisa e não roda).
2. Toque no botão e confirme. Contatos duplicados são **mesclados** (não duplica).
3. Ao final aparece o resumo: quantos contatos foram criados, quantos já existiam
   e foram mesclados e quantas oportunidades foram geradas (os leads em estágio
   aberto do legado viram oportunidades no funil de hospedagem).
4. A importação pode ser repetida com segurança — ela é idempotente pelo dedupe.

O CRM legado **não é apagado**: a aba 📈 continua funcionando.

## Boas práticas

1. Só mude status/plano pela própria tabela — a alteração é imediata, sem etapa
   de confirmação extra nos seletores. Escolheu errado? Corrija no mesmo seletor.
2. Link de acesso expira em 7 dias; se o cliente demorar, gere outro.
3. Preços e condições dos planos são geridos pela administração da plataforma —
   não prometa valores por fora do que está configurado.
