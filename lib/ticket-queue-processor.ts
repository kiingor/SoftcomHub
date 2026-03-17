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

  const colaboradoresMap = new Map<string, { id: string; nome: string }>()

  if (subsetorId) {
    // Caminho A: ticket com subsetor → buscar diretamente em colaboradores_subsetores
    // Isso garante que encontramos o colaborador mesmo que colaboradores_setores
    // não seja consultado (evita falha no estágio de pré-filtro).
    const { data: subsetorLinks, error: subErr } = await supabase
      .from('colaboradores_subsetores')
      .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id)')
      .eq('setor_id', setorId)
      .eq('subsetor_id', subsetorId)

    console.log(`[TicketQueue] colaboradores_subsetores query: ${subsetorLinks?.length || 0} registros, error: ${subErr?.message || 'none'}`)

    ;(subsetorLinks || []).forEach((sl: any) => {
      const c = sl.colaboradores
      if (c && c.ativo && c.is_online && !c.pausa_atual_id) {
        colaboradoresMap.set(c.id, { id: c.id, nome: c.nome })
      }
    })

    console.log(`[TicketQueue] Colaboradores online no subsetor ${subsetorId}: ${colaboradoresMap.size}`)
  } else {
    // Caminho B: ticket sem subsetor → qualquer colaborador online do setor
    const { data: setorLinks, error: setErr } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id)')
      .eq('setor_id', setorId)

    console.log(`[TicketQueue] colaboradores_setores query: ${setorLinks?.length || 0} registros, error: ${setErr?.message || 'none'}`)

    ;(setorLinks || []).forEach((cs: any) => {
      const c = cs.colaboradores
      if (c && c.ativo && c.is_online && !c.pausa_atual_id) {
        colaboradoresMap.set(c.id, { id: c.id, nome: c.nome })
      }
    })

    console.log(`[TicketQueue] Colaboradores online no setor (sem subsetor): ${colaboradoresMap.size}`)
  }

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
  
  if (ticket.status !== 'aberto') {
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
    .eq('status', 'aberto') // Only update if still open
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
    .eq('status', 'aberto')
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
