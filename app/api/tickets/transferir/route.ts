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

    const updateData: Record<string, unknown> = {}
    let queued = false
    let toColabNome = 'Aguardando atendente'

    if (setor_id) {
      updateData.setor_id = setor_id
      // Limpar subsetor ao transferir entre setores — o subsetor antigo não existe no novo setor
      updateData.subsetor_id = null
    }

    if (colaborador_id) {
      // 2. Verificar se o atendente está online com heartbeat fresco
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

      // 3. Buscar limite max_tickets_per_agent do setor destino
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('max_tickets_per_agent')
        .eq('setor_id', targetSetorId)
        .maybeSingle()

      const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10

      // 4. Contar tickets ativos do atendente destino
      const { count: activeTickets } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('colaborador_id', colaborador_id)
        .in('status', ['aberto', 'em_atendimento'])
        .neq('id', ticket_id) // excluir o próprio ticket sendo transferido

      const ticketCount = activeTickets ?? 0

      if (ticketCount >= maxTicketsPerAgent) {
        // Atendente no limite → vai para a fila
        queued = true
        updateData.colaborador_id = null
        updateData.status = 'aberto'
        toColabNome = 'Fila de espera'

        console.log(
          `[Transferir] Atendente ${colab.nome} atingiu limite (${ticketCount}/${maxTicketsPerAgent}) — ticket ${ticket_id} vai para fila`
        )
      } else {
        updateData.colaborador_id = colaborador_id
        updateData.status = 'em_atendimento'
        toColabNome = colab.nome
      }
    } else {
      // Transferir para fila (sem atendente específico)
      updateData.colaborador_id = null
      updateData.status = 'aberto'
      queued = true
    }

    // 5. Atualizar o ticket
    const { error: updateError } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticket_id)

    if (updateError) {
      console.error('[Transferir] Erro ao atualizar ticket:', updateError)
      return NextResponse.json({ error: 'Erro ao transferir ticket' }, { status: 500 })
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
      colaborador_id: updateData.colaborador_id ?? null,
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
