-- =============================================
-- Encerramento de tickets MORTOS — caso #97520
-- =============================================
-- Regra nova, que convive com `encerrar-tickets-inativos` (20260511_v2) sem
-- substituí-la:
--
--   inativos (v2): último a falar foi o ATENDENTE e o cliente não voltou em
--                  X minutos  ->  encerra. Quando o último a falar é o cliente,
--                  NUNCA encerra — de propósito, para não penalizar quem está
--                  esperando resposta.
--   mortos (aqui): ninguém falou — nem cliente, nem atendente, nem bot — há X
--                  horas (padrão 24)  ->  encerra, seja quem for o último.
--
-- Sem esta segunda regra o ticket abandonado com o cliente por último fica
-- aberto para sempre. Em 18/08/2026 havia 29 tickets nesse estado, o mais novo
-- com 88h e a mediana em 1441h (60 dias); em 25 deles o último remetente era o
-- cliente.
--
-- Executado via pg_cron a cada 10 minutos — a janela é de horas, não precisa
-- do ciclo de 2 min da regra de inatividade.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -----------------------------------------------------------------
-- 1. Config por setor — começa DESLIGADA em todo mundo
-- -----------------------------------------------------------------
-- Ligar setor a setor é decisão da supervisão: encerrar em massa 60 dias de
-- backlog sem ninguém revisar mudaria o painel de 35 setores de uma vez.
ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS encerramento_morto_ativo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE setores
  ADD COLUMN IF NOT EXISTS encerramento_morto_horas INTEGER NOT NULL DEFAULT 24;

ALTER TABLE setores DROP CONSTRAINT IF EXISTS setores_encerramento_morto_horas_min;
ALTER TABLE setores ADD CONSTRAINT setores_encerramento_morto_horas_min
  CHECK (encerramento_morto_horas >= 1);

-- -----------------------------------------------------------------
-- 2. Job agendado — a cada 10 minutos
-- -----------------------------------------------------------------
-- Sobre o filtro de remetente: NÃO é lista fechada. Além de
-- cliente/colaborador/bot, o banco tem 'cliente-nexus', 'bot-nexus',
-- 'cliente-widget', 'supervisor' e o nome da persona do bot gravado pelo n8n.
-- Uma lista fechada trataria uma conversa viva do Nexus como morta, então o
-- critério é o inverso: tudo conta como interação, MENOS 'sistema' — que é
-- ruído do próprio produto (aviso de transferência, aviso de encerramento) e
-- não pode reiniciar o relógio de um ticket abandonado.
--
-- COALESCE para criado_em: ticket sem mensagem nenhuma também morre, contando
-- da criação.
--
-- Sobre a forma da consulta: é subconsulta correlacionada, e não um
-- DISTINCT ON/GROUP BY sobre `mensagens` inteira como no job de inatividade.
-- A tabela passa de 1,6 milhão de linhas só nos últimos 90 dias — agregá-la
-- toda a cada execução para olhar ~166 tickets abertos é varredura completa à
-- toa. Correlacionada, cada candidato vira uma busca em
-- idx_mensagens_ticket_enviado (ticket_id, enviado_em DESC), criado na
-- migration 20260424.
SELECT cron.schedule(
  'encerrar-tickets-mortos',
  '*/10 * * * *',
  $job$
  WITH alvos AS (
    SELECT t.id
    FROM tickets t
    JOIN setores s ON s.id = t.setor_id
    WHERE s.encerramento_morto_ativo = true
      AND t.status IN ('aberto', 'em_atendimento')
      AND COALESCE(t.is_disparo, false) = false
      AND COALESCE(
            (SELECT MAX(m.enviado_em)
               FROM mensagens m
              WHERE m.ticket_id = t.id
                AND m.remetente IS DISTINCT FROM 'sistema'),
            t.criado_em
          ) < NOW() - (s.encerramento_morto_horas || ' hours')::interval
  ),
  fechados AS (
    UPDATE tickets
    SET status = 'encerrado', encerrado_em = NOW()
    WHERE id IN (SELECT id FROM alvos)
    RETURNING id
  )
  INSERT INTO mensagens (ticket_id, remetente, conteudo, tipo, enviado_em)
  SELECT id, 'sistema', 'Ticket encerrado automaticamente por abandono: sem nenhuma interação no período configurado pelo setor.', 'texto', NOW()
  FROM fechados;
  $job$
);

-- -----------------------------------------------------------------
-- Verificação (rodar depois de aplicar):
-- -----------------------------------------------------------------
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'encerrar-tickets-mortos';
-- SELECT status, return_message, start_time FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'encerrar-tickets-mortos')
--   ORDER BY start_time DESC LIMIT 5;

-- -----------------------------------------------------------------
-- Rollback:
-- -----------------------------------------------------------------
-- SELECT cron.unschedule('encerrar-tickets-mortos');
-- ALTER TABLE setores DROP COLUMN IF EXISTS encerramento_morto_ativo;
-- ALTER TABLE setores DROP COLUMN IF EXISTS encerramento_morto_horas;
