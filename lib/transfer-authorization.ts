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

/**
 * O colaborador manda neste setor — é master, ou supervisor vinculado a ele?
 *
 * Esta é a ÚNICA definição de "supervisor" do sistema, e existe extraída porque
 * dois lugares decidem com ela: {@link canTransferTicket}, para tickets de
 * terceiros, e o bloqueio de devolução ao subsetor de origem (caso #97066), que
 * só o supervisor do setor pode dispensar. Duas cópias divergiriam na primeira
 * mudança de regra — e uma delas ficaria mais frouxa que a outra sem ninguém ver.
 *
 * Sem `is_master`, o alcance é o vínculo: `can_see_all_tickets` é permissão para
 * ver tudo, não procuração sobre setor onde o supervisor não trabalha.
 */
export function hasSupervisorScope(actor: TransferActor, setorId: string): boolean {
  if (actor.isMaster) return true
  return actor.canSeeAllTickets && actor.linkedSetorIds.includes(setorId)
}

export function canTransferTicket(
  actor: TransferActor,
  ticket: TransferableTicket,
): TransferAuthorizationResult {
  if (ticket.colaboradorId === actor.id) return { allowed: true }
  if (hasSupervisorScope(actor, ticket.setorId)) return { allowed: true }
  return {
    allowed: false,
    reason: actor.canSeeAllTickets ? 'SUPERVISOR_OUT_OF_SCOPE' : 'NOT_OWNER',
  }
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
