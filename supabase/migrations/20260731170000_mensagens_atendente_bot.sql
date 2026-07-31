-- Identidade do bot que respondeu no fluxo Nexus. É opcional porque mensagens
-- humanas, de sistema e registros anteriores não possuem um bot associado.
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS atendente_bot TEXT;
