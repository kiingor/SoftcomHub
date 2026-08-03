// Regra de distribuição de tickets — quem recebe o próximo.
//
// Critério de justiça: EQUALIZAR O VOLUME RECEBIDO NO DIA, não a carga aberta
// no momento. Quem entra às 10h com 0 recebidos vai recebendo em sequência até
// emparelhar com quem começou às 7h; a partir daí todos avançam juntos.
//
// Ordenar por carga aberta (o critério anterior) não equaliza: quem encerra
// rápido volta a ficar com poucos abertos e recebe de novo, enquanto quem
// acumula conversa parada deixa de receber. Isso premia quem fecha ticket
// rápido em vez de distribuir o trabalho por igual.
//
// O limite de tickets abertos por atendente continua valendo — mas como FILTRO
// de quem pode receber agora, não como critério de ordem.

export interface CandidatoDistribuicao {
  id: string
  nome?: string
  /** Tickets em aberto/em atendimento agora. Protege contra sobrecarga. */
  ticketsAbertos: number
  /** Tickets recebidos no dia. É o que a regra equaliza. */
  recebidosHoje: number
  /** ISO da última atribuição. Desempata quem tem o mesmo volume. */
  ultimaAtribuicaoEm?: string | null
  /** Subsetores que o atendente atende. Vazio = atende "sem subsetor". */
  subsetorIds?: string[]
}

const SEM_ATRIBUICAO = '1970-01-01T00:00:00.000Z'

/**
 * Ordena candidatos pela regra de equalização e remove quem está no teto de
 * tickets abertos. `maxTicketsAbertos <= 0` desliga o teto.
 */
export function ordenarPorEquilibrio(
  candidatos: readonly CandidatoDistribuicao[],
  maxTicketsAbertos: number,
): CandidatoDistribuicao[] {
  return candidatos
    .filter((c) => maxTicketsAbertos <= 0 || c.ticketsAbertos < maxTicketsAbertos)
    .slice()
    .sort((a, b) => (
      // 1) quem recebeu menos hoje vai primeiro — é o que faz o retardatário emparelhar
      a.recebidosHoje - b.recebidosHoje
      // 2) empate: quem está há mais tempo sem receber
      || (a.ultimaAtribuicaoEm || SEM_ATRIBUICAO).localeCompare(b.ultimaAtribuicaoEm || SEM_ATRIBUICAO)
      // 3) empate total: ordem estável por id, para o resultado ser determinístico
      || a.id.localeCompare(b.id)
    ))
}

/** Um atendente atende o subsetor do ticket? Sem subsetor casa com sem subsetor. */
export function atendeSubsetor(
  subsetorDoTicket: string | null | undefined,
  subsetorIdsDoAtendente: readonly string[] | undefined,
): boolean {
  const ids = subsetorIdsDoAtendente || []
  return subsetorDoTicket ? ids.includes(subsetorDoTicket) : ids.length === 0
}

export interface EscolhaDestino {
  /** Candidatos elegíveis, já na ordem em que devem ser tentados. */
  fila: CandidatoDistribuicao[]
  /** 'proprio' = atendentes do subsetor do ticket. 'transbordo' = de outro. */
  origem: 'proprio' | 'transbordo' | 'ninguem'
}

export interface OpcoesDestino {
  subsetorDoTicket: string | null | undefined
  candidatos: readonly CandidatoDistribuicao[]
  /**
   * Subsetores que ainda têm ticket esperando na fila. Um atendente só é
   * puxado por transbordo se NENHUM subsetor dele tem fila — é o que garante
   * "o Prime esvazia a fila do Prime antes de ajudar o Suporte".
   */
  subsetoresComFila?: readonly (string | null)[]
  /**
   * Exceções pontuais à proteção da fila própria do candidato. O transbordo
   * continua bloqueado para os demais subsetores que ainda tenham fila.
   */
  subsetoresQuePodemReceberMesmoComFila?: readonly string[]
  maxTicketsAbertos: number
}

/**
 * Escolhe a ordem de tentativa para um ticket.
 *
 * 1. Atendentes do próprio subsetor que ainda têm vaga.
 * 2. Se nenhum tem vaga, atendentes de outro subsetor que tenham vaga E cuja
 *    própria fila esteja vazia, exceto por subsetores explicitamente liberados
 *    pelo chamador (transbordo — ex.: Prime usa Suporte).
 *
 * O passo 2 só entra quando o passo 1 se esgota, então a fila do próprio
 * subsetor sempre tem precedência.
 */
export function escolherDestino({
  subsetorDoTicket,
  candidatos,
  subsetoresComFila = [],
  subsetoresQuePodemReceberMesmoComFila = [],
  maxTicketsAbertos,
}: OpcoesDestino): EscolhaDestino {
  const proprios = candidatos.filter((c) => atendeSubsetor(subsetorDoTicket, c.subsetorIds))
  const filaPropria = ordenarPorEquilibrio(proprios, maxTicketsAbertos)
  if (filaPropria.length > 0) return { fila: filaPropria, origem: 'proprio' }

  // Transbordo: quem é de outro subsetor, tem vaga, e não tem fila esperando
  // por ele. Atendente sem subsetor entra pela chave `null`.
  const excecoesFilaPropria = new Set(subsetoresQuePodemReceberMesmoComFila)
  const temFilaPropria = (c: CandidatoDistribuicao) => {
    const ids = c.subsetorIds || []
    return ids.length === 0
      ? subsetoresComFila.includes(null)
      : ids.some((id) => (
        subsetoresComFila.includes(id) && !excecoesFilaPropria.has(id)
      ))
  }

  const outros = candidatos.filter((c) => (
    !atendeSubsetor(subsetorDoTicket, c.subsetorIds) && !temFilaPropria(c)
  ))
  const filaTransbordo = ordenarPorEquilibrio(outros, maxTicketsAbertos)
  if (filaTransbordo.length > 0) return { fila: filaTransbordo, origem: 'transbordo' }

  return { fila: [], origem: 'ninguem' }
}
