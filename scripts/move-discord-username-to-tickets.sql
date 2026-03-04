-- Add user_name_discord to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_name_discord text;

-- Remove user_name_discord from mensagens table
ALTER TABLE mensagens DROP COLUMN IF EXISTS user_name_discord;
