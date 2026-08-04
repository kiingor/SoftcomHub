/**
 * Indicadores de fila para o relatório de atendimento.
 *
 * FILA é o tempo SEM ATENDENTE: da entrada do cliente até `atribuido_em`. Não
 * até a primeira resposta — essa era a definição antiga e media outra coisa.
 * Medido em 04/08/2026 no ServiceDesk: dos 79 clientes Prime contados como
 * "esperaram", só 11 estavam sem dono; os outros 68 já tinham atendente em 6
 * segundos e aguardavam ele DIGITAR (mediana de 122s). Ou seja, 86% do que a
 * tela chamava de fila era tempo de resposta, e nenhum ajuste de limiar
 * consertava: é problema de equipe lenta, não de equipe faltando.
 *
 * A definição antiga se justificava porque `atribuido_em` só passou a ser
 * gravado em 28/07/2026. Para não perder o histórico, `resolverFimDaEspera`
 * mantém a cadeia: sem carimbo de atribuição cai na primeira resposta, depois
 * no encerramento. Consequência a conhecer: num relatório que atravesse
 * 28/07/2026 os dias anteriores seguem inflados pela regra velha, e a série tem
 * um degrau ali. Não há como reconstruir o que não foi gravado.
 *
 * `resumirFila` conta CLIENTES que passaram do limite; `contarEpisodiosDeFila`
 * conta VEZES que a fila se formou. Medir "vezes" sobre vários dias de uma vez
 * degenera para 1 — a espera da madrugada emenda um dia no outro —, o que antes
 * me levou a descartar a métrica como impossível. Por dia e por subsetor ela
 * funciona: ver a nota naquela função.
 */

type ClienteEmbed = { nome?: string | null }

/**
 * O que fecha a espera na fila, em ordem de preferência.
 *
 * `atribuido_em` é a saída de verdade: o cliente deixou a fila quando ganhou um
 * atendente. Os outros dois são degradação para o histórico anterior a
 * 28/07/2026, quando a coluna não era gravada.
 */
type TicketComSaidaDeFila = {
  /** Primeira atribuição. Só existe a partir de 28/07/2026. */
  atribuido_em?: string | null
  primeira_resposta_em?: string | null
  /**
   * Fecha a espera de quem foi encerrado sem nunca receber resposta. Sem isto a
   * espera desses tickets seguia correndo contra o relógio: o #151097 foi
   * encerrado 74 segundos depois de criado e aparecia como "3h 53min · ainda
   * esperando" no card de maior espera.
   */
  encerrado_em?: string | null
}

export type TicketFila = TicketComSaidaDeFila & {
  numero?: number | string | null
  criado_em?: string | null
  /** Disparo só entra na fila após o cliente responder. */
  is_disparo?: boolean | null
  cliente_respondeu_em?: string | null
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

type TicketComEntradaDeFila = Pick<
  TicketFila,
  'criado_em' | 'is_disparo' | 'cliente_respondeu_em'
>

function obterEntradaDeFila(ticket: TicketComEntradaDeFila): string | null {
  return ticket.is_disparo
    ? ticket.cliente_respondeu_em ?? null
    : ticket.criado_em ?? null
}

/**
 * A fila começa quando o cliente pede atendimento. Em disparos, o envio parte
 * da operação; enquanto o cliente não responder, não existe espera a medir.
 */
export function resolverEntradaDeFila(ticket: TicketComEntradaDeFila): number {
  const entrada = obterEntradaDeFila(ticket)
  return entrada ? Date.parse(entrada) : Number.NaN
}

/**
 * Instante em que o cliente saiu da fila, ou `NaN` se ainda espera.
 *
 * Ganhar um atendente é sair da fila — o que vier depois é tempo de resposta,
 * não de fila. Sem o carimbo de atribuição (histórico anterior a 28/07/2026),
 * cai na primeira resposta e depois no encerramento: quem foi fechado sem nunca
 * ser respondido saiu da fila ali, não segue esperando. Considerar só a resposta
 * fazia a espera desses tickets crescer para sempre.
 */
function resolverFimDaEspera(ticket: TicketComSaidaDeFila): number {
  const atribuido = ticket.atribuido_em
    ? Date.parse(ticket.atribuido_em)
    : Number.NaN
  if (Number.isFinite(atribuido)) return atribuido

  const respondido = ticket.primeira_resposta_em
    ? Date.parse(ticket.primeira_resposta_em)
    : Number.NaN
  if (Number.isFinite(respondido)) return respondido

  const encerrado = ticket.encerrado_em
    ? Date.parse(ticket.encerrado_em)
    : Number.NaN
  return Number.isFinite(encerrado) ? encerrado : Number.NaN
}

export type MaiorEspera = {
  esperaMs: number
  ticket: string | null
  cliente: string | null
  /** ISO da entrada na fila (criação ou resposta a disparo). */
  entradaISO: string | null
  /** A espera ainda está correndo — o cliente segue sem resposta. */
  emAndamento: boolean
}

export type ResumoFila = {
  /** Tickets do período com entrada de fila válida. */
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

export type OpcoesDeFila = {
  agoraMs: number
  limiteFilaMin?: number
  /**
   * Desconta as horas em que o setor está fechado — venha de
   * `criarMedidorDeExpediente`. Sem ele a conta segue em tempo corrido, que é
   * o comportamento de quem não tem horário cadastrado.
   *
   * Medido em 04/08/2026 no ServiceDesk: sem descontar, a maior espera do dia
   * era 6h37 de um cliente que escreveu 00:28 e foi atendido 07:05, cinco
   * minutos depois da abertura. Descontando, a pior espera real foi de 15 min.
   * A CONTAGEM de quem esperou quase não muda (70 contra 70 no mesmo dia) —
   * quem se distorce é o extremo.
   */
  expediente?: ((deMs: number, ateMs: number) => number) | null
}

/** A espera que conta: fora do expediente não havia como atender. */
function medirEspera(inicioMs: number, fimMs: number, opts: OpcoesDeFila): number {
  return opts.expediente ? opts.expediente(inicioMs, fimMs) : fimMs - inicioMs
}

export function resumirFila(
  tickets: readonly TicketFila[],
  opts: OpcoesDeFila & { limiteSlaMin?: number },
): ResumoFila {
  const filaMs = Math.max(0, opts.limiteFilaMin ?? LIMITE_FILA_PADRAO_MIN) * 60_000
  const slaMs = Math.max(0, opts.limiteSlaMin ?? LIMITE_SLA_PADRAO_MIN) * 60_000

  let total = 0
  let naFila = 0
  let acimaSla = 0
  let maior: MaiorEspera | null = null
  const eventos: Array<[number, number]> = []

  for (const ticket of tickets) {
    const inicio = resolverEntradaDeFila(ticket)
    if (!Number.isFinite(inicio)) continue
    total += 1

    const fimDaEspera = resolverFimDaEspera(ticket)
    const emAndamento = !Number.isFinite(fimDaEspera)
    // Sem nenhum carimbo, a espera corre até agora — é o caso que mais importa,
    // porque é o cliente que continua esperando.
    const fim = emAndamento ? opts.agoraMs : fimDaEspera
    const espera = medirEspera(inicio, fim, opts)
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
        entradaISO: obterEntradaDeFila(ticket),
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

export type TicketNaFila = TicketComSaidaDeFila & {
  criado_em?: string | null
  is_disparo?: boolean | null
  cliente_respondeu_em?: string | null
  status?: string | null
}

export type EpisodiosDeFila = {
  /** Vezes que a fila saiu de vazia e voltou a ter alguém. */
  vezes: number
  /** Máximo de tickets simultaneamente na fila. */
  pico: number
  /** Atendidos dentro do limite — nunca chegaram a formar fila. */
  semEspera: number
}

/**
 * Quantas VEZES a fila se formou no período.
 *
 * Diferente de contar clientes: um episódio é uma janela em que havia pelo
 * menos alguém esperando. Uma fila que nasce às 9h e absorve 40 clientes até
 * esvaziar é UMA vez, não 40.
 *
 * A saída da fila é a ATRIBUIÇÃO — ver `resolverFimDaEspera` e a nota do topo
 * do módulo. Sem nenhum dos carimbos, o cliente ainda está esperando agora.
 *
 * Quem foi atendido abaixo do limite não forma fila: sem isso, cada ticket
 * atribuído em 10 segundos abriria um episódio e o número viraria contagem de
 * cliente de novo.
 *
 * Esta função mede UMA fila. Passar vários subsetores de uma vez subconta, e
 * muito: misturando-os a fila quase não esvazia, porque um cobre o vazio do
 * outro. Para um recorte com várias filas use `somarEpisodiosPorFila`. Sobre
 * vários DIAS seguidos degenera igual, para 1 — a espera da madrugada emenda um
 * dia no outro —, e para isso não há função: meça um dia de cada vez.
 */
export function contarEpisodiosDeFila(
  tickets: readonly TicketNaFila[],
  opts: OpcoesDeFila,
): EpisodiosDeFila {
  const filaMs = Math.max(0, opts.limiteFilaMin ?? LIMITE_FILA_PADRAO_MIN) * 60_000
  const eventos: Array<[number, number]> = []
  let semEspera = 0

  for (const ticket of tickets) {
    const entrada = resolverEntradaDeFila(ticket)
    if (!Number.isFinite(entrada)) continue

    // Sem nenhum dos carimbos, a espera segue correndo agora.
    const fim = resolverFimDaEspera(ticket)
    const saida = Number.isFinite(fim) ? fim : opts.agoraMs

    // O teste de "isto foi fila?" desconta o expediente igual a `resumirFila`,
    // senão o card diria que ninguém esperou e mesmo assim contaria episódios.
    if (medirEspera(entrada, saida, opts) <= filaMs) {
      semEspera += 1
      continue
    }
    // A linha do tempo fica em hora corrida de propósito: o pico responde
    // quantos clientes esperavam JUNTOS, e isso acontece em hora real.
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

  return { vezes, pico, semEspera }
}

/**
 * Episódios somados FILA A FILA, para quando o recorte cobre várias.
 *
 * Cada subsetor tem os seus atendentes, logo é uma fila própria: uma fila em
 * Suporte e outra em Prime ao mesmo tempo são dois episódios, não um. Jogar as
 * duas numa linha do tempo só quase nunca deixa o contador voltar a zero — a
 * fila de um cobre o vazio do outro — e o total despenca. Medido em 04/08/2026
 * no ServiceDesk Matriz Chat: 31 na linha única contra 80 somando por subsetor,
 * e a mesma proporção nos sete dias anteriores.
 *
 * `filaDoTicket` decide a que fila cada ticket pertence. Quem chama resolve o
 * ticket sem subsetor — no ServiceDesk ele cai no Suporte, que é para onde vai
 * o trabalho não classificado.
 *
 * `pico` e `semEspera` continuam vindo do conjunto inteiro: "quantos clientes
 * esperavam no pior instante" é pergunta sobre o recorte todo, não sobre uma
 * fila só, e somar picos de filas diferentes daria um instante que nunca houve.
 */
export function somarEpisodiosPorFila<TTicket extends TicketNaFila>(
  tickets: readonly TTicket[],
  filaDoTicket: (ticket: TTicket) => string,
  opts: OpcoesDeFila,
): EpisodiosDeFila {
  const porFila = new Map<string, TTicket[]>()
  for (const ticket of tickets) {
    const chave = filaDoTicket(ticket)
    const daFila = porFila.get(chave)
    if (daFila) daFila.push(ticket)
    else porFila.set(chave, [ticket])
  }

  let vezes = 0
  for (const daFila of porFila.values()) {
    vezes += contarEpisodiosDeFila(daFila, opts).vezes
  }

  const doConjunto = contarEpisodiosDeFila(tickets, opts)
  return { vezes, pico: doConjunto.pico, semEspera: doConjunto.semEspera }
}
