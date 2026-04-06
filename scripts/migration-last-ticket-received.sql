-- Adiciona campo para rastrear quando o colaborador recebeu o ultimo ticket.
-- Usado pelo round-robin para desempate justo (em vez de criado_em do ticket).
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS last_ticket_received_at TIMESTAMPTZ;
