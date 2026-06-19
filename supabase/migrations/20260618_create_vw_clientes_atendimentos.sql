-- View: total de atendimentos (tickets) por cliente.
-- Uma linha por cliente. LEFT JOIN garante que clientes sem nenhum ticket
-- também apareçam, com total_atendimentos = 0.
-- "Atendimento" = registro na tabela `tickets` (tickets.cliente_id -> clientes.id).
--
-- security_invoker = true: respeita o RLS de quem consulta. No n8n/Studio,
-- usando a service_role, todas as linhas aparecem (a service_role ignora RLS).

CREATE OR REPLACE VIEW public.vw_clientes_atendimentos
WITH (security_invoker = true) AS
SELECT
  c.id                       AS cliente_id,
  c.nome,
  c.telefone,
  COUNT(t.id)                AS total_atendimentos,
  COUNT(t.id) FILTER (WHERE t.status <> 'encerrado') AS atendimentos_abertos,
  MIN(t.criado_em)           AS primeiro_atendimento,
  MAX(t.criado_em)           AS ultimo_atendimento
FROM public.clientes c
LEFT JOIN public.tickets t ON t.cliente_id = c.id
GROUP BY c.id, c.nome, c.telefone;
