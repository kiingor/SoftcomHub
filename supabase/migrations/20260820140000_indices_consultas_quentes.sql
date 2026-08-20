-- =============================================
-- Índices para as consultas que estavam queimando a CPU do banco
-- =============================================
-- Sintoma (20/08/2026): atendentes relatando chat lento para abrir e lento a
-- cada troca de conversa. Medido de fora, o banco alternava entre saudável
-- (0,21s numa consulta trivial) e saturado (2,42s na MESMA consulta) — e no
-- pico até o `/auth/v1/health`, que nem toca nas tabelas, subia de 0,22s para
-- 1,07s. Sintoma de instância sem CPU, não de consulta específica.
--
-- O painel do Supabase confirmou: CPU em 100% (User) durante a hora inteira,
-- com IOwait praticamente zero. Não é disco, é processamento.
--
-- O `pg_stat_statements` mostrou onde a CPU estava indo:
--
--   39.186 chamadas · 275,7ms · 10.802s   tickets  (colaborador_id, id)
--    9.469 chamadas · 699,7ms ·  6.625s   mensagens (id, ticket_id, …)
--
-- Nenhuma das duas tinha índice que servisse. Os índices existentes em
-- `tickets` são por `setor_id` (20260424) e os de transbordo/disparo; em
-- `mensagens`, só (ticket_id, enviado_em) e o de reply. Filtrar por
-- `colaborador_id` ou por `cliente_id` significava varrer a tabela inteira —
-- 69 mil linhas em tickets, 1,85 milhão em mensagens — a cada chamada.
--
-- IMPORTANTE: rodar cada CREATE INDEX SOZINHO no SQL Editor. CONCURRENTLY não
-- funciona dentro de bloco de transação, e é ele que evita travar escrita numa
-- tabela de produção enquanto o índice é construído.
-- =============================================

-- -----------------------------------------------------------------
-- 1. tickets por atendente — a consulta nº 1 em CPU
-- -----------------------------------------------------------------
-- Origem: lib/ticket-queue-processor.ts. Duas consultas por chamada, ambas
-- filtrando `colaborador_id IN (elegíveis)`: uma pela carga aberta (vira o teto
-- de tickets por atendente) e outra pelo que cada um já recebeu hoje (vira a
-- ordem da fila).
--
-- O volume de chamadas vem do WorkDesk: cada aba dispara auto-assign a cada 30s,
-- e com 72 atendentes online isso dá ~144 disparos por minuto, além do cron do
-- Vercel a cada minuto.
--
-- O mesmo índice serve o `fetchTickets` do WorkDesk, que filtra por
-- colaborador_id + status a cada carga de tela.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_colaborador_status
  ON tickets (colaborador_id, status);

-- Segunda consulta do par: `colaborador_id` + janela do dia.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_colaborador_criado
  ON tickets (colaborador_id, criado_em DESC);

-- -----------------------------------------------------------------
-- 2. mensagens por cliente — a consulta nº 2 em CPU, e a do vídeo
-- -----------------------------------------------------------------
-- Origem: fetchMensagens, no WorkDesk. Ao abrir uma conversa ele busca, além
-- das mensagens do próprio ticket (essa já usa idx_mensagens_ticket_enviado),
-- o histórico do MESMO CLIENTE em outros tickets e as mensagens órfãs do bot —
-- as duas filtrando por `cliente_id` + janela de `enviado_em`.
--
-- Sem índice, cada abertura de chat varria 1,85 milhão de linhas duas vezes.
-- Medido em produção: a consulta do histórico levava 1,75-1,85s para devolver
-- LISTA VAZIA. É o "carregando" que o atendente vê a cada troca de conversa.
--
-- A ordem (cliente_id, enviado_em) atende os três filtros: igualdade no
-- cliente, corte por data e ordenação.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_cliente_enviado
  ON mensagens (cliente_id, enviado_em DESC);

-- -----------------------------------------------------------------
-- Verificação (rodar depois de aplicar)
-- -----------------------------------------------------------------
-- Os três devem aparecer como "valid":
-- SELECT indexrelid::regclass AS indice, indisvalid AS valido
--   FROM pg_index
--  WHERE indexrelid::regclass::text IN (
--          'idx_tickets_colaborador_status',
--          'idx_tickets_colaborador_criado',
--          'idx_mensagens_cliente_enviado');
--
-- O plano deve deixar de ser Seq Scan:
-- EXPLAIN ANALYZE SELECT colaborador_id, id FROM tickets
--   WHERE colaborador_id = '<uuid>' AND status IN ('aberto','em_atendimento');
-- EXPLAIN ANALYZE SELECT id FROM mensagens
--   WHERE cliente_id = '<uuid>' AND enviado_em >= now() - interval '1 day';
--
-- Depois, zerar a estatística para medir o efeito limpo:
-- SELECT pg_stat_statements_reset();

-- -----------------------------------------------------------------
-- Rollback
-- -----------------------------------------------------------------
-- DROP INDEX CONCURRENTLY IF EXISTS idx_tickets_colaborador_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_tickets_colaborador_criado;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_mensagens_cliente_enviado;
