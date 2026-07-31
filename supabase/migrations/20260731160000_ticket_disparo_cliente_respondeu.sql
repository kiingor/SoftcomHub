-- A fila representa a espera iniciada pelo cliente. Em disparos, o envio
-- parte da operação e só vira atendimento quando há resposta do destinatário.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS cliente_respondeu_em TIMESTAMPTZ;

-- Reconstrói o marco para disparos anteriores usando a primeira mensagem do
-- cliente recebida depois do envio. Disparos sem resposta permanecem nulos.
UPDATE public.tickets AS ticket
SET cliente_respondeu_em = resposta.primeira_resposta_em
FROM (
  SELECT
    ticket_interno.id,
    MIN(mensagem.enviado_em) AS primeira_resposta_em
  FROM public.tickets AS ticket_interno
  INNER JOIN public.mensagens AS mensagem
    ON mensagem.ticket_id = ticket_interno.id
    AND mensagem.remetente = 'cliente'
    AND mensagem.enviado_em >= ticket_interno.disparo_em
  WHERE COALESCE(ticket_interno.is_disparo, false) = true
    AND ticket_interno.disparo_em IS NOT NULL
  GROUP BY ticket_interno.id
) AS resposta
WHERE ticket.id = resposta.id
  AND ticket.cliente_respondeu_em IS NULL;
