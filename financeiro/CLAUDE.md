# Villela Finance — regras deste módulo

> Carregado automaticamente ao trabalhar em `backend/financeiro/`.
> Auditoria do legado: `docs/financeiro/DISCOVERY.md` · arquitetura: `ARCHITECTURE.md` ·
> estado real: `PROJECT_STATE.md` · decisões: `DECISIONS/` (no repo-pai, `docs/financeiro/`).

## As seis regras que não se quebram

1. **Nenhum SQL de tabela com `tenant_id` fora de `repo.js`.** E o `repo.js` só executa dentro de
   um contexto (`tenancy.comTenant`). Não há RLS neste banco (ADR-0003) — esta é a trava. A única
   exceção é a leitura da sessão em `rotas-app.js`, que é circular por natureza e está comentada
   lá.
2. **`tenant_id` e `entidade_id` vêm do contexto, nunca do corpo/query/cabeçalho.** Um
   `X-Empresa` apontando para empresa de outra conta é **ignorado**, não obedecido.
3. **Dinheiro é INTEIRO EM CENTAVOS.** `Number` só na fronteira de entrada e de saída, e nas duas
   passando por `dinheiro.js`. Coluna monetária termina em `_cents` — o selftest varre o banco e
   exige `typeof integer` em todas.
4. **Lançamento contabilizado não se altera nem se apaga.** Correção é estorno + novo lote, com
   vínculo nos dois sentidos. Os triggers do `schema.sql` recusam; não confie só no serviço.
5. **Ação de nível 3 não pode ser rebaixada por configuração** (`rbac.nivelDe` devolve o MAIOR
   entre o piso e o configurado). Nível 4 é recusa com motivo escrito, não aviso.
6. **Tabela `fin_*` nova entra sozinha no teste anti-vazamento.** O `db.js` lê o schema; se a
   tabela tem `tenant_id` e não passa, a suíte quebra. É de propósito.

## Comandos

```bash
npm run test:finance    # tem de estar verde antes de qualquer commit
npm run test:nucleo     # o server.js monta este módulo — rodar junto
node --watch server.js  # subir o backend local
```

Variáveis: `FINANCE_WORKER=off` (desliga o worker) · `FINANCE_WORKER_MS` · `FINANCE_REPLICA_MIN` ·
`FINANCE_STAYS_SYNC_MIN` (sincronização automática da Stays; **0 = desligado**, que é o padrão) ·
`FINANCE_S3_ENDPOINT/BUCKET/KEY/SECRET/REGION/PREFIXO` (réplica do diário; sem elas o status diz
`local` e o RPO real é o do snapshot diário).

## Convenções

- Node 22, CommonJS, `'use strict'`. **Sem TypeScript, sem build step, sem dependência nova** sem
  ADR — o módulo roda no mesmo processo dos outros 13 produtos.
- Prefixo `fin_` em toda tabela de domínio. IDs TEXT url-safe · datas ISO-8601 · JSON em TEXT.
- Camadas: `rotas-*.js` (HTTP, sem SQL) → serviços → `repo.js` (SQL) → `db.js` (conexão).
- Migrations: array `MIGRACOES` em `db.js`, nome único, roda uma vez. **Nunca destrutiva.**
  ⚠️ `schema.sql` roda ANTES das migrações — índice ou trigger que dependa de coluna nova tem de
  ser criado dentro da própria migração, senão aborta o schema e o módulo não monta.
- Consulta que monta o WHERE por pedaço: pode passar o objeto de parâmetros inteiro. O `repo.js`
  filtra o bind pelo que o SQL cita (o `node:sqlite` recusa parâmetro que não aparece).
- Mensagem de erro é útil e sem vazar interno: diz o que fazer e qual linha, não o stack.

## Cuidados que já custaram caro

- **Saldo considera lote `estornado`.** O estorno é lançamento espelho que compensa, não remoção.
  O critério nas consultas de saldo é `status <> 'rascunho'`, nunca `= 'contabilizado'` — senão o
  original some e sobra só a contrapartida, invertendo o saldo.
- **Dedupe de extrato usa a POSIÇÃO da linha idêntica dentro do lote importado.** É o que permite
  reimportar sem duplicar e, ao mesmo tempo, manter duas compras iguais no mesmo dia.
- **O diário grava DEPOIS do COMMIT.** Falhar ali não desfaz o lançamento — a conferência acusa a
  falta. Perder o fato contábil para salvar a réplica seria pior.
- **A cadeia de hash do diário é POR MÊS**, não global. O arquivo do mês é a unidade de replicação,
  então tem de ser a de verificação: com cadeia global, sincronizar um mês passado deixaria o elo do
  próximo registro apontando para outro arquivo, e conferir o mês sozinho acusaria adulteração que
  não houve.
- **O adaptador Stays reconcilia para um ESTADO-ALVO**, não importa uma vez. Se você for
  acrescentar caso novo (caução, repasse, taxa de gateway), acrescente ao `alvoDaReserva` — o resto
  do caminho já trata nova/reprocessada/alterada/cancelada de graça.
- **Comissão de canal é DEDUÇÃO da receita** (3.2.1.001), não despesa. E em reserva de canal o
  devedor é o CANAL (1.1.2.002), não o hóspede.
- **Título ≠ parcela ≠ liquidação.** O título provisiona pela competência; a liquidação é o caixa.
  Juros, multa e desconto vão para contas próprias — juro pago NÃO pode inchar a conta de despesa.
- **Todo SQL passa por `repo.q/um/exec`** (é ali que o guarda de isolamento age). As únicas
  consultas com `db.prepare` cru vivem em `sessao.js`, são três, e existem porque o login é
  circular por natureza. Se você precisou de `db.prepare` em outro arquivo, quase certamente não
  precisava.
- **A chave de idempotência da apuração inclui o que está sendo zerado**, não só o período. Com
  chave só de período, lançamento que chega depois da primeira apuração seria deduplicado e o
  sistema diria "ok" com o saldo vivo nas contas de resultado.
- **Balanço fecha porque o resultado do exercício é linha CALCULADA do PL.** Não confie que as
  contas 3 e 4 estejam zeradas — elas só zeram quando alguém apura.
- **A régua de cobrança pula `interno = 1`.** É cortesia vitalícia, e a conta do grupo é a que mais
  se parece com uma inadimplente (sem plano pago, sem fatura). Tirar esse `continue` suspenderia a
  contabilidade da própria casa na primeira rodada — há teste que encena exatamente isso.
- **Assinar não ativa.** `billing.assinar` grava `pendente`; quem promove a `ativa` é o webhook do
  Mercado Pago. E o webhook é reenviado: por isso a fatura é idempotente pelo id do pagamento e o
  `authorized` repetido não gera fatura nem alerta de novo.
- **Assinatura no MP tem duas armadilhas próprias.** (1) O painel *Suas integrações → Webhooks*
  **não cobre assinatura**: a URL só existe se for no `notification_url` de cada `POST /preapproval`
  — sem ela o MP autoriza e nunca avisa, e a conta fica `pendente` para sempre. (2) A cobrança
  mensal chega como `subscription_authorized_payment` (lida em `/authorized_payments/{id}`), **não**
  como `payment`: tratar só `payment` faz a primeira autorização funcionar e toda renovação passar
  em branco. Ambas travadas por teste; o `notification_url` aponta para ESTE backend, não para o
  site institucional.
- **O painel do staff é testado contra a rota, não contra si mesmo.** `staff/app-finance.js` é
  carregado num sandbox no `selftest` e alimentado com a resposta real da API, comparando os
  VALORES que ela devolveu. `esc(undefined)` devolve string vazia — sem comparar valor, um campo
  renomeado sumiria da tela sem quebrar nada.
- **Conta-chave nova no plano de contas** só chega às empresas ANTIGAS por
  `contas.atualizarPlanosDeConta()`, que roda no boot. Acrescentar ao `PADRAO` sem isso quebraria
  só na primeira operação que usasse a conta.

## Ao concluir algo

1. Atualizar `docs/financeiro/PROJECT_STATE.md` — pronto, testado, pendente ou **bloqueado por
   credencial/decisão**. Sem otimismo: contrato é contrato, mock é mock.
2. Atualizar o doc do assunto (`ARCHITECTURE`, `ROADMAP`, `MIGRACAO`) por upsert — não duplicar.
3. Decisão relevante vira ADR em `docs/financeiro/DECISIONS/`.
4. Commit identificado. **Git local do D: nunca recebe push** (regra 12 do `CLAUDE.md` da raiz).

## Não faça

Não calcular saldo somando tabela transacional · não apagar lançamento · não usar float para
dinheiro · não confiar em `tenant_id` vindo do cliente · não desativar teste para o build passar ·
não classificar ação material abaixo do nível 3 · não deixar IA escrever no razão · não prometer
RPO sem a conferência do diário passando · não emitir nota fiscal nem dar recomendação de
investimento (fora do escopo autorizado).
