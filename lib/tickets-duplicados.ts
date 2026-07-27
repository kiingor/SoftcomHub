// Detecção de tickets duplicados — mesmo cliente com mais de um atendimento
// aberto ao mesmo tempo.
//
// Isso acontece porque a criação de ticket não é atômica no fluxo que insere
// direto no banco: duas mensagens que chegam juntas viram dois tickets, cada um
// atribuído a um atendente diferente. A conversa fica partida e nenhum dos dois
// atendentes percebe. Enquanto a causa raiz não é corrigida na origem, a
// interface pelo menos avisa.

const STATUS_ABERTOS = new Set(['aberto', 'em_atendimento'])

export function isTicketAberto(status: string | null | undefined): boolean {
  return typeof status === 'string' && STATUS_ABERTOS.has(status)
}

/** Filtra, entre os outros tickets do mesmo cliente, os que continuam abertos. */
export function ticketsAbertos<T extends { status?: string | null }>(tickets: readonly T[]): T[] {
  return tickets.filter((t) => isTicketAberto(t.status))
}

interface TicketAgrupavel {
  id: string
  cliente_id?: string | null
  status?: string | null
}

/**
 * Ids dos tickets que dividem o cliente com pelo menos um outro ticket aberto
 * dentro da mesma lista. Só considera tickets abertos: um atendimento encerrado
 * não conflita com um em andamento.
 *
 * Ticket sem `cliente_id` nunca é marcado — não dá para afirmar duplicidade
 * sem saber de quem é.
 */
export function idsComDuplicidade(tickets: readonly TicketAgrupavel[]): Set<string> {
  const porCliente = new Map<string, string[]>()

  for (const ticket of tickets) {
    if (!ticket.cliente_id || !isTicketAberto(ticket.status)) continue
    const ids = porCliente.get(ticket.cliente_id) ?? []
    ids.push(ticket.id)
    porCliente.set(ticket.cliente_id, ids)
  }

  const duplicados = new Set<string>()
  for (const ids of porCliente.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicados.add(id))
  }
  return duplicados
}

/** Texto do aviso, no singular ou plural conforme a quantidade. */
export function rotuloDuplicidade(quantidadeDeOutros: number): string {
  return quantidadeDeOutros === 1
    ? 'Este cliente tem outro atendimento aberto'
    : `Este cliente tem outros ${quantidadeDeOutros} atendimentos abertos`
}
