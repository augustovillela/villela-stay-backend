# Villela Alta Vista 360 — módulo

Estúdio visual (drone · vídeo IA · foto 360° · tour virtual) para hospedagens e imóveis.
Site público em `/alta-vista`, administração na aba 🚁 do Portal Staff.
Doc de integração (estado + plano de ondas): `docs/integracoes/villela-alta-vista-360.md`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.js` | `montar(app, deps)` — semeia, registra rotas, loga o resumo |
| `db.js` | SQLite próprio em `DATA_DIR/alta-vista/alta-vista.db` (node:sqlite, WAL) |
| `schema.sql` | DDL (config, servicos, combos, portfolio, faqs, conteudos, leads, auditoria) |
| `repo.js` | domínio: Config, Servicos, Combos, Portfolio (trava do consentimento), Faqs, Conteudos, Leads, Auditoria, `semear()` |
| `paginas.js` | todas as páginas públicas (server-rendered, identidade própria da marca) |
| `recomendador.js` | motor de recomendação server-side (pacote + motivos + preço-base + análise manual + pontuação) |
| `rotas-publicas.js` | `/alta-vista/api/catalogo`, `/api/orcamento`, `/api/recomendar`, `/api/proposta/:token/aceitar` (honeypot + rate limit) |
| `rotas-conta.js` | conta do cliente: cookie `av_sess` path `/alta-vista`, login/criar/esqueci/definir-senha |
| `rotas-app.js` | API do painel logado (`/alta-vista/api/app/*`): imóveis, projetos, briefing, mensagens, LGPD |
| `app-cliente.js` | SPA do painel `/alta-vista/app` (servida com `?v=` mtime) |
| `billing.js` | Checkout Pro: parcelas (regras 50/50), webhook com refetch+idempotência, reembolso, saldo, financeiro |
| `storage.js` | driver local↔R2 (`ALTAVISTA_S3_*`), upload direto, magic bytes, URLs assinadas expirantes |
| `arquivos.js` | entregas/versões (histórico), comentários ancorados, aprovação formal, materiais do cliente, gate do saldo |
| `tours.js` | tours 360°: cenas/hotspots, validação de link quebrado, duplicar, views, renovação estende validade |
| `rotas-tour.js` | viewer público `/alta-vista/t/:slug` — reusa o visualizador WebGL do site SEM fork (adapter) |
| `rotas-staff.js` | `/staff/api/alta-vista/*` (requireAuth + requireAdmin): CRM, propostas, projetos, clientes, cobrança, financeiro, catálogo, CMS |
| `operacao.js` | checklists por serviço (drone com trava de segurança), portão de prontidão (12 itens), capacidade, campanha 90 dias, relatórios |
| `selftest.js` | `npm run test:alta-vista` — 77 testes (isolamento, MP mockado, storage, saldo, tours, prontidão) |

## Invariantes (quebrar isto quebra o negócio)

- **Preço só no banco, em centavos.** Nenhum preço fixado em HTML/meta (o selftest pega).
- **Projeto conceitual SEMPRE exibe o aviso obrigatório**; virar caso real exige consentimento
  registrado — `Portfolio.salvar` recusa sem `{autorizado_por, data, escopo}`.
- **Nenhuma promessa de resultado garantido** nas páginas públicas (testado por regex).
- **Lead exige consentimento LGPD** e um canal de contato; honeypot responde ok e descarta.
- Wrapper `h` das rotas staff usa try/catch explícito — `Promise.resolve(fn())` NÃO captura
  throw síncrono (viraria 500).

## Variáveis de ambiente

| Env | Efeito |
|---|---|
| `ALTAVISTA_BASE_URL` | base do canonical/sitemap (default `https://altavista.villelastay.com.br`) |
| `ALTAVISTA_GA_ID` | liga o GA4 nas páginas públicas (sem ela, nenhuma tag) |
