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

## Ativar as integrações reais (fase 6 — só com autorização)

- **Pagamento**: implementar `Provedores['mercadopago-split']` em `pagamentos.js`
  (OAuth por vendedor + split; credenciais `VITRINE_MP_APP_ID`/`VITRINE_MP_SECRET`) e
  setar `VITRINE_PAGAMENTO_PROVEDOR=mercadopago-split`. O restante do sistema não muda:
  o webhook real entra pelo mesmo `processarEvento()` idempotente.
- **Frete**: implementar `Provedores['melhor-envio']` em `frete.js`
  (`VITRINE_MELHOR_ENVIO_TOKEN`) e setar `VITRINE_FRETE_PROVEDOR=melhor-envio`.
- **Fotos reais**: trocar o placeholder por upload binário validado por bytes via
  `backend/storage-s3.js` (mesmo padrão do Closet Club, bucket R2 próprio).
- **Antes do lançamento**: revisão dos textos jurídicos por advogado(a) OAB (hoje são
  MINUTA), definição do encarregado LGPD e domínio `vitrine.villelastay.com.br`
  (CNAME + Custom Domain no Render + o redirect por host já está no `server.js`).
