-- =============================================================
-- Acompanhamento de gestor num atendimento
-- (Setor → Monitoramento → coluna "Acompanhando" e botão na conversa)
--
-- Uma linha por ticket: existe = alguém está acompanhando. O gestor entra
-- quando decide ajudar o técnico e sai quando termina — parar de acompanhar
-- APAGA a linha, então a tabela guarda só o estado atual.
--
-- Por que tabela separada e não coluna em `tickets`: `tickets.colaborador_id`
-- já aponta para `colaboradores`, e uma SEGUNDA chave estrangeira para o mesmo
-- destino torna o embed `tickets -> colaboradores(nome)` ambíguo. O PostgREST
-- passa a responder 300 e as telas que já fazem esse embed (monitoramento,
-- relatório, workdesk) quebrariam de uma vez.
--
-- `colaborador_nome` é desnormalizado de propósito: a tabela é lida junto do
-- monitoramento, que já faz muitas consultas, e assim a coluna aparece sem
-- mais um embed.
--
-- Sobre o incidente de "sumiram os tickets": aquilo foi ambiguidade de embed,
-- causada por uma SEGUNDA chave estrangeira saindo de `tickets` para o mesmo
-- destino. Esta migration não adiciona nenhuma coluna nem FK em `tickets`.
-- Conferido em 06/08/2026 no schema real: `ticket_logs`,
-- `ticket_assignment_logs`, `disparo_logs` e `avaliacoes` já apontam para
-- `tickets` E `colaboradores` ao mesmo tempo, e os embeds
-- `tickets -> colaboradores(nome)` do monitoramento, do relatório e do
-- workdesk continuam respondendo 200. Esta tabela tem o mesmo formato de
-- `avaliacoes`.
--
-- Rodar no Supabase Studio (SQL Editor).
-- =============================================================

-- A validação da FK toma um lock breve em `tickets`, que é tabela quente.
-- Com teto, a migration desiste em vez de segurar a fila de escrita.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ticket_acompanhamentos (
  ticket_id        uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  colaborador_id   uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  colaborador_nome text,
  iniciado_em      timestamptz NOT NULL DEFAULT now()
);

-- "Quais tickets este gestor está acompanhando" é a outra leitura natural.
CREATE INDEX IF NOT EXISTS idx_ticket_acompanhamentos_colaborador
  ON public.ticket_acompanhamentos (colaborador_id);

-- RLS permissiva para authenticated (mesmo padrão da fase1). A rota
-- /api/tickets/acompanhamento escreve com service role.
ALTER TABLE public.ticket_acompanhamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_acompanhamentos_authenticated_all" ON public.ticket_acompanhamentos;
CREATE POLICY "ticket_acompanhamentos_authenticated_all"
  ON public.ticket_acompanhamentos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

RESET lock_timeout;

-- =============================================================
-- CONFERÊNCIA depois de aplicar (tem que voltar linha, não erro 300)
-- =============================================================
-- SELECT id FROM public.tickets LIMIT 1;
-- E no app: recarregue o Monitoramento do setor. Se os tickets sumirem,
-- rode o ROLLBACK abaixo — nada mais precisa ser desfeito.
--
-- =============================================================
-- ROLLBACK
-- =============================================================
-- DROP TABLE IF EXISTS public.ticket_acompanhamentos;
