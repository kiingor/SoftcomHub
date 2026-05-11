-- =============================================
-- Encerramento automático por inatividade — v2 (opção D)
-- =============================================
-- Nova regra: só fecha tickets em que a ÚLTIMA mensagem foi do atendente
-- (remetente='colaborador') e já se passou X minutos sem o cliente retornar.
--
-- Isso elimina o caso problemático em que o cliente está esperando resposta
-- e o ticket era mantido aberto (regra antiga) ou fechado incorretamente
-- penalizando o cliente educado (regra B).
--
-- Tickets em que a última mensagem foi do cliente NUNCA fecham por inatividade
-- — eles dependem do atendente responder (vão aparecer como atrasados no painel).
-- =============================================

-- Reescreve o cron job (cron.schedule é idempotente pelo nome)
SELECT cron.schedule(
  'encerrar-tickets-inativos',
  '*/2 * * * *',
  $job$
  WITH ultima_msg AS (
    SELECT DISTINCT ON (ticket_id)
      ticket_id, remetente, enviado_em
    FROM mensagens
    WHERE remetente IN ('cliente', 'colaborador', 'bot')
    ORDER BY ticket_id, enviado_em DESC
  ),
  alvos AS (
    SELECT t.id
    FROM tickets t
    JOIN setores s ON s.id = t.setor_id
    JOIN ultima_msg lm ON lm.ticket_id = t.id
    WHERE s.encerramento_auto_ativo = true
      AND t.status IN ('aberto', 'em_atendimento')
      AND COALESCE(t.is_disparo, false) = false
      AND lm.remetente IN ('colaborador', 'bot')
      AND lm.enviado_em < NOW() - (s.encerramento_auto_minutos || ' minutes')::interval
  ),
  fechados AS (
    UPDATE tickets
    SET status = 'encerrado', encerrado_em = NOW()
    WHERE id IN (SELECT id FROM alvos)
    RETURNING id
  )
  INSERT INTO mensagens (ticket_id, remetente, conteudo, tipo, enviado_em)
  SELECT id, 'sistema', 'Ticket encerrado automaticamente por inatividade do cliente após resposta do atendente.', 'texto', NOW()
  FROM fechados;
  $job$
);

-- -----------------------------------------------------------------
-- Rollback: restaurar regra antiga (fecha por qualquer inatividade)
-- -----------------------------------------------------------------
-- SELECT cron.schedule(
--   'encerrar-tickets-inativos',
--   '*/2 * * * *',
--   $job$
--   WITH alvos AS (
--     SELECT t.id FROM tickets t JOIN setores s ON s.id = t.setor_id
--     WHERE s.encerramento_auto_ativo = true
--       AND t.status IN ('aberto', 'em_atendimento')
--       AND COALESCE(t.is_disparo, false) = false
--       AND COALESCE((SELECT MAX(m.enviado_em) FROM mensagens m WHERE m.ticket_id = t.id), t.criado_em) < NOW() - (s.encerramento_auto_minutos || ' minutes')::interval
--   ),
--   fechados AS (UPDATE tickets SET status='encerrado', encerrado_em=NOW() WHERE id IN (SELECT id FROM alvos) RETURNING id)
--   INSERT INTO mensagens (ticket_id, remetente, conteudo, tipo, enviado_em)
--   SELECT id, 'sistema', 'Ticket encerrado automaticamente por inatividade.', 'texto', NOW() FROM fechados;
--   $job$
-- );
