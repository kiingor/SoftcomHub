-- Remove a constraint NOT NULL do ticket_id na tabela mensagens
-- Isso permite que mensagens existam sem um ticket (conversas com bot)

ALTER TABLE mensagens 
  ALTER COLUMN ticket_id DROP NOT NULL;

-- Adicionar indice para buscar mensagens por cliente (sem ticket)
CREATE INDEX IF NOT EXISTS idx_mensagens_cliente_id ON mensagens(cliente_id);

-- Adicionar campo para identificar se a mensagem é do bot
ALTER TABLE mensagens 
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- Atualizar o check constraint do remetente para incluir 'bot'
ALTER TABLE mensagens 
  DROP CONSTRAINT IF EXISTS mensagens_remetente_check;

ALTER TABLE mensagens 
  ADD CONSTRAINT mensagens_remetente_check 
  CHECK (remetente IN ('cliente', 'colaborador', 'bot'));
