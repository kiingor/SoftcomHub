export type TicketComTempoTransferencia = {
  criado_em?: string | null
  atribuido_em?: string | null
  setor_id?: string | null
  colaborador_id?: string | null
}

export type EventoAtribuicaoTicket = {
  action?: string | null
  setor_id?: string | null
  previous_setor_id?: string | null
  colaborador_id?: string | null
  created_at?: string | null
}

export type EventoHistoricoTicket = {
  tipo?: string | null
  criado_em?: string | null
}

function temDataValida(data: string | null | undefined): data is string {
  return typeof data === 'string' && Number.isFinite(Date.parse(data))
}

function temOrigemEstruturada(evento: EventoAtribuicaoTicket): boolean {
  return Object.prototype.hasOwnProperty.call(evento, 'previous_setor_id')
}

function ultimoEvento(
  eventos: readonly EventoAtribuicaoTicket[],
  aceita: (evento: EventoAtribuicaoTicket) => boolean,
): EventoAtribuicaoTicket | null {
  return eventos.reduce<EventoAtribuicaoTicket | null>((maisRecente, evento) => {
    if (!aceita(evento) || !temDataValida(evento.created_at)) return maisRecente
    if (!maisRecente || Date.parse(evento.created_at) > Date.parse(maisRecente.created_at!)) {
      return evento
    }
    return maisRecente
  }, null)
}

function ultimaTransferenciaLegada(eventos: readonly EventoHistoricoTicket[]): string | null {
  return eventos.reduce<string | null>((maisRecente, evento) => {
    if (
      !['transferencia', 'transferencia_automatica'].includes(evento.tipo || '')
      || !temDataValida(evento.criado_em)
    ) return maisRecente
    if (!maisRecente || Date.parse(evento.criado_em) > Date.parse(maisRecente)) {
      return evento.criado_em
    }
    return maisRecente
  }, null)
}

export function resolverIniciosTempoTransferencia(
  ticket: TicketComTempoTransferencia,
  eventos: readonly EventoAtribuicaoTicket[],
  historico: readonly EventoHistoricoTicket[] = [],
) {
  const eventoAtendenteAtual = ultimoEvento(
    eventos,
    (evento) => (
      temOrigemEstruturada(evento)
      && Boolean(ticket.colaborador_id)
      && evento.colaborador_id === ticket.colaborador_id
    ),
  )
  const entradaNoSetorAtual = ultimoEvento(
    eventos,
    (evento) => (
      temOrigemEstruturada(evento)
      && evento.action === 'transferred'
      && evento.setor_id === ticket.setor_id
      && Boolean(evento.previous_setor_id)
      && evento.previous_setor_id !== ticket.setor_id
    ),
  )
  const transferenciaLegadaEm = ultimaTransferenciaLegada(historico)

  return {
    atendimentoAtualEm: eventoAtendenteAtual?.created_at
      ?? transferenciaLegadaEm
      ?? ticket.atribuido_em
      ?? ticket.criado_em
      ?? null,
    setorAtualEm: entradaNoSetorAtual?.created_at ?? ticket.criado_em ?? null,
  }
}
