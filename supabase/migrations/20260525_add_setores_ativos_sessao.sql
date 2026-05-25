-- Coluna que guarda os setores nos quais o atendente está ATIVO na sessão atual.
-- O atendente seleciona um subconjunto dos seus `colaboradores_setores` quando
-- fica online. Tickets só são distribuídos pra atendentes que (a) estão online
-- e (b) têm o setor do ticket presente neste array.
--
-- Reset: quando o atendente fica offline (manualmente ou por heartbeat stale),
-- o array volta pra '{}'.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS setores_ativos_sessao uuid[] NOT NULL DEFAULT '{}';

-- Índice GIN pra acelerar `WHERE setor_id = ANY(setores_ativos_sessao)`
-- usado pelas funções de distribuição (queue processor + distribution).
CREATE INDEX IF NOT EXISTS idx_colaboradores_setores_ativos
  ON colaboradores USING GIN (setores_ativos_sessao);
