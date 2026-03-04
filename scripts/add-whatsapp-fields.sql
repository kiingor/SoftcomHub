-- Add WhatsApp related fields to mensagens table
ALTER TABLE mensagens 
ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_message_id ON mensagens(whatsapp_message_id);
