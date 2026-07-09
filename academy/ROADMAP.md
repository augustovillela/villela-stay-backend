# Villela Academy — Roadmap (fases 2–10)

FASES 0 (diagnóstico), 1 (fundação), 2 (produtos e cursos), 3 (marketplace e
páginas de venda) e 4 (checkout Mercado Pago) concluídas em 08/07/2026 — ver
README. Cada fase termina com: testes verdes na suíte, checklist de segurança
da fase fechado, doc do assunto atualizado. **A plataforma já vende.**

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
