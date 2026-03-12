-- =====================================================
-- MIGRAÇÃO: Receptor / Transmissor de Setores
-- Permite que setores sem atendentes disponíveis
-- encaminhem tickets automaticamente para um setor receptor.
-- =====================================================

-- 1. Marca o setor como ponto central receptor
ALTER TABLE setores ADD COLUMN IF NOT EXISTS is_receptor BOOLEAN DEFAULT false;

-- 2. Habilita o encaminhamento automático de tickets
ALTER TABLE setores ADD COLUMN IF NOT EXISTS transmissao_ativa BOOLEAN DEFAULT false;

-- 3. Referência ao setor receptor de destino
ALTER TABLE setores ADD COLUMN IF NOT EXISTS setor_receptor_id UUID REFERENCES setores(id) ON DELETE SET NULL;
