-- =============================================================
-- Vincula automaticamente o histórico órfão do bot Nexus
-- (cliente-nexus / bot-nexus, sem ticket_id) a qualquer ticket novo
-- criado para o mesmo cliente.
--
-- Por que trigger e não só código TypeScript: menos de 1% dos tickets
-- recentes têm o log de 'criacao' que só existe quando o ticket passa
-- por lib/ticket-distribution.ts (criarEDistribuirTicket, onde já
-- existe uma correção equivalente). A grande maioria dos tickets nasce
-- por outro caminho (ex.: n8n gravando direto no Postgres), que nunca
-- passa por esse código. Um trigger AFTER INSERT em `tickets` roda
-- sempre, independente de quem/o que inseriu a linha.
--
-- Mesma lógica de app/api/nexus/abrir-ticket/route.ts: agrupa por
-- telefone, porque o bot pode gravar a conversa em registros de
-- cliente distintos com o mesmo número.
--
-- v2 (20260720): limita a mensagens das últimas 24h antes da criação
-- do ticket. Sem isso, um cliente que conversou com o bot em episódios
-- separados e resolvidos ao longo de semanas (cada um sem gerar ticket)
-- tinha TODO esse histórico não-relacionado despejado no primeiro
-- ticket real que surgisse — poluindo o payload do webhook de
-- encerramento com conversas de dias/semanas antes, sem relação com o
-- motivo do ticket atual. 24h é a mesma janela de sessão do WhatsApp.
--
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
    AND remetente IN ('cliente-nexus', 'bot-nexus')
    AND enviado_em >= NEW.criado_em - interval '24 hours'
    AND cliente_id IN (
      SELECT id FROM public.clientes
      WHERE telefone = (SELECT telefone FROM public.clientes WHERE id = NEW.cliente_id)
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vincular_historico_nexus ON public.tickets;
CREATE TRIGGER trg_vincular_historico_nexus
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.vincular_historico_nexus_ao_ticket();
