-- Add template_language to setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'pt_BR';
