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

type ClienteEmbed = { nome?: string | null }

export type TicketFila = {
  numero?: number | string | null
  criado_em?: string | null
  primeira_resposta_em?: string | null
  /**
   * O PostgREST devolve o embed como objeto ou como array conforme infere a
   * relação: no relatório vem objeto, na consulta do monitoramento vem array.
   * Aceitar só uma das formas faria o nome do cliente sumir calado numa das
   * telas.
   */
  clientes?: ClienteEmbed | ClienteEmbed[] | null
}

function nomeDoCliente(clientes: TicketFila['clientes']): string | null {
  const registro = Array.isArray(clientes) ? clientes[0] : clientes
  return registro?.nome || null
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
  /** Esperaram mais que o limite de fila — cada um é um cliente que ficou. */
  entraramNaFila: number
  /** Passaram do SLA. É o que a saúde mede. */
  acimaDoSla: number
  dentroDoSla: number
  /** 0 a 100, sobre o SLA. Sem tickets no período, 100: nada falhou. */
  saudePercentual: number
  /** Máximo de clientes simultaneamente na fila. */
  picoSimultaneo: number
  maiorEspera: MaiorEspera | null
}

/**
 * Entrar na fila e estar atrasado são coisas diferentes.
 *
 * Um minuto define FILA: a operação considera que o cliente já está esperando.
 * Quinze minutos definem o SLA, e é o que a saúde mede — usar 1 minuto nos dois
 * deixaria a barra permanentemente vermelha (19% no ServiceDesk hoje), e barra
 * sempre vermelha é barra que ninguém olha.
 */
export const LIMITE_FILA_PADRAO_MIN = 1
export const LIMITE_SLA_PADRAO_MIN = 15

export function resumirFila(
  tickets: readonly TicketFila[],
  opts: { agoraMs: number; limiteFilaMin?: number; limiteSlaMin?: number },
): ResumoFila {
  const filaMs = Math.max(0, opts.limiteFilaMin ?? LIMITE_FILA_PADRAO_MIN) * 60_000
  const slaMs = Math.max(0, opts.limiteSlaMin ?? LIMITE_SLA_PADRAO_MIN) * 60_000

  let total = 0
  let naFila = 0
  let acimaSla = 0
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

    if (espera > filaMs) {
      naFila += 1
      eventos.push([inicio + filaMs, 1], [fim, -1])
    }
    if (espera > slaMs) acimaSla += 1

    if (!maior || espera > maior.esperaMs) {
      maior = {
        esperaMs: espera,
        ticket: ticket.numero != null ? String(ticket.numero) : null,
        cliente: nomeDoCliente(ticket.clientes),
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
    entraramNaFila: naFila,
    acimaDoSla: acimaSla,
    dentroDoSla: total - acimaSla,
    saudePercentual: total > 0 ? Math.round(((total - acimaSla) / total) * 100) : 100,
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

export type TicketNaFila = {
  criado_em?: string | null
  /** Instante em que ganhou atendente — a saída da fila. */
  atribuido_em?: string | null
  status?: string | null
}

export type EpisodiosDeFila = {
  /** Vezes que a fila saiu de vazia e voltou a ter alguém. */
  vezes: number
  /** Máximo de tickets simultaneamente na fila. */
  pico: number
  /** Tickets cuja saída não foi registrada — não entram na conta. */
  semRegistro: number
  /** Sem nenhum ticket com saída conhecida, o número não pode ser afirmado. */
  temDados: boolean
}

/**
 * Quantas VEZES a fila se formou no período.
 *
 * Diferente de contar clientes: aqui a fila é o intervalo entre o ticket nascer
 * e ganhar atendente, e um episódio é uma janela em que havia alguém esperando.
 * Dez clientes chegando juntos são um episódio, não dez.
 *
 * Exige `atribuido_em`. A coluna existe desde sempre mas só passou a ser
 * gravada em 28/07/2026 — antes disso, 0 de 4.821 tickets de uma semana tinham
 * valor. Sem ela não há como saber quando o ticket saiu da fila, e o episódio
 * fica incalculável: daí `temDados`, para a tela dizer "sem registro" em vez de
 * mostrar um número inventado.
 *
 * Ticket ainda em 'aberto' conta como fila aberta até agora — é justamente
 * quem está esperando neste momento.
 */
export function contarEpisodiosDeFila(
  tickets: readonly TicketNaFila[],
  opts: { agoraMs: number },
): EpisodiosDeFila {
  const eventos: Array<[number, number]> = []
  let semRegistro = 0
  let comSaida = 0

  for (const ticket of tickets) {
    const entrada = ticket.criado_em ? Date.parse(ticket.criado_em) : Number.NaN
    if (!Number.isFinite(entrada)) continue

    const registrada = ticket.atribuido_em ? Date.parse(ticket.atribuido_em) : Number.NaN
    const aindaNaFila = ticket.status === 'aberto'
    const saida = Number.isFinite(registrada)
      ? registrada
      : (aindaNaFila ? opts.agoraMs : Number.NaN)

    if (!Number.isFinite(saida)) {
      // Já saiu da fila, mas ninguém anotou quando.
      semRegistro += 1
      continue
    }
    comSaida += 1
    if (saida <= entrada) continue
    eventos.push([entrada, 1], [saida, -1])
  }

  // Saída antes de entrada no empate: dois tickets encostados são dois
  // episódios, não um só com pico 2.
  eventos.sort((primeiro, segundo) => primeiro[0] - segundo[0] || primeiro[1] - segundo[1])

  let simultaneos = 0
  let pico = 0
  let vezes = 0
  let dentro = false
  for (const [, delta] of eventos) {
    simultaneos += delta
    if (simultaneos > pico) pico = simultaneos
    if (simultaneos >= 1 && !dentro) {
      vezes += 1
      dentro = true
    }
    if (simultaneos === 0) dentro = false
  }

  return { vezes, pico, semRegistro, temDados: comSaida > 0 }
}
