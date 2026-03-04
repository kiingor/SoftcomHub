-- Table to log all ticket assignment actions for accountability and debugging
CREATE TABLE IF NOT EXISTS ticket_assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('auto_assigned', 'manual_assigned', 'transferred', 'unassigned', 'queue_timeout')),
  previous_colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  queue_wait_time_seconds INTEGER,
  assignment_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES colaboradores(id) ON DELETE SET NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_assignment_logs_ticket_id ON ticket_assignment_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignment_logs_colaborador_id ON ticket_assignment_logs(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignment_logs_created_at ON ticket_assignment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_assignment_logs_action ON ticket_assignment_logs(action);

-- Configuration table for ticket distribution settings
CREATE TABLE IF NOT EXISTS ticket_distribution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id UUID UNIQUE REFERENCES setores(id) ON DELETE CASCADE,
  check_interval_seconds INTEGER DEFAULT 30,
  max_tickets_per_agent INTEGER DEFAULT 10,
  queue_timeout_minutes INTEGER DEFAULT 60,
  auto_assign_enabled BOOLEAN DEFAULT TRUE,
  priority_by_wait_time BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add a lock column to tickets for concurrency control
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignment_lock_until TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignment_attempts INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE ticket_assignment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_distribution_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read assignment logs" ON ticket_assignment_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert assignment logs" ON ticket_assignment_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read distribution config" ON ticket_distribution_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage distribution config" ON ticket_distribution_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert default config for all existing setores
INSERT INTO ticket_distribution_config (setor_id, check_interval_seconds, max_tickets_per_agent, queue_timeout_minutes)
SELECT id, 30, 10, 60 FROM setores
ON CONFLICT (setor_id) DO NOTHING;
