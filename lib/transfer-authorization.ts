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
