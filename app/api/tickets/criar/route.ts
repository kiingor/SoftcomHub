import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { criarEDistribuirTicket } from '@/lib/ticket-distribution'

/**
 * API to create a new ticket with optional subsetor routing
 * This is typically called by external systems (chatbots, flows) 
 * that have already determined the appropriate setor and subsetor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Use service role to bypass RLS — this endpoint is called by bots/n8n without user session
    const supabase = createServiceClient()

    const { 
      cliente_id, 
      telefone, 
      nome_cliente,
      setor_id, 
      subsetor_id,
      canal = 'whatsapp',
      phone_number_id
    } = body

    // Validate required fields
    if (!setor_id) {
      return NextResponse.json({ error: 'setor_id é obrigatório' }, { status: 400 })
    }

    if (!cliente_id && !telefone) {
      return NextResponse.json({ error: 'cliente_id ou telefone é obrigatório' }, { status: 400 })
    }

    let finalClienteId = cliente_id

    // If cliente_id not provided, find or create by telefone
    if (!finalClienteId && telefone) {
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', telefone)
        .maybeSingle()

      if (existingCliente) {
        finalClienteId = existingCliente.id
      } else {
        // Create new cliente
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            telefone,
            nome: nome_cliente || 'Desconhecido'
          })
          .select('id')
          .single()

        if (clienteError || !newCliente) {
          return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
        }

        finalClienteId = newCliente.id
      }
    }

    // Check if there's already an open ticket for this cliente in this setor
    const { data: existingTicket } = await supabase
      .from('tickets')
      .select('id, status, colaborador_id, subsetor_id')
      .eq('cliente_id', finalClienteId)
      .eq('setor_id', setor_id)
      .in('status', ['aberto', 'em_atendimento'])
      .maybeSingle()

    if (existingTicket) {
      // If subsetor changed, update the existing ticket
      if (subsetor_id && existingTicket.subsetor_id !== subsetor_id) {
        await supabase
          .from('tickets')
          .update({ subsetor_id })
          .eq('id', existingTicket.id)

        // Log the subsetor change
        await supabase.from('ticket_logs').insert({
          ticket_id: existingTicket.id,
          tipo: 'transferencia',
          descricao: `Ticket transferido para subsetor`,
        })

        return NextResponse.json({
          success: true,
          ticket_id: existingTicket.id,
          existing: true,
          subsetor_updated: true,
          message: 'Ticket existente atualizado com novo subsetor'
        })
      }

      return NextResponse.json({
        success: true,
        ticket_id: existingTicket.id,
        existing: true,
        message: 'Ticket já existe para este cliente neste setor'
      })
    }

    // Create and distribute the ticket with subsetor
    const result = await criarEDistribuirTicket(
      finalClienteId, 
      setor_id, 
      canal, 
      subsetor_id || null
    )

    if (!result) {
      return NextResponse.json({ error: 'Erro ao criar ticket' }, { status: 500 })
    }

    console.log(`[v0] Ticket created via API: ${result.ticketId}, setor: ${setor_id}, subsetor: ${subsetor_id || 'none'}, assigned to: ${result.colaboradorId || 'none'}`)

    return NextResponse.json({
      success: true,
      ticket_id: result.ticketId,
      colaborador_id: result.colaboradorId,
      existing: false,
      message: result.colaboradorId 
        ? 'Ticket criado e atribuído automaticamente'
        : 'Ticket criado e aguardando atribuição'
    })

  } catch (error) {
    console.error('[v0] Error creating ticket:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
