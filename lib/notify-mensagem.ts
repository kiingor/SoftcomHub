import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToColaboradores } from '@/lib/push'

/** Administradores mestres atendem globalmente; supervisores seguem o vínculo do setor. */
async function getActiveManagementIdsForSetor(
  service: ReturnType<typeof createServiceClient>,
  setorId: string | null,
): Promise<string[]> {
  const { data: masters, error: mastersError } = await service
    .from('colaboradores')
    .select('id')
    .eq('ativo', true)
    .eq('is_master', true)
  if (mastersError) throw mastersError

  const recipientIds = new Set((masters || []).map((master: { id: string }) => master.id))
  if (!setorId) return [...recipientIds]

  const { data: links, error: linksError } = await service
    .from('colaboradores_setores')
    .select('colaborador_id')
    .eq('setor_id', setorId)
  if (linksError) throw linksError

  const linkedIds = Array.from(
    new Set((links || []).map((link: { colaborador_id: string }) => link.colaborador_id)),
  )
  if (linkedIds.length === 0) return [...recipientIds]

  const { data: permissions, error: permissionsError } = await service
    .from('permissoes')
    .select('id')
    .eq('can_see_all_tickets', true)
  if (permissionsError) throw permissionsError

  const managementPermissionIds = (permissions || []).map(
    (permission: { id: string }) => permission.id,
  )

  const { data: collaborators, error: collaboratorsError } = await service
    .from('colaboradores')
    .select('id, permissao_id')
    .in('id', linkedIds)
    .eq('ativo', true)
  if (collaboratorsError) throw collaboratorsError

  for (const collaborator of collaborators || []) {
    const typedCollaborator = collaborator as { id: string; permissao_id: string | null }
    if (
      typedCollaborator.permissao_id !== null &&
      managementPermissionIds.includes(typedCollaborator.permissao_id)
    ) {
      recipientIds.add(typedCollaborator.id)
    }
  }

  return [...recipientIds]
}

const TIPO_PREVIEW: Record<string, string> = {
  imagem: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  documento: '📎 Documento',
  contact: '👤 Contato',
}

/**
 * Notifica (Web Push) o atendente responsável e a gestão ativa sobre uma nova
 * mensagem do cliente. Um ticket na fila pode ser atendido pela gestão do seu
 * setor, então também a notifica quando ainda não há responsável.
 * Não notifica tickets encerrados.
 *
 * Seguro para chamar em qualquer fluxo de entrada de mensagem — resolve tudo
 * pelo ticketId, então não depende do que o chamador já tem em mãos.
 */
export async function notifyAtendenteNovaMensagem(args: {
  ticketId: string
  conteudo?: string | null
  tipo?: string | null
}): Promise<void> {
  try {
    const service = createServiceClient()

    const { data: ticket, error: ticketError } = await service
      .from('tickets')
      .select('colaborador_id, setor_id, status, clientes:cliente_id(nome)')
      .eq('id', args.ticketId)
      .single()
    if (ticketError) throw ticketError

    if (!ticket || ticket.status === 'encerrado') return

    const recipientIds = new Set(
      await getActiveManagementIdsForSetor(service, ticket.setor_id),
    )

    if (ticket.colaborador_id) {
      const { data: collaborator, error: collaboratorError } = await service
        .from('colaboradores')
        .select('ativo')
        .eq('id', ticket.colaborador_id)
        .single()
      if (collaboratorError) throw collaboratorError
      if (collaborator?.ativo) recipientIds.add(ticket.colaborador_id)
    }

    if (recipientIds.size === 0) return

    const clienteNome =
      (ticket.clientes as { nome?: string | null } | null)?.nome || null

    const tipoTxt =
      args.tipo && args.tipo !== 'texto' ? TIPO_PREVIEW[args.tipo] || 'Mensagem' : null
    const preview = (args.conteudo || '').replace(/\s+/g, ' ').trim().slice(0, 140)
    const body = tipoTxt || preview || 'Enviou uma mensagem'

    await sendPushToColaboradores(service, [...recipientIds], {
      title: clienteNome ? `💬 ${clienteNome}` : '💬 Nova mensagem',
      body,
      url: `/workdesk?ticket=${encodeURIComponent(args.ticketId)}`,
      tag: `ticket-${args.ticketId}`,
      type: 'mensagem',
    })
  } catch (err) {
    console.error('[notify-mensagem]', err)
  }
}
