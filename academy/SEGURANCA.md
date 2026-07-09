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
- ⬜ F2: verificação de e-mail no cadastro · ⬜ F10: 2FA opcional (padrão vdocs)

## Autorização
- ✅ Papéis (aluno/produtor/afiliado/admin) + permissões derivadas (`repo.PERMISSOES`)
- ✅ Gate duplo produtor/afiliado: papel E perfil aprovado
- ✅ Admin da Academy só concedido via Portal Staff; admin não altera o próprio status
- ✅ Anti-IDOR: queries sempre escopadas pelo usuário da sessão (`req.usuario.id`)
- ⬜ F2+: revalidar escopo por produtor (produtor só vê os próprios produtos/alunos/vendas)

## Entrada e saída
- ✅ Sanitização/truncamento de toda entrada (`s()`), JSON parse defensivo
- ✅ Escape de HTML em toda renderização (`esc()`), SPA sem innerHTML de dado bruto sem escape
- ✅ `Cache-Control: no-store` em todas as APIs
- ✅ Hash de senha nunca sai na API (`semSegredos`)
- ⬜ F4: validação de CPF/CNPJ; F2: validação de upload (tipo/tamanho/extensão)

## Dados e segredos
- ✅ JWT_SECRET por env (nunca em código/commit); banco fora do git (DATA_DIR)
- ✅ Documento (CPF/CNPJ) e dados de pagamento nunca em página pública; só admin vê
- ⬜ F4: access token do MP só no servidor; webhooks validados; payloads salvos; idempotência
- ⬜ F7: storage privado S3-compatível, URLs assinadas com expiração, anti-hotlink, watermark

## Auditoria e monitoramento
- ✅ `audit_logs`: signup, login (ok/falha), logout, troca de senha, perfis, papéis, status, LGPD, config
- ✅ Auditoria visível ao admin da Academy e ao Portal Staff
- ⬜ F4: log financeiro completo (payment_events/webhook_events) · ⬜ F9: log de IA
- ⬜ F10: alertas de anomalia (picos de falha de login, chargebacks)

## Regras de pagamento (F4 — obrigatórias antes de vender)
- ⬜ Acesso liberado SÓ por webhook confirmado ou consulta segura ao MP (nunca pelo redirect)
- ⬜ Eventos duplicados tratados (idempotency key)
- ⬜ Reembolso/chargeback bloqueia comissão e acesso conforme regra
- ⬜ Sandbox testado antes de produção

## Plataforma
- ✅ Módulo isolado: falha na montagem não derruba o site/portal
- ✅ Suíte de testes cobre auth, permissões, sessões, LGPD (24 testes)
- ⬜ F10: backup/restore do academy.db documentado; rate limit global; CORS explícito p/ API pública
