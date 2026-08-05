# `backend/closet` — Closet Club

Marketplace de aluguel de roupas entre pessoas. Monta em `server.js` com
`require('./closet').montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret })`.

Visão de produto, regras comerciais e pendências: **`docs/integracoes/closet-club.md`**.
Aqui fica só o mapa do código.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.js` | Montagem, injeção de dependências, webhook do MP, agendador das rotinas |
| `db.js` | SQLite (`node:sqlite`) em `DATA_DIR/closet/closet.db` + utilitários de data e transação |
| `schema.sql` | Modelo de dados completo (dinheiro em centavos, datas ISO, colunas JSON) |
| `repo.js` | **Núcleo**: config, planos/entitlements, usuários, peças, looks, agenda, `Precos.orcamento()`, cupons, razão |
| `bookings.js` | **Escrow**: máquina de estados da reserva, repasses, avaliações, favoritos, chat, disputas, rotina de prazos |
| `ia.js` | Motor de regras: preço, descrição, SEO, estilo, qualidade de foto, montagem de looks, recomendação, analytics |
| `billing.js` | Pix da reserva, reembolsos, repasse, Premium (preapproval), webhook, ciclo diário, financeiro da plataforma |
| `rotas-conta.js` | Sessão `closet_sess`: cadastro, login, perfil, plano, push, direitos LGPD |
| `rotas-publicas.js` | Vitrine, ficha da peça/look, IA aberta, cotação, reserva, Pix, QR de posse, leads |
| `rotas-app.js` | Painel autenticado (proprietária + cliente) |
| `rotas-staff.js` | `/staff/api/closet/*` — moderação, reservas, disputas, repasses, regras, cupons, parceiros |
| `paginas.js` | HTML server-rendered (design system próprio) + blog + sitemap/robots |
| `app-cliente.js` | SPA do painel (script clássico, sem build) |
| `push.js` | Web Push via `../push-saas.js` |
| `storage.js` | Fotos públicas: validação por bytes, dedupe por sha256, driver local/S3 (onda 2) |
| `conteudo.js` | Blog: markdown leve, posts semeados, ligação post → ocasião → vitrine (onda 2) |
| `crescimento.js` | Indicação e créditos (onda 2) |
| `parceiros.js` | Parceiros, serviços no checkout e zonas de entrega (onda 2) |
| `api-publica.js` | `/closet/api/v1` — leitura por chave `cc_` (onda 2) |
| `selftest.js` | `npm run test:closet` — 114 testes |

## Invariantes (quebrar isto quebra o negócio)

1. **Só `Precos.orcamento()` calcula dinheiro.** Rota nenhuma soma valor por conta própria.
2. **Desconto de look e cupom saem da comissão**, nunca do repasse do dono — e são limitados à
   comissão bruta. Vale para looks com peças de vários donos.
3. **Dinheiro não sai antes de `concluido`.** `payouts` só nasce em `Bookings.concluir()`.
4. **A reserva segura a agenda na criação**, não na confirmação.
5. **Idempotência do PSP**: `marcarPago` e o webhook podem repetir sem duplicar razão nem fatura.
6. **QR só para participante da reserva** — é o que dá valor probatório ao registro de posse.
7. Em `resolverDisputa` a favor do proprietário, **concluir primeiro, somar a indenização depois**:
   `concluir()` reescreve os repasses e engoliria um valor lançado antes.
8. **Crédito de indicação também sai da comissão** (regra 2). Prêmio só no 1º aluguel CONCLUÍDO,
   nunca no cadastro.
9. **Foto é validada pelos bytes**, nunca pelo mime declarado; o nome é o sha256 do conteúdo (é o
   que autoriza `Cache-Control: immutable`).
10. `Config.num(chave, padrao)` devolve o padrão quando a chave não existe — `Number('')` é 0 e é
    finito, e já zerou a comissão de serviços uma vez.

## Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `CLOSET_BASE_URL` | Domínio público usado em canonical, og e sitemap (padrão `https://closet.villelastay.com.br`) |
| `CLOSET_ROTINAS` | `off` desliga o ciclo diário e a varredura de prazos |
| `CLOSET_ROTINA_HORA` | Hora de Brasília do ciclo diário (padrão 6) |
| `CLOSET_IA_MOTOR` | `llm` liga o motor com Claude (precisa de `ANTHROPIC_API_KEY`); sem isso, regras |
| `CLOSET_IA_MODELO` | Modelo usado pelo motor LLM (padrão `claude-opus-5`) |
| `CLOSET_GA_ID` | Propriedade GA4 das páginas públicas (padrão: a do grupo) |
| `CLOSET_PIX_AUTO` | `on` tenta o repasse automático pelo PSP; sem isso a fila é manual |
| `MP_ACCESS_TOKEN` | Sem ele o módulo roda em modo manual (admin confirma pagamento) |
| `CLOSET_S3_ENDPOINT/BUCKET/KEY/SECRET/REGION` | Storage de fotos em R2/S3; sem isso, disco local |
| `CLOSET_S3_PUBLIC_URL` | Base pública do bucket (obrigatória para o driver S3 ligar) |
| `CLOSET_FOTO_MAX_BYTES` | Limite por foto (padrão 4MB) |
| `CLOSET_API_RPM` | Limite da API pública por chave (padrão 120/min) |

## Onda 3 (03/08/2026)

| Arquivo | Responsabilidade |
|---|---|
| `ia-llm.js` | Motor de IA com Claude. Regras filtram, LLM cura: recebe catálogo já filtrado e devolve IDs validados |
| `emails.js` | E-mails transacionais (7 modelos) — best-effort, respeita `emails_transacionais` e LGPD |
| `campanhas.js` | Campanhas patrocinadas: 4ª fonte de receita, destaque avulso por dia |
| `verificar-producao.js` | `npm run verificar:closet -- <url>` — checa domínio, SEO, PWA, API e acervo de fora |

### Invariantes acrescentados

11. **O LLM nunca inventa peça.** `ia.selecionarCandidatas()` é o filtro duro; `ia-llm.montarLooks()`
    só escolhe dentro dele e o servidor descarta id fora da lista, peça repetida entre looks e
    categoria duplicada no mesmo look.
12. **Toda rota chama `ia.descricaoAuto()` / `ia.looksAuto()`**, nunca as versões cruas — é o que
    garante o fallback para regras quando a API falha.
13. **GA só em página pública**: a regra está amarrada ao `noindex` no `HEAD()`, não a uma lista
    de páginas — página nova com dado pessoal fica de fora sozinha.
14. **`app.js` do painel carrega com `?v=<mtime>`** — sem isso o service worker serve o bundle
    anterior depois do deploy, sem erro visível.
15. **Destaque patrocinado muda a ORDEM, nunca o conteúdo**, e a vitrine marca visualmente.
