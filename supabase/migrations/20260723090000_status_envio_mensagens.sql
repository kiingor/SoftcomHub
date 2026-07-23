-- Log persistente de envio de mensagem (enviado/falhou), pra sobreviver a reload do WorkDesk.
-- NOTA: já aplicada manualmente em produção via Supabase Studio (2026-07-23). Este arquivo
-- é só o registro no repositório — reconciliar com o histórico de migrations do Supabase
-- (supabase_migrations.schema_migrations) antes de usar `supabase db push` neste projeto,
-- senão a CLI pode tentar reaplicá-la ou reportar drift.
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS status_envio TEXT;
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS erro_envio TEXT;
