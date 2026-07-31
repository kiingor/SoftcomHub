export interface TicketDaFila {
  id: string
  criado_em: string
}

/** Ordena tickets pendentes do mais antigo ao mais novo, com desempate estável. */
export function ordenarTicketsPorFila<T extends TicketDaFila>(
  tickets: readonly T[],
): T[] {
  return tickets.slice().sort((primeiro, segundo) => (
    primeiro.criado_em.localeCompare(segundo.criado_em)
    || primeiro.id.localeCompare(segundo.id)
  ))
}
