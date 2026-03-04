-- Fix old system messages that were inserted without enviado_em
-- Set enviado_em to criado_em from the related ticket for any null values
UPDATE mensagens m
SET enviado_em = COALESCE(
  (SELECT t.criado_em FROM tickets t WHERE t.id = m.ticket_id),
  NOW()
)
WHERE m.remetente = 'sistema' AND m.enviado_em IS NULL;
