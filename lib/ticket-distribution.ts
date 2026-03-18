import { createServiceClient } from '@/lib/supabase/service'

interface DistribuicaoResult {
  ticketId: string
  colaboradorId: string | null
}

/**
 * Creates a new ticket and distributes it to an available collaborator
 * using round-robin distribution based on the sector's configuration.
 * If subsetorId is provided, it will prioritize collaborators assigned to that subsetor.
 * A collaborator can be assigned to multiple subsetores (via colaboradores_subsetores).
 */
export async function criarEDistribuirTicket(
  clienteId: string,
  setorId: string,
  canal: string = 'whatsapp',
  subsetorId: string | null = null
): Promise<DistribuicaoResult | null> {
  // Use service role client to bypass RLS — this function is called both from
  // authenticated user sessions and from bots/n8n without a user session.
  const supabase = createServiceClient()

  console.log(`[Distribuição] criarEDistribuirTicket chamada — clienteId=${clienteId}, setorId=${setorId}, canal=${canal}, subsetorId=${subsetorId}`)

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
      console.error('[criarEDistribuirTicket] Erro ao inserir ticket:', JSON.stringify(ticketError), 'Data:', JSON.stringify(ticketData))
      return null
    }

    let assignedColaboradorId: string | null = null

    // 3. If auto-assign is enabled, find an available collaborator
    if (autoAssignEnabled) {
      // Mesma lógica do ticket-queue-processor:
      // com subsetor → busca diretamente em colaboradores_subsetores (fonte autoritativa)
      // sem subsetor → busca em colaboradores_setores (todos do setor)
      let finalColaboradores: Array<{ id: string; nome: string }> = []

      if (subsetorId) {
        const { data: subsetorLinks } = await supabase
          .from('colaboradores_subsetores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id)')
          .eq('setor_id', setorId)
          .eq('subsetor_id', subsetorId)

        finalColaboradores = (subsetorLinks || [])
          .map((sl: any) => sl.colaboradores)
          .filter((c: any) => c && c.ativo && c.is_online && !c.pausa_atual_id)
          .map((c: any) => ({ id: c.id, nome: c.nome }))
      } else {
        const { data: setorLinks } = await supabase
          .from('colaboradores_setores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id)')
          .eq('setor_id', setorId)

        finalColaboradores = (setorLinks || [])
          .map((cs: any) => cs.colaboradores)
          .filter((c: any) => c && c.ativo && c.is_online && !c.pausa_atual_id)
          .map((c: any) => ({ id: c.id, nome: c.nome }))
      }

      if (finalColaboradores.length > 0) {
        // Get current ticket counts for each collaborator
        const colaboradorIds = finalColaboradores.map(c => c.id)

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

        for (const colab of finalColaboradores) {
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

    // Se ninguém foi atribuído e auto-assign está ativo, verificar transmissão
    if (!assignedColaboradorId && autoAssignEnabled) {
      console.log(`[Distribuição] Ticket ${ticket.id} sem atribuição — verificando transmissão do setor ${setorId}`)

      const { data: setorData } = await supabase
        .from('setores')
        .select('transmissao_ativa, setor_receptor_id')
        .eq('id', setorId)
        .single()

      console.log(`[Distribuição] Setor ${setorId}: transmissao_ativa=${setorData?.transmissao_ativa}, setor_receptor_id=${setorData?.setor_receptor_id}`)

      if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
        const receptorId = setorData.setor_receptor_id
        console.log(`[Distribuição] Transmitindo ticket ${ticket.id} para setor receptor ${receptorId}`)

        // Mover ticket para o setor receptor
        const { error: moveError } = await supabase
          .from('tickets')
          .update({
            setor_id: receptorId,
            subsetor_id: null, // Receptor tem seus próprios subsetores
          })
          .eq('id', ticket.id)

        if (!moveError) {
          // Log da transferência automática
          await supabase.from('ticket_logs').insert({
            ticket_id: ticket.id,
            tipo: 'transferencia_automatica',
            descricao: `Ticket transferido automaticamente para setor receptor (sem atendentes disponíveis no setor original)`,
          })

          // Tentar distribuir no setor receptor (sem retransmitir)
          const receptorResult = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
          if (receptorResult) {
            assignedColaboradorId = receptorResult
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
 * Helper interno: tenta distribuir um ticket a um colaborador disponível
 * dentro de um setor específico (usado para distribuição no receptor).
 * Não faz retransmissão — evita loops.
 */
async function _tentarDistribuirNoSetor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticketId: string,
  setorId: string
): Promise<string | null> {
  const { data: config } = await supabase
    .from('ticket_distribution_config')
    .select('max_tickets_per_agent')
    .eq('setor_id', setorId)
    .maybeSingle()

  const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10

  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select(`id, colaboradores_setores!inner(setor_id)`)
    .eq('colaboradores_setores.setor_id', setorId)
    .eq('is_online', true)
    .eq('ativo', true)
    .is('pausa_atual_id', null)

  if (!colaboradores || colaboradores.length === 0) return null

  const colaboradorIds = colaboradores.map(c => c.id)
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

  let bestColaborador: { id: string; count: number } | null = null
  for (const colab of colaboradores) {
    const currentCount = countMap[colab.id] || 0
    if (currentCount < maxTicketsPerAgent) {
      if (!bestColaborador || currentCount < bestColaborador.count) {
        bestColaborador = { id: colab.id, count: currentCount }
      }
    }
  }

  if (!bestColaborador) return null

  const { error } = await supabase
    .from('tickets')
    .update({
      colaborador_id: bestColaborador.id,
      status: 'em_atendimento',
    })
    .eq('id', ticketId)

  if (error) return null

  await supabase.from('ticket_assignment_logs').insert({
    ticket_id: ticketId,
    colaborador_id: bestColaborador.id,
    setor_id: setorId,
    action: 'auto_assigned',
    assignment_reason: `Auto-assigned no setor receptor (${bestColaborador.count} tickets)`,
  })

  return bestColaborador.id
}

/**
 * Redistributes unassigned tickets to available collaborators.
 * Respects subsetor assignment — tickets com subsetor são atribuídos
 * preferencialmente a colaboradores do subsetor (via colaboradores_subsetores).
 * Um colaborador pode atender múltiplos subsetores.
 */
export async function redistribuirTicketsPendentes(setorId: string): Promise<number> {
  const supabase = createServiceClient()
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

    // Get ALL available collaborators in this setor
    const { data: allColaboradores } = await supabase
      .from('colaboradores')
      .select(`
        id,
        colaboradores_setores!inner(setor_id)
      `)
      .eq('colaboradores_setores.setor_id', setorId)
      .eq('is_online', true)
      .eq('ativo', true)
      .is('pausa_atual_id', null)

    if (!allColaboradores || allColaboradores.length === 0) {
      // Nenhum atendente online — verificar se o setor tem transmissão ativa
      const { data: setorData } = await supabase
        .from('setores')
        .select('transmissao_ativa, setor_receptor_id')
        .eq('id', setorId)
        .single()

      if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
        const receptorId = setorData.setor_receptor_id
        console.log(`[Redistribuição] Sem atendentes em ${setorId} — transmitindo ${pendingTickets.length} tickets para receptor ${receptorId}`)

        for (const ticket of pendingTickets) {
          const { error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: null,
            })
            .eq('id', ticket.id)

          if (!moveError) {
            await supabase.from('ticket_logs').insert({
              ticket_id: ticket.id,
              tipo: 'transferencia_automatica',
              descricao: `Ticket transferido automaticamente para setor receptor (nenhum atendente online no setor original)`,
            })

            const result = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
            if (result) {
              assignedCount++
            }
          }
        }
      }

      return assignedCount
    }

    // Buscar todos os vínculos de subsetores para os colaboradores disponíveis
    const colaboradorIds = allColaboradores.map(c => c.id)
    const { data: subsetorLinks } = await supabase
      .from('colaboradores_subsetores')
      .select('colaborador_id, subsetor_id')
      .eq('setor_id', setorId)
      .in('colaborador_id', colaboradorIds)

    // Mapa: subsetor_id → Set de colaborador_ids que atendem aquele subsetor
    const subsetorToColabs: Record<string, Set<string>> = {}
    for (const link of (subsetorLinks || [])) {
      if (!subsetorToColabs[link.subsetor_id]) {
        subsetorToColabs[link.subsetor_id] = new Set()
      }
      subsetorToColabs[link.subsetor_id].add(link.colaborador_id)
    }

    // Get current ticket counts for all collaborators
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
      let eligibleColaboradores = allColaboradores

      if (ticket.subsetor_id) {
        // Colaboradores que atendem este subsetor
        const subsetorColabIds = subsetorToColabs[ticket.subsetor_id]
        if (subsetorColabIds && subsetorColabIds.size > 0) {
          const filtered = allColaboradores.filter(c => subsetorColabIds.has(c.id))
          eligibleColaboradores = filtered // pode ser [] se nenhum do subsetor está online
        } else {
          // Subsetor não tem nenhum colaborador cadastrado ou online → não atribuir
          eligibleColaboradores = []
        }
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
    }

    // Após a distribuição normal, verificar se há tickets que permaneceram sem atribuição
    // e se o setor tem transmissão ativa para encaminhá-los ao receptor
    const { data: remainingTickets } = await supabase
      .from('tickets')
      .select('id')
      .eq('setor_id', setorId)
      .eq('status', 'aberto')
      .is('colaborador_id', null)

    if (remainingTickets && remainingTickets.length > 0) {
      const { data: setorData } = await supabase
        .from('setores')
        .select('transmissao_ativa, setor_receptor_id')
        .eq('id', setorId)
        .single()

      if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
        const receptorId = setorData.setor_receptor_id

        for (const ticket of remainingTickets) {
          // Mover ticket para o setor receptor
          const { error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: null,
            })
            .eq('id', ticket.id)

          if (!moveError) {
            await supabase.from('ticket_logs').insert({
              ticket_id: ticket.id,
              tipo: 'transferencia_automatica',
              descricao: `Ticket transferido automaticamente para setor receptor (redistribuição sem atendentes disponíveis)`,
            })

            // Tentar distribuir no receptor (sem retransmitir)
            const result = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
            if (result) {
              assignedCount++
            }
          }
        }
      }
    }

    return assignedCount
  } catch (error) {
    console.error('Error redistributing tickets:', error)
    return assignedCount
  }
}
