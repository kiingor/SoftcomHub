-- Garante que pausas.tempo_maximo_minutos nunca seja negativo (a UI já valida isso,
-- mas o banco é quem deveria ser a fonte de verdade). Verificado antes de propor esta
-- migration: não há nenhuma linha em produção com valor negativo (0 resultados).
ALTER TABLE public.pausas
  ADD CONSTRAINT pausas_tempo_maximo_minutos_check
  CHECK (tempo_maximo_minutos IS NULL OR tempo_maximo_minutos >= 0);
