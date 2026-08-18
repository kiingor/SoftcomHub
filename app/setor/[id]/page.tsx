'use client'

import { useRef } from "react"

import React, { useState, useMemo, useCallback, useEffect, useTransition, Fragment, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useColaborador } from '@/lib/hooks/use-data'
import { atendenteNoFiltro, filtroEfetivo, tagsParaFiltro, tagsVisiveisPara, ticketNoFiltroDeTag } from '@/lib/tag-setor'
import { TagManagerDialog } from '@/components/dashboard/tag-manager-dialog'
import { computePausaElapsedMs, formatPausaStatusLabel, isPausaEstourada } from '@/lib/pausa-status'
import { canSeeAllTickets } from '@/lib/permissions'
import { hasSupervisorScope } from '@/lib/transfer-authorization'
import { unsubscribeCurrentBrowser } from '@/lib/use-push-notifications'
import { DateRange } from 'react-day-picker'
import { DatePeriodFilter, getDateCutoffs } from '@/components/date-period-filter'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WidgetManager } from '@/components/setor/WidgetManager'
import { FloatingSaveBar } from '@/components/dashboard/floating-save-bar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  ArrowLeft,
  MessageCircle,
  Clock,
  BarChart3,
  FileText,
  Settings,
  Search,
  RefreshCw,
  AlertCircle,
  LogOut,
  User,
  Loader2,
  Headphones,
  Phone,
  Mail,
  Users,
  Building2,
  Briefcase,
  ShoppingCart,
  Heart,
  Star,
  Zap,
  Globe,
  Smile,
  ThumbsUp,
  Bell,
  Calendar,
  Target,
  Award,
  Coffee,
  Play,
  Rocket,
  Shield,
  Truck,
  CreditCard,
  HelpCircle,
  Timer,
  TrendingUp,
  CheckCircle,
  Activity,
  ChevronDown,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
  EyeOff,
  Megaphone,
  ArrowRightLeft,
  Wifi,
  WifiOff,
  QrCode,
  Smartphone,
  MoreHorizontal,
  CircleOff,
  CircleCheck,
  Sparkles,
  History,
  Minus,
  Maximize2,
  GripVertical,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ClipboardCheck,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { calculateWorkloadOs, type WorkloadOsLevel } from '@/lib/workload-os'
import { calcularOrigem, type OrigemTicket } from '@/lib/ticket-origem'
import {
  classificarEntradasDeRoteamento,
  filtrarEntradasDeRoteamentoPorFiltroDeTicket,
  reconstruirEntradasDeRoteamento,
  resumirOrigensDeRoteamento,
  type EntradaRoteamento,
  type LogRoteamento,
} from '@/lib/relatorio-roteamento'
import { migrarLayoutRoteamentoV7 } from '@/lib/relatorio-layout'
import { isExactSubsetorMatch, matchesAtendenteSubsetorFilter, sanitizeSubsetorFilterSelection, SEM_SUBSETOR_ID } from '@/lib/subsetor-routing'
import { exportRelatorioCsv, exportRelatorioXlsx } from '@/lib/export-relatorio'
import { loadRowsByPages, loadRowsByValues } from '@/lib/supabase/paginate'
import { calcularIndicadoresDaFila, resumirFila, formatarEsperaLonga, faixaDeSaude, LIMITE_FILA_PADRAO_MIN as LIMITE_FILA_MIN, LIMITE_SLA_PADRAO_MIN as LIMITE_SLA_MIN } from '@/lib/relatorio-fila'
import { escolherSubsetorPadrao } from '@/lib/subsetor-padrao'
import { criarMedidorDeExpediente } from '@/lib/horario-atendimento'
import { CardAtendimentosTempoReal, TODOS_SUBSETORES } from '@/components/setor/card-atendimentos-tempo-real'
import { resolverIniciosTempoTransferencia } from '@/lib/ticket-transfer-timing'
import {
  calcularTempoReal,
  formatarTempoMonitoramento,
  MONITORING_REFRESH_OPTIONS,
} from '@/lib/monitoramento-tempo-real'
import { OrigemBadge } from '@/components/origem-badge'
import { MultiSelectFilter } from '@/components/monitoramento/multi-select-filter'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { Send, Hash, Check, Tag, Radio, Inbox, Layers } from 'lucide-react'
import { DisparoLogsSection } from '@/components/disparo-logs-section'
import { DisparosSection } from '@/components/setor/disparos-section'
import { HistoricoClienteSection } from '@/components/setor/historico-cliente-section'
import { AtendentesStatusModal, isAtendenteOnline } from '@/components/setor/atendentes-status-modal'
import { StatusAtendimentoPanel } from '@/components/setor/status-atendimento-panel'
import { ModelosIaSetor } from '@/components/setor/modelos-ia-setor'
import { MessageMediaPreview } from '@/components/chat/message-media-preview'
import { MensagemBubble, SeparadorConversaNexus, SeparadorInicioTicket } from '@/components/chat/mensagem-bubble'
import { TransferirTicketForm } from '@/components/tickets/transferir-ticket-dialog'
import { alvoDeBuscaDoTicket, correspondeAoTermo, normalizarTermoBusca } from '@/lib/busca-monitoramento'
import { formatPrimeCliente, formatSistemaCliente, isClientePrime } from '@/lib/cliente-softcom'
import { resolverUltimaMensagem, rotuloDeQuemFalou } from '@/lib/ultima-mensagem'
import { ehMensagemNexus, selecionarInicioHumanoDoTicket } from '@/lib/nexus-historico-ticket'
import { formatTicketStatus, formatTicketStatusCurto, ticketStatusBadgeClass } from '@/lib/ticket-status'
import {
  atendimentoStatusBadgeClass,
  computeAtendimentoStatus,
  DEFAULT_ATENCAO_MINUTOS,
  DEFAULT_CRITICO_MINUTOS,
  formatAtendimentoStatusLabel,
  isValidAtendimentoStatusThresholds,
  MAX_ATENDIMENTO_STATUS_MINUTOS,
  MIN_ATENDIMENTO_STATUS_MINUTOS,
} from '@/lib/atendimento-status'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveReactGridLayout = WidthProvider(Responsive)

const supabase = createClient()

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

function matchesSubsetorFilter(selectedSubsetorIds: string[], subsetorId?: string | null) {
  return selectedSubsetorIds.length === 0
    || selectedSubsetorIds.includes(subsetorId || SEM_SUBSETOR_ID)
}

function formatMonitoringTime(ms: number) {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

/** Cor por limiar: 5min vira atenção (âmbar), 10min vira crítico (vermelho). */
function corTempoMedioLimiar(ms: number) {
  if (ms >= 10 * 60_000) return 'text-red-600 dark:text-red-400'
  if (ms >= 5 * 60_000) return 'text-amber-600 dark:text-amber-400'
  return 'text-foreground'
}

type SortDirection = 'asc' | 'desc'
type SortValue = string | number | null | undefined
type ActiveTicketSortKey = 'status' | 'queueTime' | 'serviceTime' | 'ticket' | 'contact' | 'origin' | 'queue' | 'attendant'
type WaitingTicketSortKey = 'status' | 'queueTime' | 'ticket' | 'contact' | 'origin' | 'queue' | 'priority'
type AttendantSortKey = 'attendant' | 'status' | 'activeTickets' | 'finalizedToday'

interface SortState<Key extends string> {
  key: Key
  direction: SortDirection
}

const PT_BR_COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const PRIORITY_ORDER: Record<string, number> = {
  baixa: 1,
  normal: 2,
  media: 3,
  alta: 4,
  urgente: 5,
}

function escaparPadraoIlike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

function extrairPdvDoCliente(cliente: unknown) {
  const registro = Array.isArray(cliente) ? cliente[0] : cliente
  if (!registro || typeof registro !== 'object') return null
  const pdv = (registro as { PDV?: unknown }).PDV
  return typeof pdv === 'string' && pdv.trim() ? pdv.trim() : null
}

function getDurationMs(startDate: string | null, endDate: string | Date | null) {
  if (!startDate) return 0
  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, end - start)
}

function toSortableNumber(value: unknown) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatDuration(startDate: string | null, endDate: string | Date | null) {
  const totalMin = Math.floor(getDurationMs(startDate, endDate) / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`
  if (hours > 0) return `${hours}h`
  return `${minutes}min`
}

function compareSortValues(first: SortValue, second: SortValue, direction: SortDirection) {
  const firstMissing = first == null || first === ''
  const secondMissing = second == null || second === ''
  if (firstMissing || secondMissing) {
    if (firstMissing && secondMissing) return 0
    return firstMissing ? 1 : -1
  }

  const comparison = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : PT_BR_COLLATOR.compare(String(first), String(second))
  return direction === 'asc' ? comparison : -comparison
}

function getNextSort<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  return {
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }
}

function getOriginSortValue(origin: OrigemTicket | undefined) {
  if (!origin) return null
  return [origin.label, origin.setorOrigem, origin.transferidoPor].filter(Boolean).join(' ')
}

function SortableTableHead({
  label,
  active,
  direction,
  onSort,
  align = 'left',
}: {
  label: string
  active: boolean
  direction: SortDirection
  onSort: () => void
  align?: 'left' | 'center'
}) {
  const SortIcon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'center' && 'text-center',
      )}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'group inline-flex w-full items-center gap-1.5 rounded-sm py-2 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'center' && 'justify-center text-center',
        )}
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <SortIcon
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'opacity-40 group-hover:opacity-70')}
        />
      </button>
    </TableHead>
  )
}

// Available icons for sectors
const AVAILABLE_ICONS = [
  { name: 'MessageCircle', icon: MessageCircle },
  { name: 'Headphones', icon: Headphones },
  { name: 'Phone', icon: Phone },
  { name: 'Mail', icon: Mail },
  { name: 'Users', icon: Users },
  { name: 'Building2', icon: Building2 },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'ShoppingCart', icon: ShoppingCart },
  { name: 'Heart', icon: Heart },
  { name: 'Star', icon: Star },
  { name: 'Zap', icon: Zap },
  { name: 'Globe', icon: Globe },
  { name: 'Smile', icon: Smile },
  { name: 'ThumbsUp', icon: ThumbsUp },
  { name: 'Bell', icon: Bell },
  { name: 'Calendar', icon: Calendar },
  { name: 'Target', icon: Target },
  { name: 'Award', icon: Award },
  { name: 'Coffee', icon: Coffee },
  { name: 'Rocket', icon: Rocket },
  { name: 'Shield', icon: Shield },
  { name: 'Truck', icon: Truck },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'HelpCircle', icon: HelpCircle },
]

// Available colors
const AVAILABLE_COLORS = [
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#22C55E' },
  { name: 'Amarelo', value: '#EAB308' },
  { name: 'Laranja', value: '#F97316' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Roxo', value: '#8B5CF6' },
  { name: 'Ciano', value: '#06B6D4' },
  { name: 'Cinza', value: '#6B7280' },
]

// Days of week
const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
]

// Sidebar items (removed vendas and andico)
const sidebarItems = [
    { id: 'monitoramento', name: 'Monitoramento', icon: Activity, description: 'Monitore sua operação em tempo real' },
    { id: 'relatorios', name: 'Relatórios de atendimento', icon: FileText, description: 'Analise as métricas de atendimentos' },
    { id: 'historico', name: 'Histórico por Cliente', icon: History, description: 'Consulte o histórico de atendimentos por cliente' },
    { id: 'atendentes', name: 'Atendentes', icon: Users, description: 'Gerencie os atendentes do setor' },
    { id: 'horarios', name: 'Horários de atendimento', icon: Clock, description: 'Defina dias e horários disponíveis' },
    { id: 'pausas', name: 'Pausas', icon: Coffee, description: 'Gerencie os tipos de pausas dos atendentes' },
    { id: 'configuracoes', name: 'Configurações', icon: Settings, description: 'Configurações do setor' },
    { id: 'disparos', name: 'Disparos', icon: Send, description: 'Crie e acompanhe disparos em massa', whatsappOnly: true },
    { id: 'disparo_logs', name: 'Log de Disparos', icon: Megaphone, description: 'Historico de disparos realizados', whatsappOnly: true },
  ]

// Fetcher function
async function fetchSetorData(setorId: string) {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  // Date range for reports (last 90 days to support all filter options)
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

// Queries de monitoramento (dados ao vivo — atualizados pelo Realtime)
const [setorRes, ticketsAtivosRes, ticketsHojeRes, colaboradoresRes, horariosRes, permissoesRes, pausasRes, colabSubsetoresRes, todosSetoresRes] = await Promise.all([
    supabase.from('setores').select('*').eq('id', setorId).single(),
    // Tickets ativos (aberto ou em_atendimento)
    // Mesmo conjunto de campos de /api/clientes/lookup: é desta consulta que sai
    // o ticket aberto no painel de informações, e o CNPJ ainda é a chave da
    // consulta de MDM. Com só `nome, telefone` o painel mostrava "Não
    // informado" em tudo o mais.
    supabase.from('tickets').select('*, numero, colaboradores(nome), clientes(nome, telefone, email, CNPJ, Registro, PDV, software, prime)').eq('setor_id', setorId).in('status', ['aberto', 'em_atendimento']),
    // Tickets de hoje (para estatisticas)
    supabase.from('tickets').select('*, clientes(nome)').eq('setor_id', setorId).gte('criado_em', startOfDay),
    // Relatório de 90 dias removido daqui — agora é carregado separadamente
    supabase.from('colaboradores_setores').select('colaborador_id, tag_setor_id, colaboradores(id, nome, email, is_online, ativo, permissao_id, pausa_atual_id, last_heartbeat)').eq('setor_id', setorId),
    supabase.from('horarios_atendimento').select('*').eq('setor_id', setorId).order('dia_semana'),
    supabase.from('permissoes').select('*'),
    supabase.from('pausas').select('*').eq('setor_id', setorId).order('nome'),
    // Múltiplos subsetores por colaborador
    supabase.from('colaboradores_subsetores').select('colaborador_id, subsetor_id, subsetores(id, nome)').eq('setor_id', setorId),
    // Lookup global de setores — usado pra inferir origem de transbordos antigos
    supabase.from('setores').select('id, nome, setor_receptor_id'),
  ])

  const ticketsAtivos = ticketsAtivosRes.data || []
  const ticketsHoje = ticketsHojeRes.data || []
  const atendentesSetor = colaboradoresRes.data || []

  // Logs relevantes pra derivar "origem" dos tickets ativos
  // (criacao, transferencias, transbordos). Carrega em batch pra evitar N+1.
  const ticketsAtivosIds = ticketsAtivos.map((t: any) => t.id)
  const logsMap = new Map<string, any[]>()
  const assignmentEventsMap = new Map<string, any[]>()
  if (ticketsAtivosIds.length > 0) {
    const [logsResult, assignmentEventsData] = await Promise.all([
      supabase
        .from('ticket_logs')
        .select('ticket_id, tipo, descricao, criado_em')
        .in('ticket_id', ticketsAtivosIds)
        .in('tipo', ['criacao', 'transferencia', 'transferencia_automatica', 'transbordo_limite_atingido', 'pull_manual']),
      loadRowsByValues(
        supabase,
        'ticket_assignment_logs',
        '*',
        'ticket_id',
        ticketsAtivosIds,
      ).catch((error) => {
        console.warn('[Setor] Falha ao carregar eventos de atribuição:', error.message)
        return []
      }),
    ])
    const logsData = logsResult.data
    for (const l of (logsData || [])) {
      const arr = logsMap.get(l.ticket_id) || []
      arr.push(l)
      logsMap.set(l.ticket_id, arr)
    }
    for (const event of assignmentEventsData) {
      const arr = assignmentEventsMap.get(event.ticket_id) || []
      arr.push(event)
      assignmentEventsMap.set(event.ticket_id, arr)
    }
  }
  // Quem está acompanhando cada ticket. Tabela própria (ver a migration
  // 20260806140000): coluna em `tickets` daria uma 2ª FK para `colaboradores` e
  // quebraria os embeds `colaboradores(nome)` já usados aqui.
  const acompanhamentosMap = new Map<string, any>()
  if (ticketsAtivosIds.length > 0) {
    // `loadRowsByValues` não serve aqui: ele ordena por `id` para paginar, e
    // esta tabela é chaveada por `ticket_id`. A paginação por página com ordem
    // determinística é a mesma; só muda a coluna.
    const acompanhamentos = await loadRowsByPages(() => (
      supabase
        .from('ticket_acompanhamentos')
        .select('ticket_id, colaborador_id, colaborador_nome, iniciado_em')
        .in('ticket_id', ticketsAtivosIds)
        .order('ticket_id', { ascending: true })
    )).catch((error: any) => {
      // Sem a migration aplicada a coluna só não aparece — o resto da tela segue.
      console.warn('[Setor] Falha ao carregar acompanhamentos:', error?.message)
      return [] as any[]
    })

    for (const a of acompanhamentos) acompanhamentosMap.set(a.ticket_id, a)
  }

  // Anexa _logs em cada ticket ativo (mesma chave usada no relatório)
  for (const t of ticketsAtivos as any[]) {
    const ticket = t as any
    ticket._logs = logsMap.get(t.id) || []
    ticket._assignmentEvents = assignmentEventsMap.get(t.id) || []
    ticket._acompanhamento = acompanhamentosMap.get(t.id) || null
  }
  // Agrupar subsetores por colaborador
  const colabSubsetoresMap: Record<string, { id: string; nome: string }[]> = {}
  for (const cs of (colabSubsetoresRes.data || [])) {
    if (!colabSubsetoresMap[cs.colaborador_id]) colabSubsetoresMap[cs.colaborador_id] = []
    const subsetor = Array.isArray(cs.subsetores) ? cs.subsetores[0] : cs.subsetores
    if (subsetor) colabSubsetoresMap[cs.colaborador_id].push(subsetor as { id: string; nome: string })
  }
  const atendentesBase = atendentesSetor.map((as: any) => ({
    ...as.colaboradores,
    subsetor_ids: (colabSubsetoresMap[as.colaborador_id] || []).map((s: any) => s.id),
    subsetor_nomes: (colabSubsetoresMap[as.colaborador_id] || []).map((s: any) => s.nome),
    // Operação do atendente NESTE canal — o recorte de Suporte Chat x Pit Stop.
    tag_setor_id: as.tag_setor_id ?? null,
  })).filter(Boolean)

  // Dados da pausa ativa (nome + início + tempo máximo configurado) — mesmo padrão
  // isolado usado em app/dashboard/monitoramento/page.tsx (evita ambiguidade de FK).
  const pausaIds = atendentesBase.filter((a: any) => a.pausa_atual_id).map((a: any) => a.pausa_atual_id)
  const pausaInfoMap = new Map<string, { nome: string; inicio: string; tempoMaximoMinutos: number | null }>()
  // `pausa_id` e `setor_id` da INSTÂNCIA entram por causa do caso #97218: são
  // eles que dizem qual tipo está valendo (para tirá-lo da lista de troca) e a
  // que setor a pausa pertence. O atendente pode trabalhar em mais de um setor
  // e ter pausado no OUTRO — e quem mexe numa ausência que conta no setor X
  // tem que ser supervisor de X, que é a conferência que a rota faz.
  const instanciaMap = new Map<string, { pausaTipoId: string; pausaSetorId: string }>()
  if (pausaIds.length > 0) {
    const { data: pausasAtivas } = await supabase
      .from('pausas_colaboradores')
      .select('id, inicio, pausa_id, setor_id, pausas(nome, tempo_maximo_minutos)')
      .in('id', pausaIds)
    for (const p of pausasAtivas || []) {
      const pausaRelation = (p as any).pausas
      const pausaInfo = Array.isArray(pausaRelation) ? pausaRelation[0] : pausaRelation
      pausaInfoMap.set(p.id, {
        nome: pausaInfo?.nome || 'Pausa',
        inicio: p.inicio,
        tempoMaximoMinutos: pausaInfo?.tempo_maximo_minutos ?? null,
      })
      instanciaMap.set(p.id, {
        pausaTipoId: (p as any).pausa_id,
        pausaSetorId: (p as any).setor_id,
      })
    }
  }
  const atendentes = atendentesBase.map((a: any) => (
    a.pausa_atual_id
      ? {
          ...a,
          pausaInfo: pausaInfoMap.get(a.pausa_atual_id) || null,
          pausaTipoId: instanciaMap.get(a.pausa_atual_id)?.pausaTipoId ?? null,
          pausaSetorId: instanciaMap.get(a.pausa_atual_id)?.pausaSetorId ?? null,
        }
      : a
  ))

  // Calculate stats
  const ticketsNaFila = ticketsAtivos.filter((t: any) => t.status === 'aberto')
  const ticketsEmAtendimento = ticketsAtivos.filter((t: any) => t.status === 'em_atendimento')
  const ticketsFinalizadosHoje = ticketsHoje.filter((t: any) => t.status === 'encerrado')
  // Critério único de "online" — extraído pra atendentes-status-modal pra
  // evitar divergência entre telas (antes a aba Atendentes mostrava só is_online,
  // ignorando heartbeat e pausa, dando contagens diferentes).
  const atendentesOnline = atendentes.filter((c: any) => isAtendenteOnline(c))
  const atendentesEmPausa = atendentes.filter((c: any) => c.pausa_atual_id && c.ativo)

  // Calculate max time in queue
  const now = Date.now()
  let maxTempoFila = 0
  let maxTempoResposta = 0

  for (const ticket of ticketsNaFila) {
    if (ticket.criado_em) {
      const tempoFila = now - new Date(ticket.criado_em).getTime()
      if (tempoFila > maxTempoFila) maxTempoFila = tempoFila
    }
  }

  for (const ticket of ticketsEmAtendimento) {
    if (ticket.criado_em && !ticket.primeira_resposta_em) {
      const tempoResposta = now - new Date(ticket.criado_em).getTime()
      if (tempoResposta > maxTempoResposta) maxTempoResposta = tempoResposta
    }
  }

  const formatMs = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((ms % (1000 * 60)) / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return {
    setor: setorRes.data,
    tickets: ticketsAtivos,
    ticketsMonitoramentoHoje: ticketsHoje,
    atendentes,
    todosSetores: todosSetoresRes.data || [],
    permissoes: permissoesRes.data || [],
    horarios: horariosRes.data || [],
    stats: {
      total: ticketsAtivos.length,
      naFila: ticketsNaFila.length,
      emAtendimento: ticketsEmAtendimento.length,
      finalizadosHoje: ticketsFinalizadosHoje.length,
      tempoMaximoFila: formatMs(maxTempoFila),
      tempoMaximoResposta: formatMs(maxTempoResposta),
      mediaTicketsPorAtendente: atendentesOnline.length > 0
        ? Math.round(ticketsEmAtendimento.length / atendentesOnline.length)
        : 0,
    },
atendentesStats: {
      online: atendentesOnline.length,
      pausa: atendentesEmPausa.length,
      invisivel: atendentes.filter((c: any) => !c.is_online && c.ativo && !c.pausa_atual_id).length,
    },
    ticketsHoje: {
      total: ticketsHoje.length,
      perdidos: 0,
      abandonados: 0,
      finalizados: ticketsFinalizadosHoje.length,
      fechados: ticketsFinalizadosHoje.length,
    },
temposHoje: (() => {
      // Tempo médio de espera: criado_em → atribuido_em (tickets que foram atribuídos)
      const ticketsAtribuidos = ticketsHoje.filter((t: any) => t.atribuido_em && t.criado_em)
      const totalEspera = ticketsAtribuidos.reduce((acc: number, t: any) => {
        return acc + (new Date(t.atribuido_em).getTime() - new Date(t.criado_em).getTime())
      }, 0)
      const tempoMedioEspera = ticketsAtribuidos.length > 0 ? totalEspera / ticketsAtribuidos.length : 0

      // Tempo médio de 1ª resposta: criado_em → primeira_resposta_em
      const ticketsCom1aResp = ticketsHoje.filter((t: any) => t.primeira_resposta_em && t.criado_em)
      const total1aResp = ticketsCom1aResp.reduce((acc: number, t: any) => {
        return acc + (new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime())
      }, 0)
      const tempoMedio1aResp = ticketsCom1aResp.length > 0 ? total1aResp / ticketsCom1aResp.length : 0

      // Tempo médio de atendimento: atribuido_em → encerrado_em (tickets encerrados)
      const ticketsEncerradosHoje = ticketsHoje.filter((t: any) => t.status === 'encerrado' && t.encerrado_em && t.atribuido_em)
      const totalAtend = ticketsEncerradosHoje.reduce((acc: number, t: any) => {
        return acc + (new Date(t.encerrado_em).getTime() - new Date(t.atribuido_em).getTime())
      }, 0)
      const tempoMedioAtend = ticketsEncerradosHoje.length > 0 ? totalAtend / ticketsEncerradosHoje.length : 0

      // Tempo médio de resolução total: criado_em → encerrado_em. Só tickets
      // que não vieram de disparo — o cliente é quem inicia a resposta nesse
      // caso, então incluí-los infla o tempo sem refletir demora do atendente.
      const ticketsResolvidos = ticketsHoje.filter((t: any) => t.status === 'encerrado' && t.encerrado_em && t.criado_em && !t.is_disparo)
      const totalResolucao = ticketsResolvidos.reduce((acc: number, t: any) => {
        return acc + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime())
      }, 0)
      const tempoMedioResolucao = ticketsResolvidos.length > 0 ? totalResolucao / ticketsResolvidos.length : 0

      return {
        tempoMedioEspera: formatMs(tempoMedioEspera),
        tempoMedioEsperaMs: tempoMedioEspera,
        tempoMedioResposta: formatMs(tempoMedioResolucao),
        tempoMedioRespostaMs: tempoMedioResolucao,
        tempoMedioPrimeiraResposta: formatMs(tempoMedio1aResp),
        tempoMedioPrimeiraRespostaMs: tempoMedio1aResp,
        tempoMedioAtendimento: formatMs(tempoMedioAtend),
      }
    })(),
// Relatorio data — carregado separadamente via fetchRelatorio para não sobrecarregar o Realtime
    ticketsRelatorio: [] as any[],
    relatorioStats: calculateRelatorioStats([], formatMs),
    // Pausas
    pausas: pausasRes.data || [],
  }
  }

/**
 * Cards do Monitoramento que entram na grade ajustável — mesmo mecanismo da
 * tela de Relatórios: punho para arrastar, canto para redimensionar.
 *
 * A tabela de "Monitoramento detalhado" fica de fora de propósito: ela tem
 * abas, paginação e altura própria, e virar célula de grade estouraria o
 * arranjo em vez de ajudar.
 */
// A ORDEM é o que o empacotador usa para montar o arranjo padrão. Mudar aqui
// muda o padrão; por isso ela segue a leitura da tela, e não a ordem em que os
// cards foram criados.
// 'statusAtendentes' vem antes de 'atendimentoHoje' de propósito: o
// empacotador varre nessa ordem, e 'atendimentoHoje' ocupa a largura toda
// (12 colunas) — se ele fosse posicionado primeiro, seu vão de linha inteira
// "sela" todas as colunas na mesma altura e não sobra vão lateral pro card de
// status encaixar ao lado de 'tempoReal'.
const MONITOR_CARDS = [
  { id: 'tempoReal', label: 'Atendimentos em tempo real' },
  { id: 'porSubsetor', label: 'Atendimentos em tempo real (2º card)' },
  { id: 'statusAtendentes', label: 'Status dos atendentes' },
  { id: 'atendimentoHoje', label: 'Atendimento hoje' },
] as const

/**
 * Arranjo padrão do Monitoramento, na largura de 12 colunas.
 *
 *   linha 1   tempoReal (6)             porSubsetor (6)
 *   linha 2   statusAtendentes (2)   atendimentoHoje (10)
 *
 * As duas linhas somam 12 de propósito: é o que faz os cards nascerem lado a
 * lado em vez de empilhados. Combinado com a ordem acima, o empacotador
 * reproduz exatamente esse desenho — os dois cards de tempo real com a mesma
 * largura, e a linha de baixo com o resumo do dia ocupando a maior parte.
 */
const MONITOR_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  tempoReal: { w: 6, h: 6 },
  porSubsetor: { w: 6, h: 6 },
  atendimentoHoje: { w: 10, h: 3 },
  statusAtendentes: { w: 2, h: 3 },
}

/**
 * Arranjo padrão sem o segundo card de tempo real.
 *
 *   linha 1   tempoReal (8)         statusAtendentes (4, na mesma altura)
 *   linha 2   atendimentoHoje (12)
 *
 * Não basta esconder o `porSubsetor`: as larguras do caso com dois cards
 * deixariam metade da primeira linha vazia. Aqui o card de tempo real ocupa a
 * folga e o status dos atendentes sobe para o lado dele, com a mesma altura.
 */
const MONITOR_DEFAULT_SIZE_SEM_SEGUNDO: Record<string, { w: number; h: number }> = {
  tempoReal: { w: 8, h: 6 },
  atendimentoHoje: { w: 12, h: 3 },
  statusAtendentes: { w: 4, h: 6 },
}

// v2: a v1 nasceu com todos os cards empilhados em x=0. v3: remove o card
// 'statusTickets' e redistribui a largura da linha 2. v4: reordena
// 'statusAtendentes' antes de 'atendimentoHoje' — sem isso o card de largura
// 12 sela a altura de todas as colunas antes do de status ser posicionado, e
// ele cai empilhado embaixo em vez de ficar ao lado do card de tempo real.
// Trocar a chave dá a todo mundo o arranjo corrigido, em vez de exigir
// "Restaurar padrão".
const MONITOR_LAYOUT_STORAGE_KEY = 'setor-monitor-layout-v4'
const MONITOR_COLLAPSED_STORAGE_KEY = 'setor-monitor-collapsed-v1'
const MONITOR_PAGE_SIZE_STORAGE_KEY = 'setor-monitor-page-size-v1'
const ATENDENTES_PAGE_SIZE_STORAGE_KEY = 'setor-atendentes-page-size-v1'

/** Opções de "Resultados por página" das tabelas do setor. */
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const
const PAGE_SIZE_PADRAO = 5

/** Valor guardado só vale se for uma das opções — o resto cai no padrão. */
function lerPageSizeSalvo(chave: string): number | null {
  try {
    const salvo = Number(window.localStorage.getItem(chave))
    return PAGE_SIZE_OPTIONS.includes(salvo as typeof PAGE_SIZE_OPTIONS[number])
      ? salvo
      : null
  } catch {
    return null
  }
}
const MONITOR_COLLAPSED_H = 1

/**
 * Proporção da primeira linha do Monitoramento, em colunas da grade.
 *
 * Nasceu como classes `lg:grid-cols-[...]`, e virou letra morta quando os dois
 * cards passaram a ser itens da grade arrastável: a largura deixou de vir do
 * CSS e passou a vir do layout, então o controle mexia num valor que ninguém
 * lia. Agora ele reescreve a largura dos dois cards no próprio layout — que é
 * o mesmo que arrastar a borda, só que em um clique e sem desalinhar.
 */
const LARGURA_LINHA1 = {
  esquerda: [7, 5],
  equilibrado: [6, 6],
  direita: [5, 7],
} as const satisfies Record<string, readonly [number, number]>

type ProporcaoLinha1 = keyof typeof LARGURA_LINHA1

const ROTULO_PROPORCAO: Record<ProporcaoLinha1, string> = {
  esquerda: 'Mais espaço à esquerda',
  equilibrado: 'Equilibrado',
  direita: 'Mais espaço à direita',
}

// Cards selecionáveis no relatório (mostrar/ocultar via "Personalizar")
// v2/v7/v2: desativa 'saudeFila', 'maiorEspera', 'rankTipo' e 'matrizTipoTecnico'
// por padrão e estreita os KPIs — trocar a chave dá a todo mundo o arranjo
// corrigido, em vez de exigir "Restaurar padrão" (mesma técnica do Monitoramento).
const RELATORIO_CARDS_STORAGE_KEY = 'setor-relatorio-cards-v2'
const RELATORIO_COLLAPSED_STORAGE_KEY = 'setor-relatorio-collapsed-v1'
const RELATORIO_LAYOUT_STORAGE_KEY = 'setor-relatorio-layout-v7'
const RELATORIO_ORDER_STORAGE_KEY = 'setor-relatorio-order-v2'

// Preferência do filtro de subsetor no Monitoramento (aba Atendentes + filtro
// rápido, que compartilham o mesmo estado). Isolada por colaborador + setor —
// não pode vazar entre usuários nem entre setores no mesmo navegador.
function getAtendentesSubsetorFiltroStorageKey(colaboradorId: string, setorId: string) {
  return `setor-atendentes-subsetor-filtro-v1:${setorId}:${colaboradorId}`
}

// Tamanho padrão (em colunas de 12 / linhas de grid) de cada card
const RELATORIO_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  kpiPrimeiraResposta: { w: 4, h: 1 },
  kpiResolucao: { w: 4, h: 1 },
  kpiRecebidos: { w: 4, h: 1 },
  kpiResolvidos: { w: 4, h: 1 },
  kpiTaxa: { w: 4, h: 1 },
  kpiNps: { w: 4, h: 1 },
  saudeFila: { w: 6, h: 4 },
  maiorEspera: { w: 6, h: 4 },
  volume: { w: 6, h: 5 },
  heatmap: { w: 6, h: 5 },
  sla: { w: 6, h: 5 },
  nps: { w: 6, h: 4 },
  canal: { w: 4, h: 4 },
  status: { w: 4, h: 4 },
  roteamento: { w: 6, h: 6 },
  rankAtendente: { w: 4, h: 6 },
  rankPDV: { w: 4, h: 6 },
  rankTipo: { w: 4, h: 6 },
  matrizTipoTecnico: { w: 12, h: 6 },
  tabela: { w: 12, h: 7 },
}
const RELATORIO_COLLAPSED_H = 1

/** Cores por faixa de saúde da fila, para o limiar não se espalhar pela tela. */
const TOM_SAUDE = {
  boa: { texto: 'text-green-600 dark:text-green-400', barra: 'bg-green-500' },
  atencao: { texto: 'text-amber-600 dark:text-amber-400', barra: 'bg-amber-500' },
  critica: { texto: 'text-red-600 dark:text-red-400', barra: 'bg-red-500' },
} as const

// Empacota os cards em "masonry" (skyline): cada card vai para o vão mais alto
// disponível, preenchendo os buracos. Evita espaços vazios entre cards de
// alturas diferentes; as bordas ficam alinhadas. A ordem define a prioridade.
function buildDefaultLayout(
  orderedIds: string[],
  sizeMap: Record<string, { w: number; h: number }> = RELATORIO_DEFAULT_SIZE,
  columns: number = 12,
): Layout[] {
  const COLS = columns
  const colHeights = new Array(COLS).fill(0)
  return orderedIds.map((id) => {
    const d = sizeMap[id] || { w: 6, h: 4 }
    const w = Math.min(d.w, COLS)
    // acha o x (0..COLS-w) cujo topo é o menor possível (preenche o vão mais alto)
    let bestX = 0, bestY = Infinity
    for (let x = 0; x <= COLS - w; x++) {
      let top = 0
      for (let k = x; k < x + w; k++) top = Math.max(top, colHeights[k])
      if (top < bestY) { bestY = top; bestX = x }
    }
    const item = { i: id, x: bestX, y: bestY, w, h: d.h }
    for (let k = bestX; k < bestX + w; k++) colHeights[k] = bestY + d.h
    return item
  })
}
const RELATORIO_CARD_OPTIONS: { id: string; label: string }[] = [
  { id: 'kpiPrimeiraResposta', label: 'Tempo médio 1ª resposta' },
  { id: 'kpiResolucao', label: 'Tempo médio resolução' },
  { id: 'kpiRecebidos', label: 'Tickets recebidos' },
  { id: 'kpiResolvidos', label: 'Tickets resolvidos' },
  { id: 'kpiTaxa', label: 'Taxa de resolução' },
  { id: 'kpiNps', label: 'NPS Score' },
  { id: 'volume', label: 'Atendimentos ao longo do tempo' },
  { id: 'heatmap', label: 'Padrão horário por dia' },
  { id: 'sla', label: 'SLA de 1ª resposta' },
  { id: 'saudeFila', label: 'Saúde da fila' },
  { id: 'maiorEspera', label: 'Maior espera do período' },
  { id: 'nps', label: 'Satisfação (NPS)' },
  { id: 'canal', label: 'Por canal' },
  { id: 'status', label: 'Por resultado' },
  { id: 'roteamento', label: 'Transferências & transbordos' },
  { id: 'rankAtendente', label: 'Tickets por atendente' },
  { id: 'rankPDV', label: 'Tickets por PDV' },
  { id: 'rankTipo', label: 'Tipos de atendimento (ranking)' },
  { id: 'matrizTipoTecnico', label: 'Tipos por técnico (matriz)' },
  { id: 'tabela', label: 'Últimos atendimentos' },
]

// Arranjo padrão do time (ajustado à mão): posições/tamanhos exatos de cada card.
// É o layout inicial de todos os setores enquanto o usuário não personalizar.
// Cards ausentes aqui (ex.: 'canal') começam ocultos. Ordenado por leitura (y, x).
const RELATORIO_DEFAULT_LAYOUT: Layout[] = [
  { i: 'kpiPrimeiraResposta', x: 0, y: 0, w: 2, h: 1 },
  { i: 'kpiResolucao', x: 2, y: 0, w: 2, h: 1 },
  { i: 'kpiRecebidos', x: 4, y: 0, w: 2, h: 1 },
  { i: 'kpiResolvidos', x: 6, y: 0, w: 2, h: 1 },
  { i: 'kpiTaxa', x: 8, y: 0, w: 2, h: 1 },
  { i: 'kpiNps', x: 10, y: 0, w: 2, h: 1 },
  { i: 'volume', x: 0, y: 1, w: 9, h: 5 },
  { i: 'nps', x: 9, y: 1, w: 3, h: 4 },
  { i: 'heatmap', x: 6, y: 5, w: 4, h: 8 },
  { i: 'status', x: 10, y: 5, w: 2, h: 4 },
  { i: 'sla', x: 0, y: 6, w: 6, h: 5 },
  { i: 'roteamento', x: 6, y: 18, w: 6, h: 6 },
  { i: 'rankAtendente', x: 0, y: 11, w: 6, h: 7 },
  { i: 'rankPDV', x: 6, y: 13, w: 6, h: 5 },
  { i: 'tabela', x: 0, y: 24, w: 12, h: 7 },
]

const RELATORIO_KPI_IDS = new Set([
  'kpiPrimeiraResposta',
  'kpiResolucao',
  'kpiRecebidos',
  'kpiResolvidos',
  'kpiTaxa',
  'kpiNps',
])

const RELATORIO_MEIA_LARGURA_IDS = new Set([
  'saudeFila',
  'maiorEspera',
  'rankTipo',
  'nps',
  'canal',
  'status',
  'roteamento',
])

/**
 * O grid mede a largura da área de conteúdo, não a da janela. Com a lateral
 * aberta, uma janela de 1205px entra em `sm` (6 colunas). Deixar a biblioteca
 * converter o arranjo de 12 colunas cria sobreposições e empurra os cards para
 * baixo, deixando vazios enormes. Refluímos a ordem de leitura para cada grade.
 */
function buildResponsiveReportLayout(source: Layout[], columns: number): Layout[] {
  const ordered = [...source].sort((first, second) => (
    first.y - second.y || first.x - second.x || first.i.localeCompare(second.i)
  ))
  let x = 0
  let y = 0
  let rowHeight = 0

  return ordered.map((item) => {
    // KPI fixo em 2 colunas a partir do md: o conteúdo é curto (rótulo + valor
    // + badge), então meia grade (a conta antiga) sobrava espaço vazio — o
    // mesmo problema já corrigido no arranjo padrão (lg). Só no xxs (tela bem
    // estreita) ele ocupa a coluna toda, porque 2 unidades vira menor que o
    // conteúdo cabe.
    const width = RELATORIO_KPI_IDS.has(item.i)
      ? columns >= 4 ? 2 : columns
      : RELATORIO_MEIA_LARGURA_IDS.has(item.i) && columns >= 6
        ? columns / 2
        : columns

    if (x + width > columns) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }

    const reflowed = { ...item, x, y, w: width }
    x += width
    rowHeight = Math.max(rowHeight, item.h)

    if (x === columns) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }

    return reflowed
  })
}
// ids presentes no arranjo padrão = visíveis por padrão (os demais começam ocultos)
/**
 * Visíveis por padrão.
 *
 * Sai do arranjo padrão mais os cards acrescentados depois dele. Card novo que
 * não entre aqui nasce DESMARCADO: existe na lista do Personalizar e não
 * aparece na tela — é o caso de 'saudeFila', 'maiorEspera', 'rankTipo' e
 * 'matrizTipoTecnico' (desativados por padrão a pedido do usuário).
 */
const RELATORIO_DEFAULT_VISIBLE_IDS = new Set([
  ...RELATORIO_DEFAULT_LAYOUT.map((l) => l.i),
])
// ordem padrão para o painel "Reordenar": ordem de leitura do arranjo + ocultos no fim
const RELATORIO_DEFAULT_ORDER: string[] = [
  ...RELATORIO_DEFAULT_LAYOUT.map((l) => l.i),
  ...RELATORIO_CARD_OPTIONS.map((o) => o.id).filter((id) => !RELATORIO_DEFAULT_VISIBLE_IDS.has(id)),
]
function buildDefaultVisibleCards(): Record<string, boolean> {
  return Object.fromEntries(RELATORIO_CARD_OPTIONS.map((o) => [o.id, RELATORIO_DEFAULT_VISIBLE_IDS.has(o.id)]))
}

// Wrapper de cada relatório: punho p/ arrastar + minimizar. Tamanho/posição
// são controlados pelo react-grid-layout (arrastar pelo punho, redimensionar pelo canto).
function ReportWidget({
  editMode, label, collapsed, onToggleCollapse, children,
}: {
  editMode: boolean
  label: string
  collapsed: boolean
  onToggleCollapse: () => void
  children: React.ReactNode
}) {
  // Minimizado: barra compacta ocupando a célula
  if (collapsed) {
    return (
      <div className="flex h-full items-center gap-2 rounded-lg border bg-card px-3">
        {editMode && (
          <span className="report-drag-handle flex cursor-move items-center text-muted-foreground touch-none" title="Arraste para mover">
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6 text-muted-foreground"
          onClick={onToggleCollapse}
          aria-label={`Expandir ${label}`}
          title="Expandir"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }
  // Normal: o card preenche a célula; controles flutuam no canto só no modo de edição
  return (
    <div className="relative h-full [&>*]:h-full">
      {editMode && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border bg-background/85 px-0.5 shadow-sm backdrop-blur-sm">
          <span className="report-drag-handle flex h-6 cursor-move items-center px-0.5 text-muted-foreground touch-none" title="Arraste para mover">
            <GripVertical className="h-4 w-4" />
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={onToggleCollapse}
            aria-label={`Minimizar ${label}`}
            title="Minimizar"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}

// Filtro de período próprio dos gráficos de Demanda
const CHART_PERIOD_OPTIONS = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '15', label: 'Últimos 15 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]
function chartPeriodCutoffMs(days: number) {
  const now = new Date()
  if (days <= 1) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }
  return now.getTime() - days * 24 * 60 * 60 * 1000
}
function filterTicketsByDays(tickets: any[], days: number) {
  const cutoff = chartPeriodCutoffMs(days)
  return tickets.filter((t) => t.criado_em && new Date(t.criado_em).getTime() >= cutoff)
}
function buildSerieVolume(tickets: any[]) {
  const volumeMap: Record<string, number> = {}
  for (const t of tickets) {
    if (!t.criado_em) continue
    const d = new Date(t.criado_em)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    volumeMap[key] = (volumeMap[key] || 0) + 1
  }
  return Object.entries(volumeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => { const [, m, dd] = key.split('-'); return { date: `${dd}/${m}`, count } })
}
const DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Paleta categórica dos sete dias. Não usa os tokens --chart-N porque aqueles
// são de baixo croma (feitos para 2–3 séries) e, com sete linhas sobrepostas,
// ficariam indistinguíveis. Estas matizes são igualmente espaçadas e ficam em
// lightness ~0.6, que se lê tanto no tema claro quanto no escuro.
const DIAS_SEMANA_CORES = [
  'oklch(0.62 0.17 255)', // Dom — azul
  'oklch(0.66 0.19 45)',  // Seg — laranja (cor da marca)
  'oklch(0.68 0.14 175)', // Ter — verde-água
  'oklch(0.75 0.15 85)',  // Qua — âmbar
  'oklch(0.70 0.16 350)', // Qui — rosa
  'oklch(0.58 0.16 150)', // Sex — verde
  'oklch(0.55 0.18 295)', // Sáb — roxo
]

// Faixa exibida no eixo. A madrugada é sempre vazia (medido: 0 atendimentos
// entre 00h e 05h em 30 dias) e comprimia o resto do gráfico. O que cair fora
// da faixa é contado e informado, para nada sumir em silêncio.
const HORA_INICIO_GRAFICO = 6
const HORA_FIM_GRAFICO = 23

/**
 * Série horária (0..23) com uma linha por dia da semana.
 *
 * Hora cheia, e não blocos de 2h: numa linha o eixo X não custa largura como
 * custava numa célula de mapa de calor, então dá para ler o início do turno
 * (7h) e o fim (18h) sem o gráfico crescer.
 */
function buildHorarioPicoSerie(tickets: any[]) {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  let max = 0
  let picoDia = 0
  let picoHora = 0
  for (const t of tickets) {
    if (!t.criado_em) continue
    const d = new Date(t.criado_em)
    const dia = d.getDay()
    const hora = d.getHours()
    matrix[dia][hora]++
    if (matrix[dia][hora] > max) {
      max = matrix[dia][hora]
      picoDia = dia
      picoHora = hora
    }
  }

  // Recharts espera um ponto por hora com uma chave por série.
  const serie = []
  for (let hora = HORA_INICIO_GRAFICO; hora <= HORA_FIM_GRAFICO; hora++) {
    const ponto: Record<string, number | string> = { hora: `${String(hora).padStart(2, '0')}h` }
    DIAS_SEMANA_CURTOS.forEach((dia, di) => { ponto[dia] = matrix[di][hora] })
    serie.push(ponto)
  }

  // Atendimentos fora da faixa exibida — normalmente zero, mas se houver
  // movimento de madrugada o número aparece no rodapé em vez de sumir.
  let foraDaFaixa = 0
  for (let dia = 0; dia < 7; dia++) {
    for (let hora = 0; hora < 24; hora++) {
      if (hora < HORA_INICIO_GRAFICO || hora > HORA_FIM_GRAFICO) foraDaFaixa += matrix[dia][hora]
    }
  }

  const picoLabel = max > 0
    ? `${DIAS_SEMANA_CURTOS[picoDia]} ${String(picoHora).padStart(2, '0')}h`
    : '—'
  return { serie, max, picoLabel, foraDaFaixa }
}

// Calculate relatorio statistics
function calculateRelatorioStats(tickets: any[], formatMs: (ms: number) => string) {
  const ticketsEncerrados = tickets.filter((t) => t.status === 'encerrado')
  const ticketsComPrimeiraResposta = tickets.filter((t) => t.primeira_resposta_em && t.criado_em)
  const ticketsComResolucao = ticketsEncerrados.filter((t) => t.encerrado_em && t.criado_em)

  // Tempo médio de primeira resposta
  let tempoMedioPrimeiraResposta = 0
  if (ticketsComPrimeiraResposta.length > 0) {
    const total = ticketsComPrimeiraResposta.reduce((acc, t) => {
      return acc + (new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime())
    }, 0)
    tempoMedioPrimeiraResposta = total / ticketsComPrimeiraResposta.length
  }

  // Tempo médio de resolução
  let tempoMedioResolucao = 0
  if (ticketsComResolucao.length > 0) {
    const total = ticketsComResolucao.reduce((acc, t) => {
      return acc + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime())
    }, 0)
    tempoMedioResolucao = total / ticketsComResolucao.length
  }

  // Tickets por atendente (com tempo médio de 1ª resposta)
  const atendenteAgg: Record<string, { id: string | null; nome: string; count: number; respSum: number; respCount: number }> = {}
  for (const ticket of tickets) {
    if (ticket.colaboradores?.nome) {
      const key = ticket.colaborador_id || ticket.colaboradores.nome
      if (!atendenteAgg[key]) {
        atendenteAgg[key] = { id: ticket.colaborador_id || null, nome: ticket.colaboradores.nome, count: 0, respSum: 0, respCount: 0 }
      }
      atendenteAgg[key].count++
      if (ticket.primeira_resposta_em && ticket.criado_em) {
        atendenteAgg[key].respSum += new Date(ticket.primeira_resposta_em).getTime() - new Date(ticket.criado_em).getTime()
        atendenteAgg[key].respCount++
      }
    }
  }

  // Tickets por PDV
  const ticketsPorPDV: Record<string, { pdv: string; count: number }> = {}
  for (const ticket of tickets) {
    const pdv = ticket.clientes?.PDV || 'Sem PDV'
    if (!ticketsPorPDV[pdv]) {
      ticketsPorPDV[pdv] = { pdv, count: 0 }
    }
    ticketsPorPDV[pdv].count++
  }

  // Tickets por tipo de atendimento (classificação no encerramento)
  const ticketsPorTipo: Record<string, { tipo: string; count: number }> = {}
  for (const ticket of ticketsEncerrados) {
    const tipo = ticket.tipos_atendimento?.nome || 'Sem classificação'
    if (!ticketsPorTipo[tipo]) {
      ticketsPorTipo[tipo] = { tipo, count: 0 }
    }
    ticketsPorTipo[tipo].count++
  }

  // Série de volume por dia (criação)
  const volumeMap: Record<string, number> = {}
  for (const ticket of tickets) {
    if (!ticket.criado_em) continue
    const d = new Date(ticket.criado_em)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    volumeMap[key] = (volumeMap[key] || 0) + 1
  }
  const serieVolume = Object.entries(volumeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [, m, dd] = key.split('-')
      return { date: `${dd}/${m}`, count }
    })

  // Heatmap dia da semana (0=Dom) x bloco de 2h (0..11)
  const heatmapMatrix: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0))
  let heatmapMax = 0
  for (const ticket of tickets) {
    if (!ticket.criado_em) continue
    const d = new Date(ticket.criado_em)
    const dia = d.getDay()
    const bloco = Math.floor(d.getHours() / 2)
    heatmapMatrix[dia][bloco]++
    if (heatmapMatrix[dia][bloco] > heatmapMax) heatmapMax = heatmapMatrix[dia][bloco]
  }

  // SLA de 1ª resposta (meta: <= 15 min)
  const slaCount = { lt5: 0, lt15: 0, lt30: 0, gt30: 0 }
  for (const ticket of ticketsComPrimeiraResposta) {
    const min = (new Date(ticket.primeira_resposta_em).getTime() - new Date(ticket.criado_em).getTime()) / 60000
    if (min < 5) slaCount.lt5++
    else if (min < 15) slaCount.lt15++
    else if (min < 30) slaCount.lt30++
    else slaCount.gt30++
  }
  const semResposta = tickets.length - ticketsComPrimeiraResposta.length
  const slaBuckets = [
    { faixa: '< 5 min', count: slaCount.lt5 },
    { faixa: '5–15 min', count: slaCount.lt15 },
    { faixa: '15–30 min', count: slaCount.lt30 },
    { faixa: '> 30 min', count: slaCount.gt30 },
    { faixa: 'Sem resposta', count: semResposta },
  ]
  const slaDentroDaMeta = ticketsComPrimeiraResposta.length > 0
    ? Math.round(((slaCount.lt5 + slaCount.lt15) / ticketsComPrimeiraResposta.length) * 100)
    : 0

  // Distribuição por canal
  const canalMap: Record<string, number> = {}
  for (const ticket of tickets) {
    const canal = ticket.canal || 'desconhecido'
    canalMap[canal] = (canalMap[canal] || 0) + 1
  }
  const porCanal = Object.entries(canalMap).map(([canal, count]) => ({ canal, count })).sort((a, b) => b.count - a.count)

  // Distribuição por status/resultado
  const statusMap: Record<string, number> = {}
  for (const ticket of tickets) {
    const st = ticket.status || 'desconhecido'
    statusMap[st] = (statusMap[st] || 0) + 1
  }
  const porStatus = Object.entries(statusMap).map(([status, count]) => ({ status: formatTicketStatus(status), count }))

  // Tipos de atendimento por técnico (matriz) — sobre encerrados classificados
  const tiposColunasSet = new Set<string>()
  const tecnicoTipoAgg: Record<string, { nome: string; porTipo: Record<string, number>; total: number }> = {}
  for (const ticket of ticketsEncerrados) {
    if (!ticket.colaboradores?.nome) continue
    const tipoNome = ticket.tipos_atendimento?.nome || 'Sem classificação'
    tiposColunasSet.add(tipoNome)
    const key = ticket.colaborador_id || ticket.colaboradores.nome
    if (!tecnicoTipoAgg[key]) tecnicoTipoAgg[key] = { nome: ticket.colaboradores.nome, porTipo: {}, total: 0 }
    tecnicoTipoAgg[key].porTipo[tipoNome] = (tecnicoTipoAgg[key].porTipo[tipoNome] || 0) + 1
    tecnicoTipoAgg[key].total++
  }
  const tiposColunas = Array.from(tiposColunasSet).sort()
  const tiposPorAtendente = Object.values(tecnicoTipoAgg).sort((a, b) => b.total - a.total)

  // NPS calculation
  const ticketsComAvaliacao = tickets.filter((t) => t.avaliacoes?.[0]?.nota != null)
  const totalAvaliacoes = ticketsComAvaliacao.length
  const mediaNotas = totalAvaliacoes > 0
    ? ticketsComAvaliacao.reduce((acc, t) => acc + t.avaliacoes[0].nota, 0) / totalAvaliacoes
    : 0
  const promotores = ticketsComAvaliacao.filter((t) => t.avaliacoes[0].nota >= 9).length
  const detratores = ticketsComAvaliacao.filter((t) => t.avaliacoes[0].nota <= 6).length
  const npsScore = totalAvaliacoes > 0
    ? Math.round(((promotores - detratores) / totalAvaliacoes) * 100)
    : 0

  return {
    totalRecebidos: tickets.length,
    totalResolvidos: ticketsEncerrados.length,
    tempoMedioPrimeiraResposta: formatMs(tempoMedioPrimeiraResposta),
    tempoMedioResolucao: formatMs(tempoMedioResolucao),
    ticketsPorAtendente: Object.values(atendenteAgg)
      .map((a) => ({ id: a.id, nome: a.nome, count: a.count, avgPrimeiraRespostaMs: a.respCount > 0 ? a.respSum / a.respCount : null }))
      .sort((a, b) => b.count - a.count),
    ticketsPorPDV: Object.values(ticketsPorPDV).sort((a, b) => b.count - a.count),
    ticketsPorTipo: Object.values(ticketsPorTipo).sort((a, b) => b.count - a.count),
    taxaResolucao: tickets.length > 0 ? Math.round((ticketsEncerrados.length / tickets.length) * 100) : 0,
    npsScore,
    totalAvaliacoes,
    mediaNotas,
    serieVolume,
    heatmap: { matrix: heatmapMatrix, max: heatmapMax },
    slaBuckets,
    slaDentroDaMeta,
    porCanal,
    porStatus,
    tiposColunas,
    tiposPorAtendente,
    satisfacao: { promotores, neutros: totalAvaliacoes - promotores - detratores, detratores, media: mediaNotas, nps: npsScore },
  }
}

function filterReportTicketsBySearch(list: any[], searchCliente: string): any[] {
  const term = searchCliente.trim().toLowerCase()
  if (!term) return list

  const termPhone = term.replace(/\D/g, '')
  return list.filter((t: any) => {
    const nome = (t.clientes?.nome || '').toLowerCase()
    const cnpj = (t.clientes?.CNPJ || '').replace(/\D/g, '')
    const telefone = (t.clientes?.telefone || '').replace(/\D/g, '')
    const telefoneNorm = telefone.startsWith('55') ? telefone.slice(2) : telefone
    if (nome.includes(term)) return true
    if (termPhone && telefoneNorm.includes(termPhone)) return true
    if (termPhone && cnpj.includes(termPhone)) return true
    return false
  })
}

// Numeric KPIs used for the period-over-period comparison (Δ%). Kept separate
// from calculateRelatorioStats because we need raw numbers, not formatted strings.
function computeRelatorioKpis(tickets: any[]) {
  const encerrados = tickets.filter((t) => t.status === 'encerrado')
  const comPrimeira = tickets.filter((t) => t.primeira_resposta_em && t.criado_em)
  const comResolucao = encerrados.filter((t) => t.encerrado_em && t.criado_em)
  const avgPrimeira = comPrimeira.length
    ? comPrimeira.reduce((a, t) => a + (new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime()), 0) / comPrimeira.length
    : 0
  const avgResolucao = comResolucao.length
    ? comResolucao.reduce((a, t) => a + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime()), 0) / comResolucao.length
    : 0
  return {
    recebidos: tickets.length,
    resolvidos: encerrados.length,
    taxaResolucao: tickets.length ? (encerrados.length / tickets.length) * 100 : 0,
    tmaPrimeiraRespostaMs: avgPrimeira,
    tmaResolucaoMs: avgResolucao,
  }
}

// Equivalent previous period for the Δ comparison (e.g. last 7 days → the 7 days
// before that). Returns null when there is no meaningful previous window.
function getPrevPeriodCutoffs(
  dateFilter: string,
  customRange?: DateRange,
): { from: string; to: string } | null {
  if (dateFilter === 'all' || dateFilter === '0') return null
  if (dateFilter === 'custom') {
    if (!customRange?.from) return null
    const from = new Date(customRange.from)
    from.setHours(0, 0, 0, 0)
    const to = customRange.to ? new Date(customRange.to) : new Date(customRange.from)
    to.setHours(23, 59, 59, 999)
    const dur = to.getTime() - from.getTime()
    return { from: new Date(from.getTime() - dur - 1).toISOString(), to: new Date(from.getTime() - 1).toISOString() }
  }
  if (dateFilter === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { from: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: new Date(start.getTime() - 1).toISOString() }
  }
  const days = parseInt(dateFilter, 10)
  if (!Number.isNaN(days) && days > 0) {
    const ms = days * 24 * 60 * 60 * 1000
    const curStart = Date.now() - ms
    return { from: new Date(curStart - ms).toISOString(), to: new Date(curStart - 1).toISOString() }
  }
  return null
}

// Variation badge (▲/▼ + percent) vs. the previous period. Green/red are used
// strictly as variation semantics (orange stays the brand signal). `invert`
// flips the color logic for "lower is better" metrics like response time.
function DeltaBadge({
  current,
  previous,
  invert = false,
}: {
  current: number
  previous: number | null | undefined
  invert?: boolean
}) {
  if (previous == null) return null
  if (previous === 0 && current === 0) return null
  const diff = current - previous
  const pct = previous === 0 ? 100 : (diff / previous) * 100
  const flat = Math.abs(pct) < 0.5
  const up = diff > 0
  const good = flat ? null : invert ? !up : up
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        flat ? 'text-muted-foreground' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
      )}
      title="Variação vs. período anterior"
      aria-label={`Variação de ${Math.abs(pct).toFixed(0)}% ${up ? 'para cima' : 'para baixo'} versus o período anterior`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

// Get icon component by name
function getIconComponent(iconName: string | null) {
  if (!iconName) return MessageCircle
  const found = AVAILABLE_ICONS.find((i) => i.name === iconName)
  return found ? found.icon : MessageCircle
}

/**
 * A operação do atendente neste canal, exibida e editável no card.
 *
 * Grava em `colaboradores_setores.tag_setor_id` — o vínculo desta pessoa com
 * ESTE canal. Só quem pode editar vê o seletor; para os demais é leitura, senão
 * um atendente mudaria o próprio recorte de métrica.
 */
function TagSetorDoAtendente({
  atendenteId,
  atendenteNome,
  tagAtualId,
  tags,
  setorId,
  podeEditar,
  onSalvo,
}: {
  atendenteId: string
  atendenteNome: string
  tagAtualId: string | null
  tags: { id: string; nome: string; cor: string }[]
  setorId: string
  podeEditar: boolean
  onSalvo: () => void
}) {
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const tagAtual = tags.find((tag) => tag.id === tagAtualId) || null

  async function salvar(novoId: string | null) {
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('colaboradores_setores')
        .update({ tag_setor_id: novoId })
        .eq('colaborador_id', atendenteId)
        .eq('setor_id', setorId)
      if (error) throw error
      toast.success(
        novoId
          ? `${atendenteNome} agora é ${tags.find((tag) => tag.id === novoId)?.nome}`
          : `Tag removida de ${atendenteNome}`,
      )
      onSalvo()
    } catch {
      toast.error('Erro ao salvar a tag de setor')
    } finally {
      setSalvando(false)
    }
  }

  if (tags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60" title="Cadastre em Configurações > Tags de setor">
        nenhuma tag no canal
      </p>
    )
  }

  if (!podeEditar) {
    return tagAtual ? (
      <span
        className="mt-0.5 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium"
        style={{ borderColor: tagAtual.cor, color: tagAtual.cor }}
      >
        {tagAtual.nome}
      </span>
    ) : (
      <p className="text-xs text-muted-foreground/60">sem tag</p>
    )
  }

  return (
    <Select
      value={tagAtualId || 'none'}
      onValueChange={(v) => salvar(v === 'none' ? null : v)}
      disabled={salvando}
    >
      <SelectTrigger className="mt-0.5 h-7 text-xs" aria-label={`Tag de setor de ${atendenteNome}`}>
        {salvando ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            salvando
          </span>
        ) : (
          <SelectValue placeholder="Sem tag" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem tag</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag.id} value={tag.id}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.cor }} />
              {tag.nome}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SetorPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const setorId = params.id as string
  const { data: colaboradorLogado } = useColaborador()
  const [isPending, startTransition] = useTransition()
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)
  const [activeSection, setActiveSection] = useState('monitoramento')
  // Minimizar a barra de seções: preferência persistida, o gestor não quer
  // reabrir isso a cada navegação.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem('setor-sidebar-collapsed') === '1')
    } catch { /* preferência corrompida cai no padrão (expandida) */ }
  }, [])
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { window.localStorage.setItem('setor-sidebar-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [activeTicketsSort, setActiveTicketsSort] = useState<SortState<ActiveTicketSortKey>>({
    key: 'ticket',
    direction: 'asc',
  })
  const [waitingTicketsSort, setWaitingTicketsSort] = useState<SortState<WaitingTicketSortKey>>({
    key: 'ticket',
    direction: 'asc',
  })
  const [attendantsSort, setAttendantsSort] = useState<SortState<AttendantSortKey>>({
    key: 'attendant',
    direction: 'asc',
  })
  const [searchTerm, setSearchTerm] = useState('')
  // Normalizado uma vez só (trim, minúsculas, `#` inicial, dígitos do telefone);
  // as listas abaixo dependem dele, não do texto cru.
  const termoBusca = useMemo(() => normalizarTermoBusca(searchTerm), [searchTerm])
  const [searchAtendente, setSearchAtendente] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string[]>([])
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [subsetorFilter, setSubsetorFilter] = useState<string[]>([])
  const [tagSetorFilter, setTagSetorFilter] = useState(() => (
    searchParams.get('tags')?.split(',').filter(Boolean) || []
  ))
  const [relatorioSubsetorFilter, setRelatorioSubsetorFilter] = useState(() => (
    searchParams.get('subsetores')?.split(',').filter(Boolean) || []
  ))
  const [relatorioAtendenteFilter, setRelatorioAtendenteFilter] = useState(() => (
    searchParams.get('atendentes')?.split(',').filter(Boolean) || []
  ))
  // Subsetor acompanhado na coluna lateral do Monitoramento. Guardado por
  // gestor + setor, como o filtro rápido — a escolha é dele.
  // Cada card de tempo real tem o seu recorte. O principal nasce sem filtro
  // (setor inteiro); o segundo, no primeiro subsetor.
  const [subsetorCardPrincipal, setSubsetorCardPrincipal] = useState<string>(TODOS_SUBSETORES)
  const [subsetorCardSecundario, setSubsetorCardSecundario] = useState<string>('')
  // Nasce oculto: o segundo card de tempo real é um extra que o gestor liga no
  // Personalizar quando quer acompanhar dois subsetores lado a lado.
  const [painelSubsetorVisivel, setPainelSubsetorVisivel] = useState(false)
  const [proporcaoLinha1, setProporcaoLinha1] = useState<ProporcaoLinha1>('equilibrado')

  const [quickSubsetorFiltroOpen, setQuickSubsetorFiltroOpen] = useState(false)
  const [quickTagSetorFiltroOpen, setQuickTagSetorFiltroOpen] = useState(false)
  const [relatorioTagSetorFiltroOpen, setRelatorioTagSetorFiltroOpen] = useState(false)
  const [relatorioSubsetorFiltroOpen, setRelatorioSubsetorFiltroOpen] = useState(false)
  const [relatorioAtendenteFiltroOpen, setRelatorioAtendenteFiltroOpen] = useState(false)
  // Começam no padrão e são substituídos pelo valor salvo logo após a montagem:
  // ler o storage no inicializador quebraria a renderização no servidor.
  const [monitoringPageSize, setMonitoringPageSize] = useState<number>(PAGE_SIZE_PADRAO)
  const [monitoringPage, setMonitoringPage] = useState(1)
  const [attendantsPageSize, setAttendantsPageSize] = useState<number>(PAGE_SIZE_PADRAO)
  const [attendantsPage, setAttendantsPage] = useState(1)

  useEffect(() => {
    const monitoramento = lerPageSizeSalvo(MONITOR_PAGE_SIZE_STORAGE_KEY)
    if (monitoramento) setMonitoringPageSize(monitoramento)
    const atendentes = lerPageSizeSalvo(ATENDENTES_PAGE_SIZE_STORAGE_KEY)
    if (atendentes) setAttendantsPageSize(atendentes)
  }, [])

  /** Troca o tamanho da página, guarda a escolha e volta para a primeira. */
  const escolherPageSize = (
    valor: string,
    aplicar: (n: number) => void,
    irParaPrimeira: () => void,
    chave: string,
  ) => {
    const tamanho = Number(valor)
    aplicar(tamanho)
    irParaPrimeira()
    try {
      window.localStorage.setItem(chave, String(tamanho))
    } catch { /* navegador sem storage não impede paginar */ }
  }
  // Timestamp, não contador: o cálculo de tempo decorrido lê `monitoringTick`
  // direto como "agora" (ver uso em computePausaElapsedMs e no tempo de fila).
  const [monitoringTick, setTick] = useState(() => Date.now())
  // Popover da aba Atendentes: precisa de um estado de abertura PRÓPRIO — não
  // pode compartilhar `open` com o filtro rápido global (dois popovers
  // controlados pelo mesmo booleano abririam/fechariam juntos).
  const [atendentesTabSubsetorFiltroOpen, setAtendentesTabSubsetorFiltroOpen] = useState(false)
  // Estado de abertura próprio: a seleção é compartilhada, mas dois popovers
  // abertos ao mesmo tempo em telas diferentes não fazem sentido.
  const [secaoAtendentesSubsetorFiltroOpen, setSecaoAtendentesSubsetorFiltroOpen] = useState(false)
  // Guarda de hidratação: guarda a CHAVE (não um booleano) do localStorage que
  // já foi lida — comparar contra a chave atual (setor + colaborador), em vez
  // de um "já hidratou alguma vez", evita gravar a seleção do setor/colaborador
  // anterior na chave nova durante a janela entre a troca de setor e o efeito
  // de carregamento rodar (os dois efeitos podem disparar no mesmo commit,
  // e o de gravação leria subsetorFilter/hydrated ainda desatualizados).
  const [subsetorFilterHydratedKey, setSubsetorFilterHydratedKey] = useState<string | null>(null)
  // Setor para o qual `subsetores` já foi confirmado carregado (distingue
  // "[] porque não tem nenhum subsetor ativo" de "ainda carregando").
  const [subsetoresLoadedSetorId, setSubsetoresLoadedSetorId] = useState<string | null>(null)
  // Filtros do relatório inicializados a partir da querystring (link
  // compartilhável). A escrita de volta na URL acontece num effect mais abaixo.
  const [dateFilter, setDateFilter] = useState(() => searchParams.get('periodo') || 'today')
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    const de = searchParams.get('de')
    if (!de) return undefined
    const from = new Date(de)
    if (Number.isNaN(from.getTime())) return undefined
    const ate = searchParams.get('ate')
    const to = ate ? new Date(ate) : undefined
    return { from, to: to && !Number.isNaN(to.getTime()) ? to : undefined }
  })
  const [saving, setSaving] = useState(false)
  const [hasUnsavedConfig, setHasUnsavedConfig] = useState(false)
  // Vira true se detectarmos que a coluna setores.travar_ordenacao_chat ainda não existe
  // no banco (rollout de migration pendente) — usado só pra avisar na UI, não bloqueia o resto.
  const [travarOrdenacaoChatIndisponivel, setTravarOrdenacaoChatIndisponivel] = useState(false)
  const [limitesStatusAtendimentoIndisponiveis, setLimitesStatusAtendimentoIndisponiveis] = useState(false)
  // Mesma ideia para setores.oc_obrigatoria_para_encerrar — caso #97240.
  const [ocObrigatoriaIndisponivel, setOcObrigatoriaIndisponivel] = useState(false)
  // E para as colunas do caso #97520: encerramento_morto_* e openai_modelo_*.
  const [encerramentoMortoIndisponivel, setEncerramentoMortoIndisponivel] = useState(false)
  const [modelosIaIndisponiveis, setModelosIaIndisponiveis] = useState(false)
  const [statusAtendentesModalOpen, setStatusAtendentesModalOpen] = useState(false)
  // Dirty tracking das outras seções da página Configurações — alimenta a
  // FloatingSaveBar para unificar os múltiplos saves em um único CTA.
  const [hasUnsavedTipos, setHasUnsavedTipos] = useState(false)
  const [hasUnsavedDistribution, setHasUnsavedDistribution] = useState(false)
  const [hasUnsavedDestino, setHasUnsavedDestino] = useState(false)
  // Janelas de bloqueio de transbordo (ex.: almoço)
  interface TransbordoBloqueio { id?: string; hora_inicio: string; hora_fim: string; dias: number[] }
  const [transbordoBloqueios, setTransbordoBloqueios] = useState<TransbordoBloqueio[]>([])
  const [hasUnsavedTransbordoBloqueio, setHasUnsavedTransbordoBloqueio] = useState(false)
  const [savingTransbordoBloqueio, setSavingTransbordoBloqueio] = useState(false)

  const handleBackClick = () => {
    setIsNavigatingBack(true)
    startTransition(() => {
      router.push('/dashboard')
    })
  }

// Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => {} })

  // Delete setor state
  const [deletingSetor, setDeletingSetor] = useState(false)
  const [deleteSetorConfirmText, setDeleteSetorConfirmText] = useState('')

  const showConfirmDialog = (title: string, description: string, onConfirm: () => void) => {
    setConfirmDialog({ open: true, title, description, onConfirm })
  }

  // Delete setor function
  const handleDeleteSetor = async () => {
    if (deleteSetorConfirmText !== setor?.nome) {
      toast.error('Digite o nome do setor corretamente para confirmar a exclusão')
      return
    }
    
    setDeletingSetor(true)
    try {
      // Remover instâncias Evolution antes de deletar os canais do banco
      const evolutionCanais = canais.filter(c => c.tipo === 'evolution_api' && c.instancia)
      for (const canal of evolutionCanais) {
        try {
          await fetch(`/api/evolution/instance/${canal.instancia}`, { method: 'DELETE' })
        } catch (evoError) {
          console.error(`Erro ao remover instância Evolution ${canal.instancia}:`, evoError)
        }
      }

      // Delete all related data first
      await supabase.from('colaboradores_setores').delete().eq('setor_id', setorId)
      await supabase.from('subsetores').delete().eq('setor_id', setorId)
      await supabase.from('pausas').delete().eq('setor_id', setorId)
      await supabase.from('templates_mensagem').delete().eq('setor_id', setorId)
      await supabase.from('setor_canais').delete().eq('setor_id', setorId)
      await supabase.from('setor_tipos_atendimento').delete().eq('setor_id', setorId)
      
      // Finally delete the setor
      const { error } = await supabase.from('setores').delete().eq('id', setorId)
      if (error) throw error
      
      toast.success('Setor excluído com sucesso!')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error deleting setor:', error)
      toast.error(error.message || 'Erro ao excluir setor')
    } finally {
      setDeletingSetor(false)
    }
  }

// Notification modal state
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const [notificationModalTab, setNotificationModalTab] = useState<'novo' | 'historico'>('novo')
  const [notificationForm, setNotificationForm] = useState({
    destinatario: 'todos', // 'todos' or colaborador id
    titulo: '',
    mensagem: '',
  })
  const [sendingNotification, setSendingNotification] = useState(false)
  const [avisosEnviados, setAvisosEnviados] = useState<any[]>([])
  const [loadingAvisos, setLoadingAvisos] = useState(false)
  const [deletingAvisoId, setDeletingAvisoId] = useState<string | null>(null)

  // Tags list (for tag selector in config)
  const [tagsList, setTagsList] = useState<{ id: string; nome: string; cor: string }[]>([])
  // Tags de setor: operação que o canal executa (Suporte Chat, Pit Stop).
  // Dimensão separada de `tags`, que agrupa por origem (Matriz, Filial...).
  const [tagsSetorList, setTagsSetorList] = useState<{ id: string; nome: string; cor: string; ordem?: number }[]>([])
  const [tagsSetorLoadedSetorId, setTagsSetorLoadedSetorId] = useState<string | null>(null)
  const [isTagsSetorDialogOpen, setIsTagsSetorDialogOpen] = useState(false)

  // Config form state
  const [configForm, setConfigForm] = useState({
  nome: '',
  descricao: '',
  icon_url: 'MessageCircle',
  cor: '#3B82F6',
  mensagem_finalizacao: '',
  canal: 'whatsapp' as 'whatsapp' | 'discord' | 'evolution_api',
  template_id: '',
  phone_number_id: '',
  template_language: 'pt_BR',
  whatsapp_token: '',
  max_disparos_dia: 0,
  discord_bot_token: '',
  discord_guild_id: '',
  evolution_base_url: '',
  evolution_api_key: '',
  webhook_ativo: true,
  avaliacao_ativa: true,
  tempo_espera_minutos: 10,
  tag_id: '' as string,
  is_receptor: false,
  transmissao_ativa: false,
  setor_receptor_id: '' as string,
  openai_api_key: '',
  openai_ativo: false,
  openai_url_personalizada: false,
  openai_base_url: '',
  openai_modelo_chat: '',
  openai_modelo_transcricao: '',
  nexus_ativo: false,
  assistente_ia: false,
  assinatura_ativa: false,
  encerramento_auto_ativo: false,
  encerramento_auto_minutos: 30,
  encerramento_morto_ativo: false,
  encerramento_morto_horas: 24,
  travar_ordenacao_chat: false,
  atendimento_status_atencao_minutos: DEFAULT_ATENCAO_MINUTOS,
  atendimento_status_critico_minutos: DEFAULT_CRITICO_MINUTOS,
  oc_obrigatoria_para_encerrar: false,
  })
  const statusAtencaoInputRef = useRef<HTMLInputElement>(null)

// Templates state
  const [templates, setTemplates] = useState<any[]>([])
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [templateForm, setTemplateForm] = useState({
    atalho: '',
    mensagem: '',
  })

  // Canais state
  interface Canal {
    id: string
    setor_id: string
    nome: string
    tipo: 'whatsapp' | 'evolution_api' | 'discord'
    phone_number_id: string | null
    whatsapp_token: string | null
    template_id: string | null
    template_language: string | null
    evolution_base_url: string | null
    evolution_api_key: string | null
    discord_bot_token: string | null
    discord_guild_id: string | null
    instancia: string | null
    max_disparos_dia: number
    ativo: boolean
    criado_em: string
  }
  const [canais, setCanais] = useState<Canal[]>([])
  const [todosSetores, setTodosSetores] = useState<{ id: string; nome: string; is_receptor?: boolean }[]>([])
  const [tiposAtendimentoSetor, setTiposAtendimentoSetor] = useState<Record<string, string | null>>({
    suporte: null,
    ouvidoria: null,
    financeiro: null,
    implantacao: null,
    comercial: null,
  })
  const [savingTiposAtendimento, setSavingTiposAtendimento] = useState(false)

  // Classificação de Atendimento (tipos por setor usados no encerramento)
  interface TipoAtendimento {
    id: string
    nome: string
    cor: string | null
    ativo: boolean
    ordem: number
  }
  const [classificacoes, setClassificacoes] = useState<TipoAtendimento[]>([])
  const [novaClassificacao, setNovaClassificacao] = useState('')
  const [savingClassificacao, setSavingClassificacao] = useState(false)
  const [editingClassificacaoId, setEditingClassificacaoId] = useState<string | null>(null)
  const [editingClassificacaoNome, setEditingClassificacaoNome] = useState('')

  // Distribuição de tickets state
  const [distributionConfig, setDistributionConfig] = useState({
    max_tickets_per_agent: 10,
    auto_assign_enabled: true,
  })
  const [savingDistribution, setSavingDistribution] = useState(false)

  // Setores destino de transferência
  const [setoresDestinoTransferencia, setSetoresDestinoTransferencia] = useState<string[]>([])
  const [savingSetoresDestino, setSavingSetoresDestino] = useState(false)
  const [searchSetorDestino, setSearchSetorDestino] = useState('')
  const [isCanalModalOpen, setIsCanalModalOpen] = useState(false)
  const [editingCanal, setEditingCanal] = useState<Canal | null>(null)
  const [canalForm, setCanalForm] = useState({
    nome: '',
    tipo: 'whatsapp' as 'whatsapp' | 'evolution_api' | 'discord',
    phone_number_id: '',
    whatsapp_token: '',
    template_id: '',
    template_language: 'pt_BR',
    evolution_base_url: '',
    evolution_api_key: '',
    discord_bot_token: '',
    discord_guild_id: '',
    instancia: '',
    max_disparos_dia: 0,
    ativo: true,
  })
  const [savingCanal, setSavingCanal] = useState(false)
  const [deletingCanalId, setDeletingCanalId] = useState<string | null>(null)
  const [canalNomeError, setCanalNomeError] = useState(false)

  // Evolution API flow state
  const [evoStep, setEvoStep] = useState<'form' | 'qrcode' | 'connected'>('form')
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null)
  const [evoInstanceName, setEvoInstanceName] = useState<string | null>(null)
  const [evoCreatingInstance, setEvoCreatingInstance] = useState(false)
  const evoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Canal statuses (canalId -> 'open' | 'close' | 'connecting' | 'unknown')
  const [canalStatuses, setCanalStatuses] = useState<Record<string, string>>({})
  // Canais sendo verificados manualmente
  const [checkingCanalId, setCheckingCanalId] = useState<string | null>(null)

  // Reconnect dialog state
  const [reconnectDialog, setReconnectDialog] = useState<{
    open: boolean
    canal: Canal | null
    qr: string | null
    loading: boolean
    connected: boolean
  }>({ open: false, canal: null, qr: null, loading: false, connected: false })
  const reconnectPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Subsetores state
  interface Subsetor {
    id: string
    setor_id: string
    nome: string
    descricao: string | null
    ativo: boolean
    criado_em: string
  }
  interface TransferAtendente {
    id: string
    nome: string
    is_online: boolean
    ativo: boolean
    pausa_atual_id: string | null
    last_heartbeat: string | null
    subsetor_ids: string[]
  }
  const [subsetores, setSubsetores] = useState<Subsetor[]>([])
  const [isSubsetorModalOpen, setIsSubsetorModalOpen] = useState(false)
  const [editingSubsetor, setEditingSubsetor] = useState<Subsetor | null>(null)
  const [subsetorForm, setSubsetorForm] = useState({ nome: '', descricao: '' })
  const [savingSubsetor, setSavingSubsetor] = useState(false)
  const [deletingSubsetorId, setDeletingSubsetorId] = useState<string | null>(null)

  // Chave de armazenamento do setor + colaborador atuais — null enquanto um
  // dos dois ainda não é conhecido. Usada tanto para localStorage quanto como
  // identidade de "hidratado para qual escopo" (ver subsetorFilterHydratedKey).
  const subsetorFilterStorageKey = colaboradorLogado?.id && setorId
    ? getAtendentesSubsetorFiltroStorageKey(colaboradorLogado.id, setorId)
    : null

  // Carrega a preferência de subsetorFilter salva (por colaborador + setor)
  // assim que soubermos quem está logado e qual setor é este. Roda de novo se
  // o colaborador ou o setor mudarem (navegação entre setores reaproveita o
  // componente sem desmontar) — evita vazamento de seleção entre usuários/setores.
  useEffect(() => {
    if (!subsetorFilterStorageKey) return
    let parsed: unknown = []
    try {
      const saved = window.localStorage.getItem(subsetorFilterStorageKey)
      parsed = saved ? JSON.parse(saved) : []
    } catch {
      parsed = []
    }
    setSubsetorFilter(
      Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
        ? parsed as string[]
        : []
    )
    setSubsetorFilterHydratedKey(subsetorFilterStorageKey)
  }, [subsetorFilterStorageKey])

  // Persiste sempre que subsetorFilter mudar — só quando a chave já hidratada
  // é EXATAMENTE a chave atual (não só "hidratou alguma vez"). Isso impede que,
  // logo após trocar de setor/colaborador, este efeito grave a seleção antiga
  // (ainda em `subsetorFilter`) na chave nova antes do efeito de carregamento
  // acima ter rodado — os dois podem disparar no mesmo commit, e este efeito
  // veria valores desatualizados se a guarda fosse só um booleano.
  useEffect(() => {
    if (!subsetorFilterStorageKey || subsetorFilterHydratedKey !== subsetorFilterStorageKey) return
    try {
      window.localStorage.setItem(subsetorFilterStorageKey, JSON.stringify(subsetorFilter))
    } catch {}
  }, [subsetorFilter, subsetorFilterHydratedKey, subsetorFilterStorageKey])

  // Depois que os subsetores carregam PARA O SETOR ATUAL (subsetoresLoadedSetorId
  // === setorId — distingue "carregado e vazio" de "ainda carregando"), descarta
  // da seleção (e da preferência salva, via o effect de persistência acima)
  // qualquer id que não existe mais ou foi desativado — sem isso um id inválido
  // salvo prenderia a tela num filtro que nunca bate com nenhum atendente.
  useEffect(() => {
    if (!subsetorFilterStorageKey || subsetorFilterHydratedKey !== subsetorFilterStorageKey) return
    if (subsetoresLoadedSetorId !== setorId) return
    setSubsetorFilter((prev) => sanitizeSubsetorFilterSelection(
      prev,
      subsetores.filter((s) => s.ativo).map((s) => s.id),
    ))
  }, [subsetorFilterHydratedKey, subsetorFilterStorageKey, subsetoresLoadedSetorId, setorId, subsetores])

  // Pausas state
  interface Pausa {
    id: string
    nome: string
    descricao: string | null
    ativo: boolean
    setor_id: string
    criado_em: string
    tempo_maximo_minutos: number | null
  }
  const [pausas, setPausas] = useState<Pausa[]>([])
  const [isPausaModalOpen, setIsPausaModalOpen] = useState(false)
  const [editingPausa, setEditingPausa] = useState<Pausa | null>(null)
  const [pausaForm, setPausaForm] = useState({ nome: '', descricao: '', tempo_maximo_minutos: '' })
  const [deletingPausaId, setDeletingPausaId] = useState<string | null>(null)

  // Available template variables
  const templateVariables = [
    { key: '{{cliente_nome}}', label: 'Nome do Cliente' },
    { key: '{{cliente_telefone}}', label: 'Telefone do Cliente' },
    { key: '{{cliente_cnpj}}', label: 'CNPJ do Cliente' },
    { key: '{{atendente_nome}}', label: 'Nome do Atendente' },
    { key: '{{setor_nome}}', label: 'Nome do Setor' },
    { key: '{{ticket_id}}', label: 'ID do Ticket' },
    { key: '{{data_atual}}', label: 'Data Atual' },
    { key: '{{hora_atual}}', label: 'Hora Atual' },
  ]

  // Horarios state
  const [horariosEdit, setHorariosEdit] = useState<any[]>([])

  // Atendentes state
  const [isAtendenteModalOpen, setIsAtendenteModalOpen] = useState(false)
  const [editingAtendente, setEditingAtendente] = useState<any>(null)
  const [atendenteSubsetorIds, setAtendenteSubsetorIds] = useState<string[]>([])
  const [atendenteForm, setAtendenteForm] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    novaSenha: '',
    confirmarNovaSenha: '',
    suporte_id: '',
  })
  const [savingAtendente, setSavingAtendente] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false)
  const [existingColaborador, setExistingColaborador] = useState<any>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [atendenteToDelete, setAtendenteToDelete] = useState<{ id: string; nome: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)

  /**
   * Caso #97218 — a supervisão manda na disponibilidade do atendente.
   *
   * ── POR QUE PELA ROTA, E NÃO POR UPDATE DIRETO ─────────────────────────────
   * Esta tela escrevia `colaboradores` do navegador, com o cliente anônimo, e
   * fazia `pausa_atual_id: null` sem encerrar a instância. Isso deixava a linha
   * de `pausas_colaboradores` com `fim IS NULL` para sempre, e a produtividade
   * — que trata `fim` nulo como pausa em andamento e conta até agora — passava
   * a somar uma ausência que nunca termina. Além disso a autorização era só a
   * RLS da tabela, que não sabe o que é "supervisor deste setor".
   *
   * /api/colaborador/toggle-status resolve os dois: exige sessão, exige
   * `hasSupervisorScope` sobre setor a que o alvo esteja vinculado, e encerra a
   * instância aberta sempre que o ponteiro é limpo. É a mesma rota que a tela de
   * monitoramento e o WorkDesk usam — uma porta só para o mesmo dado.
   */
  const comandarDisponibilidade = async (
    colaboradorId: string,
    corpo: Record<string, unknown>,
    { sucesso, falha }: { sucesso: string; falha: string },
  ) => {
    setAlterandoStatusId(colaboradorId)
    try {
      const res = await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, ...corpo }),
      })
      const resultado = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(resultado?.error || falha)
        return
      }
      toast.success(sucesso)
      mutate()
    } catch (err: any) {
      toast.error(err?.message || falha)
    } finally {
      setAlterandoStatusId(null)
    }
  }

  // Alterar status do atendente. `pausaAtualId: null` limpa o ponteiro E manda a
  // rota encerrar a pausa aberta — quem estava em pausa sai dela por aqui também.
  const handleAlterarStatusAtendente = (colaboradorId: string, novoStatus: 'online' | 'offline') =>
    comandarDisponibilidade(colaboradorId, { isOnline: novoStatus === 'online', pausaAtualId: null }, {
      sucesso: `Atendente marcado como ${novoStatus === 'online' ? 'Online' : 'Offline'}`,
      falha: 'Erro ao alterar status',
    })

  // Abre instância nova e deixa o atendente offline, como o painel do WorkDesk
  // faz quando ele mesmo entra em pausa.
  const handleColocarEmPausa = (colaboradorId: string, tipoId: string) =>
    comandarDisponibilidade(colaboradorId, { iniciarPausaId: tipoId }, {
      sucesso: 'Atendente colocado em pausa',
      falha: 'Não foi possível colocar o atendente em pausa',
    })

  // Encerra a instância (`fim`) e devolve ao atendimento.
  const handleTirarDaPausa = (colaboradorId: string) =>
    comandarDisponibilidade(colaboradorId, { encerrarPausa: true }, {
      sucesso: 'Atendente retirado da pausa',
      falha: 'Não foi possível tirar o atendente da pausa',
    })

  // Reetiqueta a pausa em andamento preservando `inicio` — o cronômetro NÃO
  // zera, e o tempo decorrido passa a ser julgado pelo limite do tipo novo.
  const handleTrocarTipoDePausa = (colaboradorId: string, tipoId: string) =>
    comandarDisponibilidade(colaboradorId, { trocarTipoPausaId: tipoId }, {
      sucesso: 'Tipo da pausa alterado',
      falha: 'Não foi possível trocar o tipo da pausa',
    })

  /**
   * Ticket aberto NÃO bloqueia a ação — bloquear tornaria a ferramenta inútil
   * exatamente no caso que a motivou, o atendente que sumiu COM tickets
   * abertos. Os tickets seguem atribuídos a ele; o gestor só é avisado de
   * quantos são antes de confirmar. Sem ticket aberto não há o que avisar.
   */
  const [confirmacaoDisponibilidade, setConfirmacaoDisponibilidade] = useState<
    { nome: string; tickets: number; rotulo: string; executar: () => Promise<void> } | null
  >(null)

  const pedirDisponibilidade = (
    atendente: { id: string; nome: string },
    tickets: number,
    rotulo: string,
    executar: () => Promise<void>,
  ) => {
    if (tickets > 0) {
      setConfirmacaoDisponibilidade({ nome: atendente.nome, tickets, rotulo, executar })
      return
    }
    void executar()
  }

  // Conversation slide-out state
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const [conversationMessages, setConversationMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [conversationTab, setConversationTab] = useState<'atendimento' | 'transferir' | 'info'>('atendimento')
  // Nota interna do supervisor (mensagem privada pro atendente — nunca vai pro cliente)
  const [notaInterna, setNotaInterna] = useState('')
  const [enviandoNota, setEnviandoNota] = useState(false)
  // Barra lateral "Status do atendimento" — a leitura de IA ao lado da conversa
  const [statusAtendimentoAberto, setStatusAtendimentoAberto] = useState(false)
  // Acompanhamento do gestor no ticket aberto na conversa
  const [salvandoAcompanhamento, setSalvandoAcompanhamento] = useState(false)

  // Última fala da conversa: o painel já mostrava "com atendente" e "no setor",
  // mas nenhum dos dois distingue conversa andando de conversa parada.
  // `monitoringTick` entra na dependência para o tempo correr sozinho, junto do
  // relógio que a tela já mantém.
  const ultimaMensagem = useMemo(
    () => resolverUltimaMensagem(conversationMessages),
    [conversationMessages],
  )
  const tempoDesdeUltimaMensagem = useMemo(
    () => (ultimaMensagem ? formatDuration(ultimaMensagem.enviadoEm, null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ultimaMensagem, monitoringTick],
  )

  // Consulta de MDM do cliente — mesma rota que o WorkDesk usa. A chave é o
  // CNPJ; cliente sem CNPJ não tem como ser consultado.
  const cnpjDoCliente = selectedTicket?.clientes?.CNPJ ?? null
  const [mdmLoading, setMdmLoading] = useState(false)
  const [mdmErro, setMdmErro] = useState<string | null>(null)
  const [mdmResultado, setMdmResultado] = useState<{
    hasMdm: boolean
    installedCount: number
    totalMachines: number
  } | null>(null)

  // Consulta sob demanda, não ao abrir o ticket: é uma chamada a um serviço
  // externo por CNPJ, e o gestor abre muito ticket sem precisar do MDM. O
  // ticket que abre é sempre um; os que ele passa os olhos, dezenas.
  const requisicaoMdmRef = useRef(0)

  const consultarMdm = useCallback(() => {
    const cnpj = (cnpjDoCliente || '').replace(/\D/g, '')
    if (!cnpj) return

    const requisicao = ++requisicaoMdmRef.current
    setMdmLoading(true)
    setMdmErro(null)
    fetch(`/api/mdm?cnpj=${cnpj}`)
      .then(async (res) => {
        const dados = await res.json()
        if (!res.ok) throw new Error(dados?.error || 'Falha ao consultar o MDM')
        // Descarta resposta de consulta antiga: trocar de ticket no meio da
        // requisição mostraria o MDM de um cliente no painel de outro.
        if (requisicao === requisicaoMdmRef.current) setMdmResultado(dados)
      })
      .catch((erro: Error) => {
        // Falha de MDM não pode derrubar o painel: o resto das informações do
        // ticket continua servindo mesmo sem essa consulta.
        if (requisicao === requisicaoMdmRef.current) setMdmErro(erro.message || 'Falha ao consultar o MDM')
      })
      .finally(() => {
        if (requisicao === requisicaoMdmRef.current) setMdmLoading(false)
      })
  }, [cnpjDoCliente])

  // Trocou de ticket: limpa o resultado anterior e invalida requisição em voo.
  useEffect(() => {
    requisicaoMdmRef.current += 1
    setMdmResultado(null)
    setMdmErro(null)
    setMdmLoading(false)
  }, [cnpjDoCliente])

  // A conversa abre no fim, na mensagem mais recente — sempre. Ver
  // `ABERTURA_DA_CONVERSA` em lib/scroll-conversa.ts para o porquê de não haver
  // mais a exceção do "início do ticket".
  useEffect(() => {
    if (
      conversationTab !== 'atendimento' ||
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
    scrollToEnd()
    const observer = new ResizeObserver(scrollToEnd)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    const stop = setTimeout(() => observer.disconnect(), 1500)
    return () => {
      observer.disconnect()
      clearTimeout(stop)
    }
  }, [conversationTab, loadingMessages, conversationMessages, selectedTicket?.id])

  const { data, isLoading, mutate } = useSWR(
    setorId ? ['setor-detail', setorId] : null,
    () => fetchSetorData(setorId),
    MONITORING_REFRESH_OPTIONS,
  )
  const horarios = data?.horarios || []
  const nomeSetorParaRoteamento = typeof data?.setor?.nome === 'string'
    ? data.setor.nome.trim()
    : ''

  // Relatório separado: recarrega quando filtro de data muda (server-side filtering)
  const { from: dateFrom, to: dateTo } = getDateCutoffs(dateFilter, customRange)
  const { data: relatorioData, isLoading: relatorioLoading } = useSWR(
    setorId ? ['setor-relatorio', setorId, dateFilter, customRange?.from?.toISOString(), customRange?.to?.toISOString()] : null,
    async () => {
      // Paginado: o teto de 1.000 do PostgREST truncava o relatório em silêncio.
      // O ServiceDesk fez 3.105 tickets em 7 dias — no período de uma semana o
      // painel mostrava um terço dos dados e chamava de total, contaminando KPI,
      // gráfico e NPS. O gestor decide com estes números.
      const tickets = await loadRowsByPages(() => {
        let query = supabase
          .from('tickets')
          .select('*, numero, colaboradores(nome), clientes(nome, telefone, CNPJ, PDV)')
          .eq('setor_id', setorId)
          .order('criado_em', { ascending: false })
          .order('id', { ascending: false })
        if (dateFrom) query = query.gte('criado_em', dateFrom)
        if (dateTo) query = query.lte('criado_em', dateTo)
        return query
      })
      // Buscar avaliações separadamente (join direto não funciona via client RLS)
      const ticketIds = (tickets || []).map((t: any) => t.id)
      let avaliacoesMap = new Map<string, number>()
      let logsMap = new Map<string, any[]>()
      // Tipos de atendimento (classificação) do setor — buscados à parte (mesmo
      // motivo das avaliações: embed direto via client RLS é frágil). Robusto
      // mesmo se a tabela/coluna ainda não existir (retorna erro silencioso → mapa vazio).
      const tiposMap = new Map<string, string>()
      if (ticketIds.length > 0) {
        const [avalRes, logsRes, tiposRes] = await Promise.all([
          supabase.from('avaliacoes').select('ticket_id, nota').in('ticket_id', ticketIds),
          // Logs relevantes pra derivar "origem" do ticket (criacao, transferencias, transbordos)
          supabase
            .from('ticket_logs')
            .select('ticket_id, tipo, descricao, criado_em')
            .in('ticket_id', ticketIds)
            .in('tipo', ['criacao', 'transferencia', 'transferencia_automatica', 'transbordo_limite_atingido', 'pull_manual']),
          supabase.from('tipos_atendimento').select('id, nome').eq('setor_id', setorId),
        ])
        if (avalRes.data) {
          for (const a of avalRes.data) {
            avaliacoesMap.set(a.ticket_id, a.nota)
          }
        }
        if (logsRes.data) {
          for (const l of logsRes.data) {
            const arr = logsMap.get(l.ticket_id) || []
            arr.push(l)
            logsMap.set(l.ticket_id, arr)
          }
        }
        if (tiposRes.data) {
          for (const t of tiposRes.data) {
            tiposMap.set(t.id, t.nome)
          }
        }
      }
      // Merge avaliações + logs + tipo de atendimento nos tickets
      return (tickets || []).map((t: any) => ({
        ...t,
        avaliacoes: avaliacoesMap.has(t.id) ? [{ nota: avaliacoesMap.get(t.id) }] : [],
        _logs: logsMap.get(t.id) || [],
        tipos_atendimento: t.tipo_atendimento_id && tiposMap.has(t.tipo_atendimento_id)
          ? { nome: tiposMap.get(t.tipo_atendimento_id) }
          : null,
      }))
    },
    { revalidateOnFocus: false }
  )

  // Entradas no setor são eventos, não o estado atual do ticket. A fonte
  // estruturada é canônica; logs com rota explícita recompõem somente o
  // histórico anterior a previous_setor_id.
  const {
    data: entradasRoteamentoData,
    isLoading: entradasRoteamentoLoading,
    error: entradasRoteamentoError,
  } = useSWR(
    setorId && nomeSetorParaRoteamento
      ? ['setor-roteamento-origens', setorId, nomeSetorParaRoteamento, dateFrom, dateTo]
      : null,
    async () => {
      const carregarLogsPorDestino = (separador: '→' | '->') => loadRowsByPages<{
        id: string
        ticket_id: string
        tipo: string | null
        descricao: string | null
        criado_em: string | null
      }>(() => {
        let query = supabase
          .from('ticket_logs')
          .select('id, ticket_id, tipo, descricao, criado_em')
          .in('tipo', ['transferencia', 'transferencia_automatica'])
          .ilike('descricao', `%${separador} ${escaparPadraoIlike(nomeSetorParaRoteamento)}%`)
          .order('criado_em', { ascending: false })
          .order('id', { ascending: false })
        if (dateFrom) query = query.gte('criado_em', dateFrom)
        if (dateTo) query = query.lte('criado_em', dateTo)
        return query
      }).catch((error) => {
        console.warn('[Setor] Falha ao carregar logs de roteamento:', error.message)
        return []
      })

      const [movimentos, logsComSeta, logsComSetaAscii] = await Promise.all([
        loadRowsByPages<{
          id: string
          ticket_id: string
          previous_setor_id: string | null
          setor_id: string | null
          created_at: string | null
        }>(() => {
          let query = supabase
            .from('ticket_assignment_logs')
            .select('id, ticket_id, previous_setor_id, setor_id, created_at')
            .eq('setor_id', setorId)
            .eq('action', 'transferred')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
          if (dateFrom) query = query.gte('created_at', dateFrom)
          if (dateTo) query = query.lte('created_at', dateTo)
          return query
        }),
        carregarLogsPorDestino('→'),
        carregarLogsPorDestino('->'),
      ])
      const logs = [...new Map(
        [...logsComSeta, ...logsComSetaAscii].map((log) => [log.id, log]),
      ).values()]
      const ticketIds = [...new Set([
        ...movimentos.map((movimento) => movimento.ticket_id),
        ...logs.map((log) => log.ticket_id),
      ].filter(Boolean))]
      const tickets = ticketIds.length === 0
        ? []
        : await loadRowsByValues<{
          id: string
          canal: string | null
          colaborador_id: string | null
          subsetor_id: string | null
          clientes: unknown
        }>(
          supabase,
          'tickets',
          'id, canal, colaborador_id, subsetor_id, clientes(PDV)',
          'id',
          ticketIds,
        ).catch((error) => {
          console.warn('[Setor] Falha ao enriquecer origens de roteamento:', error.message)
          return []
        })
      const ticketsPorId = new Map(tickets.map((ticket) => [ticket.id, ticket]))

      return {
        entradas: movimentos.map<EntradaRoteamento>((movimento) => {
          const ticket = ticketsPorId.get(movimento.ticket_id)
          return {
            id: movimento.id,
            ticketId: movimento.ticket_id,
            setorOrigemId: movimento.previous_setor_id,
            setorDestinoId: movimento.setor_id,
            ocorridoEm: movimento.created_at,
            pdv: extrairPdvDoCliente(ticket?.clientes),
            canal: ticket?.canal || null,
            colaboradorId: ticket?.colaborador_id || null,
            subsetorId: ticket?.subsetor_id || null,
            fonte: 'assignment_log',
          }
        }),
        logs: logs.map<LogRoteamento>((log) => ({
          id: log.id,
          ticketId: log.ticket_id,
          tipo: log.tipo,
          descricao: log.descricao,
          criadoEm: log.criado_em,
          pdv: extrairPdvDoCliente(ticketsPorId.get(log.ticket_id)?.clientes),
          canal: ticketsPorId.get(log.ticket_id)?.canal || null,
          colaboradorId: ticketsPorId.get(log.ticket_id)?.colaborador_id || null,
          subsetorId: ticketsPorId.get(log.ticket_id)?.subsetor_id || null,
        })),
      }
    },
    { revalidateOnFocus: false },
  )

  // Período anterior equivalente (para o Δ% dos KPIs). Fetch enxuto — só os
  // campos necessários pros indicadores numéricos + joins p/ aplicar os mesmos
  // filtros client-side. NPS fica de fora (precisaria de avaliacoes).
  const prevPeriod = useMemo(() => getPrevPeriodCutoffs(dateFilter, customRange), [dateFilter, customRange])
  const { data: prevRelatorioData } = useSWR(
    setorId && prevPeriod ? ['setor-relatorio-prev', setorId, prevPeriod.from, prevPeriod.to] : null,
    async () => {
      // `subsetor_id` permite aplicar os mesmos filtros no período anterior;
      // sem ele, o delta compararia o recorte escolhido com o setor inteiro.
      return await loadRowsByPages(() => supabase
        .from('tickets')
        .select('colaborador_id, criado_em, status, primeira_resposta_em, encerrado_em, canal, subsetor_id, colaboradores(nome), clientes(nome, telefone, CNPJ)')
        .eq('setor_id', setorId)
        .gte('criado_em', prevPeriod!.from)
        .lte('criado_em', prevPeriod!.to)
        .order('id', { ascending: false }))
    },
    { revalidateOnFocus: false }
  )

  // Avaliacoes por colaborador (para NPS nos cards de atendentes).
  //
  // Precisa ser restrita aos colaboradores DESTE setor e paginada. Antes a
  // query lia `avaliacoes` inteira sem filtro nem limite e o PostgREST cortava
  // silenciosamente em 1.000 linhas: com 4.886 avaliações na base, atendentes
  // cuja avaliação não caía nesse primeiro lote apareciam com nota 0 no card,
  // enquanto o WorkDesk (que filtra por colaborador_id) mostrava a nota certa.
  const { data: avaliacoesColaboradores } = useSWR(
    setorId ? ['setor-avaliacoes-colaboradores', setorId] : null,
    async () => {
      const { data: vinculos } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id')
        .eq('setor_id', setorId)

      const colaboradorIds = [...new Set((vinculos || []).map((v) => v.colaborador_id))]
      if (colaboradorIds.length === 0) return []

      // Pagina até esgotar — não confiar no limite padrão do PostgREST.
      const PAGINA = 1000
      const todas: { colaborador_id: string; nota: number }[] = []
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from('avaliacoes')
          .select('colaborador_id, nota')
          .in('colaborador_id', colaboradorIds)
          .range(inicio, inicio + PAGINA - 1)
        if (error || !data?.length) break
        todas.push(...data)
        if (data.length < PAGINA) break
      }
      return todas
    },
    { revalidateOnFocus: false }
  )

  const mediaNPSPorColaborador = useMemo(() => {
    const map = new Map<string, { total: number; soma: number }>()
    if (avaliacoesColaboradores) {
      for (const av of avaliacoesColaboradores) {
        if (av.colaborador_id && av.nota != null) {
          const entry = map.get(av.colaborador_id) || { total: 0, soma: 0 }
          entry.total++
          entry.soma += av.nota
          map.set(av.colaborador_id, entry)
        }
      }
    }
    return map
  }, [avaliacoesColaboradores])

  // Timer to update time displays every second when on monitoramento section
  useEffect(() => {
    if (activeSection !== 'monitoramento') return
    const interval = setInterval(() => {
      setTick(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [activeSection])

  // Real-time subscription for tickets and colaboradores
  useEffect(() => {
    const ticketsChannel = supabase
      .channel('setor-tickets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `setor_id=eq.${setorId}`,
        },
        () => {
          mutate()
        }
      )
      .subscribe()

    // O status dos atendentes chega pelo polling do SWR a cada 30 segundos.
    // Inscrever a tabela inteira de colaboradores receberia eventos de outros setores.

    return () => {
      supabase.removeChannel(ticketsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId])

  const setor = data?.setor
  const atendimentoStatusThresholds = {
    atencaoMinutos: setor?.atendimento_status_atencao_minutos,
    criticoMinutos: setor?.atendimento_status_critico_minutos,
  }
  const baseAtendentesStats = data?.atendentesStats || { online: 0, pausa: 0, invisivel: 0 }
  const baseTicketsHoje = data?.ticketsHoje || { perdidos: 0, abandonados: 0, finalizados: 0, fechados: 0 }
  const baseTemposHoje = data?.temposHoje || {
    tempoMedioEspera: '00:00:00', tempoMedioEsperaMs: 0,
    tempoMedioResposta: '00:00:00', tempoMedioRespostaMs: 0,
    tempoMedioPrimeiraResposta: '00:00:00', tempoMedioPrimeiraRespostaMs: 0,
    tempoMedioAtendimento: '00:00:00',
  }
  const tickets = data?.tickets || []
  const ticketsMonitoramentoHoje = data?.ticketsMonitoramentoHoje || []
  const atendentes = data?.atendentes || []
  const ticketsRelatorioRaw = relatorioData || []

  // A tag pertence ao vínculo do atendente com este setor. Logo, o relatório
  // só pode contar tickets atribuídos aos atendentes da operação do gestor.
  // Somente master vê todas as operações. Gestor sem tag configurada não
  // recebe um fallback amplo: isso impediria que uma operação sem cadastro
  // voltasse a enxergar Pit Stop e Service Desk por acidente.
  const tagsPermitidasNosTickets = useMemo(() => {
    const eu = (atendentes as any[]).find((a: any) => a.id === colaboradorLogado?.id)
    const minhasTags = eu?.tag_setor_id ? [eu.tag_setor_id as string] : []
    const hasTagsConfigured = tagsSetorLoadedSetorId === setorId
      ? tagsSetorList.length > 0
      : true
    return tagsVisiveisPara(
      minhasTags,
      colaboradorLogado?.is_master === true,
      hasTagsConfigured,
    )
  }, [atendentes, colaboradorLogado?.id, colaboradorLogado?.is_master, setorId, tagsSetorList.length, tagsSetorLoadedSetorId])

  const idsAtendentesPermitidos = useMemo(() => {
    if (tagsPermitidasNosTickets === null) return new Set<string>()
    if (tagsPermitidasNosTickets.length === 0) return new Set<string>()
    return new Set(
      (atendentes as any[])
        .filter((atendente: any) => atendenteNoFiltro(
          atendente.tag_setor_id ? [atendente.tag_setor_id] : [],
          tagsPermitidasNosTickets,
        ))
        .map((atendente: any) => atendente.id),
    )
  }, [atendentes, tagsPermitidasNosTickets])

  const tagSetorFiltroOptions = useMemo(() => tagsParaFiltro(
    tagsSetorList,
    (atendentes as any[]).map((atendente: any) => ({
      colaborador_id: atendente.id,
      setor_id: setorId,
      tag_setor_id: atendente.tag_setor_id ?? null,
    })),
    tagsPermitidasNosTickets,
  ), [atendentes, setorId, tagsPermitidasNosTickets, tagsSetorList])

  const tagSetorFiltroEfetivo = useMemo(
    () => filtroEfetivo(tagsPermitidasNosTickets, tagSetorFilter),
    [tagSetorFilter, tagsPermitidasNosTickets],
  )

  const idsAtendentesNoFiltroTag = useMemo(() => {
    const deveRestringir = tagSetorFilter.length > 0 || tagsPermitidasNosTickets !== null
    if (!deveRestringir) return null
    if (tagSetorFiltroEfetivo.length === 0) return new Set<string>()

    return new Set(
      (atendentes as any[])
        .filter((atendente: any) => atendenteNoFiltro(
          atendente.tag_setor_id ? [atendente.tag_setor_id] : [],
          tagSetorFiltroEfetivo,
        ))
        .map((atendente: any) => atendente.id),
    )
  }, [atendentes, tagSetorFilter.length, tagSetorFiltroEfetivo, tagsPermitidasNosTickets])

  const matchesAtendenteTagFilter = useCallback(
    (atendente: { id: string }) => (
      idsAtendentesNoFiltroTag === null || idsAtendentesNoFiltroTag.has(atendente.id)
    ),
    [idsAtendentesNoFiltroTag],
  )

  const matchesTicketTagFilter = useCallback(
    (ticket: { colaborador_id?: string | null }) =>
      ticketNoFiltroDeTag(ticket.colaborador_id, idsAtendentesNoFiltroTag),
    [idsAtendentesNoFiltroTag],
  )

  const matchesTicketTagNoMonitoramento = useCallback(
    (ticket: { status?: string | null; colaborador_id?: string | null }) =>
      ticketNoFiltroDeTag(
        ticket.colaborador_id,
        idsAtendentesNoFiltroTag,
        ticket.status === 'aberto' && !ticket.colaborador_id,
      ),
    [idsAtendentesNoFiltroTag],
  )

  const matchesTicketRelatorioFilters = useCallback(
    (ticket: { colaborador_id?: string | null; subsetor_id?: string | null }) => {
      if (!matchesTicketTagFilter(ticket)) return false
      if (
        relatorioAtendenteFilter.length > 0
        && !relatorioAtendenteFilter.includes(ticket.colaborador_id || '')
      ) return false
      return matchesSubsetorFilter(relatorioSubsetorFilter, ticket.subsetor_id)
    },
    [matchesTicketTagFilter, relatorioAtendenteFilter, relatorioSubsetorFilter],
  )

  const ticketsRelatorioFiltrados = useMemo(
    () => ticketsRelatorioRaw.filter(matchesTicketRelatorioFilters),
    [matchesTicketRelatorioFilters, ticketsRelatorioRaw],
  )

  const ticketsRelatorioAnteriorFiltrados = useMemo(
    () => prevRelatorioData?.filter(matchesTicketRelatorioFilters),
    [matchesTicketRelatorioFilters, prevRelatorioData],
  )

  // Lookup global de setores — usado pra reescrever descrições antigas de
  // transbordo em tempo de exibição (sem mexer no banco). Permite mostrar
  // "Transbordo: X → Y" mesmo em logs antigos que só tinham texto genérico.
  const setoresParaOrigem = (data?.todosSetores || []) as Array<{ id: string; nome: string; setor_receptor_id: string | null }>
  const setoresLookup = useMemo(() => {
    const m = new Map<string, { nome: string; setor_receptor_id?: string | null }>()
    for (const s of setoresParaOrigem) {
      m.set(s.id, { nome: s.nome, setor_receptor_id: s.setor_receptor_id })
    }
    return m
  }, [setoresParaOrigem])

  // Entradas registradas no setor no período, agrupadas pela origem real.
  const entradasRoteamentoReconstruidas = useMemo(
    () => reconstruirEntradasDeRoteamento(
      entradasRoteamentoData?.entradas || [],
      entradasRoteamentoData?.logs || [],
      setoresParaOrigem,
      setorId,
    ),
    [entradasRoteamentoData, setorId, setoresParaOrigem],
  )
  const entradasRoteamentoClassificadas = useMemo(
    () => classificarEntradasDeRoteamento(
      entradasRoteamentoReconstruidas,
      entradasRoteamentoData?.logs || [],
      setoresParaOrigem,
    ),
    [entradasRoteamentoData?.logs, entradasRoteamentoReconstruidas, setoresParaOrigem],
  )
  const entradasRoteamentoFiltradas = useMemo(
    () => filtrarEntradasDeRoteamentoPorFiltroDeTicket(
      entradasRoteamentoClassificadas,
      matchesTicketRelatorioFilters,
    ),
    [entradasRoteamentoClassificadas, matchesTicketRelatorioFilters],
  )
  const resumoOrigensRoteamento = useMemo(
    () => resumirOrigensDeRoteamento(entradasRoteamentoFiltradas, setoresParaOrigem),
    [entradasRoteamentoFiltradas, setoresParaOrigem],
  )
  const origensRoteamentoCarregando = isLoading || entradasRoteamentoLoading

  // Mapa de origem dos tickets ainda usado pelas tabelas do relatório.
  const origensMap = useMemo(() => {
    const allTickets = [...tickets, ...ticketsRelatorioFiltrados]
    const allLogs = allTickets.flatMap((t: any) => t._logs || [])
    return calcularOrigem(allTickets, allLogs, setoresLookup)
  }, [tickets, ticketsRelatorioFiltrados, setoresLookup])

  // Busca da tabela de atendimentos, mantida no link para ser compartilhável.
  const [searchCliente, setSearchCliente] = useState(() => searchParams.get('cliente') || '')

  const ticketsRelatorio = useMemo(
    () => filterReportTicketsBySearch(ticketsRelatorioFiltrados, searchCliente),
    [ticketsRelatorioFiltrados, searchCliente],
  )

  // Fila sempre mede só o tempo em que o setor podia atender. Reutilizar o
  // mesmo medidor no Monitoramento e nos Relatórios impede números conflitantes.
  const expediente = useMemo(
    () => criarMedidorDeExpediente(horarios as any[]),
    [horarios],
  )

  /**
   * Fila do período — calculada sobre `ticketsRelatorio`, que já respeita
   * período, atendente, canal e subsetor. Sem consulta nova.
   *
   * `monitoringTick` entra porque a espera de quem ainda não foi respondido
   * corre com o relógio.
   */
  const resumoFilaPeriodo = useMemo(
    () => resumirFila(ticketsRelatorio, { agoraMs: monitoringTick, expediente }),
    [ticketsRelatorio, monitoringTick, expediente],
  )

  // KPIs numéricos do período atual e do anterior (para o Δ%)
  const kpiAtual = useMemo(() => computeRelatorioKpis(ticketsRelatorio), [ticketsRelatorio])
  const kpiAnterior = useMemo(() => {
    if (!ticketsRelatorioAnteriorFiltrados) return null
    return computeRelatorioKpis(filterReportTicketsBySearch(ticketsRelatorioAnteriorFiltrados, searchCliente))
  }, [ticketsRelatorioAnteriorFiltrados, searchCliente])

  // Base do nome do arquivo exportado (setor + data atual)
  const exportFilenameBase = useMemo(() => {
    const slug = (setor?.nome || 'setor')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `relatorio-${slug || 'setor'}-${new Date().toISOString().slice(0, 10)}`
  }, [setor?.nome])

  // Recalculate stats from filtered tickets
  const relatorioStats = useMemo(() => {
    const formatMs = (ms: number) => {
      const hours = Math.floor(ms / (1000 * 60 * 60))
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((ms % (1000 * 60)) / 1000)
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return calculateRelatorioStats(ticketsRelatorio, formatMs)
  }, [ticketsRelatorio])

  // Reflete busca, período e filtros na URL (link compartilhável/recarregável).
  // Debounce evita spam de navegações enquanto o usuário digita; router.replace
  // não empilha histórico. Os estados são lidos da URL só no mount, então não há
  // loop de fetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams()
      if (dateFilter !== 'today') next.set('periodo', dateFilter)
      if (dateFilter === 'custom') {
        if (customRange?.from) next.set('de', customRange.from.toISOString())
        if (customRange?.to) next.set('ate', customRange.to.toISOString())
      }
      if (searchCliente.trim()) next.set('cliente', searchCliente.trim())
      if (tagSetorFilter.length > 0) next.set('tags', tagSetorFilter.join(','))
      if (relatorioSubsetorFilter.length > 0) next.set('subsetores', relatorioSubsetorFilter.join(','))
      if (relatorioAtendenteFilter.length > 0) next.set('atendentes', relatorioAtendenteFilter.join(','))
      const qs = next.toString()
      const pathname = window.location.pathname
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customRange, searchCliente, tagSetorFilter, relatorioSubsetorFilter, relatorioAtendenteFilter])

  // Gráficos de Demanda com filtro de período próprio (independente do filtro global)
  const [volumePeriod, setVolumePeriod] = useState('7')
  const [heatmapPeriod, setHeatmapPeriod] = useState('7')
  const [chartTickets, setChartTickets] = useState<{
    criado_em: string
    colaborador_id: string | null
    subsetor_id: string | null
  }[]>([])
  const [chartTicketsLoaded, setChartTicketsLoaded] = useState(false)
  // Busca só a maior janela em uso entre os dois gráficos, e pagina até esgotar.
  //
  // Antes eram 90 dias fixos com `.limit(1000)` e ordem decrescente: o gráfico
  // via apenas os 1.000 tickets mais recentes. Em ServiceDesk Matriz (11.849
  // tickets em 90 dias) isso cobria 3,7 dias — escolher "últimos 30 dias" no
  // mapa de calor mostrava 3,7 dias de dados e zerava os demais dias da semana.
  const chartFetchDays = Math.max(Number(volumePeriod), Number(heatmapPeriod))
  useEffect(() => {
    if (!setorId) return
    let cancelled = false
    setChartTicketsLoaded(false)
    ;(async () => {
      const cutoff = new Date(chartPeriodCutoffMs(chartFetchDays)).toISOString()
      const PAGINA = 1000
      const todos: { criado_em: string; colaborador_id: string | null; subsetor_id: string | null }[] = []
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from('tickets')
          .select('criado_em, colaborador_id, subsetor_id')
          .eq('setor_id', setorId)
          .gte('criado_em', cutoff)
          .order('criado_em', { ascending: false })
          .range(inicio, inicio + PAGINA - 1)
        if (error) {
          console.error('[charts] erro ao buscar tickets:', error)
          break
        }
        if (!data?.length) break
        todos.push(...data)
        if (data.length < PAGINA) break
        if (cancelled) return
      }
      if (!cancelled) {
        setChartTickets(todos)
        setChartTicketsLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [setorId, chartFetchDays])
  const chartTicketsFiltrados = useMemo(() => {
    return chartTickets.filter(matchesTicketRelatorioFilters)
  }, [chartTickets, matchesTicketRelatorioFilters])
  // Fonte dos gráficos: fetch dedicado no recorte dos filtros; até ele concluir,
  // usa os tickets do relatório já filtrados para não misturar resultados.
  const chartSource = chartTicketsLoaded ? chartTicketsFiltrados : ticketsRelatorioFiltrados
  const volumeSerie = useMemo(
    () => buildSerieVolume(filterTicketsByDays(chartSource, Number(volumePeriod))),
    [chartSource, volumePeriod]
  )
  const heatmapData = useMemo(
    () => buildHorarioPicoSerie(filterTicketsByDays(chartSource, Number(heatmapPeriod))),
    [chartSource, heatmapPeriod]
  )
  // Dias ocultos pelo clique na legenda — com sete linhas sobrepostas, poder
  // isolar um dia é o que torna o gráfico legível.
  const [diasOcultos, setDiasOcultos] = useState<string[]>([])
  const alternarDia = (dia: string) => setDiasOcultos((prev) => (
    prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
  ))

  // Roteamento: transferências/transbordos no período (usa origensMap + logs)
  const roteamentoStats = useMemo(() => {
    const total = ticketsRelatorio.length
    let transferidos = 0
    let transbordos = 0
    let hopsSum = 0
    let hopsCount = 0
    for (const ticket of ticketsRelatorio) {
      const origem = origensMap.get(ticket.id)
      if (origem?.tipo === 'transferencia') transferidos++
      if (origem?.tipo === 'transbordo') transbordos++
      const hops = ticket.transbordo_hops || 0
      if (hops > 0) { hopsSum += hops; hopsCount++ }
    }
    return {
      total,
      transferidos,
      transbordos,
      pctTransferidos: total > 0 ? Math.round((transferidos / total) * 100) : 0,
      pctTransbordos: total > 0 ? Math.round((transbordos / total) * 100) : 0,
      hopsMedio: hopsCount > 0 ? (hopsSum / hopsCount).toFixed(1) : '0',
    }
  }, [ticketsRelatorio, origensMap])

  // Formata duração curta (ex.: "2m 30s") para os cards de desempenho
  const fmtDur = (ms: number | null) => {
    if (ms == null) return '—'
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  // Estilo/paletas dos gráficos do relatório
  const chartTooltipStyle = {
    // Tokens do tema são oklch — usar var(--x) direto (hsl(var(--x)) era inválido
    // e deixava o tooltip transparente/ilegível no dark).
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--popover-foreground)',
  }
  // recharts usa a cor da série no texto do item por padrão (ilegível no dark);
  // forçamos a cor de texto do popover, igual ao tooltip do dashboard.
  const chartTooltipItemStyle = { color: 'var(--popover-foreground)' }
  const SLA_COLORS = ['#22C55E', '#84CC16', '#EAB308', '#EF4444', '#94A3B8']
  const PIE_COLORS = ['#F97316', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#EF4444', '#06B6D4', '#64748B']

  // Personalização: quais cards do relatório aparecem (persistido no navegador).
  // Padrão = cards presentes no arranjo do time (ex.: 'Por canal' começa oculto).
  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>(buildDefaultVisibleCards)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RELATORIO_CARDS_STORAGE_KEY)
      if (saved) setVisibleCards((prev) => ({ ...prev, ...JSON.parse(saved) }))
    } catch {}
  }, [])
  const toggleCard = (id: string) => {
    setVisibleCards((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { window.localStorage.setItem(RELATORIO_CARDS_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  // Modo de edição: fora dele os cards ficam fixos; dentro dele dá p/ arrastar/redimensionar/ocultar
  const [editMode, setEditMode] = useState(false)

  // Estado minimizado + layout (posição/tamanho) dos cards — persistido no navegador
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({})
  const [savedLgLayout, setSavedLgLayout] = useState<Layout[] | null>(null)
  const [layoutRestaurado, setLayoutRestaurado] = useState(false)
  useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem(RELATORIO_COLLAPSED_STORAGE_KEY)
      if (savedCollapsed) setCollapsedCards(JSON.parse(savedCollapsed))
      const savedLayout = window.localStorage.getItem(RELATORIO_LAYOUT_STORAGE_KEY)
      if (savedLayout) {
        const parsedLayout = JSON.parse(savedLayout)
        if (Array.isArray(parsedLayout)) {
          const migratedLayout = migrarLayoutRoteamentoV7(parsedLayout as Layout[])
          setSavedLgLayout(migratedLayout)
          if (migratedLayout.some((item, index) => item !== parsedLayout[index])) {
            window.localStorage.setItem(RELATORIO_LAYOUT_STORAGE_KEY, JSON.stringify(migratedLayout))
          }
        }
      }
    } catch {}
    setLayoutRestaurado(true)
  }, [])

  const toggleCollapse = (id: string) => {
    setCollapsedCards((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { window.localStorage.setItem(RELATORIO_COLLAPSED_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Ordem dos relatórios definida pelo usuário (persistida). Base do botão "Reordenar".
  const [relatorioOrder, setRelatorioOrder] = useState<string[]>(() => [...RELATORIO_DEFAULT_ORDER])
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RELATORIO_ORDER_STORAGE_KEY)
      if (!saved) return
      const parsed: string[] = JSON.parse(saved)
      const known = RELATORIO_CARD_OPTIONS.map((o) => o.id)
      // normaliza: mantém ids conhecidos na ordem salva + acrescenta novos no fim
      const ordered = parsed.filter((id) => known.includes(id))
      const missing = known.filter((id) => !ordered.includes(id))
      setRelatorioOrder([...ordered, ...missing])
    } catch {}
  }, [])

  // ids visíveis, já na ordem escolhida pelo usuário
  const relatorioVisibleIds = useMemo(
    () => relatorioOrder.filter((id) => visibleCards[id] ?? true),
    [relatorioOrder, visibleCards]
  )
  // Layout base (lg): layout salvo pelo usuário OU o arranjo padrão do time (baked).
  const baseLgLayout = useMemo(() => {
    const source = savedLgLayout ?? RELATORIO_DEFAULT_LAYOUT
    const byId = new Map(source.map((l) => [l.i, l]))
    // card visível sem posição na fonte: empilha abaixo de tudo (não sobrepõe)
    let bottom = source.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    return relatorioVisibleIds.map((id) => {
      const found = byId.get(id)
      if (found) return found
      const d = RELATORIO_DEFAULT_SIZE[id] || { w: 6, h: 4 }
      const item = { i: id, x: 0, y: bottom, w: d.w, h: d.h }
      bottom += d.h
      return item
    })
  }, [savedLgLayout, relatorioVisibleIds])
  // Aplica o colapso: cards minimizados ficam baixos e sem redimensionar
  const effectiveLgLayout = useMemo(
    () => baseLgLayout.map((l) => (collapsedCards[l.i] ? { ...l, h: RELATORIO_COLLAPSED_H, isResizable: false } : l)),
    [baseLgLayout, collapsedCards]
  )
  const reportResponsiveLayouts = useMemo(() => ({
    lg: effectiveLgLayout,
    md: buildResponsiveReportLayout(effectiveLgLayout, 10),
    sm: buildResponsiveReportLayout(effectiveLgLayout, 6),
    xs: buildResponsiveReportLayout(effectiveLgLayout, 4),
    xxs: buildResponsiveReportLayout(effectiveLgLayout, 2),
  }), [effectiveLgLayout])
  const handleLayoutChange = (current: Layout[]) => {
    // A grade avisa a posição dos cards já na montagem, e o efeito que lê o
    // storage roda depois dela. Persistir nesse instante gravaria o arranjo
    // padrão por cima do que o gestor montou — a tela voltava ao padrão a cada
    // atualização da página.
    if (!layoutRestaurado) return
    // não persiste a altura reduzida de cards minimizados (preserva a expandida)
    const prevById = new Map(baseLgLayout.map((l) => [l.i, l]))
    const merged = current.map((l) => (collapsedCards[l.i] ? { ...l, h: prevById.get(l.i)?.h ?? l.h } : l))
    // Card oculto no Personalizar não é relatado pela grade. Preservar a posição
    // dele evita que volte para o rodapé quando for reexibido.
    const emTela = new Set(merged.map((l) => l.i))
    const ocultos = (savedLgLayout || []).filter((l) => !emTela.has(l.i))
    const proximo = [...merged, ...ocultos]
    setSavedLgLayout(proximo)
    try { window.localStorage.setItem(RELATORIO_LAYOUT_STORAGE_KEY, JSON.stringify(proximo)) } catch {}
  }
  const wprops = (id: string) => ({
    editMode,
    label: RELATORIO_CARD_OPTIONS.find((o) => o.id === id)?.label || id,
    collapsed: !!collapsedCards[id],
    onToggleCollapse: () => toggleCollapse(id),
  })

  // Reordenar: aplica a nova ordem e regenera um layout limpo/fixo (tamanhos
  // canônicos) — o relatório se arruma sozinho, sem precisar arrastar. Persiste.
  const applyRelatorioOrder = (nextOrder: string[]) => {
    setRelatorioOrder(nextOrder)
    try { window.localStorage.setItem(RELATORIO_ORDER_STORAGE_KEY, JSON.stringify(nextOrder)) } catch {}
    const visibleIds = nextOrder.filter((id) => visibleCards[id] ?? true)
    const fresh = buildDefaultLayout(visibleIds)
    setSavedLgLayout(fresh)
    try { window.localStorage.setItem(RELATORIO_LAYOUT_STORAGE_KEY, JSON.stringify(fresh)) } catch {}
  }
  // Move um card p/ cima/baixo trocando de lugar com o vizinho visível mais próximo
  const moveRelatorioCard = (id: string, dir: -1 | 1) => {
    const visibleIds = relatorioOrder.filter((x) => visibleCards[x] ?? true)
    const vIdx = visibleIds.indexOf(id)
    const vTarget = vIdx + dir
    if (vIdx < 0 || vTarget < 0 || vTarget >= visibleIds.length) return
    const neighbor = visibleIds[vTarget]
    const next = [...relatorioOrder]
    const i = next.indexOf(id)
    const j = next.indexOf(neighbor)
    ;[next[i], next[j]] = [next[j], next[i]]
    applyRelatorioOrder(next)
  }
  // Restaurar padrão: volta ao arranjo do time (ordem, visibilidade e posições/tamanhos).
  // Limpa o layout salvo para o baseLgLayout cair no RELATORIO_DEFAULT_LAYOUT.
  const resetRelatorioOrder = () => {
    const defOrder = [...RELATORIO_DEFAULT_ORDER]
    const defVisible = buildDefaultVisibleCards()
    setRelatorioOrder(defOrder)
    setVisibleCards(defVisible)
    setSavedLgLayout(null)
    try {
      window.localStorage.setItem(RELATORIO_ORDER_STORAGE_KEY, JSON.stringify(defOrder))
      window.localStorage.setItem(RELATORIO_CARDS_STORAGE_KEY, JSON.stringify(defVisible))
      window.localStorage.removeItem(RELATORIO_LAYOUT_STORAGE_KEY)
    } catch {}
  }

  const permissoes = data?.permissoes || []
  const pausasData = data?.pausas || []

  // ── Caso #97218: quem pode mandar na disponibilidade dos atendentes daqui ──
  // O critério é `hasSupervisorScope`, o mesmo que a rota aplica no servidor —
  // aqui ele só evita oferecer um controle que o POST recusaria.
  //
  // Esta tela é de UM setor, então o vínculo que importa é o MEU com ele, e a
  // lista de quem está vinculado a este setor já está carregada em `atendentes`
  // (vem de `colaboradores_setores`; `colaboradores.setor_id` é legado e nulo
  // em quase todo mundo).
  const souSupervisorDoSetor = hasSupervisorScope(
    {
      id: colaboradorLogado?.id || '',
      isMaster: colaboradorLogado?.is_master === true,
      canSeeAllTickets: canSeeAllTickets((colaboradorLogado as any)?.permissoes),
      linkedSetorIds: atendentes.some((a: any) => a.id === colaboradorLogado?.id) ? [setorId] : [],
    },
    setorId,
  )

  // Só tipo ATIVO entra: a rota recusa inativo com 422, e oferecer o que ela
  // negaria é o mesmo que oferecer botão quebrado. `pausasData` traz o catálogo
  // inteiro porque a aba de configuração precisa dos inativos para reativá-los.
  // Sem `useMemo` de propósito: `pausasData` é array novo a cada render, então
  // o memo nunca acertaria — e são poucas linhas.
  const tiposDePausaAtivos: { id: string; nome: string }[] = (pausasData as any[])
    .filter((pausa) => pausa.ativo)
    .map((pausa) => ({ id: pausa.id as string, nome: pausa.nome as string }))

  /**
   * O atendente está em pausa DESTE setor?
   *
   * Trocar o tipo e tirar da pausa exigem escopo sobre o setor DA PAUSA, e não
   * sobre um setor qualquer do atendente — o relatório de pausa é agrupado por
   * setor. Quem trabalha em dois setores pode ter pausado no outro; aqui eu só
   * sou supervisor deste, então a pausa do outro fica de fora e os controles
   * dela não aparecem. É a segunda conferência que a rota faz.
   */
  const pausaEhDesteSetor = (atendente: any) =>
    !!atendente?.pausa_atual_id && atendente?.pausaSetorId === setorId

  const atendentesStats = useMemo(() => {
    if (subsetorFilter.length === 0 && idsAtendentesNoFiltroTag === null) return baseAtendentesStats

    const scopedAttendants = atendentes.filter((attendant: any) => (
      matchesAtendenteTagFilter(attendant)
      && matchesAtendenteSubsetorFilter(subsetorFilter, attendant.subsetor_ids)
    ))

    return {
      online: scopedAttendants.filter((attendant: any) => isAtendenteOnline(attendant)).length,
      pausa: scopedAttendants.filter((attendant: any) => (
        attendant.ativo && Boolean(attendant.pausa_atual_id)
      )).length,
      invisivel: scopedAttendants.filter((attendant: any) => (
        attendant.ativo
        && !attendant.pausa_atual_id
        && !isAtendenteOnline(attendant)
      )).length,
    }
  }, [atendentes, baseAtendentesStats, idsAtendentesNoFiltroTag, matchesAtendenteTagFilter, subsetorFilter])

  const ticketsHojePorTag = useMemo(
    () => ticketsMonitoramentoHoje.filter(matchesTicketTagFilter),
    [matchesTicketTagFilter, ticketsMonitoramentoHoje],
  )

  const scopedTicketsHoje = useMemo(
    () => subsetorFilter.length === 0
      ? ticketsHojePorTag
      : ticketsHojePorTag.filter((ticket: any) => (
          matchesSubsetorFilter(subsetorFilter, ticket.subsetor_id)
        )),
    [subsetorFilter, ticketsHojePorTag],
  )

  /**
   * Destino do ticket sem subsetor — no ServiceDesk, o Suporte, que é para onde
   * vai o trabalho não classificado. Mesma regra que a distribuição usa, para o
   * número contar a fila de quem de fato atende esses tickets em vez de abrir
   * uma fila fantasma à parte. Sem padrão seguro no cadastro, devolve `null` e
   * eles seguem contando separados.
   */
  const subsetorPadrao = useMemo(() => escolherSubsetorPadrao(
    subsetores as any[],
    new Set(atendentes.flatMap((a: any) => a.subsetor_ids || [])),
  ), [subsetores, atendentes])

  /** A qual FILA o ticket pertence, para contar episódios. */
  const filaDoTicket = useCallback(
    (ticket: any) => ticket.subsetor_id || subsetorPadrao || SEM_SUBSETOR_ID,
    [subsetorPadrao],
  )

  /**
   * Os dois indicadores recebem a mesma lista de tickets: o percentual divide
   * episódios pelo total dessa população, inclusive quando o ticket sem subsetor
   * cai no subsetor padrão.
   */
  const indicadoresDeFilaHoje = useCallback((aceitaTicket: (t: any) => boolean) => {
    const ticketsDoCard = ticketsHojePorTag.filter(aceitaTicket)
    const opcoesDeFila = { agoraMs: monitoringTick, expediente }

    return calcularIndicadoresDaFila(ticketsDoCard, filaDoTicket, opcoesDeFila)
  }, [ticketsHojePorTag, filaDoTicket, monitoringTick, expediente])

  // O recorte de um subsetor usa `filaDoTicket`, não `subsetor_id` cru: senão
  // "Todos" (onde o ticket sem subsetor entra no Suporte) deixaria de ser a
  // soma dos cards individuais, que é justamente o que o gestor confere.
  const indicadoresCardPrincipal = useMemo(() => indicadoresDeFilaHoje((t: any) => (
    subsetorCardPrincipal === TODOS_SUBSETORES
      ? matchesSubsetorFilter(subsetorFilter, t.subsetor_id)
      : filaDoTicket(t) === subsetorCardPrincipal
  )), [indicadoresDeFilaHoje, filaDoTicket, subsetorCardPrincipal, subsetorFilter])

  const indicadoresCardSecundario = useMemo(
    () => indicadoresDeFilaHoje((t: any) => filaDoTicket(t) === subsetorCardSecundario),
    [indicadoresDeFilaHoje, filaDoTicket, subsetorCardSecundario],
  )

  const ticketsHoje = useMemo(() => {
    if (subsetorFilter.length === 0 && idsAtendentesNoFiltroTag === null) return baseTicketsHoje
    const finalized = scopedTicketsHoje.filter((ticket: any) => ticket.status === 'encerrado').length

    return {
      total: scopedTicketsHoje.length,
      perdidos: 0,
      abandonados: 0,
      finalizados: finalized,
      fechados: finalized,
    }
  }, [baseTicketsHoje, idsAtendentesNoFiltroTag, scopedTicketsHoje, subsetorFilter])

  const temposHoje = useMemo(() => {
    if (subsetorFilter.length === 0 && idsAtendentesNoFiltroTag === null) return baseTemposHoje

    const averageDuration = (
      startField: string,
      endField: string,
      predicate?: (ticket: any) => boolean,
    ) => {
      const durations = scopedTicketsHoje
        .filter((ticket: any) => (
          ticket[startField]
          && ticket[endField]
          && (!predicate || predicate(ticket))
        ))
        .map((ticket: any) => (
          new Date(ticket[endField]).getTime() - new Date(ticket[startField]).getTime()
        ))
        .filter((duration: number) => Number.isFinite(duration) && duration >= 0)

      return durations.length > 0
        ? durations.reduce((total: number, duration: number) => total + duration, 0) / durations.length
        : 0
    }

    const isClosed = (ticket: any) => ticket.status === 'encerrado'
    // Exclui disparo: o cliente é quem inicia a resposta nesse caso, então
    // incluí-lo infla o tempo sem refletir demora do atendente.
    const isClosedNaoDisparo = (ticket: any) => isClosed(ticket) && !ticket.is_disparo

    const tempoMedioEsperaMs = averageDuration('criado_em', 'atribuido_em')
    const tempoMedioRespostaMs = averageDuration('criado_em', 'encerrado_em', isClosedNaoDisparo)
    const tempoMedioPrimeiraRespostaMs = averageDuration('criado_em', 'primeira_resposta_em')

    return {
      tempoMedioEspera: formatMonitoringTime(tempoMedioEsperaMs),
      tempoMedioEsperaMs,
      tempoMedioResposta: formatMonitoringTime(tempoMedioRespostaMs),
      tempoMedioRespostaMs,
      tempoMedioPrimeiraResposta: formatMonitoringTime(tempoMedioPrimeiraRespostaMs),
      tempoMedioPrimeiraRespostaMs,
      tempoMedioAtendimento: formatMonitoringTime(
        averageDuration('atribuido_em', 'encerrado_em', isClosed),
      ),
    }
  }, [baseTemposHoje, idsAtendentesNoFiltroTag, scopedTicketsHoje, subsetorFilter])

  // Update pausas state when data changes
  const pausasLength = pausasData.length
  useEffect(() => {
    setPausas(pausasData)
  }, [pausasLength]) // eslint-disable-line react-hooks/exhaustive-deps

// Track unsaved changes in config form
  useEffect(() => {
    if (setor?.id) {
      setHasUnsavedConfig(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configForm])

  // Initialize forms when data loads - use setor.id as stable dependency
  const setorId_stable = setor?.id
  useEffect(() => {
    if (setor && setorId_stable) {
      setHasUnsavedConfig(false)
      setConfigForm({
        nome: setor.nome || '',
        descricao: setor.descricao || '',
        icon_url: setor.icon_url || 'MessageCircle',
        cor: setor.cor || '#3B82F6',
        mensagem_finalizacao: setor.mensagem_finalizacao || '',
        canal: setor.canal || 'whatsapp',
        template_id: setor.template_id || '',
        phone_number_id: setor.phone_number_id || '',
        template_language: setor.template_language || 'pt_BR',
        whatsapp_token: setor.whatsapp_token || '',
        max_disparos_dia: setor.max_disparos_dia || 0,
        discord_bot_token: setor.discord_bot_token || '',
        discord_guild_id: setor.discord_guild_id || '',
        evolution_base_url: setor.evolution_base_url || '',
        evolution_api_key: setor.evolution_api_key || '',
        // Ativos por padrão: webhook_eventos null (nunca configurado) = ligado.
        webhook_ativo: setor.webhook_eventos == null ? true : setor.webhook_eventos.includes('ticket_encerrado'),
        avaliacao_ativa: setor.webhook_eventos == null ? true : setor.webhook_eventos.includes('avaliacao'),
        tempo_espera_minutos: setor.tempo_espera_minutos ?? 10,
        tag_id: setor.tag_id || '',
        is_receptor: setor.is_receptor || false,
        transmissao_ativa: setor.transmissao_ativa || false,
        setor_receptor_id: setor.setor_receptor_id || '',
        openai_api_key: setor.openai_api_key || '',
        openai_ativo: setor.openai_ativo || false,
        openai_url_personalizada: setor.openai_url_personalizada || false,
        openai_base_url: setor.openai_base_url || '',
        openai_modelo_chat: setor.openai_modelo_chat || '',
        openai_modelo_transcricao: setor.openai_modelo_transcricao || '',
        nexus_ativo: setor.nexus_ativo || false,
        assistente_ia: setor.assistente_ia || false,
        assinatura_ativa: setor.assinatura_ativa || false,
        encerramento_auto_ativo: setor.encerramento_auto_ativo || false,
        encerramento_auto_minutos: setor.encerramento_auto_minutos ?? 30,
        encerramento_morto_ativo: setor.encerramento_morto_ativo || false,
        encerramento_morto_horas: setor.encerramento_morto_horas ?? 24,
        travar_ordenacao_chat: setor.travar_ordenacao_chat || false,
        atendimento_status_atencao_minutos: setor.atendimento_status_atencao_minutos ?? DEFAULT_ATENCAO_MINUTOS,
        atendimento_status_critico_minutos: setor.atendimento_status_critico_minutos ?? DEFAULT_CRITICO_MINUTOS,
        oc_obrigatoria_para_encerrar: setor.oc_obrigatoria_para_encerrar || false,
      })
      fetchTemplates()
      fetchCanais()
      fetchTodosSetores()
      fetchTiposAtendimento()
      fetchClassificacoes()
      fetchSubsetores()
      fetchDistributionConfig()
      fetchSetoresDestino()
      fetchTransbordoBloqueios()
      fetchTagsList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId_stable])

  // Fetch subsetores — protegido contra respostas fora de ordem: se o usuário
  // já navegou para outro setor (ou disparou outro fetch) antes desta resposta
  // chegar, o número de sequência não bate mais e o resultado é descartado, em
  // vez de sobrescrever os dados (já mais atuais) do setor correto.
  const fetchSubsetoresSeqRef = useRef(0)
  const fetchSubsetores = async () => {
    const requestSetorId = setorId
    const seq = ++fetchSubsetoresSeqRef.current
    const { data } = await supabase
      .from('subsetores')
      .select('*')
      .eq('setor_id', requestSetorId)
      .order('nome')
    if (fetchSubsetoresSeqRef.current !== seq) return
    if (data) {
      setSubsetores(data)
      setSubsetoresLoadedSetorId(requestSetorId)
    }
  }

  // Fetch distribution config
  const fetchDistributionConfig = async () => {
    try {
      const { data } = await supabase
        .from('ticket_distribution_config')
        .select('max_tickets_per_agent, auto_assign_enabled')
        .eq('setor_id', setorId)
        .maybeSingle()
      if (data) {
        setDistributionConfig({
          max_tickets_per_agent: data.max_tickets_per_agent ?? 10,
          auto_assign_enabled: data.auto_assign_enabled ?? true,
        })
      }
    } catch {
      // Tabela pode não existir em ambientes mais antigos, ignora silenciosamente
    }
  }

  // Save distribution config
  const saveDistributionConfig = async () => {
    setSavingDistribution(true)
    try {
      const { error } = await supabase
        .from('ticket_distribution_config')
        .upsert({
          setor_id: setorId,
          max_tickets_per_agent: distributionConfig.max_tickets_per_agent,
          auto_assign_enabled: distributionConfig.auto_assign_enabled,
        }, { onConflict: 'setor_id' })
      if (error) throw error
      setHasUnsavedDistribution(false)
      toast.success('Configurações de distribuição salvas!')
    } catch {
      toast.error('Erro ao salvar configurações de distribuição')
    } finally {
      setSavingDistribution(false)
    }
  }

  // Fetch all setores for tipos de atendimento selects
  const fetchTodosSetores = async () => {
    const { data } = await supabase
      .from('setores')
      .select('id, nome, is_receptor')
      .order('nome')
    if (data) setTodosSetores(data)
  }

  // Fetch all tags for tag selector
  const fetchTagsList = async () => {
    const [origem, operacao] = await Promise.all([
      supabase.from('tags').select('id, nome, cor').order('nome').limit(200),
      supabase.from('tags_setor').select('id, nome, cor, ordem').eq('setor_id', setorId).order('ordem').order('nome').limit(200),
    ])
    if (origem.data) setTagsList(origem.data)
    if (!operacao.error) {
      setTagsSetorList(operacao.data || [])
      setTagsSetorLoadedSetorId(setorId)
    }
  }

  // Fetch setores destino de transferência configurados
  const fetchSetoresDestino = async () => {
    try {
      const { data } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id')
        .eq('setor_origem_id', setorId)
      if (data) setSetoresDestinoTransferencia(data.map((r) => r.setor_destino_id))
    } catch {
      // Tabela pode não existir ainda
    }
  }

  // Salvar setores destino de transferência
  const saveSetoresDestino = async () => {
    setSavingSetoresDestino(true)
    try {
      // Remove todos os destinos atuais e reinsere os selecionados
      await supabase
        .from('setor_destinos_transferencia')
        .delete()
        .eq('setor_origem_id', setorId)

      if (setoresDestinoTransferencia.length > 0) {
        await supabase
          .from('setor_destinos_transferencia')
          .insert(
            setoresDestinoTransferencia.map((destId) => ({
              setor_origem_id: setorId,
              setor_destino_id: destId,
            }))
          )
      }
      setHasUnsavedDestino(false)
      toast.success('Destinos de transferência salvos!')
    } catch {
      toast.error('Erro ao salvar destinos de transferência')
    } finally {
      setSavingSetoresDestino(false)
    }
  }

  // Toggle setor destino
  const toggleSetorDestino = (setorDestinoId: string) => {
    setSetoresDestinoTransferencia((prev) =>
      prev.includes(setorDestinoId)
        ? prev.filter((id) => id !== setorDestinoId)
        : [...prev, setorDestinoId]
    )
    setHasUnsavedDestino(true)
  }

  // ===== Janelas de bloqueio de transbordo =====
  const fetchTransbordoBloqueios = async () => {
    try {
      const { data } = await supabase
        .from('transbordo_bloqueios')
        .select('id, hora_inicio, hora_fim, dias')
        .eq('setor_id', setorId)
        .order('hora_inicio', { ascending: true })
      if (data) {
        setTransbordoBloqueios(
          data.map((r: any) => ({
            id: r.id,
            hora_inicio: String(r.hora_inicio).slice(0, 5),
            hora_fim: String(r.hora_fim).slice(0, 5),
            dias: Array.isArray(r.dias) ? r.dias : [0, 1, 2, 3, 4, 5, 6],
          }))
        )
      }
    } catch {
      // Tabela pode não existir ainda
    }
  }

  const addTransbordoBloqueio = () => {
    setTransbordoBloqueios((prev) => [...prev, { hora_inicio: '12:00', hora_fim: '13:00', dias: [0, 1, 2, 3, 4, 5, 6] }])
    setHasUnsavedTransbordoBloqueio(true)
  }
  const updateTransbordoBloqueio = (index: number, patch: Partial<TransbordoBloqueio>) => {
    setTransbordoBloqueios((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
    setHasUnsavedTransbordoBloqueio(true)
  }
  const removeTransbordoBloqueio = (index: number) => {
    setTransbordoBloqueios((prev) => prev.filter((_, i) => i !== index))
    setHasUnsavedTransbordoBloqueio(true)
  }
  const toggleTransbordoDia = (index: number, dia: number) => {
    setTransbordoBloqueios((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        const dias = b.dias.includes(dia) ? b.dias.filter((d) => d !== dia) : [...b.dias, dia].sort((a, c) => a - c)
        return { ...b, dias }
      })
    )
    setHasUnsavedTransbordoBloqueio(true)
  }
  const saveTransbordoBloqueios = async () => {
    setSavingTransbordoBloqueio(true)
    try {
      await supabase.from('transbordo_bloqueios').delete().eq('setor_id', setorId)
      const validos = transbordoBloqueios.filter((b) => b.hora_inicio && b.hora_fim && b.hora_fim > b.hora_inicio && b.dias.length > 0)
      if (validos.length > 0) {
        const { error } = await supabase.from('transbordo_bloqueios').insert(
          validos.map((b) => ({ setor_id: setorId, hora_inicio: b.hora_inicio, hora_fim: b.hora_fim, dias: b.dias }))
        )
        if (error) throw error
      }
      setHasUnsavedTransbordoBloqueio(false)
      await fetchTransbordoBloqueios()
      toast.success('Bloqueios de transbordo salvos!')
    } catch {
      toast.error('Erro ao salvar bloqueios de transbordo')
    } finally {
      setSavingTransbordoBloqueio(false)
    }
  }

  // Salva todas as seções dirty da página Configurações em paralelo.
  // Cada save já cuida do próprio toast e do reset do dirty flag.
  const saveAllDirty = async () => {
    const tasks: Promise<unknown>[] = []
    if (hasUnsavedConfig) tasks.push(saveConfig())
    if (hasUnsavedTipos) tasks.push(saveTiposAtendimento())
    if (hasUnsavedDistribution) tasks.push(saveDistributionConfig())
    if (hasUnsavedDestino) tasks.push(saveSetoresDestino())
    if (hasUnsavedTransbordoBloqueio) tasks.push(saveTransbordoBloqueios())
    await Promise.all(tasks)
  }

  // Cleanup evolution polling on unmount
  useEffect(() => {
    return () => {
      if (evoPollingRef.current) clearInterval(evoPollingRef.current)
      if (reconnectPollingRef.current) clearInterval(reconnectPollingRef.current)
    }
  }, [])

  // Initialize horarios - use horarios.length as stable dependency
  const horariosLength = horarios.length
  useEffect(() => {
    if (horariosLength > 0) {
      setHorariosEdit(horarios)
    } else if (setorId) {
      // Initialize with default horarios for all days if none exist
      const defaultHorarios = DIAS_SEMANA.map((dia) => ({
        id: `temp-${dia.value}`,
        setor_id: setorId,
        dia_semana: dia.value,
        hora_inicio: '08:00',
        hora_fim: '18:00',
        ativo: dia.value >= 1 && dia.value <= 5, // Mon-Fri active by default
      }))
      setHorariosEdit(defaultHorarios)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horariosLength, setorId])



  // Nome do subsetor do ticket é mais específico que o setor (fixo nesta tela) para a coluna "Fila".
  const subsetorNomeById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of subsetores as any[]) m.set(s.id, s.nome)
    return m
  }, [subsetores])

  /**
   * Nome do subsetor para a coluna "Fila".
   *
   * Distingue "ainda não sei" de "não tem". Os tickets chegam no `Promise.all`
   * inicial, mas os subsetores só são buscados depois, num efeito que espera
   * `setor.id` — então existe uma janela em que o mapa está vazio. Sem esta
   * separação, TODO ticket aparecia como "Sem subsetor" nesse intervalo e depois
   * se corrigia sozinho, o que faz o gestor ler o painel errado justamente nos
   * primeiros segundos.
   */
  const nomeDaFila = useCallback((subsetorId: string | null | undefined) => {
    if (subsetoresLoadedSetorId !== setorId) return '—'
    if (!subsetorId) return 'Sem subsetor'
    // Id preenchido que não está no mapa é subsetor de outro setor; dizer
    // "Sem subsetor" aqui esconderia um dado que existe.
    return subsetorNomeById.get(subsetorId) || '—'
  }, [subsetorNomeById, subsetoresLoadedSetorId, setorId])

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || t.status === 'aberto')
      .filter((t: any) => {
        if (
          tagsPermitidasNosTickets !== null
          && (!t.colaborador_id || !idsAtendentesPermitidos.has(t.colaborador_id))
        ) return false
        if (!matchesTicketTagFilter(t)) return false
        if (atendenteFilter.length > 0 && !atendenteFilter.includes(t.colaborador_id)) return false
        if (!matchesSubsetorFilter(subsetorFilter, t.subsetor_id)) return false
        // Mesma regra da tela de monitoramento. Antes só o contato era
        // comparado, e procurar pelo número — que é o que o campo promete —
        // devolvia lista vazia sempre.
        return correspondeAoTermo(alvoDeBuscaDoTicket(t), termoBusca)
      })
      .map((t: any) => {
        const tempos = resolverIniciosTempoTransferencia(
          t,
          t._assignmentEvents || [],
          t._logs || [],
        )
        return {
        id: t.id,
        numero: t.numero ?? null,
        // Tempo na fila = criado_em → atribuido_em (tempo aguardando atendente)
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'  // atribuído mas sem registro de atribuido_em
            : formatDuration(t.criado_em, null), // ainda na fila
        tempoNaFilaMs: t.atribuido_em
          ? getDurationMs(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? null
            : getDurationMs(t.criado_em, null),
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        tempoPrimeiraRespostaMs: t.primeira_resposta_em
          ? getDurationMs(t.criado_em, t.primeira_resposta_em)
          : null,
        // Status do atendimento: tempo total do ticket em aberto, desde a criação —
        // não distingue fase (fila, aguardando 1ª resposta, em atendimento).
        statusMs: getDurationMs(t.criado_em, null),
        tempoAtendimento: t.colaborador_id ? formatDuration(tempos.atendimentoAtualEm, null) : '0min',
        tempoAtendimentoMs: t.colaborador_id
          ? getDurationMs(tempos.atendimentoAtualEm, null)
          : 0,
        tempoNoSetor: formatDuration(tempos.setorAtualEm, null),
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: nomeDaFila(t.subsetor_id),
        atendente: t.colaboradores?.nome || null,
        acompanhamento: t._acompanhamento || null,
        prioridade: t.prioridade,
        status: t.status,
        criado_em: t.criado_em,
        primeira_resposta_em: t.primeira_resposta_em,
        colaborador_id: t.colaborador_id,
        clientes: t.clientes,
        colaboradores: t.colaboradores,
        // Esta tela é de um setor só, então estes campos eram implícitos — mas o
        // diálogo de transferência os exige. Sem `setor_id` ele aborta o
        // carregamento e a lista de destinos aparece vazia, sem erro nenhum.
        setor_id: t.setor_id ?? setorId,
        subsetor_id: t.subsetor_id ?? null,
        setores: { nome: setor?.nome ?? null },
        }
      })
  }, [
    atendenteFilter,
    idsAtendentesPermitidos,
    matchesTicketTagFilter,
    monitoringTick,
    termoBusca,
    setor,
    subsetorFilter,
    nomeDaFila,
    tagsPermitidasNosTickets,
    tickets,
  ])

  const atendenteFiltroOptions = useMemo(() => {
    const order = (x: any) => (x.is_online && !x.pausa_atual_id ? 0 : x.pausa_atual_id ? 1 : 2)
    const temTicket = (id: string) =>
      tickets.some((t: any) => t.colaborador_id === id && (t.status === 'em_atendimento' || t.status === 'aberto'))
    return [...atendentes]
      .filter((atendente: any) => (
        tagsPermitidasNosTickets === null || idsAtendentesPermitidos.has(atendente.id)
      ))
      .filter(matchesAtendenteTagFilter)
      .filter((a: any) => a.ativo)
      .sort((a: any, b: any) =>
        order(a) - order(b)
        || (Number(temTicket(b.id)) - Number(temTicket(a.id)))
        || (a.nome || '').localeCompare(b.nome || ''),
      )
      .map((a: any) => ({
        id: a.id,
        nome: a.nome,
        // Cor do ponto = status: online (verde), pausa (amarelo), offline (cinza).
        cor: a.is_online && !a.pausa_atual_id ? '#22c55e' : a.pausa_atual_id ? '#eab308' : '#9ca3af',
      }))
  }, [atendentes, idsAtendentesPermitidos, matchesAtendenteTagFilter, tagsPermitidasNosTickets, tickets])

  // O relatório também permite selecionar quem não está mais ativo no canal,
  // mas ainda possui atendimentos no período escolhido. O catálogo respeita
  // a tag de operação, para nunca oferecer alguém fora do recorte permitido.
  const relatorioAtendenteFiltroOptions = useMemo(() => {
    const idsExistentes = new Set(atendenteFiltroOptions.map((atendente) => atendente.id))
    const historicos = new Map<string, { id: string; nome: string; cor: null }>()

    for (const ticket of ticketsRelatorioRaw as any[]) {
      if (!ticket.colaborador_id || idsExistentes.has(ticket.colaborador_id)) continue
      if (!matchesTicketTagFilter(ticket)) continue

      const colaborador = Array.isArray(ticket.colaboradores)
        ? ticket.colaboradores[0]
        : ticket.colaboradores
      const nome = colaborador?.nome?.trim()
      if (nome) historicos.set(ticket.colaborador_id, { id: ticket.colaborador_id, nome, cor: null })
    }

    return [
      ...atendenteFiltroOptions,
      ...Array.from(historicos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    ]
  }, [atendenteFiltroOptions, matchesTicketTagFilter, ticketsRelatorioRaw])

  const subsetorFiltroOptions = useMemo(
    () => [
      { id: SEM_SUBSETOR_ID, nome: 'Sem subsetor' },
      ...subsetores.filter((s: any) => s.ativo).map((s: any) => ({ id: s.id, nome: s.nome })),
    ],
    [subsetores],
  )

  /** Subsetores do setor, base das linhas da coluna lateral. */
  const opcoesSubsetorTempoReal = useMemo(() => (
    (subsetores as any[]).map((s) => ({ id: s.id, nome: s.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  ), [subsetores])

  /**
   * Um resumo por subsetor, usando o MESMO cálculo do card do setor.
   *
   * `monitoringTick` entra nas dependências porque a maior espera cresce com o
   * relógio, não com a chegada de dados — sem ele o número congelaria.
   */
  const resumoDoSubsetor = useCallback((subsetorId: string) => (
    calcularTempoReal({
      tickets,
      ticketsDeHoje: ticketsMonitoramentoHoje,
      atendentes,
      aceitaTicket: (t: any) => matchesTicketTagNoMonitoramento(t) && t.subsetor_id === subsetorId,
      aceitaAtendente: (a: any) => (
        matchesAtendenteTagFilter(a)
        && isAtendenteOnline(a)
        && (a.subsetor_ids || []).includes(subsetorId)
      ),
      agoraMs: monitoringTick,
    })
  ), [tickets, ticketsMonitoramentoHoje, atendentes, matchesAtendenteTagFilter, matchesTicketTagNoMonitoramento, monitoringTick])

  const resumoCardSecundario = useMemo(
    () => resumoDoSubsetor(subsetorCardSecundario),
    [subsetorCardSecundario, resumoDoSubsetor],
  )

  // A carga é calculada aqui porque `calculateWorkloadOs` e a tabela de cores
  // vivem nesta página — o componente não precisa conhecer nenhuma das duas.
  /**
   * O card principal tem seletor próprio: em "Todos os subsetores" ele respeita
   * o filtro rápido da tela, como sempre fez; com um subsetor escolhido, ele
   * recorta só nele e ignora o filtro rápido — senão os dois se combinariam e o
   * número não bateria com o que o seletor diz.
   */
  const resumoCardPrincipal = useMemo(() => calcularTempoReal({
    tickets,
    ticketsDeHoje: ticketsMonitoramentoHoje,
    atendentes,
    aceitaTicket: (t: any) => (
      matchesTicketTagNoMonitoramento(t)
      && (subsetorCardPrincipal === TODOS_SUBSETORES
        ? matchesSubsetorFilter(subsetorFilter, t.subsetor_id)
        : t.subsetor_id === subsetorCardPrincipal)
    ),
    aceitaAtendente: (a: any) => (
      matchesAtendenteTagFilter(a)
      && isAtendenteOnline(a)
      && (subsetorCardPrincipal === TODOS_SUBSETORES
        ? matchesAtendenteSubsetorFilter(subsetorFilter, a.subsetor_ids)
        : (a.subsetor_ids || []).includes(subsetorCardPrincipal))
    ),
    agoraMs: monitoringTick,
  }), [tickets, ticketsMonitoramentoHoje, atendentes, matchesAtendenteTagFilter, matchesTicketTagNoMonitoramento, subsetorCardPrincipal, subsetorFilter, monitoringTick])

  const cargaCardPrincipal = useMemo(
    () => calculateWorkloadOs(resumoCardPrincipal.total, resumoCardPrincipal.atendentesOnline),
    [resumoCardPrincipal],
  )

  const cargaCardSecundario = useMemo(
    () => calculateWorkloadOs(resumoCardSecundario.total, resumoCardSecundario.atendentesOnline),
    [resumoCardSecundario],
  )

  // Identidade estável da lista: sem isto, qualquer atualização de `subsetores`
  // recriaria o array e o efeito de carga sobrescreveria a escolha do gestor.
  const chaveOpcoesSubsetor = opcoesSubsetorTempoReal.map((o) => o.id).join(',')

  // v2: o segundo card passou a nascer OCULTO. A v1 o mostrava por padrão, e
  // como a preferência é gravada assim que a tela abre, todo mundo tinha
  // `visivel: true` guardado — mudar só o valor inicial não alcançaria ninguém.
  const lateralStorageKey = colaboradorLogado?.id && setorId
    ? `setor-subsetores-lateral-v2:${setorId}:${colaboradorLogado.id}`
    : null
  const lateralStorageKeyV1 = colaboradorLogado?.id && setorId
    ? `setor-subsetores-lateral-v1:${setorId}:${colaboradorLogado.id}`
    : null

  useEffect(() => {
    if (!lateralStorageKey || opcoesSubsetorTempoReal.length === 0) return
    let salvo: { id?: string; principal?: string; visivel?: boolean; compacto?: boolean; proporcao?: string } | null = null
    try {
      salvo = JSON.parse(window.localStorage.getItem(lateralStorageKey) || 'null')
      if (!salvo && lateralStorageKeyV1) {
        // Migra o que o gestor escolheu — filtro dos cards e proporção da linha
        // — e só reverte a visibilidade, que é o padrão que mudou.
        const antigo = JSON.parse(window.localStorage.getItem(lateralStorageKeyV1) || 'null')
        if (antigo) salvo = { ...antigo, visivel: false }
      }
    } catch { /* preferência corrompida cai no padrão */ }

    // Subsetor apagado não pode deixar o painel preso num id morto.
    const conhecido = (id?: string) => Boolean(id) && opcoesSubsetorTempoReal.some((o) => o.id === id)
    setSubsetorCardPrincipal(
      salvo?.principal === TODOS_SUBSETORES || conhecido(salvo?.principal)
        ? salvo!.principal!
        : TODOS_SUBSETORES,
    )
    setSubsetorCardSecundario(
      conhecido(salvo?.id) ? salvo!.id! : (opcoesSubsetorTempoReal[0]?.id || ''),
    )
    // `=== true` e não `!== false`: o segundo card só aparece quando o gestor
    // pediu por ele no Personalizar. Sem preferência, nasce oculto.
    setPainelSubsetorVisivel(salvo?.visivel === true)
    // Valor desconhecido (preferência antiga ou adulterada) cai no padrão em
    // vez de deixar o botão marcado numa proporção que não existe.
    setProporcaoLinha1(
      salvo?.proporcao && salvo.proporcao in LARGURA_LINHA1
        ? (salvo.proporcao as ProporcaoLinha1)
        : 'equilibrado',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lateralStorageKey, chaveOpcoesSubsetor])

  useEffect(() => {
    if (!lateralStorageKey || !subsetorCardSecundario) return
    try {
      window.localStorage.setItem(lateralStorageKey, JSON.stringify({
        id: subsetorCardSecundario,
        principal: subsetorCardPrincipal,
        visivel: painelSubsetorVisivel,
        proporcao: proporcaoLinha1,
      }))
    } catch { /* navegador sem storage não impede usar a tela */ }
  }, [lateralStorageKey, subsetorCardSecundario, subsetorCardPrincipal, painelSubsetorVisivel, proporcaoLinha1])

  // Grade ajustável do Monitoramento — mesmo mecanismo do relatório.
  const [monitorEditMode, setMonitorEditMode] = useState(false)
  const [monitorLayout, setMonitorLayout] = useState<Layout[] | null>(null)
  const [monitorCollapsed, setMonitorCollapsed] = useState<Record<string, boolean>>({})
  const [monitorLayoutRestaurado, setMonitorLayoutRestaurado] = useState(false)

  useEffect(() => {
    try {
      const layout = window.localStorage.getItem(MONITOR_LAYOUT_STORAGE_KEY)
      if (layout) setMonitorLayout(JSON.parse(layout))
      const colapsados = window.localStorage.getItem(MONITOR_COLLAPSED_STORAGE_KEY)
      if (colapsados) setMonitorCollapsed(JSON.parse(colapsados))
    } catch { /* preferência corrompida cai no padrão */ }
    setMonitorLayoutRestaurado(true)
  }, [])

  /**
   * Ids visíveis na grade. "Por subsetor" some quando o setor não tem subsetor,
   * ou quando o gestor o ocultou no Personalizar — e a grade precisa saber,
   * senão guarda um buraco no lugar dele.
   */
  const monitorVisibleIds = useMemo(() => (
    MONITOR_CARDS
      .filter((card) => card.id !== 'porSubsetor'
        || (opcoesSubsetorTempoReal.length > 0 && painelSubsetorVisivel))
      .map((card) => card.id as string)
  ), [opcoesSubsetorTempoReal.length, painelSubsetorVisivel])

  // Com ou sem o segundo card a primeira linha se reorganiza inteira, então
  // cada estado tem o seu próprio conjunto de larguras.
  const monitorSizeMap = monitorVisibleIds.includes('porSubsetor')
    ? MONITOR_DEFAULT_SIZE
    : MONITOR_DEFAULT_SIZE_SEM_SEGUNDO

  const monitorBaseLayout = useMemo(() => {
    // Sem layout salvo, o arranjo vem do mesmo empacotador do relatório: cada
    // card vai para o vão mais alto disponível, então os que somam 12 colunas
    // ficam LADO A LADO. Posicionar tudo em x=0 empilhava a tela inteira numa
    // coluna só.
    if (!monitorLayout) return buildDefaultLayout(monitorVisibleIds, monitorSizeMap)

    const salvo = new Map(monitorLayout.map((l) => [l.i, l]))
    const faltantes = monitorVisibleIds.filter((id) => !salvo.has(id))
    if (faltantes.length === 0) {
      return monitorVisibleIds.map((id) => salvo.get(id)!)
    }

    // Card novo (ex.: "Por subsetor" reexibido) entra abaixo do que já existe,
    // para não cair em cima de nada que o gestor arrumou.
    let base = monitorLayout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    return monitorVisibleIds.map((id) => {
      const existente = salvo.get(id)
      if (existente) return existente
      const tamanho = monitorSizeMap[id] || { w: 6, h: 4 }
      const item = { i: id, x: 0, y: base, w: tamanho.w, h: tamanho.h }
      base += tamanho.h
      return item
    })
  }, [monitorLayout, monitorVisibleIds, monitorSizeMap])

  const monitorEffectiveLayout = useMemo(
    () => monitorBaseLayout.map((l) => (
      monitorCollapsed[l.i] ? { ...l, h: MONITOR_COLLAPSED_H, isResizable: false } : l
    )),
    [monitorBaseLayout, monitorCollapsed],
  )

  /**
   * Só o `lg` (12 colunas) tem arranjo próprio — sem isto, react-grid-layout
   * reaproveita os mesmos x/w em telas menores (não redimensiona), e com
   * `tempoReal`+`porSubsetor` a 6 cada, w:6 já fecha a coluna toda de um
   * grid de 6 colunas: os dois cards empilham em vez de continuar lado a
   * lado. Escala a largura pela razão de colunas e reempacota com o mesmo
   * "vão mais alto" do arranjo padrão do relatório.
   */
  const monitorResponsiveLayouts = useMemo(() => {
    const ids = monitorEffectiveLayout.map((l) => l.i)
    const temDoisCardsDeTempoReal = ids.includes('porSubsetor')
    const escalar = (columns: number, largaTodaId: string[] = []) => Object.fromEntries(
      monitorEffectiveLayout.map((l) => [
        l.i,
        {
          w: largaTodaId.includes(l.i) ? columns : Math.max(1, Math.min(columns, Math.round(l.w * columns / 12))),
          h: l.h,
        },
      ]),
    )
    return {
      lg: monitorEffectiveLayout,
      md: buildDefaultLayout(ids, escalar(10), 10),
      // Abaixo de ~1000px, o card pareado de tempo real fica estreito demais
      // pro conteúdo interno (que já reflui pra coluna única via @container
      // do próprio card) caber na altura fixa da grade sem rolagem interna
      // — em vez de espremer os dois lado a lado, cada um vira linha cheia.
      sm: buildDefaultLayout(
        ids,
        escalar(6, temDoisCardsDeTempoReal ? ['tempoReal', 'porSubsetor'] : []),
        6,
      ),
      xs: buildDefaultLayout(ids, Object.fromEntries(monitorEffectiveLayout.map((l) => [l.i, { w: 4, h: l.h }])), 4),
      xxs: buildDefaultLayout(ids, Object.fromEntries(monitorEffectiveLayout.map((l) => [l.i, { w: 2, h: l.h }])), 2),
    }
  }, [monitorEffectiveLayout])

  const handleMonitorLayoutChange = (atual: Layout[]) => {
    // Mesma armadilha do relatório: a grade avisa a posição na montagem, antes
    // de o storage ter sido lido. Gravar aí apagava o arranjo do gestor.
    if (!monitorLayoutRestaurado) return
    // Não persiste a altura reduzida de um card minimizado: ao expandir, ele
    // voltaria com uma linha de altura.
    const anterior = new Map(monitorBaseLayout.map((l) => [l.i, l]))
    const merged = atual.map((l) => (
      monitorCollapsed[l.i] ? { ...l, h: anterior.get(l.i)?.h ?? l.h } : l
    ))
    // A grade só relata o que está em tela, e a visibilidade do segundo card
    // chega depois do layout — ela depende dos subsetores virem do servidor.
    // Sem guardar a posição do card oculto, esse instante o apagava do arranjo
    // e ele reaparecia no rodapé assim que a preferência era lida.
    const emTela = new Set(merged.map((l) => l.i))
    const ocultos = (monitorLayout || []).filter((l) => !emTela.has(l.i))
    const proximo = [...merged, ...ocultos]
    setMonitorLayout(proximo)
    try { window.localStorage.setItem(MONITOR_LAYOUT_STORAGE_KEY, JSON.stringify(proximo)) } catch {}
  }

  const toggleMonitorCollapse = (id: string) => {
    setMonitorCollapsed((anterior) => {
      const proximo = { ...anterior, [id]: !anterior[id] }
      try { window.localStorage.setItem(MONITOR_COLLAPSED_STORAGE_KEY, JSON.stringify(proximo)) } catch {}
      return proximo
    })
  }

  const monitorWidget = (id: string) => ({
    editMode: monitorEditMode,
    label: MONITOR_CARDS.find((c) => c.id === id)?.label || id,
    collapsed: !!monitorCollapsed[id],
    onToggleCollapse: () => toggleMonitorCollapse(id),
  })

  /**
   * Restaurar padrão do Monitoramento — mesmo alcance do relatório.
   *
   * Antes só limpava posições e recolhidos, e a tela continuava fora do padrão:
   * a proporção da linha 1 e o segundo card ficam noutra chave
   * (`lateralStorageKey`), então sobreviviam ao reset e o gestor não tinha como
   * voltar ao arranjo do time sem mexer card a card.
   *
   * O subsetor escolhido em cada card NÃO volta: é filtro de dado, não arranjo
   * — perder o recorte de Suporte/Prime num clique de "restaurar layout" seria
   * apagar justamente a configuração que o gestor montou.
   */
  /**
   * Aplica a proporção da linha 1 escrevendo no layout, e não numa classe.
   *
   * Só mexe em largura e x dos dois cards de tempo real; altura e o resto da
   * grade ficam como estavam. Sem layout salvo, parte do arranjo padrão — senão
   * o primeiro clique não teria em cima do que trabalhar.
   */
  const aplicarProporcaoLinha1 = (chave: ProporcaoLinha1) => {
    setProporcaoLinha1(chave)
    const [larguraPrincipal, larguraSecundario] = LARGURA_LINHA1[chave]
    setMonitorLayout((atual) => {
      const base = atual || buildDefaultLayout(monitorVisibleIds, monitorSizeMap)
      const proximo = base.map((item) => {
        if (item.i === 'tempoReal') return { ...item, x: 0, w: larguraPrincipal }
        if (item.i === 'porSubsetor') return { ...item, x: larguraPrincipal, w: larguraSecundario }
        return item
      })
      try {
        window.localStorage.setItem(MONITOR_LAYOUT_STORAGE_KEY, JSON.stringify(proximo))
      } catch { /* navegador sem storage não impede ajustar em tela */ }
      return proximo
    })
  }

  /**
   * Volta ao arranjo padrão do estado ATUAL do segundo card.
   *
   * Antes isto forçava o segundo card a aparecer, então quem o tinha desligado
   * clicava em "restaurar" e recebia o arranjo de duas colunas de volta —
   * ligando um card que não havia pedido. Mostrar ou não o segundo card é
   * escolha do gestor, não parte do arranjo: o botão devolve as posições e
   * tamanhos, e o padrão que se aplica é o do estado em que a tela está.
   */
  const resetarLayoutMonitor = () => {
    setMonitorLayout(null)
    setMonitorCollapsed({})
    setProporcaoLinha1('equilibrado')
    try {
      window.localStorage.removeItem(MONITOR_LAYOUT_STORAGE_KEY)
      window.localStorage.removeItem(MONITOR_COLLAPSED_STORAGE_KEY)
    } catch { /* navegador sem storage não impede o reset em tela */ }
    // A chave lateral guarda proporção e visibilidade junto do subsetor; o
    // efeito que a persiste reescreve com os valores novos.
  }

  const realtimeStats = useMemo(() => {
    const isSelectedSubsetor = (item: { subsetor_id?: string | null }) => (
      matchesSubsetorFilter(subsetorFilter, item.subsetor_id)
    )
    const activeTickets = tickets.filter((ticket: any) => (
      matchesTicketTagNoMonitoramento(ticket) && isSelectedSubsetor(ticket)
    ))
    const queuedTickets = activeTickets.filter((ticket: any) => ticket.status === 'aberto')
    const assignedTickets = activeTickets.filter((ticket: any) => ticket.status === 'em_atendimento')
    const finalizedToday = ticketsMonitoramentoHoje.filter(
      (ticket: any) => (
        ticket.status === 'encerrado'
        && matchesTicketTagNoMonitoramento(ticket)
        && isSelectedSubsetor(ticket)
      ),
    )
    const onlineAttendants = atendentes.filter((attendant: any) => (
      matchesAtendenteTagFilter(attendant)
      &&
      isAtendenteOnline(attendant)
      && matchesAtendenteSubsetorFilter(subsetorFilter, attendant.subsetor_ids)
    ))
    const now = monitoringTick
    const maxQueueMs = queuedTickets.reduce((max: number, ticket: any) => (
      ticket.criado_em ? Math.max(max, now - new Date(ticket.criado_em).getTime()) : max
    ), 0)
    const maxResponseMs = assignedTickets.reduce((max: number, ticket: any) => (
      ticket.criado_em && !ticket.primeira_resposta_em
        ? Math.max(max, now - new Date(ticket.criado_em).getTime())
        : max
    ), 0)

    return {
      total: activeTickets.length,
      naFila: queuedTickets.length,
      emAtendimento: assignedTickets.length,
      finalizadosHoje: finalizedToday.length,
      tempoMaximoFila: formatMonitoringTime(maxQueueMs),
      tempoMaximoResposta: formatMonitoringTime(maxResponseMs),
      onlineAttendants: onlineAttendants.length,
      workload: calculateWorkloadOs(activeTickets.length, onlineAttendants.length),
    }
  }, [atendentes, matchesAtendenteTagFilter, matchesTicketTagNoMonitoramento, monitoringTick, subsetorFilter, tickets, ticketsMonitoramentoHoje])

  const workloadTone = WORKLOAD_OS_TONES[realtimeStats.workload.level]

  const ticketsAguardando = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'aberto' && !t.colaborador_id)
      .filter((t: any) => {
        if (!matchesTicketTagNoMonitoramento(t)) return false
        if (!matchesSubsetorFilter(subsetorFilter, t.subsetor_id)) return false
        return correspondeAoTermo(alvoDeBuscaDoTicket(t), termoBusca)
      })
      .map((t: any) => ({
        id: t.id,
        numero: t.numero ?? null,
        tempoNaFila: formatDuration(t.criado_em, null),
        tempoNaFilaMs: getDurationMs(t.criado_em, null),
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: nomeDaFila(t.subsetor_id),
        prioridade: t.prioridade,
        status: t.status,
        criado_em: t.criado_em,
        colaborador_id: t.colaborador_id,
        clientes: t.clientes,
        colaboradores: t.colaboradores,
        // Mesmos campos exigidos pelo diálogo de transferência — ver acima.
        setor_id: t.setor_id ?? setorId,
        subsetor_id: t.subsetor_id ?? null,
        setores: { nome: setor?.nome ?? null },
      }))
  }, [matchesTicketTagNoMonitoramento, tickets, termoBusca, setor, subsetorFilter, monitoringTick, nomeDaFila])

  // Sem filtro de subsetor, mostram o total do setor (matchesSubsetorFilter
  // com seleção vazia aceita qualquer subsetor_id) — com filtro, só contam os
  // tickets dos subsetores selecionados, mesmo que o atendente esteja ligado
  // a outros também.
  const activeTicketCountByAttendant = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ticket of tickets) {
      if (
        ticket.status !== 'em_atendimento'
        || !ticket.colaborador_id
        || !matchesTicketTagFilter(ticket)
        || !matchesSubsetorFilter(subsetorFilter, ticket.subsetor_id)
      ) continue
      counts.set(ticket.colaborador_id, (counts.get(ticket.colaborador_id) || 0) + 1)
    }
    return counts
  }, [matchesTicketTagFilter, subsetorFilter, tickets])

  const finalizedTodayCountByAttendant = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ticket of ticketsMonitoramentoHoje) {
      if (
        ticket.status !== 'encerrado'
        || !ticket.colaborador_id
        || !matchesTicketTagFilter(ticket)
        || !matchesSubsetorFilter(subsetorFilter, ticket.subsetor_id)
      ) continue
      counts.set(ticket.colaborador_id, (counts.get(ticket.colaborador_id) || 0) + 1)
    }
    return counts
  }, [matchesTicketTagFilter, subsetorFilter, ticketsMonitoramentoHoje])

  const sortedTicketsEmAndamento = useMemo(() => {
    const getValue = (ticket: any): SortValue => {
      switch (activeTicketsSort.key) {
        case 'status': return ticket.statusMs
        case 'queueTime': return ticket.tempoNaFilaMs
        case 'serviceTime': return ticket.tempoAtendimentoMs
        case 'ticket': return toSortableNumber(ticket.numero)
        case 'contact': return ticket.contato
        case 'origin': return getOriginSortValue(origensMap.get(ticket.id))
        case 'queue': return ticket.fila
        case 'attendant': return ticket.atendente
      }
    }

    return [...ticketsEmAndamento].sort((first, second) => {
      const comparison = compareSortValues(
        getValue(first),
        getValue(second),
        activeTicketsSort.direction,
      )
      return comparison || compareSortValues(first.numero, second.numero, 'asc')
    })
  }, [activeTicketsSort, origensMap, ticketsEmAndamento])

  const sortedTicketsAguardando = useMemo(() => {
    const getValue = (ticket: any): SortValue => {
      switch (waitingTicketsSort.key) {
        case 'status': return ticket.tempoNaFilaMs
        case 'queueTime': return ticket.tempoNaFilaMs
        case 'ticket': return toSortableNumber(ticket.numero)
        case 'contact': return ticket.contato
        case 'origin': return getOriginSortValue(origensMap.get(ticket.id))
        case 'queue': return ticket.fila
        case 'priority': return PRIORITY_ORDER[ticket.prioridade] ?? null
      }
    }

    return [...ticketsAguardando].sort((first, second) => {
      const comparison = compareSortValues(
        getValue(first),
        getValue(second),
        waitingTicketsSort.direction,
      )
      return comparison || compareSortValues(first.numero, second.numero, 'asc')
    })
  }, [origensMap, ticketsAguardando, waitingTicketsSort])

  // ─── Trava por tag de setor ───
  // O gestor da operação só enxerga quem tem a mesma tag DELE neste canal. A tag
  // vem do próprio vínculo, então não há cadastro paralelo. `null` = sem recorte:
  // é o master, que precisa auditar, e quem não tem tag nenhuma.
  const atendentesVisiveis = useMemo(() => {
    return (atendentes as any[]).filter(matchesAtendenteTagFilter)
  }, [atendentes, matchesAtendenteTagFilter])

  const idsVisiveis = useMemo(
    () => new Set((atendentesVisiveis as any[]).map((a: any) => a.id)),
    [atendentesVisiveis],
  )

  // Só quem administra muda a tag — atendente não reconfigura o próprio recorte.
  const podeEditarTagSetor = colaboradorLogado?.is_master === true
    || (colaboradorLogado as any)?.permissoes?.can_view_dashboard === true

  const sortedMonitoringAttendants = useMemo(() => {
    const getStatus = (attendant: any) => {
      if (attendant.pausa_atual_id) return 'Ausente'
      return attendant.is_online ? 'Online' : 'Offline'
    }
    const getValue = (attendant: any): SortValue => {
      switch (attendantsSort.key) {
        case 'attendant': return attendant.nome
        case 'status': return getStatus(attendant)
        case 'activeTickets': return activeTicketCountByAttendant.get(attendant.id) || 0
        case 'finalizedToday': return finalizedTodayCountByAttendant.get(attendant.id) || 0
      }
    }

    const filtered = atendentesVisiveis.filter((attendant: any) => (
      matchesAtendenteSubsetorFilter(subsetorFilter, attendant.subsetor_ids)
      && (atendenteFilter.length === 0 || atendenteFilter.includes(attendant.id))
    ))

    return [...filtered].sort((first, second) => {
      const comparison = compareSortValues(
        getValue(first),
        getValue(second),
        attendantsSort.direction,
      )
      return comparison || compareSortValues(first.nome, second.nome, 'asc')
    })
  }, [
    activeTicketCountByAttendant,
    atendentesVisiveis,
    atendenteFilter,
    attendantsSort,
    finalizedTodayCountByAttendant,
    subsetorFilter,
  ])

  const monitoringItemCount = activeTab === 'em-andamento'
    ? sortedTicketsEmAndamento.length
    : activeTab === 'aguardando'
      ? sortedTicketsAguardando.length
      : sortedMonitoringAttendants.length
  const monitoringTotalPages = Math.max(1, Math.ceil(monitoringItemCount / monitoringPageSize))
  const safeMonitoringPage = Math.min(monitoringPage, monitoringTotalPages)
  const monitoringPageStart = (safeMonitoringPage - 1) * monitoringPageSize
  const monitoringRangeStart = monitoringItemCount === 0 ? 0 : monitoringPageStart + 1
  const monitoringRangeEnd = Math.min(monitoringPageStart + monitoringPageSize, monitoringItemCount)

  const paginatedTicketsEmAndamento = useMemo(
    () => sortedTicketsEmAndamento.slice(monitoringPageStart, monitoringPageStart + monitoringPageSize),
    [monitoringPageSize, monitoringPageStart, sortedTicketsEmAndamento],
  )
  const paginatedTicketsAguardando = useMemo(
    () => sortedTicketsAguardando.slice(monitoringPageStart, monitoringPageStart + monitoringPageSize),
    [monitoringPageSize, monitoringPageStart, sortedTicketsAguardando],
  )
  const paginatedMonitoringAttendants = useMemo(
    () => sortedMonitoringAttendants.slice(monitoringPageStart, monitoringPageStart + monitoringPageSize),
    [monitoringPageSize, monitoringPageStart, sortedMonitoringAttendants],
  )

  const filteredManagementAttendants = useMemo(() => {
    const term = searchAtendente.trim().toLocaleLowerCase('pt-BR')
    return atendentesVisiveis.filter((atendente: any) => {
      // O filtro de subsetor precisa entrar AQUI, e não na hora de renderizar:
      // a lista é paginada, e o contador ("x-y de N") e o estado vazio leem
      // este memo. Filtrar só no map deixaria os três em desacordo.
      if (!matchesAtendenteSubsetorFilter(subsetorFilter, atendente.subsetor_ids)) return false
      if (!term) return true
      return (
        atendente.nome?.toLocaleLowerCase('pt-BR').includes(term)
        || atendente.email?.toLocaleLowerCase('pt-BR').includes(term)
      )
    })
  }, [atendentesVisiveis, searchAtendente, subsetorFilter])
  const attendantsTotalPages = Math.max(1, Math.ceil(filteredManagementAttendants.length / attendantsPageSize))
  const safeAttendantsPage = Math.min(attendantsPage, attendantsTotalPages)
  const attendantsPageStart = (safeAttendantsPage - 1) * attendantsPageSize
  const attendantsRangeStart = filteredManagementAttendants.length === 0 ? 0 : attendantsPageStart + 1
  const attendantsRangeEnd = Math.min(
    attendantsPageStart + attendantsPageSize,
    filteredManagementAttendants.length,
  )
  const paginatedManagementAttendants = useMemo(
    () => filteredManagementAttendants.slice(attendantsPageStart, attendantsPageStart + attendantsPageSize),
    [attendantsPageSize, attendantsPageStart, filteredManagementAttendants],
  )

const handleLogout = async () => {
  await unsubscribeCurrentBrowser().catch(() => {})
  await supabase.auth.signOut()
  window.location.href = '/login'
  }

// Send notification to setor or specific colaborador
  const sendNotification = async () => {
      if (!notificationForm.titulo.trim()) {
      toast.error('Digite um título para a notificação')
      return
    }
    if (!notificationForm.mensagem.trim()) {
      toast.error('Digite o conteúdo da notificação')
      return
    }

    setSendingNotification(true)
    try {
      if (!setor?.id) {
        toast.error('Setor não encontrado')
        return
      }

      const response = await fetch('/api/notificacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setorId: setor.id,
          destinatarioId:
            notificationForm.destinatario === 'todos'
              ? null
              : notificationForm.destinatario,
          titulo: notificationForm.titulo,
          mensagem: notificationForm.mensagem,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error || 'Erro ao enviar notificação')
      }

      toast.success(
        notificationForm.destinatario === 'todos'
          ? 'Notificação enviada para todos do setor'
          : 'Notificação enviada',
      )

      setNotificationForm({ destinatario: 'todos', titulo: '', mensagem: '' })
      await fetchAvisosEnviados()
    } catch (error) {
      console.error('Error sending notification:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar notificação')
    } finally {
      setSendingNotification(false)
    }
  }

  const fetchAvisosEnviados = async () => {
    if (!setor?.id) return
    setLoadingAvisos(true)
    try {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('id, titulo, mensagem, criado_em, destinatario_id, colaboradores!notificacoes_destinatario_id_fkey(nome)')
        .eq('setor_id', setor.id)
        .order('criado_em', { ascending: false })
        .limit(50)
      if (!error && data) setAvisosEnviados(data)
    } catch (e) {
      console.error('Erro ao carregar avisos:', e)
    } finally {
      setLoadingAvisos(false)
    }
  }

  const deleteAviso = async (avisoId: string) => {
    setDeletingAvisoId(avisoId)
    try {
      const { error } = await supabase
        .from('notificacoes')
        .delete()
        .eq('id', avisoId)
      if (error) throw error
      setAvisosEnviados((prev) => prev.filter((a) => a.id !== avisoId))
      toast.success('Aviso excluído')
    } catch (e: any) {
      toast.error('Erro ao excluir aviso')
    } finally {
      setDeletingAvisoId(null)
    }
  }

  // Save configuration
const saveConfig = async () => {
    const statusThresholds = {
      atencaoMinutos: configForm.atendimento_status_atencao_minutos,
      criticoMinutos: configForm.atendimento_status_critico_minutos,
    }

    if (!isValidAtendimentoStatusThresholds(statusThresholds)) {
      toast.error('O limite crítico deve ser maior que o limite de atenção, entre 1 e 1.440 minutos.')
      statusAtencaoInputRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const basePayload: Record<string, unknown> = {
        nome: configForm.nome,
        descricao: configForm.descricao,
        icon_url: configForm.icon_url,
        cor: configForm.cor,
        mensagem_finalizacao: configForm.mensagem_finalizacao,
        canal: configForm.canal || 'whatsapp',
        template_id: configForm.template_id || null,
        phone_number_id: configForm.phone_number_id || null,
        template_language: configForm.template_language || 'pt_BR',
        whatsapp_token: configForm.whatsapp_token || null,
        max_disparos_dia: configForm.max_disparos_dia || 0,
        discord_bot_token: configForm.discord_bot_token || null,
        discord_guild_id: configForm.discord_guild_id || null,
        evolution_base_url: configForm.evolution_base_url || null,
        evolution_api_key: configForm.evolution_api_key || null,
        // webhook_eventos guarda 2 flags: 'ticket_encerrado' (envio do webhook) e
        // 'avaliacao'. [] = ambos off; null (nunca salvo) = ambos on por padrão.
        webhook_eventos: [
          ...(configForm.webhook_ativo ? ['ticket_encerrado'] : []),
          ...(configForm.avaliacao_ativa ? ['avaliacao'] : []),
        ],
        tempo_espera_minutos: configForm.tempo_espera_minutos || 10,
        tag_id: configForm.tag_id || null,
        is_receptor: configForm.is_receptor,
        transmissao_ativa: configForm.transmissao_ativa,
        setor_receptor_id: configForm.setor_receptor_id || null,
        openai_api_key: configForm.openai_api_key || null,
        openai_ativo: configForm.openai_ativo || false,
        openai_url_personalizada: configForm.openai_url_personalizada || false,
        openai_base_url: configForm.openai_url_personalizada ? (configForm.openai_base_url || null) : null,
        nexus_ativo: configForm.nexus_ativo || false,
        assistente_ia: configForm.assistente_ia || false,
        assinatura_ativa: configForm.assinatura_ativa || false,
        encerramento_auto_ativo: configForm.encerramento_auto_ativo,
        encerramento_auto_minutos: configForm.encerramento_auto_minutos,
      }
      const statusPayload = {
        atendimento_status_atencao_minutos: configForm.atendimento_status_atencao_minutos,
        atendimento_status_critico_minutos: configForm.atendimento_status_critico_minutos,
      }

      // Estas colunas podem ainda não existir no ambiente (rollout de banco
      // pendente). Em vez de tentar todas as combinações — que dobravam a cada
      // coluna nova —, a gente lê no erro 42703/PGRST204 QUAL coluna faltou,
      // tira só ela e tenta de novo. O resto das configurações do setor salva
      // normalmente.
      const mortoPayload = {
        encerramento_morto_ativo: configForm.encerramento_morto_ativo,
        encerramento_morto_horas: configForm.encerramento_morto_horas,
      }
      const modelosIaPayload = {
        // Vazio salva NULL: é o que faz o resolvedor cair no padrão do provedor.
        openai_modelo_chat: configForm.openai_modelo_chat.trim() || null,
        openai_modelo_transcricao: configForm.openai_modelo_transcricao.trim() || null,
      }

      const camposOpcionais: Record<string, unknown> = {
        travar_ordenacao_chat: configForm.travar_ordenacao_chat,
        ...statusPayload,
        oc_obrigatoria_para_encerrar: configForm.oc_obrigatoria_para_encerrar,
        ...mortoPayload,
        ...modelosIaPayload,
      }

      const ausentes = new Set<string>()
      let updateError: any = null

      // +1 para a última tentativa, já sem nenhum campo opcional.
      for (let tentativa = 0; tentativa <= Object.keys(camposOpcionais).length; tentativa++) {
        const payload: Record<string, unknown> = { ...basePayload }
        for (const [campo, valor] of Object.entries(camposOpcionais)) {
          if (!ausentes.has(campo)) payload[campo] = valor
        }

        const { error } = await supabase.from('setores').update(payload).eq('id', setorId)
        if (!error) {
          updateError = null
          break
        }

        updateError = error
        if (error.code !== '42703' && error.code !== 'PGRST204') break

        const faltando = Object.keys(camposOpcionais).find(
          (campo) => !ausentes.has(campo) && error.message?.includes(campo),
        )
        if (faltando) {
          ausentes.add(faltando)
          continue
        }

        // O erro não disse qual coluna é. Cai no comportamento antigo de pior
        // caso: derruba todos os opcionais de uma vez e tenta a última vez.
        if (ausentes.size === Object.keys(camposOpcionais).length) break
        Object.keys(camposOpcionais).forEach((campo) => ausentes.add(campo))
      }

      if (updateError) throw updateError

      const travarOrdenacaoIndisponivel = ausentes.has('travar_ordenacao_chat')
      const limitesStatusIndisponiveis = Object.keys(statusPayload).some((campo) => ausentes.has(campo))

      setTravarOrdenacaoChatIndisponivel(travarOrdenacaoIndisponivel)
      setLimitesStatusAtendimentoIndisponiveis(limitesStatusIndisponiveis)
      setOcObrigatoriaIndisponivel(ausentes.has('oc_obrigatoria_para_encerrar'))
      setEncerramentoMortoIndisponivel(Object.keys(mortoPayload).some((campo) => ausentes.has(campo)))
      setModelosIaIndisponiveis(Object.keys(modelosIaPayload).some((campo) => ausentes.has(campo)))
      toast.success(
        ausentes.size > 0
          ? 'Configurações salvas! (Algumas opções aguardam a migration neste ambiente.)'
          : 'Configurações salvas com sucesso!',
      )
      setHasUnsavedConfig(false)
      mutate()
    } catch (error) {
      toast.error('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  // Fetch templates
  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('templates_mensagem')
      .select('*')
      .eq('setor_id', setorId)
      .order('atalho')
    if (data) setTemplates(data)
  }

  // Save template
  const saveTemplate = async () => {
    if (!templateForm.atalho || !templateForm.mensagem) {
      toast.error('Preencha todos os campos')
      return
    }

    // Remove leading slash if present for storage
    const atalhoClean = templateForm.atalho.replace(/^\//, '')

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('templates_mensagem')
          .update({
            atalho: atalhoClean,
            mensagem: templateForm.mensagem,
          })
          .eq('id', editingTemplate.id)
        if (error) throw error
        toast.success('Template atualizado!')
      } else {
        const { error } = await supabase.from('templates_mensagem').insert({
          setor_id: setorId,
          atalho: atalhoClean,
          mensagem: templateForm.mensagem,
        })
        if (error) throw error
        toast.success('Template criado!')
      }

      setIsTemplateModalOpen(false)
      setEditingTemplate(null)
      setTemplateForm({ atalho: '', mensagem: '' })
      fetchTemplates()
    } catch (error) {
      toast.error('Erro ao salvar template')
    }
  }

  // Delete template
  const deleteTemplate = async (id: string) => {
    const template = templates.find(t => t.id === id)
    showConfirmDialog(
      'Excluir Template',
      `Tem certeza que deseja excluir o template "/${template?.atalho}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await supabase.from('templates_mensagem').delete().eq('id', id)
          toast.success('Template excluído!')
          fetchTemplates()
        } catch (error) {
          toast.error('Erro ao excluir template')
        }
      }
    )
  }

  // Insert variable into template message
  const insertVariable = (variable: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      mensagem: prev.mensagem + variable,
    }))
  }

  // ============ CANAIS CRUD ============
  const fetchCanais = async () => {
    const { data } = await supabase
      .from('setor_canais')
      .select('*')
      .eq('setor_id', setorId)
      .order('criado_em', { ascending: true })
    if (data) {
      setCanais(data as Canal[])
      // Fetch Evolution statuses for evolution_api channels
      const evoCanais = (data as Canal[]).filter(c => c.tipo === 'evolution_api' && c.instancia)
      if (evoCanais.length > 0) {
        const statusMap: Record<string, string> = {}
        await Promise.all(
          evoCanais.map(async (canal) => {
            try {
              const res = await fetch(`/api/evolution/instance/${canal.instancia}/status`)
              const d = await res.json()
              statusMap[canal.id] = d.instance?.state || 'unknown'
            } catch {
              statusMap[canal.id] = 'unknown'
            }
          })
        )
        setCanalStatuses(prev => ({ ...prev, ...statusMap }))
      }
    }
  }

  // Verifica manualmente o status de uma instância Evolution
  async function checkInstanciaStatus(canal: Canal) {
    console.log('[checkInstanciaStatus] canal:', canal.id, 'instancia:', canal.instancia)
    if (!canal.instancia) {
      toast.error(`Canal "${canal.nome}" sem instância configurada. Reconecte o canal via QR Code.`)
      return
    }
    setCheckingCanalId(canal.id)
    // Remove status anterior para forçar o badge "Verificando..." durante o check
    setCanalStatuses(prev => {
      const next = { ...prev }
      delete next[canal.id]
      return next
    })
    try {
      const res = await fetch(`/api/evolution/instance/${canal.instancia}/status`)
      const d = await res.json()
      const state: string = d.instance?.state || 'unknown'
      console.log('[Evolution Check]', canal.instancia, '→', state, d)
      setCanalStatuses(prev => ({ ...prev, [canal.id]: state }))
      if (state === 'open') {
        toast.success('Instância conectada!')
      } else if (state === 'not_found') {
        toast.error('Instância não encontrada no servidor')
      } else if (state === 'unknown') {
        toast.error('Não foi possível obter resposta da instância')
      } else {
        toast.warning(`Instância ${state === 'close' ? 'desconectada' : state}`)
      }
    } catch (err) {
      console.error('[Evolution Check] erro:', err)
      setCanalStatuses(prev => ({ ...prev, [canal.id]: 'unknown' }))
      toast.error('Erro de rede ao verificar instância')
    } finally {
      setCheckingCanalId(null)
    }
  }

  // ============ TIPOS DE ATENDIMENTO DO SETOR ============
  const fetchTiposAtendimento = async () => {
    const { data } = await supabase
      .from('setor_tipos_atendimento')
      .select('tipo, setor_destino_id')
      .eq('setor_id', setorId)
    
    const tipos: Record<string, string | null> = {
      suporte: null,
      ouvidoria: null,
      financeiro: null,
      implantacao: null,
      comercial: null,
    }
    
    if (data) {
      for (const item of data) {
        tipos[item.tipo] = item.setor_destino_id
      }
    }
    setTiposAtendimentoSetor(tipos)
  }

  const saveTiposAtendimento = async () => {
    setSavingTiposAtendimento(true)
    try {
      // Delete existing tipos for this setor
      await supabase
        .from('setor_tipos_atendimento')
        .delete()
        .eq('setor_id', setorId)

      // Insert new tipos
      const inserts = Object.entries(tiposAtendimentoSetor)
        .filter(([, setorDestinoId]) => setorDestinoId !== null)
        .map(([tipo, setor_destino_id]) => ({
          setor_id: setorId,
          tipo,
          setor_destino_id,
        }))

      if (inserts.length > 0) {
        const { error } = await supabase
          .from('setor_tipos_atendimento')
          .insert(inserts)
        
        if (error) throw error
      }

      setHasUnsavedTipos(false)
      toast.success('Roteamento de atendimento salvo com sucesso!')
    } catch (error) {
      console.error('Error saving tipos atendimento:', error)
      toast.error('Erro ao salvar roteamento de atendimento')
    } finally {
      setSavingTiposAtendimento(false)
    }
  }

  // ============ CLASSIFICAÇÃO DE ATENDIMENTO (tipos do setor) ============
  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('tipos_atendimento')
      .select('id, nome, cor, ativo, ordem')
      .eq('setor_id', setorId)
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true })
    setClassificacoes(data || [])
  }

  const addClassificacao = async () => {
    const nome = novaClassificacao.trim()
    if (!nome) {
      toast.error('Digite um nome para a classificação')
      return
    }
    setSavingClassificacao(true)
    try {
      const proximaOrdem = classificacoes.length
        ? Math.max(...classificacoes.map((c) => c.ordem)) + 1
        : 0
      const { error } = await supabase
        .from('tipos_atendimento')
        .insert({ setor_id: setorId, nome, ordem: proximaOrdem })
      if (error) throw error
      setNovaClassificacao('')
      await fetchClassificacoes()
      toast.success('Classificação adicionada!')
    } catch (error) {
      console.error('Error adding classificacao:', error)
      toast.error('Erro ao adicionar classificação')
    } finally {
      setSavingClassificacao(false)
    }
  }

  const saveEditingClassificacao = async () => {
    const nome = editingClassificacaoNome.trim()
    if (!nome || !editingClassificacaoId) return
    try {
      const { error } = await supabase
        .from('tipos_atendimento')
        .update({ nome })
        .eq('id', editingClassificacaoId)
      if (error) throw error
      setEditingClassificacaoId(null)
      setEditingClassificacaoNome('')
      await fetchClassificacoes()
      toast.success('Classificação atualizada!')
    } catch (error) {
      console.error('Error updating classificacao:', error)
      toast.error('Erro ao atualizar classificação')
    }
  }

  const toggleClassificacaoAtivo = async (tipo: TipoAtendimento) => {
    try {
      const { error } = await supabase
        .from('tipos_atendimento')
        .update({ ativo: !tipo.ativo })
        .eq('id', tipo.id)
      if (error) throw error
      await fetchClassificacoes()
    } catch (error) {
      console.error('Error toggling classificacao:', error)
      toast.error('Erro ao alterar status da classificação')
    }
  }

  const deleteClassificacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tipos_atendimento')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchClassificacoes()
      toast.success('Classificação removida!')
    } catch (error) {
      console.error('Error deleting classificacao:', error)
      toast.error('Erro ao remover classificação')
    }
  }

  // ============ SUBSETORES CRUD ============
  const openCreateSubsetor = () => {
    setEditingSubsetor(null)
    setSubsetorForm({ nome: '', descricao: '' })
    setIsSubsetorModalOpen(true)
  }

  const openEditSubsetor = (subsetor: Subsetor) => {
    setEditingSubsetor(subsetor)
    setSubsetorForm({ nome: subsetor.nome, descricao: subsetor.descricao || '' })
    setIsSubsetorModalOpen(true)
  }

  const saveSubsetor = async () => {
    if (!subsetorForm.nome.trim()) {
      toast.error('Digite um nome para o subsetor')
      return
    }

    setSavingSubsetor(true)
    try {
      if (editingSubsetor) {
        const { error } = await supabase
          .from('subsetores')
          .update({ nome: subsetorForm.nome.trim(), descricao: subsetorForm.descricao.trim() || null })
          .eq('id', editingSubsetor.id)
        if (error) throw error
        toast.success('Subsetor atualizado!')
      } else {
        const { error } = await supabase
          .from('subsetores')
          .insert({ setor_id: setorId, nome: subsetorForm.nome.trim(), descricao: subsetorForm.descricao.trim() || null })
        if (error) throw error
        toast.success('Subsetor criado!')
      }
      setIsSubsetorModalOpen(false)
      fetchSubsetores()
    } catch (error: any) {
      console.error('Error saving subsetor:', error)
      toast.error(error.message || 'Erro ao salvar subsetor')
    } finally {
      setSavingSubsetor(false)
    }
  }

  const deleteSubsetor = async (id: string) => {
    const subsetor = subsetores.find(s => s.id === id)
    showConfirmDialog(
      'Excluir Subsetor',
      `Tem certeza que deseja excluir o subsetor "${subsetor?.nome}"? Esta ação não pode ser desfeita.`,
      async () => {
        setDeletingSubsetorId(id)
        try {
          const { error } = await supabase.from('subsetores').delete().eq('id', id)
          if (error) throw error
          toast.success('Subsetor excluído!')
          fetchSubsetores()
        } catch (error: any) {
          toast.error(error.message || 'Erro ao excluir subsetor')
        } finally {
          setDeletingSubsetorId(null)
        }
      }
    )
  }

  const toggleSubsetorAtivo = async (subsetor: Subsetor) => {
    try {
      const { error } = await supabase
        .from('subsetores')
        .update({ ativo: !subsetor.ativo })
        .eq('id', subsetor.id)
      if (error) throw error
      fetchSubsetores()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar subsetor')
    }
  }

  const saveCanal = async () => {
    if (!canalForm.nome.trim()) {
      toast.error('Digite um nome para o canal')
      return
    }

    setSavingCanal(true)
    try {
      const payload: any = {
        setor_id: setorId,
        nome: canalForm.nome.trim(),
        tipo: canalForm.tipo,
        ativo: canalForm.ativo,
        instancia: canalForm.instancia.trim() || null,
        max_disparos_dia: canalForm.max_disparos_dia || 0,
      }

      if (canalForm.tipo === 'whatsapp') {
        payload.phone_number_id = canalForm.phone_number_id || null
        payload.whatsapp_token = canalForm.whatsapp_token || null
        payload.template_id = canalForm.template_id || null
        payload.template_language = canalForm.template_language || 'pt_BR'
      } else if (canalForm.tipo === 'evolution_api') {
        payload.evolution_base_url = canalForm.evolution_base_url || null
        payload.evolution_api_key = canalForm.evolution_api_key || null
      } else if (canalForm.tipo === 'discord') {
        payload.discord_bot_token = canalForm.discord_bot_token || null
        payload.discord_guild_id = canalForm.discord_guild_id || null
      }

      if (editingCanal) {
        const { error } = await supabase
          .from('setor_canais')
          .update(payload)
          .eq('id', editingCanal.id)
        if (error) throw error
        toast.success('Canal atualizado!')
      } else {
        const { error } = await supabase.from('setor_canais').insert(payload)
        if (error) throw error
        toast.success('Canal criado!')
      }

      setIsCanalModalOpen(false)
      setEditingCanal(null)
      resetCanalForm()
      fetchCanais()
    } catch (error: any) {
      console.error('Error saving canal:', error)
      toast.error('Erro ao salvar canal')
    } finally {
      setSavingCanal(false)
    }
  }

  const deleteCanal = async (id: string) => {
    const canal = canais.find(c => c.id === id)
    showConfirmDialog(
      'Excluir Canal',
      `Tem certeza que deseja excluir o canal "${canal?.nome}"? Todos os dados associados serão perdidos.`,
      async () => {
        setDeletingCanalId(id)
        try {
          // Se for canal Evolution com instância, remover a instância da Evolution API
          if (canal?.tipo === 'evolution_api' && canal.instancia) {
            try {
              await fetch(`/api/evolution/instance/${canal.instancia}`, { method: 'DELETE' })
            } catch (evoError) {
              console.error('Erro ao remover instância da Evolution:', evoError)
              // Continua com a exclusão do canal mesmo se falhar na Evolution
            }
          }

          const { error } = await supabase.from('setor_canais').delete().eq('id', id)
          if (error) throw error
          toast.success('Canal excluído!')
          fetchCanais()
        } catch (error) {
          toast.error('Erro ao excluir canal')
        } finally {
          setDeletingCanalId(null)
        }
      }
    )
  }

  const toggleCanalAtivo = async (canal: Canal) => {
    try {
      const { error } = await supabase
        .from('setor_canais')
        .update({ ativo: !canal.ativo })
        .eq('id', canal.id)
      if (error) throw error
      toast.success(canal.ativo ? 'Canal desativado' : 'Canal ativado')
      fetchCanais()
    } catch (error) {
      toast.error('Erro ao alterar status do canal')
    }
  }

  const resetCanalForm = () => {
    setCanalForm({
      nome: '',
      tipo: 'whatsapp',
      phone_number_id: '',
      whatsapp_token: '',
      template_id: '',
      template_language: 'pt_BR',
      evolution_base_url: '',
      evolution_api_key: '',
      discord_bot_token: '',
      discord_guild_id: '',
      instancia: '',
      max_disparos_dia: 0,
      ativo: true,
    })
    setCanalNomeError(false)
  }

  // ---- Evolution API helpers ----

  const EVOLUTION_BASE_URL_CONST = 'https://whatsapi.mensageria.softcomtecnologia.com'
  const EVOLUTION_GLOBAL_KEY_CONST =
    'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

  function generateInstanceName(nome: string): string {
    const slug = nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24)
    const suffix = Math.random().toString(36).slice(2, 6)
    return `${slug}-${suffix}`
  }

  async function handleEvoNext() {
    if (!canalForm.nome.trim()) {
      setCanalNomeError(true)
      toast.error('Digite um nome para o canal')
      return
    }
    setCanalNomeError(false)
    setEvoCreatingInstance(true)
    try {
      const instanceName = generateInstanceName(canalForm.nome)
      setEvoInstanceName(instanceName)

      // Create instance
      const createRes = await fetch('/api/evolution/instance/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName }),
      })
      const createData = await createRes.json()

      let qrBase64: string | null = null

      // Try QR code from create response
      if (createData.qrcode?.base64) {
        qrBase64 = createData.qrcode.base64
      } else {
        // Fetch via connect endpoint
        const connectRes = await fetch(`/api/evolution/instance/${instanceName}/connect`)
        const connectData = await connectRes.json()
        qrBase64 = connectData.base64 || connectData.qrcode?.base64 || null
      }

      setEvoQrCode(qrBase64)
      setEvoStep('qrcode')
      startEvoPolling(instanceName)
    } catch (err) {
      console.error('[handleEvoNext]', err)
      toast.error('Erro ao criar instância Evolution')
    } finally {
      setEvoCreatingInstance(false)
    }
  }

  function startEvoPolling(instanceName: string) {
    if (evoPollingRef.current) clearInterval(evoPollingRef.current)
    evoPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/evolution/instance/${instanceName}/status`)
        const data = await res.json()
        const state: string = data.instance?.state || 'unknown'
        if (state === 'open') {
          clearInterval(evoPollingRef.current!)
          evoPollingRef.current = null
          await saveEvoCanal(instanceName)
        }
      } catch (err) {
        console.error('[EvoPolling]', err)
      }
    }, 3000)
  }

  async function saveEvoCanal(instanceName: string) {
    try {
      const payload = {
        setor_id: setorId,
        nome: canalForm.nome.trim(),
        tipo: 'evolution_api',
        ativo: true,
        instancia: instanceName,
        evolution_base_url: EVOLUTION_BASE_URL_CONST,
        evolution_api_key: EVOLUTION_GLOBAL_KEY_CONST,
        max_disparos_dia: 0,
      }
      const { error } = await supabase.from('setor_canais').insert(payload)
      if (error) throw error
      setEvoStep('connected')
      toast.success('Canal EvolutionAPI conectado com sucesso!')
      setTimeout(() => {
        closeCanalModal()
        fetchCanais()
      }, 2000)
    } catch (err) {
      console.error('[saveEvoCanal]', err)
      toast.error('Erro ao salvar canal')
    }
  }

  function closeCanalModal() {
    if (evoPollingRef.current) {
      clearInterval(evoPollingRef.current)
      evoPollingRef.current = null
    }
    setIsCanalModalOpen(false)
    setEditingCanal(null)
    resetCanalForm()
    setEvoStep('form')
    setEvoQrCode(null)
    setEvoInstanceName(null)
  }

  async function handleEvoCancelQr() {
    if (evoInstanceName) {
      try {
        await fetch(`/api/evolution/instance/${evoInstanceName}`, { method: 'DELETE' })
      } catch {}
    }
    if (evoPollingRef.current) {
      clearInterval(evoPollingRef.current)
      evoPollingRef.current = null
    }
    setEvoStep('form')
    setEvoQrCode(null)
    setEvoInstanceName(null)
  }

  async function openReconnect(canal: Canal) {
    setReconnectDialog({ open: true, canal, qr: null, loading: true, connected: false })
    try {
      const res = await fetch(`/api/evolution/instance/${canal.instancia}/connect`)
      const data = await res.json()
      const qr = data.base64 || data.qrcode?.base64 || null
      setReconnectDialog(prev => ({ ...prev, qr, loading: false }))

      if (reconnectPollingRef.current) clearInterval(reconnectPollingRef.current)
      reconnectPollingRef.current = setInterval(async () => {
        try {
          const sRes = await fetch(`/api/evolution/instance/${canal.instancia}/status`)
          const sData = await sRes.json()
          const state: string = sData.instance?.state || 'unknown'
          if (state === 'open') {
            clearInterval(reconnectPollingRef.current!)
            reconnectPollingRef.current = null
            setCanalStatuses(prev => ({ ...prev, [canal.id]: 'open' }))
            setReconnectDialog(prev => ({ ...prev, connected: true }))
            toast.success('WhatsApp conectado!')
            setTimeout(() => {
              setReconnectDialog({ open: false, canal: null, qr: null, loading: false, connected: false })
            }, 2000)
          }
        } catch {}
      }, 3000)
    } catch (err) {
      console.error('[openReconnect]', err)
      setReconnectDialog(prev => ({ ...prev, loading: false }))
      toast.error('Erro ao obter QR Code')
    }
  }

  function closeReconnectDialog() {
    if (reconnectPollingRef.current) {
      clearInterval(reconnectPollingRef.current)
      reconnectPollingRef.current = null
    }
    setReconnectDialog({ open: false, canal: null, qr: null, loading: false, connected: false })
  }

  const openEditCanal = (canal: Canal) => {
    setEditingCanal(canal)
    setCanalForm({
      nome: canal.nome || '',
      tipo: canal.tipo,
      phone_number_id: canal.phone_number_id || '',
      whatsapp_token: canal.whatsapp_token || '',
      template_id: canal.template_id || '',
      template_language: canal.template_language || 'pt_BR',
      evolution_base_url: canal.evolution_base_url || '',
      evolution_api_key: canal.evolution_api_key || '',
      discord_bot_token: canal.discord_bot_token || '',
      discord_guild_id: canal.discord_guild_id || '',
      instancia: canal.instancia || '',
      max_disparos_dia: canal.max_disparos_dia || 0,
      ativo: canal.ativo,
    })
    setIsCanalModalOpen(true)
  }

  // ============ PAUSAS CRUD ============
  const fetchPausas = async () => {
    const { data } = await supabase
      .from('pausas')
      .select('*')
      .eq('setor_id', setorId)
      .order('nome')
    if (data) setPausas(data)
  }

  const savePausa = async () => {
    if (!pausaForm.nome.trim()) {
      toast.error('Digite um nome para a pausa')
      return
    }

    let tempoMaximoMinutos: number | null = null
    if (pausaForm.tempo_maximo_minutos.trim()) {
      const parsed = Number(pausaForm.tempo_maximo_minutos)
      if (!Number.isInteger(parsed) || parsed < 0) {
        toast.error('Tempo máximo deve ser um número inteiro de minutos, 0 ou maior')
        return
      }
      tempoMaximoMinutos = parsed
    }

    try {
      if (editingPausa) {
        const { error } = await supabase
          .from('pausas')
          .update({
            nome: pausaForm.nome.trim(),
            descricao: pausaForm.descricao.trim() || null,
            tempo_maximo_minutos: tempoMaximoMinutos,
          })
          .eq('id', editingPausa.id)
        if (error) throw error
        toast.success('Pausa atualizada!')
      } else {
        const { error } = await supabase.from('pausas').insert({
          setor_id: setorId,
          nome: pausaForm.nome.trim(),
          descricao: pausaForm.descricao.trim() || null,
          tempo_maximo_minutos: tempoMaximoMinutos,
        })
        if (error) throw error
        toast.success('Pausa criada!')
      }

      setIsPausaModalOpen(false)
      setEditingPausa(null)
      setPausaForm({ nome: '', descricao: '', tempo_maximo_minutos: '' })
      fetchPausas()
      mutate()
    } catch (error) {
      toast.error('Erro ao salvar pausa')
    }
  }

  const deletePausa = async (id: string) => {
    const pausa = pausas.find(p => p.id === id)
    showConfirmDialog(
      'Excluir Pausa',
      `Tem certeza que deseja excluir a pausa "${pausa?.nome}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          // First check if any colaborador is using this pause
          const { data: colaboradoresUsando } = await supabase
            .from('colaboradores')
            .select('id')
            .eq('pausa_atual_id', id)

          if (colaboradoresUsando && colaboradoresUsando.length > 0) {
            toast.error('Esta pausa está sendo usada por colaboradores. Remova-os primeiro.')
            return
          }

          await supabase.from('pausas').delete().eq('id', id)
          toast.success('Pausa excluída com sucesso!')
          setDeletingPausaId(null)
          fetchPausas()
          mutate()
        } catch (error) {
          toast.error('Erro ao excluir pausa')
        }
      }
    )
  }

  const togglePausaAtivo = async (pausa: Pausa) => {
    try {
      await supabase.from('pausas').update({ ativo: !pausa.ativo }).eq('id', pausa.id)
      toast.success(pausa.ativo ? 'Pausa desativada' : 'Pausa ativada')
      fetchPausas()
      mutate()
    } catch (error) {
      toast.error('Erro ao alterar status')
    }
  }

  const openEditPausa = (pausa: Pausa) => {
    setEditingPausa(pausa)
    setPausaForm({
      nome: pausa.nome,
      descricao: pausa.descricao || '',
      tempo_maximo_minutos: pausa.tempo_maximo_minutos != null ? String(pausa.tempo_maximo_minutos) : '',
    })
    setIsPausaModalOpen(true)
  }

  const openNewPausa = () => {
    setEditingPausa(null)
    setPausaForm({ nome: '', descricao: '', tempo_maximo_minutos: '' })
    setIsPausaModalOpen(true)
  }

  // Save horarios
  const saveHorarios = async () => {
    setSaving(true)
    try {
      for (const horario of horariosEdit) {
        // Use upsert to create or update
        const horarioData = {
          setor_id: setorId,
          dia_semana: horario.dia_semana,
          hora_inicio: horario.hora_inicio,
          hora_fim: horario.hora_fim,
          ativo: horario.ativo,
        }

        // If it's a temp id, insert new; otherwise update existing
        if (horario.id.startsWith('temp-')) {
          await supabase.from('horarios_atendimento').insert(horarioData)
        } else {
          await supabase
            .from('horarios_atendimento')
            .update({
              hora_inicio: horario.hora_inicio,
              hora_fim: horario.hora_fim,
              ativo: horario.ativo,
            })
            .eq('id', horario.id)
        }
      }
      toast.success('Horários salvos com sucesso!')
      mutate()
    } catch (error) {
      toast.error('Erro ao salvar horários')
    } finally {
      setSaving(false)
    }
  }

  const updateHorario = (diaIndex: number, field: string, value: any) => {
    setHorariosEdit((prev) =>
      prev.map((h) =>
        h.dia_semana === diaIndex ? { ...h, [field]: value } : h
      )
    )
  }

  // Atendentes functions
  const openCreateAtendenteModal = () => {
    setEditingAtendente(null)
    setAtendenteSubsetorIds([])
    setAtendenteForm({ nome: '', email: '', senha: '', confirmarSenha: '', novaSenha: '', confirmarNovaSenha: '', suporte_id: '' })
    setShowPassword(false)
    setShowConfirmPassword(false)
    setExistingColaborador(null)
    setIsAtendenteModalOpen(true)
  }

  // Check if email exists in colaboradores
  const checkEmailExists = async (email: string) => {
    if (!email || !email.includes('@')) {
      setExistingColaborador(null)
      return
    }

    setCheckingEmail(true)
    try {
      // First check if colaborador exists
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id, nome, email')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle()

      if (colaborador) {
        // Fetch setores separately
        const { data: setoresData } = await supabase
          .from('colaboradores_setores')
          .select('setor_id, setores(nome)')
          .eq('colaborador_id', colaborador.id)

        // Check if already in this setor
        const alreadyInSetor = setoresData?.some((s: any) => s.setor_id === setorId)

        const colaboradorWithSetores = {
          ...colaborador,
          setores: setoresData || [],
        }

        if (alreadyInSetor) {
          setExistingColaborador({ ...colaboradorWithSetores, alreadyInThisSetor: true })
        } else {
          setExistingColaborador(colaboradorWithSetores)
          // Auto-fill name
          setAtendenteForm((prev) => ({ ...prev, nome: colaborador.nome }))
        }
      } else {
        setExistingColaborador(null)
      }
    } catch (error) {
      console.error('Error checking email:', error)
    } finally {
      setCheckingEmail(false)
    }
  }

  const openEditAtendenteModal = async (atendente: any) => {
    setEditingAtendente(atendente)
    // Buscar subsetores atuais do atendente neste setor
    const { data: colabSubsetores } = await supabase
      .from('colaboradores_subsetores')
      .select('subsetor_id')
      .eq('colaborador_id', atendente.id)
      .eq('setor_id', setorId)
    
    setAtendenteSubsetorIds((colabSubsetores || []).map((cs: any) => cs.subsetor_id))
    setAtendenteForm({
      nome: atendente.nome || '',
      email: atendente.email || '',
      senha: '',
      confirmarSenha: '',
      novaSenha: '',
      confirmarNovaSenha: '',
      suporte_id: atendente.suporte_id || '',
    })
    setShowNewPassword(false)
    setShowConfirmNewPassword(false)
    setExistingColaborador(null)
    setIsAtendenteModalOpen(true)
  }

  const saveAtendente = async () => {
      if (!atendenteForm.nome || !atendenteForm.email) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    // Helper para salvar subsetores na nova tabela (delete + insert)
    const saveSubsetores = async (colaboradorId: string) => {
      // Remove atribuições anteriores
      await supabase
        .from('colaboradores_subsetores')
        .delete()
        .eq('colaborador_id', colaboradorId)
        .eq('setor_id', setorId)

      // Insere as novas
      if (atendenteSubsetorIds.length > 0) {
        const inserts = atendenteSubsetorIds.map((subsetorId) => ({
          colaborador_id: colaboradorId,
          setor_id: setorId,
          subsetor_id: subsetorId,
        }))
        const { error } = await supabase.from('colaboradores_subsetores').insert(inserts)
        if (error) throw error
      }
    }

    // If adding existing colaborador to this setor
    if (!editingAtendente && existingColaborador && !existingColaborador.alreadyInThisSetor) {
      setSavingAtendente(true)
      try {
        const { error } = await supabase.from('colaboradores_setores').insert({
          colaborador_id: existingColaborador.id,
          setor_id: setorId,
        })
        if (error) throw error

        await saveSubsetores(existingColaborador.id)

        toast.success('Atendente adicionado ao setor!')
        setIsAtendenteModalOpen(false)
        mutate()
      } catch (error: any) {
        toast.error(error.message || 'Erro ao adicionar atendente')
      } finally {
        setSavingAtendente(false)
      }
      return
    }

      if (!editingAtendente && !existingColaborador && !atendenteForm.senha) {
      toast.error('Preencha a senha para o novo atendente')
      return
    }
    if (!editingAtendente && !existingColaborador && atendenteForm.senha !== atendenteForm.confirmarSenha) {
      toast.error('As senhas não coincidem')
      return
    }
    if (!editingAtendente && !existingColaborador && atendenteForm.senha.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres')
      return
    }

    if (editingAtendente && atendenteForm.novaSenha) {
      if (atendenteForm.novaSenha.length < 6) {
        toast.error('A senha deve ter no mínimo 6 caracteres')
        return
      }
      if (atendenteForm.novaSenha !== atendenteForm.confirmarNovaSenha) {
        toast.error('As senhas não coincidem')
        return
      }
    }

    setSavingAtendente(true)
    try {
      if (editingAtendente) {
        // Update existing atendente
        const { error } = await supabase
          .from('colaboradores')
          .update({ nome: atendenteForm.nome, suporte_id: atendenteForm.suporte_id.trim() || null })
          .eq('id', editingAtendente.id)

        if (error) throw error

        if (atendenteForm.novaSenha) {
          const passwordResponse = await fetch('/api/admin/update-user-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: editingAtendente.email,
              newPassword: atendenteForm.novaSenha,
            }),
          })
          const passwordResult = await passwordResponse.json()
          if (!passwordResponse.ok) {
            throw new Error(passwordResult.error || 'Erro ao atualizar senha')
          }
        }

        // Salvar subsetores na nova tabela N:N
        await saveSubsetores(editingAtendente.id)

        toast.success('Atendente atualizado com sucesso!')
      } else {
        // Get Atendente permission
        const atendentePermissao = permissoes.find((p: any) => p.nome === 'Atendente')

        // Create user using Admin API (bypasses rate limits)
        const createUserResponse = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: atendenteForm.email.trim().toLowerCase(),
            password: atendenteForm.senha,
            nome: atendenteForm.nome,
          }),
        })

        const createUserResult = await createUserResponse.json()

        if (!createUserResponse.ok) {
          throw new Error(createUserResult.error || 'Erro ao criar usuario')
        }

        // Create colaborador record
        const { data: colaboradorData, error: colabError } = await supabase
          .from('colaboradores')
          .insert({
            nome: atendenteForm.nome,
            email: atendenteForm.email.trim().toLowerCase(),
            permissao_id: atendentePermissao?.id,
            suporte_id: atendenteForm.suporte_id.trim() || null,
            ativo: true,
            is_online: false,
            is_master: false,
          })
          .select()
          .single()

        if (colabError) throw colabError

        // Link to this setor
        const { error: linkError } = await supabase
          .from('colaboradores_setores')
          .insert({
            colaborador_id: colaboradorData.id,
            setor_id: setorId,
          })

        if (linkError) throw linkError

        // Salvar subsetores na nova tabela N:N
        await saveSubsetores(colaboradorData.id)

        toast.success('Atendente criado com sucesso!')
      }

      setIsAtendenteModalOpen(false)
      mutate()
    } catch (error: any) {
      console.error('Error saving atendente:', error)
      
      // Handle specific error messages
      let errorMessage = 'Erro ao salvar atendente. Tente novamente.'
      if (error.message?.includes('rate limit')) {
        errorMessage = 'Limite de requisições excedido. Aguarde alguns minutos e tente novamente.'
      } else if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        errorMessage = 'Este e-mail já está cadastrado no sistema.'
      } else if (error.message?.includes('invalid') && error.message?.includes('mail')) {
        errorMessage = 'E-mail inválido. Verifique se o endereço está correto ou tente com outro provedor.'
      } else if (error.message?.includes('User already registered')) {
        errorMessage = 'Este e-mail já possui uma conta. Use a verificação automática de e-mail existente.'
      } else if (error.message) {
        errorMessage = error.message
      }

      toast.error(errorMessage)
    } finally {
      setSavingAtendente(false)
    }
  }

  const openDeleteConfirm = (atendente: { id: string; nome: string }) => {
    setAtendenteToDelete(atendente)
    setDeleteConfirmOpen(true)
  }

  const removeAtendenteFromSetor = async () => {
    if (!atendenteToDelete) return

    setDeleting(true)
    try {
      // Limpar vínculos de subsetor ANTES de remover do setor.
      // Sem isso, sobram linhas órfãs em colaboradores_subsetores que ainda
      // fazem o distribuidor escalar o atendente (a query de subsetor não
      // depende de colaboradores_setores).
      const { error: subError } = await supabase
        .from('colaboradores_subsetores')
        .delete()
        .eq('colaborador_id', atendenteToDelete.id)
        .eq('setor_id', setorId)
      if (subError) throw subError

      const { error } = await supabase
        .from('colaboradores_setores')
        .delete()
        .eq('colaborador_id', atendenteToDelete.id)
        .eq('setor_id', setorId)

      if (error) throw error
      toast.success('Atendente removido do setor')
      setDeleteConfirmOpen(false)
      setAtendenteToDelete(null)
      mutate()
    } catch (error) {
      toast.error('Erro ao remover atendente')
    } finally {
      setDeleting(false)
    }
  }

  // Open conversation slide-out — inclui histórico pré-ticket (bot/orphans)

  const openConversation = async (ticket: any) => {
    setSelectedTicket(ticket)
    setConversationTab('atendimento')
    setLoadingMessages(true)

    try {
      // Query 1: Mensagens do ticket
      const { data: ticketMsgs } = await supabase
        .from('mensagens')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('enviado_em', { ascending: true })

      // O Nexus pode persistir a última resposta alguns segundos após o ticket
      // ser criado. A janela curta posterior evita perder esse encerramento sem
      // misturar uma nova conversa do mesmo cliente.
      let nexusContextMsgs: any[] = []
      const clienteTelefone = ticket.clientes?.telefone
      if (clienteTelefone) {
        // Buscar todos cliente_ids com mesmo telefone (handles duplicates)
        const { data: allClientes } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefone', clienteTelefone)
        const clienteIds = allClientes?.map((c: any) => c.id) || [ticket.cliente_id].filter(Boolean)

        if (clienteIds.length > 0 && ticket.criado_em) {
          const ticketCreatedAt = new Date(ticket.criado_em)
          const before24h = new Date(ticketCreatedAt.getTime() - 24 * 60 * 60 * 1000).toISOString()
          const nexusTailEndsAt = new Date(ticketCreatedAt.getTime() + 5 * 60 * 1000).toISOString()
          const { data: orphanMsgs } = await supabase
            .from('mensagens')
            .select('*')
            .in('cliente_id', clienteIds)
            .is('ticket_id', null)
            .in('remetente', ['cliente-nexus', 'bot-nexus'])
            .gte('enviado_em', before24h)
            .lte('enviado_em', nexusTailEndsAt)
            .order('enviado_em', { ascending: true })
          nexusContextMsgs = orphanMsgs || []
        }
      }

      // Merge e deduplicar
      const allMsgs = [...nexusContextMsgs, ...(ticketMsgs || [])]
      const seen = new Set<string>()
      const deduped = allMsgs.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      deduped.sort((a, b) => new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime())

      const nexusContextIds = new Set(nexusContextMsgs.map((message) => message.id))
      const mensagensDaConversaNexus = deduped.filter((message) => (
        (message.ticket_id === ticket.id || nexusContextIds.has(message.id))
        && ehMensagemNexus(message)
      ))
      const primeiraMensagemNexus = mensagensDaConversaNexus[0]
      const inicioHumanoDoTicketId = mensagensDaConversaNexus.length > 0
        ? selecionarInicioHumanoDoTicket(deduped, ticket.id)
        : undefined
      if (primeiraMensagemNexus) {
        primeiraMensagemNexus._nexusHistoryStart = true
      }
      if (inicioHumanoDoTicketId) {
        const ticketStartMessage = deduped.find((message) => message.id === inicioHumanoDoTicketId)
        if (ticketStartMessage) ticketStartMessage._ticketStart = true
      }

      setConversationMessages(deduped)
    } catch (error) {
      toast.error('Erro ao carregar mensagens')
    } finally {
      setLoadingMessages(false)
    }
  }

  // Entra ou sai do acompanhamento do ticket aberto. O gestor marca a si
  // mesmo — quem acompanha vem da sessão, no servidor.
  const alternarAcompanhamento = async () => {
    if (!selectedTicket?.id) return
    const acompanhando = selectedTicket.acompanhamento?.colaborador_id === colaboradorLogado?.id

    setSalvandoAcompanhamento(true)
    try {
      const resposta = await fetch('/api/tickets/acompanhamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: selectedTicket.id, acompanhar: !acompanhando }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(dados?.error || 'Falha ao salvar')

      // A conversa fica aberta enquanto isso, então o estado local precisa
      // refletir na hora; o `mutate` sincroniza a tabela por baixo.
      setSelectedTicket((atual: any) => (
        atual ? { ...atual, acompanhamento: dados.acompanhamento ?? null } : atual
      ))
      toast.success(acompanhando ? 'Acompanhamento encerrado' : 'Você está acompanhando este atendimento')
      mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o acompanhamento')
    } finally {
      setSalvandoAcompanhamento(false)
    }
  }

  // Close conversation
  const closeConversation = () => {
    setSelectedTicket(null)
    setConversationMessages([])
    setNotaInterna('')
    setStatusAtendimentoAberto(false)
  }

  // Envia uma NOTA INTERNA (mensagem privada do supervisor) para o ticket.
  // Vai para `mensagens` com remetente='supervisor', sem despacho de canal:
  // o atendente vê no workdesk (destaque âmbar) e o cliente nunca recebe.
  const handleEnviarNotaInterna = async () => {
    const texto = notaInterna.trim()
    if (!selectedTicket?.id || !texto) return
    setEnviandoNota(true)
    try {
      const res = await fetch('/api/tickets/nota-interna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: selectedTicket.id, conteudo: texto, autor_nome: colaboradorLogado?.nome }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result?.error || 'Erro ao enviar nota interna')
        return
      }
      setConversationMessages((prev) => [...prev, result.message])
      setNotaInterna('')
      // rola pro fim pra mostrar a nota recém-enviada
      setTimeout(() => {
        const el = conversationScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      }, 50)
    } catch {
      toast.error('Erro ao enviar nota interna')
    } finally {
      setEnviandoNota(false)
    }
  }

  // Transfer ticket to another attendant

  // Buscar atendentes do setor destino para transferência

  // Finalize ticket
  const finalizeTicket = async () => {
    if (!selectedTicket) return
    
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'encerrado', encerrado_em: new Date().toISOString() })
        .eq('id', selectedTicket.id)

      if (error) throw error
      
      toast.success('Ticket finalizado com sucesso!')
      closeConversation()
      mutate()
    } catch (error) {
      toast.error('Erro ao finalizar ticket')
    }
  }

  const IconComponent = getIconComponent(configForm.icon_url)
  const SetorIcon = getIconComponent(setor?.icon_url)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Header - Simplified without tabs */}
      <header className="flex h-12 items-center justify-between border-b glass-header px-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-2.5 rounded-md text-foreground hover:text-primary transition-all cursor-pointer select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
              isNavigatingBack ? "bg-primary/20" : "hover:bg-muted"
            )}>
              {isNavigatingBack ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeft className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: setor?.cor || '#3B82F6' }}
              >
                <SetorIcon className="h-3.5 w-3.5 text-white" />
              </div>
              {isLoading ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <span className="text-sm font-semibold">{setor?.nome || 'Setor'}</span>
              )}
            </div>
          </button>
        </div>

        {/* Theme Toggle & User Menu */}
        <div className="flex items-center gap-1.5">
          {/* Send Notification Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNotificationModal(true)}
            className="h-7 gap-1.5 text-xs"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Enviar Aviso</span>
          </Button>

          {/* Busca rápida — atalho ⌘K (somente indicativo) */}
          <kbd className="kbd hidden md:inline-flex" aria-hidden="true">Ctrl K</kbd>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="Abrir menu do usuário"
                title="Menu do usuário"
              >
                <User className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — minimizada vira um trilho só de ícones; o botão de
            minimizar mora no rodapé da própria barra. */}
        <aside className={cn(
          'flex shrink-0 flex-col border-r glass-panel transition-[width] duration-200',
          sidebarCollapsed ? 'w-12' : 'w-52'
        )}>
          <nav className={cn('flex-1 space-y-0.5 overflow-y-auto', sidebarCollapsed ? 'p-1.5' : 'p-2.5')}>
            {sidebarItems.filter((item) => !(item as any).whatsappOnly || configForm.canal !== 'discord').map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  title={sidebarCollapsed ? item.name : undefined}
                  className={cn(
                    'flex w-full rounded-lg text-left text-xs transition-all cursor-pointer select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    sidebarCollapsed ? 'items-center justify-center px-2 py-2' : 'items-start gap-2 px-2.5 py-2',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', !sidebarCollapsed && 'mt-0.5')} />
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <p className={cn('font-medium leading-tight', !isActive && 'text-foreground')}>{item.name}</p>
                      <p className="text-[11px] leading-tight text-muted-foreground">{item.description}</p>
                    </div>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Rodapé — minimizar/expandir a barra */}
          <div className="shrink-0 border-t p-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebarCollapsed}
              className={cn(
                'h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
                sidebarCollapsed ? 'w-full' : 'w-full justify-start gap-2 px-2.5'
              )}
              aria-label={sidebarCollapsed ? 'Mostrar menu' : 'Minimizar menu'}
              title={sidebarCollapsed ? 'Mostrar menu' : 'Minimizar menu'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              {!sidebarCollapsed && <span className="text-xs">Minimizar</span>}
            </Button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4">
          {/* Monitoramento Section */}
          {activeSection === 'monitoramento' && (
            <div className="space-y-4 anim-rise">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold tracking-tight">Monitoramento de atendimento</h1>
                  <div className="flex items-center gap-1.5">
                    <span className="signal-dot" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">Ao vivo</span>
                  </div>
                </div>

                {/* Um botão só. O modo de arrastar mora dentro dele: eram três
                    controles para a mesma coisa — arranjo da tela — e o
                    cabeçalho é do monitoramento, não da personalização.
                    O popover é incondicional de propósito: preso ao
                    `opcoesSubsetorTempoReal`, um setor sem subsetor ficava sem
                    NENHUM acesso a ajustar tamanho ou restaurar padrão. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={monitorEditMode ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 gap-1.5"
                    >
                      <Settings className="h-3 w-3" />
                      Personalizar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Arranjo da tela</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={resetarLayoutMonitor}
                        title="Voltar ao arranjo padrão: posições, tamanhos e largura"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restaurar padrão
                      </Button>
                    </div>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm">
                        Mover e redimensionar
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Arraste pelo punho e use o canto do card.
                        </span>
                      </span>
                      <Switch
                        checked={monitorEditMode}
                        onCheckedChange={setMonitorEditMode}
                        aria-label="Mover e redimensionar os cards"
                      />
                    </label>

                    {opcoesSubsetorTempoReal.length > 0 && (
                      <>
                        <div className="my-4 border-t" />

                        <p className="text-sm font-medium">Largura dos cards</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Divide o espaço entre os dois cards de tempo real.
                        </p>

                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          {(Object.keys(LARGURA_LINHA1) as ProporcaoLinha1[]).map((chave) => (
                            <Button
                              key={chave}
                              variant={proporcaoLinha1 === chave ? 'default' : 'outline'}
                              size="sm"
                              className="h-auto whitespace-normal px-2 py-1.5 text-[11px] leading-tight"
                              onClick={() => aplicarProporcaoLinha1(chave)}
                            >
                              {ROTULO_PROPORCAO[chave]}
                            </Button>
                          ))}
                        </div>

                        <div className="my-4 border-t" />

                        <p className="text-sm font-medium">Segundo card de tempo real</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Uma segunda cópia do card, com seu próprio filtro de subsetor.
                        </p>

                        <label className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-sm">Mostrar segundo card</span>
                          <Switch
                            checked={painelSubsetorVisivel}
                            onCheckedChange={(marcado) => {
                              setPainelSubsetorVisivel(marcado)
                              // Ligar ou desligar o segundo card reorganiza a
                              // primeira linha inteira. Sem voltar ao padrão do
                              // novo estado, o card reexibido caía no rodapé e o
                              // desligado deixava metade da linha vazia.
                              setMonitorLayout(null)
                              try {
                                window.localStorage.removeItem(MONITOR_LAYOUT_STORAGE_KEY)
                              } catch { /* navegador sem storage não impede ajustar em tela */ }
                            }}
                            aria-label="Mostrar segundo card de tempo real"
                          />
                        </label>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Quick Filters */}
              {(subsetorFiltroOptions.length > 1 || subsetorFilter.length > 0 || tagSetorFiltroOptions.length > 0 || tagSetorFilter.length > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filtros rápidos:</span>
                  {(subsetorFiltroOptions.length > 1 || subsetorFilter.length > 0) && (
                    <MultiSelectFilter
                      icon={Layers}
                      placeholder="Subsetores"
                      header="Filtrar monitoramento por subsetor"
                      pluralWord="subsetores"
                      options={subsetorFiltroOptions}
                      selected={subsetorFilter}
                      onChange={(next) => {
                        setSubsetorFilter(next)
                        setMonitoringPage(1)
                      }}
                      open={quickSubsetorFiltroOpen}
                      onOpenChange={setQuickSubsetorFiltroOpen}
                    />
                  )}
                  {(tagSetorFiltroOptions.length > 0 || tagSetorFilter.length > 0) && (
                    <MultiSelectFilter
                      icon={Tag}
                      placeholder="Tags"
                      header="Filtrar monitoramento por tag"
                      pluralWord="tags"
                      options={tagSetorFiltroOptions}
                      selected={tagSetorFilter}
                      onChange={(next) => {
                        setTagSetorFilter(next)
                        setMonitoringPage(1)
                      }}
                      open={quickTagSetorFiltroOpen}
                      onOpenChange={setQuickTagSetorFiltroOpen}
                    />
                  )}
                </div>
              )}

              {/* O "Concluir" vive aqui porque o botão que ligou o modo saiu do
                  cabeçalho: sem isto, sair exigiria reabrir o Personalizar. */}
              {monitorEditMode && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    Modo de personalização: arraste pelo punho <GripVertical className="inline h-3 w-3" /> para mover e use o canto inferior-direito para redimensionar.
                  </span>
                  <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => setMonitorEditMode(false)}>
                    Concluir
                  </Button>
                </div>
              )}

              <ResponsiveReactGridLayout
                layouts={monitorResponsiveLayouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={52}
                margin={[12, 12]}
                isDraggable={monitorEditMode}
                isResizable={monitorEditMode}
                draggableHandle=".report-drag-handle"
                resizeHandles={['se']}
                onLayoutChange={(_cur, all) => handleMonitorLayoutChange(all.lg || _cur)}
              >
                <div key="tempoReal" className="overflow-hidden">
                <ReportWidget {...monitorWidget('tempoReal')}>
                <CardAtendimentosTempoReal
                  resumo={resumoCardPrincipal}
                  workload={cargaCardPrincipal}
                  tomCarga={WORKLOAD_OS_TONES[cargaCardPrincipal.level]}
                  tempoMaximoFila={formatarTempoMonitoramento(resumoCardPrincipal.maiorEsperaFilaMs)}
                  tempoMaximoResposta={formatarTempoMonitoramento(resumoCardPrincipal.maiorEsperaRespostaMs)}
                  fila={indicadoresCardPrincipal.fila}
                  episodios={indicadoresCardPrincipal.episodios}
                  opcoes={opcoesSubsetorTempoReal}
                  subsetorSelecionado={subsetorCardPrincipal}
                  aoTrocarSubsetor={setSubsetorCardPrincipal}
                />
                </ReportWidget>
                </div>

                <div key="statusAtendentes" className="overflow-hidden">
                <ReportWidget {...monitorWidget('statusAtendentes')}>
                {/* Status dos atendentes */}
                <Card className="glass-card-elevated flex flex-col gap-3 rounded-lg py-3">
                  <CardHeader className="pb-1.5 px-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Status dos atendentes
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setStatusAtendentesModalOpen(true)}
                    >
                      Ver detalhes
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-1 items-center px-3">
                    <div className="flex w-full justify-around gap-1.5 text-center">
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-green-500 tabular-nums">{atendentesStats.online}</p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          <p className="text-xs text-muted-foreground">Online</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-amber-500 tabular-nums">{atendentesStats.pausa}</p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          <p className="text-xs text-muted-foreground">Pausa</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-muted-foreground tabular-nums">{atendentesStats.invisivel}</p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          <p className="text-xs text-muted-foreground">Offline</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                </ReportWidget>
                </div>

                {opcoesSubsetorTempoReal.length > 0 && painelSubsetorVisivel && (
                <div key="porSubsetor" className="overflow-hidden">
                <ReportWidget {...monitorWidget('porSubsetor')}>
                  {/* Mesmo componente do card acima: o gestor mantém um com o
                      setor inteiro e outro recortado, sem risco de os dois
                      divergirem na apresentação. */}
                  <CardAtendimentosTempoReal
                    resumo={resumoCardSecundario}
                    workload={cargaCardSecundario}
                    tomCarga={WORKLOAD_OS_TONES[cargaCardSecundario.level]}
                    tempoMaximoFila={formatarTempoMonitoramento(resumoCardSecundario.maiorEsperaFilaMs)}
                    tempoMaximoResposta={formatarTempoMonitoramento(resumoCardSecundario.maiorEsperaRespostaMs)}
                    fila={indicadoresCardSecundario.fila}
                    episodios={indicadoresCardSecundario.episodios}
                    opcoes={opcoesSubsetorTempoReal}
                    subsetorSelecionado={subsetorCardSecundario}
                    aoTrocarSubsetor={setSubsetorCardSecundario}
                  />
                </ReportWidget>
                </div>
                )}

                <div key="atendimentoHoje" className="overflow-hidden">
                <ReportWidget {...monitorWidget('atendimentoHoje')}>
              {/* Atendimento hoje */}
              <Card className="glass-card-elevated h-full overflow-auto rounded-lg gap-3 py-3">
                <CardHeader className="pb-1.5 px-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Atendimento hoje
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3">
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="space-y-1">
                      <p className={cn('text-lg font-bold tabular-nums', corTempoMedioLimiar(temposHoje.tempoMedioEsperaMs))}>{temposHoje.tempoMedioEspera}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. espera</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-foreground tabular-nums">{temposHoje.tempoMedioResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. resposta</p>
                    </div>
                    <div className="space-y-1">
                      <p className={cn('text-lg font-bold tabular-nums', corTempoMedioLimiar(temposHoje.tempoMedioPrimeiraRespostaMs))}>{temposHoje.tempoMedioPrimeiraResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. 1ª resp.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-foreground tabular-nums">{temposHoje.tempoMedioAtendimento}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. atend.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

                </ReportWidget>
                </div>

              </ResponsiveReactGridLayout>

            {/* Monitoramento Detalhado - Blip Style */}
            <Card className="glass-card-elevated rounded-lg gap-4 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Monitoramento detalhado</CardTitle>
                  <div className="flex items-center gap-2">
                    <MultiSelectFilter
                      icon={User}
                      placeholder="Atendente"
                      header="Acompanhar atendentes"
                      pluralWord="atendentes"
                      options={atendenteFiltroOptions}
                      selected={atendenteFilter}
                      onChange={(next) => {
                        setAtendenteFilter(next)
                        setMonitoringPage(1)
                      }}
                      open={filtrosOpen}
                      onOpenChange={setFiltrosOpen}
                      searchable
                    />
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        type="search"
                        aria-label="Buscar tickets do setor"
                        placeholder="Buscar por Nº do ticket, contato ou telefone"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value)
                          setMonitoringPage(1)
                        }}
                        className="w-52 pl-9 h-8"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-3">
                {/* Tabs */}
                <div className="border-b border-border mb-3">
                  <div className="flex gap-0">
                    <button
                      onClick={() => {
                        setActiveTab('em-andamento')
                        setMonitoringPage(1)
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                        activeTab === 'em-andamento'
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      Atribuído/Em andamento
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('aguardando')
                        setMonitoringPage(1)
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
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
                      onClick={() => {
                        setActiveTab('atendentes')
                        setMonitoringPage(1)
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                        activeTab === 'atendentes'
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      Atendentes
                    </button>
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
                            <SortableTableHead
                              label="Status"
                              active={activeTicketsSort.key === 'status'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'status'))}
                            />
                            <SortableTableHead
                              label="Tempo na fila"
                              active={activeTicketsSort.key === 'queueTime'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'queueTime'))}
                            />
                            <SortableTableHead
                              label="Tempos atuais"
                              active={activeTicketsSort.key === 'serviceTime'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'serviceTime'))}
                            />
                            <SortableTableHead
                              label="Ticket"
                              active={activeTicketsSort.key === 'ticket'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'ticket'))}
                            />
                            <SortableTableHead
                              label="Contato"
                              active={activeTicketsSort.key === 'contact'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'contact'))}
                            />
                            <SortableTableHead
                              label="Origem"
                              active={activeTicketsSort.key === 'origin'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'origin'))}
                            />
                            <SortableTableHead
                              label="Fila"
                              active={activeTicketsSort.key === 'queue'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'queue'))}
                            />
                            <SortableTableHead
                              label="Atendente"
                              active={activeTicketsSort.key === 'attendant'}
                              direction={activeTicketsSort.direction}
                              onSort={() => setActiveTicketsSort((current) => getNextSort(current, 'attendant'))}
                            />
                            <TableHead className="text-xs" title="Gestor acompanhando o atendimento">Acompanhando</TableHead>
                            <TableHead className="text-xs w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                              </TableRow>
                            ))
                          ) : ticketsEmAndamento.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={10} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground/50" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum atendimento no momento</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Os atendimentos ativos aparecem aqui em tempo real.</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedTicketsEmAndamento.map((ticket: any) => {
                              const aguardandoResposta = ticket.status === 'em_atendimento' && !ticket.primeira_resposta_em
                              const statusLevel = computeAtendimentoStatus(ticket.statusMs, atendimentoStatusThresholds)
                              return (
                                <TableRow
                                  key={ticket.id}
                                  className={cn(
                                    aguardandoResposta && "bg-yellow-50/50 dark:bg-yellow-950/20"
                                  )}
                                >
                                  <TableCell>
                                    <Badge variant="outline" className={cn('text-[10px]', atendimentoStatusBadgeClass(statusLevel))}>
                                      {formatAtendimentoStatusLabel(statusLevel)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm tabular-nums text-foreground">{ticket.tempoNaFila}</TableCell>
                                  <TableCell className="text-sm tabular-nums text-foreground">
                                    <p>Atendente: {ticket.tempoAtendimento}</p>
                                    <p className="text-xs text-muted-foreground">Setor: {ticket.tempoNoSetor}</p>
                                  </TableCell>
                                  <TableCell className="text-sm font-mono tabnums text-foreground font-medium">
                                    {ticket.numero ? `#${ticket.numero}` : '—'}
                                  </TableCell>
                                  <TableCell className="text-sm text-foreground max-w-[180px]">
                                    <div className="flex items-center gap-1">
                                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span className="truncate" title={ticket.contato}>{ticket.contato}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell><OrigemBadge origem={origensMap.get(ticket.id)} setorAtualNome={setor?.nome} compact /></TableCell>
                                  <TableCell className="text-sm text-foreground max-w-[160px]">
                                    <span className="block truncate" title={ticket.fila && ticket.fila !== setor?.nome ? `${setor?.nome} / ${ticket.fila}` : setor?.nome}>{ticket.fila || setor?.nome}</span>
                                  </TableCell>
                                  <TableCell className="text-sm text-foreground">{ticket.atendente || '-'}</TableCell>
                                  <TableCell className="max-w-[150px]">
                                    {ticket.acompanhamento ? (
                                      <Badge
                                        variant="outline"
                                        className="max-w-full gap-1 border-primary/40 bg-primary/10 text-[10px] text-primary"
                                        title={`${ticket.acompanhamento.colaborador_nome || 'Gestor'} acompanha desde ${new Date(ticket.acompanhamento.iniciado_em).toLocaleString('pt-BR')}`}
                                      >
                                        <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{ticket.acompanhamento.colaborador_nome || 'Gestor'}</span>
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
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
                                      <MessageCircle className="h-3.5 w-3.5" />
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

                  {/* Aguardando Tab */}
                  {activeTab === 'aguardando' && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <SortableTableHead
                              label="Status"
                              active={waitingTicketsSort.key === 'status'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'status'))}
                            />
                            <SortableTableHead
                              label="Tempo na fila"
                              active={waitingTicketsSort.key === 'queueTime'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'queueTime'))}
                            />
                            <SortableTableHead
                              label="Ticket"
                              active={waitingTicketsSort.key === 'ticket'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'ticket'))}
                            />
                            <SortableTableHead
                              label="Contato"
                              active={waitingTicketsSort.key === 'contact'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'contact'))}
                            />
                            <SortableTableHead
                              label="Origem"
                              active={waitingTicketsSort.key === 'origin'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'origin'))}
                            />
                            <SortableTableHead
                              label="Fila"
                              active={waitingTicketsSort.key === 'queue'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'queue'))}
                            />
                            <SortableTableHead
                              label="Prioridade"
                              active={waitingTicketsSort.key === 'priority'}
                              direction={waitingTicketsSort.direction}
                              onSort={() => setWaitingTicketsSort((current) => getNextSort(current, 'priority'))}
                            />
                            <TableHead className="text-xs w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                              </TableRow>
                            ))
                          ) : ticketsAguardando.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground/50" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum ticket aguardando atendimento</p>
                                  <p className="text-xs mt-1">Tickets só são atribuídos quando há atendentes online</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedTicketsAguardando.map((ticket: any) => (
                              <TableRow key={ticket.id} className="bg-yellow-50/50 dark:bg-yellow-950/20">
                                <TableCell>
                                  <Badge variant="outline" className={cn('text-[10px]', atendimentoStatusBadgeClass(computeAtendimentoStatus(ticket.tempoNaFilaMs, atendimentoStatusThresholds)))}>
                                    {formatAtendimentoStatusLabel(computeAtendimentoStatus(ticket.tempoNaFilaMs, atendimentoStatusThresholds))}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                    <Clock className="mr-1 h-3 w-3" />
                                    {ticket.tempoNaFila}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm font-mono tabnums text-foreground font-medium">
                                  {ticket.numero ? `#${ticket.numero}` : '—'}
                                </TableCell>
                                <TableCell className="text-sm text-foreground max-w-[180px]">
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="truncate" title={ticket.clientes?.nome || ticket.clientes?.telefone || 'Desconhecido'}>{ticket.clientes?.nome || ticket.clientes?.telefone || 'Desconhecido'}</span>
                                  </div>
                                </TableCell>
                                <TableCell><OrigemBadge origem={origensMap.get(ticket.id)} setorAtualNome={setor?.nome} compact /></TableCell>
                                <TableCell className="text-sm text-foreground max-w-[160px]">
                                  <span className="block truncate" title={ticket.fila && ticket.fila !== setor?.nome ? `${setor?.nome} / ${ticket.fila}` : setor?.nome}>{ticket.fila || setor?.nome}</span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    ticket.prioridade === 'alta' ? 'destructive' :
                                    ticket.prioridade === 'media' ? 'default' : 'secondary'
                                  } className="text-[10px]">
                                    {ticket.prioridade}
                                  </Badge>
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
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Atendentes Tab */}
                  {activeTab === 'atendentes' && (
                    <div className="space-y-3">
                      {(subsetorFiltroOptions.length > 1 || subsetorFilter.length > 0) && (
                        <MultiSelectFilter
                          icon={Layers}
                          placeholder="Filtrar atendentes por subsetor"
                          header="Filtrar atendentes por subsetor"
                          pluralWord="subsetores"
                          options={subsetorFiltroOptions}
                          selected={subsetorFilter}
                          onChange={setSubsetorFilter}
                          open={atendentesTabSubsetorFiltroOpen}
                          onOpenChange={setAtendentesTabSubsetorFiltroOpen}
                          searchable
                        />
                      )}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <SortableTableHead
                              label="Atendente"
                              active={attendantsSort.key === 'attendant'}
                              direction={attendantsSort.direction}
                              onSort={() => setAttendantsSort((current) => getNextSort(current, 'attendant'))}
                            />
                            <SortableTableHead
                              label="Status"
                              active={attendantsSort.key === 'status'}
                              direction={attendantsSort.direction}
                              onSort={() => setAttendantsSort((current) => getNextSort(current, 'status'))}
                            />
                            <SortableTableHead
                              label="Em atendimento"
                              active={attendantsSort.key === 'activeTickets'}
                              direction={attendantsSort.direction}
                              onSort={() => setAttendantsSort((current) => getNextSort(current, 'activeTickets'))}
                              align="center"
                            />
                            <SortableTableHead
                              label="Finalizados hoje"
                              active={attendantsSort.key === 'finalizedToday'}
                              direction={attendantsSort.direction}
                              onSort={() => setAttendantsSort((current) => getNextSort(current, 'finalizedToday'))}
                              align="center"
                            />
                            <TableHead className="text-xs w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            ))
                          ) : atendentes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum atendente cadastrado neste setor</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Cadastre atendentes para distribuir os tickets.</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : sortedMonitoringAttendants.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <Users className="mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum atendente corresponde aos filtros atuais</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Ajuste ou limpe os filtros de atendente e subsetor.</p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 h-7 text-xs"
                                    onClick={() => {
                                      setAtendenteFilter([])
                                      setSubsetorFilter([])
                                    }}
                                  >
                                    Limpar filtros
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedMonitoringAttendants.map((atendente: any) => {
                              const ticketsDoAtendente = activeTicketCountByAttendant.get(atendente.id) || 0
                              const finalizadosHojeDoAtendente = finalizedTodayCountByAttendant.get(atendente.id) || 0
                              const isOnPause = !!atendente.pausa_atual_id
                              const isOnline = atendente.is_online
                              const pausaInfo = atendente.pausaInfo as { nome: string; inicio: string; tempoMaximoMinutos: number | null } | null | undefined
                              const pausaElapsedMs = isOnPause ? computePausaElapsedMs(pausaInfo, monitoringTick) : 0
                              const pausaEstourada = isOnPause && isPausaEstourada(pausaInfo, pausaElapsedMs)
                              const pausaLabel = formatPausaStatusLabel(pausaInfo, pausaElapsedMs)
                              const statusDisplay = isOnPause
                                ? pausaEstourada
                                  ? { color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400 font-medium', label: pausaLabel }
                                  : { color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400', label: pausaLabel }
                                : isOnline
                                  ? { color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', label: 'Online' }
                                  : { color: 'bg-gray-400', textColor: 'text-muted-foreground', label: 'Offline' }
                              const isChanging = alterandoStatusId === atendente.id
                              // Um conjunto de itens, dois gatilhos: o próprio status e o `...`
                              // no fim da linha. Escondido só no `...`, o controle de pausa
                              // não era encontrado — e o status é onde se olha para decidir
                              // mexer nele. A aba Atendentes já abre o menu pelo badge de
                              // status; aqui passa a ser igual.
                              const itensDeDisponibilidade = (
                                <>
                                  <DropdownMenuItem
                                    disabled={isOnline && !isOnPause}
                                    onClick={() => pedirDisponibilidade(
                                      atendente,
                                      ticketsDoAtendente,
                                      'marcar como online',
                                      () => handleAlterarStatusAtendente(atendente.id, 'online'),
                                    )}
                                    className="gap-2"
                                  >
                                    <CircleCheck className="h-3.5 w-3.5 text-green-500" />
                                    Marcar como Online
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!isOnline && !isOnPause}
                                    onClick={() => pedirDisponibilidade(
                                      atendente,
                                      ticketsDoAtendente,
                                      'marcar como offline',
                                      () => handleAlterarStatusAtendente(atendente.id, 'offline'),
                                    )}
                                    className="gap-2"
                                  >
                                    <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                                    Marcar como Offline
                                  </DropdownMenuItem>

                                  {/* Controle de pausa (caso #97218). Só aparece para quem
                                      supervisiona este setor — o servidor recusa de qualquer
                                      forma, isto só evita oferecer o que o POST negaria.
                                      Trocar o tipo e tirar da pausa exigem ainda que a pausa
                                      aberta seja DESTE setor: quem trabalha em dois setores
                                      pode ter pausado no outro, e a ausência conta lá. */}
                                  {/* A condição da pausa DESTE setor entra junto com o separador:
                                      em pausa aberta em outro setor não há item nenhum para
                                      mostrar, e o separador sozinho vira um risco solto no fim
                                      do menu. Por estar aqui, o ramo de baixo não a repete. */}
                                  {souSupervisorDoSetor && (!isOnPause || pausaEhDesteSetor(atendente)) && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {isOnPause ? (
                                        <>
                                            {/* Tirar da pausa NÃO depende do catálogo — a rota
                                                só fecha a instância aberta. Ficava junto com a
                                                troca sob a mesma condição, e num setor que
                                                apagou seus tipos o supervisor perdia também a
                                                saída da pausa, que é o controle mais crítico. */}
                                            <DropdownMenuItem
                                              onClick={() => pedirDisponibilidade(
                                                atendente,
                                                ticketsDoAtendente,
                                                'tirar da pausa',
                                                () => handleTirarDaPausa(atendente.id),
                                              )}
                                              className="gap-2"
                                            >
                                              <Play className="h-3.5 w-3.5 text-green-500" />
                                              Tirar da pausa
                                            </DropdownMenuItem>
                                            {/* O tipo que já está valendo sai da lista:
                                                reescolhê-lo não é troca, e a rota recusa com
                                                MESMO_TIPO. Sem nenhum OUTRO tipo não há troca
                                                possível, e o submenu abriria vazio. */}
                                            {tiposDePausaAtivos.some((tipo) => tipo.id !== atendente.pausaTipoId) && (
                                              <DropdownMenuSub>
                                                <DropdownMenuSubTrigger className="gap-2">
                                                  <Coffee className="h-3.5 w-3.5 text-amber-500" />
                                                  Trocar tipo de pausa
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                                                  {tiposDePausaAtivos
                                                    .filter((tipo) => tipo.id !== atendente.pausaTipoId)
                                                    .map((tipo) => (
                                                      <DropdownMenuItem
                                                        key={tipo.id}
                                                        onClick={() => pedirDisponibilidade(
                                                          atendente,
                                                          ticketsDoAtendente,
                                                          `trocar a pausa para ${tipo.nome}`,
                                                          () => handleTrocarTipoDePausa(atendente.id, tipo.id),
                                                        )}
                                                      >
                                                        {tipo.nome}
                                                      </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                              </DropdownMenuSub>
                                            )}
                                          </>
                                      ) : tiposDePausaAtivos.length === 0 ? (
                                        /* Setor sem tipo de pausa cadastrado — 18 dos 35 estão
                                           assim. Some o item e a supervisão lê como "a função
                                           não funciona"; o que falta é cadastro, e é em
                                           Configurações → Pausas, nesta mesma tela. */
                                        <DropdownMenuItem disabled className="gap-2">
                                          <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                                          Nenhum tipo de pausa neste setor
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuSub>
                                          <DropdownMenuSubTrigger className="gap-2">
                                            <Coffee className="h-3.5 w-3.5 text-amber-500" />
                                            Colocar em pausa
                                          </DropdownMenuSubTrigger>
                                          {/* 18 tipos num setor real não cabem na tela: o
                                              submenu rola em vez de estourar para fora. */}
                                          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                                            {tiposDePausaAtivos.map((tipo) => (
                                              <DropdownMenuItem
                                                key={tipo.id}
                                                onClick={() => pedirDisponibilidade(
                                                  atendente,
                                                  ticketsDoAtendente,
                                                  `colocar em ${tipo.nome}`,
                                                  () => handleColocarEmPausa(atendente.id, tipo.id),
                                                )}
                                              >
                                                {tipo.nome}
                                              </DropdownMenuItem>
                                            ))}
                                          </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                      )}
                                    </>
                                  )}
                                </>
                              )
                              return (
                                <TableRow key={atendente.id}>
                                  <TableCell className="text-sm font-medium text-foreground">{atendente.nome}</TableCell>
                                  <TableCell>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          disabled={isChanging}
                                          aria-label={`Alterar disponibilidade de ${atendente.nome}`}
                                          title="Alterar disponibilidade"
                                          className="flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-muted disabled:opacity-60"
                                        >
                                          <span className={cn('h-2 w-2 rounded-full shrink-0', statusDisplay.color)} />
                                          <span className={cn('text-sm', statusDisplay.textColor)}>{statusDisplay.label}</span>
                                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="start" className="w-52">
                                        {itensDeDisponibilidade}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                  <TableCell className="text-sm tabular-nums text-center font-medium">{ticketsDoAtendente}</TableCell>
                                  <TableCell className="text-sm tabular-nums text-center font-medium">{finalizadosHojeDoAtendente}</TableCell>
                                  <TableCell className="text-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={isChanging}
                                          aria-label={`Alterar status de ${atendente.nome}`}
                                          title="Alterar status"
                                        >
                                          {isChanging
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <MoreHorizontal className="h-3 w-3" />
                                          }
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-52">
                                        {itensDeDisponibilidade}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    </div>
                  )}

                </div>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 mt-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Resultados por página:</span>
                    <Select
                      value={String(monitoringPageSize)}
                      onValueChange={(value) => escolherPageSize(
                        value,
                        setMonitoringPageSize,
                        () => setMonitoringPage(1),
                        MONITOR_PAGE_SIZE_STORAGE_KEY,
                      )}
                    >
                      <SelectTrigger className="h-7 w-[4.5rem]" aria-label="Resultados por página do monitoramento">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((tamanho) => (
                          <SelectItem key={tamanho} value={String(tamanho)}>{tamanho}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span aria-live="polite">
                      {monitoringRangeStart}-{monitoringRangeEnd} de {monitoringItemCount}
                    </span>
                    <div className="flex items-center gap-0.5 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonitoringPage(1)}
                        disabled={safeMonitoringPage <= 1}
                        aria-label="Primeira página"
                        title="Primeira página"
                      >
                        <ChevronFirst className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonitoringPage(Math.max(1, safeMonitoringPage - 1))}
                        disabled={safeMonitoringPage <= 1}
                        aria-label="Página anterior"
                        title="Página anterior"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="px-2" aria-label={`Página ${safeMonitoringPage} de ${monitoringTotalPages}`}>
                        {safeMonitoringPage}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonitoringPage(Math.min(monitoringTotalPages, safeMonitoringPage + 1))}
                        disabled={safeMonitoringPage >= monitoringTotalPages || monitoringItemCount === 0}
                        aria-label="Próxima página"
                        title="Próxima página"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonitoringPage(monitoringTotalPages)}
                        disabled={safeMonitoringPage >= monitoringTotalPages || monitoringItemCount === 0}
                        aria-label="Última página"
                        title="Última página"
                      >
                        <ChevronLast className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        )}

        {/* Relatórios Section */}
        {activeSection === 'relatorios' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between anim-rise">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Relatorios de Atendimento</h1>
              </div>
              <div className="flex items-center gap-2">
                {editMode && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Reordenar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-2 max-h-[440px] overflow-y-auto">
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Ordem dos relatórios</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={resetRelatorioOrder}
                        title="Voltar à ordem padrão"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restaurar padrão
                      </Button>
                    </div>
                    {relatorioVisibleIds.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Nenhum relatório visível. Ative alguns em “Personalizar”.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {relatorioVisibleIds.map((id, idx) => {
                          const opt = RELATORIO_CARD_OPTIONS.find((o) => o.id === id)
                          if (!opt) return null
                          return (
                            <div key={id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                              <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                              <span className="flex-1 truncate text-sm">{opt.label}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                                onClick={() => moveRelatorioCard(id, -1)}
                                disabled={idx === 0}
                                aria-label={`Subir ${opt.label}`}
                                title="Subir"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                                onClick={() => moveRelatorioCard(id, 1)}
                                disabled={idx === relatorioVisibleIds.length - 1}
                                aria-label={`Descer ${opt.label}`}
                                title="Descer"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                )}
                {editMode ? (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Eye className="h-3.5 w-3.5" />
                          Mostrar/ocultar
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-2 max-h-[420px] overflow-y-auto">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">Relatórios visíveis</p>
                        {RELATORIO_CARD_OPTIONS.map((opt) => (
                          <label
                            key={opt.id}
                            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                          >
                            <span className="text-sm">{opt.label}</span>
                            <Switch checked={visibleCards[opt.id] ?? true} onCheckedChange={() => toggleCard(opt.id)} />
                          </label>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" className="gap-2" onClick={() => setEditMode(false)}>
                      <Check className="h-3.5 w-3.5" />
                      Concluir
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditMode(true)}>
                    <Settings className="h-3.5 w-3.5" />
                    Personalizar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" disabled={ticketsRelatorio.length === 0}>
                      <Download className="h-3.5 w-3.5" />
                      Exportar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => exportRelatorioCsv(ticketsRelatorio, `${exportFilenameBase}.csv`)}
                    >
                      Exportar CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        exportRelatorioXlsx(ticketsRelatorio, `${exportFilenameBase}.xlsx`).catch(() =>
                          toast.error('Falha ao gerar o arquivo XLSX')
                        )
                      }}
                    >
                      Exportar XLSX
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DatePeriodFilter
                  dateFilter={dateFilter}
                  onDateFilterChange={setDateFilter}
                  customRange={customRange}
                  onCustomRangeChange={setCustomRange}
                  showToday={true}
                  triggerClassName="w-44"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 anim-rise">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                Filtrar:
              </span>
              {(subsetorFiltroOptions.length > 1 || relatorioSubsetorFilter.length > 0) && (
                <MultiSelectFilter
                  icon={Layers}
                  placeholder="Subsetores"
                  header="Filtrar relatórios por subsetor"
                  pluralWord="subsetores"
                  options={subsetorFiltroOptions}
                  selected={relatorioSubsetorFilter}
                  onChange={setRelatorioSubsetorFilter}
                  open={relatorioSubsetorFiltroOpen}
                  onOpenChange={setRelatorioSubsetorFiltroOpen}
                  searchable
                />
              )}
              <MultiSelectFilter
                icon={User}
                placeholder="Atendentes"
                header="Filtrar relatórios por atendente"
                pluralWord="atendentes"
                options={relatorioAtendenteFiltroOptions}
                selected={relatorioAtendenteFilter}
                onChange={setRelatorioAtendenteFilter}
                open={relatorioAtendenteFiltroOpen}
                onOpenChange={setRelatorioAtendenteFiltroOpen}
                searchable
              />
              <MultiSelectFilter
                icon={Tag}
                placeholder="Tags"
                header="Filtrar relatórios por tag"
                pluralWord="tags"
                options={tagSetorFiltroOptions}
                selected={tagSetorFilter}
                onChange={setTagSetorFilter}
                open={relatorioTagSetorFiltroOpen}
                onOpenChange={setRelatorioTagSetorFiltroOpen}
              />
              <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-nums>
                {ticketsRelatorio.length} atendimentos
              </span>
            </div>

            {editMode && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Modo de personalização: arraste pelo punho <GripVertical className="inline h-3 w-3" /> para mover e use o canto inferior‑direito para redimensionar. Clique em <strong>Concluir</strong> para fixar.
              </div>
            )}
            {/* ===== Relatórios — cartões (fixos; editáveis no modo Personalizar) ===== */}
            <ResponsiveReactGridLayout
              layouts={reportResponsiveLayouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={58}
              margin={[12, 12]}
              isDraggable={editMode}
              isResizable={editMode}
              draggableHandle=".report-drag-handle"
              resizeHandles={['se']}
              onLayoutChange={(_cur, all) => handleLayoutChange(all.lg || _cur)}
            >

            {/* KPIs — cada indicador é um card solto (ativar/ocultar, arrastar, redimensionar) */}
            {visibleCards.kpiPrimeiraResposta && (
            <div key="kpiPrimeiraResposta" className="overflow-hidden">
            <ReportWidget {...wprops('kpiPrimeiraResposta')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Tempo médio 1a resposta</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold tracking-tight tabular-nums lg:text-lg">{relatorioStats.tempoMedioPrimeiraResposta}</p>
                        <DeltaBadge current={kpiAtual.tmaPrimeiraRespostaMs} previous={kpiAnterior?.tmaPrimeiraRespostaMs} invert />
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/30">
                      <Timer aria-hidden="true" className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {visibleCards.kpiResolucao && (
            <div key="kpiResolucao" className="overflow-hidden">
            <ReportWidget {...wprops('kpiResolucao')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Tempo médio resolução</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold tracking-tight tabular-nums lg:text-lg">{relatorioStats.tempoMedioResolucao}</p>
                        <DeltaBadge current={kpiAtual.tmaResolucaoMs} previous={kpiAnterior?.tmaResolucaoMs} invert />
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 dark:bg-green-950/30">
                      <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {visibleCards.kpiRecebidos && (
            <div key="kpiRecebidos" className="overflow-hidden">
            <ReportWidget {...wprops('kpiRecebidos')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Tickets recebidos</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold tracking-tight tabular-nums lg:text-lg">{relatorioStats.totalRecebidos}</p>
                        <DeltaBadge current={kpiAtual.recebidos} previous={kpiAnterior?.recebidos} />
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/30">
                      <TrendingUp aria-hidden="true" className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {visibleCards.kpiResolvidos && (
            <div key="kpiResolvidos" className="overflow-hidden">
            <ReportWidget {...wprops('kpiResolvidos')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Tickets resolvidos</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold tracking-tight tabular-nums lg:text-lg">{relatorioStats.totalResolvidos}</p>
                        <DeltaBadge current={kpiAtual.resolvidos} previous={kpiAnterior?.resolvidos} />
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-950/30">
                      <UserCheck aria-hidden="true" className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {visibleCards.kpiTaxa && (
            <div key="kpiTaxa" className="overflow-hidden">
            <ReportWidget {...wprops('kpiTaxa')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Taxa de resolução</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold tracking-tight tabular-nums lg:text-lg">{relatorioStats.taxaResolucao}%</p>
                        <DeltaBadge current={kpiAtual.taxaResolucao} previous={kpiAnterior?.taxaResolucao} />
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                      <Activity aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {visibleCards.kpiNps && (
            <div key="kpiNps" className="overflow-hidden">
            <ReportWidget {...wprops('kpiNps')}>
              <Card className="glass-card-elevated h-full gap-0 rounded-lg py-0">
                <CardContent className="flex h-full items-center px-2 py-1.5">
                  <div className="flex w-full items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">NPS Score</p>
                      <div className="flex items-baseline gap-2">
                        <p className={cn(
                          "text-base font-semibold tracking-tight tabular-nums lg:text-lg",
                          relatorioStats.npsScore >= 50 ? 'text-green-600' :
                          relatorioStats.npsScore >= 0 ? 'text-yellow-600' :
                          'text-red-600'
                        )}>
                          {relatorioStats.totalAvaliacoes > 0 ? relatorioStats.npsScore : '—'}
                        </p>
                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">{relatorioStats.totalAvaliacoes} avaliações</span>
                      </div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 dark:bg-rose-950/30">
                      <Star aria-hidden="true" className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {/* Atendimentos ao longo do tempo */}
            {visibleCards.volume && (
            <div key="volume" className="overflow-hidden">
            <ReportWidget {...wprops('volume')}>
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Atendimentos ao longo do tempo
                      </CardTitle>
                      <Select value={volumePeriod} onValueChange={setVolumePeriod}>
                        <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CHART_PERIOD_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 min-h-0 flex-1">
                    {volumeSerie.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <TrendingUp className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Sem dados no período</p>
                      </div>
                    ) : (
                      <div
                        className="h-full min-h-[144px] w-full"
                        role="img"
                        aria-label={`Gráfico de área com o volume de atendimentos ao longo do tempo, ${volumeSerie.length} pontos no período selecionado`}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={volumeSerie} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                            <defs>
                              <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F97316" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                            <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                            <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={chartTooltipItemStyle} labelStyle={chartTooltipItemStyle} />
                            <Area type="monotone" dataKey="count" name="Atendimentos" stroke="#F97316" strokeWidth={2} fill="url(#volFill)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Padrão horário por dia da semana */}
            {visibleCards.heatmap && (
            <div key="heatmap" className="overflow-hidden">
            <ReportWidget {...wprops('heatmap')}>
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Padrão horário por dia da semana
                      </CardTitle>
                      <Select value={heatmapPeriod} onValueChange={setHeatmapPeriod}>
                        <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CHART_PERIOD_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Atendimentos por hora. Clique num dia da legenda para ocultá-lo.</p>
                  </CardHeader>
                  <CardContent className="px-4 min-h-0 flex-1">
                    {heatmapData.max === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <Clock className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Sem dados no período</p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col gap-1">
                        {/* Legenda clicável no topo: com sete linhas sobrepostas,
                            isolar um dia é o que torna o gráfico legível. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-[10px] text-muted-foreground">
                          {DIAS_SEMANA_CURTOS.map((dia, di) => {
                            const oculto = diasOcultos.includes(dia)
                            return (
                              <button
                                key={dia}
                                type="button"
                                onClick={() => alternarDia(dia)}
                                aria-pressed={!oculto}
                                title={oculto ? `Mostrar ${dia}` : `Ocultar ${dia}`}
                                className={cn(
                                  'flex items-center gap-1 rounded px-1 transition-opacity hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                  oculto && 'opacity-40',
                                )}
                              >
                                <span
                                  className="h-2 w-2 rounded-[2px]"
                                  style={{ backgroundColor: DIAS_SEMANA_CORES[di] }}
                                />
                                {dia}
                              </button>
                            )
                          })}
                        </div>

                        <div
                          className="min-h-[144px] w-full flex-1"
                          role="img"
                          aria-label={`Gráfico de linhas com atendimentos por hora, uma linha por dia da semana. Pico de ${heatmapData.max} atendimentos em ${heatmapData.picoLabel}.`}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={heatmapData.serie} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                              <XAxis
                                dataKey="hora"
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                interval={1}
                              />
                              <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                              />
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: 'var(--popover)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                                labelStyle={{ color: 'var(--foreground)' }}
                                itemStyle={{ color: 'var(--foreground)' }}
                              />
                              {DIAS_SEMANA_CURTOS.map((dia, di) => (
                                diasOcultos.includes(dia) ? null : (
                                  <Line
                                    key={dia}
                                    type="monotone"
                                    dataKey={dia}
                                    stroke={DIAS_SEMANA_CORES[di]}
                                    strokeWidth={2}
                                    dot={{ r: 2, strokeWidth: 0, fill: DIAS_SEMANA_CORES[di] }}
                                    activeDot={{ r: 4 }}
                                  />
                                )
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 text-[10px] text-muted-foreground">
                          <span>
                            Pico: <span className="font-medium text-foreground">{heatmapData.max}</span> em {heatmapData.picoLabel}
                          </span>
                          {heatmapData.foraDaFaixa > 0 && (
                            <span title={`Atendimentos fora da faixa de ${HORA_INICIO_GRAFICO}h–${HORA_FIM_GRAFICO}h exibida no gráfico`}>
                              +{heatmapData.foraDaFaixa} fora de {HORA_INICIO_GRAFICO}h–{HORA_FIM_GRAFICO}h
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Saúde da fila — quantos clientes passaram do limite no período */}
            {visibleCards.saudeFila && (
            <div key="saudeFila" className="overflow-hidden">
            <ReportWidget {...wprops('saudeFila')}>
              <Card className="glass-card-elevated flex h-full flex-col rounded-lg py-4">
                <CardHeader className="px-4 pb-1.5">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                    Saúde da fila
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Fila a partir de {LIMITE_FILA_MIN} min · SLA em {LIMITE_SLA_MIN} min.
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3 px-4">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('text-2xl font-semibold tabular-nums', TOM_SAUDE[faixaDeSaude(resumoFilaPeriodo.saudePercentual)].texto)}>
                        {resumoFilaPeriodo.saudePercentual}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {resumoFilaPeriodo.dentroDoSla} de {resumoFilaPeriodo.total} no SLA
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', TOM_SAUDE[faixaDeSaude(resumoFilaPeriodo.saudePercentual)].barra)}
                        style={{ width: `${resumoFilaPeriodo.saudePercentual}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="text-xl font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                        {resumoFilaPeriodo.entraramNaFila}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Entraram na fila
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="text-xl font-semibold tabular-nums text-foreground">
                        {resumoFilaPeriodo.picoSimultaneo}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Pico simultâneo</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">
                      {resumoFilaPeriodo.acimaDoSla}
                    </span>
                    {' '}passaram do SLA de {LIMITE_SLA_MIN} min.
                  </p>
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {/* Maior espera do período */}
            {visibleCards.maiorEspera && (
            <div key="maiorEspera" className="overflow-hidden">
            <ReportWidget {...wprops('maiorEspera')}>
              <Card className="glass-card-elevated flex h-full flex-col rounded-lg py-4">
                <CardHeader className="px-4 pb-1.5">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                    Maior espera do período
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Da criação até a primeira resposta.
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-center gap-2 px-4">
                  {resumoFilaPeriodo.maiorEspera ? (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                          {formatarEsperaLonga(resumoFilaPeriodo.maiorEspera.esperaMs)}
                        </p>
                        {resumoFilaPeriodo.maiorEspera.emAndamento && (
                          <Badge variant="outline" className="h-5 border-red-500/40 px-1.5 text-[10px] text-red-600 dark:text-red-400">
                            ainda esperando
                          </Badge>
                        )}
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex gap-2">
                          <dt className="font-medium text-foreground">Ticket:</dt>
                          <dd className="text-muted-foreground tabular-nums">
                            {resumoFilaPeriodo.maiorEspera.ticket ?? '—'}
                          </dd>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <dt className="shrink-0 font-medium text-foreground">Cliente:</dt>
                          <dd className="truncate text-muted-foreground">
                            {resumoFilaPeriodo.maiorEspera.cliente || 'Cliente desconhecido'}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-medium text-foreground">Entrada:</dt>
                          <dd className="text-muted-foreground tabular-nums">
                            {resumoFilaPeriodo.maiorEspera.entradaISO
                              ? new Date(resumoFilaPeriodo.maiorEspera.entradaISO).toLocaleString('pt-BR')
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum atendimento no período selecionado.
                    </p>
                  )}
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {/* SLA de 1ª resposta */}
            {visibleCards.sla && (
            <div key="sla" className="overflow-hidden">
            <ReportWidget {...wprops('sla')}>
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Timer className="h-3.5 w-3.5" />
                      SLA de 1ª resposta
                    </CardTitle>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold tracking-tight tabular-nums">{relatorioStats.slaDentroDaMeta}%</span>
                      <span className="text-xs text-muted-foreground">respondidos em até 15 min</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 min-h-0 flex-1">
                    <div
                      className="h-full min-h-[128px] w-full"
                      role="img"
                      aria-label={`Gráfico de barras do SLA de 1ª resposta. ${relatorioStats.slaDentroDaMeta}% respondidos em até 15 minutos`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={relatorioStats.slaBuckets} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="faixa" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                          <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                          <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={chartTooltipItemStyle} labelStyle={chartTooltipItemStyle} cursor={{ fill: 'color-mix(in oklch, var(--muted) 40%, transparent)' }} />
                          <Bar dataKey="count" name="Tickets" radius={[6, 6, 0, 0]}>
                            {relatorioStats.slaBuckets.map((_: any, i: number) => (
                              <Cell key={i} fill={SLA_COLORS[i % SLA_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Satisfação (NPS) */}
            {visibleCards.nps && (
            <div key="nps" className="overflow-hidden">
            <ReportWidget {...wprops('nps')}>
                <Card className="glass-card-elevated rounded-lg py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="h-3.5 w-3.5" />
                      Satisfação (NPS)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    {relatorioStats.totalAvaliacoes === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <Star className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Nenhuma avaliação no período</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-[144px] w-[144px] shrink-0 relative"
                          role="img"
                          aria-label={`Gráfico de pizza de satisfação NPS. NPS ${relatorioStats.satisfacao.nps}, com ${relatorioStats.satisfacao.promotores} promotores, ${relatorioStats.satisfacao.neutros} neutros e ${relatorioStats.satisfacao.detratores} detratores`}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Promotores', value: relatorioStats.satisfacao.promotores },
                                  { name: 'Neutros', value: relatorioStats.satisfacao.neutros },
                                  { name: 'Detratores', value: relatorioStats.satisfacao.detratores },
                                ]}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={44}
                                outerRadius={64}
                                paddingAngle={2}
                              >
                                <Cell fill="#22C55E" />
                                <Cell fill="#EAB308" />
                                <Cell fill="#EF4444" />
                              </Pie>
                              <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={chartTooltipItemStyle} labelStyle={chartTooltipItemStyle} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-semibold tracking-tight tabular-nums">{relatorioStats.satisfacao.nps}</span>
                            <span className="text-[10px] text-muted-foreground">NPS</span>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <p className="text-xs text-muted-foreground">Média: <span className="font-medium text-foreground">{relatorioStats.satisfacao.media.toFixed(1)}</span> · {relatorioStats.totalAvaliacoes} avaliações</p>
                          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" /> Promotores <span className="text-muted-foreground">({relatorioStats.satisfacao.promotores})</span></div>
                          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#EAB308]" /> Neutros <span className="text-muted-foreground">({relatorioStats.satisfacao.neutros})</span></div>
                          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> Detratores <span className="text-muted-foreground">({relatorioStats.satisfacao.detratores})</span></div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Por canal */}
            {visibleCards.canal && (
            <div key="canal" className="overflow-hidden">
            <ReportWidget {...wprops('canal')}>
                <Card className="glass-card-elevated rounded-lg py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5" />
                      Por canal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    {relatorioStats.porCanal.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">Sem dados</p>
                    ) : (
                      <div className="space-y-2">
                        {relatorioStats.porCanal.map((item: { canal: string; count: number }, i: number) => (
                          <div key={item.canal} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium capitalize">{item.canal}</span>
                              <span className="text-muted-foreground tabular-nums">{item.count}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                              <div className="h-full rounded-sm transition-all" style={{ width: `${Math.round((item.count / relatorioStats.totalRecebidos) * 100)}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Por status/resultado */}
            {visibleCards.status && (
            <div key="status" className="overflow-hidden">
            <ReportWidget {...wprops('status')}>
                <Card className="glass-card-elevated rounded-lg py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5" />
                      Por resultado
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    {relatorioStats.porStatus.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">Sem dados</p>
                    ) : (
                      <div className="space-y-2">
                        {relatorioStats.porStatus.map((item: { status: string; count: number }, i: number) => (
                          <div key={item.status} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{item.status}</span>
                              <span className="text-muted-foreground tabular-nums">{item.count}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                              <div className="h-full rounded-sm transition-all" style={{ width: `${Math.round((item.count / relatorioStats.totalRecebidos) * 100)}%`, backgroundColor: PIE_COLORS[(i + 2) % PIE_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Transferências & transbordos */}
            {visibleCards.roteamento && (
            <div key="roteamento" className="overflow-hidden">
            <ReportWidget {...wprops('roteamento')}>
                <Card className="glass-card-elevated flex h-full flex-col rounded-lg py-4">
                  <CardHeader className="px-4 pb-1.5">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
                      Transferências &amp; transbordos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Transferidos</span>
                      <span className="text-sm font-semibold">{roteamentoStats.transferidos} <span className="text-muted-foreground font-normal">({roteamentoStats.pctTransferidos}%)</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Transbordos</span>
                      <span className="text-sm font-semibold">{roteamentoStats.transbordos} <span className="text-muted-foreground font-normal">({roteamentoStats.pctTransbordos}%)</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Saltos médios (hops)</span>
                      <span className="text-sm font-semibold">{roteamentoStats.hopsMedio}</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto border-t pt-2" aria-live="polite">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">Origem das entradas</span>
                        {!origensRoteamentoCarregando && !entradasRoteamentoError && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {resumoOrigensRoteamento.totalEntradas} no período
                          </span>
                        )}
                      </div>
                      {origensRoteamentoCarregando ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                          Carregando origens…
                        </div>
                      ) : entradasRoteamentoError ? (
                        <p className="py-3 text-xs text-muted-foreground">
                          Não foi possível carregar as origens. Atualize a página para tentar novamente.
                        </p>
                      ) : resumoOrigensRoteamento.totalEntradas === 0 ? (
                        <p className="py-3 text-xs text-muted-foreground">
                          Nenhuma entrada por roteamento no período.
                        </p>
                      ) : (
                        <div className="mt-2 overflow-hidden rounded-md border">
                          <Table className="table-fixed text-xs">
                            <caption className="sr-only">Origens das entradas roteadas no período</caption>
                            <TableHeader className="bg-muted/40">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 w-[46%] px-2 text-[10px] uppercase">Origem</TableHead>
                                <TableHead className="h-8 px-2 text-right text-[10px] uppercase">Entrada</TableHead>
                                <TableHead className="h-8 px-2 text-right text-[10px] uppercase">Transb.</TableHead>
                                <TableHead className="h-8 px-2 text-right text-[10px] uppercase">Transf.</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {resumoOrigensRoteamento.origens.map((origem) => (
                                <TableRow key={origem.id}>
                                  <TableCell className="px-2 py-1.5 font-medium">
                                    <span className="block truncate" title={origem.nome}>{origem.nome}</span>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 text-right tabular-nums">{origem.quantidade}</TableCell>
                                  <TableCell className="px-2 py-1.5 text-right tabular-nums">{origem.transbordos}</TableCell>
                                  <TableCell className="px-2 py-1.5 text-right tabular-nums">{origem.transferencias}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Tickets por atendente */}
            {visibleCards.rankAtendente && (
            <div key="rankAtendente" className="overflow-hidden">
            <ReportWidget {...wprops('rankAtendente')}>
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
              <CardHeader className="px-4 pb-1.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Tickets por atendente
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 min-h-0 flex-1">
                {relatorioStats.ticketsPorAtendente.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Users className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento registrado</p>
                  </div>
                ) : (
                  <div className="space-y-2 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorAtendente.map((atendente: { id: string | null; nome: string; count: number; avgPrimeiraRespostaMs: number | null }, index: number) => {
                      const npsEntry = atendente.id ? mediaNPSPorColaborador.get(atendente.id) : undefined
                      const mediaNota = npsEntry && npsEntry.total > 0 ? (npsEntry.soma / npsEntry.total).toFixed(1) : null
                      return (
                      <div key={atendente.id || atendente.nome} className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{atendente.nome}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{atendente.count} tickets</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-sm transition-all"
                              style={{ width: `${Math.min(100, (atendente.count / Math.max(...relatorioStats.ticketsPorAtendente.map((a: { count: number }) => a.count))) * 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1" title="Tempo médio de 1ª resposta">
                              <Timer className="h-3 w-3" />{fmtDur(atendente.avgPrimeiraRespostaMs)}
                            </span>
                            {mediaNota && (
                              <span className="inline-flex items-center gap-1" title="Média de avaliação">
                                <Star className="h-3 w-3" />{mediaNota}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            </ReportWidget>
            </div>
            )}

            {/* Tickets por PDV */}
            {visibleCards.rankPDV && (
            <div key="rankPDV" className="overflow-hidden">
            <ReportWidget {...wprops('rankPDV')}>
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
              <CardHeader className="px-4 pb-1.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5" />
                  Tickets por PDV
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 min-h-0 flex-1">
                {relatorioStats.ticketsPorPDV.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Hash className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum dado de PDV encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-2 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorPDV.map((item: { pdv: string; count: number }, index: number) => (
                      <div key={item.pdv} className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/50 text-xs font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{item.pdv}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{item.count} tickets</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-sm transition-all"
                              style={{ width: `${Math.min(100, (item.count / Math.max(...relatorioStats.ticketsPorPDV.map((a: { count: number }) => a.count))) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </ReportWidget>
            </div>
            )}

            {/* Tickets por Tipo de Atendimento */}
            {visibleCards.rankTipo && (
            <div key="rankTipo" className="overflow-hidden">
            <ReportWidget {...wprops('rankTipo')}>
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
              <CardHeader className="px-4 pb-1.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" />
                  Tipos de Atendimento
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Principais motivos/produtos dos atendimentos encerrados no período.
                </p>
              </CardHeader>
              <CardContent className="px-4 min-h-0 flex-1">
                {relatorioStats.ticketsPorTipo.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Tag className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento classificado no período</p>
                  </div>
                ) : (
                  <div className="space-y-2 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorTipo.map((item: { tipo: string; count: number }, index: number) => (
                      <div key={item.tipo} className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/50 text-xs font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{item.tipo}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{item.count} tickets</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-sm transition-all"
                              style={{ width: `${Math.min(100, (item.count / Math.max(...relatorioStats.ticketsPorTipo.map((a: { count: number }) => a.count))) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </ReportWidget>
            </div>
            )}

            {/* Tipos de atendimento por técnico */}
            {visibleCards.matrizTipoTecnico && (
            <div key="matrizTipoTecnico" className="overflow-hidden">
            <ReportWidget {...wprops('matrizTipoTecnico')}>
              <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
                <CardHeader className="px-4 pb-1.5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Total por tipo, por técnico
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Quantos atendimentos de cada tipo cada atendente encerrou no período.
                  </p>
                </CardHeader>
                <CardContent className="px-4 min-h-0 flex-1">
                  {relatorioStats.tiposPorAtendente.length === 0 || relatorioStats.tiposColunas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Tag className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">Nenhum atendimento classificado no período</p>
                    </div>
                  ) : (
                    <div className="h-full overflow-auto rounded-lg border border-border/50">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                          <TableRow>
                            <TableHead className="text-xs font-medium pl-4 sticky left-0 bg-muted/80 z-20">Atendente</TableHead>
                            {relatorioStats.tiposColunas.map((tipo: string) => (
                              <TableHead key={tipo} className="text-xs font-medium text-center whitespace-nowrap">{tipo}</TableHead>
                            ))}
                            <TableHead className="text-xs font-medium text-center pr-4">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatorioStats.tiposPorAtendente.map((row: { nome: string; porTipo: Record<string, number>; total: number }, idx: number) => (
                            <TableRow key={`${row.nome}-${idx}`} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium pl-4 sticky left-0 bg-background z-10">{row.nome}</TableCell>
                              {relatorioStats.tiposColunas.map((tipo: string) => (
                                <TableCell key={tipo} className="text-sm text-center tabular-nums">
                                  {row.porTipo[tipo] ? row.porTipo[tipo] : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              ))}
                              <TableCell className="text-sm text-center font-semibold tabular-nums pr-4">{row.total}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ReportWidget>
            </div>
            )}

            {/* Últimos atendimentos */}
            {visibleCards.tabela && (
            <div key="tabela" className="overflow-hidden">
            <ReportWidget {...wprops('tabela')}>
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col py-4">
              <CardHeader className="px-4 pb-1.5">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Últimos atendimentos
                  </CardTitle>
                  <div className="relative w-72">
                    <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, telefone ou CNPJ..."
                      value={searchCliente}
                      onChange={(e) => setSearchCliente(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1.5 min-h-0 flex-1">
                {relatorioLoading && ticketsRelatorioRaw.length === 0 ? (
                  <div className="space-y-2 py-2" aria-busy="true" aria-label="Carregando atendimentos">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="skeleton h-4 w-16" />
                        <div className="skeleton h-4 flex-1" />
                        <div className="skeleton h-4 w-24" />
                        <div className="skeleton h-4 w-16" />
                        <div className="skeleton h-4 w-20" />
                      </div>
                    ))}
                  </div>
                ) : ticketsRelatorio.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <AlertCircle className="mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum ticket encontrado no período</p>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto rounded-lg border border-border/50">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                        <TableRow>
                          <TableHead scope="col" className="text-xs font-medium pl-4">Ticket</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Cliente</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Atendente</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Tipo</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Origem</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Status</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">NPS</TableHead>
                          <TableHead scope="col" className="text-xs font-medium">Data</TableHead>
                          <TableHead scope="col" className="text-xs font-medium w-[60px] pr-4">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ticketsRelatorio.map((ticket: any) => (
                          <TableRow key={ticket.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs pl-4">#{ticket.numero}</TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[140px]">{ticket.clientes?.nome || ticket.clientes?.telefone || 'Desconhecido'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{ticket.colaboradores?.nome || '-'}</TableCell>
                            <TableCell className="text-xs">
                              {ticket.tipos_atendimento?.nome ? (
                                <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                                  {ticket.tipos_atendimento.nome}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell><OrigemBadge origem={origensMap.get(ticket.id)} setorAtualNome={setor?.nome} compact /></TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] whitespace-nowrap',
                                  ticketStatusBadgeClass(ticket.status),
                                )}
                              >
                                {formatTicketStatusCurto(ticket.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              {ticket.avaliacoes?.[0]?.nota != null ? (
                                <span className={cn(
                                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white',
                                  ticket.avaliacoes[0].nota >= 9 ? 'bg-green-500' :
                                  ticket.avaliacoes[0].nota >= 7 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                )}>
                                  {ticket.avaliacoes[0].nota}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {ticket.criado_em ? new Date(ticket.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </TableCell>
                            <TableCell className="pr-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openConversation(ticket)}
                                aria-label={`Abrir conversa do ticket ${ticket.numero ? `#${ticket.numero}` : ''}`.trim()}
                                title="Abrir conversa"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
          </Card>
            </ReportWidget>
            </div>
            )}

            </ResponsiveReactGridLayout>
        </div>
      )}

      {/* Histórico por Cliente Section */}
      {activeSection === 'historico' && (
        <div className="space-y-6">
          <HistoricoClienteSection setorId={setorId} />
        </div>
      )}

      {/* Atendentes Section */}
      {activeSection === 'atendentes' && (
        <div className="space-y-4 anim-rise">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">Atendentes</h1>
            <Button onClick={openCreateAtendenteModal} size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Novo Atendente
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="space-y-2">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail"
                value={searchAtendente}
                onChange={(e) => {
                  setSearchAtendente(e.target.value)
                  setAttendantsPage(1)
                }}
                className="h-8 pl-9"
              />
            </div>
            {/* Mesmo estado (e mesma preferência salva) do filtro da aba
                Monitoramento — o subsetor escolhido vale para o setor todo. */}
            {(subsetorFiltroOptions.length > 1 || subsetorFilter.length > 0) && (
              <div className="max-w-md">
                <MultiSelectFilter
                  icon={Layers}
                  placeholder="Filtrar atendentes por subsetor"
                  header="Filtrar atendentes por subsetor"
                  pluralWord="subsetores"
                  options={subsetorFiltroOptions}
                  selected={subsetorFilter}
                  onChange={setSubsetorFilter}
                  open={secaoAtendentesSubsetorFiltroOpen}
                  onOpenChange={setSecaoAtendentesSubsetorFiltroOpen}
                  searchable
                />
              </div>
            )}
          </div>

          {/* Atendentes List */}
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                </Card>
              ))
            ) : atendentes.length === 0 ? (
              <Card className="glass-card-elevated rounded-lg p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold tracking-tight">Nenhum atendente cadastrado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Adicione atendentes para começar a receber tickets neste setor.
                  </p>
                  <Button onClick={openCreateAtendenteModal} size="sm" className="mt-3 gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar atendente
                  </Button>
                </div>
              </Card>
            ) : filteredManagementAttendants.length === 0 ? (
              <Card className="glass-card-elevated rounded-lg p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <Search className="mb-2 h-6 w-6 text-muted-foreground" />
                  <h3 className="font-semibold tracking-tight">Nenhum atendente encontrado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ajuste a busca ou os filtros para ver outros atendentes.
                  </p>
                </div>
              </Card>
            ) : (
              paginatedManagementAttendants.map((atendente: any) => {
                const initials = atendente.nome
                  ?.split(' ')
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'AT'
                // Mesma contagem da aba Atendentes do monitoramento — contar
                // aqui à parte ignorava o filtro de subsetor (que é compartilhado
                // pelas duas telas) e o mesmo atendente aparecia com números
                // diferentes em cada uma.
                const ticketsDoAtendente = activeTicketCountByAttendant.get(atendente.id) || 0

                return (
                  <Card key={atendente.id} className="rounded-lg py-4 transition-colors hover:border-[var(--border-strong)]">
                    <CardContent className="px-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white",
                          atendente.is_online ? "bg-primary" : "bg-gray-400"
                        )}>
                          {initials}
                        </div>

                        {/* Info Grid */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                          {/* Nome */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Atendente</p>
                            <p className="font-medium truncate">{atendente.nome}</p>
                          </div>

                          {/* Email */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">E-mail</p>
                            <p className="text-sm text-primary truncate">{atendente.email}</p>
                            {(() => {
                              const npsData = mediaNPSPorColaborador.get(atendente.id)
                              const mediaNPS = npsData ? npsData.soma / npsData.total : 0
                              const total = npsData?.total || 0
                              return (
                                <div className="flex items-center gap-1 text-xs mt-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                  <span className={cn(
                                    'font-semibold',
                                    mediaNPS >= 9 ? 'text-green-600' : mediaNPS >= 7 ? 'text-yellow-600' : 'text-red-600'
                                  )}>
                                    {mediaNPS.toFixed(1)}
                                  </span>
                                  <span className="text-muted-foreground">({total} {total === 1 ? 'avaliação' : 'avaliações'})</span>
                                </div>
                              )
                            })()}
                          </div>

                          {/* Tag de setor — a operação do atendente neste canal */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Tag de setor</p>
                            <TagSetorDoAtendente
                              atendenteId={atendente.id}
                              atendenteNome={atendente.nome}
                              tagAtualId={atendente.tag_setor_id}
                              tags={tagsSetorList}
                              setorId={setorId}
                              podeEditar={podeEditarTagSetor}
                              onSalvo={mutate}
                            />
                          </div>

                          {/* Filas/Setor */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Setor / Subsetor</p>
                            <p className="text-sm truncate">
                              {setor?.nome}
                            </p>
                            {atendente.subsetor_nomes?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {atendente.subsetor_nomes.map((nome: string, i: number) => (
                                  <span key={i} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                    {nome}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Tickets Simultâneos */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Tickets em atendimento</p>
                            <p className="text-sm font-medium tabular-nums">{ticketsDoAtendente}</p>
                          </div>
                        </div>

                        {/* Status Badge + Trocar Status */}
                        <div className="hidden lg:flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {(() => {
                                // Mesmo critério estrito do monitoramento: heartbeat fresco + sem pausa
                                const reallyOnline = isAtendenteOnline(atendente)
                                return (
                                  <div className={cn(
                                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 select-none",
                                    reallyOnline
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      : atendente.pausa_atual_id
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                  )}>
                                    {alterandoStatusId === atendente.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <span className={cn("h-1.5 w-1.5 rounded-full", reallyOnline ? "bg-green-500" : atendente.pausa_atual_id ? "bg-amber-500" : "bg-gray-400")} />
                                    }
                                    {reallyOnline ? 'Online' : atendente.pausa_atual_id ? 'Pausa' : 'Offline'}
                                  </div>
                                )
                              })()}
                            </DropdownMenuTrigger>
                            {/* Esta aba fica só no online/offline — o controle de
                                pausa mora em Monitoramento → Atendentes, onde o
                                estado da pausa está à vista com o cronômetro. */}
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                disabled={atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => pedirDisponibilidade(
                                  atendente,
                                  ticketsDoAtendente,
                                  'marcar como online',
                                  () => handleAlterarStatusAtendente(atendente.id, 'online'),
                                )}
                                className="gap-2"
                              >
                                <CircleCheck className="h-3.5 w-3.5 text-green-500" />
                                Marcar como Online
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => pedirDisponibilidade(
                                  atendente,
                                  ticketsDoAtendente,
                                  'marcar como offline',
                                  () => handleAlterarStatusAtendente(atendente.id, 'offline'),
                                )}
                                className="gap-2"
                              >
                                <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                                Marcar como Offline
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {/* Status mobile */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="lg:hidden"
                                disabled={alterandoStatusId === atendente.id}
                                aria-label={`Alterar status de ${atendente.nome}`}
                                title="Alterar status"
                              >
                                {alterandoStatusId === atendente.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <MoreHorizontal className="h-3.5 w-3.5" />
                                }
                              </Button>
                            </DropdownMenuTrigger>
                            {/* Esta aba fica só no online/offline — o controle de
                                pausa mora em Monitoramento → Atendentes, onde o
                                estado da pausa está à vista com o cronômetro. */}
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                disabled={atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => pedirDisponibilidade(
                                  atendente,
                                  ticketsDoAtendente,
                                  'marcar como online',
                                  () => handleAlterarStatusAtendente(atendente.id, 'online'),
                                )}
                                className="gap-2"
                              >
                                <CircleCheck className="h-3.5 w-3.5 text-green-500" />
                                Marcar como Online
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => pedirDisponibilidade(
                                  atendente,
                                  ticketsDoAtendente,
                                  'marcar como offline',
                                  () => handleAlterarStatusAtendente(atendente.id, 'offline'),
                                )}
                                className="gap-2"
                              >
                                <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                                Marcar como Offline
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditAtendenteModal(atendente)}
                            aria-label={`Editar atendente ${atendente.nome}`}
                            title="Editar atendente"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteConfirm({ id: atendente.id, nome: atendente.nome })}
                            aria-label={`Excluir atendente ${atendente.nome}`}
                            title="Excluir atendente"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {filteredManagementAttendants.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Resultados por página:</span>
                <Select
                  value={String(attendantsPageSize)}
                  onValueChange={(value) => escolherPageSize(
                    value,
                    setAttendantsPageSize,
                    () => setAttendantsPage(1),
                    ATENDENTES_PAGE_SIZE_STORAGE_KEY,
                  )}
                >
                  <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Resultados por página de atendentes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((tamanho) => (
                      <SelectItem key={tamanho} value={String(tamanho)}>{tamanho}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span aria-live="polite">
                  {attendantsRangeStart}-{attendantsRangeEnd} de {filteredManagementAttendants.length}
                </span>
                <div className="flex items-center gap-0.5 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setAttendantsPage(1)}
                    disabled={safeAttendantsPage <= 1}
                    aria-label="Primeira página"
                    title="Primeira página"
                  >
                    <ChevronFirst className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setAttendantsPage(Math.max(1, safeAttendantsPage - 1))}
                    disabled={safeAttendantsPage <= 1}
                    aria-label="Página anterior"
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="px-2" aria-label={`Página ${safeAttendantsPage} de ${attendantsTotalPages}`}>
                    {safeAttendantsPage}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setAttendantsPage(Math.min(attendantsTotalPages, safeAttendantsPage + 1))}
                    disabled={safeAttendantsPage >= attendantsTotalPages}
                    aria-label="Próxima página"
                    title="Próxima página"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setAttendantsPage(attendantsTotalPages)}
                    disabled={safeAttendantsPage >= attendantsTotalPages}
                    aria-label="Última página"
                    title="Última página"
                  >
                    <ChevronLast className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Sobre atendentes em múltiplos setores</p>
              <p className="mt-1">
                Um atendente pode estar cadastrado em mais de um setor. Nesse caso, ele receberá
                tickets de todos os setores em que estiver vinculado ao acessar o WorkDesk.
              </p>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Horários Section */}
    {activeSection === 'horarios' && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Horários de Atendimento</h1>
            <p className="text-sm text-muted-foreground">
              Defina quais dias e horários seus atendentes estarão disponíveis
            </p>
          </div>
          <Button onClick={saveHorarios} disabled={saving} size="sm">
            {saving ? 'Salvando...' : 'Salvar Horários'}
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-lg py-4">
          <CardContent className="px-4">
            <div className="space-y-2">
              {DIAS_SEMANA.map((dia) => {
                const horario = horariosEdit.find((h) => h.dia_semana === dia.value)
                return (
                  <div
                    key={dia.value}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      horario?.ativo ? 'bg-card' : 'bg-muted/50'
                    )}
                  >
                    <Switch
                      checked={horario?.ativo || false}
                      onCheckedChange={(checked) =>
                        updateHorario(dia.value, 'ativo', checked)
                      }
                    />
                    <span className="w-36 text-sm font-medium">{dia.label}</span>
                    {horario?.ativo ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={horario?.hora_inicio || '08:00'}
                          onChange={(e) =>
                            updateHorario(dia.value, 'hora_inicio', e.target.value)
                          }
                          className="h-8 w-32"
                        />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={horario?.hora_fim || '18:00'}
                          onChange={(e) =>
                            updateHorario(dia.value, 'hora_fim', e.target.value)
                          }
                          className="h-8 w-32"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fechado</span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    {/* Pausas Section */}
    {activeSection === 'pausas' && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Pausas</h1>
            <p className="text-sm text-muted-foreground">
              Configure os tipos de pausas disponíveis para os atendentes
            </p>
          </div>
          <Button onClick={openNewPausa} size="sm">
            <Coffee className="mr-1.5 h-3.5 w-3.5" />
            Nova Pausa
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-lg py-4">
          <CardContent className="p-0">
            {pausas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Coffee className="mb-3 h-9 w-9 text-muted-foreground/30" />
                <h3 className="font-medium tracking-tight">Nenhuma pausa cadastrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie pausas para que os atendentes possam usar durante o expediente
                </p>
                <Button onClick={openNewPausa} size="sm" className="mt-3">
                  Criar primeira pausa
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px] text-center">Status</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pausas.map((pausa) => (
                    <TableRow key={pausa.id}>
                      <TableCell className="font-medium">{pausa.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {pausa.descricao || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={pausa.ativo}
                          onCheckedChange={() => togglePausaAtivo(pausa)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Abrir ações da pausa ${pausa.nome}`}
                              title="Ações da pausa"
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditPausa(pausa)}>
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deletePausa(pausa.id)}
                              className="text-destructive"
                            >
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    )}

    {/* Configurações Section */}
    {activeSection === 'configuracoes' && (
      <div className="space-y-4 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:py-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-header]]:gap-1 [&_[data-slot=card-header]]:px-4 [&_[data-slot=card-header]]:pb-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configurações do Setor</h1>
          <p className="text-sm text-muted-foreground">
            Personalize as informações e aparência do setor
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Basic info */}
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Setor</Label>
                <Input
                  id="nome"
                  className="h-8"
                  value={configForm.nome}
                  onChange={(e) =>
                    setConfigForm((prev) => ({ ...prev, nome: e.target.value }))
                  }
                  placeholder="Ex: Suporte Técnico"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={configForm.descricao}
                  onChange={(e) =>
                    setConfigForm((prev) => ({ ...prev, descricao: e.target.value }))
                  }
                  placeholder="Descreva as responsabilidades deste setor..."
                  rows={3}
                />
              </div>

              {tagsList.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Tag de origem
                  </Label>
                  <Select
                    value={configForm.tag_id || 'none'}
                    onValueChange={(v) =>
                      setConfigForm((prev) => ({ ...prev, tag_id: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Selecionar tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem tag</SelectItem>
                      {tagsList.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: tag.cor }}
                            />
                            {tag.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    De onde vem a operação: Matriz, Filial, PEV, Franquias, Internos.
                  </p>
                </div>
              )}

              {/* Tags de setor deste canal — as operações que convivem dentro
                  dele (Suporte Chat, Pit Stop, ...). A tag marca o ATENDENTE, na
                  aba Atendentes; aqui é só o cadastro. */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Tags de setor
                </Label>
                <div className="rounded-lg border border-border p-3 space-y-3">
                  {tagsSetorList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma tag cadastrada neste canal.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tagsSetorList.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
                          style={{ borderColor: tag.cor, color: tag.cor }}
                        >
                          {tag.nome}
                        </span>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTagsSetorDialogOpen(true)}
                  >
                    <Layers className="mr-2 h-3.5 w-3.5" />
                    Gerenciar tags de setor
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Separam as operações dentro deste canal. Cada atendente recebe
                    uma na aba Atendentes, e ela recorta as métricas e o que o
                    gestor da operação enxerga.
                  </p>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Aparencia - Preview + Cor + Icone compacto */}
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle>Aparencia do Setor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preview inline */}
              <div className="flex items-center gap-3 rounded-md bg-muted/50 p-2.5">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: configForm.cor }}
                >
                  <IconComponent className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold">{configForm.nome || 'Nome do Setor'}</h3>
                  <p className="text-xs text-muted-foreground">
                    {configForm.descricao || 'Descricao do setor'}
                  </p>
                </div>
              </div>

              {/* Colors inline */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() =>
                        setConfigForm((prev) => ({ ...prev, cor: color.value }))
                      }
                      className={cn(
                        'h-8 w-8 rounded-full border-2 transition-all',
                        configForm.cor === color.value
                          ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20'
                          : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Icons compact grid */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Icone</Label>
                <div className="grid grid-cols-8 gap-1.5">
                  {AVAILABLE_ICONS.map((iconItem) => (
                    <button
                      key={iconItem.name}
                      onClick={() =>
                        setConfigForm((prev) => ({ ...prev, icon_url: iconItem.name }))
                      }
                      className={cn(
                        'flex h-8 w-full items-center justify-center rounded-md border transition-all',
                        configForm.icon_url === iconItem.name
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-transparent hover:bg-muted text-muted-foreground'
                      )}
                      title={iconItem.name}
                    >
                      <iconItem.icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Setores de Atendimento */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Roteamento de Atendimento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure para qual setor cada tipo de atendimento sera redirecionado quando identificado pelo bot.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { key: 'suporte', label: 'Suporte Tecnico', icon: Headphones, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', desc: 'Duvidas tecnicas e problemas com o sistema' },
              { key: 'comercial', label: 'Comercial', icon: ShoppingCart, color: 'bg-green-500/10 text-green-600 dark:text-green-400', desc: 'Vendas, propostas e negociacoes' },
              { key: 'financeiro', label: 'Financeiro', icon: CreditCard, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', desc: 'Boletos, pagamentos e notas fiscais' },
              { key: 'ouvidoria', label: 'Ouvidoria', icon: MessageCircle, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', desc: 'Reclamacoes, sugestoes e elogios' },
              { key: 'implantacao', label: 'Implantacao', icon: Rocket, color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', desc: 'Onboarding e configuracao inicial' },
            ].map((tipo) => {
              const IconComponent = tipo.icon
              const selectedSetor = todosSetores.find(s => s.id === tiposAtendimentoSetor[tipo.key])
              return (
                <div key={tipo.key} className="flex flex-col gap-2 rounded-md border bg-card p-2.5 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:gap-3">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", tipo.color)}>
                    <IconComponent aria-hidden="true" className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tipo.label}</span>
                      {selectedSetor && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedSetor.nome}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tipo.desc}</p>
                  </div>
                  <Select
                    value={tiposAtendimentoSetor[tipo.key] || 'none'}
                    onValueChange={(value) => {
                      setTiposAtendimentoSetor((prev) => ({ ...prev, [tipo.key]: value === 'none' ? null : value }))
                      setHasUnsavedTipos(true)
                    }}
                  >
                    <SelectTrigger aria-label={`Destino de roteamento para ${tipo.label}`} className="h-8 w-full text-xs sm:w-[170px]">
                      <SelectValue placeholder="Selecionar setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">Nenhum</span>
                      </SelectItem>
                      {todosSetores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Classificação de Atendimento */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Classificação de Atendimento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cadastre os tipos de atendimento deste setor. Ao encerrar um chat no workdesk, o atendente deverá escolher uma destas classificações.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Adicionar nova classificação */}
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder="Ex: Dúvida, Reclamação, Instalação..."
                value={novaClassificacao}
                onChange={(e) => setNovaClassificacao(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addClassificacao()
                  }
                }}
                maxLength={60}
              />
              <Button size="sm" onClick={addClassificacao} disabled={savingClassificacao || !novaClassificacao.trim()}>
                {savingClassificacao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span className="ml-1 hidden sm:inline">Adicionar</span>
              </Button>
            </div>

            {/* Lista de classificações */}
            {classificacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma classificação cadastrada para este setor.
              </p>
            ) : (
              <div className="space-y-2">
                {classificacoes.map((tipo) => (
                  <div
                    key={tipo.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {editingClassificacaoId === tipo.id ? (
                      <>
                        <Input
                          value={editingClassificacaoNome}
                          onChange={(e) => setEditingClassificacaoNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEditingClassificacao()
                            } else if (e.key === 'Escape') {
                              setEditingClassificacaoId(null)
                              setEditingClassificacaoNome('')
                            }
                          }}
                          autoFocus
                          maxLength={60}
                          className="flex-1 h-8"
                        />
                        <Button size="sm" onClick={saveEditingClassificacao} disabled={!editingClassificacaoNome.trim()}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingClassificacaoId(null)
                            setEditingClassificacaoNome('')
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={cn('flex-1 font-medium', !tipo.ativo && 'text-muted-foreground line-through')}>
                          {tipo.nome}
                        </span>
                        {!tipo.ativo && (
                          <Badge variant="secondary" className="text-xs">Inativo</Badge>
                        )}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={tipo.ativo}
                            onCheckedChange={() => toggleClassificacaoAtivo(tipo)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingClassificacaoId(tipo.id)
                              setEditingClassificacaoNome(tipo.nome)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover classificação?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja remover &quot;{tipo.nome}&quot;? Atendimentos já encerrados com este tipo manterão o registro.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteClassificacao(tipo.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Row 1: Subsetores + Tempo de Espera */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Subsetores */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Subsetores
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie subsetores para organizar e direcionar atendimentos de forma mais especifica.
                </p>
              </div>
              <Button size="sm" onClick={openCreateSubsetor}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Novo Subsetor
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
              {subsetores.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum subsetor cadastrado</p>
              ) : (
                <div className="overflow-y-auto h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descricao</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subsetores.map((subsetor) => (
                        <TableRow key={subsetor.id}>
                          <TableCell className="font-medium">{subsetor.nome}</TableCell>
                          <TableCell className="text-muted-foreground">{subsetor.descricao || '-'}</TableCell>
                          <TableCell>
                            <Switch
                              checked={subsetor.ativo}
                              onCheckedChange={() => toggleSubsetorAtivo(subsetor)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditSubsetor(subsetor)}
                                aria-label={`Editar subsetor ${subsetor.nome}`}
                                title="Editar subsetor"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => deleteSubsetor(subsetor.id)}
                                disabled={deletingSubsetorId === subsetor.id}
                                className="text-destructive hover:text-destructive"
                                aria-label={`Excluir subsetor ${subsetor.nome}`}
                                title="Excluir subsetor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tempo de Espera */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle>Tempo de Espera do Ticket</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tempo maximo (em minutos) sem resposta do cliente. Apos esse tempo, o ticket ficara destacado em laranja no workdesk.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="tempo_espera_minutos">Minutos</Label>
                  <Input
                    id="tempo_espera_minutos"
                    className="h-8"
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="10"
                    value={configForm.tempo_espera_minutos}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, tempo_espera_minutos: parseInt(e.target.value) || 10 }))}
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <div className="h-4 w-4 rounded-full bg-amber-500" />
                  <span className="text-sm text-muted-foreground">Destaque apos {configForm.tempo_espera_minutos} min sem resposta</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer aria-hidden="true" className="h-5 w-5" />
              Status dos atendimentos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina quando um ticket aberto passa de Normal para Atenção e depois para Crítico no monitoramento.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="atendimento_status_atencao_minutos">Atenção após (minutos)</Label>
                <Input
                  id="atendimento_status_atencao_minutos"
                  ref={statusAtencaoInputRef}
                  name="atendimento_status_atencao_minutos"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={MIN_ATENDIMENTO_STATUS_MINUTOS}
                  max={MAX_ATENDIMENTO_STATUS_MINUTOS}
                  value={configForm.atendimento_status_atencao_minutos}
                  onChange={(event) => {
                    const minutes = Number.parseInt(event.target.value, 10)
                    setConfigForm((prev) => ({
                      ...prev,
                      atendimento_status_atencao_minutos: Number.isNaN(minutes)
                        ? DEFAULT_ATENCAO_MINUTOS
                        : Math.min(MAX_ATENDIMENTO_STATUS_MINUTOS, Math.max(MIN_ATENDIMENTO_STATUS_MINUTOS, minutes)),
                    }))
                  }}
                />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
                  Exibe Atenção a partir de {configForm.atendimento_status_atencao_minutos} min.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="atendimento_status_critico_minutos">Crítico após (minutos)</Label>
                <Input
                  id="atendimento_status_critico_minutos"
                  name="atendimento_status_critico_minutos"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={MIN_ATENDIMENTO_STATUS_MINUTOS}
                  max={MAX_ATENDIMENTO_STATUS_MINUTOS}
                  value={configForm.atendimento_status_critico_minutos}
                  onChange={(event) => {
                    const minutes = Number.parseInt(event.target.value, 10)
                    setConfigForm((prev) => ({
                      ...prev,
                      atendimento_status_critico_minutos: Number.isNaN(minutes)
                        ? DEFAULT_CRITICO_MINUTOS
                        : Math.min(MAX_ATENDIMENTO_STATUS_MINUTOS, Math.max(MIN_ATENDIMENTO_STATUS_MINUTOS, minutes)),
                    }))
                  }}
                />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-500" />
                  Exibe Crítico a partir de {configForm.atendimento_status_critico_minutos} min.
                </p>
              </div>
            </div>

            {!isValidAtendimentoStatusThresholds({
              atencaoMinutos: configForm.atendimento_status_atencao_minutos,
              criticoMinutos: configForm.atendimento_status_critico_minutos,
            }) && (
              <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                O limite Crítico deve ser maior que o limite de Atenção.
              </p>
            )}

            {limitesStatusAtendimentoIndisponiveis && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Os limites continuarão no padrão até a migration deste ambiente ser executada.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              O cálculo considera o tempo total que o ticket está aberto, desde sua criação.
            </p>
          </CardContent>
        </Card>

        {/* Encerramento Automático por Inatividade */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle>Encerramento Automático por Inatividade</CardTitle>
            <p className="text-sm text-muted-foreground">
              Fecha automaticamente tickets em que o atendente foi quem respondeu por último e o cliente não retornou há X minutos. Tickets aguardando resposta do atendente nunca são fechados automaticamente. Tickets de disparo são ignorados.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Ativar encerramento automático</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, tickets inativos são encerrados a cada ciclo do sistema (a cada 2 minutos).
                </p>
              </div>
              <Switch
                checked={configForm.encerramento_auto_ativo}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, encerramento_auto_ativo: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>

            {configForm.encerramento_auto_ativo && (
              <div className="flex items-center gap-3 pl-2">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="encerramento_auto_minutos">Tempo sem retorno do cliente (minutos)</Label>
                  <Input
                    id="encerramento_auto_minutos"
                    className="h-8"
                    type="number"
                    min={15}
                    max={1440}
                    value={configForm.encerramento_auto_minutos}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10)
                      const v = Number.isNaN(parsed) ? 15 : Math.max(15, parsed)
                      setConfigForm((prev) => ({ ...prev, encerramento_auto_minutos: v }))
                      setHasUnsavedConfig(true)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 15 minutos.</p>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <div className="h-4 w-4 rounded-full bg-red-500" />
                  <span className="text-sm text-muted-foreground">
                    Fechamento após {configForm.encerramento_auto_minutos} min sem retorno do cliente
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Encerramento de Tickets Mortos (abandono) */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle>Encerramento de Tickets Mortos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Rede de segurança para o ticket abandonado: fecha quando ninguém — nem cliente, nem atendente, nem bot — interage há X horas, seja quem for o último a falar. É o que pega o ticket parado esperando o atendente, que a regra acima nunca fecha. Tickets de disparo são ignorados.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Ativar encerramento por abandono</p>
                <p className="text-xs text-muted-foreground">
                  Verificado a cada 10 minutos. O histórico do ticket registra o motivo do fechamento.
                </p>
              </div>
              <Switch
                checked={configForm.encerramento_morto_ativo}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, encerramento_morto_ativo: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>

            {configForm.encerramento_morto_ativo && (
              <div className="flex items-center gap-3 pl-2">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="encerramento_morto_horas">Tempo sem nenhuma interação (horas)</Label>
                  <Input
                    id="encerramento_morto_horas"
                    className="h-8"
                    type="number"
                    min={1}
                    max={720}
                    value={configForm.encerramento_morto_horas}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10)
                      const v = Number.isNaN(parsed) ? 1 : Math.max(1, parsed)
                      setConfigForm((prev) => ({ ...prev, encerramento_morto_horas: v }))
                      setHasUnsavedConfig(true)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 1 hora. Padrão 24.</p>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <div className="h-4 w-4 rounded-full bg-zinc-500" />
                  <span className="text-sm text-muted-foreground">
                    Fechamento após {configForm.encerramento_morto_horas}h de silêncio total
                  </span>
                </div>
              </div>
            )}

            {encerramentoMortoIndisponivel && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                O encerramento por abandono só passa a valer depois que a migration deste ambiente for executada.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Row 2: Distribuição de Tickets + Mensagem de Finalização */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Distribuição de Tickets */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Distribuição de Tickets
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configure como os tickets são distribuídos automaticamente entre os atendentes.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Atribuição Automática</p>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, novos tickets são automaticamente atribuídos ao atendente com menor carga disponível.
                  </p>
                </div>
                <Switch
                  checked={distributionConfig.auto_assign_enabled}
                  onCheckedChange={(checked) => {
                    setDistributionConfig((prev) => ({ ...prev, auto_assign_enabled: checked }))
                    setHasUnsavedDistribution(true)
                  }}
                />
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="max_tickets">Limite de tickets por atendente</Label>
                <Input
                  id="max_tickets"
                  className="h-8"
                  type="number"
                  min={1}
                  max={100}
                  value={distributionConfig.max_tickets_per_agent}
                  onChange={(e) => {
                    setDistributionConfig((prev) => ({
                      ...prev,
                      max_tickets_per_agent: parseInt(e.target.value) || 10,
                    }))
                    setHasUnsavedDistribution(true)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Máximo de tickets ativos simultâneos por atendente. Atendentes que atingirem esse limite não receberão novos tickets automaticamente.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mensagem de Finalização */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle>Mensagem de Finalização</CardTitle>
              <p className="text-sm text-muted-foreground">
                Esta mensagem será enviada automaticamente via WhatsApp quando um ticket for encerrado.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto">
              <Textarea
                value={configForm.mensagem_finalizacao}
                onChange={(e) =>
                  setConfigForm((prev) => ({ ...prev, mensagem_finalizacao: e.target.value }))
                }
                placeholder="Ex: Obrigado pelo contato, {{cliente_nome}}! Seu atendimento foi finalizado. Caso precise de mais ajuda, estamos a disposicao."
                rows={4}
              />
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Variaveis disponiveis:</span>
                {templateVariables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() =>
                      setConfigForm((prev) => ({
                        ...prev,
                        mensagem_finalizacao: prev.mensagem_finalizacao + v.key,
                      }))
                    }
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 font-mono"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Widget de Chat para site/app */}
        <WidgetManager setorId={setorId} />

        {/* Canais de Atendimento */}
        <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[420px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 shrink-0">
            <div>
              <CardTitle>Canais de Atendimento</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configure multiplos canais (WhatsApp, EvolutionAPI, Discord) para este setor.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingCanal(null)
                resetCanalForm()
                setIsCanalModalOpen(true)
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Adicionar Canal
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
            {canais.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum canal cadastrado</p>
                <p className="text-sm">Adicione canais para receber e responder mensagens</p>
              </div>
            ) : (
              <div className="overflow-y-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Identificador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {canais.map((canal) => (
                      <TableRow key={canal.id}>
                        <TableCell className="font-medium">{canal.nome}</TableCell>
                        <TableCell>
                          <Badge variant={
                            canal.tipo === 'whatsapp' ? 'default' :
                            canal.tipo === 'evolution_api' ? 'secondary' :
                            'outline'
                          } className={
                            canal.tipo === 'whatsapp' ? 'bg-emerald-600 hover:bg-emerald-700' :
                            canal.tipo === 'evolution_api' ? 'bg-sky-600 hover:bg-sky-700 text-primary-foreground' :
                            'bg-indigo-600 hover:bg-indigo-700 text-primary-foreground'
                          }>
                            {canal.tipo === 'whatsapp' ? 'WhatsApp' :
                             canal.tipo === 'evolution_api' ? 'EvolutionAPI' : 'Discord'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-mono">
                          {canal.tipo === 'whatsapp' ? (canal.phone_number_id || '-') :
                           canal.tipo === 'evolution_api' ? (
                            <div className="flex flex-col gap-0.5">
                              {canal.instancia && (
                                <span className="text-foreground font-medium">{canal.instancia}</span>
                              )}
                              <span>{canal.evolution_api_key ? '****' + canal.evolution_api_key.slice(-4) : '-'}</span>
                              {!canal.instancia && (
                                <span className="text-orange-500 text-[10px] font-sans">sem instância</span>
                              )}
                            </div>
                           ) :
                           (canal.discord_guild_id || '-')}
                        </TableCell>
                        <TableCell>
                          {canal.tipo === 'whatsapp' || canal.tipo === 'discord' ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                              <Wifi className="h-3 w-3" />
                              Conectado
                            </span>
                          ) : canal.tipo === 'evolution_api' ? (
                            (() => {
                              const st = canalStatuses[canal.id]
                              const isChecking = checkingCanalId === canal.id
                              if (isChecking) return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Verificando...
                                </span>
                              )
                              if (!st) return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted/50 text-muted-foreground">
                                  —
                                </span>
                              )
                              if (st === 'unknown') return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                  <WifiOff className="h-3 w-3" />
                                  Sem resposta
                                </span>
                              )
                              if (st === 'open') return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                  <Wifi className="h-3 w-3" />
                                  Conectado
                                </span>
                              )
                              if (st === 'connecting' || st === 'qrcode') return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Conectando
                                </span>
                              )
                              if (st === 'not_found') return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                  <WifiOff className="h-3 w-3" />
                                  Não encontrada
                                </span>
                              )
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                  <WifiOff className="h-3 w-3" />
                                  Desconectado
                                </span>
                              )
                            })()
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Botão Verificar para evolution_api */}
                            {canal.tipo === 'evolution_api' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                onClick={() => checkInstanciaStatus(canal)}
                                disabled={checkingCanalId === canal.id}
                                title="Verificar status da instância agora"
                              >
                                {checkingCanalId === canal.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                {!canalStatuses[canal.id] && checkingCanalId !== canal.id && (
                                  <span>Verificar</span>
                                )}
                              </Button>
                            )}
                            {/* Botão Conectar para evolution desconectado */}
                            {canal.tipo === 'evolution_api' && canal.instancia &&
                              canalStatuses[canal.id] &&
                              canalStatuses[canal.id] !== 'open' &&
                              canalStatuses[canal.id] !== 'connecting' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950"
                                onClick={() => openReconnect(canal)}
                              >
                                <QrCode className="h-3.5 w-3.5 mr-1" />
                                Conectar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEditCanal(canal)}
                              aria-label={`Editar canal ${canal.nome || canal.id}`}
                              title="Editar canal"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteCanal(canal.id)}
                              disabled={deletingCanalId === canal.id}
                              className="text-destructive hover:text-destructive"
                              aria-label={`Excluir canal ${canal.nome || canal.id}`}
                              title="Excluir canal"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* IA - Melhorar Mensagem */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Inteligência Artificial
            </CardTitle>
            <CardDescription>Configure a IA para melhorar mensagens dos atendentes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Ativar Melhoria com IA</p>
                <p className="text-xs text-muted-foreground">Permite que atendentes melhorem mensagens antes de enviar</p>
              </div>
              <Switch
                checked={configForm.openai_ativo}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, openai_ativo: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
            {configForm.openai_ativo && (
              <div className="space-y-2">
                <Label htmlFor="openai_api_key">Chave da API OpenAI</Label>
                <Input
                  id="openai_api_key"
                  className="h-8"
                  type="password"
                  placeholder="sk-..."
                  value={configForm.openai_api_key}
                  onChange={(e) => {
                    setConfigForm((prev) => ({ ...prev, openai_api_key: e.target.value }))
                    setHasUnsavedConfig(true)
                  }}
                />
                <p className="text-xs text-muted-foreground">A chave será usada para chamar a OpenAI ao melhorar mensagens. Modelo utilizado: GPT-4o mini.</p>
              </div>
            )}
            {configForm.openai_ativo && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Personalizar URL da IA</p>
                    <p className="text-xs text-muted-foreground">
                      Por padrão usa <span className="font-mono">https://api.openai.com/v1</span>. Ative para usar um endpoint compatível (ex.: proxy ou modelo self-hosted).
                    </p>
                  </div>
                  <Switch
                    checked={configForm.openai_url_personalizada}
                    onCheckedChange={(checked) => {
                      setConfigForm((prev) => ({ ...prev, openai_url_personalizada: checked }))
                      setHasUnsavedConfig(true)
                    }}
                  />
                </div>
                {configForm.openai_url_personalizada && (
                  <div className="space-y-2">
                    <Label htmlFor="openai_base_url">URL personalizada da IA</Label>
                    <Input
                      id="openai_base_url"
                      className="h-8"
                      type="url"
                      placeholder="https://meu-endpoint.com/v1"
                      value={configForm.openai_base_url}
                      onChange={(e) => {
                        setConfigForm((prev) => ({ ...prev, openai_base_url: e.target.value }))
                        setHasUnsavedConfig(true)
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Informe a URL base (sem barra final). Os endpoints <span className="font-mono">/chat/completions</span> e <span className="font-mono">/audio/transcriptions</span> serão anexados automaticamente.
                    </p>
                  </div>
                )}
              </div>
            )}
            {configForm.openai_ativo && (
              <ModelosIaSetor
                setorId={setorId}
                urlPersonalizada={configForm.openai_url_personalizada}
                modeloChat={configForm.openai_modelo_chat}
                modeloTranscricao={configForm.openai_modelo_transcricao}
                onChange={(campo, valor) => {
                  setConfigForm((prev) => ({ ...prev, [campo]: valor }))
                  setHasUnsavedConfig(true)
                }}
                indisponivel={modelosIaIndisponiveis}
              />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium">Ativar Nexus (Assistente IA)</p>
                <p className="text-xs text-muted-foreground">Exibe o assistente Nexus no painel lateral do workdesk</p>
              </div>
              <Switch
                checked={configForm.nexus_ativo}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, nexus_ativo: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium">Assistente IA de Atendimento</p>
                <p className="text-xs text-muted-foreground">Habilitando, todos os atendimentos deste setor passarão por uma IA de atendimento antes de chegar ao atendente</p>
              </div>
              <Switch
                checked={configForm.assistente_ia}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, assistente_ia: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Assinatura do Atendente */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Assinatura do Atendente
            </CardTitle>
            <CardDescription>Adiciona o nome do atendente automaticamente antes de cada mensagem enviada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Ativar assinatura</p>
                <p className="text-xs text-muted-foreground">Exemplo: <span className="font-semibold">*Filipe Cardone:*</span> seguido da mensagem</p>
              </div>
              <Switch
                checked={configForm.assinatura_ativa}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, assinatura_ativa: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ordenação de Conversas */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              Ordenação de Conversas
            </CardTitle>
            <CardDescription>Controla se a lista de chats do WorkDesk sobe automaticamente conversas com mensagens novas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="travar-ordenacao-chat" className="text-sm font-medium">Travar ordenação da lista de chats</Label>
                <p className="text-xs text-muted-foreground">Quando ativado, a lista de conversas do WorkDesk não reordena automaticamente ao receber ou enviar mensagens — a ordem fica fixa para todos os atendentes deste setor</p>
                {travarOrdenacaoChatIndisponivel && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Este recurso ainda não está disponível neste ambiente (falta uma atualização de banco de dados). A opção acima não será salva até isso ser resolvido.
                  </p>
                )}
              </div>
              <Switch
                id="travar-ordenacao-chat"
                aria-label="Travar ordenação da lista de chats"
                checked={configForm.travar_ordenacao_chat}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, travar_ordenacao_chat: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ocorrência obrigatória para encerrar — caso #97240 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Ocorrência Obrigatória
            </CardTitle>
            <CardDescription>Exige que o atendente abra a OC no Service Desk antes de encerrar o ticket</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="oc-obrigatoria" className="text-sm font-medium">Exigir OC para encerrar</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, o WorkDesk consulta o Service Desk ao encerrar e bloqueia se não houver OC aberta para o ticket.
                  Tickets de disparo ficam sempre isentos. Se a consulta falhar, o encerramento é liberado — instabilidade da API nunca vira fila parada.
                </p>
                {ocObrigatoriaIndisponivel && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Este recurso ainda não está disponível neste ambiente (falta uma atualização de banco de dados). A opção acima não será salva até isso ser resolvido.
                  </p>
                )}
              </div>
              <Switch
                id="oc-obrigatoria"
                aria-label="Exigir OC para encerrar"
                checked={configForm.oc_obrigatoria_para_encerrar}
                onCheckedChange={(checked) => {
                  setConfigForm((prev) => ({ ...prev, oc_obrigatoria_para_encerrar: checked }))
                  setHasUnsavedConfig(true)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Templates de Mensagem + Webhooks */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Templates de Mensagem */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 shrink-0">
              <div>
                <CardTitle>Templates de Mensagem</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie atalhos para respostas rapidas no WorkDesk. Use /atalho para inserir a mensagem.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTemplate(null)
                  setTemplateForm({ atalho: '', mensagem: '' })
                  setIsTemplateModalOpen(true)
                }}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Novo Template
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum template cadastrado</p>
                  <p className="text-sm">Crie templates para agilizar o atendimento</p>
                </div>
              ) : (
                <div className="overflow-y-auto h-full space-y-3 pr-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-semibold text-primary">/{template.atalho}</code>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.mensagem}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditingTemplate(template)
                            setTemplateForm({
                              atalho: template.atalho,
                              mensagem: template.mensagem,
                            })
                            setIsTemplateModalOpen(true)
                          }}
                          aria-label={`Editar mensagem rápida ${template.atalho}`}
                          title="Editar mensagem rápida"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteTemplate(template.id)}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Excluir mensagem rápida ${template.atalho}`}
                          title="Excluir mensagem rápida"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhooks */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle>Webhooks</CardTitle>
              <p className="text-sm text-muted-foreground">Dispare notificações para sistemas externos quando eventos ocorrerem neste setor.</p>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Enviar ao encerrar ticket</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ao finalizar um ticket, envia um POST com os dados (ticket, cliente, canal, horários e histórico da conversa). Ativo por padrão.
                  </p>
                </div>
                <Switch
                  checked={configForm.webhook_ativo}
                  onCheckedChange={(v) => setConfigForm((prev) => ({ ...prev, webhook_ativo: v }))}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Avaliação (pesquisa de nota)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Habilita a pesquisa de satisfação após o encerramento. O n8n consulta o endpoint
                    /api/setores/[id]/avaliacao para saber se deve avaliar este setor. Ativo por padrão.
                  </p>
                </div>
                <Switch
                  checked={configForm.avaliacao_ativa}
                  onCheckedChange={(v) => setConfigForm((prev) => ({ ...prev, avaliacao_ativa: v }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Setores para Transferência */}
        <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[420px]">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Setores para Transferência
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione quais setores estarão disponíveis como destino ao transferir um ticket deste setor no WorkDesk.
            </p>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col gap-3 pb-4">
            {/* Busca */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Buscar setor..."
                value={searchSetorDestino}
                onChange={(e) => setSearchSetorDestino(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>

            {/* Lista */}
            {(() => {
              const lista = todosSetores.filter(
                (s) =>
                  s.id !== setorId &&
                  s.nome.toLowerCase().includes(searchSetorDestino.toLowerCase())
              )
              if (todosSetores.filter((s) => s.id !== setorId).length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Nenhum outro setor cadastrado</p>
                  </div>
                )
              }
              if (lista.length === 0) {
                return (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">Nenhum setor encontrado</p>
                  </div>
                )
              }
              return (
                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {lista.map((s) => {
                    const isSelected = setoresDestinoTransferencia.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                          isSelected
                            ? 'bg-primary/8 border-primary/40'
                            : 'hover:bg-muted/50 border-border/60'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={isSelected}
                          onChange={() => toggleSetorDestino(s.id)}
                        />
                        <span className="text-sm font-medium">{s.nome}</span>
                        {isSelected && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            Habilitado
                          </Badge>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* Receptor / Transmissor — apenas admin */}
        {colaboradorLogado?.is_master && (
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Receptor / Transmissor
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure o encaminhamento automático de tickets quando não houver atendentes disponíveis.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Switch: Setor Receptor */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                    <Inbox className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Setor Receptor</p>
                    <p className="text-xs text-muted-foreground">
                      Marca este setor como ponto central que recebe tickets de outros setores.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={configForm.is_receptor}
                  onCheckedChange={(checked) => {
                    setConfigForm((prev) => ({
                      ...prev,
                      is_receptor: checked,
                      // Receptor não pode transmitir
                      ...(checked ? { transmissao_ativa: false, setor_receptor_id: '' } : {}),
                    }))
                  }}
                />
              </div>

              {/* Switch: Transmissão Ativa */}
              <div className={cn(
                "rounded-lg border border-border p-3 transition-opacity",
                configForm.is_receptor && "opacity-50 pointer-events-none"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950">
                      <Radio className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Transmissão Ativa</p>
                      <p className="text-xs text-muted-foreground">
                        Quando ativo, tickets sem atendente disponível são encaminhados ao setor receptor.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={configForm.transmissao_ativa}
                    disabled={configForm.is_receptor}
                    onCheckedChange={(checked) => {
                      setConfigForm((prev) => ({
                        ...prev,
                        transmissao_ativa: checked,
                        ...(checked ? {} : { setor_receptor_id: '' }),
                      }))
                    }}
                  />
                </div>

                {/* Select: Setor Receptor destino */}
                {configForm.transmissao_ativa && !configForm.is_receptor && (
                  <div className="mt-4 space-y-2 pl-12">
                    <Label>Setor Receptor de Destino</Label>
                    <Select
                      value={configForm.setor_receptor_id || 'none'}
                      onValueChange={(v) =>
                        setConfigForm((prev) => ({ ...prev, setor_receptor_id: v === 'none' ? '' : v }))
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecione o setor receptor..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {todosSetores
                          .filter((s) => s.id !== setorId && s.is_receptor)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <Inbox className="h-3.5 w-3.5 text-blue-500" />
                                {s.nome}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {todosSetores.filter((s) => s.id !== setorId && s.is_receptor).length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Nenhum setor está configurado como receptor. Marque um setor como &quot;Setor Receptor&quot; primeiro.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bloqueio de transbordo por horário — apenas admin */}
        {colaboradorLogado?.is_master && (
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Bloqueio de Transbordo
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Defina os horários em que este setor <strong>não deve transbordar</strong>. Durante essas janelas, mesmo que todos os atendentes fiquem offline, os tickets <strong>aguardam na fila do próprio setor</strong> em vez de irem para o setor receptor.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!configForm.transmissao_ativa && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Este setor não tem transmissão ativa — o bloqueio só tem efeito em setores que transbordam.
                </p>
              )}
              {transbordoBloqueios.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhuma janela de bloqueio cadastrada.</p>
              ) : (
                <div className="space-y-3">
                  {transbordoBloqueios.map((b, i) => (
                    <div key={b.id || i} className="rounded-lg border bg-card p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Das</Label>
                          <Input
                            type="time"
                            value={b.hora_inicio}
                            onChange={(e) => updateTransbordoBloqueio(i, { hora_inicio: e.target.value })}
                            className="h-8 w-[110px]"
                          />
                          <Label className="text-xs text-muted-foreground">até</Label>
                          <Input
                            type="time"
                            value={b.hora_fim}
                            onChange={(e) => updateTransbordoBloqueio(i, { hora_fim: e.target.value })}
                            className="h-8 w-[110px]"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto text-destructive hover:text-destructive"
                          onClick={() => removeTransbordoBloqueio(i)}
                          aria-label={`Remover janela de bloqueio ${i + 1}`}
                          title="Remover janela"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((nome, dia) => (
                          <button
                            key={dia}
                            type="button"
                            onClick={() => toggleTransbordoDia(i, dia)}
                            className={cn(
                              'rounded-md border px-2.5 py-1 text-xs transition-colors',
                              b.dias.includes(dia)
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-transparent bg-muted text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {nome}
                          </button>
                        ))}
                      </div>
                      {b.hora_fim <= b.hora_inicio && (
                        <p className="text-[11px] text-destructive">A hora final deve ser maior que a inicial.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={addTransbordoBloqueio}>
                <Plus className="h-3.5 w-3.5" />
                Adicionar janela
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Zona de Perigo */}
        <Card className="glass-card-elevated rounded-lg border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Zona de Perigo
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ações irreversíveis. Tenha certeza antes de prosseguir.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <div>
                  <p className="font-medium">Excluir Setor</p>
                  <p className="text-sm text-muted-foreground">
                    Exclui permanentemente o setor, todos os atendentes vinculados, pausas, templates e configurações.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Excluir Setor
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Excluir Setor Permanentemente
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <p>
                          Esta ação é <strong>irreversível</strong>. Todos os dados abaixo serão excluídos permanentemente:
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                          <li>Todos os atendentes vinculados a este setor</li>
                          <li>Todos os subsetores</li>
                          <li>Todas as pausas configuradas</li>
                          <li>Todos os templates de mensagem</li>
                          <li>Todas as configurações de canais</li>
                          <li>Configurações de roteamento de atendimento</li>
                        </ul>
                        <div className="pt-2">
                          <Label htmlFor="confirm-delete" className="text-foreground">
                            Digite <strong className="text-destructive">{setor?.nome}</strong> para confirmar:
                          </Label>
                          <Input
                            id="confirm-delete"
                            className="mt-2 h-8"
                            placeholder="Digite o nome do setor"
                            value={deleteSetorConfirmText}
                            onChange={(e) => setDeleteSetorConfirmText(e.target.value)}
                          />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteSetorConfirmText('')}>
                        Cancelar
                      </AlertDialogCancel>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteSetor}
                        disabled={deletingSetor || deleteSetorConfirmText !== setor?.nome}
                      >
                        {deletingSetor ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Excluir Setor Permanentemente
                          </>
                        )}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Barra de save flutuante — unifica os saves da página Configurações */}
        <FloatingSaveBar
          show={hasUnsavedConfig || hasUnsavedTipos || hasUnsavedDistribution || hasUnsavedDestino || hasUnsavedTransbordoBloqueio}
          saving={saving || savingTiposAtendimento || savingDistribution || savingSetoresDestino || savingTransbordoBloqueio}
          onSave={saveAllDirty}
          dirtyLabels={[
            ...(hasUnsavedConfig ? ['Informações, aparência e limites'] : []),
            ...(hasUnsavedTipos ? ['Roteamento'] : []),
            ...(hasUnsavedDistribution ? ['Distribuição'] : []),
            ...(hasUnsavedDestino ? ['Transferência'] : []),
            ...(hasUnsavedTransbordoBloqueio ? ['Bloqueio de transbordo'] : []),
          ]}
        />
      </div>
    )}

    {activeSection === 'disparos' && setor && (
      <DisparosSection
        setor={{
          id: setor.id,
          nome: setor.nome,
          evolution_base_url: setor.evolution_base_url,
          evolution_api_key: setor.evolution_api_key,
          openai_ativo: setor.openai_ativo,
          openai_api_key: setor.openai_api_key,
          max_disparos_dia: setor.max_disparos_dia,
        }}
      />
    )}

    {activeSection === 'disparo_logs' && (
      <DisparoLogsSection setorId={setorId} />
    )}
  </main>
</div>

      {/* Delete Atendente Confirmation Dialog */}
      <AtendentesStatusModal
        open={statusAtendentesModalOpen}
        onOpenChange={setStatusAtendentesModalOpen}
        atendentes={atendentes}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover atendente do setor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <span className="font-semibold text-foreground">{atendenteToDelete?.nome}</span>{' '}
              deste setor? O atendente continuara existindo no sistema, apenas sera desvinculado
              deste setor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeAtendenteFromSetor}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aviso de tickets abertos (caso #97218). Não é trava: o atendente que
          sumiu COM tickets abertos é justamente o caso que motivou a
          ferramenta. Os tickets seguem atribuídos a ele; o gestor só confirma
          sabendo quantos são. */}
      <AlertDialog
        open={!!confirmacaoDisponibilidade}
        onOpenChange={(aberto) => { if (!aberto) setConfirmacaoDisponibilidade(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacaoDisponibilidade?.nome} tem {confirmacaoDisponibilidade?.tickets}{' '}
              {confirmacaoDisponibilidade?.tickets === 1 ? 'ticket aberto' : 'tickets abertos'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacaoDisponibilidade?.tickets === 1 ? 'Ele continua atribuído' : 'Eles continuam atribuídos'}{' '}
              a {confirmacaoDisponibilidade?.nome} — nada volta para a fila.
              Confirma {confirmacaoDisponibilidade?.rotulo}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pendente = confirmacaoDisponibilidade
                setConfirmacaoDisponibilidade(null)
                if (pendente) void pendente.executar()
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Modal */}
      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>
              Crie um atalho para usar no WorkDesk. Digite /{'{atalho}'} para inserir a mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-atalho">Atalho</Label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-muted rounded-l-md border border-r-0 text-muted-foreground">/</span>
                <Input
                  id="template-atalho"
                  value={templateForm.atalho}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({ ...prev, atalho: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))
                  }
                  placeholder="obrigado"
                  className="rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">Apenas letras e numeros, sem espacos</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-mensagem">Mensagem</Label>
              <Textarea
                id="template-mensagem"
                value={templateForm.mensagem}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, mensagem: e.target.value }))}
                placeholder="Olá {{cliente_nome}}, obrigado pelo contato!"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Variaveis disponiveis (clique para inserir)</Label>
              <div className="flex flex-wrap gap-2">
                {templateVariables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-xs px-2 py-1.5 rounded border bg-background hover:bg-muted transition-colors"
                  >
                    <span className="font-mono text-primary">{v.key}</span>
                    <span className="text-muted-foreground ml-1">- {v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsTemplateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveTemplate}>
              {editingTemplate ? 'Salvar' : 'Criar Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Canal Modal */}
      <Dialog open={isCanalModalOpen} onOpenChange={(open) => { if (!open) closeCanalModal() }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {canalForm.tipo === 'evolution_api' && <Smartphone className="h-5 w-5 text-sky-600" />}
              {editingCanal ? 'Editar Canal' : 'Novo Canal'}
            </DialogTitle>
            <DialogDescription>
              {evoStep === 'qrcode'
                ? 'Escaneie o QR Code com o WhatsApp para conectar.'
                : evoStep === 'connected'
                ? 'Canal configurado com sucesso!'
                : 'Configure um canal de atendimento para este setor.'}
            </DialogDescription>
          </DialogHeader>

          {/* ── STEP: QR Code ── */}
          {evoStep === 'qrcode' && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4 text-sky-600" />
                <span>Abra o WhatsApp → Menu → Aparelhos conectados → Conectar</span>
              </div>
              {evoQrCode ? (
                <div className="rounded-lg border-2 border-sky-200 dark:border-sky-800 p-3 bg-white">
                  <img src={evoQrCode} alt="QR Code WhatsApp" className="w-56 h-56" />
                </div>
              ) : (
                <div className="w-64 h-64 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aguardando conexão...
              </div>
            </div>
          )}

          {/* ── STEP: Connected ── */}
          {evoStep === 'connected' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center ring-4 ring-green-200 dark:ring-green-800">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-xl text-green-700 dark:text-green-400">WhatsApp Conectado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Canal <span className="font-medium">{canalForm.nome}</span> configurado com sucesso.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: Form ── */}
          {evoStep === 'form' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="canal-nome">Nome do Canal</Label>
                <Input
                  id="canal-nome"
                  placeholder="Ex: WhatsApp Vendas"
                  value={canalForm.nome}
                  onChange={(e) => {
                    setCanalForm((prev) => ({ ...prev, nome: e.target.value }))
                    if (e.target.value.trim()) setCanalNomeError(false)
                  }}
                  className={canalNomeError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {canalNomeError && (
                  <p className="text-xs text-destructive">O nome do canal é obrigatório.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={canalForm.tipo}
                  onValueChange={(value: 'whatsapp' | 'evolution_api' | 'discord') =>
                    setCanalForm((prev) => ({ ...prev, tipo: value }))
                  }
                  disabled={!!editingCanal}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp Oficial</SelectItem>
                    <SelectItem value="evolution_api">EvolutionAPI</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* EvolutionAPI NEW: apenas nome+tipo, instância é gerada automaticamente */}
              {canalForm.tipo === 'evolution_api' && !editingCanal && (
                <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                    <Smartphone className="h-4 w-4" />
                    EvolutionAPI — Configuração automática
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique em <strong>Próximo</strong> para criar a instância e escanear o QR Code com o WhatsApp.
                    As credenciais são gerenciadas automaticamente pelo sistema.
                  </p>
                </div>
              )}

              {/* EvolutionAPI EDIT: mostra instância como info */}
              {canalForm.tipo === 'evolution_api' && !!editingCanal && (
                <div className="rounded-xl border border-muted bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Smartphone className="h-4 w-4 text-sky-600" />
                    EvolutionAPI — Gerenciado automaticamente
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Instância: <span className="font-mono text-xs">{canalForm.instancia || 'N/D'}</span>
                  </p>
                </div>
              )}

              {/* Instância (apenas para WhatsApp e Discord) */}
              {canalForm.tipo !== 'evolution_api' && (
                <div className="space-y-2">
                  <Label htmlFor="canal-instancia">Instância</Label>
                  <Input
                    id="canal-instancia"
                    placeholder="Ex: instancia-01"
                    value={canalForm.instancia}
                    onChange={(e) => setCanalForm((prev) => ({ ...prev, instancia: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Identificador da instância utilizada neste canal.</p>
                </div>
              )}

              {/* WhatsApp fields */}
              {canalForm.tipo === 'whatsapp' && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">WhatsApp — Configurações</p>
                  <div className="space-y-2">
                    <Label>Phone Number ID</Label>
                    <Input
                      placeholder="Ex: 123456789012345"
                      value={canalForm.phone_number_id}
                      onChange={(e) => setCanalForm((prev) => ({ ...prev, phone_number_id: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Token</Label>
                    <Input
                      type="password"
                      placeholder="EAAxxxxxx..."
                      value={canalForm.whatsapp_token}
                      onChange={(e) => setCanalForm((prev) => ({ ...prev, whatsapp_token: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Se vazio, usa o token global do sistema.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Template (Disparo)</Label>
                    <Input
                      placeholder="Ex: atendimento_inicio"
                      value={canalForm.template_id}
                      onChange={(e) => setCanalForm((prev) => ({ ...prev, template_id: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma do Template</Label>
                    <Select
                      value={canalForm.template_language}
                      onValueChange={(value) => setCanalForm((prev) => ({ ...prev, template_language: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o idioma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt_BR">Português (Brasil) - pt_BR</SelectItem>
                        <SelectItem value="pt">Português - pt</SelectItem>
                        <SelectItem value="en_US">Inglês (EUA) - en_US</SelectItem>
                        <SelectItem value="en">Inglês - en</SelectItem>
                        <SelectItem value="es">Espanhol - es</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Limite de Disparos por Dia</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0 = ilimitado"
                      value={canalForm.max_disparos_dia || ''}
                      onChange={(e) =>
                        setCanalForm((prev) => ({ ...prev, max_disparos_dia: parseInt(e.target.value) || 0 }))
                      }
                    />
                  </div>
                </div>
              )}

              {/* Discord fields */}
              {canalForm.tipo === 'discord' && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">Discord — Configurações</p>
                  <div className="space-y-2">
                    <Label>Bot Token</Label>
                    <Input
                      type="password"
                      placeholder="MTIzNDU2Nzg5MDEy..."
                      value={canalForm.discord_bot_token}
                      onChange={(e) => setCanalForm((prev) => ({ ...prev, discord_bot_token: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Guild ID (Servidor)</Label>
                    <Input
                      placeholder="Ex: 123456789012345678"
                      value={canalForm.discord_guild_id}
                      onChange={(e) => setCanalForm((prev) => ({ ...prev, discord_guild_id: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 border-t pt-4">
                <Switch
                  checked={canalForm.ativo}
                  onCheckedChange={(checked) => setCanalForm((prev) => ({ ...prev, ativo: checked }))}
                />
                <Label>Canal ativo</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            {evoStep === 'qrcode' ? (
              <Button variant="outline" onClick={handleEvoCancelQr}>
                ← Voltar
              </Button>
            ) : evoStep === 'connected' ? (
              <Button onClick={closeCanalModal} className="bg-green-600 hover:bg-green-700 text-white">
                Concluir
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCanalModal}>
                  Cancelar
                </Button>
                {!editingCanal && canalForm.tipo === 'evolution_api' ? (
                  <Button onClick={handleEvoNext} disabled={evoCreatingInstance}>
                    {evoCreatingInstance ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>Próximo →</>
                    )}
                  </Button>
                ) : (
                  <Button onClick={saveCanal} disabled={savingCanal}>
                    {savingCanal ? 'Salvando...' : editingCanal ? 'Salvar' : 'Criar Canal'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconnect QR Dialog */}
      <Dialog
        open={reconnectDialog.open}
        onOpenChange={(open) => { if (!open) closeReconnectDialog() }}
      >
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-sky-600" />
              Conectar {reconnectDialog.canal?.nome}
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com o WhatsApp para reconectar esta instância.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-5 py-4">
            {reconnectDialog.connected ? (
              <>
                <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center ring-4 ring-green-200 dark:ring-green-800">
                  <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-bold text-lg text-green-700 dark:text-green-400">WhatsApp Conectado!</p>
              </>
            ) : reconnectDialog.loading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
                <p className="text-sm text-muted-foreground">Obtendo QR Code...</p>
              </div>
            ) : reconnectDialog.qr ? (
              <>
                <div className="rounded-lg border-2 border-sky-200 dark:border-sky-800 p-3 bg-white">
                  <img src={reconnectDialog.qr} alt="QR Code WhatsApp" className="w-56 h-56" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Aguardando conexão...
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <WifiOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">Não foi possível obter o QR Code.</p>
                <p className="text-xs text-muted-foreground mt-1">Verifique se a instância existe no servidor.</p>
              </div>
            )}
          </div>

          {!reconnectDialog.connected && !reconnectDialog.loading && (
            <DialogFooter>
              <Button variant="outline" onClick={closeReconnectDialog}>Fechar</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Subsetor Modal */}
      <Dialog open={isSubsetorModalOpen} onOpenChange={setIsSubsetorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSubsetor ? 'Editar Subsetor' : 'Novo Subsetor'}</DialogTitle>
            <DialogDescription>
              Crie um subsetor para organizar seus atendentes e direcionar tickets de forma mais especifica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subsetor-nome">Tipo do Subsetor</Label>
              <Select
                value={subsetorForm.nome}
                onValueChange={(value) => setSubsetorForm((prev) => ({ ...prev, nome: value }))}
              >
                <SelectTrigger id="subsetor-nome">
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Suporte">Suporte</SelectItem>
                  <SelectItem value="Comercial">Comercial</SelectItem>
                  <SelectItem value="Financeiro">Financeiro</SelectItem>
                  <SelectItem value="Ouvidoria">Ouvidoria</SelectItem>
                  <SelectItem value="Jornada Cliente">Jornada Cliente</SelectItem>
                  <SelectItem value="Sped">Sped</SelectItem>
                  <SelectItem value="Prime">Prime</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subsetor-descricao">Descricao (opcional)</Label>
              <Textarea
                id="subsetor-descricao"
                value={subsetorForm.descricao}
                onChange={(e) => setSubsetorForm((prev) => ({ ...prev, descricao: e.target.value }))}
                placeholder="Descreva a funcao deste subsetor..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSubsetorModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSubsetor} disabled={savingSubsetor}>
              {savingSubsetor ? 'Salvando...' : (editingSubsetor ? 'Salvar' : 'Criar Subsetor')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pausa Modal */}
      <Dialog open={isPausaModalOpen} onOpenChange={setIsPausaModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPausa ? 'Editar Pausa' : 'Nova Pausa'}</DialogTitle>
            <DialogDescription>
              Configure um tipo de pausa para os atendentes usarem durante o expediente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pausa-nome">Nome da Pausa</Label>
              <Input
                id="pausa-nome"
                value={pausaForm.nome}
                onChange={(e) => setPausaForm((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Almoço, Lanche, Banheiro..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pausa-descricao">Descriç��o (opcional)</Label>
              <Textarea
                id="pausa-descricao"
                value={pausaForm.descricao}
                onChange={(e) => setPausaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                placeholder="Descreva quando esta pausa deve ser usada..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pausa-tempo-maximo">Tempo máximo (minutos, opcional)</Label>
              <Input
                id="pausa-tempo-maximo"
                type="number"
                min={0}
                step={1}
                value={pausaForm.tempo_maximo_minutos}
                onChange={(e) => setPausaForm((prev) => ({ ...prev, tempo_maximo_minutos: e.target.value }))}
                placeholder="Ex: 90 (1h30)"
              />
              <p className="text-xs text-muted-foreground">
                Se definido, o supervisor verá um alerta quando o atendente ultrapassar esse tempo nesta pausa.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsPausaModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={savePausa}>{editingPausa ? 'Salvar' : 'Criar Pausa'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Pausa Confirmation */}


      {/* Generic Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog.onConfirm()
                setConfirmDialog((prev) => ({ ...prev, open: false }))
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Atendente Modal */}
      <Dialog open={isAtendenteModalOpen} onOpenChange={setIsAtendenteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAtendente ? 'Editar Atendente' : 'Novo Atendente'}</DialogTitle>
            <DialogDescription>
              {editingAtendente
                ? 'Atualize os dados do atendente.'
                : 'Cadastre um novo atendente para este setor. Ele usará o email e senha para acessar o WorkDesk.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="atendente-nome">Nome</Label>
              <Input
                id="atendente-nome"
                value={atendenteForm.nome}
                onChange={(e) =>
                  setAtendenteForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                placeholder="Nome do atendente"
              />
            </div>

<div className="space-y-2">
                  <Label htmlFor="atendente-email">Email</Label>
                  <div className="relative">
                    <Input
                      id="atendente-email"
                      type="email"
                      value={atendenteForm.email}
                      onChange={(e) => {
                        const newEmail = e.target.value
                        setAtendenteForm((prev) => ({ ...prev, email: newEmail }))
                        
                        if (!editingAtendente) {
                          // Clear previous timeout
                          if (emailCheckTimeoutRef.current) {
                            clearTimeout(emailCheckTimeoutRef.current)
                          }
                          // Reset state while typing
                          setExistingColaborador(null)
                          // Debounce check
                          emailCheckTimeoutRef.current = setTimeout(() => {
                            checkEmailExists(newEmail)
                          }, 500)
                        }
                      }}
                      onBlur={(e) => {
                        if (!editingAtendente && e.target.value) {
                          // Clear any pending timeout
                          if (emailCheckTimeoutRef.current) {
                            clearTimeout(emailCheckTimeoutRef.current)
                          }
                          checkEmailExists(e.target.value)
                        }
                      }}
                      placeholder="email@exemplo.com"
                      disabled={!!editingAtendente}
                    />
                    {checkingEmail && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    )}
                  </div>
                  {editingAtendente && (
                    <p className="text-xs text-muted-foreground">O email nao pode ser alterado</p>
                  )}
                </div>

            {editingAtendente && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Trocar Senha</p>
                  <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="atendente-nova-senha">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="atendente-nova-senha"
                      type={showNewPassword ? 'text' : 'password'}
                      value={atendenteForm.novaSenha}
                      onChange={(e) =>
                        setAtendenteForm((prev) => ({ ...prev, novaSenha: e.target.value }))
                      }
                      placeholder="Nova senha (mínimo 6 caracteres)"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="atendente-confirmar-nova-senha">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="atendente-confirmar-nova-senha"
                      type={showConfirmNewPassword ? 'text' : 'password'}
                      value={atendenteForm.confirmarNovaSenha}
                      onChange={(e) =>
                        setAtendenteForm((prev) => ({ ...prev, confirmarNovaSenha: e.target.value }))
                      }
                      placeholder="Repita a nova senha"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {atendenteForm.confirmarNovaSenha && atendenteForm.novaSenha !== atendenteForm.confirmarNovaSenha && (
                    <p className="text-xs text-destructive">As senhas nao coincidem</p>
                  )}
                </div>
              </div>
            )}

                  {!editingAtendente && existingColaborador && !existingColaborador.alreadyInThisSetor && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 mt-2">
                      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        Este email ja esta cadastrado no sistema
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        <span className="font-medium">{existingColaborador.nome}</span> atende em:{' '}
                        {existingColaborador.setores?.map((s: any) => s.setores?.nome).filter(Boolean).join(', ') || 'Nenhum setor'}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Clique em Adicionar para que ele tambem atenda neste setor.
                      </p>
                    </div>
                  )}
                  {!editingAtendente && existingColaborador?.alreadyInThisSetor && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 mt-2">
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                        Este atendente ja faz parte deste setor
                      </p>
                    </div>
                  )}

{!editingAtendente && !existingColaborador && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="atendente-senha">Senha</Label>
                  <div className="relative">
                    <Input
                      id="atendente-senha"
                      type={showPassword ? 'text' : 'password'}
                      value={atendenteForm.senha}
                      onChange={(e) =>
                        setAtendenteForm((prev) => ({ ...prev, senha: e.target.value }))
                      }
                      placeholder="Senha de acesso ao WorkDesk"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimo de 6 caracteres
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="atendente-confirmar-senha">Confirmar Senha</Label>
                  <div className="relative">
                    <Input
                      id="atendente-confirmar-senha"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={atendenteForm.confirmarSenha}
                      onChange={(e) =>
                        setAtendenteForm((prev) => ({ ...prev, confirmarSenha: e.target.value }))
                      }
                      placeholder="Repita a senha"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {atendenteForm.confirmarSenha && atendenteForm.senha !== atendenteForm.confirmarSenha && (
                    <p className="text-xs text-destructive">As senhas nao coincidem</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="atendente-suporte-id">ID Suporte (opcional)</Label>
              <Input
                id="atendente-suporte-id"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ex: 12345"
                value={atendenteForm.suporte_id}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  setAtendenteForm((prev) => ({ ...prev, suporte_id: value }))
                }}
              />
              <p className="text-xs text-muted-foreground">
                ID do atendente no sistema externo de suporte
              </p>
            </div>

            {/* Subsetor selection - checkboxes para múltipla seleção */}
            {subsetores.filter(s => s.ativo).length > 0 && (
              <div className="space-y-2">
                <Label>Subsetores (opcional)</Label>
                <div className="rounded-lg border border-border divide-y divide-border max-h-44 overflow-y-auto">
                  {subsetores.filter(s => s.ativo).map((s) => {
                    const checked = atendenteSubsetorIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={checked}
                          onChange={() => {
                            setAtendenteSubsetorIds(prev =>
                              checked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                            )
                          }}
                        />
                        <span className="text-sm">{s.nome}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  O atendente receberá tickets dos subsetores selecionados. Sem seleção, atende o setor geral.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAtendenteModalOpen(false)}
              className="bg-transparent"
            >
              Cancelar
            </Button>
<Button
                onClick={saveAtendente}
                disabled={savingAtendente || existingColaborador?.alreadyInThisSetor}
              >
                {savingAtendente ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {existingColaborador && !existingColaborador.alreadyInThisSetor
                      ? 'Adicionando...'
                      : 'Salvando...'}
                  </>
                ) : editingAtendente ? (
                  'Salvar Alteracoes'
                ) : existingColaborador && !existingColaborador.alreadyInThisSetor ? (
                  'Adicionar ao Setor'
                ) : (
                  'Cadastrar Atendente'
                )}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversation Modal — balão centralizado */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={closeConversation}
          />

          {/* Conversa + barra da IA. Com a barra aberta o conjunto ganha
              largura em vez de espremer o chat; abaixo de lg ela empilha em
              cima, porque 340px ao lado não caberiam. */}
          <div className={cn(
            'relative flex h-[85vh] max-h-[760px] w-full flex-col items-stretch gap-3 lg:flex-row',
            statusAtendimentoAberto ? 'max-w-6xl' : 'max-w-4xl',
          )}>
            {statusAtendimentoAberto && (
              <aside className="flex max-h-[40%] w-full shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-2xl lg:max-h-none lg:w-[340px]">
                <StatusAtendimentoPanel
                  ticketId={selectedTicket.id}
                  onFechar={() => setStatusAtendimentoAberto(false)}
                />
              </aside>
            )}

          {/* Balão — bordas arredondadas, altura fixa (não varia conforme o
              conteúdo de cada aba: Atendimento/Transferir/Info) */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h2 className="font-semibold">Ticket <span className="font-mono tabnums">#{selectedTicket.numero}</span></h2>
                <p className="truncate text-sm text-muted-foreground">
                  Conversa com {selectedTicket.clientes?.nome || selectedTicket.clientes?.telefone || 'Cliente'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(() => {
                  const acompanhamento = selectedTicket.acompanhamento
                  const souEu = acompanhamento?.colaborador_id === colaboradorLogado?.id
                  const outro = acompanhamento && !souEu

                  return (
                    <Button
                      variant={souEu ? 'secondary' : 'outline'}
                      size="sm"
                      className={cn('h-8 gap-1.5 text-xs', souEu && 'border-primary/40 text-primary')}
                      onClick={alternarAcompanhamento}
                      // Só quem entrou pode sair: com outro gestor no ticket o
                      // botão vira indicador, não um jeito de tomar o lugar dele.
                      disabled={salvandoAcompanhamento || Boolean(outro)}
                      aria-pressed={Boolean(souEu)}
                      title={outro
                        ? `${acompanhamento.colaborador_nome || 'Outro gestor'} está acompanhando desde ${new Date(acompanhamento.iniciado_em).toLocaleString('pt-BR')}`
                        : souEu
                          ? 'Você está acompanhando — clique para encerrar'
                          : 'Marcar que você está acompanhando e ajudando o técnico'}
                    >
                      {salvandoAcompanhamento
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <UserCheck className="h-3.5 w-3.5" />}
                      {outro
                        ? <span className="max-w-[120px] truncate">{acompanhamento.colaborador_nome || 'Gestor'}</span>
                        : souEu ? 'Acompanhando' : 'Acompanhar'}
                    </Button>
                  )
                })()}
                <Button
                  variant={statusAtendimentoAberto ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setStatusAtendimentoAberto((aberto) => !aberto)}
                  aria-pressed={statusAtendimentoAberto}
                  title="Leitura da conversa por IA"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Status do atendimento
                </Button>
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
            </div>

            {/* Tabs */}
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setConversationTab('atendimento')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'atendimento'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Atendimento
                </button>
                <button
                  onClick={() => setConversationTab('transferir')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'transferir'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Transferir
                </button>
                <button
                  onClick={() => setConversationTab('info')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'info'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Informações
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {/* Atendimento Tab - Messages */}
              {conversationTab === 'atendimento' && (
                <div className="flex h-full flex-col">
                  <div ref={conversationScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        <Fragment key={msg.id}>
                          {msg._nexusHistoryStart && <SeparadorConversaNexus />}
                          {msg._ticketStart && <SeparadorInicioTicket numero={selectedTicket?.numero} />}
                          <MensagemBubble
                            variant="supervisao"
                            mensagem={msg}
                            media={(
                              <MessageMediaPreview
                                url={msg.url_imagem}
                                mediaType={msg.media_type}
                                tipo={msg.tipo}
                                conteudo={msg.conteudo}
                              />
                            )}
                          />
                        </Fragment>
                      ))
                    )}
                  </div>

                  {/* Actions */}
                  <div className="border-t p-3 space-y-2">
                    {/* Nota interna do supervisor — só p/ tickets em atendimento (com técnico) */}
                    {selectedTicket?.colaborador_id && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            value={notaInterna}
                            onChange={(e) => setNotaInterna(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleEnviarNotaInterna()
                              }
                            }}
                            placeholder="Mensagem para o atendente..."
                            disabled={enviandoNota}
                            className="h-9 text-sm"
                          />
                          <Button
                            size="icon"
                            className="h-9 w-9 shrink-0 bg-amber-500 text-white hover:bg-amber-600"
                            onClick={handleEnviarNotaInterna}
                            disabled={enviandoNota || !notaInterna.trim()}
                            aria-label="Enviar nota interna"
                            title="Enviar nota interna (só o atendente vê)"
                          >
                            {enviandoNota ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={finalizeTicket}
                    >
                      Finalizar Atendimento
                    </Button>
                  </div>
                </div>
              )}

              {/* Transferir Tab */}
              {conversationTab === 'transferir' && (
                <div className="flex h-full flex-col">
                  {/* Mesmo fluxo do WorkDesk: inclui a confirmação para
                      atendente offline ou em pausa, que esta tela não tinha —
                      o destino aparecia na lista mas o servidor recusava. */}
                  <TransferirTicketForm
                    active
                    ticket={selectedTicket}
                    colaborador={colaboradorLogado}
                    tela="Setor"
                    onTransferSuccess={() => {
                      closeConversation()
                      mutate()
                    }}
                  />
                </div>
              )}

              {/* Info Tab */}
              {conversationTab === 'info' && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Com atendente atual</p>
                      <p className="font-semibold tabular-nums">{selectedTicket.tempoAtendimento}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">No setor atual</p>
                      <p className="font-semibold tabular-nums">{selectedTicket.tempoNoSetor}</p>
                    </div>
                    {/*
                      Ocupa a linha inteira porque é o número que responde "esta
                      conversa está parada?" — os dois acima contam desde a
                      atribuição e nunca param. O remetente vem junto: "há 40min"
                      sozinho não distingue cliente esperando resposta de
                      atendente esperando o cliente.
                    */}
                    <div className="col-span-2 border-t pt-2">
                      <p className="text-xs text-muted-foreground">Última mensagem</p>
                      {loadingMessages && !ultimaMensagem ? (
                        <Skeleton className="mt-1 h-5 w-32" />
                      ) : ultimaMensagem ? (
                        <p className="font-semibold tabular-nums">
                          há {tempoDesdeUltimaMensagem}
                          <span className="ml-1.5 font-normal text-xs text-muted-foreground tabular-nums-none">
                            {rotuloDeQuemFalou(ultimaMensagem.quem)}
                          </span>
                        </p>
                      ) : (
                        <p className="font-medium text-muted-foreground">Sem mensagens</p>
                      )}
                    </div>
                  </div>
                  {/*
                    Grade de duas colunas do começo ao fim. Antes só o bloco
                    CNPJ/Registro/PDV/Sistema era pareado e o resto ocupava a
                    linha inteira, deixando metade do painel vazia e empurrando
                    Status e Atendente para fora da primeira tela.
                  */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <Label className="text-muted-foreground">Cliente</Label>
                      <p className="font-medium">{selectedTicket.clientes?.nome || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Telefone</Label>
                      <p className="font-medium tabular-nums">{selectedTicket.clientes?.telefone || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">CNPJ</Label>
                      <p className="font-medium tabular-nums">{selectedTicket.clientes?.CNPJ || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Registro</Label>
                      <p className="font-medium tabular-nums">{selectedTicket.clientes?.Registro || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">PDV</Label>
                      <p className="font-medium">{selectedTicket.clientes?.PDV || 'Não informado'}</p>
                    </div>
                    <div>
                      {/* `software` e `prime` vêm de sincronização externa e
                          chegam com caixa inconsistente / texto "true";
                          os helpers normalizam. */}
                      <Label className="text-muted-foreground">Sistema</Label>
                      <p className="font-medium">
                        {formatSistemaCliente(selectedTicket.clientes?.software) || 'Não informado'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">E-mail</Label>
                      <p className="font-medium break-all">{selectedTicket.clientes?.email || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Prime</Label>
                      <p>
                        {/* `—` quando o cadastro não informa: ausência de dado
                            não é o mesmo que "não é Prime". */}
                        <Badge variant={isClientePrime(selectedTicket.clientes?.prime) ? 'default' : 'secondary'}>
                          {formatPrimeCliente(selectedTicket.clientes?.prime)}
                        </Badge>
                      </p>
                    </div>

                    <div className="col-span-2 border-t pt-3" />

                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <p>
                        <Badge variant={
                          selectedTicket.status === 'em_atendimento' ? 'default' :
                          selectedTicket.status === 'aberto' ? 'secondary' : 'outline'
                        }>
                          {selectedTicket.status === 'em_atendimento' ? 'Em Atendimento' :
                           selectedTicket.status === 'aberto' ? 'Aberto' : selectedTicket.status}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Prioridade</Label>
                      <p>
                        <Badge variant={
                          selectedTicket.prioridade === 'alta' ? 'destructive' :
                          selectedTicket.prioridade === 'media' ? 'default' : 'secondary'
                        }>
                          {selectedTicket.prioridade}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Atendente</Label>
                      <p className="font-medium">{selectedTicket.colaboradores?.nome || 'Não atribuído'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Criado em</Label>
                      <p className="font-medium tabular-nums">
                        {selectedTicket.criado_em ? new Date(selectedTicket.criado_em).toLocaleString('pt-BR') : '—'}
                      </p>
                    </div>

                    {/*
                      MDM ocupa a linha inteira: é o único campo que sai para um
                      serviço externo, e precisa de espaço para o botão, o
                      resultado e o erro.
                    */}
                    <div className="col-span-2 rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-muted-foreground">MDM</Label>
                        {cnpjDoCliente && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={consultarMdm}
                            disabled={mdmLoading}
                          >
                            <RefreshCw className={cn('h-3 w-3', mdmLoading && 'animate-spin')} />
                            {mdmResultado || mdmErro ? 'Consultar de novo' : 'Verificar MDM'}
                          </Button>
                        )}
                      </div>
                      <div className="mt-1.5">
                        {!cnpjDoCliente ? (
                          // Sem CNPJ não há o que consultar — dizer isso é melhor
                          // que mostrar "sem MDM" e o gestor concluir que o
                          // cliente não tem o agente.
                          <p className="text-sm text-muted-foreground">Cliente sem CNPJ cadastrado</p>
                        ) : mdmLoading ? (
                          <Skeleton className="h-5 w-40" />
                        ) : mdmErro ? (
                          <p className="text-sm text-destructive">{mdmErro}</p>
                        ) : mdmResultado ? (
                          <p className="flex flex-wrap items-center gap-2">
                            <Badge variant={mdmResultado.hasMdm ? 'default' : 'destructive'}>
                              {mdmResultado.hasMdm ? 'MDM instalado' : 'Sem MDM'}
                            </Badge>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {mdmResultado.installedCount}/{mdmResultado.totalMachines}
                              {mdmResultado.totalMachines === 1 ? ' máquina' : ' máquinas'}
                            </span>
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Não consultado — a busca sai para um serviço externo.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <Dialog open={showNotificationModal} onOpenChange={(open) => {
        setShowNotificationModal(open)
        if (open) { setNotificationModalTab('novo'); fetchAvisosEnviados() }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Avisos do Setor
            </DialogTitle>
            <DialogDescription>
              Envie notificações ou gerencie os avisos já enviados
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => setNotificationModalTab('novo')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                notificationModalTab === 'novo'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Novo Aviso
            </button>
            <button
              onClick={() => { setNotificationModalTab('historico'); fetchAvisosEnviados() }}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                notificationModalTab === 'historico'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Histórico
              {avisosEnviados.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  {avisosEnviados.length}
                </span>
              )}
            </button>
          </div>

          {notificationModalTab === 'novo' ? (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Destinatário</Label>
                  <Select
                    value={notificationForm.destinatario}
                    onValueChange={(value) => setNotificationForm((prev) => ({ ...prev, destinatario: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o destinatário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Todos do setor
                        </span>
                      </SelectItem>
                      {atendentes.map((atendente: any) => (
                        <SelectItem key={atendente.id} value={atendente.id}>
                          <span className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {atendente.nome}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    placeholder="Título do aviso..."
                    value={notificationForm.titulo}
                    onChange={(e) => setNotificationForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    value={notificationForm.mensagem}
                    onChange={(e) => setNotificationForm((prev) => ({ ...prev, mensagem: e.target.value }))}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNotificationModal(false)}>
                  Cancelar
                </Button>
                <Button onClick={sendNotification} disabled={sendingNotification}>
                  {sendingNotification ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-2">
              {loadingAvisos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : avisosEnviados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Send className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum aviso enviado ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Os avisos disparados para o setor aparecem aqui.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {avisosEnviados.map((aviso) => (
                    <div key={aviso.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground truncate">{aviso.titulo}</p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {aviso.destinatario_id
                              ? (aviso.colaboradores as any)?.nome || 'Específico'
                              : 'Todos'}
                          </span>
                        </div>
                        <p className="text-muted-foreground line-clamp-2">{aviso.mensagem}</p>
                        <p className="text-[11px] text-muted-foreground/70">
                          {new Date(aviso.criado_em).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingAvisoId === aviso.id}
                        onClick={() => deleteAviso(aviso.id)}
                        aria-label={`Excluir aviso ${aviso.titulo}`}
                        title="Excluir aviso"
                      >
                        {deletingAvisoId === aviso.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setShowNotificationModal(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cadastro das operações deste canal (Suporte Chat, Pit Stop, ...) */}
      <TagManagerDialog
        open={isTagsSetorDialogOpen}
        onOpenChange={setIsTagsSetorDialogOpen}
        tabela="tags_setor"
        setorId={setorId}
        titulo="Tags de setor"
        descricao="Operações que convivem dentro deste canal."
        exemploNome="Ex: Suporte Chat, Pit Stop..."
        tags={tagsSetorList.map((tag) => ({ ...tag, ordem: tag.ordem ?? 0 }))}
        carregando={false}
        onChanged={async () => {
          await fetchTagsList()
          mutate()
        }}
      />
    </div>
  )
}

/**
 * Wrapper com Suspense: useSearchParams() exige um boundary de Suspense para
 * o build do Next não falhar (missing-suspense-with-csr-bailout).
 */
export default function SetorPage() {
  return (
    <Suspense fallback={null}>
      <SetorPageInner />
    </Suspense>
  )
}
