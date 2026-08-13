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

/**
 * Uma direção autorizada de transbordo — caso #97238.
 *
 * O transbordo era um CONJUNTO simétrico: bastava os dois subsetores estarem na
 * mesma lista e o socorro valia nos dois sentidos. Isso é o que deixava o ticket
 * de cliente Prime cair para o Suporte, e é justamente o que não pode acontecer:
 * cliente Prime fica com os atendentes escolhidos para o Prime.
 *
 * Par é direcionado de propósito. `{ de: Suporte, para: Prime }` NÃO autoriza
 * `{ de: Prime, para: Suporte }` — o sentido proibido deixa de ser proibido por
 * ausência e passa a estar escrito, junto da condição que o libera.
 */
export interface ParTransbordo {
  /** Subsetor cujo ticket pode ser socorrido. */
  de: string
  /** Subsetor que socorre. */
  para: string
  /**
   * O par só vale quando `de` não tem NENHUM atendente presente.
   *
   * É o resgate de última hora: sem ninguém para atender, é melhor o Suporte do
   * que ninguém. Note que "presente" não é "disponível" — quem está em pausa
   * conta como presente, porque ele volta. Ver
   * `subsetorDoTicketTemAtendentePresente`.
   */
  somenteSemAtendentePresente?: boolean
  /**
   * O socorrista entra mesmo tendo fila própria esperando.
   *
   * Só faz sentido junto de `somenteSemAtendentePresente`: quando o subsetor de
   * origem está literalmente vazio, segurar o ticket atrás da fila do socorrista
   * seria adiar o resgate que acabou de ser autorizado.
   */
  ignoraFilaDoSocorrista?: boolean
}

/**
 * Pares que valem para ESTE ticket agora: saem do subsetor dele e, quando são
 * condicionais, só depois que o subsetor ficou sem ninguém presente. Ticket sem
 * subsetor nunca casa — `null` não é origem de par nenhum.
 *
 * `undefined` devolve `null`, que significa transbordo irrestrito (comportamento
 * legado). Lista vazia significa o contrário: nenhum socorro autorizado, o
 * ticket segura na fila — e é isso que permite o transbordo de SETOR acontecer
 * depois.
 *
 * Exportada porque o transbordo de setor aplica a mesma regra sem passar por
 * `escolherDestino`; duplicar o predicado seria deixar os dois caminhos
 * divergirem com o tempo.
 */
export function filtrarParesAtivos(
  paresDeTransbordo: readonly ParTransbordo[] | undefined,
  subsetorDoTicket: string | null | undefined,
  temAtendentePresente: boolean,
): ParTransbordo[] | null {
  if (!paresDeTransbordo) return null

  return paresDeTransbordo.filter((par) => (
    Boolean(subsetorDoTicket)
    && par.de === subsetorDoTicket
    && (!par.somenteSemAtendentePresente || !temAtendentePresente)
  ))
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
   * Direções autorizadas de transbordo — na prática, Suporte → Prime sempre, e
   * Prime → Suporte só quando o Prime está sem ninguém.
   *
   * Restringir importa por dois motivos. O primeiro é o caso #97238: sem isso,
   * ticket de cliente Prime cai para atendente de Suporte. O segundo é que o
   * transbordo irrestrito engolia o transbordo de SETOR — numa filial, o
   * atendente do Financeiro puxava o ticket do Suporte, o ticket nunca
   * envelhecia na fila e nunca chegava à Matriz. Segurar o ticket é o que deixa
   * o transbordo de setor acontecer.
   *
   * `undefined` mantém o transbordo irrestrito (comportamento legado). Lista
   * vazia desliga o transbordo entre subsetores — é o caso do setor que não tem
   * Prime nem Suporte, onde nenhum par é autorizado.
   */
  paresDeTransbordo?: readonly ParTransbordo[]
  /**
   * O subsetor do ticket tem algum atendente PRESENTE — logado, ativo, com
   * heartbeat vivo e com o setor na sessão?
   *
   * Presente não é disponível. Quem está em pausa, ou no teto de tickets, conta
   * como presente: ele volta em minutos, e segurar o ticket para ele é o que
   * mantém o cliente Prime com o atendente do Prime. Só a ausência real —
   * deslogado, heartbeat morto — libera os pares marcados com
   * `somenteSemAtendentePresente`.
   *
   * O default é `true` de propósito: na dúvida o ticket fica na fila. Um chamador
   * que esqueça de informar falha protegendo o Prime, não vazando para o Suporte.
   */
  subsetorDoTicketTemAtendentePresente?: boolean
  maxTicketsAbertos: number
}

/**
 * Escolhe a ordem de tentativa para um ticket.
 *
 * 1. Atendentes do próprio subsetor que ainda têm vaga.
 * 2. Se nenhum tem vaga, atendentes de outro subsetor que tenham vaga E cuja
 *    própria fila esteja vazia — desde que o par (subsetor do ticket → subsetor
 *    do atendente) esteja autorizado em `paresDeTransbordo`.
 *
 * O passo 2 só entra quando o passo 1 se esgota, então a fila do próprio
 * subsetor sempre tem precedência.
 *
 * A direção é o que mudou no caso #97238. Suporte → Prime é livre; Prime →
 * Suporte só acontece quando o Prime não tem NENHUM atendente presente, e nesse
 * caso o resgate ignora a fila do Suporte para não ficar preso atrás dela.
 */
export function escolherDestino({
  subsetorDoTicket,
  candidatos,
  subsetoresComFila = [],
  paresDeTransbordo,
  subsetorDoTicketTemAtendentePresente = true,
  maxTicketsAbertos,
}: OpcoesDestino): EscolhaDestino {
  const proprios = candidatos.filter((c) => atendeSubsetor(subsetorDoTicket, c.subsetorIds))
  const filaPropria = ordenarPorEquilibrio(proprios, maxTicketsAbertos)
  if (filaPropria.length > 0) return { fila: filaPropria, origem: 'proprio' }

  const paresAtivos = filtrarParesAtivos(
    paresDeTransbordo,
    subsetorDoTicket,
    subsetorDoTicketTemAtendentePresente,
  )
  if (paresAtivos && paresAtivos.length === 0) return { fila: [], origem: 'ninguem' }

  const socorristas = paresAtivos ? new Set(paresAtivos.map((par) => par.para)) : null
  const filasIgnoradas = new Set(
    (paresAtivos || []).filter((par) => par.ignoraFilaDoSocorrista).map((par) => par.para),
  )

  // Transbordo: quem é de outro subsetor, tem vaga, e não tem fila esperando
  // por ele. Atendente sem subsetor entra pela chave `null`.
  //
  // A liberação é por subsetor, não por atendente: quem atende Suporte E
  // Financeiro continua barrado enquanto o Financeiro tiver fila.
  const temFilaPropria = (c: CandidatoDistribuicao) => {
    const ids = c.subsetorIds || []
    return ids.length === 0
      ? subsetoresComFila.includes(null)
      : ids.some((id) => (
        subsetoresComFila.includes(id) && !filasIgnoradas.has(id)
      ))
  }

  // O atendente precisa ser destino de um par ativo. Atende mais de um subsetor?
  // Basta que um deles socorra.
  const podeSocorrer = (c: CandidatoDistribuicao) => (
    !socorristas || (c.subsetorIds || []).some((id) => socorristas.has(id))
  )

  const outros = candidatos.filter((c) => (
    !atendeSubsetor(subsetorDoTicket, c.subsetorIds)
    && !temFilaPropria(c)
    && podeSocorrer(c)
  ))
  const filaTransbordo = ordenarPorEquilibrio(outros, maxTicketsAbertos)
  if (filaTransbordo.length > 0) return { fila: filaTransbordo, origem: 'transbordo' }

  return { fila: [], origem: 'ninguem' }
}
