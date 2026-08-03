/**
 * Janela de histórico do WorkDesk relativa ao criado_em do ticket — nunca à
 * meia-noite do momento atual. Um ticket aberto às 00h30 precisa enxergar a
 * conversa do Nexus de antes da meia-noite; "hoje desde 00h00" cortava
 * exatamente esse caso.
 */

const HORA_EM_MS = 60 * 60 * 1000

/** Quantas horas antes da criação do ticket a busca de histórico alcança. */
export const JANELA_HISTORICO_HORAS = 24

/** Tolerância pós-criação para uma mensagem órfã ainda contar como contexto do Nexus. */
export const TOLERANCIA_CONTEXTO_NEXUS_MS = 5 * 60 * 1000

export interface JanelaHistoricoTicket {
  /** Início da janela (criado_em - 24h), em epoch ms. */
  inicioMs: number
  /** Fim da tolerância de contexto Nexus (criado_em + 5min), em epoch ms. */
  fimContextoMs: number
}

function paraEpochMs(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const ms = valor instanceof Date ? valor.getTime() : new Date(valor as string | number).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Janela de histórico a partir do criado_em do ticket. Retorna null para
 * criado_em ausente/inválido — chamadores tratam isso como "sem contexto
 * Nexus conhecido", nunca lançam erro na tela.
 */
export function calcularJanelaHistoricoTicket(ticketCriadoEm: unknown): JanelaHistoricoTicket | null {
  const criadoEmMs = paraEpochMs(ticketCriadoEm)
  if (criadoEmMs === null) return null
  return {
    inicioMs: criadoEmMs - JANELA_HISTORICO_HORAS * HORA_EM_MS,
    fimContextoMs: criadoEmMs + TOLERANCIA_CONTEXTO_NEXUS_MS,
  }
}

/**
 * Início da janela como ISO, para o `.gte('enviado_em', ...)` das queries de
 * mensagens (ticket atual, outros tickets do cliente e órfãs). Sem criado_em
 * válido, cai para "agora - 24h": mantém a busca limitada em vez de ficar
 * sem piso inferior ou quebrar a tela.
 */
export function calcularInicioJanelaHistoricoIso(ticketCriadoEm: unknown, agora: Date = new Date()): string {
  const janela = calcularJanelaHistoricoTicket(ticketCriadoEm)
  const inicioMs = janela ? janela.inicioMs : agora.getTime() - JANELA_HISTORICO_HORAS * HORA_EM_MS
  return new Date(inicioMs).toISOString()
}

export interface MensagemNexusContexto {
  id: string
  ticket_id: string | null
  remetente: string
  enviado_em: string
}

export function ehMensagemNexus(mensagem: Pick<MensagemNexusContexto, 'remetente'>): boolean {
  return mensagem.remetente === 'cliente-nexus' || mensagem.remetente === 'bot-nexus'
}

/**
 * IDs das mensagens órfãs (sem ticket_id) que contam como conversa prévia do
 * Nexus deste ticket: precisam ser do Nexus e cair entre 24h antes e 5min
 * depois da criação. Mensagens já vinculadas (ticket_id preenchido) não
 * passam por aqui — pertencem ao ticket incondicionalmente, mesmo fora da
 * janela (ver `pertenceAoContextoDoTicket`).
 */
export function selecionarIdsContextoNexusOrfao<T extends MensagemNexusContexto>(
  mensagens: readonly T[],
  ticketCriadoEm: unknown,
): Set<string> {
  const janela = calcularJanelaHistoricoTicket(ticketCriadoEm)
  if (!janela) return new Set()

  const ids: string[] = []
  for (const m of mensagens) {
    if (m.ticket_id) continue
    if (!ehMensagemNexus(m)) continue
    const enviadoEmMs = paraEpochMs(m.enviado_em)
    if (enviadoEmMs === null) continue
    if (enviadoEmMs >= janela.inicioMs && enviadoEmMs <= janela.fimContextoMs) {
      ids.push(m.id)
    }
  }
  return new Set(ids)
}

/**
 * Uma mensagem pertence ao contexto do ticket se já estiver vinculada a ele
 * (`ticket_id` bate, qualquer remetente, qualquer horário — cobre a resposta
 * tardia do bot-nexus que só chegou depois da tolerância) ou se for uma das
 * órfãs do Nexus reclassificadas por `selecionarIdsContextoNexusOrfao`.
 */
export function pertenceAoContextoDoTicket(
  mensagem: Pick<MensagemNexusContexto, 'id' | 'ticket_id'>,
  ticketId: string,
  idsContextoNexusOrfao: ReadonlySet<string>,
): boolean {
  return mensagem.ticket_id === ticketId || idsContextoNexusOrfao.has(mensagem.id)
}

/**
 * Primeira mensagem do ticket que não é do Nexus — é nela que o separador
 * "Início do Ticket" e a rolagem inicial devem ancorar. Uma resposta tardia
 * do bot-nexus já vinculada ao ticket continua dentro do bloco "Conversa com
 * Nexus" e nunca vira essa âncora, pois é filtrada por `ehMensagemNexus`.
 *
 * Retorna undefined quando o ticket ainda não tem mensagem humana — quem
 * chama não deve renderizar separador nesse caso e mantém o fallback de
 * rolagem para o fim da conversa.
 */
export function selecionarInicioHumanoDoTicket<T extends MensagemNexusContexto>(
  mensagensOrdenadas: readonly T[],
  ticketId: string,
): string | undefined {
  return mensagensOrdenadas.find((m) => m.ticket_id === ticketId && !ehMensagemNexus(m))?.id
}
