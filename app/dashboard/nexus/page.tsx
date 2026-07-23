'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Activity, Bot, Building2, ChevronLeft, ChevronRight, CircleSlash, Headset, Layers, MessageCircle, RefreshCw, Search, Tag, Ticket, TrendingUp, User, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { MessageMediaPreview } from '@/components/chat/message-media-preview'
import { TextoMensagem } from '@/components/chat/texto-mensagem'
import { MultiSelectFilter } from '@/components/monitoramento/multi-select-filter'
import { isAtendenteOnline } from '@/components/setor/atendentes-status-modal'
import {
  formatNexusAttendanceType,
  getNexusConversationScopeKey,
  getNexusMessageActorLabel,
  getNexusMessagePhase,
  isMissingSupabaseRelation,
  isNexusRelevantMessage,
  matchesNexusTicketConversationFilter,
  mergeNexusTicketTimeline,
  shouldStartNewNexusSession,
} from '@/lib/nexus-monitoring'
import { normalizeBrazilianPhone } from '@/lib/phone'
import { cn, isClientMessage } from '@/lib/utils'
import { calculateWorkloadOs, type WorkloadOsLevel } from '@/lib/workload-os'

const NEXUS_BOT_VISIBILITY_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_BOT_VISIBILITY_MINUTES || 10)
const NEXUS_MESSAGE_LOOKBACK_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_MESSAGE_LOOKBACK_MINUTES || 60)
const NEXUS_CLIENT_REMETENTE = 'cliente-nexus'
const NEXUS_BOT_REMETENTE = 'bot-nexus'
// Tags inequívocas do Nexus — seguro usar em qualquer contexto (com ou sem ticket_id).
const NEXUS_REMETENTES = [NEXUS_CLIENT_REMETENTE, NEXUS_BOT_REMETENTE]
// O fluxo do n8n nem sempre marca a resposta do cliente na fase bot como
// 'cliente-nexus' — em volume relevante ele grava só 'cliente' (mesmo com
// ticket_id ainda nulo). MAS 'cliente' é também a tag NORMAL de qualquer
// mensagem de cliente já em atendimento humano — só é seguro tratá-la como
// "órfã do Nexus" quando ticket_id ainda é nulo. Usar isso sem essa checagem
// (ex: numa query sem filtro de ticket_id) varreria TODO o histórico de
// clientes do sistema, não só o do Nexus — foi exatamente isso que deixou a
// aba "Atendimentos" lenta/travada.
const NEXUS_ORPHAN_CLIENT_REMETENTE = 'cliente'
// IMPORTANTE: 'bot' (sem sufixo -nexus) NÃO é o Nexus — é um bot/sistema
// diferente. Nunca incluir aqui nem tratar como equivalente a 'bot-nexus'.
const NEXUS_TIMELINE_REMETENTES = [...NEXUS_REMETENTES, NEXUS_ORPHAN_CLIENT_REMETENTE, 'colaborador']
// Intervalo sem mensagens que separa um atendimento do próximo (novo contato).
const NEXUS_SESSION_GAP_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_SESSION_GAP_MINUTES || 40)
const NEXUS_ATENDIMENTOS_PAGE_SIZE = 12
const POSTGREST_IN_CHUNK_SIZE = 200
let nexusOccurrencesAvailability: boolean | null = null

const WORKLOAD_OS_TONES: Record<WorkloadOsLevel, { value: string; badge: string }> = {
  critical: {
    value: 'text-destructive',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  attention: {
    value: 'text-orange-600 dark:text-orange-400',
    badge: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  },
  light: {
    value: 'text-amber-600 dark:text-amber-400',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  'very-light': {
    value: 'text-emerald-600 dark:text-emerald-400',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  uncovered: {
    value: 'text-destructive',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  unavailable: {
    value: 'text-muted-foreground',
    badge: 'border-border bg-muted text-muted-foreground',
  },
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

function formatPhone(phone: string | null) {
  if (!phone) return '-'
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('55') && num.length > 11) num = num.slice(2)
  if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  return num
}

// Tempo decorrido desde a última mensagem (recência).
function formatRelativeTime(date: string | null) {
  if (!date) return 'sem horário'
  const diffMs = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}min`
}

// Duração da conversa do bot (1ª → última mensagem) no formato HH:MM:SS,
// igual ao "tempo de atendimento" do monitoramento e da tela do setor.
function formatDuration(messages: any[]) {
  if (!messages || messages.length === 0) return '00:00:00'
  const start = messages[0]?.enviado_em
  const end = messages[messages.length - 1]?.enviado_em
  if (!start || !end) return '00:00:00'
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

type AtendimentoDesfecho = 'ticket' | 'encerrada'
type AtendimentoSituation = 'encerrada_sem_ticket' | 'em_conversa' | 'finalizado'

const ATENDIMENTO_SITUATION_OPTIONS: Array<{ id: AtendimentoSituation; nome: string }> = [
  { id: 'encerrada_sem_ticket', nome: 'Finalizados sem ticket' },
  { id: 'em_conversa', nome: 'Em conversa com atendente' },
  { id: 'finalizado', nome: 'Finalizados pelo atendente' },
]

type NexusAtendimento = NexusConversation & {
  desfecho: AtendimentoDesfecho
  ticket: {
    id: string
    numero: number | null
    status: string
    atendente: string | null
    tipoAtendimento: string | null
  } | null
}

// O drawer é compartilhado entre as abas: aceita uma conversa ao vivo ou um
// atendimento (que carrega desfecho/ticket).
type SelectedConversation = NexusConversation & {
  desfecho?: AtendimentoDesfecho
  ticket?: NexusAtendimento['ticket']
}

function DesfechoBadge({ atendimento }: { atendimento: NexusAtendimento }) {
  if (atendimento.desfecho === 'ticket') {
    const ticket = atendimento.ticket
    const statusLabel = ticket?.status === 'encerrado'
      ? 'Encerrado'
      : ticket?.status === 'em_atendimento'
      ? 'Em atendimento'
      : 'Aberto'
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="w-fit gap-1 rounded-md border-border text-[10px] font-medium text-foreground">
          <Ticket className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          Ticket{ticket?.numero ? <span className="font-mono tabnums"> #{ticket.numero}</span> : ''} · {statusLabel}
        </Badge>
        {ticket?.atendente && <span className="pl-1 text-[10px] text-muted-foreground">{ticket.atendente}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Encerrada sem ticket
    </div>
  )
}

// Botão "Abrir ticket" com escolha de destino: lista os setores permitidos para
// transferência (setor_destinos_transferencia) a partir do setor da conversa;
// se não houver nenhum, oferece os subsetores do setor atual.
function AbrirTicketButton({
  conversation,
  opening,
  onConfirm,
  variant,
}: {
  conversation: NexusConversation
  opening: boolean
  onConfirm: (conversation: NexusConversation, destino: { setorId: string; subsetorId: string | null }) => void
  variant: 'row' | 'drawer'
}) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState<'setor' | 'subsetor' | 'atual'>('atual')
  const [options, setOptions] = useState<{ id: string; nome: string }[]>([])

  const loadOptions = async () => {
    setLoading(true)
    try {
      const { data: destinos } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id, setores:setor_destino_id(id, nome)')
        .eq('setor_origem_id', conversation.setorId)

      const setoresDestino = (destinos || [])
        .map((d: any) => d.setores)
        .filter(Boolean)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome))

      if (setoresDestino.length > 0) {
        // Sempre inclui o setor atual como primeira opção (sem duplicar).
        setTipo('setor')
        setOptions([
          { id: conversation.setorId, nome: conversation.setorNome },
          ...setoresDestino.filter((s: any) => s.id !== conversation.setorId),
        ])
        return
      }

      const { data: subs } = await supabase
        .from('subsetores')
        .select('id, nome')
        .eq('setor_id', conversation.setorId)
        .order('nome')

      if (subs && subs.length > 0) {
        setTipo('subsetor')
        setOptions(subs)
      } else {
        setTipo('atual')
        setOptions([])
      }
    } finally {
      setLoading(false)
    }
  }

  const escolher = (destino: { setorId: string; subsetorId: string | null }) => {
    setOpen(false)
    onConfirm(conversation, destino)
  }

  const label = opening ? 'Abrindo…' : 'Abrir ticket'
  const triggerButton =
    variant === 'drawer' ? (
      <Button size="sm" className="h-8 gap-1.5" disabled={opening}>
        <Headset className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="h-10 gap-1 text-[11px] sm:h-7" disabled={opening}>
        <Headset className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Button>
    )

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadOptions() }}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : tipo === 'setor' ? (
          <div className="space-y-0.5">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Abrir ticket no setor</p>
            {options.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolher({ setorId: s.id, subsetorId: null })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{s.nome}</span>
                {s.id === conversation.setorId && (
                  <Badge variant="secondary" className="ml-auto h-4 shrink-0 px-1 text-[9px]">atual</Badge>
                )}
              </button>
            ))}
          </div>
        ) : tipo === 'subsetor' ? (
          <div className="space-y-0.5">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escolha o subsetor</p>
            {options.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolher({ setorId: conversation.setorId, subsetorId: s.id })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{s.nome}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => escolher({ setorId: conversation.setorId, subsetorId: null })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sem subsetor (setor atual)
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-1">
            <p className="text-xs text-muted-foreground">Sem setor de transferência configurado para este setor.</p>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => escolher({ setorId: conversation.setorId, subsetorId: null })}
            >
              <Headset className="h-4 w-4" aria-hidden="true" />
              Abrir no setor atual
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const RANGE_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '15d', label: 'Últimos 15 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '60d', label: 'Últimos 60 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
] as const

type RangeValue = (typeof RANGE_OPTIONS)[number]['value']

const RANGE_DIAS: Record<Exclude<RangeValue, 'hoje'>, number> = {
  '24h': 1,
  '7d': 7,
  '15d': 15,
  '30d': 30,
  '60d': 60,
  '90d': 90,
}

function rangeToSince(range: RangeValue): string {
  if (range === 'hoje') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  const dias = RANGE_DIAS[range] ?? 7
  return new Date(Date.now() - dias * 24 * 3600_000).toISOString()
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
  const rows: any[] = []
  for (const valueChunk of chunkValues(values)) {
    let query: any = supabase.from(table).select(columns).in(filterColumn, valueChunk)
    if (configure) query = configure(query)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

async function loadRowsByIds(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  ids: readonly string[],
) {
  return loadRowsByValues(supabase, table, columns, 'id', ids)
}

async function loadRowsByPages(
  createQuery: () => any,
  pageSize = 1000,
) {
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

async function loadOptionalNexusOccurrences(loader: () => Promise<any[]>) {
  if (nexusOccurrencesAvailability === false) {
    return { rows: [] as any[], available: false }
  }

  try {
    const rows = await loader()
    nexusOccurrencesAvailability = true
    return { rows, available: true }
  } catch (error) {
    if (isMissingSupabaseRelation(error, 'nexus_ocorrencias')) {
      nexusOccurrencesAvailability = false
      return { rows: [] as any[], available: false }
    }
    throw error
  }
}

async function loadNexusTicketsByIds(
  supabase: ReturnType<typeof createClient>,
  ticketIds: readonly string[],
) {
  const rows: any[] = []

  for (const idsChunk of chunkValues(ticketIds)) {
    let result: any = await supabase
      .from('tickets')
      .select('id, numero, status, colaborador_id, tipo_atendimento, tipo_atendimento_id')
      .in('id', idsChunk)

    const missingClassifierColumn = result.error
      && ['42703', 'PGRST204'].includes(result.error.code || '')
      && result.error.message.includes('tipo_atendimento')

    if (missingClassifierColumn) {
      result = await supabase
        .from('tickets')
        .select('id, numero, status, colaborador_id, tipo_atendimento_id')
        .in('id', idsChunk)
    }

    if (result.error) throw result.error
    rows.push(...(result.data || []))
  }

  return rows
}

// Resolve os setores com IA acessíveis e devolve um mapeador mensagem→setor
// pelo canal (phone_number_id / instancia). Compartilhado pelos fetchers
// "ao vivo" e "atendimentos" para não duplicar a resolução.
async function loadNexusSetores(
  supabase: ReturnType<typeof createClient>,
  setorIds: string[],
) {
  const { data: setoresIaData, error } = await supabase
    .from('setores')
    .select('id, nome, assistente_ia, setor_canais(tipo, ativo, instancia, phone_number_id)')
    .in('id', setorIds)
    .eq('assistente_ia', true)

  if (error) throw error

  const setoresIa = setoresIaData || []
  // Mapa único de identificador de canal → setor. O identificador do canal pode
  // estar em `phone_number_id` (WhatsApp Cloud API) OU em `instancia` (Evolution
  // API). Na MENSAGEM, ambos os casos chegam na coluna `phone_number_id` (a tabela
  // mensagens não tem coluna `instancia`). Por isso indexamos os dois sob a mesma
  // chave crua — sem prefixo — pra o lookup da mensagem cruzar com qualquer um.
  const channelSetores = new Map<string, { id: string; nome: string }>()

  for (const setor of setoresIa as any[]) {
    for (const canal of setor.setor_canais || []) {
      if (!canal.ativo) continue
      if (canal.phone_number_id) channelSetores.set(canal.phone_number_id, setor)
      if (canal.instancia) channelSetores.set(canal.instancia, setor)
    }
  }

  const resolveSetor = (message: any): { id: string; nome: string } | null => {
    const canalId = message.phone_number_id
    if (canalId) {
      // Tem identificador de canal: só atribui se casar com um setor carregado.
      // Se não casar, a mensagem é de OUTRO setor — não pode cair no fallback
      // (senão, ao filtrar por 1 setor, tudo seria atribuído a ele).
      return channelSetores.get(canalId) ?? null
    }
    // Sem identificador de canal não existe atribuição segura a um setor.
    return null
  }

  return { setoresIa, resolveSetor, channelIds: [...channelSetores.keys()] }
}

export default function NexusPage() {
  const supabase = useMemo(() => createClient(), [])
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [tagFiltroOpen, setTagFiltroOpen] = useState(false)
  const [setorFilter, setSetorFilter] = useState<string[]>([])
  const [setorFiltroOpen, setSetorFiltroOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'ao-vivo' | 'atendimentos'>('ao-vivo')
  const [rangeFilter, setRangeFilter] = useState<RangeValue>('hoje')
  const [atendimentoSituationFilters, setAtendimentoSituationFilters] = useState<AtendimentoSituation[]>([])
  const [atendimentoSituationFilterOpen, setAtendimentoSituationFilterOpen] = useState(false)
  const [atendimentosPage, setAtendimentosPage] = useState(0)
  const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(null)
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)

  const tagsDisponiveis = useMemo(() => {
    const tags = new Map<string, { id: string; nome: string; cor: string }>()
    setoresAcessiveis.forEach((setor: any) => {
      if (setor.tags) tags.set(setor.tags.id, setor.tags)
    })
    return Array.from(tags.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [setoresAcessiveis])

  const setoresFiltradosPorTag = useMemo(() => {
    if (tagFilter.length === 0) return setoresAcessiveis
    return setoresAcessiveis.filter((setor: any) => setor.tags?.id && tagFilter.includes(setor.tags.id))
  }, [setoresAcessiveis, tagFilter])

  const setorIdsFiltrados = useMemo(() => {
    const setores = setorFilter.length === 0
      ? setoresFiltradosPorTag
      : setoresFiltradosPorTag.filter((setor: any) => setorFilter.includes(setor.id))
    return setores.map((setor: any) => setor.id)
  }, [setorFilter, setoresFiltradosPorTag])

  const { data, error: liveError, isLoading, mutate } = useSWR(
    colaborador && setorIdsFiltrados.length > 0
      ? ['dashboard-nexus', setorIdsFiltrados.join(','), tagFilter.join(','), setorFilter.join(',')]
      : null,
    async () => {
      const until = new Date().toISOString()
      const activeSince = new Date(Date.now() - NEXUS_BOT_VISIBILITY_MINUTES * 60000).toISOString()
      const lookbackSince = new Date(
        Date.now() - Math.max(NEXUS_MESSAGE_LOOKBACK_MINUTES, NEXUS_BOT_VISIBILITY_MINUTES) * 60000,
      ).toISOString()

      const { setoresIa, resolveSetor, channelIds } = await loadNexusSetores(supabase, setorIdsFiltrados)
      const setorIaIds = setoresIa.map((setor: any) => setor.id)

      const [nexusMessagesDesc, activeTicketsData, attendantLinksData] = setoresIa.length > 0
        ? await Promise.all([
            channelIds.length > 0
              ? loadRowsByPages(() => supabase
                  .from('mensagens')
                  .select('id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type, phone_number_id, clientes(id, nome, telefone)')
                  .is('ticket_id', null)
                  .in('remetente', [...NEXUS_REMETENTES, NEXUS_ORPHAN_CLIENT_REMETENTE])
                  .in('phone_number_id', channelIds)
                  .gte('enviado_em', lookbackSince)
                  .lte('enviado_em', until)
                  .order('enviado_em', { ascending: false })
                  .order('id', { ascending: false }))
              : Promise.resolve([]),
            loadRowsByPages(() => supabase
              .from('tickets')
              .select('id')
              .in('setor_id', setorIaIds)
              .in('status', ['aberto', 'em_atendimento'])
              .order('id', { ascending: true })),
            loadRowsByPages(() => supabase
              .from('colaboradores_setores')
              .select('colaborador_id, colaboradores(id, is_online, ativo, pausa_atual_id, last_heartbeat)')
              .in('setor_id', setorIaIds)
              .order('colaborador_id', { ascending: true })),
          ])
        : [[], [], []]

      const nexusMessages = [...nexusMessagesDesc].reverse()

      const activeTicketIds = activeTicketsData.map((ticket: any) => ticket.id)
      const attendantsById = new Map<string, any>()
      for (const link of attendantLinksData) {
        const attendant = Array.isArray((link as any).colaboradores)
          ? (link as any).colaboradores[0]
          : (link as any).colaboradores
        if (attendant?.id) attendantsById.set(attendant.id, attendant)
      }
      const onlineAttendants = [...attendantsById.values()].filter(isAtendenteOnline)
      // Mesmo source-of-truth da tela do setor: todos os tickets ativos dos
      // setores IA filtrados divididos pelos atendentes online desses setores.
      const workload = calculateWorkloadOs(activeTicketIds.length, onlineAttendants.length)
      const clienteIds = new Set<string>()
      const telefones = new Set<string>()
      const telefonePorClienteId = new Map<string, string>()

      for (const message of nexusMessages) {
        if (message.cliente_id) clienteIds.add(message.cliente_id)
        const telefone = (message as any).clientes?.telefone
        if (telefone) {
          telefones.add(telefone)
          const telefoneNormalizado = normalizeBrazilianPhone(telefone)
          if (message.cliente_id && telefoneNormalizado) {
            telefonePorClienteId.set(message.cliente_id, telefoneNormalizado)
          }
        }
      }

      const clientesPorTelefone = telefones.size > 0
        ? await loadRowsByValues(supabase, 'clientes', 'id, telefone', 'telefone', Array.from(telefones))
        : []

      for (const cliente of clientesPorTelefone) {
        clienteIds.add(cliente.id)
        const telefoneNormalizado = normalizeBrazilianPhone(cliente.telefone)
        if (telefoneNormalizado) telefonePorClienteId.set(cliente.id, telefoneNormalizado)
      }

      const ticketsAtivos = clienteIds.size > 0
        ? await loadRowsByValues(
            supabase,
            'tickets',
            'cliente_id, setor_id',
            'cliente_id',
            Array.from(clienteIds),
            (query) => query.in('setor_id', setorIaIds).in('status', ['aberto', 'em_atendimento']),
          )
        : []

      const clientesComTicketAtivo = new Set<string>()
      const telefonesComTicketAtivo = new Set<string>()
      for (const ticket of ticketsAtivos) {
        if (!ticket.cliente_id || !ticket.setor_id) continue
        clientesComTicketAtivo.add(`${ticket.setor_id}::${ticket.cliente_id}`)
        const telefone = telefonePorClienteId.get(ticket.cliente_id)
        if (telefone) telefonesComTicketAtivo.add(`${ticket.setor_id}::${telefone}`)
      }

      const [ocorrenciasPorCliente, ocorrenciasPorTelefone] = await Promise.all([
        clienteIds.size > 0
          ? loadOptionalNexusOccurrences(() => loadRowsByValues(
                supabase,
                'nexus_ocorrencias',
                'id, cliente_id, telefone, setor_id',
                'cliente_id',
                Array.from(clienteIds),
                (query) => query.eq('status', 'aberta').gte('criado_em', lookbackSince),
              ))
          : Promise.resolve({ rows: [] as any[], available: false }),
        telefones.size > 0
          ? loadOptionalNexusOccurrences(() => loadRowsByValues(
                supabase,
                'nexus_ocorrencias',
                'id, cliente_id, telefone, setor_id',
                'telefone',
                Array.from(telefones),
                (query) => query.eq('status', 'aberta').gte('criado_em', lookbackSince),
              ))
          : Promise.resolve({ rows: [] as any[], available: false }),
      ])
      const nexusOccurrencesAvailable = ocorrenciasPorCliente.available || ocorrenciasPorTelefone.available

      const clientesComOcorrencia = new Set<string>()
      const telefonesComOcorrencia = new Set<string>()
      const clientesComOcorrenciaSemSetor = new Set<string>()
      const telefonesComOcorrenciaSemSetor = new Set<string>()
      const ocorrenciasRecentes = Array.from(new Map(
        [...ocorrenciasPorCliente.rows, ...ocorrenciasPorTelefone.rows]
          .map((ocorrencia: any) => [ocorrencia.id, ocorrencia]),
      ).values())
      for (const ocorrencia of ocorrenciasRecentes) {
        const telefoneNormalizado = normalizeBrazilianPhone(ocorrencia.telefone)
        if (ocorrencia.setor_id) {
          if (ocorrencia.cliente_id) clientesComOcorrencia.add(`${ocorrencia.setor_id}::${ocorrencia.cliente_id}`)
          if (telefoneNormalizado) telefonesComOcorrencia.add(`${ocorrencia.setor_id}::${telefoneNormalizado}`)
          continue
        }
        if (ocorrencia.cliente_id) clientesComOcorrenciaSemSetor.add(ocorrencia.cliente_id)
        if (telefoneNormalizado) telefonesComOcorrenciaSemSetor.add(telefoneNormalizado)
      }

      // O bot Nexus manda a resposta por um phone_number_id CENTRALIZADO (compartilhado
      // entre setores), diferente do número que o cliente usa pra falar com cada setor —
      // então resolveSetor() por phone_number_id da PRÓPRIA mensagem funciona pro lado do
      // cliente, mas atribui a mensagem do bot ao setor DONO desse número compartilhado
      // (quase sempre errado). Por isso, o bot herda o setor do cliente na mesma conversa
      // (por telefone/cliente_id), resolvido só a partir das mensagens do lado do cliente.
      const setorPorContato = new Map<string, { id: string; nome: string }>()
      for (const message of nexusMessages) {
        if (message.remetente === NEXUS_BOT_REMETENTE) continue
        const setorCliente = resolveSetor(message)
        if (!setorCliente) continue
        const clienteMsg = (message as any).clientes
        const telefoneCliente = normalizeBrazilianPhone(clienteMsg?.telefone)
        if (telefoneCliente) setorPorContato.set(telefoneCliente, setorCliente)
        if (message.cliente_id) setorPorContato.set(message.cliente_id, setorCliente)
      }

      const groups = new Map<string, Omit<NexusConversation, 'lastBotMessageAt'>>()
      for (const message of nexusMessages) {
        const cliente = (message as any).clientes
        const telefoneNormalizado = normalizeBrazilianPhone(cliente?.telefone)
        const setor = message.remetente === NEXUS_BOT_REMETENTE
          ? (setorPorContato.get(telefoneNormalizado) || (message.cliente_id ? setorPorContato.get(message.cliente_id) : undefined) || resolveSetor(message))
          : resolveSetor(message)
        if (!setor) continue

        const clienteKey = telefoneNormalizado || message.cliente_id || message.id
        const scopedClientId = message.cliente_id ? `${setor.id}::${message.cliente_id}` : null
        const scopedPhone = telefoneNormalizado ? `${setor.id}::${telefoneNormalizado}` : null

        if (scopedClientId && clientesComTicketAtivo.has(scopedClientId)) continue
        if (scopedPhone && telefonesComTicketAtivo.has(scopedPhone)) continue
        if (message.cliente_id && clientesComOcorrenciaSemSetor.has(message.cliente_id)) continue
        if (telefoneNormalizado && telefonesComOcorrenciaSemSetor.has(telefoneNormalizado)) continue
        if (scopedClientId && clientesComOcorrencia.has(scopedClientId)) continue
        if (scopedPhone && telefonesComOcorrencia.has(scopedPhone)) continue

        const groupKey = getNexusConversationScopeKey(setor.id, message.cliente_id, telefoneNormalizado, message.id)
        const current = groups.get(groupKey)

        groups.set(groupKey, {
          clienteKey,
          clienteId: message.cliente_id,
          contato: cliente?.nome || cliente?.telefone || 'Cliente sem nome',
          telefone: cliente?.telefone || null,
          setorId: setor.id,
          setorNome: setor.nome,
          lastMessageAt: message.enviado_em,
          lastRemetente: message.remetente,
          messages: [...(current?.messages || []), message],
        })
      }

      const conversations = Array.from(groups.values())
        .map((conversation): NexusConversation => {
          const lastBotMessage = [...conversation.messages].reverse().find((message) => message.remetente === NEXUS_BOT_REMETENTE)
          return {
            ...conversation,
            lastBotMessageAt: lastBotMessage?.enviado_em || '',
          }
        })
        .filter((conversation) => conversation.lastBotMessageAt >= activeSince)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      return {
        conversations,
        setoresIa,
        nexusOccurrencesAvailable,
        monitoring: {
          activeTickets: activeTicketIds.length,
          onlineAttendants: onlineAttendants.length,
          workload,
        },
      }
    },
    { revalidateOnFocus: false, refreshInterval: 30000 },
  )

  // "Atendimentos": histórico concluído do bot no período, com desfecho
  // (virou ticket / encerrada sem ticket). Conversas ativas ficam em Ao vivo. Só busca
  // quando a aba está ativa para não pesar a tela ao vivo.
  const {
    data: atendimentosData,
    error: atendimentosError,
    isLoading: atendimentosLoading,
    mutate: mutateAtendimentos,
  } = useSWR(
    activeTab === 'atendimentos' && colaborador && setorIdsFiltrados.length > 0
      ? ['dashboard-nexus-atendimentos', setorIdsFiltrados.join(','), rangeFilter]
      : null,
    async () => {
      const since = rangeToSince(rangeFilter)
      const until = new Date().toISOString()
      const activeSince = new Date(Date.now() - NEXUS_BOT_VISIBILITY_MINUTES * 60000).toISOString()
      const { setoresIa, resolveSetor, channelIds } = await loadNexusSetores(supabase, setorIdsFiltrados)

      if (setoresIa.length === 0) return { atendimentos: [] as NexusAtendimento[] }

      const ocorrenciasDoSetorPromise = loadOptionalNexusOccurrences(() => loadRowsByPages(() => supabase
          .from('nexus_ocorrencias')
          .select('id, cliente_id, telefone, setor_id, criado_em')
          .in('setor_id', setoresIa.map((setor: any) => setor.id))
          .eq('status', 'aberta')
          .gte('criado_em', since)
          .lte('criado_em', until)
          .order('criado_em', { ascending: true })
          .order('id', { ascending: true })))
      const ocorrenciasSemSetorPromise = loadOptionalNexusOccurrences(() => loadRowsByPages(() => supabase
          .from('nexus_ocorrencias')
          .select('id, cliente_id, telefone, setor_id, criado_em')
          .is('setor_id', null)
          .eq('status', 'aberta')
          .gte('criado_em', since)
          .lte('criado_em', until)
          .order('criado_em', { ascending: true })
          .order('id', { ascending: true })))

      // Mensagens do bot no período — SEM filtro de ticket_id (as que viraram
      // ticket já têm ticket_id e continuam sendo do bot).
      // Paginação real: percorre TODAS as mensagens Nexus do período em lotes
      // (o PostgREST devolve no máx. ~1000 por request). Carrega da mais recente
      // para a mais antiga e, no fim, reordena ascendente para o agrupamento.
      // Sem isso, com volume alto (milhares/dia) o período era cortado e os
      // atendimentos de hoje sumiam.
      const CHUNK = 1000
      const lotesDesc: any[] = []
      const canResolveMessages = channelIds.length > 0
      for (let i = 0; canResolveMessages; i += 1) {
        let query = supabase
          .from('mensagens')
          .select('id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type, phone_number_id, clientes(id, nome, telefone)')
          .in('remetente', NEXUS_REMETENTES)
          .gte('enviado_em', since)
          .lte('enviado_em', until)
          .order('enviado_em', { ascending: false })
          .order('id', { ascending: false })
          .range(i * CHUNK, i * CHUNK + CHUNK - 1)

        if (channelIds.length > 0) {
          query = query.in('phone_number_id', channelIds)
        }

        const { data: lote, error } = await query
        if (error) throw error
        if (!lote || lote.length === 0) break
        lotesDesc.push(...lote)
        if (lote.length < CHUNK) break
      }

      // Mensagens 'cliente' órfãs (n8n não marcou como 'cliente-nexus') SÓ contam
      // como Nexus enquanto ticket_id ainda é nulo — por isso vêm de uma busca
      // separada, e não do .in('remetente', ...) acima. Incluir 'cliente' ali
      // sem essa restrição varreria TODO o histórico de clientes do sistema
      // (não só o do Nexus), que foi o que deixou esta aba lenta.
      const orfasCliente = canResolveMessages
        ? await loadRowsByPages(() => {
            let query = supabase
              .from('mensagens')
              .select('id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type, phone_number_id, clientes(id, nome, telefone)')
              .is('ticket_id', null)
              .eq('remetente', NEXUS_ORPHAN_CLIENT_REMETENTE)
              .gte('enviado_em', since)
              .lte('enviado_em', until)
              .order('enviado_em', { ascending: true })
              .order('id', { ascending: true })
            if (channelIds.length > 0) query = query.in('phone_number_id', channelIds)
            return query
          })
        : []

      const nexusMessages = [...lotesDesc.reverse(), ...orfasCliente].sort((a, b) => {
        const diff = new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()
        return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id))
      })

      const [ocorrenciasDoSetor, ocorrenciasSemSetor] = await Promise.all([
        ocorrenciasDoSetorPromise,
        ocorrenciasSemSetorPromise,
      ])
      const ocorrenciasDoPeriodo = [...ocorrenciasDoSetor.rows, ...ocorrenciasSemSetor.rows]
      const ocorrenciasPorReferencia = new Map<string, { criadoEm: string; setorId: string | null }[]>()
      for (const ocorrencia of ocorrenciasDoPeriodo) {
        const referencias = [
          ocorrencia.cliente_id,
          normalizeBrazilianPhone(ocorrencia.telefone),
        ].filter((referencia): referencia is string => Boolean(referencia))
        for (const referencia of referencias) {
          const atuais = ocorrenciasPorReferencia.get(referencia) || []
          atuais.push({ criadoEm: ocorrencia.criado_em, setorId: ocorrencia.setor_id || null })
          ocorrenciasPorReferencia.set(referencia, atuais)
        }
      }

      // 1. Agrupa as mensagens por cliente (já vêm ordenadas asc).
      const porCliente = new Map<string, {
        clienteId: string | null
        contato: string
        telefone: string | null
        setorId: string
        setorNome: string
        messages: any[]
      }>()
      // Mesmo problema do fetcher "ao vivo": o bot manda pelo phone_number_id
      // centralizado (setor errado). Bot herda o setor do cliente na mesma conversa.
      const setorPorContatoHistorico = new Map<string, { id: string; nome: string }>()
      for (const message of nexusMessages) {
        if (message.remetente === NEXUS_BOT_REMETENTE) continue
        const setorCliente = resolveSetor(message)
        if (!setorCliente) continue
        const clienteMsg = (message as any).clientes
        const telefoneCliente = normalizeBrazilianPhone(clienteMsg?.telefone)
        if (telefoneCliente) setorPorContatoHistorico.set(telefoneCliente, setorCliente)
        if (message.cliente_id) setorPorContatoHistorico.set(message.cliente_id, setorCliente)
      }
      for (const message of nexusMessages) {
        const cliente = (message as any).clientes
        const telefoneNormalizado = normalizeBrazilianPhone(cliente?.telefone)
        const setor = message.remetente === NEXUS_BOT_REMETENTE
          ? (setorPorContatoHistorico.get(telefoneNormalizado) || (message.cliente_id ? setorPorContatoHistorico.get(message.cliente_id) : undefined) || resolveSetor(message))
          : resolveSetor(message)
        if (!setor) continue

        const ref = getNexusConversationScopeKey(setor.id, message.cliente_id, telefoneNormalizado, message.id)
        const atual = porCliente.get(ref)
        if (atual) {
          atual.messages.push(message)
          if (!atual.clienteId && message.cliente_id) atual.clienteId = message.cliente_id
        } else {
          porCliente.set(ref, {
            clienteId: message.cliente_id,
            contato: cliente?.nome || cliente?.telefone || 'Cliente sem nome',
            telefone: cliente?.telefone || null,
            setorId: setor.id,
            setorNome: setor.nome,
            messages: [message],
          })
        }
      }

      // 2. Divide cada cliente em sessões (atendimentos distintos): nova sessão
      //    quando muda o ticket_id ou há um intervalo grande entre mensagens.
      //    Resolve o caso de "mesmo cliente entrou em contato 2x" (uma virou
      //    ticket, outra foi resolvida pelo bot) aparecer como um só.
      type Sessao = {
        clienteKey: string
        clienteId: string | null
        contato: string
        telefone: string | null
        setorId: string
        setorNome: string
        ticketId: string | null
        messages: any[]
      }
      const gapMs = NEXUS_SESSION_GAP_MINUTES * 60000
      const sessoes: Sessao[] = []
      for (const cliente of porCliente.values()) {
        let atual: Sessao | null = null
        for (const message of cliente.messages) {
          const ticketId = message.ticket_id || null
          const anterior = atual ? atual.messages[atual.messages.length - 1] : null
          const gap = anterior ? new Date(message.enviado_em).getTime() - new Date(anterior.enviado_em).getTime() : 0
          if (shouldStartNewNexusSession({
            hasCurrentSession: Boolean(atual),
            currentTicketId: atual?.ticketId || null,
            incomingTicketId: ticketId,
            gapMs: gap,
            maxGapMs: gapMs,
          })) {
            atual = {
              clienteKey: `${cliente.clienteId || cliente.telefone || 'x'}::${message.id}`,
              clienteId: cliente.clienteId,
              contato: cliente.contato,
              telefone: cliente.telefone,
              setorId: cliente.setorId,
              setorNome: cliente.setorNome,
              ticketId,
              messages: [],
            }
            sessoes.push(atual)
          }
          if (!atual) continue
          if (!atual.ticketId && ticketId) atual.ticketId = ticketId
          atual.messages.push(message)
        }
      }

      const ticketIds = new Set<string>()
      for (const sessao of sessoes) {
        if (sessao.ticketId) ticketIds.add(sessao.ticketId)
      }

      // 3. Tickets das sessões (pelo ticket_id das próprias mensagens) + atendentes.
      const ticketsData = ticketIds.size > 0
        ? await loadNexusTicketsByIds(supabase, Array.from(ticketIds))
        : []

      const ticketsById = new Map<string, any>()
      const colaboradorIds = new Set<string>()
      const tipoAtendimentoIds = new Set<string>()
      for (const ticket of ticketsData) {
        ticketsById.set(ticket.id, ticket)
        if (ticket.colaborador_id) colaboradorIds.add(ticket.colaborador_id)
        if (ticket.tipo_atendimento_id) tipoAtendimentoIds.add(ticket.tipo_atendimento_id)
      }

      const colaboradorNomes = new Map<string, string>()
      const tiposAtendimentoNomes = new Map<string, string>()
      const [colaboradoresData, tiposAtendimentoData] = await Promise.all([
        colaboradorIds.size > 0
          ? loadRowsByIds(supabase, 'colaboradores', 'id, nome', Array.from(colaboradorIds))
          : Promise.resolve([]),
        tipoAtendimentoIds.size > 0
          ? loadRowsByIds(supabase, 'tipos_atendimento', 'id, nome', Array.from(tipoAtendimentoIds))
          : Promise.resolve([]),
      ])
      for (const colab of colaboradoresData) colaboradorNomes.set(colab.id, colab.nome)
      for (const tipo of tiposAtendimentoData) tiposAtendimentoNomes.set(tipo.id, tipo.nome)

      // 4. Classifica cada sessão pelo desfecho.
      const atendimentos = sessoes
        .map((sessao): NexusAtendimento | null => {
          const lastBotMessage = [...sessao.messages].reverse().find((m) => m.remetente === NEXUS_BOT_REMETENTE)
          const lastBotMessageAt = lastBotMessage?.enviado_em || ''
          const lastMessageAt = sessao.messages[sessao.messages.length - 1]?.enviado_em || ''
          const lastRemetente = sessao.messages[sessao.messages.length - 1]?.remetente || ''

          const ticket = sessao.ticketId ? ticketsById.get(sessao.ticketId) : null
          const firstMessageAt = sessao.messages[0]?.enviado_em || lastMessageAt
          const ocorrenciaRefs = [
            sessao.clienteId,
            normalizeBrazilianPhone(sessao.telefone),
          ].filter((referencia): referencia is string => Boolean(referencia))
          const ocorrenciaConcluiuSessao = ocorrenciaRefs.some((referencia) => (
            (ocorrenciasPorReferencia.get(referencia) || []).some((ocorrencia) => {
              if (ocorrencia.setorId && ocorrencia.setorId !== sessao.setorId) return false
              const ocorrenciaTime = new Date(ocorrencia.criadoEm).getTime()
              return ocorrenciaTime >= new Date(firstMessageAt).getTime()
                && ocorrenciaTime <= new Date(lastMessageAt).getTime() + gapMs
            })
          ))

          // Conversas recentes sem ticket ficam apenas em Ao vivo. O registro
          // de ocorrência encerra a sessão imediatamente, sem esperar a janela.
          if (!ticket && !ocorrenciaConcluiuSessao && lastMessageAt && lastMessageAt >= activeSince) return null
          const desfecho: AtendimentoDesfecho = ticket ? 'ticket' : 'encerrada'
          const tipoAtendimento = ticket
            ? formatNexusAttendanceType(ticket.tipo_atendimento)
              || (ticket.tipo_atendimento_id ? tiposAtendimentoNomes.get(ticket.tipo_atendimento_id) || null : null)
            : null

          return {
            clienteKey: sessao.clienteKey,
            clienteId: sessao.clienteId,
            contato: sessao.contato,
            telefone: sessao.telefone,
            setorId: sessao.setorId,
            setorNome: sessao.setorNome,
            lastMessageAt,
            lastRemetente,
            lastBotMessageAt,
            messages: sessao.messages,
            desfecho,
            ticket: ticket
              ? {
                  id: ticket.id,
                  numero: ticket.numero ?? null,
                  status: ticket.status,
                  atendente: ticket.colaborador_id ? colaboradorNomes.get(ticket.colaborador_id) || null : null,
                  tipoAtendimento,
                }
              : null,
          }
        })
        .filter((atendimento): atendimento is NexusAtendimento => Boolean(atendimento))
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      const ticketIdsExibidos = new Set<string>()
      const atendimentosUnicos = atendimentos.filter((atendimento) => {
        const ticketId = atendimento.ticket?.id
        if (!ticketId) return true
        if (ticketIdsExibidos.has(ticketId)) return false
        ticketIdsExibidos.add(ticketId)
        return true
      })

      return { atendimentos: atendimentosUnicos }
    },
    { revalidateOnFocus: false },
  )

  const conversationsRaw: NexusConversation[] = data?.conversations || []
  const monitoredSectorIds = useMemo(() => new Set(setorIdsFiltrados), [setorIdsFiltrados])
  const monitoredChannelIds = useMemo(() => {
    const ids = new Set<string>()
    for (const setor of data?.setoresIa || []) {
      for (const canal of setor.setor_canais || []) {
        if (!canal.ativo) continue
        if (canal.phone_number_id) ids.add(canal.phone_number_id)
        if (canal.instancia) ids.add(canal.instancia)
      }
    }
    return ids
  }, [data?.setoresIa])
  const selectedConversationKey = selectedConversation
    ? `${selectedConversation.setorId}-${selectedConversation.clienteKey}`
    : null
  const selectedTicketId = selectedConversation?.ticket?.id || null
  const {
    data: selectedTicketMessages = [],
    isLoading: selectedTicketMessagesLoading,
    error: selectedTicketMessagesError,
    mutate: mutateSelectedTicketMessages,
  } = useSWR(
    selectedTicketId ? ['dashboard-nexus-ticket-timeline', selectedTicketId] : null,
    async () => {
      const messages: any[] = []
      const chunkSize = 1000
      const until = new Date().toISOString()

      for (let chunk = 0; ; chunk += 1) {
        const { data: rows, error } = await supabase
          .from('mensagens')
          .select('id, ticket_id, cliente_id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type')
          .eq('ticket_id', selectedTicketId!)
          .in('remetente', NEXUS_TIMELINE_REMETENTES)
          .lte('enviado_em', until)
          .order('enviado_em', { ascending: true })
          .order('id', { ascending: true })
          .range(chunk * chunkSize, chunk * chunkSize + chunkSize - 1)

        if (error) throw error
        if (!rows || rows.length === 0) break
        messages.push(...rows)
        if (rows.length < chunkSize) break
      }

      return messages
    },
    { revalidateOnFocus: false },
  )
  const selectedTimelineMessages = useMemo(() => (
    mergeNexusTicketTimeline(selectedConversation?.messages || [], selectedTicketMessages)
  ), [selectedConversation?.messages, selectedTicketMessages])
  const selectedTimelineLastMessageAt = selectedTimelineMessages[selectedTimelineMessages.length - 1]?.enviado_em
    || selectedConversation?.lastMessageAt
    || null
  const selectedPhaseFirstIndexes = useMemo(() => {
    const indexes = { nexus: -1, human: -1 }
    selectedTimelineMessages.forEach((message: any, index) => {
      const phase = getNexusMessagePhase(message.remetente, message.ticket_id)
      if (indexes[phase] === -1) indexes[phase] = index
    })
    return indexes
  }, [selectedTimelineMessages])

  const handleAbrirTicket = async (
    conversation: NexusConversation,
    destino?: { setorId: string; subsetorId: string | null },
  ) => {
    const key = `${conversation.setorId}-${conversation.clienteKey}`
    setOpeningKey(key)
    try {
      const res = await fetch('/api/nexus/abrir-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: conversation.clienteId,
          telefone: conversation.telefone,
          setorId: destino?.setorId || conversation.setorId,
          subsetorId: destino?.subsetorId ?? null,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Falha ao abrir o ticket')

      const atribuicao = result.colaboradorNome
        ? `atribuído a ${result.colaboradorNome}`
        : 'aguardando atribuição na fila'
      toast.success(
        result.jaExistia
          ? `Já havia ticket aberto para ${conversation.contato} (${atribuicao}).`
          : `Ticket aberto para ${conversation.contato} — ${atribuicao}.`,
      )

      if (selectedConversationKey === key) setSelectedConversation(null)
      mutate()
      mutateAtendimentos()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir o ticket')
    } finally {
      setOpeningKey(null)
    }
  }

  const conversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return conversationsRaw

    return conversationsRaw.filter((conversation) => (
      conversation.contato.toLowerCase().includes(query) ||
      formatPhone(conversation.telefone).toLowerCase().includes(query) ||
      conversation.setorNome.toLowerCase().includes(query)
    ))
  }, [conversationsRaw, searchTerm])

  const atendimentosRaw: NexusAtendimento[] = atendimentosData?.atendimentos || []
  const atendimentosFiltrados = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return atendimentosRaw.filter((atendimento) => {
      const matchesSituation = atendimentoSituationFilters.length === 0
        || atendimentoSituationFilters.some((situation) => (
          situation === 'encerrada_sem_ticket'
            ? atendimento.desfecho === 'encerrada'
            : matchesNexusTicketConversationFilter(atendimento.ticket?.status, situation)
        ))
      if (!matchesSituation) return false
      if (!query) return true
      return (
        atendimento.contato.toLowerCase().includes(query) ||
        formatPhone(atendimento.telefone).toLowerCase().includes(query) ||
        atendimento.setorNome.toLowerCase().includes(query) ||
        (atendimento.ticket?.tipoAtendimento || '').toLowerCase().includes(query) ||
        String(atendimento.ticket?.numero || '').includes(query)
      )
    })
  }, [atendimentosRaw, searchTerm, atendimentoSituationFilters])

  const atendimentosStats = useMemo(() => {
    const tickets = atendimentosRaw.filter((atendimento) => atendimento.desfecho === 'ticket').length
    const encerradosSemTicket = atendimentosRaw.filter((atendimento) => atendimento.desfecho === 'encerrada').length
    const total = tickets + encerradosSemTicket
    return {
      total,
      tickets,
      encerradosSemTicket,
      conversionRate: total > 0 ? Math.round((tickets / total) * 100) : 0,
    }
  }, [atendimentosRaw])

  const monitoring = data?.monitoring || {
    activeTickets: 0,
    onlineAttendants: 0,
    workload: calculateWorkloadOs(0, 0),
  }
  const workloadTone = WORKLOAD_OS_TONES[monitoring.workload.level as WorkloadOsLevel]
  const hasAtendimentoFilters = setorFilter.length > 0
    || atendimentoSituationFilters.length > 0
    || rangeFilter !== 'hoje'
    || Boolean(searchTerm.trim())

  const clearAtendimentoFilters = () => {
    setSetorFilter([])
    setAtendimentoSituationFilters([])
    setRangeFilter('hoje')
    setSearchTerm('')
  }

  const totalPaginasAtendimentos = Math.max(1, Math.ceil(atendimentosFiltrados.length / NEXUS_ATENDIMENTOS_PAGE_SIZE))
  const paginaAtendimentos = Math.min(atendimentosPage, totalPaginasAtendimentos - 1)
  const atendimentos = atendimentosFiltrados.slice(
    paginaAtendimentos * NEXUS_ATENDIMENTOS_PAGE_SIZE,
    paginaAtendimentos * NEXUS_ATENDIMENTOS_PAGE_SIZE + NEXUS_ATENDIMENTOS_PAGE_SIZE,
  )

  // Volta para a primeira página quando os filtros mudam.
  useEffect(() => {
    setAtendimentosPage(0)
  }, [searchTerm, atendimentoSituationFilters, rangeFilter, setorFilter, tagFilter, activeTab])

  useEffect(() => {
    let channel = supabase
      .channel('dashboard-nexus-mensagens')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens' },
        (payload) => {
          const row = (payload.new || payload.old) as {
            ticket_id?: string | null
            remetente?: string | null
            phone_number_id?: string | null
          } | null
          if (!row?.remetente || !NEXUS_TIMELINE_REMETENTES.includes(row.remetente)) return

          if (selectedTicketId && row.ticket_id === selectedTicketId) mutateSelectedTicketMessages()
          // Só refaz a busca "Ao vivo"/"Atendimentos" pra mensagens realmente do
          // Nexus — não pra toda mensagem 'cliente' do sistema (ver
          // isNexusRelevantMessage).
          if (!isNexusRelevantMessage(row.remetente, row.ticket_id)) return
          if (row.phone_number_id && monitoredChannelIds.size > 0 && !monitoredChannelIds.has(row.phone_number_id)) return

          mutate()
          if (activeTab === 'atendimentos') mutateAtendimentos()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          const row = (payload.new || payload.old) as { setor_id?: string | null } | null
          if (row?.setor_id && !monitoredSectorIds.has(row.setor_id)) return
          mutate()
          if (activeTab === 'atendimentos') mutateAtendimentos()
        },
      )

    if (data?.nexusOccurrencesAvailable) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexus_ocorrencias' },
        (payload) => {
          const row = (payload.new || payload.old) as { setor_id?: string | null } | null
          if (row?.setor_id && !monitoredSectorIds.has(row.setor_id)) return
          mutate()
          if (activeTab === 'atendimentos') mutateAtendimentos()
        },
      )
    }

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeTab, data?.nexusOccurrencesAvailable, monitoredChannelIds, monitoredSectorIds, mutate, mutateAtendimentos, mutateSelectedTicketMessages, selectedTicketId, supabase])

  useEffect(() => {
    // Mantém o drawer sincronizado com os dados ao vivo. Na aba de atendimentos
    // (histórico) não sincroniza, senão zeraria uma conversa que não está na
    // lista ao vivo.
    if (!selectedConversationKey) return
    if (activeTab === 'ao-vivo') {
      const updated = conversationsRaw.find((conversation) => (
        `${conversation.setorId}-${conversation.clienteKey}` === selectedConversationKey
      ))
      setSelectedConversation(updated || null)
      return
    }

    const updated = atendimentosRaw.find((atendimento) => (
      `${atendimento.setorId}-${atendimento.clienteKey}` === selectedConversationKey
    ))
    if (updated) setSelectedConversation(updated)
  }, [activeTab, atendimentosRaw, conversationsRaw, selectedConversationKey])

  useEffect(() => {
    if (!selectedConversation || !conversationScrollRef.current) return
    const el = conversationScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [selectedConversation, selectedTimelineMessages.length])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Nexus IA</h1>
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
            <span className="signal-dot signal-dot--pulse" aria-hidden="true" />
            <span className="text-xs font-medium text-primary">Ao vivo</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tagsDisponiveis.length > 0 && (
            <MultiSelectFilter
              icon={Tag}
              placeholder="Todas as tags"
              header="Tags"
              pluralWord="tags"
              options={tagsDisponiveis.map((t: any) => ({ id: t.id, nome: t.nome, cor: t.cor }))}
              selected={tagFilter}
              onChange={(next) => { setTagFilter(next); setSetorFilter([]) }}
              open={tagFiltroOpen}
              onOpenChange={setTagFiltroOpen}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            aria-label="Atualizar"
            title="Atualizar"
            onClick={() => (activeTab === 'ao-vivo' ? mutate() : mutateAtendimentos())}
            className="gap-2 bg-transparent"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Abas: Ao vivo (monitoramento) x Atendimentos (histórico com desfecho) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border" role="tablist" aria-label="Visões da monitoria Nexus">
        <button
          id="nexus-live-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'ao-vivo'}
          aria-controls="nexus-live-panel"
          tabIndex={activeTab === 'ao-vivo' ? 0 : -1}
          onClick={() => setActiveTab('ao-vivo')}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight') return
            event.preventDefault()
            setActiveTab('atendimentos')
            requestAnimationFrame(() => document.getElementById('nexus-history-tab')?.focus())
          }}
          className={cn(
            'relative rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'ao-vivo' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Ao vivo
          {activeTab === 'ao-vivo' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
        <button
          id="nexus-history-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'atendimentos'}
          aria-controls="nexus-history-panel"
          tabIndex={activeTab === 'atendimentos' ? 0 : -1}
          onClick={() => setActiveTab('atendimentos')}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft') return
            event.preventDefault()
            setActiveTab('ao-vivo')
            requestAnimationFrame(() => document.getElementById('nexus-live-tab')?.focus())
          }}
          className={cn(
            'relative rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'atendimentos' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Atendimentos
          {activeTab === 'atendimentos' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      </div>

      {activeTab === 'ao-vivo' && (
      <div id="nexus-live-panel" role="tabpanel" aria-labelledby="nexus-live-tab" className="space-y-6">
      {liveError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <span>Não foi possível atualizar a monitoria. Verifique a conexão e tente novamente.</span>
          <Button variant="outline" size="sm" onClick={() => mutate()}>Tentar novamente</Button>
        </div>
      )}
      <Card className="anim-rise glass-card-elevated rounded-lg shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Monitoria em tempo real</h2>
              <p className="mt-1 text-xs text-muted-foreground">Carga operacional dos setores atendidos pelo Nexus.</p>
            </div>
            <Badge variant="outline" className="rounded-md border-border text-[10px] font-medium text-muted-foreground">
              {isLoading || liveError ? '—' : `${data?.setoresIa?.length || 0} setor${data?.setoresIa?.length === 1 ? '' : 'es'} IA`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
            <section className="bg-card px-4 py-4" aria-label={`${conversationsRaw.length} conversas ativas no Nexus`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>No Nexus</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-primary">{isLoading || liveError ? '—' : conversationsRaw.length}</p>
            </section>

            <section className="border-t border-border/70 bg-card px-4 py-4 sm:border-l sm:border-t-0" aria-label={`${monitoring.activeTickets} tickets ativos`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tickets ativos</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{isLoading || liveError ? '—' : monitoring.activeTickets}</p>
            </section>

            <section className="border-t border-border/70 bg-card px-4 py-4 lg:border-l lg:border-t-0" aria-label={`${monitoring.onlineAttendants} atendentes online`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                <span>Atendentes online</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-emerald-500">{isLoading || liveError ? '—' : monitoring.onlineAttendants}</p>
            </section>

            <section
              className={cn('border-t border-border/70 bg-card px-4 py-4 sm:border-l lg:border-t-0', workloadTone.badge)}
              title={`${monitoring.activeTickets} tickets ativos ÷ ${monitoring.onlineAttendants} atendentes online`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Média/OS</span>
                </div>
                <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', workloadTone.badge)}>
                  {isLoading || liveError ? 'Aguardando' : monitoring.workload.label}
                </Badge>
              </div>
              <p className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', workloadTone.value)}>
                {isLoading || liveError ? '—' : monitoring.workload.formattedRatio}
              </p>
            </section>
          </div>
        </CardContent>
      </Card>

      <Card className="anim-rise glass-card-elevated rounded-lg shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Atendimentos do bot sem ticket</h2>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <div className="[&>button]:w-full sm:[&>button]:w-auto">
                <MultiSelectFilter
                  icon={Building2}
                  placeholder="Todos os setores"
                  header="Setores"
                  pluralWord="setores"
                  options={setoresFiltradosPorTag.map((setor: any) => ({ id: setor.id, nome: setor.nome }))}
                  selected={setorFilter}
                  onChange={setSetorFilter}
                  open={setorFiltroOpen}
                  onOpenChange={setSetorFiltroOpen}
                  searchable
                />
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  name="nexus-live-search"
                  aria-label="Buscar conversas ao vivo"
                  autoComplete="off"
                  placeholder="Buscar contato, número ou setor…"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-9 w-full rounded-md pl-9 pr-3 glass-input"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table aria-busy={isLoading}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de atendimento</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última mensagem</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último envio</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {liveError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                      Os atendimentos ao vivo não puderam ser carregados.
                    </TableCell>
                  </TableRow>
                ) : isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-16" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-36" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-24" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-16" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : conversations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Bot className="mb-1 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                        <p className="text-sm font-medium tracking-tight text-foreground">
                          {searchTerm.trim() ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ao vivo'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {searchTerm.trim()
                            ? 'Ajuste ou limpe a busca para ver outros contatos.'
                            : 'Conversas do bot sem ticket aparecem aqui assim que chegam.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  conversations.map((conversation) => (
                    <TableRow key={`${conversation.setorId}-${conversation.clienteKey}`}>
                      <TableCell className="text-sm font-medium tabular-nums text-foreground">
                        {formatDuration(conversation.messages)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px]">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                          <span className="truncate" title={conversation.contato}>{conversation.contato}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-foreground">{formatPhone(conversation.telefone)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'Cliente' : 'Nexus'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-foreground">{conversation.messages.length}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <AbrirTicketButton
                            conversation={conversation}
                            opening={openingKey === `${conversation.setorId}-${conversation.clienteKey}`}
                            onConfirm={handleAbrirTicket}
                            variant="row"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ver conversa"
                            className="h-11 w-11 sm:h-8 sm:w-8"
                            onClick={() => setSelectedConversation(conversation)}
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
      )}

      {activeTab === 'atendimentos' && (
        <div id="nexus-history-panel" role="tabpanel" aria-labelledby="nexus-history-tab" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="anim-rise rounded-lg shadow-none">
              <CardContent className="px-4 py-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Total de atendimentos</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {atendimentosLoading || atendimentosError ? '—' : atendimentosStats.total}
                </p>
              </CardContent>
            </Card>

            <Card className="anim-rise rounded-lg shadow-none">
              <CardContent className="px-4 py-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CircleSlash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Finalizados sem ticket</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {atendimentosLoading || atendimentosError ? '—' : atendimentosStats.encerradosSemTicket}
                </p>
              </CardContent>
            </Card>

            <Card className="anim-rise rounded-lg shadow-none">
              <CardContent className="px-4 py-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Com ticket criado</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-primary">
                  {atendimentosLoading || atendimentosError ? '—' : atendimentosStats.tickets}
                </p>
              </CardContent>
            </Card>

            <Card className="anim-rise rounded-lg shadow-none">
              <CardContent className="px-4 py-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                  <span>Conversão em ticket</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-emerald-500">
                  {atendimentosLoading || atendimentosError ? '—' : `${atendimentosStats.conversionRate}%`}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="anim-rise glass-card-elevated rounded-lg shadow-none">
            <CardHeader className="space-y-4 pb-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Atendimentos</h2>
                <p className="mt-1 text-xs text-muted-foreground">Conversas com ticket criado ou finalizadas sem ticket.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="[&>button]:h-9 [&>button]:w-full sm:[&>button]:w-auto">
                      <MultiSelectFilter
                        icon={Building2}
                        placeholder="Todos os setores"
                        header="Setores"
                        pluralWord="setores"
                        options={setoresFiltradosPorTag.map((setor: any) => ({ id: setor.id, nome: setor.nome }))}
                        selected={setorFilter}
                        onChange={setSetorFilter}
                        open={setorFiltroOpen}
                        onOpenChange={setSetorFiltroOpen}
                        searchable
                      />
                    </div>
                    <div className="[&>button]:h-9 [&>button]:w-full sm:[&>button]:w-60">
                      <MultiSelectFilter
                        icon={Activity}
                        placeholder="Todas as situações"
                        header="Situação"
                        pluralWord="situações"
                        options={ATENDIMENTO_SITUATION_OPTIONS}
                        selected={atendimentoSituationFilters}
                        onChange={(next) => setAtendimentoSituationFilters(next as AtendimentoSituation[])}
                        open={atendimentoSituationFilterOpen}
                        onOpenChange={setAtendimentoSituationFilterOpen}
                      />
                    </div>
                    <Select value={rangeFilter} onValueChange={(value) => setRangeFilter(value as RangeValue)}>
                      <SelectTrigger className="h-9 w-full bg-card sm:w-40" aria-label="Filtrar por período">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasAtendimentoFilters && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full gap-1.5 text-muted-foreground sm:w-auto"
                        onClick={clearAtendimentoFilters}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Limpar
                      </Button>
                    )}
                  </div>
                  <div className="relative w-full lg:ml-auto lg:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      name="nexus-history-search"
                      aria-label="Buscar atendimentos"
                      autoComplete="off"
                      placeholder="Buscar contato, ticket ou tipo…"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="h-9 w-full rounded-md pl-9 pr-3 glass-input"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {atendimentosError && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  <span>Não foi possível carregar o histórico. Verifique a conexão e tente novamente.</span>
                  <Button variant="outline" size="sm" onClick={() => mutateAtendimentos()}>Tentar novamente</Button>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table aria-busy={atendimentosLoading}>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de atendimento</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de atendimento</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desfecho</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Msgs. Nexus</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="stagger">
                    {atendimentosError ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                          Os atendimentos não puderam ser carregados.
                        </TableCell>
                      </TableRow>
                  ) : atendimentosLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-36" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-24" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-28" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-28" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-12" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : atendimentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <Bot className="mb-1 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                          <p className="text-sm font-medium tracking-tight text-foreground">
                            {searchTerm.trim() || atendimentoSituationFilters.length > 0 || setorFilter.length > 0 || tagFilter.length > 0
                              ? 'Nenhum atendimento encontrado'
                              : 'Nenhum atendimento no período'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {searchTerm.trim() || atendimentoSituationFilters.length > 0 || setorFilter.length > 0 || tagFilter.length > 0
                              ? 'Ajuste ou limpe os filtros para ver outros atendimentos.'
                              : 'Selecione outro período para consultar mais atendimentos.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    atendimentos.map((atendimento) => {
                      const key = `${atendimento.setorId}-${atendimento.clienteKey}`
                      return (
                        <TableRow key={key}>
                          <TableCell className="text-sm font-medium tabular-nums text-foreground">
                            {formatDuration(atendimento.messages)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-[200px]">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                              <span className="truncate" title={atendimento.contato}>{atendimento.contato}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">{formatPhone(atendimento.telefone)}</TableCell>
                          <TableCell>
                            {atendimento.ticket?.tipoAtendimento ? (
                              <Badge variant="secondary" className="max-w-44 truncate text-[10px] font-medium" title={atendimento.ticket.tipoAtendimento}>
                                {atendimento.ticket.tipoAtendimento}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DesfechoBadge atendimento={atendimento} />
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">{atendimento.messages.length}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {atendimento.desfecho !== 'ticket' && (
                                <AbrirTicketButton
                                  conversation={atendimento}
                                  opening={openingKey === key}
                                  onConfirm={handleAbrirTicket}
                                  variant="row"
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Ver conversa"
                                className="h-11 w-11 sm:h-8 sm:w-8"
                                onClick={() => setSelectedConversation(atendimento)}
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {!atendimentosLoading && atendimentosFiltrados.length > 0 && (
              <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {atendimentosFiltrados.length} atendimento{atendimentosFiltrados.length > 1 ? 's' : ''}
                  {' · '}página {paginaAtendimentos + 1} de {totalPaginasAtendimentos}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={paginaAtendimentos === 0}
                    onClick={() => setAtendimentosPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={paginaAtendimentos >= totalPaginasAtendimentos - 1}
                    onClick={() => setAtendimentosPage((p) => Math.min(totalPaginasAtendimentos - 1, p + 1))}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      <Sheet open={Boolean(selectedConversation)} onOpenChange={(open) => { if (!open) setSelectedConversation(null) }}>
        {selectedConversation && (
          <SheetContent side="right" className="w-full max-w-lg gap-0 p-0 sm:max-w-lg [&>button]:hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                  <SheetTitle className="truncate font-semibold tracking-tight">Histórico do atendimento</SheetTitle>
                  {selectedConversation.ticket ? (
                    <Badge variant="outline" className="gap-1 rounded-md border-border text-[10px] text-foreground">
                      <Ticket className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      Ticket{selectedConversation.ticket.numero ? <span className="font-mono tabnums"> #{selectedConversation.ticket.numero}</span> : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Sem ticket</Badge>
                  )}
                </div>
                <SheetDescription className="truncate text-sm text-muted-foreground">
                  {selectedConversation.contato} - {selectedConversation.setorNome}
                </SheetDescription>
                {selectedConversation.ticket?.tipoAtendimento && (
                  <Badge variant="secondary" className="mt-1.5 max-w-full truncate text-[10px] font-medium" title={selectedConversation.ticket.tipoAtendimento}>
                    {selectedConversation.ticket.tipoAtendimento}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!selectedConversation.ticket && (
                  <AbrirTicketButton
                    conversation={selectedConversation}
                    opening={openingKey === `${selectedConversation.setorId}-${selectedConversation.clienteKey}`}
                    onConfirm={handleAbrirTicket}
                    variant="drawer"
                  />
                )}
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Fechar histórico">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </SheetClose>
              </div>
            </div>

            <div className="border-b px-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4 sm:gap-2">
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatPhone(selectedConversation.telefone)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Número</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatDuration(selectedTimelineMessages)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo de atendimento</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatRelativeTime(selectedTimelineLastMessageAt)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Última mensagem</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{selectedTimelineMessages.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagens</p>
                </div>
              </div>
            </div>

            <div ref={conversationScrollRef} className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 space-y-3">
                {selectedTicketId && selectedTicketMessagesLoading && (
                  <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Carregando a conversa completa do ticket…
                  </div>
                )}

                {selectedTicketId && selectedTicketMessagesError && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                    <span>Não foi possível carregar a fase humana. Tente novamente.</span>
                    <Button variant="outline" size="sm" className="h-7" onClick={() => mutateSelectedTicketMessages()}>
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {!selectedTicketMessagesLoading && !selectedTicketMessagesError && selectedTimelineMessages.length === 0 && (
                  <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem disponível para este atendimento.
                  </div>
                )}

                {selectedTimelineMessages.map((message: any, index) => {
                  const phase = getNexusMessagePhase(message.remetente, message.ticket_id)
                  const showPhaseDivider = selectedPhaseFirstIndexes[phase] === index
                  const clientMessage = isClientMessage(message.remetente)

                  return (
                    <div key={message.id} className="space-y-3">
                      {showPhaseDivider && (
                        <div className="flex items-center gap-2 py-1" role="separator" aria-label={phase === 'nexus' ? 'Atendimento pelo Nexus' : 'Atendimento humano'}>
                          <span className="h-px flex-1 bg-border" />
                          <div className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                            phase === 'nexus'
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-muted text-foreground',
                          )}>
                            {phase === 'nexus'
                              ? <Bot className="h-3 w-3" aria-hidden="true" />
                              : <Headset className="h-3 w-3" aria-hidden="true" />}
                            <span>{phase === 'nexus' ? 'Atendimento pelo Nexus' : 'Atendimento humano'}</span>
                          </div>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      <div className={cn('flex min-w-0', clientMessage ? 'justify-start' : 'justify-end')}>
                        <div
                          className={cn(
                            'min-w-0 max-w-[82%] rounded-lg px-3 py-2 text-sm',
                            clientMessage && 'bg-muted text-foreground',
                            !clientMessage && phase === 'nexus' && 'border border-primary/25 bg-primary/5 text-foreground',
                            !clientMessage && phase === 'human' && 'border border-border bg-card text-foreground',
                          )}
                        >
                          <MessageMediaPreview
                            url={message.url_imagem}
                            mediaType={message.media_type}
                            tipo={message.tipo}
                            conteudo={message.conteudo}
                          />
                          <TextoMensagem conteudo={message.conteudo} className="whitespace-pre-wrap break-words" />
                          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
                            <span>{getNexusMessageActorLabel(message.remetente)}</span>
                            <span className="tabular-nums">
                              {new Date(message.enviado_em).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}
