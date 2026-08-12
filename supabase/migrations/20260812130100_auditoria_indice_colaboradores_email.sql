-- ════════════════════════════════════════════════════════════════════════
-- Índice de apoio à resolução do ator — RODA SOZINHO
-- ════════════════════════════════════════════════════════════════════════
--
-- `registrar_auditoria_mudanca()` resolve quem fez a mudança com
-- `WHERE lower(c.email) = lower(<e-mail do JWT>)`, e isso acontece em TODA
-- escrita auditada. Sem índice funcional, cada uma paga um seq scan em
-- `colaboradores`.
--
-- POR QUE ESTE ARQUIVO É SEPARADO E POR QUE CONCURRENTLY:
-- `colaboradores` já existe em produção e é escrita no caminho quente
-- (last_heartbeat a cada batida, is_online). Um CREATE INDEX comum pega
-- SHARE na tabela e segura essas escritas enquanto constrói. CONCURRENTLY
-- não bloqueia escrita — mas não roda dentro de bloco transacional, então
-- não pode ficar junto do BEGIN/COMMIT da migration principal.
--
-- COMO APLICAR: execute esta linha SOZINHA no SQL Editor do Studio, sem
-- nenhum outro comando na mesma submissão. Se ela falhar no meio, o índice
-- fica INVALID; nesse caso derrube com
-- `DROP INDEX CONCURRENTLY IF EXISTS idx_colaboradores_email_lower;`
-- e rode de novo.
--
-- Não é pré-requisito: a auditoria funciona sem ele, só mais devagar.
-- ════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colaboradores_email_lower
  ON public.colaboradores (lower(email));
