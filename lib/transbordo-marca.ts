// Marca de transbordo entre SUBSETORES — caso #97066.
//
// O ticket do Prime sem técnico disponível é entregue a um atendente do Suporte.
// Até aqui, tudo certo: é melhor alguém atender do que ninguém. O problema é o
// que vinha depois — o atendente do Suporte abria, via que era cliente Prime e
// devolvia para a fila do Prime, que continuava vazia e transbordava de novo. O
// ticket ia e voltava, e só o cliente pagava a conta.
//
// A informação de que houve transbordo existia apenas em tempo de execução:
// `escolherDestino` devolve `origem: 'transbordo'` e o resultado ia para o
// console. Este módulo é o que estampa isso no ticket e o que decide se uma
// transferência é a devolução reflexa ou um roteamento legítimo.
//
// A primeira versão da regra liberava a devolução assim que o atendente
// respondesse ao cliente. Não bastou: o ticket voltava para a mesma fila vazia,
// só que uma resposta depois. Hoje a devolução para a FILA de origem não tem
// prazo — ela precisa de supervisor do setor ou de master. Todo o resto
// (atendente nomeado daquele subsetor, outra fila, outro setor) segue livre.
//
// TOLERÂNCIA A COLUNA AUSENTE — requisito, não zelo: o banco é compartilhado
// entre produção e desenvolvimento e a migration é aplicada à mão no Supabase
// Studio, então existe uma janela em que o código roda sem as colunas. Toda
// leitura devolve "sem marca" e toda escrita devolve `false` quando o PostgREST
// recusa a consulta. Sem marca, o comportamento é exatamente o de hoje.

export interface MarcaTransbordo {
  /** ISO do instante em que o ticket foi atribuído por transbordo. */
  recebidoEm: string | null
  /** Subsetor que estava sem atendente e cedeu o ticket. */
  subsetorOrigemId: string | null
  /** Quantas vezes este ticket já foi socorrido por outro subsetor. */
  hops: number
}

export const SEM_MARCA_TRANSBORDO: MarcaTransbordo = Object.freeze({
  recebidoEm: null,
  subsetorOrigemId: null,
  hops: 0,
})

/**
 * As colunas ficam isoladas nesta constante porque NÃO podem ser adicionadas aos
 * `select` que já existem: enquanto a migration não for aplicada, qualquer
 * consulta que as cite é recusada inteira. Aqui elas são lidas à parte, e a
 * falha custa só a marca.
 */
export const COLUNAS_MARCA_TRANSBORDO =
  'transbordo_recebido_em, transbordo_subsetor_origem_id, transbordo_subsetor_hops'

/** Origem da atribuição, como `escolherDestino` a devolve. */
export type OrigemAtribuicao = 'proprio' | 'transbordo' | 'ninguem'

export interface DestinoTransferencia {
  subsetorId: string | null
  /** `null` = volta para a fila. Um id = entrega direta a um atendente. */
  colaboradorId: string | null
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null
}

/** Lê a marca de uma linha de `tickets`. Linha sem as colunas vira "sem marca". */
export function lerMarcaTransbordo(linha: unknown): MarcaTransbordo {
  if (!linha || typeof linha !== 'object') return SEM_MARCA_TRANSBORDO

  const registro = linha as Record<string, unknown>
  const hops = Number(registro.transbordo_subsetor_hops)

  return {
    recebidoEm: texto(registro.transbordo_recebido_em),
    subsetorOrigemId: texto(registro.transbordo_subsetor_origem_id),
    hops: Number.isFinite(hops) && hops > 0 ? Math.trunc(hops) : 0,
  }
}

/** A marca só vale com as duas pontas: quando aconteceu e de qual fila veio. */
export function isRecebidoPorTransbordo(marca: MarcaTransbordo | null | undefined): boolean {
  return Boolean(marca?.recebidoEm && marca.subsetorOrigemId)
}

/**
 * O destino é a devolução reflexa — a fila que acabou de ceder o ticket?
 *
 * Só a FILA do subsetor de origem conta. Entregar a um atendente nomeado daquele
 * subsetor é o contrário do problema: o ticket ganha dono e sai do ciclo. E
 * qualquer outro destino continua livre — o bloqueio existe contra a devolução,
 * não contra transferir.
 */
export function isDevolucaoParaOrigem(
  marca: MarcaTransbordo | null | undefined,
  destino: DestinoTransferencia,
): boolean {
  if (!isRecebidoPorTransbordo(marca)) return false
  if (destino.colaboradorId) return false
  return Boolean(destino.subsetorId) && destino.subsetorId === marca!.subsetorOrigemId
}

/**
 * Decisão final do bloqueio.
 *
 * `podeAutorizarDevolucao` é a única saída: supervisor do setor ou master. A
 * primeira versão desta regra liberava sozinha assim que o atendente respondesse
 * ao cliente, e na prática isso só adiava o repique — o ticket voltava para a
 * mesma fila vazia, uma resposta mais tarde. Quem decide que a devolução vale a
 * pena é quem enxerga as duas filas.
 *
 * O parâmetro é booleano de propósito: quem sabe se o ator é supervisor é a
 * rota (ou a tela), com o setor do ticket em mão. Ver `hasSupervisorScope` em
 * `lib/transfer-authorization.ts`.
 */
export function bloquearDevolucao(
  marca: MarcaTransbordo | null | undefined,
  destino: DestinoTransferencia,
  podeAutorizarDevolucao: boolean,
): boolean {
  return isDevolucaoParaOrigem(marca, destino) && !podeAutorizarDevolucao
}

/**
 * O que a atribuição faz com a marca. Só o transbordo marca; o próprio subsetor
 * limpa, porque um ticket que já rodou o ciclo pode voltar para a fila com marca
 * velha e não pode carregar o aviso (nem o bloqueio) para o dono seguinte.
 *
 * Ticket sem subsetor não tem fila de origem para devolver — nada a marcar.
 */
export function efeitoDaAtribuicao(
  origem: OrigemAtribuicao,
  subsetorDoTicket: string | null | undefined,
): 'marcar' | 'limpar' {
  return origem === 'transbordo' && subsetorDoTicket ? 'marcar' : 'limpar'
}

/** O que a tela precisa saber do ticket para montar o aviso de transbordo. */
export interface TicketComMarcaTransbordo {
  subsetor_id?: string | null
  transbordo_recebido_em?: string | null
  transbordo_subsetor_origem_id?: string | null
  transbordo_subsetor_hops?: number | null
  subsetores?: { nome?: string | null } | null
}

export interface AvisoTransbordo {
  subsetorOrigemId: string
  /** `null` quando o subsetor não está na lista carregada — o aviso continua, sem o nome. */
  nomeOrigem: string | null
  /** Quantas vezes o ticket já foi socorrido. 1 na primeira. */
  vezes: number
}

/**
 * Monta o aviso "recebido por transbordo" a partir do que a tela já tem em mão:
 * o ticket e a lista de subsetores do setor. Devolve `null` quando não há marca
 * — inclusive antes da migration, quando as colunas simplesmente não vêm no
 * `select('*')`.
 *
 * O aviso descreve o transbordo e nada além disso: quem pode devolver para a
 * fila de origem é decisão de permissão, e sai de `hasSupervisorScope` na tela
 * que sabe quem está olhando.
 *
 * O nome da fila de origem é procurado na lista de subsetores; o embed do
 * próprio ticket é a segunda opção, e vale porque o transbordo não muda o
 * subsetor do ticket — ele continua sendo o do Prime, só que atendido por
 * alguém do Suporte.
 */
export function descreverTransbordoRecebido(
  ticket: TicketComMarcaTransbordo | null | undefined,
  subsetores: readonly { id: string; nome: string }[] | null | undefined,
): AvisoTransbordo | null {
  const recebidoEm = ticket?.transbordo_recebido_em
  const subsetorOrigemId = ticket?.transbordo_subsetor_origem_id
  if (!recebidoEm || !subsetorOrigemId) return null

  const nomeDaLista = (subsetores || []).find((s) => s.id === subsetorOrigemId)?.nome
  const nomeDoTicket = ticket?.subsetor_id === subsetorOrigemId ? ticket?.subsetores?.nome : null

  return {
    subsetorOrigemId,
    nomeOrigem: nomeDaLista || nomeDoTicket || null,
    vezes: ticket?.transbordo_subsetor_hops || 1,
  }
}

function avisar(acao: string, ticketId: string, erro: { message?: string } | null): void {
  console.warn(`[transbordo] não foi possível ${acao}`, {
    ticketId,
    erro: erro?.message || 'erro desconhecido',
    dica: 'aplique 20260812120000_ticket_transbordo_subsetor.sql no Supabase Studio',
  })
}

/** Lê a marca do ticket. Antes da migration devolve "sem marca". */
export async function carregarMarcaTransbordo(
  supabase: any,
  ticketId: string,
): Promise<MarcaTransbordo> {
  const { data, error } = await supabase
    .from('tickets')
    .select(COLUNAS_MARCA_TRANSBORDO)
    .eq('id', ticketId)
    .maybeSingle()

  if (error) {
    avisar('ler a marca de transbordo', ticketId, error)
    return SEM_MARCA_TRANSBORDO
  }
  return lerMarcaTransbordo(data)
}

/**
 * Estampa o transbordo no ticket. Chamado DEPOIS do sucesso da RPC atômica de
 * atribuição — a garantia contra corrida é dela, e perder a marca não pode
 * custar o atendimento.
 */
export async function marcarTransbordoRecebido(
  supabase: any,
  ticketId: string,
  subsetorOrigemId: string | null | undefined,
  agoraISO: string = new Date().toISOString(),
): Promise<boolean> {
  if (!subsetorOrigemId) return false

  const marcaAtual = await carregarMarcaTransbordo(supabase, ticketId)
  const { data, error } = await supabase
    .from('tickets')
    .update({
      transbordo_recebido_em: agoraISO,
      transbordo_subsetor_origem_id: subsetorOrigemId,
      // Contador de vida inteira: mede cobertura crônica do subsetor, então
      // nunca é zerado — nem quando a marca é limpa.
      transbordo_subsetor_hops: marcaAtual.hops + 1,
    })
    .eq('id', ticketId)
    .select('id')
    .maybeSingle()

  if (error) {
    avisar('marcar o transbordo no ticket', ticketId, error)
    return false
  }
  return Boolean(data)
}

/**
 * Apaga a marca — o ticket mudou de dono ou de fila e o aviso perdeu o assunto.
 * O filtro `transbordo_recebido_em is not null` faz o banco decidir se há o que
 * escrever: na atribuição comum, nenhuma linha é tocada.
 */
export async function limparMarcaTransbordo(
  supabase: any,
  ticketId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tickets')
    .update({
      transbordo_recebido_em: null,
      transbordo_subsetor_origem_id: null,
    })
    .eq('id', ticketId)
    .not('transbordo_recebido_em', 'is', null)
    .select('id')
    .maybeSingle()

  if (error) {
    avisar('limpar a marca de transbordo', ticketId, error)
    return false
  }
  return Boolean(data)
}

/** Aplica na atribuição o efeito de {@link efeitoDaAtribuicao}. */
export async function registrarOrigemDaAtribuicao(
  supabase: any,
  ticketId: string,
  origem: OrigemAtribuicao,
  subsetorDoTicket: string | null | undefined,
): Promise<boolean> {
  return efeitoDaAtribuicao(origem, subsetorDoTicket) === 'marcar'
    ? marcarTransbordoRecebido(supabase, ticketId, subsetorDoTicket)
    : limparMarcaTransbordo(supabase, ticketId)
}
