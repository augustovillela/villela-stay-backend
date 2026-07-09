# Villela Academy — Checklist de segurança

Documento vivo: revisar ao concluir CADA fase. ✅ = implementado na FASE 1,
⬜ = planejado (fase indicada). Nada entra em produção comercial com item da
fase corrente em aberto.

## Autenticação e sessão
- ✅ Senhas com bcrypt (custo 10), mínimo 8 caracteres
- ✅ Cookie httpOnly + Secure (produção) + SameSite=Lax + path restrito `/academy`
- ✅ Sessões revogáveis (jti em `sessions`): logout, troca de senha e suspensão derrubam sessões
- ✅ Rate limit de login/signup (5 falhas/IP → 15 min)
- ✅ Resposta idêntica p/ e-mail inexistente vs senha errada (sem enumeração)
- ⬜ F8: verificação de e-mail no cadastro (junto com e-mails transacionais) · ⬜ F10: 2FA opcional (padrão vdocs)

## Autorização
- ✅ Papéis (aluno/produtor/afiliado/admin) + permissões derivadas (`repo.PERMISSOES`)
- ✅ Gate duplo produtor/afiliado: papel E perfil aprovado
- ✅ Admin da Academy só concedido via Portal Staff; admin não altera o próprio status
- ✅ Anti-IDOR: queries sempre escopadas pelo usuário da sessão (`req.usuario.id`)
- ✅ F2: escopo por produtor (`obterDoDono` em todo o builder — produto/módulo/aula/material/alunos; testado)
- ✅ F2: transições editoriais validadas por papel (produtor não aprova o próprio produto)

## Entrada e saída
- ✅ Sanitização/truncamento de toda entrada (`s()`), JSON parse defensivo
- ✅ Escape de HTML em toda renderização (`esc()`), SPA sem innerHTML de dado bruto sem escape
- ✅ `Cache-Control: no-store` em todas as APIs
- ✅ Hash de senha nunca sai na API (`semSegredos`)
- ✅ F2: upload validado (allowlist de mime, 10 MB, extensão derivada do mime — nunca do nome)
- ✅ F2: aula bloqueada não vaza conteúdo/arquivo na API (só título)
- ✅ F3: páginas públicas escapam TODO conteúdo de produtor (headline com HTML vira texto — testado)
- ✅ F3: vitrine/página/capa só expõem produto `publicado`; rascunho dá 404 e não sai na busca
- ✅ F3: seções da página de venda validadas e limitadas no servidor (tamanhos e quantidade)
- ⬜ F4: validação de CPF/CNPJ

## Dados e segredos
- ✅ JWT_SECRET por env (nunca em código/commit); banco fora do git (DATA_DIR)
- ✅ Documento (CPF/CNPJ) e dados de pagamento nunca em página pública; só admin vê
- ✅ F4: access token do MP só no servidor; webhooks com payload salvo e idempotência
- ✅ F2: arquivos em `DATA_DIR/academy/arquivos/` (privado, nunca estático); entrega SÓ via
  `/academy/api/media/:id` com checagem dono/admin/matrícula/degustação + `download_logs`
- ⬜ F7: storage S3-compatível, URLs assinadas com expiração, anti-hotlink, watermark

## Auditoria e monitoramento
- ✅ `audit_logs`: signup, login (ok/falha), logout, troca de senha, perfis, papéis, status, LGPD, config
- ✅ Auditoria visível ao admin da Academy e ao Portal Staff
- ⬜ F4: log financeiro completo (payment_events/webhook_events) · ⬜ F9: log de IA
- ⬜ F10: alertas de anomalia (picos de falha de login, chargebacks)

## Regras de pagamento (F4)
- ✅ Acesso liberado SÓ por webhook confirmado ou consulta segura server-side ao MP
  (retorno do navegador NUNCA libera — coberto por teste)
- ✅ Eventos duplicados idempotentes (estado terminal não reaplica; payloads salvos)
- ✅ Reembolso e chargeback (`refunded`/`charged_back`) revogam o acesso e registram
- ✅ Access token do MP só no servidor (mpFetch injetado; nunca no frontend)
- ✅ Trilha financeira completa: webhook_events + payment_events + audit_logs
- ✅ Snapshot da comissão no pedido (mudança de % não altera vendas passadas)
- ✅ F5: atribuição de afiliado validada server-side (produto do link, afiliado aprovado,
  nunca auto-compra/produtor); comissão cancelada em reembolso/chargeback; comissão só
  vira paga a partir de disponível (pós-garantia) — tudo coberto por teste
- ⬜ 1ª venda real: conferir com pagamento de verdade (sandbox/produção) antes de divulgar
- ⬜ Recibos/nota fiscal: validar com contador antes de escala (F10)

## Plataforma
- ✅ Módulo isolado: falha na montagem não derruba o site/portal
- ✅ Suíte de testes cobre auth, permissões, sessões, LGPD (24 testes)
- ⬜ F10: backup/restore do academy.db documentado; rate limit global; CORS explícito p/ API pública
