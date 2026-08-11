/**
 * Decide se a conversa deve continuar acompanhando as mensagens novas.
 *
 * Rolar para o fim a cada atualização parece certo até o atendente subir para
 * reler algo: um recibo de entrega ou de leitura chega, a lista é recriada e a
 * visão salta de volta para baixo sozinha, sem que ele tenha feito nada.
 *
 * O comportamento correto de chat é acompanhar só quem já está no fim. Quem
 * subiu para ler fica onde está até voltar por conta própria.
 */

/** Folga em px para o atendente ainda contar como "no fim" da conversa. */
export const LIMIAR_FIM_CONVERSA_PX = 120

export type MetricasDeRolagem = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function estaNoFimDaConversa(
  metricas: MetricasDeRolagem | null | undefined,
  limiarPx = LIMIAR_FIM_CONVERSA_PX,
): boolean {
  // Sem medida confiável, acompanhar é o padrão menos surpreendente: é o que
  // vale ao abrir a conversa, antes de qualquer rolagem.
  if (!metricas) return true

  const { scrollTop, scrollHeight, clientHeight } = metricas
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return true

  // Conteúdo que ainda não enche a área visível não tem como estar "no meio".
  if (scrollHeight <= clientHeight) return true

  const limiar = Number.isFinite(limiarPx) && limiarPx >= 0 ? limiarPx : LIMIAR_FIM_CONVERSA_PX
  const distanciaDoFim = scrollHeight - clientHeight - scrollTop

  return distanciaDoFim <= limiar
}

/**
 * Se a conversa deve abrir na transição do bot para o humano, em vez do fim.
 *
 * Ticket vindo do Nexus abre no "início do ticket" para o atendente ver o que o
 * bot já tratou. Isso vale na PRIMEIRA vez — depois vira estorvo: ele troca de
 * chat para ler a mensagem que acabou de chegar e cai lá em cima, num trecho
 * que já leu, com a mensagem nova fora da tela. Quanto mais movimentada a
 * conversa, mais longe do fim ele aterrissa.
 *
 * Por isso a decisão é por ticket e por sessão: mostra a transição uma vez,
 * e a partir daí a conversa abre onde qualquer chat abre — no fim.
 */
export function devePosicionarNoInicioDoTicket(
  ticketId: string | null | undefined,
  ticketsJaVistos: ReadonlySet<string>,
): boolean {
  if (!ticketId) return false
  return !ticketsJaVistos.has(ticketId)
}

/**
 * Marcador do DOM na transição do histórico do bot para o atendimento humano.
 *
 * Só é renderizado quando existe conversa do Nexus antes do ticket — é o que
 * torna a exceção legítima: há algo acima para ler.
 */
export const SELETOR_INICIO_DO_TICKET = '[data-ticket-start]'

export type AlvoDaAberturaDaConversa = 'inicio-do-ticket' | 'fim'

/**
 * Onde a conversa deve aterrissar ao ser aberta.
 *
 * Regra única das três telas (WorkDesk, monitoramento e a tela do setor), que
 * antes tinham cópias divergentes: quem chamava direto o `scrollIntoView` de um
 * marcador de topo abria TODA conversa no começo, que é o bug relatado.
 *
 * O padrão é o fim. A única exceção é a primeira abertura de um ticket que tem
 * histórico anterior — sem esse histórico, "início do ticket" e "topo da lista"
 * são o mesmo lugar, e mandar para lá é justamente esconder a mensagem nova.
 */
export function decidirAberturaDaConversa({
  ticketId,
  ticketsJaVistos,
  temInicioDoTicket,
}: {
  ticketId: string | null | undefined
  ticketsJaVistos: ReadonlySet<string>
  temInicioDoTicket: boolean
}): AlvoDaAberturaDaConversa {
  if (!temInicioDoTicket) return 'fim'
  return devePosicionarNoInicioDoTicket(ticketId, ticketsJaVistos) ? 'inicio-do-ticket' : 'fim'
}
