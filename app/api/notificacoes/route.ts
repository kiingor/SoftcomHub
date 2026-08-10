import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToColaboradores } from '@/lib/push'

const MAX_TITLE_LENGTH = 160
const MAX_MESSAGE_LENGTH = 5_000

type PermissionRelation =
  | { can_view_dashboard?: boolean | null }
  | { can_view_dashboard?: boolean | null }[]
  | null

function firstPermission(value: PermissionRelation) {
  return Array.isArray(value) ? value[0] ?? null : value
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

async function canSendSectorNotification(args: {
  service: ReturnType<typeof createServiceClient>
  email: string
  setorId: string
}) {
  const { service, email, setorId } = args
  const { data: actor, error: actorError } = await service
    .from('colaboradores')
    .select('id, ativo, is_master, permissoes:permissao_id(can_view_dashboard)')
    .eq('email', email)
    .maybeSingle()
  if (actorError) throw actorError

  const permission = firstPermission(actor?.permissoes as PermissionRelation)
  if (!actor?.ativo || (actor.is_master !== true && permission?.can_view_dashboard !== true)) {
    return null
  }

  const { data: sector, error: sectorError } = await service
    .from('setores')
    .select('id')
    .eq('id', setorId)
    .maybeSingle()
  if (sectorError) throw sectorError
  if (!sector) return null

  if (actor.is_master === true) return { id: actor.id }

  const [dashboardLink, workdeskLink] = await Promise.all([
    service
      .from('colaborador_setores')
      .select('colaborador_id')
      .eq('colaborador_id', actor.id)
      .eq('setor_id', setorId)
      .maybeSingle(),
    service
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('colaborador_id', actor.id)
      .eq('setor_id', setorId)
      .maybeSingle(),
  ])
  if (dashboardLink.error) throw dashboardLink.error
  if (workdeskLink.error) throw workdeskLink.error
  if (!dashboardLink.data && !workdeskLink.data) return null

  return { id: actor.id }
}

async function getPushRecipients(args: {
  service: ReturnType<typeof createServiceClient>
  setorId: string
  destinatarioId: string | null
  senderId: string
}) {
  const { service, setorId, destinatarioId, senderId } = args
  const recipientsQuery = service
    .from('colaboradores_setores')
    .select('colaborador_id')
    .eq('setor_id', setorId)

  if (destinatarioId) recipientsQuery.eq('colaborador_id', destinatarioId)

  const { data: links, error: linksError } = await recipientsQuery
  if (linksError) throw linksError

  const linkedIds = Array.from(
    new Set((links || []).map((link: { colaborador_id: string }) => link.colaborador_id)),
  )
  if (destinatarioId && linkedIds.length === 0) {
    throw new Error('Destinatário não pertence ao setor selecionado.')
  }
  if (linkedIds.length === 0) return []

  const { data: activeCollaborators, error: collaboratorsError } = await service
    .from('colaboradores')
    .select('id')
    .in('id', linkedIds)
    .eq('ativo', true)
  if (collaboratorsError) throw collaboratorsError

  return (activeCollaborators || [])
    .map((collaborator: { id: string }) => collaborator.id)
    .filter((id) => id !== senderId)
}

/** Cria um aviso interno e tenta entregar o Web Push aos mesmos destinatários. */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    }

    const values = body as Record<string, unknown>
    const setorId = cleanText(values.setorId, 100)
    const titulo = cleanText(values.titulo, MAX_TITLE_LENGTH)
    const mensagem = cleanText(values.mensagem, MAX_MESSAGE_LENGTH)
    const rawDestinatarioId = values.destinatarioId
    const destinatarioId =
      rawDestinatarioId === null || rawDestinatarioId === undefined
        ? null
        : cleanText(rawDestinatarioId, 100)

    if (!setorId || !titulo || !mensagem || (rawDestinatarioId !== null && rawDestinatarioId !== undefined && !destinatarioId)) {
      return NextResponse.json({ error: 'Preencha os dados do aviso.' }, { status: 400 })
    }

    const auth = await createClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
    }

    const service = createServiceClient()
    const actor = await canSendSectorNotification({ service, email: user.email, setorId })
    if (!actor) {
      return NextResponse.json({ error: 'Você não pode enviar avisos para este setor.' }, { status: 403 })
    }

    const recipientIds = await getPushRecipients({
      service,
      setorId,
      destinatarioId,
      senderId: actor.id,
    })

    const { data: notification, error: notificationError } = await service
      .from('notificacoes')
      .insert({
        setor_id: setorId,
        remetente_id: actor.id,
        destinatario_id: destinatarioId,
        titulo,
        mensagem,
      })
      .select('id')
      .single()
    if (notificationError) throw notificationError

    let push = { sent: 0, failed: 0 }
    if (recipientIds.length > 0) {
      try {
        push = await sendPushToColaboradores(service, recipientIds, {
          title: titulo,
          body: mensagem.replace(/\s+/g, ' ').slice(0, 140),
          url: '/workdesk',
          tag: `notificacao-${notification.id}`,
          type: 'aviso',
        })
      } catch (error) {
        console.error('[notificacoes] Falha ao entregar Web Push:', error)
      }
    }

    return NextResponse.json({ success: true, notificationId: notification.id, push })
  } catch (error) {
    console.error('[notificacoes]', error)
    return NextResponse.json({ error: 'Não foi possível enviar o aviso.' }, { status: 500 })
  }
}
