// Decide se um colaborador pode transferir um ticket específico. A permissão
// "can_see_all_tickets" (Supervisor) NÃO deve virar autorização global de
// transferência — ela só cobre tickets cujo setor de ORIGEM esteja entre os
// setores aos quais o supervisor está vinculado. is_master continua irrestrito.
export interface TransferActor {
  id: string
  isMaster: boolean
  canSeeAllTickets: boolean
  // colaboradores.setor_id (legado) + todos os setor_id de colaboradores_setores.
  linkedSetorIds: string[]
}

export interface TransferableTicket {
  colaboradorId: string | null
  setorId: string
}

export interface TransferTargetAvailability {
  ativo?: boolean | null
  is_online?: boolean | null
  pausa_atual_id?: string | null
  last_heartbeat?: string | null
}

export const TRANSFER_HEARTBEAT_STALE_MS = 5 * 60 * 1000

export type TransferAuthorizationResult =
  | { allowed: true }
  | { allowed: false; reason: 'NOT_OWNER' | 'SUPERVISOR_OUT_OF_SCOPE' }

export function canTransferTicket(
  actor: TransferActor,
  ticket: TransferableTicket,
): TransferAuthorizationResult {
  if (ticket.colaboradorId === actor.id) return { allowed: true }
  if (actor.isMaster) return { allowed: true }
  if (!actor.canSeeAllTickets) return { allowed: false, reason: 'NOT_OWNER' }
  if (!actor.linkedSetorIds.includes(ticket.setorId)) {
    return { allowed: false, reason: 'SUPERVISOR_OUT_OF_SCOPE' }
  }
  return { allowed: true }
}

export function isTransferTargetAvailable(
  target: TransferTargetAvailability | null | undefined,
  nowMs: number = Date.now(),
  staleAfterMs: number = TRANSFER_HEARTBEAT_STALE_MS,
): boolean {
  if (!target?.ativo || !target.is_online || target.pausa_atual_id || !target.last_heartbeat) {
    return false
  }

  const heartbeatMs = new Date(target.last_heartbeat).getTime()
  if (!Number.isFinite(heartbeatMs)) return false

  const ageMs = nowMs - heartbeatMs
  return ageMs >= 0 && ageMs < staleAfterMs
}
