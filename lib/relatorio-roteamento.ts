export type TipoOrigemRoteamento = 'setor' | 'pdv' | 'fluxo' | 'desconhecida'
export type TipoMovimentoRoteamento = 'transferencia' | 'transbordo'
export type FonteEntradaRoteamento = 'assignment_log' | 'ticket_log_legado'

export interface EntradaRoteamento {
  id: string
  ticketId?: string | null
  setorOrigemId?: string | null
  setorDestinoId?: string | null
  origemNome?: string | null
  ocorridoEm?: string | null
  pdv?: string | null
  canal?: string | null
  colaboradorId?: string | null
  subsetorId?: string | null
  tipoMovimento?: TipoMovimentoRoteamento | null
  fonte?: FonteEntradaRoteamento
}

export interface LogRoteamento {
  id?: string | null
  ticketId: string
  tipo?: string | null
  descricao?: string | null
  criadoEm?: string | null
  pdv?: string | null
  canal?: string | null
  colaboradorId?: string | null
  subsetorId?: string | null
}

export interface SetorRoteamento {
  id: string
  nome?: string | null
}

export interface OrigemRoteamento {
  id: string
  nome: string
  tipo: TipoOrigemRoteamento
  fluxo: string | null
  quantidade: number
  movimentosClassificados: number
  taxaTransbordo: number
  transferencias: number
  transbordos: number
  semClassificacao: number
  diasComOcorrencia: number
  maiorPicoDiario: number
}

export interface ResumoOrigensRoteamento {
  totalEntradas: number
  movimentosClassificados: number
  entradasLegadas: number
  transferencias: number
  transbordos: number
  semClassificacao: number
  origens: OrigemRoteamento[]
  maiorTaxaTransbordo: OrigemRoteamento | null
}

interface AcumuladorOrigem {
  id: string
  nome: string
  tipo: TipoOrigemRoteamento
  fluxo: string | null
  quantidade: number
  transferencias: number
  transbordos: number
  semClassificacao: number
  ocorrenciasPorDia: Map<string, number>
}

interface CorrespondenciaLog {
  indiceLog: number
  resultado: {
    tipoMovimento: TipoMovimentoRoteamento
    diferencaMs: number
    rotaConfere: boolean
  }
}

const JANELA_CORRELACAO_LOG_MS = 5 * 60 * 1000

function normalizarTexto(value: string | null | undefined) {
  const text = value?.trim()
  return text || null
}

function normalizarParaComparacao(value: string | null | undefined) {
  return normalizarTexto(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    || null
}

function obterDia(ocorridoEm: string | null | undefined) {
  if (!ocorridoEm || !Number.isFinite(Date.parse(ocorridoEm))) return null
  return new Date(ocorridoEm).toISOString().slice(0, 10)
}

function criarMapaDeNomesDosSetores(setores: readonly SetorRoteamento[]) {
  return new Map(
    setores.flatMap((setor) => {
      const nome = normalizarTexto(setor.nome)
      return nome ? [[setor.id, nome] as const] : []
    }),
  )
}

function criarMapaDeIdsDosSetoresPorNome(setores: readonly SetorRoteamento[]) {
  return new Map(
    setores.flatMap((setor) => {
      const nome = normalizarParaComparacao(setor.nome)
      return nome ? [[nome, setor.id] as const] : []
    }),
  )
}

function tipoDoMovimentoDoLog(tipo: string | null | undefined): TipoMovimentoRoteamento | null {
  if (tipo === 'transferencia') return 'transferencia'
  if (tipo === 'transferencia_automatica') return 'transbordo'
  return null
}

function pontuarCorrespondencia(
  entrada: EntradaRoteamento,
  log: LogRoteamento,
  nomesDosSetores: Map<string, string>,
) {
  const tipoMovimento = tipoDoMovimentoDoLog(log.tipo)
  if (!tipoMovimento || !entrada.ticketId || entrada.ticketId !== log.ticketId) return null

  const instanteEntrada = Date.parse(entrada.ocorridoEm || '')
  const instanteLog = Date.parse(log.criadoEm || '')
  if (!Number.isFinite(instanteEntrada) || !Number.isFinite(instanteLog)) return null

  const diferencaMs = Math.abs(instanteEntrada - instanteLog)
  if (diferencaMs > JANELA_CORRELACAO_LOG_MS) return null

  const origem = entrada.setorOrigemId ? nomesDosSetores.get(entrada.setorOrigemId) || null : null
  const destino = entrada.setorDestinoId ? nomesDosSetores.get(entrada.setorDestinoId) || null : null
  const descricao = normalizarParaComparacao(log.descricao)
  const rotaConfere = Boolean(
    descricao
    && origem
    && destino
    && descricao.includes(normalizarParaComparacao(origem) || '')
    && descricao.includes(normalizarParaComparacao(destino) || ''),
  )

  if (origem && destino && !rotaConfere) return null

  return { tipoMovimento, diferencaMs, rotaConfere }
}

function encontrarMelhorCorrespondencia(
  entrada: EntradaRoteamento,
  logs: readonly LogRoteamento[],
  nomesDosSetores: Map<string, string>,
  logsUsados: ReadonlySet<number>,
): CorrespondenciaLog | null {
  let melhor: CorrespondenciaLog | null = null

  for (const [indiceLog, log] of logs.entries()) {
    if (logsUsados.has(indiceLog)) continue
    const resultado = pontuarCorrespondencia(entrada, log, nomesDosSetores)
    if (!resultado) continue
    if (
      !melhor
      || Number(resultado.rotaConfere) > Number(melhor.resultado.rotaConfere)
      || (
        resultado.rotaConfere === melhor.resultado.rotaConfere
        && resultado.diferencaMs < melhor.resultado.diferencaMs
      )
    ) {
      melhor = { indiceLog, resultado }
    }
  }

  return melhor
}

function extrairRotaDoLog(descricao: string | null | undefined) {
  const texto = normalizarTexto(descricao)
  if (!texto) return null

  const separador = texto.includes('→') ? '→' : texto.includes('->') ? '->' : null
  if (!separador) return null

  const indiceSeparador = texto.indexOf(separador)
  const antes = texto.slice(0, indiceSeparador)
  const depois = texto.slice(indiceSeparador + separador.length)
  const origem = normalizarTexto(antes.slice(antes.lastIndexOf(':') + 1))
  const destino = normalizarTexto(depois.replace(/\s*\(.*/, ''))
  return origem && destino ? { origem, destino } : null
}

export function reconstruirEntradasDeRoteamento(
  entradas: readonly EntradaRoteamento[],
  logs: readonly LogRoteamento[],
  setores: readonly SetorRoteamento[],
  setorDestinoId: string,
): EntradaRoteamento[] {
  const nomesDosSetores = criarMapaDeNomesDosSetores(setores)
  const idsDosSetoresPorNome = criarMapaDeIdsDosSetoresPorNome(setores)
  const logsUsados = new Set<number>()
  const estruturadas = entradas.filter((entrada) => (
    Boolean(entrada.setorOrigemId)
    && entrada.setorDestinoId === setorDestinoId
    && entrada.setorOrigemId !== setorDestinoId
  ))

  for (const entrada of estruturadas) {
    const correspondencia = encontrarMelhorCorrespondencia(entrada, logs, nomesDosSetores, logsUsados)
    if (correspondencia) logsUsados.add(correspondencia.indiceLog)
  }

  const legadas = logs.flatMap((log, indiceLog) => {
    if (logsUsados.has(indiceLog)) return []
    const tipoMovimento = tipoDoMovimentoDoLog(log.tipo)
    const rota = extrairRotaDoLog(log.descricao)
    if (!tipoMovimento || !rota) return []

    const setorOrigemId = idsDosSetoresPorNome.get(normalizarParaComparacao(rota.origem) || '') || null
    const destinoId = idsDosSetoresPorNome.get(normalizarParaComparacao(rota.destino) || '') || null
    if (destinoId !== setorDestinoId || setorOrigemId === setorDestinoId) return []

    return [{
      id: `ticket-log:${log.id || `${log.ticketId}:${log.criadoEm || indiceLog}`}`,
      ticketId: log.ticketId,
      setorOrigemId,
      setorDestinoId,
      origemNome: rota.origem,
      ocorridoEm: log.criadoEm,
      pdv: log.pdv,
      canal: log.canal,
      colaboradorId: log.colaboradorId,
      subsetorId: log.subsetorId,
      tipoMovimento,
      fonte: 'ticket_log_legado' as const,
    }]
  })

  return [...estruturadas, ...legadas]
}

export function classificarEntradasDeRoteamento(
  entradas: readonly EntradaRoteamento[],
  logs: readonly LogRoteamento[],
  setores: readonly SetorRoteamento[],
): EntradaRoteamento[] {
  const nomesDosSetores = criarMapaDeNomesDosSetores(setores)
  const logsUsados = new Set<number>()
  const classificacoes = new Map<number, TipoMovimentoRoteamento>()
  const entradasOrdenadas = entradas
    .map((entrada, indice) => ({ entrada, indice }))
    .sort((primeira, segunda) => (
      Date.parse(primeira.entrada.ocorridoEm || '') - Date.parse(segunda.entrada.ocorridoEm || '')
    ))

  for (const { entrada, indice } of entradasOrdenadas) {
    if (entrada.tipoMovimento) {
      classificacoes.set(indice, entrada.tipoMovimento)
      continue
    }

    const correspondencia = encontrarMelhorCorrespondencia(entrada, logs, nomesDosSetores, logsUsados)
    if (!correspondencia) continue
    logsUsados.add(correspondencia.indiceLog)
    classificacoes.set(indice, correspondencia.resultado.tipoMovimento)
  }

  return entradas.map((entrada, indice) => ({
    ...entrada,
    tipoMovimento: classificacoes.get(indice) || entrada.tipoMovimento || null,
  }))
}

export function filtrarEntradasDeRoteamentoPorFiltroDeTicket(
  entradas: readonly EntradaRoteamento[],
  correspondeAoFiltro: (ticket: { colaborador_id: string | null; subsetor_id: string | null }) => boolean,
): EntradaRoteamento[] {
  return entradas.filter((entrada) => correspondeAoFiltro({
    colaborador_id: entrada.colaboradorId || null,
    subsetor_id: entrada.subsetorId || null,
  }))
}

function obterIdentidadeDaOrigem(
  entrada: EntradaRoteamento,
  nomesDosSetores: Map<string, string>,
) {
  const setorOrigem = entrada.setorOrigemId
    ? nomesDosSetores.get(entrada.setorOrigemId) || null
    : null
  if (setorOrigem) {
    return { id: `setor:${entrada.setorOrigemId}`, nome: setorOrigem, tipo: 'setor' as const }
  }

  const origemNome = normalizarTexto(entrada.origemNome)
  if (origemNome) {
    return {
      id: `setor-legado:${normalizarParaComparacao(origemNome)}`,
      nome: origemNome,
      tipo: 'setor' as const,
    }
  }

  const pdv = normalizarTexto(entrada.pdv)
  if (pdv) return { id: `pdv:${pdv.toLocaleLowerCase('pt-BR')}`, nome: `PDV ${pdv}`, tipo: 'pdv' as const }

  const canal = normalizarTexto(entrada.canal)
  if (canal) return { id: `fluxo:${canal.toLocaleLowerCase('pt-BR')}`, nome: `Fluxo ${canal}`, tipo: 'fluxo' as const }

  return { id: 'desconhecida', nome: 'Origem desconhecida', tipo: 'desconhecida' as const }
}

function obterFluxo(
  nomeDaOrigem: string,
  setorDestinoId: string | null | undefined,
  nomesDosSetores: Map<string, string>,
) {
  const destino = setorDestinoId ? nomesDosSetores.get(setorDestinoId) || null : null
  return destino ? `${nomeDaOrigem} → ${destino}` : null
}

function calcularTaxa(parte: number, total: number) {
  if (total === 0) return 0
  return Math.round((parte / total) * 1000) / 10
}

function compararOrigensPorTaxaDeTransbordo(primeira: OrigemRoteamento, segunda: OrigemRoteamento) {
  return (
    segunda.taxaTransbordo - primeira.taxaTransbordo
    || segunda.transbordos - primeira.transbordos
    || segunda.movimentosClassificados - primeira.movimentosClassificados
    || primeira.nome.localeCompare(segunda.nome, 'pt-BR')
  )
}

export function resumirOrigensDeRoteamento(
  entradas: readonly EntradaRoteamento[],
  setores: readonly SetorRoteamento[],
): ResumoOrigensRoteamento {
  const nomesDosSetores = criarMapaDeNomesDosSetores(setores)
  const acumuladores = new Map<string, AcumuladorOrigem>()

  for (const entrada of entradas) {
    const origem = obterIdentidadeDaOrigem(entrada, nomesDosSetores)
    const acumulador = acumuladores.get(origem.id) || {
      ...origem,
      fluxo: obterFluxo(origem.nome, entrada.setorDestinoId, nomesDosSetores),
      quantidade: 0,
      transferencias: 0,
      transbordos: 0,
      semClassificacao: 0,
      ocorrenciasPorDia: new Map<string, number>(),
    }
    acumulador.quantidade += 1
    if (entrada.tipoMovimento === 'transferencia') {
      acumulador.transferencias += 1
    } else if (entrada.tipoMovimento === 'transbordo') {
      acumulador.transbordos += 1
    } else {
      acumulador.semClassificacao += 1
    }

    const dia = obterDia(entrada.ocorridoEm)
    if (dia) {
      acumulador.ocorrenciasPorDia.set(dia, (acumulador.ocorrenciasPorDia.get(dia) || 0) + 1)
    }
    acumuladores.set(origem.id, acumulador)
  }

  const origens = [...acumuladores.values()]
    .map<OrigemRoteamento>((origem) => {
      const movimentosClassificados = origem.transferencias + origem.transbordos
      return {
        id: origem.id,
        nome: origem.nome,
        tipo: origem.tipo,
        fluxo: origem.fluxo,
        quantidade: origem.quantidade,
        movimentosClassificados,
        taxaTransbordo: calcularTaxa(origem.transbordos, movimentosClassificados),
        transferencias: origem.transferencias,
        transbordos: origem.transbordos,
        semClassificacao: origem.semClassificacao,
        diasComOcorrencia: origem.ocorrenciasPorDia.size,
        maiorPicoDiario: Math.max(0, ...origem.ocorrenciasPorDia.values()),
      }
    })
    .sort(compararOrigensPorTaxaDeTransbordo)

  return {
    totalEntradas: entradas.length,
    movimentosClassificados: origens.reduce((total, origem) => total + origem.movimentosClassificados, 0),
    entradasLegadas: entradas.filter((entrada) => entrada.fonte === 'ticket_log_legado').length,
    transferencias: origens.reduce((total, origem) => total + origem.transferencias, 0),
    transbordos: origens.reduce((total, origem) => total + origem.transbordos, 0),
    semClassificacao: origens.reduce((total, origem) => total + origem.semClassificacao, 0),
    origens,
    maiorTaxaTransbordo: origens.find((origem) => origem.transbordos > 0) || null,
  }
}
