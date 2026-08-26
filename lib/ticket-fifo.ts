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

export interface TicketRoteado extends TicketDaFila {
  setor_id: string | null
  subsetor_id: string | null
}

/**
 * Tickets do mesmo setor E do mesmo subsetor disputam o mesmo conjunto de
 * atendentes. São eles que formam uma fila de verdade — o resto da tabela é
 * outra fila, com outros atendentes, e não deve interferir.
 */
export function chaveDaFila(ticket: TicketRoteado): string {
  return `${ticket.setor_id ?? 'sem-setor'}|${ticket.subsetor_id ?? 'sem-subsetor'}`
}

export interface ResultadoTentativa {
  success: boolean
  /**
   * Ninguém pôde pegar o ticket porque TODOS os candidatos estão no teto de
   * tickets abertos. É a única falha que se resolve sozinha com o tempo: basta
   * um atendente encerrar uma conversa.
   */
  queueSaturated?: boolean
}

export interface PercursoDaFila<T, R> {
  /** Resultado de cada ticket que chegou a ser tentado. */
  resultados: Map<string, R>
  /** Tickets que nem foram tentados porque a vaga é de quem está na frente. */
  aguardando: T[]
}

/**
 * Percorre a fila em ordem de chegada e — esta é a regra — PARA a fila assim que
 * o ticket da vez não pôde ser atribuído por saturação.
 *
 * Sem isso a ordem FIFO era só a ordem de VERIFICAÇÃO, não prioridade sobre a
 * vaga. O laço reconsulta a disponibilidade a cada ticket, então uma vaga que
 * abre no meio da passada era entregue a quem estivesse sendo avaliado naquele
 * instante. O mais antigo, avaliado segundos antes com todo mundo no teto,
 * perdia a vaga para um ticket recém-criado e esperava a próxima passada — onde
 * costumava perder de novo. Medido em produção: só 14% das vagas iam para o
 * primeiro da fila, e 30% iam para o último.
 *
 * Parar é seguro justamente porque o grupo compartilha os atendentes: se o
 * primeiro não coube, nenhum dos seguintes caberia. Continuar não distribuía
 * mais ticket nenhum — só decidia QUEM furava a fila. E, de quebra, cada fila
 * saturada deixa de gastar uma dezena de consultas por ticket.
 *
 * As outras falhas não param nada. "Ninguém online no setor" e "ninguém aqui
 * pode atender este subsetor" não melhoram esperando, e os tickets seguintes
 * precisam ser avaliados para que o transbordo de SETOR os alcance.
 */
export async function percorrerFilasEmOrdem<
  T extends TicketRoteado,
  R extends ResultadoTentativa,
>(
  tickets: readonly T[],
  tentar: (ticket: T) => Promise<R>,
): Promise<PercursoDaFila<T, R>> {
  const resultados = new Map<string, R>()
  const aguardando: T[] = []
  const filasParadas = new Set<string>()

  for (const ticket of ordenarTicketsPorFila(tickets)) {
    const fila = chaveDaFila(ticket)

    if (filasParadas.has(fila)) {
      aguardando.push(ticket)
      continue
    }

    const resultado = await tentar(ticket)
    resultados.set(ticket.id, resultado)

    if (!resultado.success && resultado.queueSaturated) filasParadas.add(fila)
  }

  return { resultados, aguardando }
}
