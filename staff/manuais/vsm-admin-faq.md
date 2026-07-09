# Perguntas Frequentes — Villela Stay Manager (administração)

### Não vejo a aba 🏨 Stay Manager no menu. Por quê?

Ela só aparece para colaboradores com área **ti** ou **ceo**. Peça a um
administrador do Portal Staff para revisar as suas áreas de acesso.

### Qual a diferença entre esta aba e o painel /gestao/app?

Esta aba é a **administração da plataforma** (visão do dono do negócio: clientes,
planos, cobrança, suporte). O `/gestao/app` é o painel que o **assinante** usa
para gerir a operação dele. Dúvidas de uso do produto: central pública
`/gestao/ajuda`.

### Como cadastro um cliente novo?

Aba **Operações** → **➕ Nova operação** → nome e e-mail de acesso (obrigatórios),
CNPJ/site/plano opcionais → **Criar**. Depois gere o **🔑 Link de acesso** para o
cliente definir a senha.

### O cliente não consegue entrar no painel dele. O que verifico?

1. Status da operação (suspensa/cancelada/inadimplente bloqueia o acesso);
2. Se o e-mail usado é o e-mail de acesso cadastrado;
3. Se o link de definição de senha não expirou — gere um novo em
   **🔑 Link de acesso** no detalhe da operação.

### Como suspendo uma operação?

Detalhe da operação → **Suspender** (confirmação obrigatória). A entrega do
produto é bloqueada na hora. Para reativar, **Ativar** no mesmo lugar.

### O cliente pagou fora do Mercado Pago. Como registro?

Detalhe da operação → **💵 Marcar pago**. Isso regulariza o ciclo de cobrança
manual da operação.

### Troquei o plano e apareceu um aviso de "reassinar". O que significa?

A operação tem assinatura recorrente ativa no Mercado Pago. O novo plano foi
aplicado nos entitlements, mas a **cobrança** só muda quando o cliente reassinar
pelo painel dele.

### Posso mudar o preço de um plano?

Pode — aba **Planos**, campo Preço/mês, **Salvar plano**. Os preços são números
comerciais geridos por esta administração. Assinaturas MP já ativas continuam no
valor antigo até o cliente reassinar.

### O que significa limite 0 num plano?

Zero = **ilimitado**. Vale para todos os limites numéricos dos planos e dos
overrides.

### Como dou um limite maior só para um cliente (negociação Enterprise)?

No detalhe da operação, seção **⚙️ Overrides negociados**: JSON de limites (ex.:
`{"imoveis":100}`) e/ou de flags → **Salvar overrides**. O override sobrepõe o
plano só para aquela operação.

### Onde respondo os chamados dos clientes?

Aba **🎧 Suporte** → **Abrir** o ticket → escrever e **Responder**. O cliente lê a
resposta no painel `/gestao/app`. Ao terminar, **Marcar resolvido**.

### Um trial venceu mas a operação continua "trial". O que faço?

Aba **Logs** → **▶️ Rodar ciclo de vida agora (trial/dunning)**. A rotina vence
trials expirados e suspende inadimplentes; ela também roda sozinha
periodicamente.

### De onde vêm os leads da aba Leads?

Do formulário da landing pública `/gestao`. A lista é somente leitura — o contato
comercial é feito por fora.

### O cliente precisa ter conta na Stays.net?

Para usar o módulo de canais (importar anúncios e reservas do Airbnb, Booking
etc.), sim: cada assinante conecta a **própria** conta Stays.net no painel dele.
Sem Stays, o cliente usa o sistema com cadastro manual.
