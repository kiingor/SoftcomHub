import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToColaboradores } from '@/lib/push'

const TIPO_PREVIEW: Record<string, string> = {
  imagem: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  documento: '📎 Documento',
  contact: '👤 Contato',
}

/**
 * Notifica (Web Push) o atendente atribuído ao ticket sobre uma nova mensagem
 * do cliente. Não notifica tickets sem atendente ou encerrados.
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
      .select('colaborador_id, status, clientes:cliente_id(nome)')
      .eq('id', args.ticketId)
      .single()
    if (ticketError) throw ticketError

    if (!ticket || !ticket.colaborador_id || ticket.status === 'encerrado') return

    const { data: collaborator, error: collaboratorError } = await service
      .from('colaboradores')
      .select('ativo')
      .eq('id', ticket.colaborador_id)
      .single()
    if (collaboratorError) throw collaboratorError
    if (!collaborator?.ativo) return

    const clienteNome =
      (ticket.clientes as { nome?: string | null } | null)?.nome || null

    const tipoTxt =
      args.tipo && args.tipo !== 'texto' ? TIPO_PREVIEW[args.tipo] || 'Mensagem' : null
    const preview = (args.conteudo || '').replace(/\s+/g, ' ').trim().slice(0, 140)
    const body = tipoTxt || preview || 'Enviou uma mensagem'

    await sendPushToColaboradores(service, [ticket.colaborador_id], {
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
