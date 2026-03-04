-- Add nome column to clientes table
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome TEXT;

-- Remove NOT NULL constraint from email column
ALTER TABLE clientes ALTER COLUMN email DROP NOT NULL;
