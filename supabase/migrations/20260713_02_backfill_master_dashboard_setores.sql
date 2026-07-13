-- Admins previously did not persist their selected sectors in the Dashboard
-- relation. Copy only their existing atendimento links so push alerts remain
-- restricted to sectors explicitly selected for that collaborator.
insert into public.colaborador_setores (colaborador_id, setor_id)
select atendimento.colaborador_id, atendimento.setor_id
from public.colaboradores_setores as atendimento
join public.colaboradores as colaborador on colaborador.id = atendimento.colaborador_id
where colaborador.is_master = true
on conflict do nothing;
