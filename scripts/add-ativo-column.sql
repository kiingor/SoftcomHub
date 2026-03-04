-- Add 'ativo' column to colaboradores table
ALTER TABLE colaboradores 
ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Remove senha_hash column since we use Supabase Auth
ALTER TABLE colaboradores 
DROP COLUMN IF EXISTS senha_hash;
