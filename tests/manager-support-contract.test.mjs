import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

function source(path) {
  return readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
}

test('the manager group is isolated from ticket routing', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.setor_gestores/i)
  assert.match(migration, /UNIQUE\s*\(setor_id,\s*colaborador_id\)/i)
  assert.doesNotMatch(migration, /INSERT INTO public\.subsetores/i)
  assert.doesNotMatch(migration, /INSERT INTO public\.colaboradores_subsetores/i)
})

test('manager group changes one member through an atomic database call', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const route = source('app/api/setores/[id]/gestores/route.ts')
  const definition = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_definir_gestor_setor('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_aceitar_apoio('),
  )

  assert.match(route, /\.rpc\(\s*['"]chama_gestor_definir_gestor_setor['"]/)
  assert.match(route, /p_setor_id:\s*parsedSectorId\.data/)
  assert.match(route, /p_colaborador_id:\s*colaboradorId/)
  assert.match(route, /p_incluir:\s*incluir/)
  assert.doesNotMatch(
    route,
    /\.from\(['"]setor_gestores['"]\)\s*\.(?:insert|delete)\(/,
  )
  assert.match(definition, /RETURNS boolean[\s\S]*SECURITY DEFINER/)
  assert.match(definition, /IF p_incluir THEN[\s\S]*chama_gestor_bloquear_elegibilidade_gestor/)
  assert.match(definition, /ELSE[\s\S]*DELETE FROM public\.setor_gestores/)
  assert.match(definition, /GET DIAGNOSTICS linhas_alteradas = ROW_COUNT/)
  assert.match(definition, /RETURN linhas_alteradas = 1/)
  assert.ok(
    definition.indexOf('chama_gestor_bloquear_elegibilidade_gestor')
      < definition.indexOf('chama_gestor_bloquear_setor(p_setor_id)'),
    'inclusion eligibility must be locked before the sector',
  )
  assert.ok(
    definition.indexOf('chama_gestor_bloquear_setor(p_setor_id)')
      < definition.indexOf('INSERT INTO public.setor_gestores'),
    'the sector must be serialized before insertion',
  )
  assert.ok(
    definition.indexOf('chama_gestor_bloquear_setor(p_setor_id)')
      < definition.indexOf('DELETE FROM public.setor_gestores'),
    'the sector must be serialized before stale removal',
  )
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.chama_gestor_substituir_gestores_setor\(uuid, uuid\[\]\);/,
  )
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.chama_gestor_substituir_gestores_setor/,
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.chama_gestor_definir_gestor_setor\(uuid, uuid, boolean\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.chama_gestor_definir_gestor_setor\(uuid, uuid, boolean\)[\s\S]*TO service_role;/,
  )
})

test('sector UI sends one manager operation without fetching and replacing the group', () => {
  const sector = source('app/setor/[id]/page.tsx')
  const start = sector.indexOf('const saveManagerSupportAssignment')
  const end = sector.indexOf('const openCreateAtendenteModal', start)
  const saveAssignment = sector.slice(start, end)

  assert.match(saveAssignment, /colaboradorId,/)
  assert.match(saveAssignment, /incluir:\s*isManagerSupportAgent/)
  assert.doesNotMatch(saveAssignment, /fetchSetorManagerIds/)
  assert.doesNotMatch(saveAssignment, /colaboradorIds|nextManagerIds/)
})

test('manager lifecycle serializes every sector mutation before cleanup', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const serializer = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_setor('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador('),
  )
  const synchronization = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador_alterado()'),
  )

  assert.match(serializer, /pg_advisory_xact_lock\([\s\S]*96439/)
  assert.match(serializer, /BEFORE INSERT OR DELETE ON public\.setor_gestores/)
  assert.match(serializer, /chama_gestor_bloquear_setor\((?:OLD|NEW)\.setor_id\)/)
  assert.match(synchronization, /array_agg\(escopo\.setor_id ORDER BY escopo\.setor_id\)/)
  assert.match(synchronization, /FOR KEY SHARE;[\s\S]*chama_gestor_bloquear_setor\(setor_id_bloqueado\)/)
  assert.ok(
    synchronization.indexOf('chama_gestor_bloquear_setor(setor_id_bloqueado)')
      < synchronization.indexOf('DELETE FROM public.setor_gestores'),
    'all sector locks must be held before lifecycle deletions begin',
  )
})

test('support sessions have a single active request and an atomic first-manager acceptance', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const route = source('app/api/tickets/[ticketId]/apoio-gestor/route.ts')
  const acceptance = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_aceitar_apoio('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_apoio()'),
  )

  assert.match(migration, /CREATE UNIQUE INDEX[\s\S]*ticket_apoios_gestor[\s\S]*WHERE[\s\S]*status[\s\S]*(pendente|ativo)/i)
  assert.match(route, /\.rpc\(\s*['"]chama_gestor_aceitar_apoio['"]/)
  assert.match(route, /p_ticket_id:\s*context\.ticket\.id/)
  assert.match(route, /p_apoio_id:\s*support\.id/)
  assert.match(route, /p_gestor_id:\s*context\.actor\.id/)
  assert.match(route, /getManagerSupportById\([\s\S]*accepted !== true/)
  assert.doesNotMatch(
    route.slice(route.indexOf('async function acceptPendingSupport'), route.indexOf('async function createPendingSupport')),
    /\.from\(['"]ticket_apoios_gestor['"]\)[\s\S]*\.update\(/,
  )
  assert.match(acceptance, /RETURNS boolean[\s\S]*SECURITY DEFINER/)
  assert.match(acceptance, /VALUES \(apoio_atendente_id\), \(p_gestor_id\)[\s\S]*ORDER BY participante\.id/)
  assert.match(acceptance, /chama_gestor_bloquear_gestor_elegivel/)
  assert.match(acceptance, /FROM public\.tickets AS ticket[\s\S]*FOR UPDATE;/)
  assert.match(acceptance, /UPDATE public\.ticket_apoios_gestor AS apoio/)
  assert.match(acceptance, /apoio\.status = 'pendente'/)
  assert.match(acceptance, /apoio\.gestor_id IS NULL/)
  assert.ok(
    acceptance.indexOf('FOR participante_id IN')
      < acceptance.indexOf('chama_gestor_bloquear_gestor_elegivel'),
    'participants must be locked in deterministic order before manager membership',
  )
  assert.ok(
    acceptance.indexOf('chama_gestor_bloquear_gestor_elegivel')
      < acceptance.indexOf('FROM public.tickets AS ticket'),
    'manager eligibility must be locked before the ticket and support rows',
  )
  assert.ok(
    acceptance.indexOf('FROM public.tickets AS ticket')
      < acceptance.indexOf('UPDATE public.ticket_apoios_gestor'),
    'the ticket must be locked before the support row',
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.chama_gestor_aceitar_apoio\(uuid, uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.chama_gestor_aceitar_apoio\(uuid, uuid, uuid\)[\s\S]*TO service_role;/,
  )
})

test('database writes revalidate the locked ticket and current participants', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const supportGuard = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_apoio()'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_mensagem()'),
  )
  const messageGuard = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_mensagem()'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_definir_atualizado_em()'),
  )
  const eligibilityGuard = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_elegibilidade_gestor('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_gestor_elegivel('),
  )
  const managerGuard = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_gestor_elegivel('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_apoio()'),
  )

  assert.match(supportGuard, /FROM public\.tickets[\s\S]*FOR UPDATE;/)
  assert.match(supportGuard, /ticket_status NOT IN \('aberto', 'em_atendimento'\)/)
  assert.match(supportGuard, /ticket_setor_id IS DISTINCT FROM NEW\.setor_id/)
  assert.match(supportGuard, /ticket_atendente_id IS DISTINCT FROM NEW\.atendente_id/)
  assert.match(
    supportGuard,
    /FROM public\.colaboradores AS atendente[\s\S]*atendente\.ativo IS TRUE[\s\S]*FOR SHARE;/,
  )
  assert.match(supportGuard, /chama_gestor_bloquear_gestor_elegivel\(NEW\.gestor_id, NEW\.setor_id\)/)
  assert.match(messageGuard, /BEFORE INSERT ON public\.ticket_apoio_mensagens/)
  assert.match(messageGuard, /apoio_status <> 'ativo'/)
  assert.match(messageGuard, /FROM public\.ticket_apoios_gestor AS apoio[\s\S]*FOR UPDATE;/)
  assert.match(messageGuard, /NEW\.autor_id <> apoio_atendente_id[\s\S]*apoio_gestor_id/)
  assert.match(messageGuard, /FROM public\.colaboradores AS autor[\s\S]*autor\.ativo IS TRUE[\s\S]*FOR SHARE;/)
  assert.match(eligibilityGuard, /FROM public\.colaboradores AS colaborador[\s\S]*FOR SHARE;/)
  assert.match(eligibilityGuard, /FROM public\.permissoes AS permissao[\s\S]*FOR SHARE;/)
  assert.match(managerGuard, /chama_gestor_bloquear_elegibilidade_gestor/)
  assert.match(managerGuard, /FROM public\.setor_gestores AS gestor[\s\S]*FOR KEY SHARE;/)
})

test('support persistence and direct notifications share one database transaction', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const supportRoute = source('app/api/tickets/[ticketId]/apoio-gestor/route.ts')
  const messagesRoute = source('app/api/tickets/[ticketId]/apoio-gestor/mensagens/route.ts')
  const notificationTrigger = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_notificar_apoio()'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_validar_mensagem()'),
  )

  assert.match(notificationTrigger, /AFTER INSERT OR UPDATE OF status ON public\.ticket_apoios_gestor/)
  assert.match(notificationTrigger, /TG_OP = 'INSERT' AND NEW\.status = 'pendente'/)
  assert.match(notificationTrigger, /OLD\.status = 'pendente'[\s\S]*NEW\.status = 'ativo'/)
  assert.match(notificationTrigger, /INSERT INTO public\.notificacoes/)
  assert.match(notificationTrigger, /'chama_gestor'/)
  assert.match(notificationTrigger, /NEW\.ticket_id/)
  assert.match(notificationTrigger, /FOR KEY SHARE OF gestor/)
  assert.match(notificationTrigger, /GET DIAGNOSTICS notificacoes_criadas = ROW_COUNT/)
  assert.match(notificationTrigger, /Não há gestor elegível para receber o chamado[\s\S]*ERRCODE = '23514'/)
  assert.match(supportRoute, /pushManagerSupportRecipients/)
  assert.doesNotMatch(supportRoute, /notifyManagerSupportRecipients/)
  assert.doesNotMatch(supportRoute, /\.delete\(\)/)
  assert.match(messagesRoute, /notifyManagerSupportRecipients/)
})

test('manager membership follows profile and sector lifecycle without routing writes', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const synchronization = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_sincronizar_colaborador('),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.chama_gestor_bloquear_gestor_elegivel('),
  )

  assert.match(synchronization, /colaborador\.is_master/)
  assert.match(synchronization, /permissao\.can_view_dashboard/)
  assert.match(synchronization, /public\.colaborador_setores/)
  assert.match(synchronization, /public\.colaboradores_setores/)
  assert.match(synchronization, /colaborador\.setor_id/)
  assert.match(
    synchronization,
    /VALUES \(OLD\.colaborador_id\), \(NEW\.colaborador_id\)[\s\S]*ORDER BY vinculo\.colaborador_id/,
  )
  assert.match(synchronization, /AFTER INSERT ON public\.setores/)
  assert.match(synchronization, /AFTER DELETE ON public\.setor_gestores/)
  assert.match(synchronization, /apoio\.status = 'ativo'/)
  assert.match(synchronization, /status = 'cancelado'[\s\S]*apoio\.status = 'pendente'[\s\S]*NOT EXISTS/)
  assert.match(synchronization, /OLD\.ativo IS TRUE[\s\S]*NEW\.ativo IS NOT TRUE[\s\S]*apoio\.atendente_id = NEW\.id/)
  assert.doesNotMatch(synchronization, /(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM)?\s*public\.subsetores/i)
  assert.doesNotMatch(synchronization, /public\.colaboradores_subsetores/i)
})

test('editing a supervisor changes only added or removed sector links', () => {
  const usersPage = source('app/dashboard/usuarios/page.tsx')
  const start = usersPage.indexOf('if (editingUser)')
  const end = usersPage.indexOf('} else {', start)
  const editingFlow = usersPage.slice(start, end)
  const deleteStart = editingFlow.indexOf(".from('colaborador_setores')")
  const deleteEnd = editingFlow.indexOf('if (error)', deleteStart)
  const deleteQuery = editingFlow.slice(deleteStart, deleteEnd)

  assert.match(editingFlow, /const removedSectorIds =/)
  assert.match(editingFlow, /const addedSectorIds =/)
  assert.match(deleteQuery, /\.delete\(\)[\s\S]*\.in\(['"]setor_id['"],\s*removedSectorIds\)/)
  assert.equal((editingFlow.match(/\.delete\(\)/g) ?? []).length, 1)
})

test('eligible managers keep support metadata visibility through terminal realtime updates', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const supportPolicy = migration.slice(
    migration.indexOf('CREATE POLICY "ticket_apoios_gestor_select_participantes"'),
    migration.indexOf('DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.ticket_apoio_mensagens'),
  )

  assert.match(supportPolicy, /OR public\.chama_gestor_eh_gestor_setor\(setor_id\)/)
  assert.doesNotMatch(supportPolicy, /status\s*(?:=|IN)/i)
})

test('support chat uses its own private storage instead of customer messages', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')
  const supportRoute = source('app/api/tickets/[ticketId]/apoio-gestor/route.ts')
  const messagesRoute = source('app/api/tickets/[ticketId]/apoio-gestor/mensagens/route.ts')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ticket_apoio_mensagens/i)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(messagesRoute, /from\(['"]ticket_apoio_mensagens['"]\)/)
  assert.doesNotMatch(supportRoute + messagesRoute, /from\(['"]mensagens['"]\)/)
})

test('server routes authenticate the actor and enforce ticket or manager membership', () => {
  const supportRoute = source('app/api/tickets/[ticketId]/apoio-gestor/route.ts')
  const messagesRoute = source('app/api/tickets/[ticketId]/apoio-gestor/mensagens/route.ts')
  const managersRoute = source('app/api/setores/[id]/gestores/route.ts')
  const helper = source('lib/server/manager-support.ts')
  const combined = supportRoute + messagesRoute + managersRoute + helper

  assert.match(combined, /auth\.getUser\(\)/)
  assert.match(combined, /setor_gestores/)
  assert.match(combined, /colaborador_id/)
  assert.match(combined, /can_manage_users/)
  assert.match(combined, /can_view_dashboard/)
  assert.match(helper, /hasCurrentSectorAccess/)
  assert.match(helper, /colaborador_setores/)
  assert.match(helper, /colaboradores_setores/)
  assert.match(helper, /legacySectorId/)
  assert.match(supportRoute, /selected\.support\?\.status === ['"]ativo['"][\s\S]*isSupportParticipant/)
})

test('both ticket surfaces expose the private manager-support dialog', () => {
  const component = source('components/tickets/manager-support.tsx')
  const workdesk = source('app/workdesk/page.tsx')
  const sector = source('app/setor/[id]/page.tsx')

  assert.match(component, /Chamar gestor/i)
  assert.match(component, /(interno|privad)/i)
  assert.match(component, /ticket_apoio_mensagens/)
  assert.match(component, /autoOpenSupportId/)
  assert.match(component, /const autoOpenKey = `\$\{ticketId\}:\$\{autoOpenSupportId\}`/)
  assert.match(workdesk, /const supportId = params\.get\(['"]apoio['"]\)/)
  assert.match(workdesk, /autoOpenSupportId=/)
  assert.match(sector, /autoOpenSupportId=/)
  assert.match(workdesk, /<ManagerSupport/)
  assert.match(sector, /<ManagerSupport/)
})

test('manager notifications are private and honor their explicit deep link', () => {
  const notifications = source('components/workdesk/notificacoes-panel.tsx')
  const supportRoute = source('app/api/tickets/[ticketId]/apoio-gestor/route.ts')

  assert.ok(
    notifications.indexOf('notificacao.url') < notifications.indexOf('notificacao.ticket_id'),
    'an explicit URL must take precedence over the generic WorkDesk ticket target',
  )
  assert.match(notifications, /destinatario_id\.is\.null/)
  assert.match(supportRoute, /\/setor\/\$\{[^}]+\}\?ticket=/)
  assert.match(supportRoute, /\/workdesk\?ticket=/)
})

test('notification RLS never exposes a direct notification to the whole sector', () => {
  const migration = source('supabase/migrations/20260810190000_chama_gestor.sql')

  assert.match(migration, /DROP POLICY IF EXISTS "fase1_authenticated_all" ON public\.notificacoes;/)
  assert.match(migration, /destinatario_id = public\.chama_gestor_colaborador_atual_id\(\)/)
  assert.match(migration, /destinatario_id IS NULL[\s\S]*chama_gestor_tem_acesso_setor\(setor_id\)/)
  assert.match(migration, /remetente_id = public\.chama_gestor_colaborador_atual_id\(\)[\s\S]{0,180}chama_gestor_pode_gerir_setor\(setor_id\)/)
  assert.match(migration, /chama_gestor_eh_gestor_setor[\s\S]*setor_gestores/)
  assert.match(migration, /DROP POLICY IF EXISTS "fase1_authenticated_all" ON public\.notificacoes_lidas;/)
  assert.match(migration, /notificacoes_lidas_insert_proprio[\s\S]*WITH CHECK \(colaborador_id = public\.chama_gestor_colaborador_atual_id\(\)\)/)
})

test('sent notifications history only lists notices authored by the logged collaborator', () => {
  const sector = source('app/setor/[id]/page.tsx')
  const notificationRoute = source('app/api/notificacoes/route.ts')
  const start = sector.indexOf('const fetchAvisosEnviados')
  const end = sector.indexOf('const deleteAviso', start)
  const historyQuery = sector.slice(start, end)

  assert.match(historyQuery, /\.eq\(['"]setor_id['"],\s*setor\.id\)/)
  assert.match(historyQuery, /\.eq\(['"]remetente_id['"],\s*colaboradorLogado\.id\)/)
  assert.match(historyQuery, /\.or\(['"]tipo\.eq\.aviso,tipo\.eq\.info,tipo\.is\.null['"]\)/)
  assert.match(notificationRoute, /tipo:\s*['"]aviso['"]/)
})

test('sector deep-link deduplication distinguishes support sessions on the same ticket', () => {
  const sector = source('app/setor/[id]/page.tsx')

  assert.match(sector, /const requestedSupportId = searchParams\.get\(['"]apoio['"]\)/)
  assert.match(
    sector,
    /const requestedConversationKey = `\$\{requestedTicketId\}:\$\{requestedSupportId \?\? ['"]['"]\}`/,
  )
  assert.match(sector, /openedConversationFromQueryRef\.current = requestedConversationKey/)
})
