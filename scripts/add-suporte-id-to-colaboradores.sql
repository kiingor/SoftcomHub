-- Adiciona campo suporte_id na tabela colaboradores
-- Permite mapear cada atendente para um ID numérico em sistema externo de suporte
-- Campo opcional, sem restrição de unicidade
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS suporte_id TEXT DEFAULT NULL;
