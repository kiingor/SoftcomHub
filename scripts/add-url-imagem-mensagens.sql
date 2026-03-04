-- Add url_imagem column to mensagens table for image messages
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS url_imagem TEXT NULL;

-- Add media_type column to identify type of media (image, video, audio, document)
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media_type TEXT NULL;
