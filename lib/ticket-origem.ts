/**
 * Deriva a "origem" de um ticket — como ele chegou ao setor atual.
 *
 * Categorias:
 *   - 'direto'        → ticket criado direto pelo cliente, sem transbordo
 *   - 'disparo'       → atendente iniciou (ticket.is_disparo === true)
 *   - 'transbordo'    → veio por transbordo automático (cron moveu setor)
 *   - 'transferencia' → transferência manual entre setores
 *
 * O `detalhes` é uma lista de eventos relevantes em ordem cronológica
 * (criação, transbordos, transferências) pra exibir no tooltip.
 */

export type OrigemTipo = 'direto' | 'disparo' | 'transbordo' | 'transferencia'

export interface OrigemTicket {
  tipo: OrigemTipo
  label: string
  /** Setor de origem (se transbordo/transferência), extraído da descrição do PRIMEIRO transbordo */
  setorOrigem?: string
  /** Quem fez a transferência manual (se aplicável) */
  transferidoPor?: string
  /** Eventos ordenados cronologicamente pra tooltip */
  eventos: Array<{
    quando: string
    descricao: string
  }>
  /** Quantos hops de transbordo o ticket fez (se houve) */
  hops: number
}

// Regex pra extrair "X → Y" das descrições novas de transbordo
// Ex: "Transbordo: Juazeiro do Norte PEV → ServiceDesk Matriz (hop 1/3, ...)"
const TRANSBORDO_DESCRICAO_REGEX = /Transbordo:\s*([^→]+?)\s*→\s*([^(]+?)(?:\s*\(|$)/

// Regex pra extrair "Transferido por NOME: ORIGEM → DESTINO"
const TRANSFERENCIA_DESCRICAO_REGEX = /Transferido por\s+(.+?):\s*([^→]+?)\s*→\s*([^(]+?)(?:\s*\(|$)/

export interface TicketLogLike {
  ticket_id: string
  tipo: string
  descricao: string | null
  criado_em: string
}

export interface TicketLike {
  id: string
  setor_id?: string | null
  is_disparo?: boolean | null
  transbordo_hops?: number | null
  criado_em?: string | null
}

/** Lookup de setores pra inferir nomes/origem em logs antigos */
export interface SetorLookupEntry {
  nome: string
  setor_receptor_id?: string | null
}

const LABELS: Record<OrigemTipo, string> = {
  direto: 'Direto',
  disparo: 'Disparo',
  transbordo: 'Transbordo',
  transferencia: 'Transferido',
}

/**
 * Mapeia um array de tickets + array de logs (em batch) pra origem.
 * Retorna Map keyed por ticket_id.
 *
 * `setoresLookup` (opcional) habilita "reescrita ao vivo" de logs antigos
 * que não têm origem/destino na descrição. Usa setor_receptor_id pra inferir
 * de onde veio o transbordo e formata como "Transbordo: X → Y (retroativo)".
 */
export function calcularOrigem(
  tickets: TicketLike[],
  logs: TicketLogLike[],
  setoresLookup?: Map<string, SetorLookupEntry>,
): Map<string, OrigemTicket> {
  // Agrupa logs por ticket_id
  const porTicket = new Map<string, TicketLogLike[]>()
  for (const log of logs) {
    const arr = porTicket.get(log.ticket_id) || []
    arr.push(log)
    porTicket.set(log.ticket_id, arr)
  }
  for (const arr of porTicket.values()) {
    arr.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  }

  const resultado = new Map<string, OrigemTicket>()
  for (const t of tickets) {
    const logsTicket = porTicket.get(t.id) || []
    resultado.set(t.id, derivaOrigemUm(t, logsTicket, setoresLookup))
  }
  return resultado
}

/**
 * Pra logs antigos de transbordo (sem o prefixo "Transbordo: X → Y"),
 * tenta inferir origem ÚNICA usando o lookup de setores. Retorna a descrição
 * reescrita quando há apenas UM setor candidato (setor_receptor_id apontando
 * para o destino). Quando é ambíguo (vários candidatos) ou impossível, devolve
 * a descrição original — melhor não inferir do que mostrar dado ruim.
 */
function reescreveDescricaoAntiga(
  log: TicketLogLike,
  ticket: TicketLike,
  lookup: Map<string, SetorLookupEntry>,
): string {
  const destinoId = ticket.setor_id
  if (!destinoId) return log.descricao || ''
  const destinoNome = lookup.get(destinoId)?.nome
  if (!destinoNome) return log.descricao || ''

  // Origem candidata: setor cujo setor_receptor_id aponta pro destino atual.
  // Só reescrevemos se houver EXATAMENTE 1 candidato — senão a inferência
  // vira lista enorme e não ajuda.
  const possiveis: string[] = []
  for (const [id, entry] of lookup) {
    if (entry.setor_receptor_id === destinoId && id !== destinoId) {
      possiveis.push(entry.nome)
      if (possiveis.length > 1) break // já é ambíguo, não precisa continuar
    }
  }
  if (possiveis.length !== 1) {
    // Ambíguo ou sem origem conhecida — mantém texto original
    return log.descricao || ''
  }

  // Preserva contexto entre parênteses do log original (hop, redistribuição, etc)
  const ctx = log.descricao?.match(/\(([^)]+)\)/)?.[0] || ''
  return `Transbordo: ${possiveis[0]} → ${destinoNome} ${ctx} (retroativo)`.trim()
}

function derivaOrigemUm(
  ticket: TicketLike,
  logs: TicketLogLike[],
  setoresLookup?: Map<string, SetorLookupEntry>,
): OrigemTicket {
  // Aplica reescrita de logs antigos (mantém logs originais imutáveis).
  // logsReescritos tem mesma estrutura mas com descricao formatada/enriquecida.
  const logsReescritos: TicketLogLike[] = logs.map((l) => {
    if (
      setoresLookup
      && l.tipo === 'transferencia_automatica'
      && !(l.descricao || '').startsWith('Transbordo:')
    ) {
      return { ...l, descricao: reescreveDescricaoAntiga(l, ticket, setoresLookup) }
    }
    return l
  })

  // Eventos = entrada sintética de criação + logs filtrados (transbordos,
  // transferências, etc), todos em ordem cronológica.
  const eventos: Array<{ quando: string; descricao: string }> = []
  if (ticket.criado_em) {
    eventos.push({
      quando: ticket.criado_em,
      descricao: 'Ticket criado',
    })
  }
  for (const l of logsReescritos) {
    if (l.tipo === 'encerramento' || l.tipo === 'reabertura') continue
    // Evita duplicar a criação se já houver log explícito
    if (l.tipo === 'criacao' && eventos.some(e => e.descricao === 'Ticket criado')) continue
    eventos.push({ quando: l.criado_em, descricao: descricaoCurta(l) })
  }
  eventos.sort((a, b) => a.quando.localeCompare(b.quando))

  const teveTransbordo = logsReescritos.some((l) => l.tipo === 'transferencia_automatica')
  const teveTransferenciaManual = logsReescritos.some((l) => l.tipo === 'transferencia')

  let tipo: OrigemTipo
  if (ticket.is_disparo) {
    tipo = 'disparo'
  } else if (teveTransferenciaManual) {
    tipo = 'transferencia'
  } else if (teveTransbordo) {
    tipo = 'transbordo'
  } else {
    tipo = 'direto'
  }

  // Extrai setor de origem e/ou quem transferiu do PRIMEIRO log (cronológico).
  // Funciona pros logs no formato novo "Transbordo: A → B". Logs antigos sem
  // esse prefixo já foram reescritos (em memória) por logsReescritos via
  // reescreveDescricaoAntiga acima, então o regex também pega esses casos.
  let setorOrigem: string | undefined
  let transferidoPor: string | undefined

  if (tipo === 'transbordo') {
    const primeiroLog = logsReescritos.find((l) => l.tipo === 'transferencia_automatica')
    if (primeiroLog?.descricao) {
      const match = primeiroLog.descricao.match(TRANSBORDO_DESCRICAO_REGEX)
      if (match?.[1]) setorOrigem = compactarListaSetores(match[1].trim())
    }
  } else if (tipo === 'transferencia') {
    const primeiroLog = logsReescritos.find((l) => l.tipo === 'transferencia')
    if (primeiroLog?.descricao) {
      const match = primeiroLog.descricao.match(TRANSFERENCIA_DESCRICAO_REGEX)
      if (match) {
        transferidoPor = match[1]?.trim()
        setorOrigem = compactarListaSetores(match[2]?.trim() || '')
      }
    }
  }

  return {
    tipo,
    label: LABELS[tipo],
    setorOrigem,
    transferidoPor,
    eventos,
    hops: ticket.transbordo_hops ?? 0,
  }
}

/**
 * Compacta uma lista "A ou B ou C ou D" pra "A ou B (+2)" quando há mais
 * de 2 candidatos. A descrição original (com todos os setores) continua
 * visível no popover via os eventos do log — aqui só limpa o label da badge.
 */
function compactarListaSetores(s: string): string {
  if (!s.includes(' ou ')) return s
  const partes = s.split(' ou ').map(p => p.trim()).filter(Boolean)
  if (partes.length <= 2) return s
  return `${partes[0]} ou ${partes[1]} (+${partes.length - 2})`
}

function descricaoCurta(log: TicketLogLike): string {
  switch (log.tipo) {
    case 'criacao':
      return log.descricao || 'Ticket criado'
    case 'transferencia':
      return log.descricao || 'Transferência manual'
    case 'transferencia_automatica':
      return log.descricao || 'Transbordo automático'
    case 'transbordo_limite_atingido':
      return log.descricao || 'Limite de transbordo atingido'
    case 'pull_manual':
      return log.descricao || 'Puxado da fila'
    default:
      return log.descricao || log.tipo
  }
}

/** Classes Tailwind por tipo, pra estilizar o badge */
export function badgeClassesPorTipo(tipo: OrigemTipo): string {
  switch (tipo) {
    case 'direto':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300'
    case 'disparo':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    case 'transbordo':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    case 'transferencia':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
  }
}
