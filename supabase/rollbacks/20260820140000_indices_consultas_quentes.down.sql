-- =============================================
-- ROLLBACK — índices de 20260820140000_indices_consultas_quentes.sql
-- =============================================
-- Este arquivo NÃO fica em supabase/migrations de propósito: se estivesse lá,
-- quem rodasse as migrations em ordem desfaria o índice logo depois de criá-lo.
-- É um script para rodar à mão, no SQL Editor, se e quando fizer falta.
--
-- Índices são reversíveis de verdade: derrubar um não perde dado nenhum, só faz
-- o Postgres voltar a varrer a tabela. O pior que acontece é a lentidão de hoje
-- voltar.
-- =============================================

-- -----------------------------------------------------------------
-- 1. ANTES de derrubar: confira se o índice está sendo usado
-- -----------------------------------------------------------------
-- `idx_scan` é quantas vezes o planejador escolheu o índice. Se estiver alto,
-- ele está pagando por si — a lentidão que você está vendo é outra coisa e
-- derrubá-lo vai piorar.
--
-- SELECT relname AS tabela,
--        indexrelname AS indice,
--        idx_scan AS vezes_usado,
--        pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
--   FROM pg_stat_user_indexes
--  WHERE indexrelname IN (
--          'idx_tickets_colaborador_status',
--          'idx_tickets_colaborador_criado',
--          'idx_mensagens_cliente_enviado')
--  ORDER BY idx_scan DESC;

-- -----------------------------------------------------------------
-- 2. O caso mais provável de dar problema: índice INVÁLIDO
-- -----------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY faz duas passagens na tabela e pode falhar no meio
-- (deadlock, timeout da sessão, aba fechada). Quando falha, o índice FICA lá,
-- marcado como inválido: ocupa espaço, é mantido a cada escrita e não é usado
-- em consulta nenhuma — o pior dos dois mundos.
--
-- Verificação:
-- SELECT indexrelid::regclass AS indice, indisvalid AS valido
--   FROM pg_index
--  WHERE indexrelid::regclass::text IN (
--          'idx_tickets_colaborador_status',
--          'idx_tickets_colaborador_criado',
--          'idx_mensagens_cliente_enviado');
--
-- Qualquer um com `valido = false` deve ser derrubado (comandos abaixo) e
-- recriado do zero. Não existe "consertar" índice inválido.

-- -----------------------------------------------------------------
-- 3. Os comandos
-- -----------------------------------------------------------------
-- ATENÇÃO: o SQL Editor do Supabase envolve tudo em transação, então colar o
-- DROP ... CONCURRENTLY direto lá devolve:
--   ERROR: 25001: DROP INDEX CONCURRENTLY cannot run inside a transaction block
--
-- Mesma saída da criação — dblink abre uma sessão fora da transação:
--
--   CREATE EXTENSION IF NOT EXISTS dblink;
--
--   SELECT dblink_exec(
--     'dbname=' || current_database(),
--     'DROP INDEX CONCURRENTLY IF EXISTS idx_mensagens_cliente_enviado');
--
-- Um por vez. Se preferir sem dblink, apague a palavra CONCURRENTLY: derrubar
-- índice é rápido e o lock dura o tempo do comando, bem menos do que criar.
--
-- Derrubar é rápido (segundos), bem mais barato que criar.

DROP INDEX CONCURRENTLY IF EXISTS idx_mensagens_cliente_enviado;

DROP INDEX CONCURRENTLY IF EXISTS idx_tickets_colaborador_criado;

DROP INDEX CONCURRENTLY IF EXISTS idx_tickets_colaborador_status;

-- -----------------------------------------------------------------
-- 4. O que esperar depois de derrubar
-- -----------------------------------------------------------------
-- O efeito é imediato: o WorkDesk volta a levar ~1,8s por consulta de histórico
-- do cliente e o ticket-queue-processor volta aos ~275ms por chamada, ~144
-- chamadas por minuto. Foi esse conjunto que deixou a CPU do banco em 100%.
--
-- Se a intenção era só testar, dá para recriar rodando de novo o arquivo
-- supabase/migrations/20260820140000_indices_consultas_quentes.sql — os três
-- comandos são IF NOT EXISTS.

-- -----------------------------------------------------------------
-- 5. O que estes índices custam (para decidir com números)
-- -----------------------------------------------------------------
-- Índice não é de graça: toda escrita na tabela precisa mantê-lo, e ele ocupa
-- disco. No caso destes três:
--
--   tickets     ~69 mil linhas, dezenas de tickets novos por hora
--   mensagens   ~1,85 milhão de linhas, ~26 mil inserções por dia
--
-- Uma inserção mantendo um índice B-tree a mais custa microssegundos. Contra
-- isso, do outro lado da balança, estavam 10.802s + 6.625s de CPU acumulados em
-- varredura de tabela. A conta não é próxima — mas se algum dia a escrita
-- passar a ser o gargalo (IOwait alto, não CPU), o candidato a sair primeiro é
-- o idx_tickets_colaborador_criado, que serve só a contagem "recebidos hoje" do
-- processador de fila.
