export type TipoOrigemRoteamento = 'setor' | 'pdv' | 'fluxo' | 'desconhecida'
export type TipoMovimentoRoteamento = 'transferencia' | 'transbordo'

export interface EntradaRoteamento {
  id: string
  ticketId?: string | null
  setorOrigemId?: string | null
  setorDestinoId?: string | null
  ocorridoEm?: string | null
  pdv?: string | null
  canal?: string | null
  tipoMovimento?: TipoMovimentoRoteamento | null
}

export interface LogRoteamento {
  ticketId: string
  tipo?: string | null
  descricao?: string | null
  criadoEm?: string | null
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
  taxa: number
  transferencias: number
  transbordos: number
  semClassificacao: number
  diasComOcorrencia: number
  maiorPicoDiario: number
}

export interface ResumoOrigensRoteamento {
  totalEntradas: number
  transferencias: number
  transbordos: number
  semClassificacao: number
  origens: OrigemRoteamento[]
  maiorIndice: OrigemRoteamento | null
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

  // Se os dois nomes existem no lookup, exigir que a rota escrita pelo log
  // corresponda ao evento evita classificar uma troca só de subsetor.
  if (origem && destino && !rotaConfere) return null

  return { tipoMovimento, diferencaMs, rotaConfere }
}

/**
 * Acrescenta a classificação do log ao evento estruturado quando há evidência
 * do mesmo ticket, da mesma rota e de um instante próximo. O log só pode
 * classificar um evento para evitar duplicidade em transferências consecutivas.
 */
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

    const correspondencia = logs
      .map((log, indiceLog) => ({
        indiceLog,
        resultado: logsUsados.has(indiceLog)
          ? null
          : pontuarCorrespondencia(entrada, log, nomesDosSetores),
      }))
      .filter((candidato): candidato is {
        indiceLog: number
        resultado: { tipoMovimento: TipoMovimentoRoteamento; diferencaMs: number; rotaConfere: boolean }
      } => candidato.resultado !== null)
      .sort((primeira, segunda) => (
        Number(segunda.resultado.rotaConfere) - Number(primeira.resultado.rotaConfere)
        || primeira.resultado.diferencaMs - segunda.resultado.diferencaMs
      ))[0]

    if (!correspondencia) continue
    logsUsados.add(correspondencia.indiceLog)
    classificacoes.set(indice, correspondencia.resultado.tipoMovimento)
  }

  return entradas.map((entrada, indice) => ({
    ...entrada,
    tipoMovimento: classificacoes.get(indice) || entrada.tipoMovimento || null,
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

function calcularTaxa(quantidade: number, total: number) {
  if (total === 0) return 0
  return Math.round((quantidade / total) * 1000) / 10
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

  const totalEntradas = entradas.length
  const origens = [...acumuladores.values()]
    .map<OrigemRoteamento>((origem) => ({
      id: origem.id,
      nome: origem.nome,
      tipo: origem.tipo,
      fluxo: origem.fluxo,
      quantidade: origem.quantidade,
      taxa: calcularTaxa(origem.quantidade, totalEntradas),
      transferencias: origem.transferencias,
      transbordos: origem.transbordos,
      semClassificacao: origem.semClassificacao,
      diasComOcorrencia: origem.ocorrenciasPorDia.size,
      maiorPicoDiario: Math.max(0, ...origem.ocorrenciasPorDia.values()),
    }))
    .sort((primeira, segunda) => (
      segunda.quantidade - primeira.quantidade
      || segunda.diasComOcorrencia - primeira.diasComOcorrencia
      || primeira.nome.localeCompare(segunda.nome, 'pt-BR')
    ))

  return {
    totalEntradas,
    transferencias: origens.reduce((total, origem) => total + origem.transferencias, 0),
    transbordos: origens.reduce((total, origem) => total + origem.transbordos, 0),
    semClassificacao: origens.reduce((total, origem) => total + origem.semClassificacao, 0),
    origens,
    maiorIndice: origens[0] || null,
  }
}
