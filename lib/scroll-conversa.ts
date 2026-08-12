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
 * Marcador do DOM na transição do histórico do bot para o atendimento humano.
 *
 * Continua sendo renderizado como separador visual — o atendente enxerga onde o
 * bot parou ao rolar para cima. O que deixou de existir é rolar até ele na
 * abertura.
 */
export const SELETOR_INICIO_DO_TICKET = '[data-ticket-start]'

/**
 * A conversa SEMPRE abre no fim, na mensagem mais recente. Sem exceção.
 *
 * Já houve uma: ticket vindo do Nexus abria no "início do ticket" na primeira
 * vez, para o atendente ver o que o bot tratou. Medido em produção, isso deixava
 * quem abria o chat a 10.889px do fim numa conversa de 11.827px — 3% dela. A
 * mensagem que ele foi ler estava fora da tela, e ele tinha que rolar a conversa
 * inteira para baixo. Ver o histórico do bot é ocasional; ler a mensagem que
 * acabou de chegar é o motivo de abrir o chat.
 *
 * Esta constante existe para o comportamento ficar declarado num lugar só, em
 * vez de cada tela reinventar a regra — foi assim que a divergência começou.
 */
export const ABERTURA_DA_CONVERSA = 'fim' as const
