import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToColaboradores } from '@/lib/push'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const ACTIVE_TICKET_STATUSES = ['aberto', 'em_atendimento'] as const
export const OPEN_MANAGER_SUPPORT_STATUSES = ['pendente', 'ativo'] as const

export const MANAGER_SUPPORT_SELECT = [
  'id',
  'ticket_id',
  'setor_id',
  'atendente_id',
  'atendente_nome',
  'solicitante_id',
  'gestor_id',
  'gestor_nome',
  'origem',
  'status',
  'motivo',
  'solicitado_em',
  'aceito_em',
  'encerrado_em',
  'encerrado_por_id',
  'atualizado_em',
].join(',')

export const MANAGER_SUPPORT_MESSAGE_SELECT = [
  'id',
  'apoio_id',
  'autor_id',
  'autor_nome',
  'conteudo',
  'criado_em',
].join(',')

type PermissionRelation =
  | {
      can_view_dashboard?: boolean | null
      can_manage_users?: boolean | null
    }
  | {
      can_view_dashboard?: boolean | null
      can_manage_users?: boolean | null
    }[]
  | null

export type ManagerSupportRole = 'attendant' | 'manager'
export type ManagerSupportStatus = 'pendente' | 'ativo' | 'encerrado' | 'cancelado'

export interface ManagerSupportActor {
  id: string
  name: string
  email: string
  active: boolean
  isMaster: boolean
  canViewDashboard: boolean
  canManageUsers: boolean
  legacySectorId: string | null
}

export interface ManagerSupportTicket {
  id: string
  number: number | null
  status: string
  sectorId: string
  attendantId: string | null
  attendantName: string | null
}

export interface ManagerSupportRow {
  id: string
  ticket_id: string
  setor_id: string
  atendente_id: string
  atendente_nome: string
  solicitante_id: string
  gestor_id: string | null
  gestor_nome: string | null
  origem: 'atendente' | 'gestor'
  status: ManagerSupportStatus
  motivo: string | null
  solicitado_em: string
  aceito_em: string | null
  encerrado_em: string | null
  encerrado_por_id: string | null
  atualizado_em: string
}

export interface ManagerSupportMessageRow {
  id: string
  apoio_id: string
  autor_id: string
  autor_nome: string
  conteudo: string
  criado_em: string
}

export interface EligibleManager {
  id: string
  name: string
  email: string
  isMaster: boolean
  canViewDashboard: boolean
  createdAt: string | null
}

export type ManagerSupportAuthResult =
  | {
      ok: true
      actor: ManagerSupportActor
      service: ReturnType<typeof createServiceClient>
    }
  | {
      ok: false
      status: number
      code: string
      error: string
    }

export type ManagerSupportContextResult =
  | {
      ok: true
      actor: ManagerSupportActor
      service: ReturnType<typeof createServiceClient>
      ticket: ManagerSupportTicket
      role: ManagerSupportRole
      canParticipate: boolean
      isTicketOwner: boolean
      isEligibleManager: boolean
    }
  | {
      ok: false
      status: number
      code: string
      error: string
    }

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function managerPermission(value: PermissionRelation) {
  return firstRelation(value)
}

function collaboratorName(value: unknown) {
  const relation = firstRelation(value as { nome?: unknown } | { nome?: unknown }[] | null)
  return typeof relation?.nome === 'string' ? relation.nome : null
}

export function isActiveTicket(status: string) {
  return ACTIVE_TICKET_STATUSES.includes(status as (typeof ACTIVE_TICKET_STATUSES)[number])
}

export function isSupportParticipant(
  support: ManagerSupportRow,
  context: Extract<ManagerSupportContextResult, { ok: true }>,
) {
  if (context.isTicketOwner) {
    return support.atendente_id === context.actor.id
  }

  return context.isEligibleManager && support.gestor_id === context.actor.id
}

export async function authenticateManagerSupportActor(): Promise<ManagerSupportAuthResult> {
  try {
    const auth = await createServerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user?.email) {
      return {
        ok: false,
        status: 401,
        code: 'SESSION_REQUIRED',
        error: 'Sessão inválida.',
      }
    }

    const service = createServiceClient()
    const { data: collaborator, error } = await service
      .from('colaboradores')
      .select(
        'id, nome, email, ativo, is_master, setor_id, permissoes:permissao_id(can_view_dashboard, can_manage_users)',
      )
      .eq('email', user.email)
      .maybeSingle()

    if (error) {
      console.error('[manager-support] Failed to resolve authenticated collaborator:', error.message)
      return {
        ok: false,
        status: 500,
        code: 'SUPPORT_AUTH_CHECK_FAILED',
        error: 'Não foi possível validar o colaborador.',
      }
    }

    if (!collaborator?.ativo) {
      return {
        ok: false,
        status: 403,
        code: 'COLLABORATOR_INACTIVE',
        error: 'Colaborador não autorizado.',
      }
    }

    const permission = managerPermission(collaborator.permissoes as PermissionRelation)
    return {
      ok: true,
      service,
      actor: {
        id: collaborator.id,
        name: collaborator.nome,
        email: collaborator.email,
        active: true,
        isMaster: collaborator.is_master === true,
        canViewDashboard: permission?.can_view_dashboard === true,
        canManageUsers: permission?.can_manage_users === true,
        legacySectorId: collaborator.setor_id ?? null,
      },
    }
  } catch (error) {
    console.error('[manager-support] Unexpected authentication failure:', error)
    return {
      ok: false,
      status: 500,
      code: 'SUPPORT_AUTH_CHECK_FAILED',
      error: 'Não foi possível validar a sessão.',
    }
  }
}

export async function resolveManagerSupportContext(
  ticketId: string,
): Promise<ManagerSupportContextResult> {
  const authentication = await authenticateManagerSupportActor()
  if (!authentication.ok) return authentication

  const { actor, service } = authentication
  const { data: ticket, error: ticketError } = await service
    .from('tickets')
    .select('id, numero, status, setor_id, colaborador_id, colaboradores(nome)')
    .eq('id', ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error('[manager-support] Failed to load ticket context:', ticketError.message)
    return {
      ok: false,
      status: 500,
      code: 'SUPPORT_CONTEXT_CHECK_FAILED',
      error: 'Não foi possível validar o ticket.',
    }
  }

  if (!ticket) {
    return {
      ok: false,
      status: 404,
      code: 'TICKET_NOT_FOUND',
      error: 'Ticket não encontrado.',
    }
  }

  const isTicketOwner = ticket.colaborador_id === actor.id
  const hasManagerProfile = actor.isMaster || actor.canViewDashboard
  let hasManagerLink = false
  let hasCurrentSectorLink = false

  if (hasManagerProfile && !isTicketOwner) {
    const [managerLinkResult, sectorLinkResult] = await Promise.all([
      service
        .from('setor_gestores')
        .select('colaborador_id')
        .eq('setor_id', ticket.setor_id)
        .eq('colaborador_id', actor.id)
        .maybeSingle(),
      hasCurrentSectorAccess(service, actor, ticket.setor_id),
    ])

    if (managerLinkResult.error || sectorLinkResult.error) {
      console.error(
        '[manager-support] Failed to validate manager sector:',
        managerLinkResult.error?.message ?? sectorLinkResult.error,
      )
      return {
        ok: false,
        status: 500,
        code: 'SUPPORT_CONTEXT_CHECK_FAILED',
        error: 'Não foi possível validar o setor do gestor.',
      }
    }

    hasManagerLink = Boolean(managerLinkResult.data)
    hasCurrentSectorLink = sectorLinkResult.linked
  }

  const isEligibleManager = hasManagerProfile && hasManagerLink && hasCurrentSectorLink
  const role: ManagerSupportRole = isTicketOwner
    ? 'attendant'
    : hasManagerProfile
      ? 'manager'
      : 'attendant'

  return {
    ok: true,
    actor,
    service,
    ticket: {
      id: ticket.id,
      number: ticket.numero ?? null,
      status: ticket.status,
      sectorId: ticket.setor_id,
      attendantId: ticket.colaborador_id,
      attendantName: collaboratorName(ticket.colaboradores),
    },
    role,
    canParticipate: isTicketOwner || isEligibleManager,
    isTicketOwner,
    isEligibleManager,
  }
}

export async function getLatestManagerSupport(
  service: SupabaseClient,
  ticketId: string,
): Promise<{ support: ManagerSupportRow | null; error: string | null }> {
  const { data, error } = await service
    .from('ticket_apoios_gestor')
    .select(MANAGER_SUPPORT_SELECT)
    .eq('ticket_id', ticketId)
    .order('solicitado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    support: (data as ManagerSupportRow | null) ?? null,
    error: error?.message ?? null,
  }
}

export async function getManagerSupportById(
  service: SupabaseClient,
  ticketId: string,
  supportId: string,
): Promise<{ support: ManagerSupportRow | null; error: string | null }> {
  const { data, error } = await service
    .from('ticket_apoios_gestor')
    .select(MANAGER_SUPPORT_SELECT)
    .eq('id', supportId)
    .eq('ticket_id', ticketId)
    .maybeSingle()

  return {
    support: (data as ManagerSupportRow | null) ?? null,
    error: error?.message ?? null,
  }
}

export async function getOpenManagerSupport(
  service: SupabaseClient,
  ticketId: string,
): Promise<{ support: ManagerSupportRow | null; error: string | null }> {
  const { data, error } = await service
    .from('ticket_apoios_gestor')
    .select(MANAGER_SUPPORT_SELECT)
    .eq('ticket_id', ticketId)
    .in('status', [...OPEN_MANAGER_SUPPORT_STATUSES])
    .order('solicitado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    support: (data as ManagerSupportRow | null) ?? null,
    error: error?.message ?? null,
  }
}

export async function getManagerSupportMessages(
  service: SupabaseClient,
  supportId: string,
): Promise<{ messages: ManagerSupportMessageRow[]; error: string | null }> {
  const { data, error } = await service
    .from('ticket_apoio_mensagens')
    .select(MANAGER_SUPPORT_MESSAGE_SELECT)
    .eq('apoio_id', supportId)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(500)

  const latestMessages = (data as ManagerSupportMessageRow[] | null) ?? []
  return {
    messages: [...latestMessages].reverse(),
    error: error?.message ?? null,
  }
}

async function getCurrentSectorLinkIds(
  service: SupabaseClient,
  sectorId: string,
  collaboratorIds: readonly string[],
): Promise<{ linkedIds: Set<string>; error: string | null }> {
  const uniqueIds = Array.from(new Set(collaboratorIds))
  if (uniqueIds.length === 0) return { linkedIds: new Set(), error: null }

  const [dashboardLinks, workdeskLinks] = await Promise.all([
    service
      .from('colaborador_setores')
      .select('colaborador_id')
      .eq('setor_id', sectorId)
      .in('colaborador_id', uniqueIds)
      .limit(uniqueIds.length),
    service
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', sectorId)
      .in('colaborador_id', uniqueIds)
      .limit(uniqueIds.length),
  ])

  const error = dashboardLinks.error?.message ?? workdeskLinks.error?.message ?? null
  if (error) return { linkedIds: new Set(), error }

  return {
    linkedIds: new Set([
      ...(dashboardLinks.data ?? []).map((link: { colaborador_id: string }) => link.colaborador_id),
      ...(workdeskLinks.data ?? []).map((link: { colaborador_id: string }) => link.colaborador_id),
    ]),
    error: null,
  }
}

export async function hasCurrentSectorAccess(
  service: SupabaseClient,
  actor: ManagerSupportActor,
  sectorId: string,
): Promise<{ linked: boolean; error: string | null }> {
  if (actor.isMaster || actor.legacySectorId === sectorId) {
    return { linked: true, error: null }
  }

  const result = await getCurrentSectorLinkIds(service, sectorId, [actor.id])
  return {
    linked: result.linkedIds.has(actor.id),
    error: result.error,
  }
}

export async function getEligibleManagersForSector(
  service: SupabaseClient,
  sectorId: string,
  excludedIds: readonly string[] = [],
): Promise<{ managers: EligibleManager[]; error: string | null }> {
  const { data: links, error: linksError } = await service
    .from('setor_gestores')
    .select('colaborador_id, criado_em')
    .eq('setor_id', sectorId)
    .limit(500)

  if (linksError) return { managers: [], error: linksError.message }

  const excluded = new Set(excludedIds)
  const createdAtById = new Map(
    (links ?? []).map((link: { colaborador_id: string; criado_em?: string | null }) => (
      [link.colaborador_id, link.criado_em ?? null]
    )),
  )
  const collaboratorIds = Array.from(
    new Set(
      (links ?? [])
        .map((link: { colaborador_id: string }) => link.colaborador_id)
        .filter((id: string) => !excluded.has(id)),
    ),
  )
  if (collaboratorIds.length === 0) return { managers: [], error: null }

  const { data: collaborators, error: collaboratorsError } = await service
    .from('colaboradores')
    .select('id, nome, email, ativo, is_master, setor_id, permissoes:permissao_id(can_view_dashboard)')
    .in('id', collaboratorIds)
    .limit(collaboratorIds.length)

  if (collaboratorsError) return { managers: [], error: collaboratorsError.message }

  const managerCandidates = (collaborators ?? [])
    .filter((collaborator) => {
      const permission = managerPermission(collaborator.permissoes as PermissionRelation)
      return collaborator.ativo === true
        && (collaborator.is_master === true || permission?.can_view_dashboard === true)
    })

  const managersNeedingLink = managerCandidates
    .filter((collaborator) => (
      collaborator.is_master !== true && collaborator.setor_id !== sectorId
    ))
    .map((collaborator) => collaborator.id)
  const currentLinks = await getCurrentSectorLinkIds(service, sectorId, managersNeedingLink)
  if (currentLinks.error) return { managers: [], error: currentLinks.error }

  const managers = managerCandidates
    .filter((collaborator) => (
      collaborator.is_master === true
      || collaborator.setor_id === sectorId
      || currentLinks.linkedIds.has(collaborator.id)
    ))
    .map((collaborator) => ({
      id: collaborator.id,
      name: collaborator.nome,
      email: collaborator.email,
      isMaster: collaborator.is_master === true,
      canViewDashboard:
        managerPermission(collaborator.permissoes as PermissionRelation)?.can_view_dashboard === true,
      createdAt: createdAtById.get(collaborator.id) ?? null,
    }))

  return { managers, error: null }
}

export async function canManageManagerGroup(
  service: SupabaseClient,
  actor: ManagerSupportActor,
  sectorId: string,
) {
  if (actor.isMaster) return true
  if (!actor.canManageUsers) return false

  const sectorAccess = await hasCurrentSectorAccess(service, actor, sectorId)
  if (sectorAccess.error) throw new Error(sectorAccess.error)
  return sectorAccess.linked
}

interface SupportPushInput {
  service: SupabaseClient
  senderId: string
  recipientIds: string[]
  title: string
  message: string
  url: string
  tag: string
}

interface SupportNotificationInput extends SupportPushInput {
  sectorId: string
}

export interface SupportNotificationResult {
  persisted: boolean
  push: { sent: number; failed: number } | null
}

function supportNotificationRecipients(recipientIds: string[], senderId: string) {
  return Array.from(new Set(recipientIds)).filter((id) => id !== senderId)
}

export async function pushManagerSupportRecipients({
  service,
  senderId,
  recipientIds,
  title,
  message,
  url,
  tag,
}: SupportPushInput): Promise<{ sent: number; failed: number } | null> {
  const recipients = supportNotificationRecipients(recipientIds, senderId)
  if (recipients.length === 0) return null

  try {
    return await sendPushToColaboradores(service, recipients, {
      title,
      body: message.replace(/\s+/g, ' ').slice(0, 140),
      url,
      tag,
      type: 'aviso',
    })
  } catch (error) {
    console.error('[manager-support] Failed to deliver support Web Push:', error)
    return null
  }
}

export async function notifyManagerSupportRecipients({
  service,
  senderId,
  recipientIds,
  sectorId,
  title,
  message,
  url,
  tag,
}: SupportNotificationInput): Promise<SupportNotificationResult> {
  const recipients = supportNotificationRecipients(recipientIds, senderId)
  if (recipients.length === 0) return { persisted: false, push: null }

  try {
    const rows = recipients.map((recipientId) => ({
      setor_id: sectorId,
      remetente_id: senderId,
      destinatario_id: recipientId,
      titulo: title,
      mensagem: message,
      tipo: 'chama_gestor',
      url,
    }))
    const { error } = await service.from('notificacoes').insert(rows)
    if (error) {
      console.error('[manager-support] Failed to persist support notifications:', error.message)
      return { persisted: false, push: null }
    }
  } catch (error) {
    console.error('[manager-support] Unexpected notification persistence failure:', error)
    return { persisted: false, push: null }
  }

  const push = await pushManagerSupportRecipients({
    service,
    senderId,
    recipientIds: recipients,
    title,
    message,
    url,
    tag,
  })
  return { persisted: true, push }
}
