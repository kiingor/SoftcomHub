-- Adiciona contador de hops de transbordo no ticket. Cada vez que o
-- processTicketQueue move um ticket pra um setor receptor por falta de
-- atendente, este contador é incrementado. Protege contra loops onde
-- dois setores apontam um pro outro (A→B→A→B...) — após N hops o
-- ticket é "parado" e marcado pra revisão manual.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS transbordo_hops INT NOT NULL DEFAULT 0;

-- Índice parcial pra encontrar tickets stuck (passaram do limite e ainda
-- estão sem atendente). Útil pra dashboard de fila crítica.
CREATE INDEX IF NOT EXISTS idx_tickets_transbordo_stuck
  ON tickets(transbordo_hops, status)
  WHERE colaborador_id IS NULL AND transbordo_hops >= 3;
