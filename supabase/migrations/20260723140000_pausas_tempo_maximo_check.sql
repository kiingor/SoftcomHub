-- Garante que pausas.tempo_maximo_minutos nunca seja negativo (a UI já valida isso,
-- mas o banco é quem deve ser a fonte de verdade). A validação falha de forma
-- explícita caso o ambiente ainda tenha dados antigos negativos.
-- NULL continua significando "sem limite", portanto não há default ou NOT NULL.
SET lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pausas_tempo_maximo_minutos_check'
      AND conrelid = 'public.pausas'::regclass
  ) THEN
    ALTER TABLE public.pausas
      ADD CONSTRAINT pausas_tempo_maximo_minutos_check
      CHECK (tempo_maximo_minutos IS NULL OR tempo_maximo_minutos >= 0)
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.pausas
  VALIDATE CONSTRAINT pausas_tempo_maximo_minutos_check;

RESET lock_timeout;
