import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processTicketQueue } from '@/lib/ticket-queue-processor'

/**
 * POST /api/tickets/transferir
 *
 * Transfere um ticket respeitando o limite max_tickets_per_agent do setor destino.
 * Se o atendente alvo estiver no limite, o ticket vai para a fila (colaborador_id = null).
 *
 * Body params:
 * - ticket_id: string (obrigatório)
 * - setor_id: string (opcional) — novo setor destino
 * - colaborador_id: string | null (opcional) — atendente destino; null = fila
 * - from_colaborador_nome: string (opcional) — nome de quem transferiu (para mensagem do sistema)
 * - from_setor_nome: string (opcional) — nome do setor de origem (para mensagem do sistema)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ticket_id, setor_id, colaborador_id, from_colaborador_nome, from_setor_nome } = body

    if (!ticket_id) {
      return NextResponse.json({ error: 'ticket_id é obrigatório' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Buscar ticket atual
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, setor_id, colaborador_id, cliente_id, status, setores(nome)')
      .eq('id', ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }

    const targetSetorId = setor_id || ticket.setor_id

    let queued = false
    let toColabNome = 'Aguardando atendente'
    let finalColaboradorId: string | null = null

    // Validar atendente destino antes de liberar o ticket
    let colabDestino: { id: string; nome: string } | null = null
    if (colaborador_id) {
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('id, nome, is_online, pausa_atual_id, last_heartbeat')
        .eq('id', colaborador_id)
        .single()

      if (!colab?.is_online) {
        return NextResponse.json(
          { error: 'Este atendente está offline. Selecione um atendente online.' },
          { status: 422 }
        )
      }

      if (colab.pausa_atual_id) {
        return NextResponse.json(
          { error: 'Este atendente está em pausa. Selecione outro atendente.' },
          { status: 422 }
        )
      }

      // Nota: heartbeat NÃO é verificado em transferências manuais.
      // O operador que transfere vê o atendente online no dashboard — isso já é suficiente.
      // A verificação de heartbeat é reservada para distribuição automática (ticket-queue-processor).

      colabDestino = { id: colab.id, nome: colab.nome }
    }

    // Etapa 1: liberar o ticket (colaborador_id = null, status = aberto) e, se houver,
    // trocar setor/subsetor. Isso deixa o ticket em estado "disponível" para a RPC
    // atômica atribuí-lo a seguir. Se não houver atendente destino, o ticket já fica
    // pronto na fila.
    const releaseData: Record<string, unknown> = {
      colaborador_id: null,
      status: 'aberto',
    }
    if (setor_id) {
      releaseData.setor_id = setor_id
      // Limpar subsetor ao transferir entre setores — o subsetor antigo não existe no novo setor
      releaseData.subsetor_id = null
    }

    const { error: releaseError } = await supabase
      .from('tickets')
      .update(releaseData)
      .eq('id', ticket_id)

    if (releaseError) {
      console.error('[Transferir] Erro ao atualizar ticket:', releaseError)
      return NextResponse.json({ error: 'Erro ao transferir ticket' }, { status: 500 })
    }

    // Etapa 2: se houver atendente destino, tentar atribuição atômica via RPC.
    // Se o atendente estiver no limite, a RPC retorna assigned=false e o ticket
    // permanece na fila (colaborador_id=null, status=aberto).
    if (colabDestino) {
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('max_tickets_per_agent')
        .eq('setor_id', targetSetorId)
        .maybeSingle()

      const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10

      const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
        p_ticket_id: ticket_id,
        p_colaborador_id: colabDestino.id,
        p_max_tickets: maxTicketsPerAgent,
      })

      if (rpcError) {
        console.error('[Transferir] RPC try_atomic_assign_ticket falhou:', rpcError)
        queued = true
        toColabNome = 'Fila de espera'
      } else if ((result as any)?.assigned === true) {
        finalColaboradorId = colabDestino.id
        toColabNome = colabDestino.nome
      } else {
        // Atendente no limite ou conflito → fica em fila
        queued = true
        toColabNome = 'Fila de espera'
        console.log(
          `[Transferir] Atendente ${colabDestino.nome} recusado (${(result as any)?.reason}, count=${(result as any)?.current_count}/${maxTicketsPerAgent}) — ticket ${ticket_id} vai para fila`
        )
      }
    } else {
      queued = true
    }

    // 6. Buscar nome do setor destino para a mensagem
    let toSetorNome = from_setor_nome || 'Desconhecido'
    if (setor_id) {
      const { data: setor } = await supabase
        .from('setores')
        .select('nome')
        .eq('id', setor_id)
        .single()
      toSetorNome = setor?.nome || toSetorNome
    } else {
      toSetorNome = (ticket.setores as any)?.nome || toSetorNome
    }

    // 7. Inserir mensagem de sistema com log de transferência
    const fromNome = from_colaborador_nome || 'Desconhecido'
    const fromSetor = from_setor_nome || (ticket.setores as any)?.nome || 'Desconhecido'
    const conteudo = queued
      ? `Transferido de ${fromNome} - ${fromSetor} >> ${toColabNome} - ${toSetorNome}`
      : `Transferido de ${fromNome} - ${fromSetor} >> ${toColabNome} - ${toSetorNome}`

    await supabase.from('mensagens').insert({
      ticket_id,
      cliente_id: ticket.cliente_id,
      remetente: 'sistema',
      conteudo,
      tipo: 'texto',
      enviado_em: new Date().toISOString(),
    })

    // 8. Se o ticket foi para a fila, acionar distribuição automática
    if (queued) {
      processTicketQueue().catch((err) => {
        console.error('[Transferir] Erro ao processar fila após transferência:', err)
      })
    }

    return NextResponse.json({
      success: true,
      queued,
      message: queued
        ? 'Ticket transferido para a fila — atendente no limite de tickets'
        : 'Ticket transferido com sucesso',
      colaborador_id: finalColaboradorId,
      setor_id: targetSetorId,
    })
  } catch (error) {
    console.error('[Transferir] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
