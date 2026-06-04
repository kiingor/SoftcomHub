-- =============================================
-- Nota interna do supervisor
-- =============================================
-- Libera o valor 'supervisor' no CHECK constraint de mensagens.remetente.
--
-- Uma "nota interna" é uma mensagem privada do supervisor para o atendente:
--   - salva em `mensagens` com remetente = 'supervisor';
--   - SEM campos de canal (phone_number_id/canal_envio/discord_user_id);
--   - NÃO é despachada a nenhum canal (a API /api/tickets/nota-interna só insere).
-- Logo, nunca chega ao cliente — só é visível ao atendente/supervisor, em
-- destaque âmbar no workdesk e no painel do setor.
--
-- Aditivo e idempotente. Rodar no Supabase Studio (SQL Editor).
-- =============================================

ALTER TABLE mensagens DROP CONSTRAINT IF EXISTS mensagens_remetente_check;
ALTER TABLE mensagens ADD CONSTRAINT mensagens_remetente_check
  CHECK (remetente IN ('cliente', 'colaborador', 'bot', 'sistema', 'supervisor'));

-- Obs.: a assinatura do supervisor é embutida no próprio `conteudo` da nota
-- (ex.: "...mensagem...\n— Fulano"), então NÃO é necessária coluna nova.
