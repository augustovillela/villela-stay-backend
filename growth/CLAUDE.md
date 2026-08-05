# Villela Growth OS — regras deste módulo

> Carregado automaticamente ao trabalhar em `backend/growth/`.
> Escopo do produto: `docs/PROMPT_MASTER_VILLELA_GROWTH_OS.md` ·
> arquitetura: `docs/growth-os/ARCHITECTURE.md` · estado real: `docs/growth-os/PROJECT_STATE.md`.

## As cinco regras que não se quebram

1. **Nenhum SQL de tabela com `tenant_id` fora de `repo.js`.** E `repo.js` só executa dentro de um
   contexto de tenant (`tenancy.comTenant`). Não há RLS neste banco — esta é a única trava.
2. **`tenant_id` vem do contexto, nunca do corpo/query da requisição.** Um `tenant_id` enviado pelo
   cliente é ignorado, não obedecido.
3. **Segredo nunca no código, no log, no erro, no analytics ou no prompt de IA.** Credencial passa
   por `segredos.js`; o repositório devolve referência e metadados, nunca o valor.
4. **Integração só é "concluída" quando funciona de verdade.** Enquanto não funcionar, o status em
   `gx_integracoes` é um dos declarados em `docs/growth-os/INTEGRATIONS.md`. Não inventar endpoint,
   escopo nem capacidade — sem documentação oficial lida, o conector fica `planejada`.
5. **Tabela `gx_*` nova entra no teste anti-vazamento.** O selftest lê o schema; se a tabela tem
   `tenant_id` e não passa no teste, a suíte quebra. É de propósito.

## Comandos

```bash
npm run test:growth     # suíte do módulo (tem de estar verde antes de qualquer commit)
npm run test:crm        # o CRM compartilha o banco — rodar junto ao mexer em schema
node --watch server.js  # subir o backend local
```

Variáveis: `DATA_DIR` · `GROWTH_SECRET_KEY` (32 bytes; sem ela o cofre recusa gravar) ·
`GROWTH_WORKER=off` (desliga o worker) · `GROWTH_WORKER_MS` (intervalo do lote).

## Convenções

- Node 22, CommonJS, `'use strict'`. **Sem TypeScript, sem build step, sem dependência nova**
  sem ADR — o módulo roda no mesmo processo dos outros 8 produtos.
- Prefixo `gx_` em toda tabela nova. Tabelas do control plane (`tenants`, `plans`,
  `subscriptions`, `invoices`, `usage_records`, `audit_logs`) e `crm_*` são **compartilhadas com o
  Villela CRM** — alterar só de forma aditiva e com migration nomeada.
- IDs TEXT url-safe · datas ISO-8601 · dinheiro em **centavos** · JSON em TEXT.
- Camadas: `rotas-*.js` (HTTP, sem SQL) → serviços → `repo.js` (SQL) → `db.js` (conexão).
- Migrations: array `MIGRACOES` em `db.js`, nome único, roda uma vez. **Nunca destrutiva.**
- Mensagem de erro é útil e sem vazar interno: diz o que fazer, não o stack.

## Critérios de conclusão (§36 do prompt)

Uma funcionalidade só está pronta quando: funciona ponta a ponta · tem teste · respeita tenant ·
respeita permissão · emite evento · tem log · trata erro · tem loading · tem estado vazio · tem
mensagem de erro útil · tem documentação · tem auditoria quando relevante · não expõe segredo ·
não depende de dado falso escondido.

## Ao concluir algo

1. Atualizar `docs/growth-os/PROJECT_STATE.md` — o que ficou **pronto, testado, pendente ou
   bloqueado por credencial/aprovação externa**. Sem otimismo: mock é mock.
2. Atualizar o doc do assunto (`ARCHITECTURE`, `DATA_MODEL`, `EVENTS`, `INTEGRATIONS`, `AGENTS`)
   por upsert — não duplicar.
3. Decisão relevante vira ADR em `docs/growth-os/DECISIONS/`.
4. Commit identificado. **Git local do D: nunca recebe push** (regra 12 do `CLAUDE.md` da raiz).

## Não faça

Não apagar funcionalidade existente sem justificativa · não reescrever o módulo inteiro · não
ignorar erro · não desativar teste para o build passar · não criar dependência circular · não
misturar regra de plataforma com regra de domínio · não permitir acesso cruzado entre tenants ·
não fazer operação destrutiva sem backup · não gastar dinheiro externo sem autorização do Augusto.
