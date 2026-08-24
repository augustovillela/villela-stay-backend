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
