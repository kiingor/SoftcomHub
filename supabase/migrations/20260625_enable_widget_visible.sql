-- Habilita widget_visible para todos os setores
-- Executa esta migration para poder adicionar setores aos widgets

-- 1. Adiciona coluna se não existir
ALTER TABLE setores ADD COLUMN IF NOT EXISTS widget_visible BOOLEAN DEFAULT true;

-- 2. Marca todos os setores como visíveis em widgets
UPDATE setores
SET widget_visible = true
WHERE widget_visible IS NULL OR widget_visible = false;

-- 3. Verifica o resultado
SELECT
  COUNT(*) as total_setores,
  COUNT(CASE WHEN widget_visible = true THEN 1 END) as setores_visiveis_em_widgets
FROM setores
WHERE deleted_at IS NULL;
