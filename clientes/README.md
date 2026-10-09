# Clientes — alunos, compradores e assinantes numa tela só

Portal Staff → Administração → **👥 Clientes** (só admin). Junta, em uma lista, quem comprou livro
(Livraria), quem estuda (Academy) e quem assina cada sistema do grupo. **Somente leitura.**

- API: `GET /staff/api/clientes` (lista + totais + estado das fontes) e `GET /staff/api/clientes.csv`.
- Tela: `staff/app-clientes.js`. Testes: `npm run test:clientes` (entra no portão de pré-push; roda
  também quando `comunicados/` muda, porque o catálogo de sistemas vem de lá).

## Regras que o código impõe (e o teste cobra)

- **Só sessão de admin.** A `PUBLISH_KEY` **não** abre esta rota (403): chave de automação não lê base
  de clientes. `Cache-Control: no-store`. O log e a auditoria guardam contagem, nunca quem são.
- **A lista de sistemas não mora aqui**: vem de `comunicados/fontes.js`. Em `motor.js` cada sistema de
  lá ganha um leitor (`LEITORES`) ou um motivo para ficar de fora (`FORA`). Sistema novo na central sem
  uma das duas coisas aparece como "não integrada" e **quebra o teste**.
- **Valor pago = pagamento registrado** (pedido pago, fatura paga, parcela aprovada), em centavos.
  Sem registro, `valor_pago_centavos` é `null` e a linha diz "sem registro de pagamento". O preço de
  tabela do plano aparece só em `mensalidade_centavos`.
- **Fora da receita, mas na lista**: cortesia, período de teste, conta interna (e-mail da equipe do
  staff, `CLIENTES_EMAILS_INTERNOS`, `MUSIC_DONO_EMAIL`, coluna `interno`, domínio de demonstração),
  reembolso, produto gratuito e pagamento abaixo de R$ 1,00 (Pix de centavo não é venda).
- **Receita do período** olha a data de cada pagamento; a lista filtra pela data do vínculo.
- **Telefone** é o que cada sistema guarda. Onde não há, fica vazio — nada é cruzado entre bases.
- Fonte que falha vira **"indisponível"** na tela; as outras continuam.

## Fonte → de onde vem cada coisa

| Fonte | Conta | Vínculo e data | Valor | Não existe |
|---|---|---|---|---|
| Livraria | `customers` (nome, e-mail, whatsapp) | `orders` pago/reembolsado; `pago_em` | `orders.valor_total` | conta/login; pedido pendente fica fora |
| Academy — aluno | `users` | `enrollments`; data do pedido ou da matrícula | pedido pago do mesmo aluno+produto (`orders.valor_centavos`) | valor em matrícula de cortesia |
| Academy — clube | `users` | `subscriptions` (≠ pendente); `ativa_em` | soma dos `orders` com `subscription_id` | — |
| Stay Manager, Legal, CRM | dono em `tenant_users`; telefone em `tenants` | conta (`tenants`) + `subscriptions.inicio` | `invoices` com status `paga` | telefone do usuário (é o da empresa) |
| Docs, Projects | dono via `users` × `tenant_users` | conta + `subscriptions` (o plano mora lá) | `payments` com status `aprovado` | status cortesia no Projects (é coluna `interno`/`cortesia`) |
| Finance | proprietário, pelo `repo.js` | conta + assinatura | `invoices` pagas (`valor_cents`) | telefone |
| Closet Club | `users` | `subscriptions` premium | `invoices` pagas do usuário | aluguel entre usuários não entra |
| Musique | `contas_music` | `assinaturas_music`; conta em teste grátis vira "em teste" | `assinatura_pagamentos` | — |
| Alta Vista 360 | `clientes` | `projetos` (serviço por projeto) | `parcelas` aprovadas | assinatura |
| Origena | dono da família (PostgreSQL próprio, uma família por vez, com RLS) | `subscriptions` + `orders` de créditos | `orders` pagos | telefone |

Fora da lista, com o motivo na tela: **Cozinhe** e **Viver de Chácara** (não integradas); **Vitrine**,
**Invente** e **Área do Hóspede** (não se aplicam).
