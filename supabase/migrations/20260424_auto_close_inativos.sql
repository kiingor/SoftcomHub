-- =============================================
-- Encerramento automático de tickets por inatividade
-- =============================================
-- Fecha tickets sem interação há X minutos, configurável por setor.
-- Critério de inatividade: tempo desde a última mensagem (cliente ou colaborador).
-- Tickets de disparo (is_disparo = true) são ignorados (possuem regra própria de 12 min).
-- Executado via pg_cron a cada 2 minutos.
-- =============================================

-- Extensão (no-op se já habilitada; deve ser executada no database `postgres`)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -----------------------------------------------------------------
-- 1. Ajusta CHECK constraint de tickets.status pra incluir 'avaliar'
--    (prepara flow futuro de avaliação, não usado por este cron)
-- -----------------------------------------------------------------
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('aberto', 'em_atendimento', 'avaliar', 'encerrado'));

-- -----------------------------------------------------------------
-- 2. Ajusta CHECK constraint de mensagens.remetente pra aceitar 'sistema'
--    (idempotente — em produção o constraint migration-completa.sql:149
--     já inclui 'sistema', mas garantimos aqui)
-- -----------------------------------------------------------------
ALTER TABLE mensagens DROP CONSTRAINT IF EXISTS mensagens_remetente_check;
ALTER TABLE mensagens ADD CONSTRAINT mensagens_remetente_check
  CHECK (remetente IN ('cliente', 'colaborador', 'bot', 'sistema'));

-- -----------------------------------------------------------------
-- 3. Config por setor
-- -----------------------------------------------------------------
ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS encerramento_auto_ativo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS encerramento_auto_minutos INTEGER NOT NULL DEFAULT 30;

ALTER TABLE setores DROP CONSTRAINT IF EXISTS setores_encerramento_auto_minutos_min;
ALTER TABLE setores ADD CONSTRAINT setores_encerramento_auto_minutos_min
  CHECK (encerramento_auto_minutos >= 15);

-- -----------------------------------------------------------------
-- 4. Índices de suporte
-- -----------------------------------------------------------------
-- Acelera a subquery MAX(enviado_em) por ticket executada no cron
CREATE INDEX IF NOT EXISTS idx_mensagens_ticket_enviado
  ON mensagens(ticket_id, enviado_em DESC);

-- Índice parcial em tickets ativos — pequeno, sem custo de manutenção em encerrados/avaliar
CREATE INDEX IF NOT EXISTS idx_tickets_ativos_setor
  ON tickets(setor_id)
  WHERE status IN ('aberto', 'em_atendimento');

-- -----------------------------------------------------------------
-- 5. Job agendado — a cada 2 minutos
-- -----------------------------------------------------------------
-- cron.schedule() é idempotente pelo nome: se já existir, atualiza.
SELECT cron.schedule(
  'encerrar-tickets-inativos',
  '*/2 * * * *',
  $job$
  WITH alvos AS (
    SELECT t.id
    FROM tickets t
    JOIN setores s ON s.id = t.setor_id
    WHERE s.encerramento_auto_ativo = true
      AND t.status IN ('aberto', 'em_atendimento')
      AND COALESCE(t.is_disparo, false) = false
      AND COALESCE(
        (SELECT MAX(m.enviado_em) FROM mensagens m WHERE m.ticket_id = t.id),
        t.criado_em
      ) < NOW() - (s.encerramento_auto_minutos || ' minutes')::interval
  ),
  fechados AS (
    UPDATE tickets
    SET status = 'encerrado', encerrado_em = NOW()
    WHERE id IN (SELECT id FROM alvos)
    RETURNING id
  )
  INSERT INTO mensagens (ticket_id, remetente, conteudo, tipo, enviado_em)
  SELECT id, 'sistema', 'Ticket encerrado automaticamente por inatividade.', 'texto', NOW()
  FROM fechados;
  $job$
);

-- -----------------------------------------------------------------
-- Rollback (executar manualmente se necessário):
-- -----------------------------------------------------------------
-- SELECT cron.unschedule('encerrar-tickets-inativos');
-- DROP INDEX IF EXISTS idx_tickets_ativos_setor;
-- DROP INDEX IF EXISTS idx_mensagens_ticket_enviado;
-- ALTER TABLE setores DROP COLUMN IF EXISTS encerramento_auto_ativo;
-- ALTER TABLE setores DROP COLUMN IF EXISTS encerramento_auto_minutos;
