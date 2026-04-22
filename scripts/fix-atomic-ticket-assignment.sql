-- Migration: atomic ticket assignment to prevent max_tickets_per_agent overshoot
--
-- Problema: fluxos de distribuição contavam tickets, filtravam por limite e faziam
-- UPDATE sem proteção atômica. Duas distribuições concorrentes podiam ler o mesmo
-- count=9 e atribuir ambos os tickets ao mesmo atendente, ultrapassando o limite.
--
-- Solução: serializar atribuições ao MESMO atendente via pg_advisory_xact_lock.
-- Atendentes diferentes não se bloqueiam — paralelismo preservado.
--
-- Uso: supabase.rpc('try_atomic_assign_ticket', { p_ticket_id, p_colaborador_id, p_max_tickets })
-- Retorno: jsonb { assigned: bool, current_count: int, reason?: string }

create or replace function try_atomic_assign_ticket(
  p_ticket_id uuid,
  p_colaborador_id uuid,
  p_max_tickets int
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_current_count int;
  v_updated_count int;
begin
  -- Lock por atendente (xact_lock é liberado ao fim da transação, seguro com PgBouncer)
  perform pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text, 0));

  -- Count dentro do lock → valor confiável para a decisão
  select count(*) into v_current_count
  from tickets
  where colaborador_id = p_colaborador_id
    and status in ('aberto', 'em_atendimento');

  if v_current_count >= p_max_tickets then
    return jsonb_build_object(
      'assigned', false,
      'current_count', v_current_count,
      'reason', 'max_tickets_reached'
    );
  end if;

  -- UPDATE condicional: só atribui se o ticket ainda estiver livre
  update tickets
  set colaborador_id = p_colaborador_id,
      status = 'em_atendimento'
  where id = p_ticket_id
    and colaborador_id is null
    and status in ('aberto', 'em_atendimento');

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    return jsonb_build_object(
      'assigned', false,
      'current_count', v_current_count,
      'reason', 'ticket_already_assigned'
    );
  end if;

  -- last_ticket_received_at no mesmo commit → round-robin consistente
  update colaboradores
  set last_ticket_received_at = now()
  where id = p_colaborador_id;

  return jsonb_build_object(
    'assigned', true,
    'current_count', v_current_count + 1
  );
end;
$$;

-- Permitir execução via service role (Supabase REST chama como postgres/service_role)
grant execute on function try_atomic_assign_ticket(uuid, uuid, int) to service_role;
grant execute on function try_atomic_assign_ticket(uuid, uuid, int) to authenticated;
