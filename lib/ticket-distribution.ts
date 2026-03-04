import { createClient } from '@/lib/supabase/server'

interface DistribuicaoResult {
  ticketId: string
  colaboradorId: string | null
}

/**
 * Creates a new ticket and distributes it to an available collaborator
 * using round-robin distribution based on the sector's configuration.
 * If subsetorId is provided, it will prioritize collaborators assigned to that subsetor.
 */
export async function criarEDistribuirTicket(
  clienteId: string,
  setorId: string,
  canal: string = 'whatsapp',
  subsetorId: string | null = null
): Promise<DistribuicaoResult | null> {
  const supabase = await createClient()

  try {
    // 1. Get distribution config for this sector
    const { data: config } = await supabase
      .from('ticket_distribution_config')
      .select('*')
      .eq('setor_id', setorId)
      .maybeSingle()

    const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10
    const autoAssignEnabled = config?.auto_assign_enabled ?? true

    // 2. Create the ticket with subsetor if provided
    const ticketData: Record<string, unknown> = {
      cliente_id: clienteId,
      setor_id: setorId,
      status: 'aberto',
      canal: canal,
      prioridade: 'normal',
      assignment_attempts: 0,
    }
    
    if (subsetorId) {
      ticketData.subsetor_id = subsetorId
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single()

    if (ticketError || !ticket) {
      console.error('Error creating ticket:', ticketError)
      return null
    }

    let assignedColaboradorId: string | null = null

    // 3. If auto-assign is enabled, find an available collaborator
    if (autoAssignEnabled) {
      // Build query to get collaborators assigned to this sector
      // If subsetorId is provided, filter by subsetor as well
      let colaboradoresQuery = supabase
        .from('colaboradores')
        .select(`
          id,
          nome,
          colaboradores_setores!inner(setor_id, subsetor_id)
        `)
        .eq('colaboradores_setores.setor_id', setorId)
        .eq('is_online', true)
        .eq('ativo', true)
        .is('pausa_atual_id', null)

      // If subsetorId is specified, filter collaborators by subsetor
      if (subsetorId) {
        colaboradoresQuery = colaboradoresQuery.eq('colaboradores_setores.subsetor_id', subsetorId)
      }

      const { data: colaboradores } = await colaboradoresQuery

      // If no collaborators found for the specific subsetor, try to find any collaborator in the setor
      let finalColaboradores = colaboradores
      if (subsetorId && (!colaboradores || colaboradores.length === 0)) {
        // No collaborators found for the specific subsetor, fall back to setor
        const { data: setorColaboradores } = await supabase
          .from('colaboradores')
          .select(`
            id,
            nome,
            colaboradores_setores!inner(setor_id, subsetor_id)
          `)
          .eq('colaboradores_setores.setor_id', setorId)
          .eq('is_online', true)
          .eq('ativo', true)
          .is('pausa_atual_id', null)
        
        finalColaboradores = setorColaboradores
      }

      // Use finalColaboradores which may be subsetor-specific or fallback to setor
      const availableColaboradores = finalColaboradores || []
      
      if (availableColaboradores.length > 0) {
        // Get current ticket counts for each collaborator
        const colaboradorIds = availableColaboradores.map(c => c.id)

        const { data: ticketCounts } = await supabase
          .from('tickets')
          .select('colaborador_id')
          .in('colaborador_id', colaboradorIds)
          .in('status', ['aberto', 'em_atendimento'])

        // Count tickets per collaborator
        const countMap: Record<string, number> = {}
        ticketCounts?.forEach(t => {
          if (t.colaborador_id) {
            countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
          }
        })

        // Find collaborator with least tickets under the max limit
        let bestColaborador: { id: string; count: number } | null = null

        for (const colab of availableColaboradores) {
          const currentCount = countMap[colab.id] || 0
          
          if (currentCount < maxTicketsPerAgent) {
            if (!bestColaborador || currentCount < bestColaborador.count) {
              bestColaborador = { id: colab.id, count: currentCount }
            }
          }
        }

        if (bestColaborador) {
          // Assign the ticket to this collaborator
          const { error: updateError } = await supabase
            .from('tickets')
            .update({
              colaborador_id: bestColaborador.id,
              status: 'em_atendimento',
            })
            .eq('id', ticket.id)

          if (!updateError) {
            assignedColaboradorId = bestColaborador.id

            // Log the assignment
            await supabase.from('ticket_assignment_logs').insert({
              ticket_id: ticket.id,
              colaborador_id: bestColaborador.id,
              setor_id: setorId,
              action: 'auto_assigned',
              assignment_reason: `Auto-assigned via round-robin (${bestColaborador.count} tickets)`,
            })

          }
        }
      }
    }

    // Log ticket creation
    await supabase.from('ticket_logs').insert({
      ticket_id: ticket.id,
      tipo: 'criacao',
      descricao: assignedColaboradorId 
        ? `Ticket criado e atribuído automaticamente` 
        : `Ticket criado e aguardando atribuição`,
    })

    return {
      ticketId: ticket.id,
      colaboradorId: assignedColaboradorId,
    }
  } catch (error) {
    console.error('Error in criarEDistribuirTicket:', error)
    return null
  }
}

/**
 * Redistributes unassigned tickets to available collaborators
 * This can be called periodically or when collaborators become available.
 * Respects subsetor assignment - tickets with subsetor will be assigned to 
 * collaborators in that subsetor first, then fallback to any setor collaborator.
 */
export async function redistribuirTicketsPendentes(setorId: string): Promise<number> {
  const supabase = await createClient()
  let assignedCount = 0

  try {
    // Get unassigned tickets in this sector, including subsetor_id
    const { data: pendingTickets } = await supabase
      .from('tickets')
      .select('id, cliente_id, subsetor_id')
      .eq('setor_id', setorId)
      .eq('status', 'aberto')
      .is('colaborador_id', null)
      .order('criado_em', { ascending: true })

    if (!pendingTickets || pendingTickets.length === 0) {
      return 0
    }

    // Get distribution config
    const { data: config } = await supabase
      .from('ticket_distribution_config')
      .select('max_tickets_per_agent')
      .eq('setor_id', setorId)
      .maybeSingle()

    const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10

    // Get ALL available collaborators in this setor with their subsetor assignments
    const { data: allColaboradores } = await supabase
      .from('colaboradores')
      .select(`
        id,
        colaboradores_setores!inner(setor_id, subsetor_id)
      `)
      .eq('colaboradores_setores.setor_id', setorId)
      .eq('is_online', true)
      .eq('ativo', true)
      .is('pausa_atual_id', null)

    if (!allColaboradores || allColaboradores.length === 0) {
      return 0
    }

    // Get current ticket counts for all collaborators
    const colaboradorIds = allColaboradores.map(c => c.id)
    const { data: ticketCounts } = await supabase
      .from('tickets')
      .select('colaborador_id')
      .in('colaborador_id', colaboradorIds)
      .in('status', ['aberto', 'em_atendimento'])

    const countMap: Record<string, number> = {}
    ticketCounts?.forEach(t => {
      if (t.colaborador_id) {
        countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
      }
    })

    // Distribute tickets respecting subsetor
    for (const ticket of pendingTickets) {
      // Filter collaborators based on ticket's subsetor
      let eligibleColaboradores = allColaboradores

      if (ticket.subsetor_id) {
        // First try to find collaborators assigned to this specific subsetor
        const subsetorColaboradores = allColaboradores.filter(c => {
          const setores = c.colaboradores_setores as any[]
          return setores?.some(s => s.subsetor_id === ticket.subsetor_id)
        })

        if (subsetorColaboradores.length > 0) {
          eligibleColaboradores = subsetorColaboradores
        }
        // If no subsetor-specific collaborators, fallback to all setor collaborators
      }

      // Find collaborator with least tickets under limit
      let bestColaborador: { id: string; count: number } | null = null

      for (const colab of eligibleColaboradores) {
        const currentCount = countMap[colab.id] || 0
        
        if (currentCount < maxTicketsPerAgent) {
          if (!bestColaborador || currentCount < bestColaborador.count) {
            bestColaborador = { id: colab.id, count: currentCount }
          }
        }
      }

      if (bestColaborador) {
        const { error } = await supabase
          .from('tickets')
          .update({
            colaborador_id: bestColaborador.id,
            status: 'em_atendimento',
          })
          .eq('id', ticket.id)

        if (!error) {
          // Update count map
          countMap[bestColaborador.id] = (countMap[bestColaborador.id] || 0) + 1
          assignedCount++

          const reason = ticket.subsetor_id 
            ? `Redistribuição automática (subsetor: ${ticket.subsetor_id})`
            : 'Redistribuição automática de tickets pendentes'

          await supabase.from('ticket_assignment_logs').insert({
            ticket_id: ticket.id,
            colaborador_id: bestColaborador.id,
            setor_id: setorId,
            action: 'redistributed',
            assignment_reason: reason,
          })
        }
      }
      // Continue to next ticket even if this one couldn't be assigned
    }

    return assignedCount
  } catch (error) {
    console.error('Error redistributing tickets:', error)
    return assignedCount
  }
}
