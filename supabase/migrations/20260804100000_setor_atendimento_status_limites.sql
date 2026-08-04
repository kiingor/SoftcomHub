-- Limites de status do monitoramento por setor.
-- Normal → Atenção → Crítico, calculados pelo tempo total em aberto do ticket.
SET lock_timeout = '5s';

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS atendimento_status_atencao_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS atendimento_status_critico_minutos INTEGER;

UPDATE public.setores
SET
  atendimento_status_atencao_minutos = COALESCE(atendimento_status_atencao_minutos, 30),
  atendimento_status_critico_minutos = COALESCE(atendimento_status_critico_minutos, 40)
WHERE atendimento_status_atencao_minutos IS NULL
   OR atendimento_status_critico_minutos IS NULL;

ALTER TABLE public.setores
  ALTER COLUMN atendimento_status_atencao_minutos SET DEFAULT 30,
  ALTER COLUMN atendimento_status_critico_minutos SET DEFAULT 40,
  ALTER COLUMN atendimento_status_atencao_minutos SET NOT NULL,
  ALTER COLUMN atendimento_status_critico_minutos SET NOT NULL;

ALTER TABLE public.setores
  DROP CONSTRAINT IF EXISTS setores_atendimento_status_atencao_minutos_check,
  DROP CONSTRAINT IF EXISTS setores_atendimento_status_critico_minutos_check,
  DROP CONSTRAINT IF EXISTS setores_atendimento_status_limites_check;

ALTER TABLE public.setores
  ADD CONSTRAINT setores_atendimento_status_atencao_minutos_check
    CHECK (atendimento_status_atencao_minutos BETWEEN 1 AND 1440),
  ADD CONSTRAINT setores_atendimento_status_critico_minutos_check
    CHECK (atendimento_status_critico_minutos BETWEEN 1 AND 1440),
  ADD CONSTRAINT setores_atendimento_status_limites_check
    CHECK (atendimento_status_critico_minutos > atendimento_status_atencao_minutos);

RESET lock_timeout;
