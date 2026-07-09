# Villela Academy — Roadmap (fases 2–10)

FASE 0 (diagnóstico), FASE 1 (fundação) e FASE 2 (produtos e cursos) concluídas
em 08/07/2026 — ver README. Cada fase termina com: testes verdes na suíte,
checklist de segurança da fase fechado, doc do assunto atualizado. Ordem pensada
para vender o quanto antes (F3→F4 é o caminho crítico até a primeira venda).

## ✅ FASE 2 — Produtos e cursos (CONCLUÍDA 08/07/2026)
Entregue: produtos de 6 tipos com fluxo editorial completo (rascunho→revisão→
aprovado→publicado→pausado/suspenso/removido, transições validadas por papel);
builder (módulos, aulas de 6 tipos, materiais, aula de degustação); upload
privado base64 (10 MB; PDF/imagem/áudio/ZIP) com entrega protegida por
matrícula + download_logs; vídeo por URL externa (embed YouTube/Vimeo) até a F7;
área do aluno real (biblioteca, curso, player, progresso, continuar de onde
parou); matrícula cortesia (produtor/admin/staff); moderação no painel admin e
no staff. 39 testes.

## FASE 3 — Marketplace e páginas de venda
Vitrine pública (/academy/marketplace), categorias, busca, página do curso e
do produtor (slug), SEO/OG; página de venda por seções (headline, benefícios,
depoimentos, FAQ, garantia, CTA) com templates; avaliações de alunos;
moderação editorial ativa (fila de revisão + denúncias). Termos do
Produtor/Afiliado e políticas (MINUTA → OAB).

## FASE 4 — Checkout e pagamentos (Mercado Pago)
Checkout Pro (Pix/cartão), pedidos (orders/order_items/payments), webhook
validado + payloads salvos + idempotência, liberação automática SÓ pós-
confirmação, página de obrigado, pagamento pendente/recusado, reembolso
básico, recibos. Reaproveitar mpFetch injetado (padrão vsm/vpe/vdocs).
⚠️ Pré-requisito comercial: Augusto definir comissão da plataforma.

## FASE 5 — Afiliados e comissões
Links rastreáveis (?ref=), cookie de atribuição (prazo configurável), cliques/
conversões, regras de comissão por produto, extrato (pendente/disponível/
bloqueada), bloqueio por reembolso/chargeback, split PREPARADO (cálculo interno
primeiro; split real do MP quando houver volume). Painel do afiliado completo.

## FASE 6 — Assinaturas e clubes
Planos recorrentes (preapproval MP — padrão billing do vsm/legal-saas), clube
de cursos, renovação, inadimplência/dunning, acesso condicionado à assinatura
ativa, upgrade/downgrade.

## FASE 7 — Vídeo, proteção e escala
Storage S3-compatível (Cloudflare R2 ou similar), URLs assinadas com expiração,
player com proteção, thumbnails, processamento assíncrono, watermark em PDF,
logs de visualização/download, CDN.

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
