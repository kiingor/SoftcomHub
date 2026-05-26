-- ════════════════════════════════════════════════════════════════════════
-- setores_ativos_sessao — subset de setores onde o atendente VAI atender
-- ════════════════════════════════════════════════════════════════════════
--
-- Diferença entre as duas tabelas/colunas:
--
--   colaboradores_setores         → "está QUALIFICADO pra atender o setor"
--                                   (relação de capacitação/permissão)
--
--   colaboradores.setores_ativos_sessao → "VAI atender o setor hoje"
--                                          (subset escolhido pelo admin)
--
-- Distribuição de tickets filtra por `setores_ativos_sessao`. Admin controla
-- via UI; atendente não tem como mexer (não pode "fugir" de uma fila).
--
-- A configuração é PERMANENTE até admin alterar (não reseta com logout).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS setores_ativos_sessao uuid[] NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────
-- SEED: pra atendentes existentes, ativa todos os setores em que ele está
-- vinculado. Failure mode seguro — sistema continua funcionando como hoje
-- até o admin restringir.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE colaboradores c
SET setores_ativos_sessao = COALESCE(
  (
    SELECT array_agg(DISTINCT cs.setor_id)
    FROM colaboradores_setores cs
    WHERE cs.colaborador_id = c.id
  ),
  '{}'
)
WHERE c.setores_ativos_sessao = '{}'
   OR c.setores_ativos_sessao IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGERS: mantêm `setores_ativos_sessao` em sincronia com vínculos.
--   - novo vínculo  → setor entra na lista (DEFAULT: ativo)
--   - vínculo removido → setor sai da lista
-- Cobre todos os caminhos de modificação (UI, n8n, scripts ad-hoc).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_setores_ativos_on_cs_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Adiciona o setor ao array apenas se ainda não estiver lá (idempotente)
  UPDATE colaboradores
  SET setores_ativos_sessao = array_append(setores_ativos_sessao, NEW.setor_id)
  WHERE id = NEW.colaborador_id
    AND NOT (NEW.setor_id = ANY(setores_ativos_sessao));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cs_insert_sync_setores_ativos ON colaboradores_setores;
CREATE TRIGGER trg_cs_insert_sync_setores_ativos
  AFTER INSERT ON colaboradores_setores
  FOR EACH ROW EXECUTE FUNCTION sync_setores_ativos_on_cs_insert();

CREATE OR REPLACE FUNCTION sync_setores_ativos_on_cs_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE colaboradores
  SET setores_ativos_sessao = array_remove(setores_ativos_sessao, OLD.setor_id)
  WHERE id = OLD.colaborador_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cs_delete_sync_setores_ativos ON colaboradores_setores;
CREATE TRIGGER trg_cs_delete_sync_setores_ativos
  AFTER DELETE ON colaboradores_setores
  FOR EACH ROW EXECUTE FUNCTION sync_setores_ativos_on_cs_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- Índice GIN pra acelerar filtros de distribuição
-- `WHERE setor_id = ANY(setores_ativos_sessao)`
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_colaboradores_setores_ativos
  ON colaboradores USING GIN (setores_ativos_sessao);
