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

  // Coleta colaboradores online: preferimos os com heartbeat fresco (< 2 min)
  // mas se nenhum tiver heartbeat fresco, usamos qualquer online como fallback
  const HEARTBEAT_STALE_MS = 2 * 60 * 1000
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

  rawLinks.forEach((link: any) => {
    const c = link.colaboradores
    if (!c || !c.ativo || !c.is_online || c.pausa_atual_id) return
    // Está online e ativo sem pausa → candidato
    allOnlineMap.set(c.id, { id: c.id, nome: c.nome })
    if (isHeartbeatFresh(c.last_heartbeat)) {
      freshMap.set(c.id, { id: c.id, nome: c.nome })
    } else {
      console.log(`[TicketQueue] ${c.nome} online mas heartbeat stale (${c.last_heartbeat})`)
    }
  })

  // Preferir fresh; fallback para qualquer online
  const colaboradoresMap = freshMap.size > 0 ? freshMap : allOnlineMap
  const source = freshMap.size > 0 ? 'fresh' : 'fallback-online'
  console.log(`[TicketQueue] Colaboradores disponíveis (${source}): ${colaboradoresMap.size} [subsetor=${subsetorId || 'null'}]`)

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

  return [...colaboradoresMap.values()]
    .map(c => ({ ...c, ticketCount: countMap.get(c.id) || 0 }))
    .sort((a, b) => {
      if (a.ticketCount !== b.ticketCount) return a.ticketCount - b.ticketCount
      return a.id.localeCompare(b.id)
    })
}

// Try to assign a single ticket with concurrency protection
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
  
  console.log(`[TicketQueue] Ticket data: colaborador_id=${ticket.colaborador_id}, status=${ticket.status}, subsetor_id=${ticket.subsetor_id}`)
  
  if (ticket.colaborador_id) {
    return { ticketId, colaboradorId: ticket.colaborador_id, success: false, reason: 'Already assigned' }
  }
  
  if (ticket.status !== 'aberto' && ticket.status !== 'em_atendimento') {
    return { ticketId, colaboradorId: null, success: false, reason: `Invalid status: ${ticket.status}` }
  }
  
  // Use the ticket's subsetor_id if available
  const ticketSubsetorId = subsetorId || ticket.subsetor_id
  
  console.log(`[TicketQueue] Using subsetor_id: ${ticketSubsetorId}`)
  
  let colaboradores: Array<{ id: string; nome: string; ticketCount: number }> = []
  
  if (ticketSubsetorId) {
    // Ticket tem subsetor: somente colaboradores daquele subsetor
    console.log(`[TicketQueue] Searching for colaboradores in subsetor ${ticketSubsetorId}`)
    colaboradores = await getAvailableColaboradores(setorId, ticketSubsetorId)
    if (colaboradores.length === 0) {
      console.log(`[TicketQueue] No colaboradores available for subsetor ${ticketSubsetorId} — ticket will remain unassigned`)
    }
  } else {
    // Sem subsetor: qualquer colaborador online do setor
    console.log(`[TicketQueue] No subsetor, getting all colaboradores from setor`)
    colaboradores = await getAvailableColaboradores(setorId, null)
  }
  
  console.log(`[TicketQueue] Found ${colaboradores.length} available colaboradores: ${JSON.stringify(colaboradores.map(c => ({ id: c.id, nome: c.nome })))}`)
  
  if (colaboradores.length === 0) {
    return { ticketId, colaboradorId: null, success: false, reason: 'No online colaboradores in setor' }
  }
  
  // Select the colaborador with least tickets (first in sorted array)
  const selectedColaborador = colaboradores[0]
  
  // Attempt atomic update with condition check (optimistic locking)
  const { data: updatedTicket, error } = await supabase
    .from('tickets')
    .update({
      colaborador_id: selectedColaborador.id,
      status: 'em_atendimento',
    })
    .eq('id', ticketId)
    .is('colaborador_id', null) // Only update if still unassigned
    .in('status', ['aberto', 'em_atendimento']) // Accept both statuses
    .select()
    .single()
  
  if (error || !updatedTicket) {
    // Another process may have assigned this ticket
    return { 
      ticketId, 
      colaboradorId: null, 
      success: false, 
      reason: 'Concurrent assignment detected - ticket may have been assigned by another process' 
    }
  }
  
  // Log the successful assignment
  logAssignment(
    ticketId,
    selectedColaborador.id,
    null,
    'auto_queue',
    `Auto-assigned from queue to ${selectedColaborador.nome} (${selectedColaborador.ticketCount} tickets)`,
    {
      colaborador_ticket_count: selectedColaborador.ticketCount,
      available_colaboradores: colaboradores.length,
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

// Function to call when a colaborador comes online
export async function onColaboradorOnline(colaboradorId: string): Promise<ProcessorStats> {
  const supabase = createServiceClient()
  
  // Get setores and subsetores this colaborador belongs to
  const { data: setores } = await supabase
    .from('colaboradores_setores')
    .select('setor_id, subsetor_id')
    .eq('colaborador_id', colaboradorId)
  
  console.log(`[TicketQueue] onColaboradorOnline - colaboradorId: ${colaboradorId}, setores: ${JSON.stringify(setores)}`)
  
  if (!setores || setores.length === 0) {
    return {
      processedAt: new Date().toISOString(),
      ticketsInQueue: 0,
      ticketsAssigned: 0,
      ticketsSkipped: 0,
      errors: ['Colaborador has no setores'],
      assignments: [],
    }
  }
  
  const setorIds = setores.map((s) => s.setor_id)
  const subsetorIds = setores.filter((s) => s.subsetor_id).map((s) => s.subsetor_id)
  
  // Log that colaborador came online
  logAssignment(
    null,
    colaboradorId,
    null,
    'colaborador_online',
    'Colaborador came online, checking queue',
    { setorIds, subsetorIds }
  )
  
  // Process the queue for these setores
  return processTicketQueue()
}

// Export configuration update function (placeholder - can be extended to use database)
export async function updateQueueConfig(config: Partial<QueueConfig>): Promise<void> {
  console.log('[TicketQueue] Config update requested:', config)
  // Configuration is currently using defaults
  // Can be extended to persist to database when needed
}
