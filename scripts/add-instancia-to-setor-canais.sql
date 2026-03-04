-- Add instancia column to setor_canais table
ALTER TABLE setor_canais ADD COLUMN IF NOT EXISTS instancia text;
