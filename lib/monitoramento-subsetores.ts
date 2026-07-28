/**
 * Recorte por subsetor dos números de tempo real do Monitoramento.
 *
 * O gestor do ServiceDesk acompanha Suporte e Prime, e o total do setor esconde
 * qual das filas está sofrendo: 12 na fila pode ser 11 no Suporte e 1 no Prime,
 * ou 6 e 6 — decisões opostas.
 *
 * Só agrega o que já está carregado na tela. Sem consulta nova.
 */

export type TicketMonitorado = {
  status?: string | null
  subsetor_id?: string | null
  criado_em?: string | null
  primeira_resposta_em?: string | null
  colaborador_id?: string | null
}

export type ResumoSubsetor = {
  /** `null` representa os tickets sem subsetor. */
  subsetorId: string | null
  nome: string
  naFila: number
  emAtendimento: number
  /** Aguardando a primeira resposta, já com atendente — o cliente ainda espera. */
  aguardandoResposta: number
  /** Maior espera entre os que estão na fila agora, em ms. */
  maiorEsperaMs: number | null
  total: number
}

export const SEM_SUBSETOR_CHAVE = '__sem_subsetor__'

/**
 * "Na fila" é `status === 'aberto'`, o mesmo critério que o resto do sistema já
 * usa. Divergir aqui faria a soma dos subsetores não bater com o card do setor,
 * e o gestor perderia a confiança nos dois números.
 */
export function resumirPorSubsetor(
  tickets: readonly TicketMonitorado[],
  opts: { agoraMs: number; nomePorId: ReadonlyMap<string, string> },
): ResumoSubsetor[] {
  const porSubsetor = new Map<string, ResumoSubsetor>()

  const obter = (subsetorId: string | null): ResumoSubsetor => {
    const chave = subsetorId ?? SEM_SUBSETOR_CHAVE
    const existente = porSubsetor.get(chave)
    if (existente) return existente

    const novo: ResumoSubsetor = {
      subsetorId,
      nome: subsetorId ? (opts.nomePorId.get(subsetorId) || 'Subsetor') : 'Sem subsetor',
      naFila: 0,
      emAtendimento: 0,
      aguardandoResposta: 0,
      maiorEsperaMs: null,
      total: 0,
    }
    porSubsetor.set(chave, novo)
    return novo
  }

  for (const ticket of tickets) {
    const resumo = obter(ticket.subsetor_id ?? null)
    resumo.total += 1

    if (ticket.status === 'aberto') {
      resumo.naFila += 1
      const criadoMs = ticket.criado_em ? Date.parse(ticket.criado_em) : Number.NaN
      const espera = opts.agoraMs - criadoMs
      // Data inválida ou no futuro não vira espera negativa nem NaN no topo.
      if (Number.isFinite(espera) && espera > 0) {
        resumo.maiorEsperaMs = Math.max(resumo.maiorEsperaMs ?? 0, espera)
      }
    } else if (ticket.status === 'em_atendimento') {
      resumo.emAtendimento += 1
      if (!ticket.primeira_resposta_em) resumo.aguardandoResposta += 1
    }
  }

  // Quem tem mais gente esperando aparece primeiro: é onde o gestor age.
  return [...porSubsetor.values()].sort((primeiro, segundo) => (
    segundo.naFila - primeiro.naFila
    || (segundo.maiorEsperaMs ?? 0) - (primeiro.maiorEsperaMs ?? 0)
    || primeiro.nome.localeCompare(segundo.nome)
  ))
}

/** Duração curta e legível de relance: "3min", "1h12", "2d". */
export function formatarEspera(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—'

  const minutos = Math.floor(ms / 60_000)
  if (minutos < 60) return `${minutos}min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) {
    const resto = minutos % 60
    return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
  }

  return `${Math.floor(horas / 24)}d`
}
