-- Table for storing operating hours per sector
CREATE TABLE IF NOT EXISTS horarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6), -- 0 = Sunday, 1 = Monday, etc.
  ativo BOOLEAN DEFAULT false,
  hora_inicio TIME,
  hora_fim TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(setor_id, dia_semana)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_horarios_setor ON horarios_atendimento(setor_id);

-- Insert default hours for existing sectors (Monday to Friday 8am-6pm)
INSERT INTO horarios_atendimento (setor_id, dia_semana, ativo, hora_inicio, hora_fim)
SELECT s.id, d.dia, 
  CASE WHEN d.dia BETWEEN 1 AND 5 THEN true ELSE false END,
  CASE WHEN d.dia BETWEEN 1 AND 5 THEN '08:00'::TIME ELSE NULL END,
  CASE WHEN d.dia BETWEEN 1 AND 5 THEN '18:00'::TIME ELSE NULL END
FROM setores s
CROSS JOIN (SELECT generate_series(0, 6) as dia) d
ON CONFLICT (setor_id, dia_semana) DO NOTHING;
