import { createServiceClient } from '@/lib/supabase/service'

// Configuration defaults
const DEFAULT_CHECK_INTERVAL_MS = 30000 // 30 seconds
const DEFAULT_MAX_QUEUE_TIME_MINUTES = 60 // Alert after 60 minutes in queue

interface QueueConfig {
  checkIntervalMs: number
  maxQueueTimeMinutes: number
  enabled: boolean
}

interface AssignmentResult {
  ticketId: string
  colaboradorId: string | null
  success: boolean
  reason: string
}

interface ProcessorStats {
  processedAt: string
  ticketsInQueue: number
  ticketsAssigned: number
  ticketsSkipped: number
  errors: string[]
  assignments: AssignmentResult[]
}

// Get queue configuration - using defaults for now (can be extended to use database)
export async function getQueueConfig(): Promise<QueueConfig> {
  return {
    checkIntervalMs: DEFAULT_CHECK_INTERVAL_MS,
    maxQueueTimeMinutes: DEFAULT_MAX_QUEUE_TIME_MINUTES,
    enabled: true,
  }
}

// Log assignment action for accountability (console logging for now)
function logAssignment(
  ticketId: string | null,
  colaboradorId: string | null,
  previousColaboradorId: string | null,
  assignmentType: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): void {
  console.log(`[TicketQueue] ${assignmentType}: ${reason}`, {
    ticketId,
    colaboradorId,
    previousColaboradorId,
    metadata,
    timestamp: new Date().toISOString(),
  })
}

// Get online colaboradores for a setor with their current ticket count.
//
// Quando subsetorId é fornecido:
//   → busca DIRETAMENTE em colaboradores_subsetores (fonte autoritativa de subsetor)
//   → join com colaboradores para verificar is_online/ativo/pausa
//   → NÃO depende de colaboradores_setores para este caminho
//
// Quando subsetorId é null:
//   → busca em colaboradores_setores (todos do setor, sem filtro de subsetor)
async function getAvailableColaboradores(
  setorId: string,
  subsetorId: string | null = null
): Promise<Array<{
  id: string
  nome: string
  ticketCount: number
}>> {
  const supabase = createServiceClient()

  console.log(`[TicketQueue] getAvailableColaboradores - setorId: ${setorId}, subsetorId: ${subsetorId}`)

  // Coleta colaboradores online com heartbeat fresco (< 5 min).
  // Browsers throttleiam timers em tabs background (heartbeat de 30s pode virar 60s+),
  // então usamos 5 min como margem segura — alinhado com o cleanup que marca offline.
  const HEARTBEAT_STALE_MS = 5 * 60 * 1000
  const now = Date.now()
  const isHeartbeatFresh = (lh: string | null): boolean => {
    if (!lh) return false
    return (now - new Date(lh).getTime()) < HEARTBEAT_STALE_MS
  }

  const freshMap = new Map<string, { id: string; nome: string }>()
  const allOnlineMap = new Map<string, { id: string; nome: string }>()

  let rawLinks: any[] = []

  if (subsetorId) {
    const { data, error } = await supabase
      .from('colaboradores_subsetores')
      .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat)')
      .eq('setor_id', setorId)
      .eq('subsetor_id', subsetorId)
    rawLinks = data || []
    console.log(`[TicketQueue] colaboradores_subsetores: ${rawLinks.length} registros, error: ${error?.message || 'none'}`)
  } else {
    const { data, error } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat)')
      .eq('setor_id', setorId)
    rawLinks = data || []
    console.log(`[TicketQueue] colaboradores_setores: ${rawLinks.length} registros, error: ${error?.message || 'none'}`)
  }

  const STALE_CLEANUP_MS = 5 * 60 * 1000 // 5 min — marcar offline automaticamente
  const veryStaleIds: string[] = []

  rawLinks.forEach((link: any) => {
    const c = link.colaboradores
    if (!c || !c.ativo || !c.is_online || c.pausa_atual_id) return
    // Está online e ativo sem pausa → candidato
    allOnlineMap.set(c.id, { id: c.id, nome: c.nome })
    if (isHeartbeatFresh(c.last_heartbeat)) {
      freshMap.set(c.id, { id: c.id, nome: c.nome })
    } else {
      console.log(`[TicketQueue] ${c.nome} online mas heartbeat stale (${c.last_heartbeat})`)
      // Heartbeat muito antigo → cleanup
      if (!c.last_heartbeat || (now - new Date(c.last_heartbeat).getTime()) > STALE_CLEANUP_MS) {
        veryStaleIds.push(c.id)
      }
    }
  })

  // Cleanup: marcar offline atendentes com heartbeat muito antigo (> 5 min)
  if (veryStaleIds.length > 0) {
    console.log(`[TicketQueue] Cleanup: marcando ${veryStaleIds.length} atendentes offline (heartbeat > 5 min)`)
    await supabase
      .from('colaboradores')
      .update({ is_online: false })
      .in('id', veryStaleIds)
  }

  // Somente usa atendentes com heartbeat fresco — sem fallback para stale
  const colaboradoresMap = freshMap
  const staleCount = allOnlineMap.size - freshMap.size
  console.log(`[TicketQueue] Colaboradores disponíveis: ${colaboradoresMap.size} fresh (${staleCount} stale ignorados) [subsetor=${subsetorId || 'null'}]`)

  if (colaboradoresMap.size === 0) return []

  const eligibleIds = [...colaboradoresMap.keys()]

  // Contar tickets ativos por colaborador
  const { data: ticketCounts } = await supabase
    .from('tickets')
    .select('colaborador_id')
    .in('colaborador_id', eligibleIds)
    .in('status', ['aberto', 'em_atendimento'])

  const countMap = new Map<string, number>()
  eligibleIds.forEach(id => countMap.set(id, 0))
  ticketCounts?.forEach((t: any) => {
    if (t.colaborador_id) {
      countMap.set(t.colaborador_id, (countMap.get(t.colaborador_id) || 0) + 1)
    }
  })

  // Round-robin: desempate pelo último ticket recebido (quem recebeu há mais tempo vai primeiro)
  const { data: lastAssigned } = await supabase
    .from('tickets')
    .select('colaborador_id, criado_em')
    .in('colaborador_id', eligibleIds)
    .not('colaborador_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(eligibleIds.length * 2)

  const lastAssignedMap = new Map<string, string>()
  lastAssigned?.forEach((t: any) => {
    if (t.colaborador_id && !lastAssignedMap.has(t.colaborador_id)) {
      lastAssignedMap.set(t.colaborador_id, t.criado_em)
    }
  })

  return [...colaboradoresMap.values()]
    .map(c => ({
      ...c,
      ticketCount: countMap.get(c.id) || 0,
      lastAssignedAt: lastAssignedMap.get(c.id) || '1970-01-01',
    }))
    .sort((a, b) => {
      // 1) Menor quantidade de tickets primeiro
      if (a.ticketCount !== b.ticketCount) return a.ticketCount - b.ticketCount
      // 2) Empate: quem recebeu há MAIS tempo vai primeiro (round-robin real)
      return a.lastAssignedAt.localeCompare(b.lastAssignedAt)
    })
}

// Try to assign a single ticket with concurrency protection and max_tickets_per_agent limit
async function tryAssignTicket(
  ticketId: string,
  setorId: string,
  subsetorId: string | null = null
): Promise<AssignmentResult> {
  const supabase = createServiceClient()

  console.log(`[TicketQueue] tryAssignTicket - ticketId: ${ticketId}, setorId: ${setorId}, subsetorId: ${subsetorId}`)

  // First, verify the ticket is still unassigned (prevent race conditions)
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, colaborador_id, status, setor_id, subsetor_id')
    .eq('id', ticketId)
    .single()

  if (!ticket) {
    return { ticketId, colaboradorId: null, success: false, reason: 'Ticket not found' }
  }

  if (ticket.colaborador_id) {
    return { ticketId, colaboradorId: ticket.colaborador_id, success: false, reason: 'Already assigned' }
  }

  if (ticket.status !== 'aberto' && ticket.status !== 'em_atendimento') {
    return { ticketId, colaboradorId: null, success: false, reason: `Invalid status: ${ticket.status}` }
  }

  // Buscar limite max_tickets_per_agent do setor
  const { data: config } = await supabase
    .from('ticket_distribution_config')
    .select('max_tickets_per_agent')
    .eq('setor_id', setorId)
    .maybeSingle()

  const maxTicketsPerAgent = config?.max_tickets_per_agent ?? 10

  // Use the ticket's subsetor_id if available
  const ticketSubsetorId = subsetorId || ticket.subsetor_id

  let colaboradores: Array<{ id: string; nome: string; ticketCount: number }> = []

  if (ticketSubsetorId) {
    // Primeiro tenta colaboradores do subsetor específico
    colaboradores = await getAvailableColaboradores(setorId, ticketSubsetorId)
    if (colaboradores.length === 0) {
      // Fallback: se ninguém disponível no subsetor, tenta qualquer colaborador do setor
      console.log(`[TicketQueue] No colaboradores in subsetor ${ticketSubsetorId}, falling back to setor-level`)
      colaboradores = await getAvailableColaboradores(setorId, null)
    }
  } else {
    colaboradores = await getAvailableColaboradores(setorId, null)
  }

  // Filtrar colaboradores que já atingiram o limite de tickets
  const eligibleColaboradores = colaboradores.filter(c => c.ticketCount < maxTicketsPerAgent)

  console.log(`[TicketQueue] Found ${colaboradores.length} available, ${eligibleColaboradores.length} below limit (max=${maxTicketsPerAgent})`)

  if (eligibleColaboradores.length === 0) {
    const reason = colaboradores.length === 0
      ? 'No online colaboradores in setor'
      : `All ${colaboradores.length} colaboradores at max ticket limit (${maxTicketsPerAgent})`
    return { ticketId, colaboradorId: null, success: false, reason }
  }

  // Select the colaborador with least tickets (first in sorted array)
  const selectedColaborador = eligibleColaboradores[0]

  // Attempt atomic update with condition check (optimistic locking)
  const { data: updatedTicket, error } = await supabase
    .from('tickets')
    .update({
      colaborador_id: selectedColaborador.id,
      status: 'em_atendimento',
    })
    .eq('id', ticketId)
    .is('colaborador_id', null) // Only update if still unassigned
    .in('status', ['aberto', 'em_atendimento'])
    .select()
    .single()

  if (error || !updatedTicket) {
    return {
      ticketId,
      colaboradorId: null,
      success: false,
      reason: 'Concurrent assignment detected - ticket may have been assigned by another process'
    }
  }

  logAssignment(
    ticketId,
    selectedColaborador.id,
    null,
    'auto_queue',
    `Auto-assigned from queue to ${selectedColaborador.nome} (${selectedColaborador.ticketCount}/${maxTicketsPerAgent} tickets)`,
    {
      colaborador_ticket_count: selectedColaborador.ticketCount,
      max_tickets_per_agent: maxTicketsPerAgent,
      available_colaboradores: eligibleColaboradores.length,
    }
  )

  return {
    ticketId,
    colaboradorId: selectedColaborador.id,
    success: true,
    reason: `Assigned to ${selectedColaborador.nome}`,
  }
}

// Main queue processor function
export async function processTicketQueue(): Promise<ProcessorStats> {
  const supabase = createServiceClient()
  const stats: ProcessorStats = {
    processedAt: new Date().toISOString(),
    ticketsInQueue: 0,
    ticketsAssigned: 0,
    ticketsSkipped: 0,
    errors: [],
    assignments: [],
  }
  
  // Check if processor is enabled
  const config = await getQueueConfig()
  if (!config.enabled) {
    stats.errors.push('Queue processor is disabled')
    return stats
  }
  
  // Get all unassigned tickets ordered by creation time (oldest first)
  const { data: queuedTickets, error: fetchError } = await supabase
    .from('tickets')
    .select('id, setor_id, subsetor_id, criado_em, clientes(nome)')
    .in('status', ['aberto', 'em_atendimento'])
    .is('colaborador_id', null)
    .order('criado_em', { ascending: true })
  
  if (fetchError) {
    stats.errors.push(`Error fetching queue: ${fetchError.message}`)
    return stats
  }
  
  stats.ticketsInQueue = queuedTickets?.length || 0
  
  console.log(`[TicketQueue] processTicketQueue - Found ${stats.ticketsInQueue} tickets in queue`)
  
  if (!queuedTickets || queuedTickets.length === 0) {
    return stats
  }
  
  // Log each queued ticket
  queuedTickets.forEach((t: any) => {
    console.log(`[TicketQueue] Queued ticket: id=${t.id}, setor_id=${t.setor_id}, subsetor_id=${t.subsetor_id}`)
  })
  
  // Process each ticket
  // Track tickets that failed assignment by setor for transmission check
  const failedBySetor: Record<string, string[]> = {}

  for (const ticket of queuedTickets) {
    if (!ticket.setor_id) {
      stats.ticketsSkipped++
      stats.assignments.push({
        ticketId: ticket.id,
        colaboradorId: null,
        success: false,
        reason: 'No setor_id',
      })
      continue
    }
    
    try {
      const result = await tryAssignTicket(ticket.id, ticket.setor_id, ticket.subsetor_id)
      stats.assignments.push(result)
      
      if (result.success) {
        stats.ticketsAssigned++
      } else {
        stats.ticketsSkipped++
        // Track failed tickets for potential transmission
        if (result.reason === 'No online colaboradores in setor') {
          if (!failedBySetor[ticket.setor_id]) {
            failedBySetor[ticket.setor_id] = []
          }
          failedBySetor[ticket.setor_id].push(ticket.id)
        }
      }
    } catch (error) {
      stats.ticketsSkipped++
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      stats.errors.push(`Error processing ticket ${ticket.id}: ${errorMessage}`)
      stats.assignments.push({
        ticketId: ticket.id,
        colaboradorId: null,
        success: false,
        reason: errorMessage,
      })
    }
  }

  // Transmissão automática: encaminhar tickets sem atendente para setor receptor
  for (const [setorId, ticketIds] of Object.entries(failedBySetor)) {
    try {
      const { data: setorData } = await supabase
        .from('setores')
        .select('transmissao_ativa, setor_receptor_id')
        .eq('id', setorId)
        .single()

      if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
        const receptorId = setorData.setor_receptor_id
        console.log(`[TicketQueue] Transmissão ativa no setor ${setorId} → receptor ${receptorId}. Encaminhando ${ticketIds.length} tickets.`)

        for (const ticketId of ticketIds) {
          // Mover ticket para o setor receptor
          const { error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: null,
            })
            .eq('id', ticketId)
            .is('colaborador_id', null)
            .eq('status', 'aberto')

          if (!moveError) {
            // Log da transferência
            await supabase.from('ticket_logs').insert({
              ticket_id: ticketId,
              tipo: 'transferencia_automatica',
              descricao: `Ticket transferido automaticamente para setor receptor (fila sem atendentes disponíveis)`,
            })

            // Tentar atribuir no setor receptor
            const receptorResult = await tryAssignTicket(ticketId, receptorId)
            if (receptorResult.success) {
              stats.ticketsAssigned++
              stats.ticketsSkipped--
            }
            stats.assignments.push({
              ...receptorResult,
              reason: `Transmitido para receptor: ${receptorResult.reason}`,
            })

            console.log(`[TicketQueue] Ticket ${ticketId} transmitido para receptor ${receptorId}: ${receptorResult.success ? 'atribuído' : 'aguardando'}`)
          }
        }
      }
    } catch (error) {
      console.error(`[TicketQueue] Erro ao verificar transmissão do setor ${setorId}:`, error)
    }
  }
  
  // Log processor run
  logAssignment(
    null,
    null,
    null,
    'queue_processor_run',
    `Processed ${stats.ticketsInQueue} tickets, assigned ${stats.ticketsAssigned}`,
    {
      ticketsInQueue: stats.ticketsInQueue,
      ticketsAssigned: stats.ticketsAssigned,
      ticketsSkipped: stats.ticketsSkipped,
      errorsCount: stats.errors.length,
    }
  )

  return stats
}

// Function to call when a colaborador comes online — only processes tickets from their setores
export async function onColaboradorOnline(colaboradorId: string): Promise<ProcessorStats> {
  const supabase = createServiceClient()

  const stats: ProcessorStats = {
    processedAt: new Date().toISOString(),
    ticketsInQueue: 0,
    ticketsAssigned: 0,
    ticketsSkipped: 0,
    errors: [],
    assignments: [],
  }

  // Get setores this colaborador belongs to
  const { data: setores } = await supabase
    .from('colaboradores_setores')
    .select('setor_id')
    .eq('colaborador_id', colaboradorId)

  if (!setores || setores.length === 0) {
    stats.errors.push('Colaborador has no setores')
    return stats
  }

  const setorIds = [...new Set(setores.map((s) => s.setor_id))]

  console.log(`[TicketQueue] onColaboradorOnline - colaboradorId: ${colaboradorId}, setorIds: ${JSON.stringify(setorIds)}`)

  // Only fetch unassigned tickets from the colaborador's setores
  const { data: queuedTickets, error: fetchError } = await supabase
    .from('tickets')
    .select('id, setor_id, subsetor_id, criado_em')
    .in('status', ['aberto', 'em_atendimento'])
    .is('colaborador_id', null)
    .in('setor_id', setorIds)
    .order('criado_em', { ascending: true })

  if (fetchError) {
    stats.errors.push(`Error fetching queue: ${fetchError.message}`)
    return stats
  }

  stats.ticketsInQueue = queuedTickets?.length || 0
  console.log(`[TicketQueue] onColaboradorOnline - Found ${stats.ticketsInQueue} queued tickets in colaborador's setores`)

  if (!queuedTickets || queuedTickets.length === 0) {
    return stats
  }

  for (const ticket of queuedTickets) {
    try {
      const result = await tryAssignTicket(ticket.id, ticket.setor_id, ticket.subsetor_id)
      stats.assignments.push(result)
      if (result.success) {
        stats.ticketsAssigned++
      } else {
        stats.ticketsSkipped++
      }
    } catch (error) {
      stats.ticketsSkipped++
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      stats.errors.push(`Error processing ticket ${ticket.id}: ${errorMessage}`)
    }
  }

  console.log(`[TicketQueue] onColaboradorOnline done - assigned ${stats.ticketsAssigned}/${stats.ticketsInQueue}`)
  return stats
}

// Export configuration update function (placeholder - can be extended to use database)
export async function updateQueueConfig(config: Partial<QueueConfig>): Promise<void> {
  console.log('[TicketQueue] Config update requested:', config)
  // Configuration is currently using defaults
  // Can be extended to persist to database when needed
}
