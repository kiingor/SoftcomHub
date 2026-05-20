-- Add reply_to_message_id to mensagens for WhatsApp-style quoted replies.
-- The column references the parent mensagem by internal UUID. We keep it
-- nullable (most messages aren't replies) and SET NULL on delete so removing
-- the parent doesn't cascade-delete the reply.

ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES mensagens(id) ON DELETE SET NULL;

-- Index speeds up "show me the replies to X" lookups and the join we do
-- in the workdesk when rendering a quoted preview on a reply bubble.
CREATE INDEX IF NOT EXISTS idx_mensagens_reply_to_message_id
  ON mensagens(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
