# Perguntas Frequentes — Villela Legal SaaS (administração)

### Não vejo a aba ⚖️💼 Legal SaaS. Por quê?

Ela só aparece para colaboradores com área **ceo** ou **ti**. Peça a um
administrador do Portal Staff para revisar as suas áreas de acesso.

### Qual a diferença entre ⚖️💼 Legal SaaS e ⚖️ Villela Legal?

A **⚖️ Villela Legal** é o sistema jurídico **interno** do nosso escritório
(processos, prazos, IA — tem manual próprio). A **⚖️💼 Legal SaaS** administra a
**venda** desse sistema a outros escritórios: assinantes, planos, cobrança,
suporte e custos.

### E o /cliente-juridico, é a mesma coisa?

Não. O `/cliente-juridico` é o portal dos **clientes finais** de um escritório
(quem contratou o advogado). A venda do SaaS acontece em `/juridico`, e o
escritório assinante usa o painel `/juridico/app`.

### Como cadastro um escritório novo?

Aba **Escritórios** → **➕ Novo escritório** → nome e e-mail de acesso
(obrigatórios); CNPJ, OAB seccional e plano opcionais → **Criar**. Depois gere o
**🔑 Link de acesso** para o cliente definir a senha.

### O escritório não consegue entrar no painel dele. O que verifico?

1. Status do escritório (suspenso/cancelado/inadimplente bloqueia o acesso);
2. Se o e-mail usado é o e-mail de acesso cadastrado;
3. Se o link de definição de senha não expirou — gere um novo em
   **🔑 Link de acesso** no detalhe do escritório.

### Como suspendo um escritório?

Detalhe do escritório → **Suspender** (pede confirmação). O acesso ao sistema
jurídico é bloqueado na hora. Para voltar, **Ativar** no mesmo lugar.

### O escritório pagou por fora do Mercado Pago. Como registro?

Detalhe do escritório → **💵 Marcar pago**. É o caminho para cobrança gerida
manualmente.

### Apliquei outro plano e apareceu aviso de "reassinar". O que é isso?

O escritório tem assinatura recorrente ativa no Mercado Pago. Os entitlements já
mudaram, mas a **cobrança** só muda quando ele reassinar pelo painel dele.

### Posso alterar preços e limites dos planos?

Pode — aba **Planos**: preço/mês, descrição, limites (0 = ilimitado), módulos e
flags, tudo editável e salvo por plano. Desmarcar "Plano ativo" tira o plano da
landing `/juridico` sem apagar nada.

### Como dou uma condição especial (Enterprise) a um escritório?

No detalhe do escritório, **⚙️ Overrides negociados**: JSON de limites (ex.:
`{"processos_ativos":5000}`) e/ou flags → **Salvar overrides**. Vale só para
aquele escritório, por cima do plano.

### Onde respondo os chamados dos escritórios?

Aba **🎧 Suporte** → **Abrir** o ticket → **Responder**. O escritório lê a
resposta no painel `/juridico/app`. Ao final, **Marcar resolvido**.

### Um trial venceu e o escritório continua como "trial". O que faço?

Aba **Logs** → **▶️ Rodar ciclo de vida agora (trial/dunning)**. A rotina vence
trials expirados e suspende inadimplentes; ela também roda sozinha
periodicamente.

### Os dados de um escritório podem vazar para outro?

Não — cada escritório assinante tem base de dados própria e isolada, separada
inclusive do jurídico interno da Villela. Mesmo assim, nunca copie dados de um
tenant para conversas ou documentos de outro.

### Onde o assinante tira dúvidas de uso do sistema jurídico?

Na central de ajuda pública **`/juridico/ajuda`** e pelos tickets de suporte do
painel dele. Este manual cobre só a administração da plataforma.
