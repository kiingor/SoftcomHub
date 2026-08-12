// Para onde a transferência leva o ticket, e quando o botão de confirmar pode
// ligar.
//
// As duas regras moravam dentro da rota e dentro do componente, onde teste
// nenhum alcança. Elas importam porque são a ENTRADA do bloqueio de devolução
// (caso #97066): o corpo da requisição pode omitir o subsetor, e nesse caso o
// destino é o subsetor atual do ticket — exatamente a fila que acabou de ceder
// o ticket por transbordo. Sem resolver isso primeiro, o bloqueio olharia para
// `null` e deixaria a devolução passar.

export interface TicketEmTransferencia {
  setorId: string
  subsetorId: string | null
}

export interface DestinoSolicitado {
  setorId?: string | null
  subsetorId?: string | null
  /** A chave `setor_id` veio no corpo? Omitir é diferente de mandar `null`. */
  temSetorExplicito: boolean
  /** Idem para `subsetor_id`. */
  temSubsetorExplicito: boolean
}

export interface DestinoResolvido {
  setorId: string
  subsetorId: string | null
}

/**
 * Setor e subsetor de destino a partir do que o corpo pediu.
 *
 * Omitir o setor mantém o do ticket. Omitir o subsetor mantém o do ticket, mas
 * só enquanto o setor não muda: subsetor pertence a um setor, então trocar de
 * setor sem dizer o subsetor cai na fila sem subsetor do destino.
 */
export function resolverDestinoTransferencia(
  ticket: TicketEmTransferencia,
  solicitado: DestinoSolicitado,
): DestinoResolvido {
  const setorId = solicitado.temSetorExplicito ? solicitado.setorId! : ticket.setorId
  const mudaDeSetor = setorId !== ticket.setorId
  const subsetorId = !mudaDeSetor && !solicitado.temSubsetorExplicito
    ? ticket.subsetorId
    : solicitado.subsetorId ?? null

  return { setorId, subsetorId }
}

export type ModoDestino = 'queue' | 'attendant'

/** A fila escolhida é a que está fechada para este ticket? */
export function isFilaBloqueada(
  subsetorSelecionadoId: string | null | undefined,
  subsetorBloqueadoId: string | null | undefined,
): boolean {
  return Boolean(subsetorSelecionadoId) && subsetorSelecionadoId === subsetorBloqueadoId
}

export interface DestinoEscolhido {
  subsetorSelecionadoId: string | null | undefined
  modo: ModoDestino
  atendenteSelecionadoId?: string | null
  /** Subsetor cuja FILA não pode receber este ticket agora. */
  subsetorComFilaBloqueada?: string | null
}

/**
 * O botão de confirmar pode ligar?
 *
 * Fila bloqueada desliga só o modo "fila": entregar a um atendente nomeado do
 * mesmo subsetor continua valendo, porque dá dono ao ticket em vez de devolvê-lo
 * a uma fila vazia.
 */
export function podeConfirmarDestino({
  subsetorSelecionadoId,
  modo,
  atendenteSelecionadoId,
  subsetorComFilaBloqueada,
}: DestinoEscolhido): boolean {
  if (!subsetorSelecionadoId) return false
  return modo === 'queue'
    ? !isFilaBloqueada(subsetorSelecionadoId, subsetorComFilaBloqueada)
    : Boolean(atendenteSelecionadoId)
}
