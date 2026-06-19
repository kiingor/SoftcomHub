-- =============================================================
-- Janelas de bloqueio de transbordo por setor
-- Em cada janela (ex.: almoço 12:00–13:00), mesmo que todos os atendentes
-- do setor estejam offline, o ticket NÃO transborda: ele aguarda na fila do
-- próprio setor até a janela acabar ou alguém ficar online.
--
-- Rodar no Supabase Studio (SQL Editor).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.transbordo_bloqueios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id    uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  hora_inicio time NOT NULL,
  hora_fim    time NOT NULL,
  -- dias da semana em que a janela vale: 0=Dom .. 6=Sáb (padrão: todos)
  dias        smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transbordo_bloqueios_setor
  ON public.transbordo_bloqueios (setor_id);

-- RLS permissiva para authenticated (mesmo padrão da fase1)
ALTER TABLE public.transbordo_bloqueios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transbordo_bloqueios_authenticated_all" ON public.transbordo_bloqueios;
CREATE POLICY "transbordo_bloqueios_authenticated_all"
  ON public.transbordo_bloqueios
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- =============================================================
-- ROLLBACK
-- =============================================================
-- DROP TABLE IF EXISTS public.transbordo_bloqueios;
