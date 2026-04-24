-- =============================================
-- Disparos em lote — agrupamento de tickets gerados por um mesmo envio
-- =============================================
-- Adiciona tabela disparos_lote (cabeçalho do envio) e FKs em tickets e
-- disparo_logs para rastreabilidade. Um disparo cria N tickets + N linhas em
-- disparo_logs, todos ligados ao mesmo lote.
-- =============================================

-- -----------------------------------------------------------------
-- 1. Tabela de agrupamento
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disparos_lote (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  tipo_origem TEXT NOT NULL CHECK (tipo_origem IN ('xls', 'clientes_hub')),
  mensagem TEXT NOT NULL,
  destino_tipo TEXT NOT NULL CHECK (destino_tipo IN ('subsetor', 'atendentes')),
  subsetor_id UUID REFERENCES subsetores(id) ON DELETE SET NULL,
  atendentes_ids UUID[] DEFAULT NULL,
  total_destinatarios INTEGER NOT NULL DEFAULT 0,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_falhados INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluido', 'falhado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disparos_lote_setor_criado
  ON disparos_lote(setor_id, criado_em DESC);

-- -----------------------------------------------------------------
-- 2. FK em tickets — link para o lote de origem
-- -----------------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS disparo_lote_id UUID REFERENCES disparos_lote(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_disparo_lote
  ON tickets(disparo_lote_id)
  WHERE disparo_lote_id IS NOT NULL;

-- -----------------------------------------------------------------
-- 3. FK em disparo_logs — compat com histórico existente
-- -----------------------------------------------------------------
ALTER TABLE disparo_logs
  ADD COLUMN IF NOT EXISTS disparo_lote_id UUID REFERENCES disparos_lote(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disparo_logs_lote
  ON disparo_logs(disparo_lote_id)
  WHERE disparo_lote_id IS NOT NULL;

-- -----------------------------------------------------------------
-- Rollback (executar manualmente se necessário):
-- -----------------------------------------------------------------
-- ALTER TABLE disparo_logs DROP COLUMN IF EXISTS disparo_lote_id;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS disparo_lote_id;
-- DROP TABLE IF EXISTS disparos_lote;
