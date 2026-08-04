/**
 * Os números do card "Atendimentos em tempo real".
 *
 * Extraído do componente para que o card do setor e os cards por subsetor usem
 * exatamente o mesmo cálculo. Se cada um tivesse a sua conta, a soma dos
 * subsetores deixaria de bater com o total do setor na mesma tela — e o gestor
 * perderia a confiança nos dois números.
 */

export const MONITORING_REFRESH_OPTIONS = {
  refreshInterval: 30_000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
} as const

export type TicketTempoReal = {
  status?: string | null
  subsetor_id?: string | null
  criado_em?: string | null
  primeira_resposta_em?: string | null
  /** Ticket iniciado pelo atendente via disparo — nesses o cliente é quem
   *  deve responder, então não contam pra "maior espera sem 1ª resposta". */
  is_disparo?: boolean | null
}

export type ResumoTempoReal = {
  total: number
  naFila: number
  emAtendimento: number
  finalizadosHoje: number
  /** Maior espera entre quem está na fila agora, em ms. */
  maiorEsperaFilaMs: number
  /** Maior espera de quem já tem atendente mas não recebeu resposta, em ms. */
  maiorEsperaRespostaMs: number
  atendentesOnline: number
}

export function calcularTempoReal<TTicket extends TicketTempoReal, TAtendente>({
  tickets,
  ticketsDeHoje,
  atendentes,
  aceitaTicket,
  aceitaAtendente,
  agoraMs,
}: {
  tickets: readonly TTicket[]
  ticketsDeHoje: readonly TTicket[]
  atendentes: readonly TAtendente[]
  aceitaTicket: (ticket: TTicket) => boolean
  aceitaAtendente: (atendente: TAtendente) => boolean
  agoraMs: number
}): ResumoTempoReal {
  const ativos = tickets.filter(aceitaTicket)
  const naFila = ativos.filter((ticket) => ticket.status === 'aberto')
  const emAtendimento = ativos.filter((ticket) => ticket.status === 'em_atendimento')
  const finalizados = ticketsDeHoje.filter(
    (ticket) => ticket.status === 'encerrado' && aceitaTicket(ticket),
  )
  const online = atendentes.filter(aceitaAtendente)

  // Data ausente, inválida ou no futuro não pode virar espera negativa nem NaN
  // — apareceria como número absurdo no card.
  const maiorEspera = (lista: readonly TTicket[], conta: (t: TTicket) => boolean) => (
    lista.reduce((maior, ticket) => {
      if (!conta(ticket) || !ticket.criado_em) return maior
      const espera = agoraMs - Date.parse(ticket.criado_em)
      return Number.isFinite(espera) && espera > maior ? espera : maior
    }, 0)
  )

  return {
    total: ativos.length,
    naFila: naFila.length,
    emAtendimento: emAtendimento.length,
    finalizadosHoje: finalizados.length,
    maiorEsperaFilaMs: maiorEspera(naFila, () => true),
    maiorEsperaRespostaMs: maiorEspera(emAtendimento, (t) => !t.primeira_resposta_em && !t.is_disparo),
    // A carga fica com quem chama: `calculateWorkloadOs` mora noutro módulo, e
    // manter esta lib sem dependência é o que permite testá-la direto no
    // executor do Node, sem bundler.
    atendentesOnline: online.length,
  }
}

/** hh:mm:ss, o mesmo formato que o card do setor já usava. */
export function formatarTempoMonitoramento(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const horas = Math.floor(ms / 3_600_000)
  const minutos = Math.floor((ms % 3_600_000) / 60_000)
  const segundos = Math.floor((ms % 60_000) / 1000)
  return [horas, minutos, segundos].map((n) => String(n).padStart(2, '0')).join(':')
}
