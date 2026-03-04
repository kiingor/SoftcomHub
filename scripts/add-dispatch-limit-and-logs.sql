-- Add max dispatch limit per day to setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS max_disparos_dia integer DEFAULT 50;

-- Create dispatch logs table
CREATE TABLE IF NOT EXISTS disparo_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id uuid REFERENCES setores(id) ON DELETE CASCADE NOT NULL,
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome text NOT NULL,
  cliente_nome text,
  cliente_telefone text,
  cliente_cnpj text,
  template_name text,
  status text DEFAULT 'enviado',
  criado_em timestamp with time zone DEFAULT now()
);

-- Index for fast daily count queries
CREATE INDEX IF NOT EXISTS idx_disparo_logs_setor_criado ON disparo_logs(setor_id, criado_em);
