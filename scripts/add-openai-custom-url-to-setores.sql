ALTER TABLE setores ADD COLUMN IF NOT EXISTS openai_url_personalizada boolean DEFAULT false;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS openai_base_url text;
