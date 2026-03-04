-- Add webhook configuration fields to setores table
ALTER TABLE setores ADD COLUMN IF NOT EXISTS webhook_eventos text[] DEFAULT '{}';
ALTER TABLE setores ADD COLUMN IF NOT EXISTS webhook_url text;
