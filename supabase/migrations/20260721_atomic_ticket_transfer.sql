-- Keep the support-queue fallback deterministic for every sector. Existing
-- active duplicates are consolidated before the partial unique index is added.
update public.subsetores as subsetor
set nome = 'Suporte'
where pg_catalog.lower(pg_catalog.btrim(subsetor.nome)) = 'suporte'
  and subsetor.nome is distinct from 'Suporte';

create temporary table support_subsetor_merge_map (
  duplicate_id uuid primary key,
  canonical_id uuid not null,
  setor_id uuid not null
) on commit drop;

insert into support_subsetor_merge_map (duplicate_id, canonical_id, setor_id)
with ranked_support as (
  select
    subsetor.id,
    subsetor.setor_id,
    pg_catalog.first_value(subsetor.id) over (
      partition by subsetor.setor_id
      order by subsetor.criado_em nulls last, subsetor.id
    ) as canonical_id
  from public.subsetores as subsetor
  where subsetor.ativo is true
    and pg_catalog.lower(pg_catalog.btrim(subsetor.nome)) = 'suporte'
)
select support.id, support.canonical_id, support.setor_id
from ranked_support as support
where support.id <> support.canonical_id;

-- This junction has a uniqueness constraint that can conflict during a direct
-- FK update. Recreate each relationship against the canonical subsetor first.
insert into public.colaboradores_subsetores (colaborador_id, setor_id, subsetor_id)
select distinct
  vinculo.colaborador_id,
  merge_map.setor_id,
  merge_map.canonical_id
from public.colaboradores_subsetores as vinculo
join support_subsetor_merge_map as merge_map
  on merge_map.duplicate_id = vinculo.subsetor_id
on conflict (colaborador_id, setor_id, subsetor_id) do nothing;

delete from public.colaboradores_subsetores as vinculo
using support_subsetor_merge_map as merge_map
where vinculo.subsetor_id = merge_map.duplicate_id;

-- Remap every single-column FK that references subsetores(id), including
-- tickets and disparos_lote, without assuming that every optional table exists.
do $remap_support_fks$
declare
  v_fk record;
begin
  for v_fk in
    select
      child_namespace.nspname as schema_name,
      child_table.relname as table_name,
      child_column.attname as column_name
    from pg_catalog.pg_constraint as fk_constraint
    join pg_catalog.pg_class as child_table
      on child_table.oid = fk_constraint.conrelid
    join pg_catalog.pg_namespace as child_namespace
      on child_namespace.oid = child_table.relnamespace
    join pg_catalog.pg_attribute as child_column
      on child_column.attrelid = fk_constraint.conrelid
      and child_column.attnum = fk_constraint.conkey[1]
    join pg_catalog.pg_attribute as referenced_column
      on referenced_column.attrelid = fk_constraint.confrelid
      and referenced_column.attnum = fk_constraint.confkey[1]
    where fk_constraint.contype = 'f'
      and fk_constraint.confrelid = pg_catalog.to_regclass('public.subsetores')
      and pg_catalog.array_length(fk_constraint.conkey, 1) = 1
      and pg_catalog.array_length(fk_constraint.confkey, 1) = 1
      and referenced_column.attname = 'id'
      and fk_constraint.conrelid
        <> pg_catalog.to_regclass('public.colaboradores_subsetores')
  loop
    execute pg_catalog.format(
      'update %I.%I as child
       set %I = merge_map.canonical_id
       from pg_temp.support_subsetor_merge_map as merge_map
       where child.%I = merge_map.duplicate_id',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name,
      v_fk.column_name
    );
  end loop;

  -- Older installations may still have this compatibility column without an FK.
  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = pg_catalog.to_regclass('public.colaboradores_setores')
      and attribute.attname = 'subsetor_id'
      and attribute.attnum > 0
      and attribute.attisdropped is false
  ) then
    execute
      'update public.colaboradores_setores as vinculo
       set subsetor_id = merge_map.canonical_id
       from pg_temp.support_subsetor_merge_map as merge_map
       where vinculo.subsetor_id = merge_map.duplicate_id';
  end if;
end;
$remap_support_fks$;

delete from public.subsetores as subsetor
using support_subsetor_merge_map as merge_map
where subsetor.id = merge_map.duplicate_id;

insert into public.subsetores (setor_id, nome)
select setor.id, 'Suporte'
from public.setores as setor
where not exists (
  select 1
  from public.subsetores as subsetor
  where subsetor.setor_id = setor.id
    and subsetor.ativo is true
    and pg_catalog.lower(pg_catalog.btrim(subsetor.nome)) = 'suporte'
);

create unique index if not exists uq_subsetores_active_support_per_setor
  on public.subsetores (setor_id)
  where ativo is true
    and pg_catalog.lower(pg_catalog.btrim(nome)) = 'suporte';

-- Keep equivalent spellings compatible with the exact-name lookup used by the
-- application. This BEFORE trigger only changes NEW and needs no elevated role.
create or replace function public.normalize_support_subsetor_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.nome is not null
    and pg_catalog.lower(pg_catalog.btrim(new.nome)) = 'suporte'
  then
    new.nome := 'Suporte';
  end if;

  return new;
end;
$function$;

-- Provision Support only when a new sector is created. Existing Support rows
-- are protected in place below so their IDs and references never change.
create or replace function public.provision_support_subsetor_for_new_sector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.subsetores (setor_id, nome, ativo)
  values (new.id, 'Suporte', true)
  on conflict do nothing;

  return null;
end;
$function$;

-- Preserve the canonical Support row and every FK that points to it. During an
-- ON DELETE CASCADE the parent sector is already invisible, so the child delete
-- is allowed; direct mutations while the parent exists fail clearly.
create or replace function public.protect_active_support_subsetor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.setores as setor
    where setor.id = old.setor_id
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      message = 'O subsetor Suporte ativo é obrigatório e não pode ser excluído, desativado, renomeado ou movido enquanto o setor existir.';
  end if;

  if new.ativo is not true
    or pg_catalog.lower(pg_catalog.btrim(new.nome)) is distinct from 'suporte'
    or new.setor_id is distinct from old.setor_id
  then
    raise exception using
      errcode = '23514',
      message = 'O subsetor Suporte ativo é obrigatório e não pode ser excluído, desativado, renomeado ou movido enquanto o setor existir.';
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_support_subsetor_name on public.subsetores;
create trigger normalize_support_subsetor_name
before insert or update of nome on public.subsetores
for each row
execute function public.normalize_support_subsetor_name();

drop trigger if exists restore_support_after_sector_insert on public.setores;
create trigger restore_support_after_sector_insert
after insert on public.setores
for each row
execute function public.provision_support_subsetor_for_new_sector();

drop trigger if exists restore_support_after_subsetor_delete on public.subsetores;
drop trigger if exists restore_support_after_subsetor_update on public.subsetores;

drop trigger if exists protect_active_support_subsetor on public.subsetores;
create trigger protect_active_support_subsetor
before delete or update of nome, ativo, setor_id on public.subsetores
for each row
when (
  old.ativo is true
  and pg_catalog.lower(pg_catalog.btrim(old.nome)) = 'suporte'
)
execute function public.protect_active_support_subsetor();

drop function if exists public.restore_active_support_subsetor();

revoke all on function public.normalize_support_subsetor_name()
  from public, anon, authenticated, service_role;
revoke all on function public.provision_support_subsetor_for_new_sector()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_active_support_subsetor()
  from public, anon, authenticated, service_role;

-- Route-aware function used by automatic assignment. The expected sector and
-- subsetor are part of the conditional UPDATE so a stale routing decision can
-- never assign a ticket after it has moved to another queue.
create or replace function public.try_atomic_assign_ticket_in_context(
  p_ticket_id uuid,
  p_colaborador_id uuid,
  p_max_tickets integer,
  p_expected_setor_id uuid,
  p_expected_subsetor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_count bigint;
  v_updated_count integer;
  v_candidate_ativo boolean;
  v_candidate_is_online boolean;
  v_candidate_pausa_id uuid;
begin
  if p_colaborador_id is null
    or p_max_tickets is null
    or p_max_tickets < 1
    or p_expected_setor_id is null
  then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'invalid_arguments'
    );
  end if;

  -- Match transfer_ticket_atomic's ticket -> collaborator lock order. Taking
  -- the ticket lock before the per-candidate advisory lock prevents a transfer
  -- and an automatic assignment from waiting on each other in reverse order.
  perform ticket.id
  from public.tickets as ticket
  where ticket.id = p_ticket_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'ticket_not_found'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_colaborador_id::text, 0)
  );

  select
    candidato.ativo,
    candidato.is_online,
    candidato.pausa_atual_id
  into
    v_candidate_ativo,
    v_candidate_is_online,
    v_candidate_pausa_id
  from public.colaboradores as candidato
  where candidato.id = p_colaborador_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'candidate_not_found'
    );
  end if;

  if v_candidate_ativo is not true then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'candidate_inactive'
    );
  end if;

  if v_candidate_is_online is not true then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'candidate_offline'
    );
  end if;

  if v_candidate_pausa_id is not null then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'candidate_paused'
    );
  end if;

  perform vinculo.id
  from public.colaboradores_setores as vinculo
  where vinculo.colaborador_id = p_colaborador_id
    and vinculo.setor_id = p_expected_setor_id
  for key share;

  if not found then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', 0,
      'reason', 'candidate_not_linked_to_expected_setor'
    );
  end if;

  select pg_catalog.count(*)
  into v_current_count
  from public.tickets as assigned_ticket
  where assigned_ticket.colaborador_id = p_colaborador_id
    and assigned_ticket.status in ('aberto', 'em_atendimento');

  if v_current_count >= p_max_tickets then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', v_current_count,
      'reason', 'max_tickets_reached'
    );
  end if;

  update public.tickets as ticket
  set
    colaborador_id = p_colaborador_id,
    status = 'em_atendimento'
  where ticket.id = p_ticket_id
    and ticket.colaborador_id is null
    and ticket.status in ('aberto', 'em_atendimento')
    and ticket.setor_id = p_expected_setor_id
    and ticket.subsetor_id is not distinct from p_expected_subsetor_id;

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    return pg_catalog.jsonb_build_object(
      'assigned', false,
      'current_count', v_current_count,
      'reason', 'ticket_route_changed_or_already_assigned'
    );
  end if;

  update public.colaboradores as colaborador
  set last_ticket_received_at = pg_catalog.clock_timestamp()
  where colaborador.id = p_colaborador_id;

  return pg_catalog.jsonb_build_object(
    'assigned', true,
    'current_count', v_current_count + 1
  );
end;
$function$;

-- Keep the legacy signature present so older deployments receive a structured,
-- fail-closed response instead of bypassing the expected-route invariant.
create or replace function public.try_atomic_assign_ticket(
  p_ticket_id uuid,
  p_colaborador_id uuid,
  p_max_tickets integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return pg_catalog.jsonb_build_object(
    'assigned', false,
    'current_count', 0,
    'reason', 'expected_route_required'
  );
end;
$function$;

-- Transfer tickets without exposing an intermediate unassigned state.
-- The route uses the service role, while this function revalidates every
-- authorization and routing invariant inside the transaction.

create or replace function public.transfer_ticket_atomic(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_setor_id uuid,
  p_subsetor_id uuid,
  p_colaborador_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ticket_setor_id uuid;
  v_ticket_colaborador_id uuid;
  v_ticket_status text;
  v_actor_ativo boolean;
  v_actor_is_master boolean;
  v_colaborador_ativo boolean;
  v_colaborador_is_online boolean;
  v_colaborador_pausa_id uuid;
begin
  select
    ticket.setor_id,
    ticket.colaborador_id,
    ticket.status
  into
    v_ticket_setor_id,
    v_ticket_colaborador_id,
    v_ticket_status
  from public.tickets as ticket
  where ticket.id = p_ticket_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'TICKET_NOT_FOUND');
  end if;

  -- Lock actor and destination in a deterministic UUID order. FOR UPDATE avoids
  -- a later SHARE -> UPDATE lock upgrade when last_ticket_received_at changes.
  perform colaborador.id
  from public.colaboradores as colaborador
  where colaborador.id = p_actor_id
    or (p_colaborador_id is not null and colaborador.id = p_colaborador_id)
  order by colaborador.id
  for update;

  select
    actor.ativo,
    actor.is_master
  into
    v_actor_ativo,
    v_actor_is_master
  from public.colaboradores as actor
  where actor.id = p_actor_id;

  if not found or v_actor_ativo is not true then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'ACTOR_NOT_AUTHORIZED');
  end if;

  if v_actor_is_master is not true
    and v_ticket_colaborador_id is distinct from p_actor_id
  then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'TICKET_FORBIDDEN');
  end if;

  if v_ticket_status not in ('aberto', 'em_atendimento') then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'TICKET_INACTIVE');
  end if;

  if p_setor_id is null
    or not exists (
      select 1
      from public.setores as setor
      where setor.id = p_setor_id
    )
  then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'TARGET_SECTOR_NOT_FOUND');
  end if;

  if p_setor_id <> v_ticket_setor_id
    and not exists (
      select 1
      from public.setor_destinos_transferencia as destino
      where destino.setor_origem_id = v_ticket_setor_id
        and destino.setor_destino_id = p_setor_id
    )
  then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'TRANSFER_NOT_ALLOWED');
  end if;

  if p_subsetor_id is not null
    and not exists (
      select 1
      from public.subsetores as subsetor
      where subsetor.id = p_subsetor_id
        and subsetor.setor_id = p_setor_id
        and subsetor.ativo is true
    )
  then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'INVALID_SUBSETOR');
  end if;

  if p_colaborador_id is not null then
    select
      colaborador.ativo,
      colaborador.is_online,
      colaborador.pausa_atual_id
    into
      v_colaborador_ativo,
      v_colaborador_is_online,
      v_colaborador_pausa_id
    from public.colaboradores as colaborador
    where colaborador.id = p_colaborador_id;

    if not found or v_colaborador_ativo is not true then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'INVALID_COLLABORATOR');
    end if;

    if not exists (
      select 1
      from public.colaboradores_setores as vinculo
      where vinculo.colaborador_id = p_colaborador_id
        and vinculo.setor_id = p_setor_id
    ) then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'COLLABORATOR_NOT_LINKED');
    end if;

    if p_subsetor_id is null then
      if exists (
        select 1
        from public.colaboradores_subsetores as vinculo
        where vinculo.colaborador_id = p_colaborador_id
          and vinculo.setor_id = p_setor_id
      ) then
        return pg_catalog.jsonb_build_object(
          'success', false,
          'code', 'COLLABORATOR_SUBSETOR_MISMATCH'
        );
      end if;
    elsif not exists (
      select 1
      from public.colaboradores_subsetores as vinculo
      where vinculo.colaborador_id = p_colaborador_id
        and vinculo.setor_id = p_setor_id
        and vinculo.subsetor_id = p_subsetor_id
    ) then
      return pg_catalog.jsonb_build_object(
        'success', false,
        'code', 'COLLABORATOR_SUBSETOR_MISMATCH'
      );
    end if;

    if v_colaborador_is_online is true and v_colaborador_pausa_id is not null then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'COLLABORATOR_ONLINE_PAUSED');
    end if;
  end if;

  update public.tickets as ticket
  set
    setor_id = p_setor_id,
    subsetor_id = p_subsetor_id,
    colaborador_id = p_colaborador_id,
    status = case
      when p_colaborador_id is null then 'aberto'
      else 'em_atendimento'
    end
  where ticket.id = p_ticket_id;

  if p_colaborador_id is not null then
    update public.colaboradores as colaborador
    set last_ticket_received_at = pg_catalog.clock_timestamp()
    where colaborador.id = p_colaborador_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'queued', p_colaborador_id is null,
    'setor_id', p_setor_id,
    'subsetor_id', p_subsetor_id,
    'colaborador_id', p_colaborador_id
  );
end;
$function$;

revoke all on function public.try_atomic_assign_ticket_in_context(uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.try_atomic_assign_ticket_in_context(uuid, uuid, integer, uuid, uuid)
  to service_role;

revoke all on function public.try_atomic_assign_ticket(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.try_atomic_assign_ticket(uuid, uuid, integer)
  to service_role;

revoke all on function public.transfer_ticket_atomic(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_ticket_atomic(uuid, uuid, uuid, uuid, uuid)
  to service_role;
