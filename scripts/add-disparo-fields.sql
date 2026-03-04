-- Add template_id and phone_number_id to setores for WhatsApp template dispatch
ALTER TABLE setores ADD COLUMN IF NOT EXISTS template_id TEXT;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

-- Add disparo_em to tickets to track when template was sent (for 12-min timer)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS disparo_em TIMESTAMP WITH TIME ZONE;

-- Add is_disparo to tickets to identify tickets created via template dispatch
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_disparo BOOLEAN DEFAULT FALSE;
