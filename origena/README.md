# ORIGENA — módulo do backend

**Plataforma SaaS de memória, história e legado familiar.** 12º produto do Grupo Villela Stay.
Landing `/origena` · app da família `/origena/app` (Fase 1) · staff `/staff/api/origena/*`.

> Documentação completa (visão, arquitetura, banco, segurança, privacidade, IA, billing, roadmap e
> os 8 ADRs) fica no **repo-pai**: `docs\origena\`. Aqui está só o que um dev precisa para mexer
> neste diretório.

## Estado: 1.0 completo + fases 2.1 e 2.2 — 09/08/2026

Existe: contas, famílias e papéis · proveniência · pessoas, parentesco e árvore · mídia no R2 com
worker · documentos, histórias e busca · lugares, eventos e linha do tempo · créditos, IA e admin ·
exportação, lixeira e integridade · **tradições, receitas, saberes e relíquias com linha de
custódia** · **Historiador, missões e índice de memória**.

Não existe ainda: OCR, entrevistas e busca semântica (dependem de provedor contratado), Studio,
cápsula do tempo e apps nativos. A ordem está em `docs\origena\ROADMAP.md`.

## O que torna a Origena diferente dos outros 11 produtos

| | Os outros 11 | Origena | Por quê |
|---|---|---|---|
| Banco | SQLite (`node:sqlite`) no disco do Render | **PostgreSQL** próprio | Dois processos escrevem (web + worker) e o disco do Render só monta em **um** serviço. Além disso: RLS como muro de tenancy e caminho para pgvector — `ADR-0002` |
| Binários | disco ou R2, conforme o produto | **R2 sempre**, nada no disco | 1 GB de disco para 12 produtos; acervo familiar passa de 25 GB por família — `ADR-0003` |
| Trabalho pesado | no processo web | **worker separado** | O web tem 2 GB para 12 produtos — `ADR-0005` |

**Não copie o padrão SQLite dos outros módulos para cá.** As três diferenças acima são deliberadas
e cada uma tem um ADR explicando o que se perde ao reverter.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.js` | `montar(app, deps)` — única porta de entrada. Nunca lança: sem banco, só a landing sobe |
| `db.js` | Pool `pg`, transação, migrações com advisory lock, isolamento por schema |
| `schema/NNN-*.sql` | Migrações **aditivas e idempotentes**. Só acrescentar; nunca editar uma já aplicada |
| `fila.js` | Fila durável (`SKIP LOCKED`, backoff, DLQ, idempotência) |
| `storage.js` | R2 por URL assinada. **Nenhum byte passa pelo processo web** |
| `worker.js` | Consome a fila. Roda como serviço próprio no Render |
| `paginas.js` | HTML server-rendered. Identidade **provisória** (brand book pendente) |
| `tradicoes.js` | Tradições, receitas, saberes e relíquias. A custódia é histórico, não campo |
| `historiador.js` | Lacunas do acervo e índice de memória. **É SQL, não IA** — custo zero, sem provedor |
| `missoes.js` | Lacuna → pergunta endereçada, idempotente pela chave; notificação **opt-in** |
| `selftest.js` | `npm run test:origena` — schema descartável, R2 real |

## Rodar local

`backend\.env` precisa de `ORIGENA_DATABASE_URL` (a URL **externa** do `origena-db`) e das
`ORIGENA_S3_*`. Em produção o web usa a URL **interna**.

```bash
npm run test:origena     # suíte (cria e derruba um schema t_*)
npm run origena:worker   # worker local
```

⚠️ O acesso externo ao Postgres é limitado por **allowlist de IP** no Render. O IP residencial do
Augusto muda de tempos em tempos; quando mudar, a conexão local falha e é preciso atualizar a
allowlist do `origena-db` pela API do Render. Produção não depende disso (usa a rede interna).

## Variáveis de ambiente

| Env | Para quê |
|---|---|
| `ORIGENA_DATABASE_URL` | Postgres. Sem ela: landing sobe, banco e fila desligados |
| `ORIGENA_S3_ENDPOINT/BUCKET/KEY/SECRET/REGION` | R2 (`villela-origena`, **privado**) |
| `ORIGENA_DB_SCHEMA` | Só o selftest usa (`t_*`). Produção fica em `origena` |
| `ORIGENA_WORKER_LOTE` / `_MS` / `_FILA` | Ajuste do worker (`rapida`, `cara` ou as duas) |
| `ORIGENA_FILA_BACKOFF_MS` | Base do backoff exponencial (padrão 2000) |

## Regras que o código já impõe (não são convenção — são trava)

1. **Original é imutável.** `storage.apagar()` recusa qualquer chave em `/orig/`.
2. **`DROP SCHEMA` só em `t_*`.** Um drop errado apagaria o acervo de todas as famílias.
3. **Job sem handler vai para a DLQ e loga alto.** Handler com nome errado falhando em silêncio é
   um bug clássico e caro — aqui ele é barulhento.
4. **Job morre para a DLQ, nunca some.** A remoção de `jobs` e a inserção em `jobs_dlq` estão na
   mesma transação.
5. **Chave de storage não aceita `.`**, logo é impossível montar `..`.
6. **Uma posse aberta por relíquia**, por índice único parcial: o objeto não fica em duas mãos ao
   mesmo tempo nem se alguém escrever direto no banco.
7. **Missão dispensada não renasce**: a `chave` continua ocupada. Recusar uma pergunta é decisão da
   família, e decisão da família não se apaga sozinha na varredura seguinte.

## Ao acrescentar funcionalidade

Leia antes: `docs\origena\ROADMAP.md` (a ordem das fases não é arbitrária — **proveniência vem
antes da mídia**, `ADR-0006`) e `docs\origena\DATABASE.md` (o schema já está desenhado).

Definition of Done: funciona · autorização testada · **escopo de família testado** · erro tratado ·
responsivo · testes · documentado · não quebra os outros 11 · observável.
