-- Add last_heartbeat column to colaboradores table
ALTER TABLE colaboradores
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries on heartbeat
CREATE INDEX IF NOT EXISTS idx_colaboradores_last_heartbeat ON colaboradores(last_heartbeat);

-- Create index for online status
CREATE INDEX IF NOT EXISTS idx_colaboradores_is_online ON colaboradores(is_online);
