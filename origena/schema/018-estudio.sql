-- =====================================================================
-- ORIGENA — 018 Studio (fase 3.1, §21).
--
-- NÃO CRIA TABELA NENHUMA, e isso é o ponto. A cadeia de derivação foi
-- desenhada na Fase 4 justamente para este dia: `media.derivado_de`,
-- `papel`, `ai_class`, `derivacao` jsonb, e duas travas de banco que
-- valem mais que qualquer código —
--   `original_sem_ia`     : original NUNCA é conteúdo de IA;
--   `derivado_tem_papel`  : derivado nunca se disfarça de original.
-- O Studio só acrescenta LINHAS ao registry de provedores.
--
-- POR QUE TRÊS CAPABILITIES, E NÃO UMA COM "MODO". O registry é a tabela
-- de preços e de disponibilidade: separar deixa o Augusto cobrar
-- diferente por restaurar e por colorizar, e desligar uma sem derrubar as
-- outras. Um "modo" dentro do payload esconderia isso do painel.
--
-- COLORIZAR É PALPITE, E O PRODUTO DIZ ISSO. Restaurar recupera o que
-- está lá; colorizar INVENTA cor que ninguém registrou. Por isso a
-- `ai_class` difere: `AI_RESTORED` para restauração e ampliação (fiel ao
-- que existe) e `AI_ENHANCED` para colorização — e a tela mostra o selo.
--
-- CUSTO E PREÇO. Uma edição custa ~US$ 0,04 (R$ 0,22 a 5,40). A 3
-- créditos (R$ 0,60) a margem fica em ~63%, na mesma faixa das outras
-- operações. A suíte falha se alguém puser preço abaixo do custo.
-- =====================================================================

INSERT INTO provider_registry (provider, model, capability, ativo, prioridade,
  creditos, custo_estimado_centavos, margem_min_bp, notas)
VALUES
  ('google', 'gemini-2.5-flash-image', 'restaurar_foto', true, 5, 3, 22, 3000,
   'Studio: recupera o que está na foto. NUNCA altera rosto, corpo ou cenário.'),
  ('google', 'gemini-2.5-flash-image', 'colorizar_foto', true, 5, 3, 22, 3000,
   'Studio: cor é INTERPRETAÇÃO, não registro. Sai como AI_ENHANCED, com selo.'),
  ('google', 'gemini-2.5-flash-image', 'ampliar_foto', true, 5, 3, 22, 3000,
   'Studio: mais definição sem inventar detalhe — sobretudo em rosto.')
ON CONFLICT (provider, model, capability) DO UPDATE SET ativo = true;

-- Animação (imagem → vídeo, Veo) fica DECLARADA e desligada: o preço por
-- segundo de vídeo é outra ordem de grandeza e precisa da conta feita
-- antes de virar botão. Ligar é UPDATE, como sempre.
INSERT INTO provider_registry (provider, model, capability, ativo, prioridade,
  creditos, custo_estimado_centavos, margem_min_bp, notas)
VALUES ('google', 'veo-3.1-fast-generate-preview', 'animar_foto', false, 5, 0, 0, 3000,
  'DESLIGADA: vídeo custa por segundo e a conta ainda não foi feita (3.1b).')
ON CONFLICT (provider, model, capability) DO NOTHING;
