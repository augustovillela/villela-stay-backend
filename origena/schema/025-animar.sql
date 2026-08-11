-- =====================================================================
-- ORIGENA — 025 Animar (fase 3.1b, §21): foto → vídeo curto (Veo).
--
-- É A ÚNICA OPERAÇÃO DO STUDIO QUE INVENTA. Restaurar, colorizar e
-- ampliar trabalham sobre o que ESTÁ na foto; animar cria movimento que
-- nunca existiu — aquele gesto o bisavô não fez. Por isso ela nasce
-- `AI_GENERATED` (a classe mais forte), o vídeo é MUDO, e o livro e o
-- álbum não a aceitam como registro.
--
-- POR QUE O ÁUDIO FICA DESLIGADO. O Veo gera som e o preço já o inclui —
-- desligar não economiza. É decisão de produto: a família reconhece
-- movimento como efeito e reconheceria a voz como A VOZ do avô. Voz
-- inventada para uma pessoa morta é outra ordem de gravidade.
--
-- OS PARÂMETROS SÃO DO AUGUSTO, decididos em 10/08/2026 com a conta na
-- mesa (USD 1 = R$ 5,0856): teto de R$ 35,00 por vídeo e 10 segundos.
-- Ficam em `config` porque são dele, não meus — e porque o teto precisa
-- pegar aumento de preço do provedor sem depender de eu reparar.
-- =====================================================================

INSERT INTO config (chave, valor, descricao) VALUES
  ('estudio.video_teto_centavos', '3500',
   'Teto de custo por vídeo animado. Acima disto a cotação é RECUSADA. Decidido pelo Augusto em 10/08/2026. A R$ 35 nenhum modelo do catálogo estoura em 10s — o teto é backstop contra aumento de preço e duração maior.'),
  ('estudio.video_segundos_max', '10',
   'Duração máxima do vídeo animado, em segundos. Vídeo se cobra POR SEGUNDO.')
ON CONFLICT (chave) DO NOTHING;

-- Veo 3.1 Fast, 1080p: US$ 0,12/s → 10 s = US$ 1,20 = R$ 6,10 (10/08/2026).
-- 55 créditos cobrem com folga a margem mínima de 30% em qualquer pacote
-- (crédito vale entre R$ 0,17 e R$ 0,25 conforme o tamanho da compra).
UPDATE provider_registry
   SET model = 'veo-3.1-fast-generate-preview',
       ativo = true,
       creditos = 55,
       custo_estimado_centavos = 610,
       margem_min_bp = 3000,
       notas = 'Studio 3.1b: foto → vídeo MUDO de até 10s, 1080p. Sai como AI_GENERATED: é a única operação do Studio que INVENTA. Barrada no livro e no álbum.'
 WHERE provider = 'google' AND capability = 'animar_foto';
