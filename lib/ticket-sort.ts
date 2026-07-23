// Chave de ordenação da lista de chats do WorkDesk: por atividade (mais recente
// primeiro, como o WhatsApp), OU por criado_em (ordem fixa) quando o SETOR DO
// TICKET específico travou a reordenação automática — não o setor do colaborador
// logado, já que um atendente pode ter tickets de vários setores com configs
// diferentes.
export interface SortableTicket {
  setor_id?: string | null
  ultima_mensagem_em?: string | null
  criado_em: string
}

export function ticketSortKey(
  ticket: SortableTicket,
  travarOrdenacaoPorSetor: ReadonlyMap<string, boolean>,
): string {
  const travado = ticket.setor_id ? travarOrdenacaoPorSetor.get(ticket.setor_id) === true : false
  return travado ? ticket.criado_em : (ticket.ultima_mensagem_em || ticket.criado_em)
}
