-- =============================================================
-- Motivo de abertura pelo Nexus no cache da análise de IA
--
-- A análise precisa ser refeita quando a validação que levou o Nexus a
-- abrir o ticket mudar, mesmo que a conversa permaneça igual.
-- Execute depois de 20260806120000_ticket_analises_ia.sql.
-- =============================================================

SET lock_timeout = '5s';

ALTER TABLE public.ticket_analises_ia
  ADD COLUMN IF NOT EXISTS motivo_abertura_nexus text;

RESET lock_timeout;

-- =============================================================
-- ROLLBACK
-- =============================================================
-- ALTER TABLE public.ticket_analises_ia
--   DROP COLUMN IF EXISTS motivo_abertura_nexus;
