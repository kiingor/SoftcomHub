-- Trava de reordenação automática da lista de chats no WorkDesk, controlada por setor.
-- public.pausas.tempo_maximo_minutos já existe no banco (confirmado via
-- scripts/verify-pausas-setores-colunas.mjs) — não precisa migration.
ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS travar_ordenacao_chat BOOLEAN DEFAULT FALSE;
