-- Caso #97066 — devolução em loop entre subsetores.
--
-- Quando o subsetor do ticket (ex.: Prime) fica sem atendente disponível, a
-- distribuição entrega o ticket a um atendente de OUTRO subsetor (ex.: Suporte).
-- Isso já acontecia, mas só existia em tempo de execução: `escolherDestino`
-- devolvia `origem: 'transbordo'` e o resultado ia para o console. Sem registro
-- no ticket, quem recebia não sabia por que aquele atendimento caiu na tela dele
-- e devolvia para a fila de origem — que continuava sem atendente e transbordava
-- de novo. O ticket ia e voltava enquanto o cliente envelhecia na fila.
--
-- As três colunas são aditivas e têm default seguro. O código lê a marca como
-- ausente enquanto elas não existirem, então subir o código antes de aplicar
-- esta migration apenas mantém o comportamento atual (sem aviso e sem bloqueio).
--
-- SEM FOREIGN KEY em transbordo_subsetor_origem_id, de propósito: `tickets` já
-- tem uma FK para `subsetores` e quatro consultas embutem `subsetores(...)` sem
-- qualificar o nome do relacionamento. Uma segunda FK deixaria o embed ambíguo e
-- o PostgREST passaria a recusar essas consultas com erro 300 — em produção, no
-- instante em que a migration fosse aplicada.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS transbordo_recebido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transbordo_subsetor_origem_id UUID,
  ADD COLUMN IF NOT EXISTS transbordo_subsetor_hops INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tickets.transbordo_recebido_em IS
  'Instante em que o ticket foi atribuído por transbordo entre subsetores. NULL = atribuição pelo próprio subsetor, ou marca já consumida por uma transferência.';
COMMENT ON COLUMN public.tickets.transbordo_subsetor_origem_id IS
  'Subsetor que estava sem atendente e cedeu o ticket. Sem FK de propósito — ver cabeçalho da migration.';
COMMENT ON COLUMN public.tickets.transbordo_subsetor_hops IS
  'Quantas vezes este ticket já foi socorrido por outro subsetor. Nunca é zerado — mede cobertura crônica do subsetor. Distinto de transbordo_hops, que conta transbordo de SETOR.';

-- Tickets sob marca ativa: é o recorte que o bloqueio de devolução consulta e o
-- que operação precisa olhar para achar subsetor sem cobertura.
CREATE INDEX IF NOT EXISTS idx_tickets_transbordo_subsetor_ativo
  ON public.tickets (transbordo_subsetor_origem_id)
  WHERE transbordo_recebido_em IS NOT NULL;
