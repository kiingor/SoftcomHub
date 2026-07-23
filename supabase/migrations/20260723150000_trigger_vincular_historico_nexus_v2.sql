-- =============================================================
-- Corrige public.vincular_historico_nexus_ao_ticket() (de
-- 20260720_trigger_vincular_historico_nexus.sql): o n8n nem sempre marca a
-- resposta do cliente na fase bot como 'cliente-nexus' — em volume relevante
-- ele grava só 'cliente' (mesmo com ticket_id ainda nulo). A trigger original
-- só vinculava 'cliente-nexus'/'bot-nexus' ao ticket novo, deixando essas
-- mensagens de cliente órfãs para sempre (nunca entravam no histórico do
-- ticket). Mesma causa raiz do bug corrigido em app/dashboard/nexus/page.tsx
-- (NEXUS_REMETENTES agora inclui 'cliente').
--
-- CREATE OR REPLACE é idempotente — seguro rodar mesmo que a v1 já tenha sido
-- aplicada ou não.
-- Rodar no Supabase Studio (SQL Editor).
-- =============================================================

CREATE OR REPLACE FUNCTION public.vincular_historico_nexus_ao_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mensagens
  SET ticket_id = NEW.id
  WHERE ticket_id IS NULL
    AND remetente IN ('cliente-nexus', 'bot-nexus', 'cliente')
    AND enviado_em >= NEW.criado_em - interval '24 hours'
    AND cliente_id IN (
      SELECT id FROM public.clientes
      WHERE telefone = (SELECT telefone FROM public.clientes WHERE id = NEW.cliente_id)
    );
  RETURN NEW;
END;
$$;
