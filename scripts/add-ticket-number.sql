-- Add numero field to tickets table
-- This will be an auto-incrementing ticket number for display purposes

-- Add the numero column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS numero SERIAL;

-- Create index for faster lookups by numero
CREATE INDEX IF NOT EXISTS idx_tickets_numero ON tickets(numero);

-- Update existing tickets to have sequential numbers based on creation date
-- This ensures existing tickets get proper numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY criado_em) as rn
  FROM tickets
  WHERE numero IS NULL OR numero = 0
)
UPDATE tickets t
SET numero = n.rn
FROM numbered n
WHERE t.id = n.id;
