-- =============================================================
-- Cache da análise de IA do "Status do atendimento"
-- (Setor → Monitoramento → botão ao lado de "Abrir conversa")
--
-- Uma linha por ticket. A análise vale enquanto a última mensagem do ticket
-- for a mesma que foi lida: `ultima_mensagem_id` + `total_mensagens` formam a
-- assinatura da conversa, e só mensagem nova (ou apagada) força uma nova
-- chamada de LLM. Sem isto o supervisor pagaria uma chamada por abertura do
-- diálogo, e ele reabre o mesmo ticket várias vezes acompanhando a fila.
--
-- Não adiciona coluna nem chave estrangeira em `tickets` — a FK sai daqui para
-- lá. Nenhum embed existente muda.
--
-- Rodar no Supabase Studio (SQL Editor).
-- =============================================================

-- A validação da FK toma um lock breve em `tickets`, que é tabela quente.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ticket_analises_ia (
  ticket_id          uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  markdown           text NOT NULL,
  -- Assinatura da conversa analisada.
  ultima_mensagem_id uuid,
  ultima_mensagem_em timestamptz,
  total_mensagens    integer NOT NULL DEFAULT 0,
  modelo             text,
  gerado_em          timestamptz NOT NULL DEFAULT now()
);

-- RLS permissiva para authenticated (mesmo padrão da fase1). A rota
-- /api/ia/status-atendimento escreve com service role.
ALTER TABLE public.ticket_analises_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_analises_ia_authenticated_all" ON public.ticket_analises_ia;
CREATE POLICY "ticket_analises_ia_authenticated_all"
  ON public.ticket_analises_ia
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

RESET lock_timeout;

-- =============================================================
-- ROLLBACK
-- =============================================================
-- DROP TABLE IF EXISTS public.ticket_analises_ia;
