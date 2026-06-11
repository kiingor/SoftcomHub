-- Permite identificar conversas do Nexus sem misturar com mensagens comuns.
-- Usado pelo dashboard em /dashboard/nexus.

ALTER TABLE mensagens DROP CONSTRAINT IF EXISTS mensagens_remetente_check;
ALTER TABLE mensagens ADD CONSTRAINT mensagens_remetente_check
  CHECK (remetente IN (
    'cliente',
    'colaborador',
    'bot',
    'sistema',
    'supervisor',
    'cliente-nexus',
    'bot-nexus'
  ));
