-- Remove guild_id (not needed for DMs) and add discord_user_id to mensagens
ALTER TABLE setores DROP COLUMN IF EXISTS discord_guild_id;
ALTER TABLE setores DROP COLUMN IF EXISTS discord_channel_id;

-- Add discord_user_id to mensagens (identifies which Discord user sent/receives the message)
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS discord_user_id text;

-- Add discord_user_id to clientes (to link a client to their Discord account)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS discord_user_id text;
