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
    // 1. Get distribution config for this sector (tabela opcional)
    let maxTicketsPerAgent = 10
    let autoAssignEnabled = true
    try {
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('*')
        .eq('setor_id', setorId)
        .maybeSingle()
      if (config) {
        maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
        autoAssignEnabled = config.auto_assign_enabled ?? true
      }
    } catch {
      // Tabela pode não existir — usar defaults
      console.log('[Distribution] ticket_distribution_config não disponível, usando defaults')
    }

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
      // Prefere heartbeat fresco (< 2 min) mas fallback para qualquer online
      const HEARTBEAT_STALE_MS = 5 * 60 * 1000
      const now = Date.now()
      const isHBFresh = (lh: string | null): boolean => lh ? (now - new Date(lh).getTime()) < HEARTBEAT_STALE_MS : false

      let rawColabs: any[] = []
      if (subsetorId) {
        const { data } = await supabase
          .from('colaboradores_subsetores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat, last_ticket_received_at)')
          .eq('setor_id', setorId)
          .eq('subsetor_id', subsetorId)
        rawColabs = (data || []).map((sl: any) => sl.colaboradores)
      } else {
        const { data } = await supabase
          .from('colaboradores_setores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat, last_ticket_received_at)')
          .eq('setor_id', setorId)
        rawColabs = (data || []).map((cs: any) => cs.colaboradores)
      }

      const STALE_CLEANUP_MS = 5 * 60 * 1000 // 5 min — marcar offline automaticamente
      const allOnline = rawColabs
        .filter((c: any) => c && c.ativo && c.is_online && !c.pausa_atual_id)
      const fresh = allOnline
        .filter((c: any) => isHBFresh(c.last_heartbeat))
        .map((c: any) => ({ id: c.id, nome: c.nome, last_ticket_received_at: c.last_ticket_received_at || null }))

      // Cleanup: marcar offline atendentes com heartbeat muito antigo (> 5 min)
      const veryStale = allOnline.filter((c: any) =>
        !c.last_heartbeat || (now - new Date(c.last_heartbeat).getTime()) > STALE_CLEANUP_MS
      )
      if (veryStale.length > 0) {
        const staleIds = veryStale.map((c: any) => c.id)
        console.log(`[Distribution] Cleanup: marcando ${staleIds.length} atendentes offline (heartbeat > 5 min)`)
        await supabase
          .from('colaboradores')
          .update({ is_online: false })
          .in('id', staleIds)
      }

      // Somente distribui para atendentes com heartbeat fresco — sem fallback para stale
      let finalColaboradores = fresh
      const staleCount = allOnline.length - fresh.length
      console.log(`[Distribution] Disponíveis: ${finalColaboradores.length} fresh (${staleCount} stale ignorados) setor=${setorId} subsetor=${subsetorId || 'null'}`)

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

        // Ordenar: 1) menor quantidade de tickets, 2) quem recebeu ticket há MAIS tempo (round-robin real)
        // Usa last_ticket_received_at (atualizado no momento da atribuição) em vez de criado_em do ticket
        const sorted = finalColaboradores
          .map(c => ({
            id: c.id,
            nome: c.nome,
            count: countMap[c.id] || 0,
            lastReceivedAt: c.last_ticket_received_at || '1970-01-01',
          }))
          .filter(c => c.count < maxTicketsPerAgent)
          .sort((a, b) => {
            if (a.count !== b.count) return a.count - b.count
            // Empate: quem recebeu há MAIS tempo vai primeiro (round-robin real)
            return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
          })

        console.log(`[Distribution] Ranking: ${sorted.map(c => `${c.nome}(${c.count}t, lastRcv=${c.lastReceivedAt.slice(0,19)})`).join(', ')}`)

        const bestColaborador = sorted.length > 0 ? sorted[0] : null

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

            // Atualizar last_ticket_received_at para round-robin correto
            await supabase
              .from('colaboradores')
              .update({ last_ticket_received_at: new Date().toISOString() })
              .eq('id', bestColaborador.id)

            // Log the assignment (tabela opcional)
            try {
              await supabase.from('ticket_assignment_logs').insert({
                ticket_id: ticket.id,
                colaborador_id: bestColaborador.id,
                setor_id: setorId,
                action: 'auto_assigned',
                assignment_reason: `Round-robin: ${bestColaborador.count} tickets, último recebido em ${bestColaborador.lastReceivedAt.slice(0,19)}`,
              })
            } catch { /* tabela pode não existir */ }
          }
        }
      }
    }

    // Se ninguém foi atribuído e auto-assign está ativo, verificar transmissão
    if (!assignedColaboradorId && autoAssignEnabled) {
      console.log(`[Distribuição] Ticket ${ticket.id} sem atribuição — verificando transmissão do setor ${setorId}`)

      try {
        const { data: setorData } = await supabase
          .from('setores')
          .select('transmissao_ativa, setor_receptor_id')
          .eq('id', setorId)
          .single()

        console.log(`[Distribuição] Setor ${setorId}: transmissao_ativa=${setorData?.transmissao_ativa}, setor_receptor_id=${setorData?.setor_receptor_id}`)

        if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
          const receptorId = setorData.setor_receptor_id
          console.log(`[Distribuição] Transmitindo ticket ${ticket.id} para setor receptor ${receptorId}`)

          const { error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: null,
            })
            .eq('id', ticket.id)

          if (!moveError) {
            try {
              await supabase.from('ticket_logs').insert({
                ticket_id: ticket.id,
                tipo: 'transferencia_automatica',
                descricao: `Ticket transferido automaticamente para setor receptor (sem atendentes disponíveis no setor original)`,
              })
            } catch { /* tabela pode não existir */ }

            const receptorResult = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
            if (receptorResult) {
              assignedColaboradorId = receptorResult
            }
          }
        }
      } catch (transmissaoError) {
        console.error('[Distribuição] Erro ao verificar transmissão:', transmissaoError)
      }
    }

    // Log ticket creation (tabela opcional)
    try {
      await supabase.from('ticket_logs').insert({
        ticket_id: ticket.id,
        tipo: 'criacao',
        descricao: assignedColaboradorId
          ? `Ticket criado e atribuído automaticamente`
          : `Ticket criado e aguardando atribuição`,
      })
    } catch { /* tabela pode não existir */ }

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
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string,
  setorId: string
): Promise<string | null> {
  const HEARTBEAT_STALE_MS = 5 * 60 * 1000
  const now = Date.now()

  let maxTicketsPerAgent = 10
  try {
    const { data: config } = await supabase
      .from('ticket_distribution_config')
      .select('max_tickets_per_agent')
      .eq('setor_id', setorId)
      .maybeSingle()
    if (config) maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
  } catch { /* tabela pode não existir */ }

  const { data: rawColabs } = await supabase
    .from('colaboradores')
    .select(`id, last_heartbeat, last_ticket_received_at, colaboradores_setores!inner(setor_id)`)
    .eq('colaboradores_setores.setor_id', setorId)
    .eq('is_online', true)
    .eq('ativo', true)
    .is('pausa_atual_id', null)

  if (!rawColabs || rawColabs.length === 0) return null

  // Filtra por heartbeat fresco — NUNCA distribui para quem tem heartbeat stale
  const colaboradores = rawColabs.filter(c =>
    c.last_heartbeat && (now - new Date(c.last_heartbeat).getTime()) < HEARTBEAT_STALE_MS
  )
  console.log(`[_tentarDistribuirNoSetor] setor=${setorId}: ${rawColabs.length} online, ${colaboradores.length} com heartbeat fresco`)

  if (colaboradores.length === 0) return null

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

  // Round-robin: desempate por last_ticket_received_at (atualizado no momento da atribuição)
  const sorted = colaboradores
    .map(c => ({
      id: c.id,
      count: countMap[c.id] || 0,
      lastReceivedAt: (c as any).last_ticket_received_at || '1970-01-01',
    }))
    .filter(c => c.count < maxTicketsPerAgent)
    .sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count
      return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
    })

  const bestColaborador = sorted.length > 0 ? sorted[0] : null

  if (!bestColaborador) return null

  const { error } = await supabase
    .from('tickets')
    .update({
      colaborador_id: bestColaborador.id,
      status: 'em_atendimento',
    })
    .eq('id', ticketId)

  if (error) return null

  // Atualizar last_ticket_received_at para round-robin correto
  await supabase
    .from('colaboradores')
    .update({ last_ticket_received_at: new Date().toISOString() })
    .eq('id', bestColaborador.id)

  try {
    await supabase.from('ticket_assignment_logs').insert({
      ticket_id: ticketId,
      colaborador_id: bestColaborador.id,
      setor_id: setorId,
      action: 'auto_assigned',
      assignment_reason: `Auto-assigned no setor receptor (${bestColaborador.count} tickets)`,
    })
  } catch { /* tabela pode não existir */ }

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

    // Get distribution config (tabela opcional)
    let maxTicketsPerAgent = 10
    try {
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('max_tickets_per_agent')
        .eq('setor_id', setorId)
        .maybeSingle()
      if (config) maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
    } catch { /* tabela pode não existir */ }

    // Get ALL available collaborators in this setor
    const HEARTBEAT_STALE_MS = 5 * 60 * 1000
    const now = Date.now()

    const { data: rawColaboradores } = await supabase
      .from('colaboradores')
      .select(`
        id,
        last_heartbeat,
        last_ticket_received_at,
        colaboradores_setores!inner(setor_id)
      `)
      .eq('colaboradores_setores.setor_id', setorId)
      .eq('is_online', true)
      .eq('ativo', true)
      .is('pausa_atual_id', null)

    // Filtra por heartbeat fresco — NUNCA distribui para quem tem heartbeat stale
    const allColaboradores = (rawColaboradores || []).filter(c =>
      c.last_heartbeat && (now - new Date(c.last_heartbeat).getTime()) < HEARTBEAT_STALE_MS
    )
    console.log(`[redistribuirTicketsPendentes] setor=${setorId}: ${rawColaboradores?.length || 0} online, ${allColaboradores.length} com heartbeat fresco`)

    if (allColaboradores.length === 0) {
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
            try {
              await supabase.from('ticket_logs').insert({
                ticket_id: ticket.id,
                tipo: 'transferencia_automatica',
                descricao: `Ticket transferido automaticamente para setor receptor (nenhum atendente online no setor original)`,
              })
            } catch { /* tabela pode não existir */ }

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

    // Round-robin: usar last_ticket_received_at (atualizado no momento real da atribuição)
    const lastReceivedMap: Record<string, string> = {}
    allColaboradores.forEach(c => {
      lastReceivedMap[c.id] = (c as any).last_ticket_received_at || '1970-01-01'
    })

    // Distribute tickets respecting subsetor
    for (const ticket of pendingTickets) {
      let eligibleColaboradores = allColaboradores

      if (ticket.subsetor_id) {
        // Colaboradores que atendem este subsetor
        const subsetorColabIds = subsetorToColabs[ticket.subsetor_id]
        if (subsetorColabIds && subsetorColabIds.size > 0) {
          const filtered = allColaboradores.filter(c => subsetorColabIds.has(c.id))
          eligibleColaboradores = filtered
        } else {
          eligibleColaboradores = []
        }
      }

      // Ordenar: 1) menor qtd tickets, 2) quem recebeu há mais tempo (round-robin real)
      const sorted = eligibleColaboradores
        .map(c => ({
          id: c.id,
          count: countMap[c.id] || 0,
          lastReceivedAt: lastReceivedMap[c.id] || '1970-01-01',
        }))
        .filter(c => c.count < maxTicketsPerAgent)
        .sort((a, b) => {
          if (a.count !== b.count) return a.count - b.count
          return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
        })

      const bestColaborador = sorted.length > 0 ? sorted[0] : null

      if (bestColaborador) {
        const { error } = await supabase
          .from('tickets')
          .update({
            colaborador_id: bestColaborador.id,
            status: 'em_atendimento',
          })
          .eq('id', ticket.id)

        if (!error) {
          // Update count map e lastReceivedMap para próximas iterações
          countMap[bestColaborador.id] = (countMap[bestColaborador.id] || 0) + 1
          const nowIso = new Date().toISOString()
          lastReceivedMap[bestColaborador.id] = nowIso
          assignedCount++

          // Atualizar last_ticket_received_at no banco para round-robin correto
          await supabase
            .from('colaboradores')
            .update({ last_ticket_received_at: nowIso })
            .eq('id', bestColaborador.id)

          const reason = ticket.subsetor_id
            ? `Round-robin redistribuição (subsetor: ${ticket.subsetor_id}, ${bestColaborador.count} tickets)`
            : `Round-robin redistribuição (${bestColaborador.count} tickets)`

          try {
            await supabase.from('ticket_assignment_logs').insert({
              ticket_id: ticket.id,
              colaborador_id: bestColaborador.id,
              setor_id: setorId,
              action: 'redistributed',
              assignment_reason: reason,
            })
          } catch { /* tabela pode não existir */ }
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
            try {
              await supabase.from('ticket_logs').insert({
                ticket_id: ticket.id,
                tipo: 'transferencia_automatica',
                descricao: `Ticket transferido automaticamente para setor receptor (redistribuição sem atendentes disponíveis)`,
              })
            } catch { /* tabela pode não existir */ }

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
