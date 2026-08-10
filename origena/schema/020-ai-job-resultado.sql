-- =====================================================================
-- ORIGENA — 020 o job de IA aponta o que PRODUZIU.
--
-- `ai_jobs` guardava entrada, custo, status e erro — mas não o resultado.
-- Para texto isso bastava (a biografia sabe seu job). Para o Studio não:
-- a família pede uma restauração, o worker gera um DERIVADO, e sem esta
-- coluna não há como voltar do job para a foto que ele criou — nem para
-- mostrar "pronto, é esta", nem para auditar depois.
--
-- O `DATABASE.md` já previa `resultado_media_id` desde a Fase 7; o schema
-- é que não tinha. Documento e banco divergiam, e quem descobriu foi o
-- primeiro código a usar a coluna.
-- =====================================================================

ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS resultado_media_id uuid REFERENCES media(id);
