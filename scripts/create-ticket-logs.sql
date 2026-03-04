-- Create ticket_logs table for internal history and observations
CREATE TABLE IF NOT EXISTS ticket_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('status', 'observacao', 'transferencia', 'manual')),
  descricao TEXT NOT NULL,
  autor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_logs_ticket_id ON ticket_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_logs_criado_em ON ticket_logs(criado_em DESC);
