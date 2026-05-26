/**
 * Deriva a "origem" de um ticket — como ele chegou ao setor atual.
 *
 * Categorias:
 *   - 'direto'        → ticket criado direto pelo cliente, sem transbordo
 *   - 'disparo'       → atendente iniciou (ticket.is_disparo === true)
 *   - 'transbordo'    → veio por transbordo automático (cron moveu setor)
 *   - 'transferencia' → transferência manual entre setores
 *
 * O `detalhes` é uma lista de eventos relevantes em ordem cronológica
 * (criação, transbordos, transferências) pra exibir no tooltip.
 */

export type OrigemTipo = 'direto' | 'disparo' | 'transbordo' | 'transferencia'

export interface OrigemTicket {
  tipo: OrigemTipo
  label: string
  /** Eventos ordenados cronologicamente pra tooltip */
  eventos: Array<{
    quando: string
    descricao: string
  }>
  /** Quantos hops de transbordo o ticket fez (se houve) */
  hops: number
}

export interface TicketLogLike {
  ticket_id: string
  tipo: string
  descricao: string | null
  criado_em: string
}

export interface TicketLike {
  id: string
  is_disparo?: boolean | null
  transbordo_hops?: number | null
  criado_em?: string | null
}

const LABELS: Record<OrigemTipo, string> = {
  direto: 'Direto',
  disparo: 'Disparo',
  transbordo: 'Transbordo',
  transferencia: 'Transferido',
}

/**
 * Mapeia um array de tickets + array de logs (em batch) pra origem.
 * Retorna Map keyed por ticket_id.
 */
export function calcularOrigem(
  tickets: TicketLike[],
  logs: TicketLogLike[],
): Map<string, OrigemTicket> {
  // Agrupa logs por ticket_id
  const porTicket = new Map<string, TicketLogLike[]>()
  for (const log of logs) {
    const arr = porTicket.get(log.ticket_id) || []
    arr.push(log)
    porTicket.set(log.ticket_id, arr)
  }
  for (const arr of porTicket.values()) {
    arr.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  }

  const resultado = new Map<string, OrigemTicket>()
  for (const t of tickets) {
    const logsTicket = porTicket.get(t.id) || []
    resultado.set(t.id, derivaOrigemUm(t, logsTicket))
  }
  return resultado
}

function derivaOrigemUm(ticket: TicketLike, logs: TicketLogLike[]): OrigemTicket {
  const eventos = logs
    .filter((l) => l.tipo !== 'encerramento' && l.tipo !== 'reabertura')
    .map((l) => ({
      quando: l.criado_em,
      descricao: descricaoCurta(l),
    }))

  const teveTransbordo = logs.some((l) => l.tipo === 'transferencia_automatica')
  const teveTransferenciaManual = logs.some((l) => l.tipo === 'transferencia')

  let tipo: OrigemTipo
  if (ticket.is_disparo) {
    tipo = 'disparo'
  } else if (teveTransferenciaManual) {
    tipo = 'transferencia'
  } else if (teveTransbordo) {
    tipo = 'transbordo'
  } else {
    tipo = 'direto'
  }

  return {
    tipo,
    label: LABELS[tipo],
    eventos,
    hops: ticket.transbordo_hops ?? 0,
  }
}

function descricaoCurta(log: TicketLogLike): string {
  switch (log.tipo) {
    case 'criacao':
      return log.descricao || 'Ticket criado'
    case 'transferencia':
      return log.descricao || 'Transferência manual'
    case 'transferencia_automatica':
      return log.descricao || 'Transbordo automático'
    case 'transbordo_limite_atingido':
      return log.descricao || 'Limite de transbordo atingido'
    case 'pull_manual':
      return log.descricao || 'Puxado da fila'
    default:
      return log.descricao || log.tipo
  }
}

/** Classes Tailwind por tipo, pra estilizar o badge */
export function badgeClassesPorTipo(tipo: OrigemTipo): string {
  switch (tipo) {
    case 'direto':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300'
    case 'disparo':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    case 'transbordo':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    case 'transferencia':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
  }
}
