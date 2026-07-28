/**
 * Indicadores de fila para o relatório de atendimento.
 *
 * A "fila" aqui é a espera do cliente pela PRIMEIRA RESPOSTA — de `criado_em`
 * até `primeira_resposta_em`. É o único recorte reconstruível historicamente:
 * `atribuido_em` só passou a ser gravado em 28/07/2026, e antes disso não há
 * registro de quando o ticket saiu da fila.
 *
 * "Quantas vezes a fila surgiu" foi descartado como métrica: medido sobre 8
 * dias do ServiceDesk, o resultado é 1 em todos os subsetores e em todos os
 * limiares testados (10, 15 e 30 min) — a fila nunca esvazia, então ela
 * "surgiu" uma vez e nunca acabou. O que informa é QUANTOS CLIENTES passaram do
 * limite, que é o que esta função conta.
 */

export type TicketFila = {
  numero?: number | string | null
  criado_em?: string | null
  primeira_resposta_em?: string | null
  clientes?: { nome?: string | null } | null
}

export type MaiorEspera = {
  esperaMs: number
  ticket: string | null
  cliente: string | null
  /** ISO da entrada na fila (criação do ticket). */
  entradaISO: string | null
  /** A espera ainda está correndo — o cliente segue sem resposta. */
  emAndamento: boolean
}

export type ResumoFila = {
  /** Tickets do período com data de criação válida. */
  total: number
  /** Responderam dentro do limite (ou ainda estão dentro dele). */
  dentroDoLimite: number
  /** Passaram do limite — cada um é um cliente que esperou demais. */
  acimaDoLimite: number
  /** 0 a 100. Sem tickets no período, 100: não houve fila para falhar. */
  saudePercentual: number
  /** Máximo de clientes simultaneamente acima do limite. */
  picoSimultaneo: number
  maiorEspera: MaiorEspera | null
}

export const LIMITE_FILA_PADRAO_MIN = 15

export function resumirFila(
  tickets: readonly TicketFila[],
  opts: { agoraMs: number; limiteMin?: number },
): ResumoFila {
  const limiteMs = Math.max(0, (opts.limiteMin ?? LIMITE_FILA_PADRAO_MIN)) * 60_000

  let total = 0
  let acima = 0
  let maior: MaiorEspera | null = null
  const eventos: Array<[number, number]> = []

  for (const ticket of tickets) {
    const inicio = ticket.criado_em ? Date.parse(ticket.criado_em) : Number.NaN
    if (!Number.isFinite(inicio)) continue
    total += 1

    const respondido = ticket.primeira_resposta_em
      ? Date.parse(ticket.primeira_resposta_em)
      : Number.NaN
    const emAndamento = !Number.isFinite(respondido)
    // Sem resposta ainda, a espera corre até agora — é o caso que mais importa,
    // porque é o cliente que continua esperando.
    const fim = emAndamento ? opts.agoraMs : respondido
    const espera = fim - inicio
    if (!Number.isFinite(espera) || espera < 0) continue

    if (espera > limiteMs) {
      acima += 1
      eventos.push([inicio + limiteMs, 1], [fim, -1])
    }

    if (!maior || espera > maior.esperaMs) {
      maior = {
        esperaMs: espera,
        ticket: ticket.numero != null ? String(ticket.numero) : null,
        cliente: ticket.clientes?.nome || null,
        entradaISO: ticket.criado_em ?? null,
        emAndamento,
      }
    }
  }

  // Empate em `[tempo, delta]` resolve a saída antes da entrada, senão dois
  // tickets encostados contariam como dois simultâneos que nunca existiram.
  eventos.sort((primeiro, segundo) => primeiro[0] - segundo[0] || primeiro[1] - segundo[1])
  let simultaneos = 0
  let pico = 0
  for (const [, delta] of eventos) {
    simultaneos += delta
    if (simultaneos > pico) pico = simultaneos
  }

  return {
    total,
    dentroDoLimite: total - acima,
    acimaDoLimite: acima,
    saudePercentual: total > 0 ? Math.round(((total - acima) / total) * 100) : 100,
    picoSimultaneo: pico,
    maiorEspera: maior,
  }
}

/** "9h 12min 53s" — o formato do painel de referência. */
export function formatarEsperaLonga(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const segundos = Math.floor(ms / 1000)
  const h = Math.floor(segundos / 3600)
  const min = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  if (h > 0) return `${h}h ${min}min ${s}s`
  if (min > 0) return `${min}min ${s}s`
  return `${s}s`
}

/** Faixa da saúde, para escolher a cor sem espalhar limiares pela tela. */
export function faixaDeSaude(percentual: number): 'boa' | 'atencao' | 'critica' {
  if (percentual >= 90) return 'boa'
  if (percentual >= 70) return 'atencao'
  return 'critica'
}
