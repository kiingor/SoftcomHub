-- Add canal (channel type) to setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'whatsapp';

-- Add discord config columns to setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS discord_bot_token TEXT;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS discord_guild_id TEXT;

-- Add canal to mensagens
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'whatsapp';

-- Set default for tickets.canal
ALTER TABLE tickets ALTER COLUMN canal SET DEFAULT 'whatsapp';

-- Update existing rows
UPDATE setores SET canal = 'whatsapp' WHERE canal IS NULL;
UPDATE mensagens SET canal = 'whatsapp' WHERE canal IS NULL;
UPDATE tickets SET canal = 'whatsapp' WHERE canal IS NULL;
