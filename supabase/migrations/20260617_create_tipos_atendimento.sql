-- =============================================================
-- Tipos de Atendimento (Classificação / Tabulação)
-- Cada setor cadastra seus próprios tipos. Ao encerrar um chat no
-- workdesk, o atendente classifica o atendimento com um destes tipos.
--
-- Rodar no Supabase Studio (SQL Editor) — escrita direta no Postgres
-- bate no TLS interception da máquina.
-- =============================================================

-- 1. Tabela de tipos por setor
CREATE TABLE IF NOT EXISTS public.tipos_atendimento (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id   uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  cor        text,
  ativo      boolean NOT NULL DEFAULT true,
  ordem      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_atendimento_setor
  ON public.tipos_atendimento (setor_id);

-- RLS permissiva para authenticated (mesmo padrão da fase1 de RLS)
ALTER TABLE public.tipos_atendimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_atendimento_authenticated_all" ON public.tipos_atendimento;
CREATE POLICY "tipos_atendimento_authenticated_all"
  ON public.tipos_atendimento
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. Coluna no ticket apontando o tipo escolhido no encerramento
--    (nullable; FK para tabela nova → não cria ambiguidade de embed nos selects existentes)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS tipo_atendimento_id uuid
  REFERENCES public.tipos_atendimento(id) ON DELETE SET NULL;

-- =============================================================
-- ROLLBACK (copiar/colar no SQL Editor se precisar reverter)
-- =============================================================
-- ALTER TABLE public.tickets DROP COLUMN IF EXISTS tipo_atendimento_id;
-- DROP TABLE IF EXISTS public.tipos_atendimento;
