# Villela Academy — Roadmap (fases 2–10)

FASES 0–7 concluídas em 08–09/07/2026 (diagnóstico, fundação, produtos e
cursos, marketplace, checkout Mercado Pago, afiliados e comissões, assinaturas
e clubes, storage/URLs assinadas/vídeo) — ver README. Cada fase termina com:
testes verdes na suíte, checklist de segurança da fase fechado, doc do assunto
atualizado.
**A plataforma vende avulso, comissiona afiliados e cobra assinatura recorrente.**

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

## FASE 8 — Comunicação e automações
E-mails transacionais (compra, acesso, senha, lembretes), WhatsApp via
infraestrutura existente (templates business), carrinho abandonado (com
consentimento), notificações internas, integração Make/n8n e CRM Villela.

## FASE 9 — IA
Agentes: criador de curso, copywriter de página de venda, pedagógico (quizzes),
suporte ao aluno (escopo = conteúdo comprado), comercial e administrativo.
Logs de uso/custo de IA (ai_usage_logs); IA nunca inventa dados e respeita
permissões. Reaproveitar padrão de IA dos módulos vpe/vdocs.

## FASE 10 — SaaS avançado e governança
Planos da plataforma p/ produtores (comissão/mensalidade/híbrido — Starter/
Professional/Business/Enterprise com limites), billing do produtor, quizzes/
certificados com validação pública, comunidades, suporte com tickets/SLA,
relatórios avançados (GMV, churn, conversão), 2FA, backup/restore formal,
revisão jurídica final de todos os documentos, hardening e API pública.

## Pendências que dependem do Augusto (não técnicas)
- Marca definitiva ("Villela Academy" é provisório) e identidade
- Comissão da plataforma, comissão padrão de afiliado, política de reembolso (números)
- Revisão OAB dos termos/políticas antes de operar comercialmente
- Domínio (sugestão: academy.villelastay.com.br / cursos.villelastay.com.br — redirect já pronto)
- Primeiro produtor piloto (pode ser a própria Villela: cursos de hospedagem/gestão)
