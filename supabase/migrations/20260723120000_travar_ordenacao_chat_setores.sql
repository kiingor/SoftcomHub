-- Trava de reordenação automática da lista de chats no WorkDesk, controlada por setor.
-- A sequência também converge instalações que já criaram a coluna como nullable.
SET lock_timeout = '5s';

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS travar_ordenacao_chat boolean;

ALTER TABLE public.setores
  ALTER COLUMN travar_ordenacao_chat SET DEFAULT false;

UPDATE public.setores
SET travar_ordenacao_chat = false
WHERE travar_ordenacao_chat IS NULL;

ALTER TABLE public.setores
  ALTER COLUMN travar_ordenacao_chat SET NOT NULL;

RESET lock_timeout;
