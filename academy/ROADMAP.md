# Villela Academy — Roadmap (fases 2–10)

🏁 **ROADMAP 100% CONCLUÍDO — FASES 0–10 em produção (08–09/07/2026).**
Diagnóstico, fundação, produtos e cursos, marketplace, checkout Mercado Pago,
afiliados e comissões, assinaturas e clubes, storage/URLs assinadas/vídeo,
comunicações, IA e governança. 101 testes na suíte. O que resta é comercial
(marca, domínio, 1º produtor) e as pendências externas listadas no fim.

## ✅ FASE 2 — Produtos e cursos (CONCLUÍDA 08/07/2026)
Entregue: produtos de 6 tipos com fluxo editorial completo (rascunho→revisão→
aprovado→publicado→pausado/suspenso/removido, transições validadas por papel);
builder (módulos, aulas de 6 tipos, materiais, aula de degustação); upload
privado base64 (10 MB; PDF/imagem/áudio/ZIP) com entrega protegida por
matrícula + download_logs; vídeo por URL externa (embed YouTube/Vimeo) até a F7;
área do aluno real (biblioteca, curso, player, progresso, continuar de onde
parou); matrícula cortesia (produtor/admin/staff); moderação no painel admin e
no staff. 39 testes.

## ✅ FASE 3 — Marketplace e páginas de venda (CONCLUÍDA 08/07/2026)
Entregue: vitrine pública `/academy/marketplace` (busca + categorias, só
publicados), página do curso `/academy/cursos/<slug>` server-rendered com
SEO/OG e seções da página de venda (headline, vídeo, promessa, benefícios,
para quem, aprender, conteúdo com degustação, bônus, depoimentos+avaliações,
garantia, FAQ, CTA de interesse→lead+alerta), página do produtor
`/academy/produtores/<slug>`, capa pública (só de publicado), editor de página
de venda no painel do produtor, avaliações (só matriculado, 1 por aluno,
moderáveis), denúncias com fila no admin/staff, Termos do Produtor/Afiliado e
Política de Reembolso (MINUTA → OAB). 49 testes.

## ✅ FASE 4 — Checkout e pagamentos (CONCLUÍDA 08/07/2026)
Entregue: Checkout Pro do MP (Pix/cartão) de produto único em
`/academy/checkout/<slug>` (login inline), pedidos com snapshot de comissão
(**plataforma 10% — decisão oficial**, líquido do produtor calculado),
webhook idempotente com payloads salvos (webhook_events/payment_events),
**liberação SÓ por webhook ou consulta segura** (retorno do navegador nunca
libera — testado), página /academy/obrigado com acompanhamento, produto grátis
matricula direto, reembolso admin/staff (estorna no MP + revoga acesso +
registra), compras do aluno, vendas do produtor (líquido), KPIs GMV/receita.
Pendências herdadas: cupons/order bump (futuro), carrinho multi-item (futuro),
recibos/NF (validar com contador). 62 testes.

## ✅ FASE 5 — Afiliados e comissões (CONCLUÍDA 08/07/2026)
Entregue: links rastreáveis por (afiliado, produto) `?ref=<código>`, cookie de
atribuição `academy_ref` (30 dias, configurável), cliques/conversões por link,
atribuição estrita no checkout (mesmo produto; nunca auto-compra nem o
produtor), comissão criada na venda paga com snapshot do % (**afiliado 10%
padrão — oficial**; produto sobrepõe 0–90, 0 desliga), ciclo pendente →
disponível (pós-garantia, liberação preguiçosa) → paga (repasse manual
admin/staff), **cancelada em reembolso/chargeback**, extrato/saldos no painel
do afiliado, produtos afiliáveis com simulação de ganho, comissões no
admin/staff. Split real do MP fica p/ quando houver volume (o cálculo interno
já separa as três partes em cada pedido). 72 testes.

## ✅ FASE 6 — Assinaturas e clubes (CONCLUÍDA 08/07/2026)
Entregue: **clube = tipo de produto** com mensalidade (preapproval do MP,
padrão vsm/legal-saas) que dá acesso ao conteúdo próprio + produtos incluídos
do MESMO produtor (club_items, gerenciados no painel); acesso condicionado a
assinatura ATIVA (`temAcesso` unifica matrícula+assinatura em mídia, aulas,
progresso e avaliações); ativação/pausa/cancelamento via webhook do preapproval;
**cada cobrança recorrente vira pedido** (tipo 'assinatura', plataforma 10%,
GMV/receita unificados, idempotente por payment id); pagamento em dia reativa
assinatura pausada (inadimplência); cancelamento pelo assinante/admin/staff
encerra o acesso na hora; biblioteca mostra assinaturas; KPIs assinaturas
ativas + MRR. Afiliado não comissiona assinatura (melhoria futura);
upgrade/downgrade entre clubes = cancelar e assinar outro (documentado).
80 testes.

## ✅ FASE 7 — Vídeo, proteção e escala (CONCLUÍDA 09/07/2026)
Entregue: **camada de storage abstrata** (`storage.js`) com driver local +
driver **S3-compatível completo** (R2/AWS/Backblaze; assinatura SigV4 sem SDK)
ativado só por env `ACADEMY_S3_*`; **URLs assinadas com expiração** para toda
mídia nos dois drivers (local = HMAC próprio em `/academy/media-s`, sem cookie;
s3 = presigned GET do bucket) emitidas por `/academy/api/media/:id/link` após
autorização; **upload GRANDE de vídeo direto ao bucket** (presigned PUT até
2 GB, iniciar→enviar→confirmar com HEAD; o arquivo não passa pelo servidor);
player de vídeo nativo no aluno via URL assinada; logs de emissão e consumo.
Pendências documentadas: ⚠️ criar conta/bucket R2 e setar env (decisão/custo
do Augusto — sem isso vídeo segue por URL externa); watermark real em PDF
(exige pdf-lib); transcode/thumbnail (exige worker/ffmpeg — quando houver
volume). 84 testes.

## ✅ FASE 8 — Comunicação e automações (CONCLUÍDA 09/07/2026)
Entregue: e-mails transacionais com templates da marca (boas-vindas +
**verificação de e-mail**, **recuperação de senha** com token 30 min que
derruba sessões, compra paga → comprador e produtor, reembolso, assinatura
ativa/pausada/cancelada, matrícula cortesia, perfil aprovado/rejeitado),
**notificações internas** (sininho no painel, badge + marcar lidas),
**pedido abandonado** (lembrete único por e-mail p/ pendente entre 1h e 48h;
rotina horária + disparo manual no staff), **webhook de saída assinado**
(HMAC `X-Academy-Signature`) p/ Make/n8n/CRM nos eventos venda.paga,
lead.novo, assinatura.ativa e reembolso (config `webhook_saida` via staff),
log completo em `notification_logs`. Tudo best-effort — comunicação nunca
derruba o fluxo. WhatsApp automático a clientes NÃO entrou (regra da casa:
business só com template aprovado; alertas ao dono já saem). 91 testes.

## ✅ FASE 9 — IA (CONCLUÍDA 09/07/2026)
Entregue (padrão vdocs: ANTHROPIC_API_KEY direta, lista de modelos com
fallback, mock p/ teste): **5 agentes** — criador de curso (estrutura sugerida
→ botão APLICAR cria módulos/aulas rascunho), copywriter (gera as seções da
página de venda no formato do editor → aplicar), pedagógico (avaliação
didática + quiz sugerido baseado SÓ no conteúdo real), **suporte ao aluno**
(escopo = APENAS o conteúdo a que ele tem acesso — testado) e relatório
executivo do admin (KPIs reais → análise). Guardrails: nunca inventa, avisa
quando falta informação, saída é SUGESTÃO (aplicar é ação humana). Uso logado
em `ai_usage_logs` (tokens + custo estimado, visível no staff) e **limite
diário por usuário** (config `ia.consultas_dia`, padrão 30 → 429). 96 testes.

## ✅ FASE 10 — Governança (CONCLUÍDA 09/07/2026)
Entregue: **certificados de conclusão** (100% das aulas → código único
`VA-...`, página pública de validação imprimível, idempotente), **tickets de
suporte** (usuário abre/responde; admin e staff respondem — c/ sininho — e
fecham), **relatórios avançados** (série mensal de 6 meses: GMV/receita/
vendas/novos usuários/matrículas + conversão de pedidos + churn de
assinaturas), **2FA opcional TOTP** (RFC 6238, padrão vdocs: gerar → app
autenticador → ativar; login pede o código; desativar exige código),
**hardening** (headers de segurança em todo o módulo; rate limit de API
600 req/min/IP em produção) e **backup/restore documentado** no README.
Decisões: monetização segue SÓ por comissão (10%) — planos/mensalidade de
produtor exigem decisão comercial; comunidades e API pública ficam no
backlog pós-roadmap (sob demanda real). 101 testes.

## Backlog pós-roadmap (sob demanda)
- Planos/mensalidade de produtor (Starter/Pro/Business) — após decisão comercial
- Comunidades por curso/produtor · API pública com chaves · quizzes formais c/ nota
- Split automático do MP · acesso até o fim do ciclo pago no cancelamento
- Watermark PDF (pdf-lib) · transcode/thumbnails de vídeo (worker) · cupons/order bump

## Pendências que dependem do Augusto (não técnicas)
- Marca definitiva ("Villela Academy" é provisório) e identidade
- Comissão da plataforma, comissão padrão de afiliado, política de reembolso (números)
- Revisão OAB dos termos/políticas antes de operar comercialmente
- Domínio (sugestão: academy.villelastay.com.br / cursos.villelastay.com.br — redirect já pronto)
- Primeiro produtor piloto (pode ser a própria Villela: cursos de hospedagem/gestão)
