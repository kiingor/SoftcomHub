'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { computePausaElapsedMs, formatPausaStatusLabel, isPausaEstourada } from '@/lib/pausa-status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  Building2,
  RefreshCw,
  Tag,
  Search,
  Clock,
  User,
  AlertCircle,
  Bot,
  MessageCircle,
  X,
  ArrowRightLeft,
  Megaphone,
  Loader2,
  History,
  Check,
  Layers,
  XCircle,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageMediaPreview } from '@/components/chat/message-media-preview'
import { toast } from 'sonner'
import { cn, isClientMessage, isBotMessage } from '@/lib/utils'
import { calcularOrigem, type SetorLookupEntry } from '@/lib/ticket-origem'
import { OrigemBadge } from '@/components/origem-badge'
import { TextoMensagem } from '@/components/chat/texto-mensagem'
import { MultiSelectFilter } from '@/components/monitoramento/multi-select-filter'
import {
  getLatestNexusSessionMessages,
  getNexusConversationScopeKey,
  NEXUS_NO_TICKET_IDLE_MS,
} from '@/lib/nexus-monitoring'
import { normalizeBrazilianPhone } from '@/lib/phone'
import { loadSafeNexusChannelConfiguration } from '@/lib/nexus-channel-client'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { isTransferTargetAvailable } from '@/lib/transfer-authorization'

const NEXUS_MESSAGE_LOOKBACK_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_MESSAGE_LOOKBACK_MINUTES || 60)
const NEXUS_CLIENT_REMETENTE = 'cliente-nexus'
const NEXUS_BOT_REMETENTE = 'bot-nexus'
const SEM_SUBSETOR_ID = 'sem_subsetor'
const NO_TRANSFER_SUBSETOR = '__sem_subsetor__'
const POSTGREST_IN_CHUNK_SIZE = 200

async function loadRowsByPages(createQuery: () => any, pageSize = 1000) {
  const rows: any[] = []

  for (let page = 0; ; page += 1) {
    const { data, error } = await createQuery().range(page * pageSize, page * pageSize + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }

  return rows
}

function chunkValues<T>(values: readonly T[], size = POSTGREST_IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function loadRowsByValues(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  filterColumn: string,
  values: readonly string[],
  configure?: (query: any) => any,
) {
  const valueChunks = chunkValues([...new Set(values)])
  const chunkRows = await Promise.all(valueChunks.map((valueChunk) => loadRowsByPages(() => {
    let query: any = supabase.from(table).select(columns).in(filterColumn, valueChunk)
    if (configure) query = configure(query)
    return query
  })))

  return chunkRows.flat()
}

function getPhoneLookupVariants(phone: string) {
  const trimmedPhone = phone.trim()
  const normalizedPhone = normalizeBrazilianPhone(trimmedPhone)
  if (!normalizedPhone) return trimmedPhone ? [trimmedPhone] : []

  const hasBrazilCountryCode = normalizedPhone.startsWith('55')
    && (normalizedPhone.length === 12 || normalizedPhone.length === 13)
  const nationalPhone = hasBrazilCountryCode ? normalizedPhone.slice(2) : normalizedPhone
  const variants = new Set([
    trimmedPhone,
    normalizedPhone,
    `+${normalizedPhone}`,
    nationalPhone,
  ])

  if (nationalPhone.length === 10 || nationalPhone.length === 11) {
    const areaCode = nationalPhone.slice(0, 2)
    const localNumber = nationalPhone.slice(2)
    const prefixLength = localNumber.length === 9 ? 5 : 4
    const formattedLocalNumber = `${localNumber.slice(0, prefixLength)}-${localNumber.slice(prefixLength)}`
    variants.add(`(${areaCode}) ${formattedLocalNumber}`)
    variants.add(`(${areaCode})${formattedLocalNumber}`)
    variants.add(`${areaCode} ${formattedLocalNumber}`)
    variants.add(`${areaCode}${formattedLocalNumber}`)
    variants.add(`+55 (${areaCode}) ${formattedLocalNumber}`)
    variants.add(`+55(${areaCode})${formattedLocalNumber}`)
    variants.add(`55 (${areaCode}) ${formattedLocalNumber}`)
    variants.add(`55${areaCode}${formattedLocalNumber}`)
  }

  return [...variants].filter(Boolean)
}

function formatMs(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// Duração curta e legível p/ as colunas da lista: "1h 30min", "30min", "2h", "0min".
function formatDuracaoCurta(ms: number) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `${h}h ${m}min`
  if (h > 0) return `${h}h`
  return `${m}min`
}

function formatDuration(startDate: string | null, endDate: string | Date | null) {
  if (!startDate) return '0min'
  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  return formatDuracaoCurta(diffMs)
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  // Remove country code 55 from the start
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('55') && num.length > 11) {
    num = num.slice(2)
  }
  // Format as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  if (num.length === 11) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  }
  if (num.length === 10) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  }
  return num
}

function formatRelativeTime(date: string | null) {
  if (!date) return 'sem horario'
  const diffMs = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}min`
}

type NexusConversation = {
  clienteKey: string
  clienteId: string | null
  contato: string
  telefone: string | null
  setorId: string
  setorNome: string
  lastMessageAt: string
  lastBotMessageAt: string
  lastRemetente: string
  messages: any[]
}

type TransferSubsetor = {
  id: string
  nome: string
  setor_id: string
}

type TransferAtendente = {
  id: string
  nome: string
  is_online: boolean
  ativo: boolean
  pausa_atual_id: string | null
  last_heartbeat: string | null
  subsetor_ids: string[]
}

type TransferTab = 'atendente' | 'setor'

export default function MonitoramentoPage() {
  const supabase = useMemo(() => createClient(), [])
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const setorIdsAcessiveis = setoresAcessiveis.map((s: any) => s.id)

  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [tagFiltroOpen, setTagFiltroOpen] = useState(false)

  // Extrair tags únicas dos setores acessíveis
  const tagsDisponiveis = useMemo(() => {
    const tagMap = new Map<string, { id: string; nome: string; cor: string }>()
    setoresAcessiveis.forEach((s: any) => {
      if (s.tags) {
        tagMap.set(s.tags.id, { id: s.tags.id, nome: s.tags.nome, cor: s.tags.cor })
      }
    })
    return Array.from(tagMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [setoresAcessiveis])

  // Setores filtrados por tag
  const setoresFiltradosPorTag = useMemo(() => {
    if (tagFilter.length === 0) return setoresAcessiveis
    return setoresAcessiveis.filter((s: any) => s.tags?.id && tagFilter.includes(s.tags.id))
  }, [setoresAcessiveis, tagFilter])

  const setorIdsFiltrados = useMemo(() => {
    return setoresFiltradosPorTag.map((s: any) => s.id)
  }, [setoresFiltradosPorTag])
  const [setorFilter, setSetorFilter] = useState<string[]>([])
  const [setorFiltroOpen, setSetorFiltroOpen] = useState(false)
  const [subsetorFilter, setSubsetorFilter] = useState<string[]>([])
  const [subsetorFiltroOpen, setSubsetorFiltroOpen] = useState(false)
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<{id: string, nome: string}[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string[]>([])
  const [filtrosAtendenteOpen, setFiltrosAtendenteOpen] = useState(false)
  const [filtroAtendenteSearch, setFiltroAtendenteSearch] = useState('')
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [searchAtendente, setSearchAtendente] = useState('')
  const [, setTick] = useState(0)

  // Mesmo critério usado pela distribuição e pela API de transferência:
  // ativo, online, sem pausa e com heartbeat recente.
  const isAtendenteOnline = useCallback((atendente: any): boolean => {
    return isTransferTargetAvailable(atendente)
  }, [])

  // Conversation panel state
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const [conversationMessages, setConversationMessages] = useState<any[]>([])
  const [ticketHistory, setTicketHistory] = useState<any[]>([])
  const [historyMessages, setHistoryMessages] = useState<Record<string, any[]>>({})
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [conversationTab, setConversationTab] = useState<'conversa' | 'historico'>('conversa')
  const [selectedNexusConversation, setSelectedNexusConversation] = useState<NexusConversation | null>(null)
  const nexusConversationScrollRef = useRef<HTMLDivElement>(null)

  // Transfer & finalize state
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferOptionsLoading, setTransferOptionsLoading] = useState(false)
  const [transferTab, setTransferTab] = useState<TransferTab>('atendente')
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<TransferAtendente[]>([])
  const [subsetoresTransfer, setSubsetoresTransfer] = useState<TransferSubsetor[]>([])
  const [setoresTransfer, setSetoresTransfer] = useState<any[]>([])
  const [selectedSetorTransfer, setSelectedSetorTransfer] = useState<string>('all')
  const [selectedSubsetorTransfer, setSelectedSubsetorTransfer] = useState<string>('')
  const [selectedAtendenteTransfer, setSelectedAtendenteTransfer] = useState<string>('all')
  const [transferUnavailableConfirmOpen, setTransferUnavailableConfirmOpen] = useState(false)
  const transferOptionsRequestIdRef = useRef(0)

  // Tick every second for live times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll conversation to bottom when messages load.
  // Uses ResizeObserver to keep scrolling as images/audios load and resize the content.
  useEffect(() => {
    if (
      conversationTab !== 'conversa' ||
      loadingMessages ||
      conversationMessages.length === 0 ||
      !conversationScrollRef.current
    ) {
      return
    }
    const el = conversationScrollRef.current
    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight
    }
    // Initial scroll
    scrollToEnd()
    // Re-scroll on any size change for ~1.5s (covers async image/audio decode)
    const observer = new ResizeObserver(scrollToEnd)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    const stop = setTimeout(() => observer.disconnect(), 1500)
    return () => {
      observer.disconnect()
      clearTimeout(stop)
    }
  }, [conversationTab, loadingMessages, conversationMessages])

  useEffect(() => {
    if (!selectedNexusConversation || !nexusConversationScrollRef.current) return
    const el = nexusConversationScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [selectedNexusConversation])

  // Fetch subsetores when setor filter changes
  useEffect(() => {
    async function fetchSubsetores() {
      // Subsetor só faz sentido com um setor específico selecionado.
      const targetSetorIds = setorFilter.length > 0 ? setorFilter : []
      if (targetSetorIds.length === 0) {
        setSubsetoresDisponiveis([])
        return
      }
      const { data } = await supabase
        .from('subsetores')
        .select('id, nome')
        .in('setor_id', targetSetorIds)
        .eq('ativo', true)
        .order('nome')
      setSubsetoresDisponiveis(data || [])
      setSubsetorFilter([]) // Reset subsetor filter when setor changes
    }
    if (colaborador && setorIdsFiltrados.length > 0) {
      fetchSubsetores()
    }
  }, [setorFilter, tagFilter, colaborador, setorIdsFiltrados.length, supabase])

  // Fetch monitoring data
  const { data, error: monitoringError, isLoading, mutate } = useSWR(
    colaborador && setorIdsFiltrados.length > 0
      ? [
          'dashboard-monitoramento',
          setorIdsFiltrados.join(','),
          setorFilter.join(','),
          tagFilter.join(','),
          subsetorFilter.join(','),
        ]
      : null,
    async () => {
      const targetSetorIds = setorFilter.length > 0 ? setorFilter : setorIdsFiltrados
      const namedSubsetorIds = subsetorFilter.filter((id) => id !== SEM_SUBSETOR_ID)
      const includesGeneralQueue = subsetorFilter.includes(SEM_SUBSETOR_ID)
      const applySubsetorFilter = (query: any) => {
        if (subsetorFilter.length === 0) return query
        if (includesGeneralQueue && namedSubsetorIds.length > 0) {
          return query.or(`subsetor_id.is.null,subsetor_id.in.(${namedSubsetorIds.join(',')})`)
        }
        if (includesGeneralQueue) return query.is('subsetor_id', null)
        return query.in('subsetor_id', namedSubsetorIds)
      }

      // Fetch active tickets (aberto + em_atendimento) across all accessible setores
      let ticketsQuery = supabase
        .from('tickets')
        .select('*, clientes(nome, telefone), colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat), setores!tickets_setor_id_fkey(id, nome), subsetores(id, nome)')
        .in('setor_id', targetSetorIds)
        .in('status', ['aberto', 'em_atendimento'])
      ticketsQuery = applySubsetorFilter(ticketsQuery)
      const { data: ticketsAtivos, error: ticketsAtivosError } = await ticketsQuery
      if (ticketsAtivosError) throw ticketsAtivosError

      // Lookup global de setores — usado pra reescrever descrições antigas de
      // transbordo na hora da exibição. Carrega TODOS os setores (não só os
      // acessíveis), pra que setor de origem fora do escopo do colaborador
      // ainda apareça nomeado no badge.
      const { data: todosSetoresData } = await supabase
        .from('setores')
        .select('id, nome, setor_receptor_id')

      // Logs relevantes pra derivar "origem" dos tickets ativos. Carrega em
      // batch pra evitar N+1 — mesma estratégia da página do setor.
      const ticketsAtivosIds = (ticketsAtivos || []).map((t: any) => t.id)
      const logsMap = new Map<string, any[]>()
      if (ticketsAtivosIds.length > 0) {
        const { data: logsData } = await supabase
          .from('ticket_logs')
          .select('ticket_id, tipo, descricao, criado_em')
          .in('ticket_id', ticketsAtivosIds)
          .in('tipo', ['criacao', 'transferencia', 'transferencia_automatica', 'transbordo_limite_atingido', 'pull_manual'])
        for (const l of (logsData || [])) {
          const arr = logsMap.get(l.ticket_id) || []
          arr.push(l)
          logsMap.set(l.ticket_id, arr)
        }
      }
      for (const t of (ticketsAtivos || []) as any[]) {
        (t as any)._logs = logsMap.get(t.id) || []
      }

      // Fetch today's tickets (for stats)
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      let ticketsHojeQuery = supabase
        .from('tickets')
        .select('id, status, criado_em, primeira_resposta_em, encerrado_em, subsetor_id')
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)
      ticketsHojeQuery = applySubsetorFilter(ticketsHojeQuery)
      const { data: ticketsHoje, error: ticketsHojeError } = await ticketsHojeQuery
      if (ticketsHojeError) throw ticketsHojeError

      // Separate count queries to avoid Supabase 1000-row default limit
      let countRecebidosQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)
      let countResolvidosQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'encerrado')
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)
      countRecebidosQuery = applySubsetorFilter(countRecebidosQuery)
      countResolvidosQuery = applySubsetorFilter(countResolvidosQuery)
      const [
        { count: countRecebidos, error: countRecebidosError },
        { count: countResolvidos, error: countResolvidosError },
      ] = await Promise.all([countRecebidosQuery, countResolvidosQuery])
      if (countRecebidosError) throw countRecebidosError
      if (countResolvidosError) throw countResolvidosError

      // Fetch atendentes across all accessible setores
      const atendentesQuery = supabase
        .from('colaboradores_setores')
        .select('setor_id, colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat)')
        .in('setor_id', targetSetorIds)
      const subsetorLinksQuery = subsetorFilter.length > 0
        ? supabase
            .from('colaboradores_subsetores')
            .select('setor_id, colaborador_id, subsetor_id')
            .in('setor_id', targetSetorIds)
        : Promise.resolve({ data: [], error: null })
      const [
        { data: atendentesData, error: atendentesError },
        { data: subsetorLinks, error: subsetorLinksError },
      ] = await Promise.all([atendentesQuery, subsetorLinksQuery])
      if (atendentesError) throw atendentesError
      if (subsetorLinksError) throw subsetorLinksError

      const subsetoresByMembership = new Map<string, string[]>()
      for (const link of subsetorLinks || []) {
        const key = `${link.setor_id}:${link.colaborador_id}`
        const current = subsetoresByMembership.get(key) || []
        current.push(link.subsetor_id)
        subsetoresByMembership.set(key, current)
      }
      const matchesAttendantSubsetor = (membership: any) => {
        if (subsetorFilter.length === 0) return true
        const linkedSubsetores = subsetoresByMembership.get(
          `${membership.setor_id}:${membership.colaborador_id}`,
        ) || []
        return (
          (includesGeneralQueue && linkedSubsetores.length === 0)
          || linkedSubsetores.some((id) => namedSubsetorIds.includes(id))
        )
      }

      // Deduplicate atendentes (same person can be in multiple setores)
      const atendentesMap = new Map()
      for (const a of atendentesData || []) {
        if (!matchesAttendantSubsetor(a)) continue
        const colab = (a as any).colaboradores
        if (colab?.ativo && !atendentesMap.has(colab.id)) {
          atendentesMap.set(colab.id, colab)
        }
      }
      const atendentes = Array.from(atendentesMap.values())

      const pausaIds = atendentes
        .filter((atendente: any) => atendente.pausa_atual_id)
        .map((atendente: any) => atendente.pausa_atual_id)
      if (pausaIds.length > 0) {
        const { data: pausasAtivas, error: pausasAtivasError } = await supabase
          .from('pausas_colaboradores')
          .select('id, inicio, pausas(nome, tempo_maximo_minutos)')
          .in('id', pausaIds)
        if (pausasAtivasError) throw pausasAtivasError
        const pausaInfoById = new Map(
          (pausasAtivas || []).map((pausa: any) => {
            const pausaConfig = Array.isArray(pausa.pausas) ? pausa.pausas[0] : pausa.pausas
            return [
              pausa.id,
              {
                nome: pausaConfig?.nome || 'Pausa',
                inicio: pausa.inicio,
                tempoMaximoMinutos: pausaConfig?.tempo_maximo_minutos ?? null,
              },
            ]
          }),
        )
        for (const atendente of atendentes as any[]) {
          if (atendente.pausa_atual_id) {
            atendente.pausaInfo = pausaInfoById.get(atendente.pausa_atual_id) || null
          }
        }
      }

      const tickets = ticketsAtivos || []
      const todayTickets = ticketsHoje || []

      // Calculate stats
      const ticketsNaFila = tickets.filter((t: any) => t.status === 'aberto')
      const ticketsEmAtendimento = tickets.filter((t: any) => t.status === 'em_atendimento')
      // Max times
      const nowMs = Date.now()

      const atendentesOnline = atendentes.filter((c: any) => isAtendenteOnline(c))
      const atendentesEmPausa = atendentes.filter((c: any) => c.pausa_atual_id && c.ativo)
      let maxTempoFila = 0
      let maxTempoResposta = 0

      for (const ticket of ticketsNaFila) {
        if (ticket.criado_em) {
          const tempoFila = nowMs - new Date(ticket.criado_em).getTime()
          if (tempoFila > maxTempoFila) maxTempoFila = tempoFila
        }
      }

      for (const ticket of ticketsEmAtendimento) {
        if (ticket.criado_em && !ticket.primeira_resposta_em) {
          const tempoResposta = nowMs - new Date(ticket.criado_em).getTime()
          if (tempoResposta > maxTempoResposta) maxTempoResposta = tempoResposta
        }
      }

      // Average first response time
      const withFirstResp = todayTickets.filter((t: any) => t.primeira_resposta_em)
      let avgFirstResp = 0
      if (withFirstResp.length > 0) {
        const total = withFirstResp.reduce((sum: number, t: any) => {
          return sum + (new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime())
        }, 0)
        avgFirstResp = total / withFirstResp.length
      }

      // Average resolution time
      const resolved = todayTickets.filter((t: any) => t.encerrado_em)
      let avgResolution = 0
      if (resolved.length > 0) {
        const total = resolved.reduce((sum: number, t: any) => {
          return sum + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime())
        }, 0)
        avgResolution = total / resolved.length
      }

      const nexusUntil = new Date().toISOString()
      const nexusActiveSince = new Date(Date.now() - NEXUS_NO_TICKET_IDLE_MS).toISOString()
      const nexusLookbackSince = new Date(
        Date.now() - Math.max(NEXUS_MESSAGE_LOOKBACK_MINUTES * 60000, NEXUS_NO_TICKET_IDLE_MS),
      ).toISOString()

      let nexusChannelError = false
      let nexusChannelConfiguration: Awaited<ReturnType<typeof loadSafeNexusChannelConfiguration>>
        = { sectors: [], channels: [], warnings: [] }
      if (targetSetorIds.length > 0) {
        try {
          nexusChannelConfiguration = await loadSafeNexusChannelConfiguration(targetSetorIds)
        } catch (error) {
          nexusChannelError = true
          console.warn('[monitoramento] Canais Nexus não carregados:', error)
        }
      }
      const setoresIa = nexusChannelConfiguration.sectors
      const channelSetores = new Map(nexusChannelConfiguration.channels.map((channel) => [
        channel.identifier,
        {
          id: channel.sectorId,
          nome: channel.sectorName,
          channelKey: channel.channelKey,
        },
      ]))

      const resolveNexusSetor = (message: any) => (
        message.phone_number_id ? channelSetores.get(message.phone_number_id) || null : null
      )
      const channelIds = [...channelSetores.keys()]
      const nexusMessages = channelIds.length > 0
        ? await loadRowsByPages(() => supabase
            .from('mensagens')
            .select('id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type, phone_number_id, clientes(id, nome, telefone)')
            .is('ticket_id', null)
            .in('remetente', [NEXUS_CLIENT_REMETENTE, NEXUS_BOT_REMETENTE])
            .in('phone_number_id', channelIds)
            .gte('enviado_em', nexusLookbackSince)
            .lte('enviado_em', nexusUntil)
            .order('enviado_em', { ascending: true })
            .order('id', { ascending: true }))
        : []

      const clienteIds = new Set<string>()
      const telefones = new Set<string>()
      const telefonesNormalizados = new Set<string>()
      const telefonePorClienteId = new Map<string, string>()

      for (const message of nexusMessages) {
        if (message.cliente_id) clienteIds.add(message.cliente_id)
        const telefone = (message as any).clientes?.telefone
        if (!telefone) continue

        telefones.add(telefone)
        const telefoneNormalizado = normalizeBrazilianPhone(telefone)
        if (!telefoneNormalizado) continue

        telefonesNormalizados.add(telefoneNormalizado)
        if (message.cliente_id) {
          telefonePorClienteId.set(message.cliente_id, telefoneNormalizado)
        }
      }

      const phoneLookupVariants = [...new Set(
        Array.from(telefones).flatMap(getPhoneLookupVariants),
      )]
      const clientesPorTelefone = phoneLookupVariants.length > 0
        ? await loadRowsByValues(
            supabase,
            'clientes',
            'id, telefone',
            'telefone',
            phoneLookupVariants,
            (query) => query.order('id', { ascending: true }),
          )
        : []

      for (const cliente of clientesPorTelefone) {
        const telefone = normalizeBrazilianPhone(cliente.telefone)
        if (!telefone || !telefonesNormalizados.has(telefone)) continue

        clienteIds.add(cliente.id)
        telefonePorClienteId.set(cliente.id, telefone)
      }

      const nexusTicketsAtivos = clienteIds.size > 0
        ? await loadRowsByValues(
            supabase,
            'tickets',
            'id, cliente_id',
            'cliente_id',
            Array.from(clienteIds),
            (query) => query
              .in('status', ['aberto', 'em_atendimento'])
              .order('id', { ascending: true }),
          )
        : []

      const nexusTicketIds = nexusTicketsAtivos
        .map((ticket: any) => ticket.id)
        .filter(Boolean)
      const ticketChannelMessages = nexusTicketIds.length > 0 && channelIds.length > 0
        ? await loadRowsByValues(
            supabase,
            'mensagens',
            'ticket_id, phone_number_id',
            'ticket_id',
            nexusTicketIds,
            (query) => query
              .in('phone_number_id', channelIds)
              .order('id', { ascending: true }),
          )
        : []

      const channelKeysByTicket = new Map<string, Set<string>>()
      for (const message of ticketChannelMessages) {
        if (!message.ticket_id) continue
        const setor = resolveNexusSetor(message)
        if (!setor) continue
        const channelKeys = channelKeysByTicket.get(message.ticket_id) || new Set<string>()
        channelKeys.add(setor.channelKey)
        channelKeysByTicket.set(message.ticket_id, channelKeys)
      }

      const clientesComTicketAtivo = new Set<string>()
      const telefonesComTicketAtivo = new Set<string>()
      for (const ticket of nexusTicketsAtivos) {
        if (!ticket.id || !ticket.cliente_id) continue
        const channelKeys = channelKeysByTicket.get(ticket.id)
        // A ticket without one canonical channel must not hide conversations
        // from every channel in the sector.
        if (channelKeys?.size !== 1) continue
        const channelKey = [...channelKeys][0]
        clientesComTicketAtivo.add(`${channelKey}::${ticket.cliente_id}`)
        const telefone = telefonePorClienteId.get(ticket.cliente_id)
        if (telefone) telefonesComTicketAtivo.add(`${channelKey}::${telefone}`)
      }

      const nexusGroups = new Map<string, Omit<NexusConversation, 'lastBotMessageAt'>>()
      for (const message of nexusMessages) {
        const setor = resolveNexusSetor(message)
        if (!setor) continue

        const cliente = (message as any).clientes
        const telefoneNormalizado = normalizeBrazilianPhone(cliente?.telefone)
        if (!message.cliente_id && !telefoneNormalizado) continue
        const scopedClientId = message.cliente_id ? `${setor.channelKey}::${message.cliente_id}` : null
        const scopedPhone = telefoneNormalizado ? `${setor.channelKey}::${telefoneNormalizado}` : null
        if (scopedClientId && clientesComTicketAtivo.has(scopedClientId)) continue
        if (scopedPhone && telefonesComTicketAtivo.has(scopedPhone)) continue

        const clienteKey = `${setor.channelKey}::${telefoneNormalizado || message.cliente_id || message.id}`
        const groupKey = getNexusConversationScopeKey(
          setor.id,
          message.cliente_id,
          telefoneNormalizado,
          message.id,
          setor.channelKey,
        )
        const current = nexusGroups.get(groupKey)

        nexusGroups.set(groupKey, {
          clienteKey,
          clienteId: current?.clienteId || message.cliente_id,
          contato: cliente?.nome || cliente?.telefone || current?.contato || 'Cliente sem nome',
          telefone: cliente?.telefone || current?.telefone || null,
          setorId: setor.id,
          setorNome: setor.nome,
          lastMessageAt: message.enviado_em,
          lastRemetente: message.remetente,
          messages: [...(current?.messages || []), message],
        })
      }

      const nexusConversas = Array.from(nexusGroups.values())
        .map((conversation): NexusConversation => {
          const messages = getLatestNexusSessionMessages(
            conversation.messages,
            NEXUS_NO_TICKET_IDLE_MS,
          )
          const lastMessage = messages[messages.length - 1]
          const lastBotMessage = [...messages]
            .reverse()
            .find((message) => message.remetente === NEXUS_BOT_REMETENTE)

          return {
            ...conversation,
            lastMessageAt: lastMessage?.enviado_em || conversation.lastMessageAt,
            lastRemetente: lastMessage?.remetente || conversation.lastRemetente,
            messages,
            lastBotMessageAt: lastBotMessage?.enviado_em || '',
          }
        })
        .filter((conversation) => (
          conversation.lastMessageAt >= nexusActiveSince || !conversation.lastBotMessageAt
        ))
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      return {
        observedAtMs: nowMs,
        tickets,
        atendentes,
        todosSetores: todosSetoresData || [],
        nexusConversas,
        nexusChannelIds: channelIds,
        nexusChannelWarnings: nexusChannelConfiguration.warnings,
        nexusChannelError,
        stats: {
          total: tickets.length,
          naFila: ticketsNaFila.length,
          emAtendimento: ticketsEmAtendimento.length,
          finalizados: countResolvidos || 0,
          tempoMaximoFila: formatMs(maxTempoFila),
          tempoMaximoResposta: formatMs(maxTempoResposta),
        },
        atendentesStats: {
          online: atendentesOnline.length,
          pausa: atendentesEmPausa.length,
          offline: atendentes.filter((c: any) => (
            c.ativo && !c.pausa_atual_id && !isAtendenteOnline(c)
          )).length,
        },
        temposHoje: {
          tempoMedioPrimeiraResposta: formatMs(avgFirstResp),
          tempoMedioResolucao: formatMs(avgResolution),
          totalRecebidos: countRecebidos || 0,
          totalResolvidos: countResolvidos || 0,
        },
      }
    },
    { revalidateOnFocus: false, refreshInterval: 30000 }, // reduzido de 5s para 30s — otimização de polling Supabase
  )

  const stats = data?.stats || { total: 0, naFila: 0, emAtendimento: 0, finalizados: 0, tempoMaximoFila: '00:00:00', tempoMaximoResposta: '00:00:00' }
  const monitoringNowMs = data?.observedAtMs || 0
  const atendentesStats = data?.atendentesStats || { online: 0, pausa: 0, offline: 0 }
  const temposHoje = data?.temposHoje || { tempoMedioPrimeiraResposta: '00:00:00', tempoMedioResolucao: '00:00:00', totalRecebidos: 0, totalResolvidos: 0 }
  const tickets = data?.tickets || []
  const atendentesRaw: any[] = data?.atendentes || []
  const nexusConversasRaw: NexusConversation[] = data?.nexusConversas || []
  const monitoredNexusChannelIds = useMemo(
    () => new Set<string>(data?.nexusChannelIds || []),
    [data?.nexusChannelIds],
  )
  const todosSetores = (data?.todosSetores || []) as Array<{ id: string; nome: string; setor_receptor_id: string | null }>

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-monitoramento-nexus-mensagens')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens' },
        (payload) => {
          const row = (payload.new || payload.old) as {
            ticket_id?: string | null
            remetente?: string | null
            phone_number_id?: string | null
          } | null
          if (
            row?.ticket_id === null
            && [NEXUS_CLIENT_REMETENTE, NEXUS_BOT_REMETENTE].includes(row.remetente || '')
            && Boolean(row.phone_number_id)
            && monitoredNexusChannelIds.has(row.phone_number_id!)
          ) {
            mutate()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [monitoredNexusChannelIds, mutate, supabase])

  const nexusConversas = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return nexusConversasRaw

    return nexusConversasRaw.filter((conversation) => (
      conversation.contato.toLowerCase().includes(query) ||
      formatPhone(conversation.telefone).toLowerCase().includes(query) ||
      conversation.setorNome.toLowerCase().includes(query)
    ))
  }, [nexusConversasRaw, searchTerm])

  const selectedNexusConversationKey = selectedNexusConversation
    ? `${selectedNexusConversation.setorId}-${selectedNexusConversation.clienteKey}`
    : null

  useEffect(() => {
    if (!selectedNexusConversationKey) return
    const updated = nexusConversasRaw.find((conversation) => (
      `${conversation.setorId}-${conversation.clienteKey}` === selectedNexusConversationKey
    ))

    setSelectedNexusConversation(updated || null)
  }, [nexusConversasRaw, selectedNexusConversationKey])

  // Lookup de setores pra reescrita ao vivo de logs antigos de transbordo
  const setoresLookup = useMemo(() => {
    const m = new Map<string, SetorLookupEntry>()
    for (const s of todosSetores) {
      m.set(s.id, { nome: s.nome, setor_receptor_id: s.setor_receptor_id })
    }
    return m
  }, [todosSetores])

  // Mapa de origem por ticket — construído uma vez quando tickets mudam.
  // Usado pelos badges sem recalcular por linha.
  const origensMap = useMemo(() => {
    const allLogs = tickets.flatMap((t: any) => t._logs || [])
    return calcularOrigem(tickets, allLogs, setoresLookup)
  }, [tickets, setoresLookup])

  // Tickets em andamento
  // Lista de atendentes únicos para o filtro
  const atendentesUnicos = useMemo(() => {
    // Quem tem ticket ativo agora (em atendimento / aberto com atendente).
    const comTicket = new Set<string>()
    tickets.forEach((t: any) => {
      if (t.colaborador_id && (t.status === 'em_atendimento' || t.status === 'aberto')) {
        comTicket.add(t.colaborador_id)
      }
    })
    // Online (sem pausa) → em pausa → offline; depois quem tem ticket agora; depois nome.
    const order = (x: { online: boolean; pausa: boolean }) =>
      x.online ? 0 : x.pausa ? 1 : 2
    return (atendentesRaw || [])
      .filter((a: any) => a.ativo)
      .map((a: any) => ({
        id: a.id,
        nome: a.nome,
        online: isAtendenteOnline(a),
        pausa: !!a.pausa_atual_id,
      }))
      .sort((a, b) =>
        order(a) - order(b)
        || (Number(comTicket.has(b.id)) - Number(comTicket.has(a.id)))
        || (a.nome || '').localeCompare(b.nome || ''),
      )
  }, [atendentesRaw, isAtendenteOnline, tickets])

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || (t.status === 'aberto' && t.colaborador_id))
      .filter((t: any) => {
        // Filtro por atendente (multi-seleção: vazio = todos)
        if (atendenteFilter.length > 0 && !atendenteFilter.includes(t.colaborador_id)) return false
        // Filtro de subsetor
        if (subsetorFilter.length > 0 && !subsetorFilter.includes(t.subsetor_id || SEM_SUBSETOR_ID)) return false
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        const numero = String(t.numero ?? t.id?.slice(0, 8) ?? '')
        return contato.toLowerCase().includes(searchTerm.toLowerCase()) || numero.includes(searchTerm)
      })
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        setor_id: t.setor_id,
        subsetor_id: t.subsetor_id,
        colaborador_id: t.colaborador_id,
        setores: t.setores,
        subsetores: t.subsetores,
        colaboradores: t.colaboradores,
        numero: t.numero ?? null,
        // Tempo na fila = criado_em → atribuido_em (tempo sem atendente)
        // Se atribuido_em não foi registrado mas já tem colaborador, o dado não está disponível
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'
            : formatDuration(t.criado_em, null),
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        // Tempo de atendimento = atribuido_em (ou criado_em como fallback) → agora
        tempoAtendimento: t.colaborador_id ? formatDuration(t.atribuido_em || t.criado_em, null) : '0min',
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        telefone: t.clientes?.telefone || null,
        canal: t.canal || 'whatsapp',
        setor: t.setores?.nome || '-',
        subsetor: t.subsetores?.nome || null,
        atendente: t.colaboradores?.nome || null,
        status: t.status,
        primeira_resposta_em: t.primeira_resposta_em,
      }))
  }, [tickets, searchTerm, subsetorFilter, atendenteFilter])

  // Tickets aguardando
  const ticketsAguardando = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'aberto' && !t.colaborador_id)
      .filter((t: any) => {
        // Filtro de subsetor
        if (subsetorFilter.length > 0 && !subsetorFilter.includes(t.subsetor_id || SEM_SUBSETOR_ID)) return false
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      // Aguardando não tem colaborador, então "Meus" mostra vazio (sem atribuição ainda)
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        setor_id: t.setor_id,
        subsetor_id: t.subsetor_id,
        colaborador_id: t.colaborador_id,
        setores: t.setores,
        subsetores: t.subsetores,
        colaboradores: t.colaboradores,
        numero: t.numero ?? null,
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        telefone: t.clientes?.telefone || null,
        canal: t.canal || 'whatsapp',
        setor: t.setores?.nome || '-',
        subsetor: t.subsetores?.nome || null,
        tempoEspera: formatDuration(t.criado_em, null),
        criado_em: t.criado_em,
      }))
  }, [tickets, searchTerm, subsetorFilter])

  // Atendentes list for the Atendentes tab
  const atendentesLista = useMemo(() => {
    const ticketCountPorAtendente = new Map<string, number>()
    tickets.forEach((t: any) => {
      if (t.colaborador_id && (t.status === 'em_atendimento' || t.status === 'aberto')) {
        ticketCountPorAtendente.set(t.colaborador_id, (ticketCountPorAtendente.get(t.colaborador_id) || 0) + 1)
      }
    })
    return atendentesRaw
      .filter((a: any) => {
        if (!searchAtendente) return true
        return a.nome?.toLowerCase().includes(searchAtendente.toLowerCase())
      })
      .map((a: any) => ({
        ...a,
        ticketsAtivos: ticketCountPorAtendente.get(a.id) || 0,
      }))
      .sort((a: any, b: any) => {
        // Ordem: Online primeiro → Pausa → Offline, e dentro de cada grupo por nome
        const order = (x: any) => {
          if (isAtendenteOnline(x)) return 0              // Online
          if (x.pausa_atual_id) return 1                  // Em pausa
          return 2                                         // Offline
        }
        return order(a) - order(b) || a.nome?.localeCompare(b.nome)
      })
  }, [atendentesRaw, isAtendenteOnline, tickets, searchAtendente])

  // Open conversation panel
  const openConversation = async (ticket: any) => {
    setSelectedTicket(ticket)
    setConversationTab('conversa')
    setLoadingMessages(true)
    setLoadingHistory(true)

    try {
      // Fetch messages for this ticket
      const { data: messages } = await supabase
        .from('mensagens')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('enviado_em', { ascending: true })

      setConversationMessages(messages || [])
    } catch {
      setConversationMessages([])
    } finally {
      setLoadingMessages(false)
    }

    // Fetch ticket history for same client
    try {
      const { data: history } = await supabase
        .from('tickets')
        .select('*, colaboradores(nome), setores!tickets_setor_id_fkey(nome)')
        .eq('cliente_id', ticket.cliente_id)
        .neq('id', ticket.id)
        .order('criado_em', { ascending: false })
        .limit(20)

      setTicketHistory(history || [])
    } catch {
      setTicketHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const closeConversation = () => {
    setSelectedTicket(null)
    setConversationMessages([])
    setTicketHistory([])
    setHistoryMessages({})
    setExpandedHistory(null)
  }

  const loadHistoryMessages = async (ticketId: string) => {
    if (historyMessages[ticketId]) {
      setExpandedHistory(expandedHistory === ticketId ? null : ticketId)
      return
    }
    setExpandedHistory(ticketId)
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('enviado_em', { ascending: true })
    setHistoryMessages(prev => ({ ...prev, [ticketId]: msgs || [] }))
  }

  // Encerrar ticket
  const handleEncerrarTicket = async () => {
    if (!selectedTicket) return
    try {
      // Fetch setor config for closing message
      const { data: setor } = await supabase
        .from('setores')
        .select('mensagem_finalizacao')
        .eq('id', selectedTicket.setor_id)
        .single()

      // Send closing message if configured
      if (setor?.mensagem_finalizacao) {
        // Fetch client data for template variables
        const { data: cliente } = await supabase
          .from('clientes')
          .select('nome, telefone, CNPJ')
          .eq('id', selectedTicket.cliente_id)
          .single()

        // Process template variables
        const now = new Date()
        const processedMessage = setor.mensagem_finalizacao
          .replace(/\{\{cliente_nome\}\}/g, cliente?.nome || '')
          .replace(/\{\{cliente_telefone\}\}/g, cliente?.telefone || '')
          .replace(/\{\{cliente_cnpj\}\}/g, cliente?.CNPJ || '')
          .replace(/\{\{atendente_nome\}\}/g, selectedTicket.atendente || '')
          .replace(/\{\{setor_nome\}\}/g, selectedTicket.setores?.nome || '')
          .replace(/\{\{ticket_id\}\}/g, selectedTicket.numero ? `#${selectedTicket.numero}` : '')
          .replace(/\{\{data_atual\}\}/g, now.toLocaleDateString('pt-BR'))
          .replace(/\{\{hora_atual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))

        // Detect channel from last message
        const { data: lastMsgData } = await supabase
          .from('mensagens')
          .select('canal_envio, phone_number_id, discord_user_id')
          .eq('ticket_id', selectedTicket.id)
          .neq('remetente', 'sistema')
          .order('enviado_em', { ascending: false })
          .limit(1)

        const lastCanalEnvio = lastMsgData?.[0]?.canal_envio || null
        const lastPhoneNumberId = lastMsgData?.[0]?.phone_number_id || null
        const lastDiscordUserId = lastMsgData?.[0]?.discord_user_id || null

        let setorCanal = 'whatsapp'
        let phoneNumberId: string | null = lastPhoneNumberId

        if (lastDiscordUserId || lastCanalEnvio === 'discord') {
          setorCanal = 'discord'
          phoneNumberId = null
        } else if (lastCanalEnvio === 'evolutionapi' || lastPhoneNumberId) {
          if (lastPhoneNumberId) {
            const { data: evoCanal } = await supabase
              .from('setor_canais')
              .select('instancia')
              .eq('tipo', 'evolution_api')
              .eq('instancia', lastPhoneNumberId)
              .eq('ativo', true)
              .maybeSingle()
            setorCanal = evoCanal ? 'evolution_api' : 'whatsapp'
            phoneNumberId = lastPhoneNumberId
          } else {
            setorCanal = 'evolution_api'
          }
        } else if (selectedTicket.setor_id) {
          const { data: canalAtivo } = await supabase
            .from('setor_canais')
            .select('tipo, instancia, phone_number_id')
            .eq('setor_id', selectedTicket.setor_id)
            .eq('ativo', true)
            .order('criado_em', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (canalAtivo) {
            setorCanal = canalAtivo.tipo
            phoneNumberId = canalAtivo.tipo === 'evolution_api'
              ? canalAtivo.instancia
              : canalAtivo.phone_number_id
          }
        }

        // Send closing message via the appropriate channel
        try {
          if (setorCanal === 'discord') {
            await fetch('/api/discord/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketId: selectedTicket.id, message: processedMessage }),
            })
          } else if (setorCanal === 'evolution_api' && phoneNumberId && cliente?.telefone) {
            await fetch('/api/evolution/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketId: selectedTicket.id, message: processedMessage, instanceName: phoneNumberId }),
            })
          } else if (setorCanal === 'whatsapp' && phoneNumberId && cliente?.telefone) {
            await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipientPhone: cliente.telefone, message: processedMessage, ticketId: selectedTicket.id, phoneNumberId }),
            })
          }
        } catch (err) {
          console.error('[Encerrar] Erro ao enviar mensagem de finalização:', err)
        }
      }

      await supabase
        .from('tickets')
        .update({ status: 'encerrado', encerrado_em: new Date().toISOString() })
        .eq('id', selectedTicket.id)

      try {
        await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: selectedTicket.id, evento: 'ticket_encerrado' }),
        })
      } catch (err) {
        console.error('[Webhook] dispatch error:', err)
      }

      toast.success('Ticket encerrado')
      setEncerrarDialogOpen(false)
      closeConversation()
      mutate()
    } catch {
      toast.error('Erro ao encerrar ticket')
    }
  }

  const selectedTransferSubsetorId = selectedSubsetorTransfer === NO_TRANSFER_SUBSETOR
    ? null
    : selectedSubsetorTransfer || null
  const transferSubsetorSelectionReady = selectedSubsetorTransfer !== ''
  const transferAtendentesCompativeis = transferSubsetorSelectionReady
    ? atendentesDisponiveis.filter((atendente) => (
        isExactSubsetorMatch(selectedTransferSubsetorId, atendente.subsetor_ids)
      ))
    : []
  const selectedTransferAtendente = transferAtendentesCompativeis.find(
    (atendente) => atendente.id === selectedAtendenteTransfer,
  )

  const loadTransferOptions = async (
    targetSetorId: string,
    initialSubsetorId: string | null = null,
  ) => {
    const requestId = ++transferOptionsRequestIdRef.current
    setTransferOptionsLoading(true)
    setSelectedAtendenteTransfer('all')
    setAtendentesDisponiveis([])
    setSubsetoresTransfer([])
    setSelectedSubsetorTransfer('')

    try {
      const [subsetoresResult, atendentesResult, subsetorLinksResult] = await Promise.all([
        supabase
          .from('subsetores')
          .select('id, nome, setor_id')
          .eq('setor_id', targetSetorId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('colaboradores_setores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat)')
          .eq('setor_id', targetSetorId),
        supabase
          .from('colaboradores_subsetores')
          .select('colaborador_id, subsetor_id')
          .eq('setor_id', targetSetorId),
      ])

      if (subsetoresResult.error) throw subsetoresResult.error
      if (atendentesResult.error) throw atendentesResult.error
      if (subsetorLinksResult.error) throw subsetorLinksResult.error
      if (requestId !== transferOptionsRequestIdRef.current) return

      const subsetorIdsByAtendente = new Map<string, string[]>()
      for (const link of subsetorLinksResult.data ?? []) {
        const current = subsetorIdsByAtendente.get(link.colaborador_id) ?? []
        current.push(link.subsetor_id)
        subsetorIdsByAtendente.set(link.colaborador_id, current)
      }

      const atendentesMap = new Map<string, TransferAtendente>()
      for (const row of atendentesResult.data ?? []) {
        const relation = Array.isArray(row.colaboradores)
          ? row.colaboradores[0]
          : row.colaboradores
        if (!relation?.ativo) continue
        if (
          targetSetorId === selectedTicket?.setor_id
          && relation.id === selectedTicket?.colaborador_id
        ) continue

        atendentesMap.set(relation.id, {
          ...relation,
          subsetor_ids: subsetorIdsByAtendente.get(relation.id) ?? [],
        })
      }

      const subsetores = (subsetoresResult.data ?? []) as TransferSubsetor[]
      const initialSubsetorExists = initialSubsetorId
        ? subsetores.some((subsetor) => subsetor.id === initialSubsetorId)
        : false

      setSubsetoresTransfer(subsetores)
      setAtendentesDisponiveis(
        [...atendentesMap.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
      )
      setSelectedSubsetorTransfer(
        initialSubsetorExists
          ? initialSubsetorId!
          : subsetores.length === 0
            ? NO_TRANSFER_SUBSETOR
            : '',
      )
    } catch (error) {
      if (requestId !== transferOptionsRequestIdRef.current) return
      console.error('[Monitoramento] Erro ao carregar opções de transferência:', error)
      toast.error('Não foi possível carregar os destinos de transferência')
    } finally {
      if (requestId === transferOptionsRequestIdRef.current) {
        setTransferOptionsLoading(false)
      }
    }
  }

  const handleTransferDialogOpenChange = (open: boolean) => {
    setTransferDialogOpen(open)
    if (open) return

    transferOptionsRequestIdRef.current += 1
    setTransferUnavailableConfirmOpen(false)
    setTransferOptionsLoading(false)
    setTransferLoading(false)
  }

  const openTransferDialog = async () => {
    const currentSetorId = selectedTicket?.setor_id
    if (!currentSetorId) {
      toast.error('Setor atual do ticket não identificado')
      return
    }

    setTransferTab('atendente')
    setSelectedSetorTransfer('all')
    setSelectedAtendenteTransfer('all')
    setSetoresTransfer([])
    setTransferDialogOpen(true)

    const [destinosResult] = await Promise.all([
      supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id, setores:setor_destino_id(id, nome)')
        .eq('setor_origem_id', currentSetorId),
      loadTransferOptions(currentSetorId, selectedTicket.subsetor_id ?? null),
    ])

    if (destinosResult.error) {
      console.error('[Monitoramento] Erro ao carregar setores de transferência:', destinosResult.error)
      toast.error('Não foi possível carregar os setores de destino')
      return
    }

    const destinos = (destinosResult.data ?? [])
      .flatMap((row: any) => Array.isArray(row.setores) ? row.setores : [row.setores])
      .filter(Boolean)
      .sort((a: any, b: any) => a.nome.localeCompare(b.nome))
    setSetoresTransfer(destinos)
  }

  const handleTransferTabChange = (value: string) => {
    const nextTab = value as TransferTab
    setTransferTab(nextTab)
    setSelectedAtendenteTransfer('all')
    setTransferUnavailableConfirmOpen(false)

    if (nextTab === 'atendente' && selectedTicket?.setor_id) {
      setSelectedSetorTransfer('all')
      void loadTransferOptions(selectedTicket.setor_id, selectedTicket.subsetor_id ?? null)
      return
    }

    transferOptionsRequestIdRef.current += 1
    setTransferOptionsLoading(false)
    setSelectedSetorTransfer('all')
    setSelectedSubsetorTransfer('')
    setSubsetoresTransfer([])
    setAtendentesDisponiveis([])
  }

  const handleSetorTransferChange = (setorId: string) => {
    setSelectedSetorTransfer(setorId)
    setTransferUnavailableConfirmOpen(false)
    void loadTransferOptions(setorId)
  }

  const handleSubsetorTransferChange = (subsetorId: string) => {
    setSelectedSubsetorTransfer(subsetorId)
    setSelectedAtendenteTransfer('all')
    setTransferUnavailableConfirmOpen(false)
  }

  const handleTransferTicket = async (allowUnavailable = false) => {
    if (!selectedTicket || !transferSubsetorSelectionReady) return

    const targetSetorId = transferTab === 'setor'
      ? selectedSetorTransfer
      : selectedTicket.setor_id
    const targetAtendente = selectedAtendenteTransfer !== 'all'
      ? selectedTransferAtendente
      : null

    if (!targetSetorId || targetSetorId === 'all') {
      toast.error('Selecione o setor de destino')
      return
    }
    if (selectedAtendenteTransfer !== 'all' && !targetAtendente) {
      toast.error('Selecione um atendente compatível com o subsetor')
      return
    }

    setTransferLoading(true)
    try {
      const res = await fetch('/api/tickets/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          setor_id: targetSetorId,
          subsetor_id: selectedTransferSubsetorId,
          colaborador_id: targetAtendente?.id ?? null,
          allow_unavailable: allowUnavailable,
          from_colaborador_nome: selectedTicket.colaboradores?.nome || 'Desconhecido',
          from_setor_nome: selectedTicket.setores?.nome || 'Desconhecido',
        }),
      })

      const result = await res.json().catch(() => null)
      if (!res.ok) {
        if (result?.code === 'TARGET_UNAVAILABLE' && targetAtendente) {
          setTransferUnavailableConfirmOpen(true)
        } else {
          toast.error(result?.error || 'Erro ao transferir ticket')
        }
        return
      }

      if (result?.queued) {
        toast.info(result.message || 'Ticket enviado para a fila')
        fetch('/api/tickets/auto-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {})
      } else {
        toast.success(result?.message || 'Ticket transferido com sucesso')
      }

      handleTransferDialogOpenChange(false)
      closeConversation()
      mutate()
    } catch (error) {
      console.error('[Monitoramento] Erro ao transferir ticket:', error)
      toast.error('Erro ao transferir ticket')
    } finally {
      setTransferLoading(false)
    }
  }

  const attemptTransferTicket = () => {
    if (selectedTransferAtendente && !isAtendenteOnline(selectedTransferAtendente)) {
      setTransferUnavailableConfirmOpen(true)
      return
    }
    void handleTransferTicket()
  }

  const confirmUnavailableTransfer = () => {
    setTransferUnavailableConfirmOpen(false)
    void handleTransferTicket(true)
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Monitoramento</h1>
          <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Ao vivo</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tagsDisponiveis.length > 0 && (
            <MultiSelectFilter
              icon={Tag}
              placeholder="Todas as tags"
              header="Tags"
              pluralWord="tags"
              options={tagsDisponiveis.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor }))}
              selected={tagFilter}
              onChange={(next) => { setTagFilter(next); setSetorFilter([]); setSubsetorFilter([]) }}
              open={tagFiltroOpen}
              onOpenChange={setTagFiltroOpen}
            />
          )}
          <MultiSelectFilter
            icon={Building2}
            placeholder="Todos os setores"
            header="Setores"
            pluralWord="setores"
            options={setoresFiltradosPorTag.map((s: any) => ({ id: s.id, nome: s.nome }))}
            selected={setorFilter}
            onChange={(next) => { setSetorFilter(next); setSubsetorFilter([]) }}
            open={setorFiltroOpen}
            onOpenChange={setSetorFiltroOpen}
            searchable
          />
          {setorFilter.length > 0 && subsetoresDisponiveis.length > 0 && (
            <Popover open={subsetorFiltroOpen} onOpenChange={setSubsetorFiltroOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-2 bg-transparent",
                    subsetorFilter.length > 0 && "border-primary text-primary",
                  )}
                >
                  <Layers className="h-4 w-4" />
                  Subsetor
                  {subsetorFilter.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{subsetorFilter.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtrar por subsetor</p>
                    {subsetorFilter.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubsetorFilter([])}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {[{ id: SEM_SUBSETOR_ID, nome: 'Sem subsetor' }, ...subsetoresDisponiveis].map((s) => {
                      const selected = subsetorFilter.includes(s.id)
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => setSubsetorFilter(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                          aria-pressed={selected}
                          aria-label={`${selected ? 'Remover' : 'Adicionar'} filtro ${s.nome}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                            selected && "font-medium text-primary",
                          )}
                        >
                          <Check className={cn("h-3.5 w-3.5 shrink-0", !selected && "invisible")} />
                          <span className="truncate">{s.nome}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Popover open={filtrosAtendenteOpen} onOpenChange={setFiltrosAtendenteOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-2 bg-transparent",
                  atendenteFilter.length > 0 && "border-primary text-primary"
                )}
              >
                <User className="h-4 w-4" />
                {atendenteFilter.length === 0
                  ? 'Atendente'
                  : atendenteFilter.length === 1
                    ? (atendentesUnicos.find(a => a.id === atendenteFilter[0])?.nome || 'Atendente')
                    : 'Atendentes'}
                {atendenteFilter.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{atendenteFilter.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end" onCloseAutoFocus={() => setFiltroAtendenteSearch('')}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acompanhar atendentes</p>
                  {atendenteFilter.length > 0 && (
                    <button
                      onClick={() => setAtendenteFilter([])}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Buscar atendente..."
                  value={filtroAtendenteSearch}
                  onChange={(e) => setFiltroAtendenteSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <div className="space-y-1 max-h-[280px] overflow-y-auto">
                  {atendentesUnicos
                    .filter(a => !filtroAtendenteSearch || a.nome.toLowerCase().includes(filtroAtendenteSearch.toLowerCase()))
                    .map((a) => {
                      const selected = atendenteFilter.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          onClick={() => setAtendenteFilter(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                            selected && "font-medium text-primary"
                          )}
                        >
                          <Check className={cn("h-3.5 w-3.5 shrink-0", !selected && "invisible")} />
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              a.online ? "bg-green-500" : a.pausa ? "bg-yellow-500" : "bg-gray-400",
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{a.nome}</span>
                        </button>
                      )
                    })}
                  {atendentesUnicos.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum atendente ativo</p>
                  )}
                  {filtroAtendenteSearch && atendentesUnicos.filter(a => a.nome.toLowerCase().includes(filtroAtendenteSearch.toLowerCase())).length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado para &quot;{filtroAtendenteSearch}&quot;</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {monitoringError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <span>Não foi possível atualizar o monitoramento. Os números abaixo podem estar indisponíveis.</span>
          <Button variant="outline" size="sm" onClick={() => mutate()}>Tentar novamente</Button>
        </div>
      )}

      {/* Stats Cards Row 1 */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
        {/* Atendimentos em tempo real */}
        <Card className="glass-card-elevated rounded-2xl border-0 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Atendimentos em tempo real
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-foreground tabular-nums">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-orange-500 tabular-nums">{stats.naFila}</p>
                <p className="text-xs text-muted-foreground">Na fila</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-primary tabular-nums">{stats.emAtendimento}</p>
                <p className="text-xs text-muted-foreground">Em atend.</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-500 tabular-nums">{stats.finalizados}</p>
                <p className="text-xs text-muted-foreground">Finalizados</p>
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold text-foreground tabular-nums whitespace-nowrap">{stats.tempoMaximoFila}</p>
                <p className="text-xs text-muted-foreground">Max. fila</p>
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold text-foreground tabular-nums whitespace-nowrap">{stats.tempoMaximoResposta}</p>
                <p className="text-xs text-muted-foreground">Max. resp.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status dos atendentes */}
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status dos atendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-around text-center gap-2">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-500 tabular-nums">{atendentesStats.online}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-amber-500 tabular-nums">{atendentesStats.pausa}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <p className="text-xs text-muted-foreground">Pausa</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-muted-foreground tabular-nums">{atendentesStats.offline}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <p className="text-xs text-muted-foreground">Offline</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards Row 2 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tempo med. 1a resposta</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.tempoMedioPrimeiraResposta}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tempo med. resolucao</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.tempoMedioResolucao}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tickets recebidos (Hoje)</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.totalRecebidos}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tickets resolvidos (Hoje)</p>
              <p className="text-2xl font-bold text-green-500">{temposHoje.totalResolvidos}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Nexus IA ativo</p>
              <p className="text-2xl font-bold text-blue-500">{nexusConversas.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitoramento Detalhado */}
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Monitoramento detalhado</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pelo N do ticket ou contato"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-9 h-9 rounded-2xl glass-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Tabs + Filtro de colaborador */}
          <div className="border-b border-border mb-4">
            <div className="flex items-end justify-between gap-2">
              <div className="flex gap-0">
                <button
                  onClick={() => setActiveTab('em-andamento')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'em-andamento'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Em andamento
                  {ticketsEmAndamento.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {ticketsEmAndamento.length}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('aguardando')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'aguardando'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Aguardando atendimento
                  {ticketsAguardando.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {ticketsAguardando.length}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('atendentes')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'atendentes'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Atendentes
                  {atendentesRaw.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {atendentesRaw.length}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('nexus-ia')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'nexus-ia'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Nexus IA
                  {nexusConversas.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {nexusConversas.length}
                    </Badge>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {/* Em Andamento Tab */}
            {activeTab === 'em-andamento' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1ª Resposta</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo atend.</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fila</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendente</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsEmAndamento.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="mb-2 h-8 w-8" />
                            <p>Nenhum atendimento em andamento</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ticketsEmAndamento.map((ticket: any) => {
                        const aguardandoResposta = ticket.status === 'em_atendimento' && !ticket.primeira_resposta_em
                        return (
                          <TableRow
                            key={ticket.id}
                            className={cn(
                              aguardandoResposta && "bg-yellow-50/50 dark:bg-yellow-950/20"
                            )}
                          >
                            <TableCell>
                              {aguardandoResposta ? (
                                <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Aguardando...
                                </Badge>
                              ) : (
                                <span className="text-sm tabular-nums text-foreground">{ticket.tempoPrimeiraResposta || '0min'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums text-foreground">{ticket.tempoAtendimento}</TableCell>
                            <TableCell className="text-sm tabular-nums text-foreground font-medium">
                              {ticket.numero ? `#${ticket.numero}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {ticket.canal === 'discord' ? '—' : formatPhone(ticket.telefone)}
                            </TableCell>
                            <TableCell className="text-sm text-foreground max-w-[140px]">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate" title={ticket.contato}>{ticket.contato}</span>
                              </div>
                            </TableCell>
                            <TableCell><OrigemBadge origem={origensMap.get(ticket.id)} setorAtualNome={ticket.setor} compact /></TableCell>
                            <TableCell className="text-sm text-foreground max-w-[160px]">
                              <span className="block truncate" title={ticket.subsetor || 'Sem subsetor'}>
                                {ticket.subsetor || 'Sem subsetor'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {ticket.atendente ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    'h-2 w-2 shrink-0 rounded-full',
                                    isAtendenteOnline(ticket.colaboradores)
                                      ? 'bg-green-500'
                                      : ticket.colaboradores?.pausa_atual_id
                                        ? 'bg-yellow-500'
                                        : 'bg-gray-400'
                                  )} />
                                  {ticket.atendente}
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openConversation(ticket)}
                                aria-label={`Abrir conversa do ticket ${ticket.numero ? `#${ticket.numero}` : ''}`.trim()}
                                title="Abrir conversa"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Atendentes Tab */}
            {activeTab === 'atendentes' && (
              <div className="space-y-4">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar atendente..."
                    value={searchAtendente}
                    onChange={(e) => setSearchAtendente(e.target.value)}
                    className="pl-9 h-9 rounded-2xl glass-input"
                  />
                </div>
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : atendentesLista.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                    <AlertCircle className="mb-2 h-8 w-8" />
                    <p>{searchAtendente ? 'Nenhum atendente encontrado' : 'Nenhum atendente neste setor'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {atendentesLista.map((atendente: any) => {
                      const isOnline = isAtendenteOnline(atendente) && !atendente.pausa_atual_id
                      const isPausa = !!atendente.pausa_atual_id
                      const pausaElapsedMs = isPausa
                        ? computePausaElapsedMs(atendente.pausaInfo, monitoringNowMs)
                        : 0
                      const pausaEstourada = isPausa
                        && isPausaEstourada(atendente.pausaInfo, pausaElapsedMs)
                      const pausaLabel = isPausa
                        ? formatPausaStatusLabel(atendente.pausaInfo, pausaElapsedMs)
                        : null
                      return (
                        <div
                          key={atendente.id}
                          className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3 transition-colors hover:bg-muted/40"
                        >
                          <span
                            className={cn(
                              'h-3 w-3 shrink-0 rounded-full',
                              isOnline
                                ? 'bg-green-500'
                                : pausaEstourada
                                  ? 'bg-red-500'
                                  : isPausa
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-400'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{atendente.nome}</p>
                            <p className={cn(
                              'text-xs',
                              isOnline
                                ? 'text-green-600 dark:text-green-400'
                                : pausaEstourada
                                  ? 'font-medium text-red-600 dark:text-red-400'
                                  : isPausa
                                    ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-muted-foreground'
                            )}>
                              {isOnline ? 'Online' : pausaLabel || 'Offline'}
                            </p>
                          </div>
                          {atendente.ticketsAtivos > 0 && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {atendente.ticketsAtivos} {atendente.ticketsAtivos === 1 ? 'ticket' : 'tickets'}
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Aguardando Tab */}
            {activeTab === 'aguardando' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de espera</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fila</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsAguardando.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="mb-2 h-8 w-8" />
                            <p>Nenhum ticket aguardando</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ticketsAguardando.map((ticket: any) => (
                        <TableRow key={ticket.id} className="bg-orange-50/50 dark:bg-orange-950/20">
                          <TableCell className="text-sm tabular-nums text-orange-600 font-medium">{ticket.tempoEspera}</TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground font-medium">
                            {ticket.numero ? `#${ticket.numero}` : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {ticket.canal === 'discord' ? '—' : formatPhone(ticket.telefone)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-[160px]">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate" title={ticket.contato}>{ticket.contato}</span>
                            </div>
                          </TableCell>
                          <TableCell><OrigemBadge origem={origensMap.get(ticket.id)} setorAtualNome={ticket.setor} compact /></TableCell>
                          <TableCell className="text-xs text-foreground max-w-[160px]">
                            <span className="block truncate" title={ticket.subsetor || 'Sem subsetor'}>
                              {ticket.subsetor || 'Sem subsetor'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openConversation(ticket)}
                              aria-label={`Abrir conversa do ticket ${ticket.numero ? `#${ticket.numero}` : ''}`.trim()}
                              title="Abrir conversa"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {activeTab === 'nexus-ia' && (
              <div className="space-y-3">
                {(data?.nexusChannelWarnings?.length ?? 0) > 0 && (
                  <div className="mx-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300" role="status">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Canais com configuração duplicada foram ignorados na monitoria ao vivo.</span>
                  </div>
                )}
                {data?.nexusChannelError && (
                  <div className="mx-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>A monitoria Nexus está indisponível; os demais dados continuam atualizados.</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultima msg bot</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numero</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor IA</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultimo envio</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : nexusConversas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Bot className="mb-2 h-8 w-8" />
                            <p>Nenhuma conversa recente do Nexus sem ticket</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      nexusConversas.map((conversation) => (
                        <TableRow key={`${conversation.setorId}-${conversation.clienteKey}`}>
                          <TableCell className="text-sm tabular-nums text-blue-600 font-medium">
                            {formatRelativeTime(conversation.lastBotMessageAt)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-[180px]">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate" title={conversation.contato}>{conversation.contato}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {formatPhone(conversation.telefone)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Bot className="h-3 w-3" />
                              {conversation.setorNome}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'Cliente' : 'Nexus'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">
                            {conversation.messages.length}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setSelectedNexusConversation(conversation)}
                              aria-label={`Abrir conversa Nexus de ${conversation.contato}`}
                              title="Abrir conversa Nexus"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Encerrar Dialog */}
      <AlertDialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Encerrar ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar este ticket? O ticket será movido para o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEncerrarTicket}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ✅ Confirmar Encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={handleTransferDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transferir Ticket
            </DialogTitle>
            <DialogDescription>
              Selecione o subsetor e envie para a fila ou para um atendente compatível.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={transferTab} onValueChange={handleTransferTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="atendente">👤 Atendente</TabsTrigger>
              <TabsTrigger value="setor">🏢 Setor</TabsTrigger>
            </TabsList>

            <TabsContent value="atendente" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Subsetor do atendimento</Label>
                {transferOptionsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando opções...
                  </p>
                ) : subsetoresTransfer.length > 0 ? (
                  <Select value={selectedSubsetorTransfer} onValueChange={handleSubsetorTransferChange}>
                    <SelectTrigger aria-label="Subsetor do atendimento">
                      <SelectValue placeholder="Escolha um subsetor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {subsetoresTransfer.map((subsetor) => (
                        <SelectItem key={subsetor.id} value={subsetor.id}>
                          {subsetor.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Este setor não possui subsetores ativos. Será usada a fila geral.
                  </p>
                )}
              </div>

              {transferSubsetorSelectionReady && !transferOptionsLoading && (
                <div className="space-y-2">
                  <Label>Atendente compatível</Label>
                  <Select
                    value={selectedAtendenteTransfer === 'all' ? '' : selectedAtendenteTransfer}
                    onValueChange={setSelectedAtendenteTransfer}
                    disabled={transferAtendentesCompativeis.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um atendente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {transferAtendentesCompativeis.map((atendente) => {
                        const online = isAtendenteOnline(atendente)
                        const status = atendente.pausa_atual_id
                          ? 'Em pausa'
                          : online ? 'Online' : 'Offline'
                        return (
                          <SelectItem key={atendente.id} value={atendente.id}>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'h-2 w-2 rounded-full',
                                online ? 'bg-green-500' : atendente.pausa_atual_id ? 'bg-amber-500' : 'bg-gray-400',
                              )} />
                              <span>{atendente.nome}</span>
                              <span className="text-xs text-muted-foreground">· {status}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {transferAtendentesCompativeis.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum outro atendente compatível com este subsetor.
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={attemptTransferTicket}
                disabled={
                  !transferSubsetorSelectionReady
                  || selectedAtendenteTransfer === 'all'
                  || !selectedTransferAtendente
                  || transferLoading
                  || transferOptionsLoading
                }
                className="w-full"
              >
                {transferLoading ? 'Transferindo...' : 'Transferir para Atendente'}
              </Button>
            </TabsContent>

            <TabsContent value="setor" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Selecione o setor de destino</Label>
                <Select value={selectedSetorTransfer} onValueChange={handleSetorTransferChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um setor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {setoresTransfer.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Nenhum setor habilitado para transferência. Configure em Configurações do Setor.
                      </div>
                    ) : (
                      setoresTransfer.map((setor) => (
                        <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedSetorTransfer !== 'all' && (
                <div className="space-y-2">
                  <Label>Subsetor de destino</Label>
                  {transferOptionsLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando opções...
                    </p>
                  ) : subsetoresTransfer.length > 0 ? (
                    <Select value={selectedSubsetorTransfer} onValueChange={handleSubsetorTransferChange}>
                      <SelectTrigger aria-label="Subsetor de destino">
                        <SelectValue placeholder="Escolha um subsetor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {subsetoresTransfer.map((subsetor) => (
                          <SelectItem key={subsetor.id} value={subsetor.id}>
                            {subsetor.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      Este setor não possui subsetores ativos. O ticket ficará na fila geral.
                    </p>
                  )}
                </div>
              )}

              {selectedSetorTransfer !== 'all' && transferSubsetorSelectionReady && !transferOptionsLoading && (
                <div className="space-y-2">
                  <Label>Destino final</Label>
                  <Select value={selectedAtendenteTransfer} onValueChange={setSelectedAtendenteTransfer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Deixar na fila..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          {selectedTransferSubsetorId
                            ? 'Deixar na fila do subsetor'
                            : 'Deixar na fila geral'}
                        </div>
                      </SelectItem>
                      {transferAtendentesCompativeis.map((atendente) => {
                        const online = isAtendenteOnline(atendente)
                        const status = atendente.pausa_atual_id
                          ? 'Em pausa'
                          : online ? 'Online' : 'Offline'
                        return (
                          <SelectItem key={atendente.id} value={atendente.id}>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'h-2 w-2 rounded-full',
                                online ? 'bg-green-500' : atendente.pausa_atual_id ? 'bg-amber-500' : 'bg-gray-400',
                              )} />
                              <span>{atendente.nome}</span>
                              <span className="text-xs text-muted-foreground">· {status}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {transferAtendentesCompativeis.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum atendente compatível. O ticket permanecerá na fila selecionada.
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={attemptTransferTicket}
                disabled={
                  selectedSetorTransfer === 'all'
                  || !transferSubsetorSelectionReady
                  || transferLoading
                  || transferOptionsLoading
                }
                className="w-full"
              >
                {transferLoading
                  ? 'Transferindo...'
                  : selectedAtendenteTransfer === 'all'
                    ? 'Enviar para a Fila'
                    : 'Transferir para Atendente'}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={transferUnavailableConfirmOpen}
        onOpenChange={setTransferUnavailableConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Transferir para atendente indisponível?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedTransferAtendente?.nome}</strong> está{' '}
              {selectedTransferAtendente?.pausa_atual_id ? 'em pausa' : 'offline'}
              {' '}no momento. O ticket será atribuído diretamente mesmo assim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnavailableTransfer}>
              Transferir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conversation Slide-out Panel */}
      {selectedTicket && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={closeConversation} />

          <div className="absolute inset-0 flex flex-col bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Ticket #{selectedTicket.numero}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedTicket.contato} - {selectedTicket.setor}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeConversation}
                aria-label="Fechar conversa"
                title="Fechar conversa"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tabs */}
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setConversationTab('conversa')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'conversa'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageCircle className="inline h-3.5 w-3.5 mr-1.5" />
                  Conversa
                </button>
                <button
                  onClick={() => setConversationTab('historico')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'historico'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="inline h-3.5 w-3.5 mr-1.5" />
                  Historico ({ticketHistory.length})
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            {(selectedTicket.status === 'em_atendimento' || selectedTicket.status === 'aberto') && (
              <div className="flex gap-2 border-b px-4 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openTransferDialog}
                  className="flex-1 gap-1 bg-transparent"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Transferir
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setEncerrarDialogOpen(true)}
                  className="flex-1 gap-1"
                >
                  <XCircle className="h-4 w-4" />
                  Encerrar
                </Button>
              </div>
            )}

            {/* Tab Content */}
            <div ref={conversationScrollRef} className="flex-1 overflow-y-auto">
              {/* Conversa Tab */}
              {conversationTab === 'conversa' && (
                <div className="p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : conversationMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                      <MessageCircle className="mb-2 h-8 w-8" />
                      <p>Nenhuma mensagem ainda</p>
                    </div>
                  ) : (
                    conversationMessages.map((msg: any) => (
                      msg.remetente === 'sistema' ? (
                        <div key={msg.id} className="flex justify-center">
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] max-w-[90%]",
                            msg.conteudo.startsWith('Transferido')
                              ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                              : "bg-muted/80 border-border text-muted-foreground"
                          )}>
                            {msg.conteudo.startsWith('Transferido') ? (
                              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                            <span>{msg.conteudo}</span>
                            <span className="shrink-0 ml-1 opacity-60">
                              {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            isClientMessage(msg.remetente) ? "justify-start" : "justify-end"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                              isClientMessage(msg.remetente)
                                ? "bg-muted"
                                : isBotMessage(msg.remetente)
                                ? "bg-blue-100 dark:bg-blue-900/30"
                                : "bg-primary text-primary-foreground"
                            )}
                          >
                            <MessageMediaPreview
                              url={msg.url_imagem}
                              mediaType={msg.media_type}
                              tipo={msg.tipo}
                              conteudo={msg.conteudo}
                            />
                            <TextoMensagem conteudo={msg.conteudo} />
                            <p className={cn(
                              "text-[10px] mt-1",
                              isClientMessage(msg.remetente) ? "text-muted-foreground" : "opacity-70"
                            )}>
                              {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    ))
                  )}
                </div>
              )}

              {/* Historico Tab */}
              {conversationTab === 'historico' && (
                <div className="p-4 space-y-3">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : ticketHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                      <History className="mb-2 h-8 w-8" />
                      <p>Nenhum atendimento anterior</p>
                    </div>
                  ) : (
                    ticketHistory.map((ticket: any) => (
                      <div key={ticket.id} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => loadHistoryMessages(ticket.id)}
                          className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={ticket.status === 'encerrado' ? 'secondary' : 'default'}
                                className="text-[10px] px-1.5 h-5"
                              >
                                {ticket.status === 'encerrado' ? 'Encerrado' : ticket.status === 'em_atendimento' ? 'Em atendimento' : 'Aberto'}
                              </Badge>
                              <span className="text-xs font-mono font-medium">#{ticket.numero}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(ticket.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              {' '}
                              {new Date(ticket.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <span>{ticket.setores?.nome || '-'}</span>
                            <span>-</span>
                            <span>{ticket.colaboradores?.nome || 'Sem atendente'}</span>
                          </div>
                        </button>

                        {/* Expanded messages */}
                        {expandedHistory === ticket.id && (
                          <div className="border-t bg-muted/30 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                            {!historyMessages[ticket.id] ? (
                              <div className="flex justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : historyMessages[ticket.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">Sem mensagens</p>
                            ) : (
                              historyMessages[ticket.id].map((msg: any) => (
                                msg.remetente === 'sistema' ? (
                                  <div key={msg.id} className="flex justify-center">
                                    <div className={cn(
                                      "flex items-center gap-1.5 px-2 py-1 rounded text-[10px]",
                                      msg.conteudo.startsWith('Transferido')
                                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                                        : "bg-muted text-muted-foreground"
                                    )}>
                                      {msg.conteudo.startsWith('Transferido') ? (
                                        <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" />
                                      ) : (
                                        <Megaphone className="h-2.5 w-2.5 shrink-0" />
                                      )}
                                      <span>{msg.conteudo}</span>
                                      <span className="opacity-60">
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={msg.id}
                                    className={cn(
                                      "flex",
                                      isClientMessage(msg.remetente) ? "justify-start" : "justify-end"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "max-w-[80%] rounded px-2 py-1 text-[11px]",
                                        isClientMessage(msg.remetente)
                                          ? "bg-background border"
                                          : "bg-primary/80 text-primary-foreground"
                                      )}
                                    >
                                      <TextoMensagem conteudo={msg.conteudo} />
                                      <p className="text-[9px] mt-0.5 opacity-60">
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                )
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedNexusConversation && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedNexusConversation(null)} />

          <div className="absolute inset-0 flex flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <h2 className="truncate font-semibold">Nexus IA</h2>
                  <Badge variant="outline" className="text-[10px]">Sem ticket</Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedNexusConversation.contato} - {selectedNexusConversation.setorNome}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNexusConversation(null)}
                aria-label="Fechar conversa Nexus"
                title="Fechar conversa Nexus"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="border-b px-4 py-2">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="font-semibold text-foreground">{formatPhone(selectedNexusConversation.telefone)}</p>
                  <p className="text-muted-foreground">Numero</p>
                </div>
                <div>
                  <p className="font-semibold text-blue-600">{formatRelativeTime(selectedNexusConversation.lastBotMessageAt)}</p>
                  <p className="text-muted-foreground">Ultimo bot</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selectedNexusConversation.messages.length}</p>
                  <p className="text-muted-foreground">Mensagens</p>
                </div>
              </div>
            </div>

            <div ref={nexusConversationScrollRef} className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {selectedNexusConversation.messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.remetente === NEXUS_CLIENT_REMETENTE ? "justify-start" : "justify-end"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                        msg.remetente === NEXUS_CLIENT_REMETENTE
                          ? "bg-muted"
                          : "bg-blue-100 text-blue-950 dark:bg-blue-900/30 dark:text-blue-50"
                      )}
                    >
                      <MessageMediaPreview
                        url={msg.url_imagem}
                        mediaType={msg.media_type}
                        tipo={msg.tipo}
                        conteudo={msg.conteudo}
                      />
                      <TextoMensagem conteudo={msg.conteudo} className="whitespace-pre-wrap" />
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
                        <span>{msg.remetente === NEXUS_CLIENT_REMETENTE ? 'Cliente' : 'Nexus'}</span>
                        <span>
                          {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
