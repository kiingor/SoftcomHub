/**
 * Registra QUANDO o ticket saiu da fila.
 *
 * O ticket nasce sem atendente — o n8n insere só com cliente, setor e subsetor —
 * e a distribuição atribui depois. Sem gravar esse instante não existe "tempo em
 * fila": o Monitoramento mostra traço em toda linha já atribuída, e não há como
 * responder quantas vezes deu fila nem em que horário.
 *
 * A coluna `tickets.atribuido_em` já existe, mas está zerada há 60 dias —
 * medido em 28/07/2026 sobre 4.821 tickets de uma semana, nenhum preenchido.
 * `logAssignment` só escrevia no console.
 */

/**
 * Grava `atribuido_em` apenas na PRIMEIRA atribuição.
 *
 * O `.is('atribuido_em', null)` não é otimização, é a regra: tempo de fila é
 * `criado_em → primeira atribuição`. Uma transferência posterior entrega o
 * ticket a outra pessoa, mas o cliente já tinha saído da fila — sobrescrever
 * apagaria a espera real e faria o indicador melhorar sozinho a cada
 * transferência.
 *
 * Falha aqui não derruba a atribuição: o ticket já é do atendente, e perder a
 * marcação custa um ponto do relatório, não o atendimento. Mas registra em log
 * em vez de sumir — foi justamente o erro engolido que escondeu problemas o dia
 * inteiro em 28/07.
 */
export async function marcarSaidaDaFila(
  supabase: any,
  ticketId: string,
  agoraISO = new Date().toISOString(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tickets')
    .update({ atribuido_em: agoraISO })
    .eq('id', ticketId)
    .is('atribuido_em', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn('[atribuicao] não foi possível marcar atribuido_em', { ticketId, erro: error.message })
    return false
  }

  // Sem linha significa que já estava marcado — é o caso normal de transferência.
  return Boolean(data)
}
