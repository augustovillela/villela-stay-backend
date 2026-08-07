# Vitrine — marketplace de produtos novos e usados

10º produto do Grupo Villela Stay: marketplace brasileiro de **venda** entre pessoas
(novos, seminovos e usados), com pagamento protegido, comissão configurável (padrão
**5%**), frete e rastreamento. Módulo do backend único (`backend/vitrine/`), no mesmo
padrão do Closet Club (que é de **aluguel** — produtos distintos).

> **Estado: MVP demonstrável.** Pagamentos e fretes operam em modo **simulado** —
> nenhum valor real circula, e todas as telas dizem isso. Provedores reais (Mercado
> Pago Split, Melhor Envio) entram na fase 6 pela mesma camada de provedores, sem
> reescrever o sistema.

## Superfícies

| O quê | Onde |
|---|---|
| Loja pública (SEO, server-rendered, JSON-LD) | `/vitrine` · `/vitrine/busca` · `/vitrine/c/:slug` · `/vitrine/p/:slug` · `/vitrine/vendedor/:slug` |
| Institucionais | `/vitrine/como-funciona` · `/venda-conosco` · `/seguranca` · `/termos` · `/privacidade` · `/proibidos` · `/devolucao` (jurídicos carimbados **MINUTA**) |
| Conta e painel (comprador + vendedor na MESMA conta) | `/vitrine/entrar` · `/vitrine/app` (SPA, cookie `vitrine_sess` restrito a `/vitrine`) |
| Rastreio público | `/vitrine/rastreio/:codigo` |
| Administração | aba **🛒 Vitrine** no Portal Staff → `/staff/api/vitrine/*` |
| Webhook de pagamento | `POST /vitrine/webhooks/pagamento` (header `x-webhook-token`; idempotente por `evento_id`) |
| Banco | SQLite `DATA_DIR/vitrine/vitrine.db` (`node:sqlite`, Node 22+) |

## Rodar localmente

```powershell
cd backend
npm install
$env:NODE_ENV = "development"   # liga seed demo, links de verificação na resposta e cookie sem Secure
npm start
# http://localhost:3000/vitrine
```

Em desenvolvimento (ou com `VITRINE_SEED=on`), com o catálogo vazio, o seed cria
3 vendedores, 12 produtos e 1 comprador de demonstração. As contas e a senha são
impressas no console no boot (`VITRINE_DEMO_SENHA` fixa a senha; sem ela, é gerada).
O **administrador** é o login normal do Portal Staff (aba 🛒).

## Regras de dinheiro (as que não podem quebrar)

1. **Centavos inteiros sempre** — nenhuma coluna de dinheiro aceita float; comissão
   em **basis points** (`comissao_pct_bp`, 500 = 5%).
2. **Comissão gravada na compra** — `marketplace_commission_percent` (config, editável
   na aba 🛒 → Regras) vira `comissao_pct_bp` no pedido. Mudar a config só afeta
   pedidos futuros.
3. Comissão incide sobre o **subtotal** (não sobre o frete). Repasse do vendedor =
   subtotal + frete − comissão. A tarifa do processador é custo da **plataforma** e
   aparece separada: margem real = comissão − tarifa (o dashboard mostra, mesmo se
   negativa).
4. **Status só pela máquina de estados** (`pedidos.js`), com ator conferido e
   histórico append-only em `order_status_history`.
5. **Estoque reservado na criação do pedido**, devolvido em cancelamento/expiração.
6. **1 pedido = 1 vendedor** (o carrinho aceita vários e o checkout explica a separação).

## Variáveis de ambiente

Veja `.env.exemplo`. Nenhuma é obrigatória para o MVP simulado.

## Testes

```powershell
npm run test:vitrine   # 45 testes: comissão/centavos, máquina de estados, idempotência
                       # de webhook, avaliação pós-entrega, isolamento entre contas,
                       # 1 pedido por vendedor, moderação, LGPD, rotina
```

## Fase 6 — integrações reais (IMPLEMENTADAS, aguardando credenciais)

O código dos provedores reais está pronto e testado com mocks; cada um só ativa
quando as credenciais existirem no ambiente — sem elas, tudo cai no simulado e a
interface diz qual fluxo está em uso.

- **Mercado Pago Split Payments** (`pagamentos.js`):
  1. Criar a aplicação marketplace no dashboard do MP e preencher
     `VITRINE_MP_APP_ID` + `VITRINE_MP_SECRET` (credenciais de TESTE = sandbox).
  2. Configurar o webhook `https://vitrine.villelastay.com.br/vitrine/webhooks/mercadopago`
     no dashboard e copiar a assinatura secreta para `VITRINE_MP_WEBHOOK_SECRET`
     (sem ela o webhook rejeita tudo — de propósito).
  3. O vendedor conecta a própria conta em `/vitrine/app#loja` → "Conectar Mercado
     Pago" (OAuth; tokens ficam só no servidor, com refresh automático).
  4. A partir daí o checkout desse vendedor cria uma preference do Checkout Pro
     **na conta dele** com `marketplace_fee` = comissão da plataforma; a tarifa
     REAL do MP (fee_details) substitui a simulada no extrato. Reembolso e
     idempotência passam pelo mesmo núcleo de sempre.
- **Melhor Envio** (`frete.js`): token em `VITRINE_MELHOR_ENVIO_TOKEN` +
  `VITRINE_FRETE_PROVEDOR=melhor-envio` (`VITRINE_MELHOR_ENVIO_SANDBOX=on` por
  padrão). A cotação vira real (serviços/preços/prazos da API); se a API falhar,
  o checkout cai na cotação simulada em vez de morrer. Compra de etiqueta e
  rastreio automático ficam para depois da homologação — postagem continua manual.
- **Homologação**: `npm run verificar:vitrine -- <url>` confere de fora páginas,
  SEO, API, webhooks fechados e redirect de host.

## Ainda fora da fase 6 (decisões de lançamento)

- **Fotos reais**: upload binário validado por bytes via `backend/storage-s3.js`
  (padrão Closet, bucket R2 próprio).
- Revisão dos textos jurídicos por advogado(a) OAB (hoje são MINUTA) e encarregado
  LGPD; nome definitivo da marca.
