'use client'

import { useRef } from "react"

import React, { useState, useMemo, useEffect, useTransition, Fragment, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useColaborador } from '@/lib/hooks/use-data'
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
  Filter,
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
  Rocket,
  Shield,
  Truck,
  CreditCard,
  HelpCircle,
  Timer,
  TrendingUp,
  CheckCircle,
  Activity,
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
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, isClientMessage, isBotMessage } from '@/lib/utils'
import { calcularOrigem, type OrigemTicket } from '@/lib/ticket-origem'
import { exportRelatorioCsv, exportRelatorioXlsx } from '@/lib/export-relatorio'
import { OrigemBadge } from '@/components/origem-badge'
import { MultiSelectFilter } from '@/components/monitoramento/multi-select-filter'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { Send, Hash, Check, Tag, Radio, Inbox, Layers } from 'lucide-react'
import { DisparoLogsSection } from '@/components/disparo-logs-section'
import { DisparosSection } from '@/components/setor/disparos-section'
import { HistoricoClienteSection } from '@/components/setor/historico-cliente-section'
import { AtendentesStatusModal, isAtendenteOnline } from '@/components/setor/atendentes-status-modal'
import { MessageMediaPreview } from '@/components/chat/message-media-preview'
import { TextoMensagem } from '@/components/chat/texto-mensagem'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
    supabase.from('tickets').select('*, numero, colaboradores(nome), clientes(nome, telefone)').eq('setor_id', setorId).in('status', ['aberto', 'em_atendimento']),
    // Tickets de hoje (para estatisticas)
    supabase.from('tickets').select('id, numero, status, criado_em, primeira_resposta_em, encerrado_em, atribuido_em').eq('setor_id', setorId).gte('criado_em', startOfDay),
    // Relatório de 90 dias removido daqui — agora é carregado separadamente
    supabase.from('colaboradores_setores').select('colaborador_id, colaboradores(id, nome, email, is_online, ativo, permissao_id, pausa_atual_id, last_heartbeat)').eq('setor_id', setorId),
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
  // Anexa _logs em cada ticket ativo (mesma chave usada no relatório)
  for (const t of ticketsAtivos as any[]) {
    (t as any)._logs = logsMap.get(t.id) || []
  }
  // Agrupar subsetores por colaborador
  const colabSubsetoresMap: Record<string, { id: string; nome: string }[]> = {}
  for (const cs of (colabSubsetoresRes.data || [])) {
    if (!colabSubsetoresMap[cs.colaborador_id]) colabSubsetoresMap[cs.colaborador_id] = []
    const subsetor = Array.isArray(cs.subsetores) ? cs.subsetores[0] : cs.subsetores
    if (subsetor) colabSubsetoresMap[cs.colaborador_id].push(subsetor as { id: string; nome: string })
  }
  const atendentes = atendentesSetor.map((as: any) => ({
    ...as.colaboradores,
    subsetor_ids: (colabSubsetoresMap[as.colaborador_id] || []).map((s: any) => s.id),
    subsetor_nomes: (colabSubsetoresMap[as.colaborador_id] || []).map((s: any) => s.nome),
  })).filter(Boolean)

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

      // Tempo médio de resolução total: criado_em → encerrado_em
      const ticketsResolvidos = ticketsHoje.filter((t: any) => t.status === 'encerrado' && t.encerrado_em && t.criado_em)
      const totalResolucao = ticketsResolvidos.reduce((acc: number, t: any) => {
        return acc + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime())
      }, 0)
      const tempoMedioResolucao = ticketsResolvidos.length > 0 ? totalResolucao / ticketsResolvidos.length : 0

      return {
        tempoMedioEspera: formatMs(tempoMedioEspera),
        tempoMedioResposta: formatMs(tempoMedioResolucao),
        tempoMedioPrimeiraResposta: formatMs(tempoMedio1aResp),
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

// Cards selecionáveis no relatório (mostrar/ocultar via "Personalizar")
const RELATORIO_CARDS_STORAGE_KEY = 'setor-relatorio-cards-v1'
const RELATORIO_COLLAPSED_STORAGE_KEY = 'setor-relatorio-collapsed-v1'
const RELATORIO_LAYOUT_STORAGE_KEY = 'setor-relatorio-layout-v4'

// Tamanho padrão (em colunas de 12 / linhas de grid) de cada card
const RELATORIO_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  kpiPrimeiraResposta: { w: 4, h: 2 },
  kpiResolucao: { w: 4, h: 2 },
  kpiRecebidos: { w: 4, h: 2 },
  kpiResolvidos: { w: 4, h: 2 },
  kpiTaxa: { w: 4, h: 2 },
  kpiNps: { w: 4, h: 2 },
  volume: { w: 6, h: 5 },
  heatmap: { w: 6, h: 5 },
  sla: { w: 6, h: 5 },
  nps: { w: 6, h: 4 },
  canal: { w: 4, h: 4 },
  status: { w: 4, h: 4 },
  roteamento: { w: 4, h: 4 },
  rankAtendente: { w: 4, h: 6 },
  rankPDV: { w: 4, h: 6 },
  rankTipo: { w: 4, h: 6 },
  matrizTipoTecnico: { w: 12, h: 6 },
  tabela: { w: 12, h: 7 },
}
const RELATORIO_COLLAPSED_H = 1

// Empacota os cards visíveis da esquerda p/ direita (quebra a cada 12 colunas)
function buildDefaultLayout(orderedIds: string[]): Layout[] {
  let x = 0, y = 0, rowH = 0
  return orderedIds.map((id) => {
    const d = RELATORIO_DEFAULT_SIZE[id] || { w: 6, h: 4 }
    if (x + d.w > 12) { x = 0; y += rowH; rowH = 0 }
    const item = { i: id, x, y, w: d.w, h: d.h }
    x += d.w
    rowH = Math.max(rowH, d.h)
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
  { id: 'heatmap', label: 'Horários de pico' },
  { id: 'sla', label: 'SLA de 1ª resposta' },
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
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-muted-foreground" onClick={onToggleCollapse} title="Expandir">
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
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onToggleCollapse} title="Minimizar">
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
function buildHeatmapData(tickets: any[]) {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0))
  let max = 0
  for (const t of tickets) {
    if (!t.criado_em) continue
    const d = new Date(t.criado_em)
    const dia = d.getDay()
    const bloco = Math.floor(d.getHours() / 2)
    matrix[dia][bloco]++
    if (matrix[dia][bloco] > max) max = matrix[dia][bloco]
  }
  return { matrix, max }
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
  const statusLabels: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', encerrado: 'Encerrado' }
  const statusMap: Record<string, number> = {}
  for (const ticket of tickets) {
    const st = ticket.status || 'desconhecido'
    statusMap[st] = (statusMap[st] || 0) + 1
  }
  const porStatus = Object.entries(statusMap).map(([status, count]) => ({ status: statusLabels[status] || status, count }))

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

// Client-side filters applied over the already-loaded report tickets
// (atendente + canal selects + cliente search). Shared by the current period
// view and the previous-period comparison so the Δ stays consistent.
function applyRelatorioFilters(
  list: any[],
  opts: { searchCliente: string; atendente: string; canal: string },
): any[] {
  let out = list
  if (opts.atendente !== 'all') {
    out = out.filter((t) => (t.colaboradores?.nome || '') === opts.atendente)
  }
  if (opts.canal !== 'all') {
    out = out.filter((t) => (t.canal || 'desconhecido') === opts.canal)
  }
  const term = opts.searchCliente.trim().toLowerCase()
  if (term) {
    const termPhone = term.replace(/\D/g, '')
    out = out.filter((t: any) => {
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
  return out
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

function SetorPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const setorId = params.id as string
  const { data: colaboradorLogado } = useColaborador()
  const [isPending, startTransition] = useTransition()
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)
  const [activeSection, setActiveSection] = useState('monitoramento')
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchAtendente, setSearchAtendente] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string[]>([])
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [subsetorFilter, setSubsetorFilter] = useState<string[]>([])
  const [subsetorFiltroOpen, setSubsetorFiltroOpen] = useState(false)
  const [, setTick] = useState(0) // Force re-render for time updates
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
  nexus_ativo: false,
  assistente_ia: false,
  assinatura_ativa: false,
  encerramento_auto_ativo: false,
  encerramento_auto_minutos: 30,
  })

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
  const [subsetores, setSubsetores] = useState<Subsetor[]>([])
  const [isSubsetorModalOpen, setIsSubsetorModalOpen] = useState(false)
  const [editingSubsetor, setEditingSubsetor] = useState<Subsetor | null>(null)
  const [subsetorForm, setSubsetorForm] = useState({ nome: '', descricao: '' })
  const [savingSubsetor, setSavingSubsetor] = useState(false)
  const [deletingSubsetorId, setDeletingSubsetorId] = useState<string | null>(null)

  // Pausas state
  interface Pausa {
    id: string
    nome: string
    descricao: string | null
    ativo: boolean
    setor_id: string
    criado_em: string
  }
  const [pausas, setPausas] = useState<Pausa[]>([])
  const [isPausaModalOpen, setIsPausaModalOpen] = useState(false)
  const [editingPausa, setEditingPausa] = useState<Pausa | null>(null)
  const [pausaForm, setPausaForm] = useState({ nome: '', descricao: '' })
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

  // Alterar status do atendente (admin)
  const handleAlterarStatusAtendente = async (colaboradorId: string, novoStatus: 'online' | 'offline') => {
    setAlterandoStatusId(colaboradorId)
    try {
      const { error } = await supabase
        .from('colaboradores')
        .update({
          is_online: novoStatus === 'online',
          pausa_atual_id: null,
        })
        .eq('id', colaboradorId)
      if (error) throw error
      toast.success(`Atendente marcado como ${novoStatus === 'online' ? 'Online' : 'Offline'}`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status')
    } finally {
      setAlterandoStatusId(null)
    }
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

  // Auto-scroll conversation to bottom when messages load.
  // Uses ResizeObserver to keep scrolling as images/audios load and resize the content.
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
  }, [conversationTab, loadingMessages, conversationMessages])
  const [transferringTo, setTransferringTo] = useState<string>('')
  const [transferSetorDestino, setTransferSetorDestino] = useState<string>('')
  const [transferAtendentesDestino, setTransferAtendentesDestino] = useState<any[]>([])
  const [loadingTransferAtendentes, setLoadingTransferAtendentes] = useState(false)

  const { data, isLoading, mutate } = useSWR(
    setorId ? ['setor-detail', setorId] : null,
    () => fetchSetorData(setorId),
    { revalidateOnFocus: false } // sem polling — Realtime com mutate() já atualiza a cada mudança de ticket
  )

  // Relatório separado: recarrega quando filtro de data muda (server-side filtering)
  const { from: dateFrom, to: dateTo } = getDateCutoffs(dateFilter, customRange)
  const { data: relatorioData, isLoading: relatorioLoading } = useSWR(
    setorId ? ['setor-relatorio', setorId, dateFilter, customRange?.from?.toISOString(), customRange?.to?.toISOString()] : null,
    async () => {
      let query = supabase
        .from('tickets')
        .select('*, numero, colaboradores(nome), clientes(nome, telefone, CNPJ, PDV)')
        .eq('setor_id', setorId)
        .order('criado_em', { ascending: false })
        .limit(1000)
      if (dateFrom) query = query.gte('criado_em', dateFrom)
      if (dateTo) query = query.lte('criado_em', dateTo)
      const { data: tickets } = await query
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

  // Período anterior equivalente (para o Δ% dos KPIs). Fetch enxuto — só os
  // campos necessários pros indicadores numéricos + joins p/ aplicar os mesmos
  // filtros client-side. NPS fica de fora (precisaria de avaliacoes).
  const prevPeriod = useMemo(() => getPrevPeriodCutoffs(dateFilter, customRange), [dateFilter, customRange])
  const { data: prevRelatorioData } = useSWR(
    setorId && prevPeriod ? ['setor-relatorio-prev', setorId, prevPeriod.from, prevPeriod.to] : null,
    async () => {
      const { data } = await supabase
        .from('tickets')
        .select('criado_em, status, primeira_resposta_em, encerrado_em, canal, colaboradores(nome), clientes(nome, telefone, CNPJ)')
        .eq('setor_id', setorId)
        .gte('criado_em', prevPeriod!.from)
        .lte('criado_em', prevPeriod!.to)
        .limit(1000)
      return data || []
    },
    { revalidateOnFocus: false }
  )

  // Avaliacoes por colaborador (para NPS nos cards de atendentes)
  const { data: avaliacoesColaboradores } = useSWR(
    setorId ? ['setor-avaliacoes-colaboradores', setorId] : null,
    async () => {
      const { data } = await supabase
        .from('avaliacoes')
        .select('colaborador_id, nota')
      return data || []
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
      setTick((t) => t + 1)
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

    // Removed the unfiltered `setor-colaboradores-realtime` channel — it was a global
    // subscription on the entire `colaboradores` table. SWR already polls this page
    // every 30s (refreshInterval: 30000), so colaborador status updates land within 30s.

    return () => {
      supabase.removeChannel(ticketsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId])

  const setor = data?.setor
  const stats = data?.stats || { total: 0, naFila: 0, emAtendimento: 0, finalizadosHoje: 0, tempoMaximoFila: '00:00:00', tempoMaximoResposta: '00:00:00', mediaTicketsPorAtendente: 0 }
  const atendentesStats = data?.atendentesStats || { online: 0, pausa: 0, invisivel: 0 }
  const ticketsHoje = data?.ticketsHoje || { perdidos: 0, abandonados: 0, finalizados: 0, fechados: 0 }
  const temposHoje = data?.temposHoje || { tempoMedioEspera: '00:00:00', tempoMedioResposta: '00:00:00', tempoMedioPrimeiraResposta: '00:00:00', tempoMedioAtendimento: '00:00:00' }
  const tickets = data?.tickets || []
  const ticketsRelatorioRaw = relatorioData || []

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

  // Mapa de "origem" pra todos os tickets (ativos + relatório).
  // Construído uma vez quando tickets mudam — usado nas tabelas pra renderizar
  // o badge de origem sem recalcular por linha.
  const origensMap = useMemo(() => {
    const allTickets = [...tickets, ...ticketsRelatorioRaw]
    const allLogs = allTickets.flatMap((t: any) => t._logs || [])
    return calcularOrigem(allTickets, allLogs, setoresLookup)
  }, [tickets, ticketsRelatorioRaw, setoresLookup])

  // Filtros client-side do relatório (busca por cliente + atendente + canal),
  // inicializados pela querystring. Aplicados sobre os tickets já carregados.
  const [searchCliente, setSearchCliente] = useState(() => searchParams.get('cliente') || '')
  const [relatorioAtendente, setRelatorioAtendente] = useState(() => searchParams.get('atendente') || 'all')
  const [relatorioCanal, setRelatorioCanal] = useState(() => searchParams.get('canal') || 'all')

  // Opções dos selects derivadas dos próprios tickets do período
  const relatorioAtendentesOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of ticketsRelatorioRaw) {
      if (t.colaboradores?.nome) set.add(t.colaboradores.nome)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [ticketsRelatorioRaw])
  const relatorioCanaisOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of ticketsRelatorioRaw) set.add(t.canal || 'desconhecido')
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [ticketsRelatorioRaw])

  const ticketsRelatorio = useMemo(
    () => applyRelatorioFilters(ticketsRelatorioRaw, { searchCliente, atendente: relatorioAtendente, canal: relatorioCanal }),
    [ticketsRelatorioRaw, searchCliente, relatorioAtendente, relatorioCanal]
  )

  // KPIs numéricos do período atual e do anterior (para o Δ%)
  const kpiAtual = useMemo(() => computeRelatorioKpis(ticketsRelatorio), [ticketsRelatorio])
  const kpiAnterior = useMemo(() => {
    if (!prevRelatorioData) return null
    const filtered = applyRelatorioFilters(prevRelatorioData, { searchCliente, atendente: relatorioAtendente, canal: relatorioCanal })
    return computeRelatorioKpis(filtered)
  }, [prevRelatorioData, searchCliente, relatorioAtendente, relatorioCanal])

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

  // Reflete os filtros do relatório na URL (link compartilhável/recarregável).
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
      if (relatorioAtendente !== 'all') next.set('atendente', relatorioAtendente)
      if (relatorioCanal !== 'all') next.set('canal', relatorioCanal)
      const qs = next.toString()
      const pathname = window.location.pathname
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customRange, searchCliente, relatorioAtendente, relatorioCanal])

  // Gráficos de Demanda com filtro de período próprio (independente do filtro global)
  const [volumePeriod, setVolumePeriod] = useState('7')
  const [heatmapPeriod, setHeatmapPeriod] = useState('7')
  const [chartTickets, setChartTickets] = useState<{ criado_em: string }[]>([])
  useEffect(() => {
    if (!setorId) return
    let cancelled = false
    ;(async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('tickets')
        .select('criado_em')
        .eq('setor_id', setorId)
        .gte('criado_em', cutoff)
        .order('criado_em', { ascending: false })
        .limit(1000)
      if (error) console.error('[charts] erro ao buscar tickets:', error)
      if (!cancelled) setChartTickets(data || [])
    })()
    return () => { cancelled = true }
  }, [setorId])
  // Fonte dos gráficos: fetch dedicado de 90 dias; se ainda vazio, usa os tickets já carregados
  const chartSource = chartTickets.length > 0 ? chartTickets : ticketsRelatorioRaw
  const volumeSerie = useMemo(
    () => buildSerieVolume(filterTicketsByDays(chartSource, Number(volumePeriod))),
    [chartSource, volumePeriod]
  )
  const heatmapData = useMemo(
    () => buildHeatmapData(filterTicketsByDays(chartSource, Number(heatmapPeriod))),
    [chartSource, heatmapPeriod]
  )

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

  // Personalização: quais cards do relatório aparecem (persistido no navegador)
  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RELATORIO_CARD_OPTIONS.map((o) => [o.id, true]))
  )
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
  useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem(RELATORIO_COLLAPSED_STORAGE_KEY)
      if (savedCollapsed) setCollapsedCards(JSON.parse(savedCollapsed))
      const savedLayout = window.localStorage.getItem(RELATORIO_LAYOUT_STORAGE_KEY)
      if (savedLayout) setSavedLgLayout(JSON.parse(savedLayout))
    } catch {}
  }, [])

  const toggleCollapse = (id: string) => {
    setCollapsedCards((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { window.localStorage.setItem(RELATORIO_COLLAPSED_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ids visíveis (ordem padrão usada só para gerar o layout inicial)
  const relatorioVisibleIds = useMemo(
    () => RELATORIO_CARD_OPTIONS.map((o) => o.id).filter((id) => visibleCards[id] ?? true),
    [visibleCards]
  )
  // Layout base (lg): salvo pelo usuário (com defaults p/ cards recém-exibidos) ou gerado
  const baseLgLayout = useMemo(() => {
    const defaults = buildDefaultLayout(relatorioVisibleIds)
    if (!savedLgLayout) return defaults
    const byId = new Map(savedLgLayout.map((l) => [l.i, l]))
    return relatorioVisibleIds.map((id) => byId.get(id) || defaults.find((d) => d.i === id)!)
  }, [savedLgLayout, relatorioVisibleIds])
  // Aplica o colapso: cards minimizados ficam baixos e sem redimensionar
  const effectiveLgLayout = useMemo(
    () => baseLgLayout.map((l) => (collapsedCards[l.i] ? { ...l, h: RELATORIO_COLLAPSED_H, isResizable: false } : l)),
    [baseLgLayout, collapsedCards]
  )
  const handleLayoutChange = (current: Layout[]) => {
    // não persiste a altura reduzida de cards minimizados (preserva a expandida)
    const prevById = new Map(baseLgLayout.map((l) => [l.i, l]))
    const merged = current.map((l) => (collapsedCards[l.i] ? { ...l, h: prevById.get(l.i)?.h ?? l.h } : l))
    setSavedLgLayout(merged)
    try { window.localStorage.setItem(RELATORIO_LAYOUT_STORAGE_KEY, JSON.stringify(merged)) } catch {}
  }
  const wprops = (id: string) => ({
    editMode,
    label: RELATORIO_CARD_OPTIONS.find((o) => o.id === id)?.label || id,
    collapsed: !!collapsedCards[id],
    onToggleCollapse: () => toggleCollapse(id),
  })

  const horarios = data?.horarios || []
  const atendentes = data?.atendentes || []
  const permissoes = data?.permissoes || []
  const pausasData = data?.pausas || []

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
        nexus_ativo: setor.nexus_ativo || false,
        assistente_ia: setor.assistente_ia || false,
        assinatura_ativa: setor.assinatura_ativa || false,
        encerramento_auto_ativo: setor.encerramento_auto_ativo || false,
        encerramento_auto_minutos: setor.encerramento_auto_minutos ?? 30,
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

  // Fetch subsetores
  const fetchSubsetores = async () => {
    const { data } = await supabase
      .from('subsetores')
      .select('*')
      .eq('setor_id', setorId)
      .order('nome')
    if (data) setSubsetores(data)
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
    const { data } = await supabase.from('tags').select('id, nome, cor').order('nome')
    if (data) setTagsList(data)
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

  

  // Helper function to format time duration
  const formatDuration = (startDate: string | null, endDate: string | Date | null) => {
    if (!startDate) return '0min'
    const start = new Date(startDate).getTime()
    const end = endDate ? new Date(endDate).getTime() : Date.now()
    const diffMs = Math.max(0, end - start)
    const totalMin = Math.floor(diffMs / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    // Curto e legível: "1h 30min", "30min", "2h", "0min"
    if (h > 0 && m > 0) return `${h}h ${m}min`
    if (h > 0) return `${h}h`
    return `${m}min`
  }

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || t.status === 'aberto')
      .filter((t: any) => {
        if (atendenteFilter.length > 0 && !atendenteFilter.includes(t.colaborador_id)) return false
        if (subsetorFilter.length > 0 && !subsetorFilter.includes(t.subsetor_id || 'sem_subsetor')) return false
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      .map((t: any) => ({
        id: t.id,
        numero: t.numero ?? null,
        // Tempo na fila = criado_em → atribuido_em (tempo aguardando atendente)
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'  // atribuído mas sem registro de atribuido_em
            : formatDuration(t.criado_em, null), // ainda na fila
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        // Tempo de atendimento = atribuido_em → agora (ou criado_em como fallback)
        tempoAtendimento: t.colaborador_id ? formatDuration(t.atribuido_em || t.criado_em, null) : '0min',
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: setor?.nome || '',
        atendente: t.colaboradores?.nome || null,
        prioridade: t.prioridade,
        status: t.status,
        criado_em: t.criado_em,
        primeira_resposta_em: t.primeira_resposta_em,
        colaborador_id: t.colaborador_id,
        clientes: t.clientes,
        colaboradores: t.colaboradores,
      }))
  }, [tickets, searchTerm, setor, atendenteFilter, subsetorFilter])

  const atendenteFiltroOptions = useMemo(() => {
    const order = (x: any) => (x.is_online && !x.pausa_atual_id ? 0 : x.pausa_atual_id ? 1 : 2)
    const temTicket = (id: string) =>
      tickets.some((t: any) => t.colaborador_id === id && (t.status === 'em_atendimento' || t.status === 'aberto'))
    return [...atendentes]
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
  }, [atendentes, tickets])

  const subsetorFiltroOptions = useMemo(
    () => [
      { id: 'sem_subsetor', nome: 'Sem subsetor' },
      ...subsetores.filter((s: any) => s.ativo).map((s: any) => ({ id: s.id, nome: s.nome })),
    ],
    [subsetores],
  )

  const ticketsAguardando = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'aberto' && !t.colaborador_id)
      .filter((t: any) => {
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      .map((t: any) => ({
        id: t.id,
        numero: t.numero ?? null,
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: setor?.cor || '',
        prioridade: t.prioridade,
        status: t.status,
        criado_em: t.criado_em,
        colaborador_id: t.colaborador_id,
        clientes: t.clientes,
        colaboradores: t.colaboradores,
      }))
  }, [tickets, searchTerm, setor])

const handleLogout = async () => {
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
      // Get current user as sender
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Usuário não autenticado')
        return
      }

      // Get sender name
      const { data: senderData } = await supabase
        .from('colaboradores')
        .select('id, nome')
        .eq('email', user.email)
        .single()

      if (!senderData) {
        toast.error('Remetente não encontrado')
        return
      }

      if (notificationForm.destinatario === 'todos') {
        // Send to all colaboradores in this setor
        const { error } = await supabase.from('notificacoes').insert({
          setor_id: setor?.id,
          remetente_id: senderData.id,
          destinatario_id: null, // null means all in setor
          titulo: notificationForm.titulo,
          mensagem: notificationForm.mensagem,
        })

        if (error) throw error
        toast.success('Notificação enviada para todos do setor')
      } else {
        // Send to specific colaborador
        const { error } = await supabase.from('notificacoes').insert({
          setor_id: setor?.id,
          remetente_id: senderData.id,
          destinatario_id: notificationForm.destinatario,
          titulo: notificationForm.titulo,
          mensagem: notificationForm.mensagem,
        })

        if (error) throw error
        toast.success('Notificação enviada')
      }

      setNotificationForm({ destinatario: 'todos', titulo: '', mensagem: '' })
      await fetchAvisosEnviados()
    } catch (error: any) {
      console.error('Error sending notification:', error)
      toast.error('Erro ao enviar notificação')
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
    setSaving(true)
    try {
      const { error } = await supabase
        .from('setores')
  .update({
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
  })
        .eq('id', setorId)

      if (error) throw error
      toast.success('Configurações salvas com sucesso!')
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

    try {
      if (editingPausa) {
        const { error } = await supabase
          .from('pausas')
          .update({
            nome: pausaForm.nome.trim(),
            descricao: pausaForm.descricao.trim() || null,
          })
          .eq('id', editingPausa.id)
        if (error) throw error
        toast.success('Pausa atualizada!')
      } else {
        const { error } = await supabase.from('pausas').insert({
          setor_id: setorId,
          nome: pausaForm.nome.trim(),
          descricao: pausaForm.descricao.trim() || null,
        })
        if (error) throw error
        toast.success('Pausa criada!')
      }

      setIsPausaModalOpen(false)
      setEditingPausa(null)
      setPausaForm({ nome: '', descricao: '' })
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
    setPausaForm({ nome: pausa.nome, descricao: pausa.descricao || '' })
    setIsPausaModalOpen(true)
  }

  const openNewPausa = () => {
    setEditingPausa(null)
    setPausaForm({ nome: '', descricao: '' })
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

      // Query 2: Mensagens órfãs do cliente (bot) nas 24h antes do ticket
      let preTicketMsgs: any[] = []
      const clienteTelefone = ticket.clientes?.telefone
      if (clienteTelefone) {
        // Buscar todos cliente_ids com mesmo telefone (handles duplicates)
        const { data: allClientes } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefone', clienteTelefone)
        const clienteIds = allClientes?.map((c: any) => c.id) || [ticket.cliente_id].filter(Boolean)

        if (clienteIds.length > 0 && ticket.criado_em) {
          const before24h = new Date(new Date(ticket.criado_em).getTime() - 24 * 60 * 60 * 1000).toISOString()
          const { data: orphanMsgs } = await supabase
            .from('mensagens')
            .select('*')
            .in('cliente_id', clienteIds)
            .is('ticket_id', null)
            .gte('enviado_em', before24h)
            .lt('enviado_em', ticket.criado_em)
            .order('enviado_em', { ascending: true })
          preTicketMsgs = orphanMsgs || []
        }
      }

      // Merge e deduplicar
      const allMsgs = [...preTicketMsgs, ...(ticketMsgs || [])]
      const seen = new Set<string>()
      const deduped = allMsgs.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })

      // Marcar onde começa o ticket para separador visual
      if (preTicketMsgs.length > 0 && ticketMsgs && ticketMsgs.length > 0) {
        ticketMsgs[0]._ticketStart = true
      }

      setConversationMessages(deduped)
    } catch (error) {
      toast.error('Erro ao carregar mensagens')
    } finally {
      setLoadingMessages(false)
    }
  }

  // Close conversation
  const closeConversation = () => {
    setSelectedTicket(null)
    setConversationMessages([])
    setNotaInterna('')
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
  const fetchTransferAtendentes = async (targetSetorId: string) => {
    setLoadingTransferAtendentes(true)
    setTransferringTo('')
    try {
      const { data: csData } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id')
        .eq('setor_id', targetSetorId)
      if (csData && csData.length > 0) {
        const ids = csData.map((cs: any) => cs.colaborador_id)
        const { data: colabData } = await supabase
          .from('colaboradores')
          .select('id, nome, is_online, ativo, last_heartbeat')
          .in('id', ids)
          .eq('ativo', true)
        setTransferAtendentesDestino(colabData || [])
      } else {
        setTransferAtendentesDestino([])
      }
    } catch {
      setTransferAtendentesDestino([])
    } finally {
      setLoadingTransferAtendentes(false)
    }
  }

  const handleTransferSetorChange = (val: string) => {
    setTransferSetorDestino(val)
    if (val && val !== setorId) {
      fetchTransferAtendentes(val)
    } else if (val === setorId) {
      // Mesmo setor: usar atendentes locais
      setTransferAtendentesDestino([])
    }
  }

  const HEARTBEAT_STALE_MS_TRANSFER = 2 * 60 * 1000
  const isTransferAtendenteOnline = (a: any) => {
    if (!a?.is_online || !a?.ativo) return false
    if (!a.last_heartbeat) return false
    return (Date.now() - new Date(a.last_heartbeat).getTime()) < HEARTBEAT_STALE_MS_TRANSFER
  }

  const transferTicket = async () => {
    if (!selectedTicket) return

    const isOutroSetor = transferSetorDestino && transferSetorDestino !== setorId
    const hasAtendente = !!transferringTo && transferringTo !== '__fila__'

    // Precisa de pelo menos um setor diferente ou um atendente selecionado
    if (!isOutroSetor && !hasAtendente) return

    try {
      const fromColabName = atendentes.find((a: any) => a.id === selectedTicket.colaborador_id)?.nome || 'Sem atendente'
      const fromSetorNome = data?.setor?.nome || 'Setor'

      const res = await fetch('/api/tickets/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          setor_id: isOutroSetor ? transferSetorDestino : undefined,
          colaborador_id: hasAtendente ? transferringTo : null,
          from_colaborador_nome: fromColabName,
          from_setor_nome: fromSetorNome,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Erro ao transferir ticket')
        return
      }

      if (result.queued) {
        toast.info('Atendente no limite de tickets — ticket adicionado à fila de espera')
      } else {
        toast.success('Ticket transferido com sucesso!')
      }
      setTransferringTo('')
      setTransferSetorDestino('')
      setTransferAtendentesDestino([])
      closeConversation()
      mutate()
    } catch (error) {
      toast.error('Erro ao transferir ticket')
    }
  }

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
      <header className="flex h-14 items-center justify-between border-b glass-header px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-3 rounded-md text-foreground hover:text-primary transition-all cursor-pointer select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isNavigatingBack ? "bg-primary/20" : "hover:bg-muted"
            )}>
              {isNavigatingBack ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeft className="h-4 w-4" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: setor?.cor || '#3B82F6' }}
              >
                <SetorIcon className="h-4 w-4 text-white" />
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : (
                <span className="font-semibold">{setor?.nome || 'Setor'}</span>
              )}
            </div>
          </button>
        </div>

        {/* Theme Toggle & User Menu */}
        <div className="flex items-center gap-2">
          {/* Send Notification Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNotificationModal(true)}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar Aviso</span>
          </Button>

          {/* Busca rápida — atalho ⌘K (somente indicativo) */}
          <kbd className="kbd hidden md:inline-flex" aria-hidden="true">Ctrl K</kbd>

          <ThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <User className="h-4 w-4" />
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
        {/* Sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r glass-panel p-4">
          <nav className="space-y-1">
            {sidebarItems.filter((item) => !(item as any).whatsappOnly || configForm.canal !== 'discord').map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left text-sm transition-all cursor-pointer select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className={cn('font-medium', !isActive && 'text-foreground')}>{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {/* Monitoramento Section */}
          {activeSection === 'monitoramento' && (
            <div className="space-y-6 anim-rise">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">Monitoramento de atendimento</h1>
                  <div className="flex items-center gap-1.5">
                    <span className="signal-dot" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">Ao vivo</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                    <Filter className="h-4 w-4" />
                    Filtros
                  </Button>
                </div>
              </div>

              {/* Quick Filters */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filtros rápidos:</span>
                <Badge variant="secondary" className="cursor-pointer hover:bg-primary/20">Filas</Badge>
              </div>

              {/* Stats Cards Row 1 */}
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
                {/* Atendimentos em tempo real */}
                <Card className="glass-card-elevated rounded-lg border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Atendimentos em tempo real
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-6 gap-3 text-center">
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
                        <p className="text-2xl font-bold text-green-500 tabular-nums">{stats.finalizadosHoje}</p>
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
                <Card className="glass-card-elevated rounded-lg">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
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
                        <p className="text-2xl font-bold text-muted-foreground tabular-nums">{atendentesStats.invisivel}</p>
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
              <div className="grid gap-4 lg:grid-cols-2">
{/* Atendimento hoje */}
              <Card className="glass-card-elevated rounded-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Atendimento hoje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground tabular-nums">{temposHoje.tempoMedioEspera}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. espera</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground tabular-nums">{temposHoje.tempoMedioResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. resposta</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground tabular-nums">{temposHoje.tempoMedioPrimeiraResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. 1ª resp.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground tabular-nums">{temposHoje.tempoMedioAtendimento}</p>
                      <p className="text-xs text-muted-foreground">Tempo méd. atend.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

{/* Status dos tickets hoje */}
              <Card className="glass-card-elevated rounded-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Status dos tickets hoje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-red-500 tabular-nums">{ticketsHoje.perdidos}</p>
                      <p className="text-xs text-muted-foreground">Perdidos</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-orange-500 tabular-nums">{ticketsHoje.abandonados}</p>
                      <p className="text-xs text-muted-foreground">Abandonados</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-green-500 tabular-nums">{ticketsHoje.finalizados}</p>
                      <p className="text-xs text-muted-foreground">Finalizados</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-blue-500 tabular-nums">{ticketsHoje.fechados}</p>
                      <p className="text-xs text-muted-foreground">Fechados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Filters 2 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filtros rápidos:</span>
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors">Atendentes</Badge>
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors">Contato</Badge>
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors">Status do atendente</Badge>
            </div>

            {/* Monitoramento Detalhado - Blip Style */}
            <Card className="glass-card-elevated rounded-lg">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Monitoramento detalhado</CardTitle>
                  <div className="flex items-center gap-2">
                    {subsetorFiltroOptions.length > 1 && (
                      <MultiSelectFilter
                        icon={Layers}
                        placeholder="Subsetor"
                        header="Filtrar por subsetor"
                        pluralWord="subsetores"
                        options={subsetorFiltroOptions}
                        selected={subsetorFilter}
                        onChange={setSubsetorFilter}
                        open={subsetorFiltroOpen}
                        onOpenChange={setSubsetorFiltroOpen}
                      />
                    )}
                    <MultiSelectFilter
                      icon={User}
                      placeholder="Atendente"
                      header="Acompanhar atendentes"
                      pluralWord="atendentes"
                      options={atendenteFiltroOptions}
                      selected={atendenteFilter}
                      onChange={setAtendenteFilter}
                      open={filtrosOpen}
                      onOpenChange={setFiltrosOpen}
                      searchable
                    />
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar pelo Nº do ticket"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-52 pl-9 h-9"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {/* Tabs */}
                <div className="border-b border-border mb-4">
                  <div className="flex gap-0">
                    <button
                      onClick={() => setActiveTab('em-andamento')}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                        activeTab === 'em-andamento'
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      Atribuído/Em andamento
                    </button>
                    <button
                      onClick={() => setActiveTab('aguardando')}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
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
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                        activeTab === 'atendentes'
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      Atendentes
                    </button>
                    <button
                      onClick={() => setActiveTab('filas')}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                        activeTab === 'filas'
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      Filas
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
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo na fila</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1ª Resposta</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo atend.</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fila</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendente</TableHead>
                            <TableHead className="text-xs w-[60px]"></TableHead>
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
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                              </TableRow>
                            ))
                          ) : ticketsEmAndamento.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground/50" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum atendimento no momento</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Os atendimentos ativos aparecem aqui em tempo real.</p>
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
                                  <TableCell className="text-sm tabular-nums text-foreground">{ticket.tempoNaFila}</TableCell>
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
                                    <span className="block truncate" title={ticket.fila || setor?.nome}>{ticket.fila || setor?.nome}</span>
                                  </TableCell>
                                  <TableCell className="text-sm text-foreground">{ticket.atendente || '-'}</TableCell>
                                  <TableCell>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7"
                                      onClick={() => openConversation(ticket)}
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

                  {/* Aguardando Tab */}
                  {activeTab === 'aguardando' && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo na fila</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fila</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</TableHead>
                            <TableHead className="text-xs w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <TableRow key={i}>
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
                              <TableCell colSpan={7} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground/50" />
                                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhum ticket aguardando atendimento</p>
                                  <p className="text-xs mt-1">Tickets só são atribuídos quando há atendentes online</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            ticketsAguardando.map((ticket: any) => (
                              <TableRow key={ticket.id} className="bg-yellow-50/50 dark:bg-yellow-950/20">
                                <TableCell>
                                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                    <Clock className="mr-1 h-3 w-3" />
                                    Aguardando...
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
                                  <span className="block truncate" title={setor?.nome}>{setor?.nome}</span>
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

                  {/* Atendentes Tab */}
                  {activeTab === 'atendentes' && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendente</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">Em atendimento</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">Finalizados hoje</TableHead>
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
                          ) : (
                            atendentes.map((atendente: any) => {
                              const ticketsDoAtendente = tickets.filter(
                                (t: any) => t.colaborador_id === atendente.id && t.status === 'em_atendimento'
                              ).length
                              const isOnPause = !!atendente.pausa_atual_id
                              const isOnline = atendente.is_online
                              const statusDisplay = isOnPause
                                ? { color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400', label: 'Ausente' }
                                : isOnline
                                  ? { color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', label: 'Online' }
                                  : { color: 'bg-gray-400', textColor: 'text-muted-foreground', label: 'Offline' }
                              const isChanging = alterandoStatusId === atendente.id
                              return (
                                <TableRow key={atendente.id}>
                                  <TableCell className="text-sm font-medium text-foreground">{atendente.nome}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className={cn('h-2 w-2 rounded-full shrink-0', statusDisplay.color)} />
                                      <span className={cn('text-sm', statusDisplay.textColor)}>{statusDisplay.label}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm tabular-nums text-center font-medium">{ticketsDoAtendente}</TableCell>
                                  <TableCell className="text-sm tabular-nums text-center font-medium">0</TableCell>
                                  <TableCell className="text-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={isChanging}
                                        >
                                          {isChanging
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            : <MoreHorizontal className="h-3.5 w-3.5" />
                                          }
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem
                                          disabled={isOnline && !isOnPause}
                                          onClick={() => handleAlterarStatusAtendente(atendente.id, 'online')}
                                          className="gap-2"
                                        >
                                          <CircleCheck className="h-4 w-4 text-green-500" />
                                          Marcar como Online
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          disabled={!isOnline && !isOnPause}
                                          onClick={() => handleAlterarStatusAtendente(atendente.id, 'offline')}
                                          className="gap-2"
                                        >
                                          <CircleOff className="h-4 w-4 text-muted-foreground" />
                                          Marcar como Offline
                                        </DropdownMenuItem>
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
                  )}

                  {/* Filas Tab */}
                  {activeTab === 'filas' && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <AlertCircle className="mb-2 h-8 w-8" />
                      <p>Configuração de filas em desenvolvimento</p>
                    </div>
                  )}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Resultados por página:</span>
                    <Select defaultValue="5">
                      <SelectTrigger className="h-8 w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span>1-{Math.min(5, tickets.length)} de {tickets.length}</span>
                    <div className="flex items-center gap-0.5 ml-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                        <ChevronFirst className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="px-2">1</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ChevronLast className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Warning Note */}
            {ticketsEmAndamento.some((t: any) => t.status === 'em_atendimento' && !t.primeira_resposta_em) && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>O destaque amarelo sinaliza que um ticket foi atribuído a um atendente, mas o contato ainda não recebeu a primeira resposta.</span>
              </div>
            )}
          </div>
        )}

        {/* Relatórios Section */}
        {activeSection === 'relatorios' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between anim-rise">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Relatorios de Atendimento</h1>
              </div>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Eye className="h-4 w-4" />
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
                      <Check className="h-4 w-4" />
                      Concluir
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditMode(true)}>
                    <Settings className="h-4 w-4" />
                    Personalizar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" disabled={ticketsRelatorio.length === 0}>
                      <Download className="h-4 w-4" />
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

            {/* Filtros client-side: atendente + canal (sobre os tickets já carregados) */}
            <div className="flex flex-wrap items-center gap-2 anim-rise">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filtrar:
              </span>
              <Select value={relatorioAtendente} onValueChange={setRelatorioAtendente}>
                <SelectTrigger className="h-9 w-[200px] text-sm">
                  <SelectValue placeholder="Atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  {relatorioAtendentesOptions.map((nome) => (
                    <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={relatorioCanal} onValueChange={setRelatorioCanal}>
                <SelectTrigger className="h-9 w-[180px] text-sm">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os canais</SelectItem>
                  {relatorioCanaisOptions.map((canal) => (
                    <SelectItem key={canal} value={canal} className="capitalize">{canal}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(relatorioAtendente !== 'all' || relatorioCanal !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-muted-foreground"
                  onClick={() => { setRelatorioAtendente('all'); setRelatorioCanal('all') }}
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-nums>
                {ticketsRelatorio.length} de {ticketsRelatorioRaw.length} atendimentos
              </span>
            </div>

            {editMode && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Modo de personalização: arraste pelo punho <GripVertical className="inline h-3 w-3" /> para mover e use o canto inferior‑direito para redimensionar. Clique em <strong>Concluir</strong> para fixar.
              </div>
            )}
            {/* ===== Relatórios — cartões (fixos; editáveis no modo Personalizar) ===== */}
            <ResponsiveReactGridLayout
              layouts={{ lg: effectiveLgLayout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={64}
              margin={[16, 16]}
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tempo médio 1a resposta</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl lg:text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.tempoMedioPrimeiraResposta}</p>
                        <DeltaBadge current={kpiAtual.tmaPrimeiraRespostaMs} previous={kpiAnterior?.tmaPrimeiraRespostaMs} invert />
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                      <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tempo médio resolução</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl lg:text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.tempoMedioResolucao}</p>
                        <DeltaBadge current={kpiAtual.tmaResolucaoMs} previous={kpiAnterior?.tmaResolucaoMs} invert />
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tickets recebidos</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl lg:text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.totalRecebidos}</p>
                        <DeltaBadge current={kpiAtual.recebidos} previous={kpiAnterior?.recebidos} />
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tickets resolvidos</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl lg:text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.totalResolvidos}</p>
                        <DeltaBadge current={kpiAtual.resolvidos} previous={kpiAnterior?.resolvidos} />
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                      <UserCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Taxa de resolução</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl lg:text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.taxaResolucao}%</p>
                        <DeltaBadge current={kpiAtual.taxaResolucao} previous={kpiAnterior?.taxaResolucao} />
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
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
              <Card className="glass-card-elevated rounded-lg h-full">
                <CardContent className="p-5 h-full flex items-center">
                  <div className="flex w-full items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">NPS Score</p>
                      <div>
                        <p className={cn(
                          "text-xl lg:text-2xl font-semibold tracking-tight tabular-nums",
                          relatorioStats.npsScore >= 50 ? 'text-green-600' :
                          relatorioStats.npsScore >= 0 ? 'text-yellow-600' :
                          'text-red-600'
                        )}>
                          {relatorioStats.totalAvaliacoes > 0 ? relatorioStats.npsScore : '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">{relatorioStats.totalAvaliacoes} avaliações</p>
                      </div>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                      <Star className="h-5 w-5 text-rose-600 dark:text-rose-400" />
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
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
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
                  <CardContent className="min-h-0 flex-1">
                    {volumeSerie.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <TrendingUp className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Sem dados no período</p>
                      </div>
                    ) : (
                      <div
                        className="h-full min-h-[180px] w-full"
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

            {/* Horários de pico (heatmap) */}
            {visibleCards.heatmap && (
            <div key="heatmap" className="overflow-hidden">
            <ReportWidget {...wprops('heatmap')}>
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Horários de pico
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
                    <p className="text-xs text-muted-foreground">Concentração por dia da semana e faixa de hora.</p>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1">
                    {heatmapData.max === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Clock className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Sem dados no período</p>
                      </div>
                    ) : (
                      <div
                        className="flex h-full flex-col gap-1 text-[10px]"
                        role="img"
                        aria-label="Mapa de calor de horários de pico por dia da semana e faixa de hora"
                      >
                        <div className="flex items-center gap-1">
                          <div className="w-8 shrink-0" />
                          {Array.from({ length: 12 }).map((_, b) => (
                            <div key={b} className="flex-1 text-center text-muted-foreground">{b % 2 === 0 ? b * 2 : ''}</div>
                          ))}
                        </div>
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia, di) => (
                          <div key={dia} className="flex flex-1 items-stretch gap-1 min-h-[14px]">
                            <div className="w-8 shrink-0 flex items-center text-muted-foreground">{dia}</div>
                            {heatmapData.matrix[di].map((v: number, b: number) => {
                              const intensity = heatmapData.max > 0 ? v / heatmapData.max : 0
                              return (
                                <div
                                  key={b}
                                  className="flex-1 rounded-sm"
                                  title={`${dia} ${b * 2}h–${b * 2 + 2}h: ${v} atendimento(s)`}
                                  style={{ backgroundColor: v === 0 ? 'var(--muted)' : `rgba(249, 115, 22, ${0.15 + intensity * 0.85})` }}
                                />
                              )
                            })}
                          </div>
                        ))}
                      </div>
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
                <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      SLA de 1ª resposta
                    </CardTitle>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.slaDentroDaMeta}%</span>
                      <span className="text-xs text-muted-foreground">respondidos em até 15 min</span>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1">
                    <div
                      className="h-full min-h-[160px] w-full"
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
                <Card className="glass-card-elevated rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Satisfação (NPS)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {relatorioStats.totalAvaliacoes === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Star className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Nenhuma avaliação no período</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div
                          className="h-[180px] w-[180px] shrink-0 relative"
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
                                innerRadius={55}
                                outerRadius={80}
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
                            <span className="text-2xl font-semibold tracking-tight tabular-nums">{relatorioStats.satisfacao.nps}</span>
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
                <Card className="glass-card-elevated rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Radio className="h-4 w-4" />
                      Por canal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {relatorioStats.porCanal.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>
                    ) : (
                      <div className="space-y-3">
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
                <Card className="glass-card-elevated rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Por resultado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {relatorioStats.porStatus.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>
                    ) : (
                      <div className="space-y-3">
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
                <Card className="glass-card-elevated rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Transferências &amp; transbordos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-2">
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
                    <p className="text-[11px] text-muted-foreground pt-1">Altas taxas indicam possível erro de roteamento inicial.</p>
                  </CardContent>
                </Card>
            </ReportWidget>
            </div>
            )}

            {/* Tickets por atendente */}
            {visibleCards.rankAtendente && (
            <div key="rankAtendente" className="overflow-hidden">
            <ReportWidget {...wprops('rankAtendente')}>
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Tickets por atendente
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                {relatorioStats.ticketsPorAtendente.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento registrado</p>
                  </div>
                ) : (
                  <div className="space-y-3 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorAtendente.map((atendente: { id: string | null; nome: string; count: number; avgPrimeiraRespostaMs: number | null }, index: number) => {
                      const npsEntry = atendente.id ? mediaNPSPorColaborador.get(atendente.id) : undefined
                      const mediaNota = npsEntry && npsEntry.total > 0 ? (npsEntry.soma / npsEntry.total).toFixed(1) : null
                      return (
                      <div key={atendente.id || atendente.nome} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
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
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Tickets por PDV
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                {relatorioStats.ticketsPorPDV.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Hash className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum dado de PDV encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-3 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorPDV.map((item: { pdv: string; count: number }, index: number) => (
                      <div key={item.pdv} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/50 text-xs font-medium">
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
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tipos de Atendimento
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Principais motivos/produtos dos atendimentos encerrados no período.
                </p>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                {relatorioStats.ticketsPorTipo.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Tag className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento classificado no período</p>
                  </div>
                ) : (
                  <div className="space-y-3 h-full overflow-y-auto">
                    {relatorioStats.ticketsPorTipo.map((item: { tipo: string; count: number }, index: number) => (
                      <div key={item.tipo} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/50 text-xs font-medium">
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
              <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Total por tipo, por técnico
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Quantos atendimentos de cada tipo cada atendente encerrou no período.
                  </p>
                </CardHeader>
                <CardContent className="min-h-0 flex-1">
                  {relatorioStats.tiposPorAtendente.length === 0 || relatorioStats.tiposColunas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Tag className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
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
            <Card className="glass-card-elevated rounded-lg flex h-full flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Últimos atendimentos
                  </CardTitle>
                  <div className="relative w-72">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, telefone ou CNPJ..."
                      value={searchCliente}
                      onChange={(e) => setSearchCliente(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2 min-h-0 flex-1">
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
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
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
                                  ticket.status === 'encerrado' && 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800',
                                  ticket.status === 'em_atendimento' && 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
                                  ticket.status === 'aberto' && 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800'
                                )}
                              >
                                {ticket.status === 'encerrado' ? 'Finalizado' : ticket.status === 'em_atendimento' ? 'Em atend.' : 'Aberto'}
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
                              >
                                <MessageCircle className="h-4 w-4" />
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
        <div className="space-y-6 anim-rise">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Atendentes</h1>
            <Button onClick={openCreateAtendenteModal} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Atendente
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail"
                value={searchAtendente}
                onChange={(e) => setSearchAtendente(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtrar por:</span>
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                Status
              </Badge>
            </div>
          </div>

          {/* Atendentes List */}
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 grid grid-cols-4 gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                </Card>
              ))
            ) : atendentes.length === 0 ? (
              <Card className="glass-card-elevated rounded-lg p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold tracking-tight">Nenhum atendente cadastrado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Adicione atendentes para começar a receber tickets neste setor.
                  </p>
                  <Button onClick={openCreateAtendenteModal} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar atendente
                  </Button>
                </div>
              </Card>
            ) : (
              atendentes
                .filter((atendente: any) => {
                  if (!searchAtendente) return true
                  const term = searchAtendente.toLowerCase()
                  return (
                    atendente.nome?.toLowerCase().includes(term) ||
                    atendente.email?.toLowerCase().includes(term)
                  )
                })
                .map((atendente: any) => {
                const initials = atendente.nome
                  ?.split(' ')
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'AT'
                const ticketsDoAtendente = tickets.filter(
                  (t: any) => t.colaborador_id === atendente.id && t.status === 'em_atendimento'
                ).length

                return (
                  <Card key={atendente.id} className="rounded-lg transition-colors hover:border-[var(--border-strong)]">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white",
                          atendente.is_online ? "bg-primary" : "bg-gray-400"
                        )}>
                          {initials}
                        </div>

                        {/* Info Grid */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
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
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                disabled={atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => handleAlterarStatusAtendente(atendente.id, 'online')}
                                className="gap-2"
                              >
                                <CircleCheck className="h-4 w-4 text-green-500" />
                                Marcar como Online
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => handleAlterarStatusAtendente(atendente.id, 'offline')}
                                className="gap-2"
                              >
                                <CircleOff className="h-4 w-4 text-muted-foreground" />
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
                              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" disabled={alterandoStatusId === atendente.id}>
                                {alterandoStatusId === atendente.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <MoreHorizontal className="h-4 w-4" />
                                }
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                disabled={atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => handleAlterarStatusAtendente(atendente.id, 'online')}
                                className="gap-2"
                              >
                                <CircleCheck className="h-4 w-4 text-green-500" />
                                Marcar como Online
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!atendente.is_online && !atendente.pausa_atual_id}
                                onClick={() => handleAlterarStatusAtendente(atendente.id, 'offline')}
                                className="gap-2"
                              >
                                <CircleOff className="h-4 w-4 text-muted-foreground" />
                                Marcar como Offline
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditAtendenteModal(atendente)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteConfirm({ id: atendente.id, nome: atendente.nome })}
                          >
                            <Trash2 className="h-4 w-4" />
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
          {atendentes.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Resultados por página:</span>
                <Select defaultValue="5">
                  <SelectTrigger className="h-8 w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>1-{atendentes.length} de {atendentes.length}</span>
                <div className="flex items-center gap-0.5 ml-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2">1</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Horários de Atendimento</h1>
            <p className="text-muted-foreground">
              Defina quais dias e horários seus atendentes estarão disponíveis
            </p>
          </div>
          <Button onClick={saveHorarios} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Horários'}
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              {DIAS_SEMANA.map((dia) => {
                const horario = horariosEdit.find((h) => h.dia_semana === dia.value)
                return (
                  <div
                    key={dia.value}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-lg border transition-colors',
                      horario?.ativo ? 'bg-card' : 'bg-muted/50'
                    )}
                  >
                    <Switch
                      checked={horario?.ativo || false}
                      onCheckedChange={(checked) =>
                        updateHorario(dia.value, 'ativo', checked)
                      }
                    />
                    <span className="w-36 font-medium">{dia.label}</span>
                    {horario?.ativo ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={horario?.hora_inicio || '08:00'}
                          onChange={(e) =>
                            updateHorario(dia.value, 'hora_inicio', e.target.value)
                          }
                          className="w-32"
                        />
                        <span className="text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={horario?.hora_fim || '18:00'}
                          onChange={(e) =>
                            updateHorario(dia.value, 'hora_fim', e.target.value)
                          }
                          className="w-32"
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Fechado</span>
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pausas</h1>
            <p className="text-muted-foreground">
              Configure os tipos de pausas disponíveis para os atendentes
            </p>
          </div>
          <Button onClick={openNewPausa}>
            <Coffee className="mr-2 h-4 w-4" />
            Nova Pausa
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-lg">
          <CardContent className="p-0">
            {pausas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Coffee className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <h3 className="font-medium tracking-tight">Nenhuma pausa cadastrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie pausas para que os atendentes possam usar durante o expediente
                </p>
                <Button onClick={openNewPausa} className="mt-4">
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
                            <Button variant="ghost" size="icon">
                              <Settings className="h-4 w-4" />
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações do Setor</h1>
          <p className="text-muted-foreground">
            Personalize as informações e aparência do setor
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic info */}
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Setor</Label>
                <Input
                  id="nome"
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
                  rows={4}
                />
              </div>

              {tagsList.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Tag
                  </Label>
                  <Select
                    value={configForm.tag_id || 'none'}
                    onValueChange={(v) =>
                      setConfigForm((prev) => ({ ...prev, tag_id: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
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
                </div>
              )}

            </CardContent>
          </Card>

          {/* Aparencia - Preview + Cor + Icone compacto */}
          <Card className="glass-card-elevated rounded-lg">
            <CardHeader>
              <CardTitle>Aparencia do Setor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview inline */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: configForm.cor }}
                >
                  <IconComponent className="h-7 w-7 text-white" />
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
                        'flex h-9 w-full items-center justify-center rounded-md border transition-all',
                        configForm.icon_url === iconItem.name
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-transparent hover:bg-muted text-muted-foreground'
                      )}
                      title={iconItem.name}
                    >
                      <iconItem.icon className="h-4 w-4" />
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
              <ArrowRightLeft className="h-5 w-5" />
              Roteamento de Atendimento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure para qual setor cada tipo de atendimento sera redirecionado quando identificado pelo bot.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <div key={tipo.key} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className={cn("flex items-center justify-center h-12 w-12 rounded-lg shrink-0", tipo.color)}>
                    <IconComponent className="h-6 w-6" />
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
                    <p className="text-xs text-muted-foreground mt-0.5">{tipo.desc}</p>
                  </div>
                  <Select
                    value={tiposAtendimentoSetor[tipo.key] || 'none'}
                    onValueChange={(value) => {
                      setTiposAtendimentoSetor((prev) => ({ ...prev, [tipo.key]: value === 'none' ? null : value }))
                      setHasUnsavedTipos(true)
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
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
              <Tag className="h-5 w-5" />
              Classificação de Atendimento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cadastre os tipos de atendimento deste setor. Ao encerrar um chat no workdesk, o atendente deverá escolher uma destas classificações.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Adicionar nova classificação */}
            <div className="flex gap-2">
              <Input
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
              <Button onClick={addClassificacao} disabled={savingClassificacao || !novaClassificacao.trim()}>
                {savingClassificacao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
                          className="flex-1"
                        />
                        <Button size="sm" onClick={saveEditingClassificacao} disabled={!editingClassificacaoNome.trim()}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingClassificacaoId(null)
                            setEditingClassificacaoNome('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
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
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
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
        <div className="grid gap-6 md:grid-cols-2">
          {/* Subsetores */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Subsetores
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie subsetores para organizar e direcionar atendimentos de forma mais especifica.
                </p>
              </div>
              <Button size="sm" onClick={openCreateSubsetor}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Subsetor
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 px-6 pb-6">
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
                              <Button variant="ghost" size="icon" onClick={() => openEditSubsetor(subsetor)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteSubsetor(subsetor.id)}
                                disabled={deletingSubsetorId === subsetor.id}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
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
              <div className="flex items-center gap-4">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="tempo_espera_minutos">Minutos</Label>
                  <Input
                    id="tempo_espera_minutos"
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

        {/* Encerramento Automático por Inatividade */}
        <Card className="glass-card-elevated rounded-lg">
          <CardHeader>
            <CardTitle>Encerramento Automático por Inatividade</CardTitle>
            <p className="text-sm text-muted-foreground">
              Fecha automaticamente tickets em que o atendente foi quem respondeu por último e o cliente não retornou há X minutos. Tickets aguardando resposta do atendente nunca são fechados automaticamente. Tickets de disparo são ignorados.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
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
              <div className="flex items-center gap-4 pl-2">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="encerramento_auto_minutos">Tempo sem retorno do cliente (minutos)</Label>
                  <Input
                    id="encerramento_auto_minutos"
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

        {/* Row 2: Distribuição de Tickets + Mensagem de Finalização */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Distribuição de Tickets */}
          <Card className="glass-card-elevated rounded-lg flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Distribuição de Tickets
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configure como os tickets são distribuídos automaticamente entre os atendentes.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
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
            <CardContent className="space-y-4 overflow-y-auto">
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
              onClick={() => {
                setEditingCanal(null)
                resetCanalForm()
                setIsCanalModalOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Canal
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 px-6 pb-6">
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
                              size="icon"
                              onClick={() => openEditCanal(canal)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteCanal(canal.id)}
                              disabled={deletingCanalId === canal.id}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
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
              <Sparkles className="h-5 w-5" />
              Inteligência Artificial
            </CardTitle>
            <CardDescription>Configure a IA para melhorar mensagens dos atendentes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <Pencil className="h-5 w-5" />
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

        {/* Row 3: Templates de Mensagem + Webhooks */}
        <div className="grid gap-6 md:grid-cols-2">
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
                onClick={() => {
                  setEditingTemplate(null)
                  setTemplateForm({ atalho: '', mensagem: '' })
                  setIsTemplateModalOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Template
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 px-6 pb-6">
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
                      className="flex items-start justify-between p-4 rounded-lg border bg-muted/30"
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
                          size="icon"
                          onClick={() => {
                            setEditingTemplate(template)
                            setTemplateForm({
                              atalho: template.atalho,
                              mensagem: template.mensagem,
                            })
                            setIsTemplateModalOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTemplate(template.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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
            <CardContent className="space-y-4 overflow-y-auto">
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
              <ArrowRightLeft className="h-5 w-5" />
              Setores para Transferência
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione quais setores estarão disponíveis como destino ao transferir um ticket deste setor no WorkDesk.
            </p>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col gap-3 pb-4">
            {/* Busca */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Buscar setor..."
                value={searchSetorDestino}
                onChange={(e) => setSearchSetorDestino(e.target.value)}
                className="pl-9 h-9 text-sm"
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
                <Radio className="h-5 w-5" />
                Receptor / Transmissor
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure o encaminhamento automático de tickets quando não houver atendentes disponíveis.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Switch: Setor Receptor */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                    <Inbox className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                "rounded-lg border border-border p-4 transition-opacity",
                configForm.is_receptor && "opacity-50 pointer-events-none"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950">
                      <Radio className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
                      <SelectTrigger>
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
                <Clock className="h-5 w-5" />
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
                          size="icon"
                          className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeTransbordoBloqueio(i)}
                          title="Remover janela"
                        >
                          <Trash2 className="h-4 w-4" />
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
                <Plus className="h-4 w-4" />
                Adicionar janela
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Zona de Perigo */}
        <Card className="glass-card-elevated rounded-lg border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Zona de Perigo
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ações irreversíveis. Tenha certeza antes de prosseguir.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                <div>
                  <p className="font-medium">Excluir Setor</p>
                  <p className="text-sm text-muted-foreground">
                    Exclui permanentemente o setor, todos os atendentes vinculados, pausas, templates e configurações.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Setor
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
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
                            className="mt-2"
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
                        onClick={handleDeleteSetor}
                        disabled={deletingSetor || deleteSetorConfirmText !== setor?.nome}
                      >
                        {deletingSetor ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
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
            ...(hasUnsavedConfig ? ['Informações e aparência'] : []),
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

          {/* Balão — centralizado, bordas arredondadas, altura fixa (não varia
              conforme o conteúdo de cada aba: Atendimento/Transferir/Info) */}
          <div className="relative flex h-[85vh] max-h-[760px] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Ticket <span className="font-mono tabnums">#{selectedTicket.numero}</span></h2>
                <p className="text-sm text-muted-foreground">
                  Conversa com {selectedTicket.clientes?.nome || selectedTicket.clientes?.telefone || 'Cliente'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeConversation}>
                <X className="h-5 w-5" />
              </Button>
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
                        msg._ticketStart ? (
                          <Fragment key={`sep-${msg.id}`}>
                            <div className="flex items-center gap-3 py-2">
                              <div className="flex-1 border-t border-dashed border-primary/30" />
                              <span className="text-[10px] font-medium text-primary/70 whitespace-nowrap">Início do Ticket #{selectedTicket?.numero}</span>
                              <div className="flex-1 border-t border-dashed border-primary/30" />
                            </div>
                            <div
                              className={cn(
                                "flex",
                                isClientMessage(msg.remetente) ? "justify-start" : "justify-end"
                              )}
                            >
                              <div className={cn(
                                "max-w-[85%] rounded-lg px-3 py-2",
                                isClientMessage(msg.remetente)
                                  ? "bg-muted text-foreground rounded-bl-none"
                                  : "bg-primary text-primary-foreground rounded-br-none"
                              )}>
                                <TextoMensagem conteudo={msg.conteudo} className="text-xs whitespace-pre-wrap" />
                                <p className="text-[10px] mt-1 opacity-60 text-right">
                                  {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </Fragment>
                        ) : msg.remetente === 'sistema' ? (
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
                        ) : msg.remetente === 'supervisor' ? (
                          <div key={msg.id} className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
                              <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                🔒 Mensagem do supervisor
                              </div>
                              {(() => {
                                const _l = (msg.conteudo || '').split('\n')
                                const _ult = _l[_l.length - 1]
                                const _ass = _l.length > 1 && _ult.startsWith('— ')
                                const _corpo = _ass ? _l.slice(0, -1).join('\n').trimEnd() : (msg.conteudo || '')
                                return (
                                  <>
                                    <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">{_corpo}</p>
                                    {_ass && <p className="mt-0.5 text-right text-[10px] italic text-amber-700/70 dark:text-amber-400/70">{_ult}</p>}
                                  </>
                                )
                              })()}
                              <p className="mt-1 text-right text-[10px] text-amber-700/70 dark:text-amber-400/70">
                                {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
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
                              {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        )
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
                <div className="p-4 space-y-4">
                  {/* Setor destino */}
                  <div>
                    <Label>Setor destino</Label>
                    <Select value={transferSetorDestino} onValueChange={handleTransferSetorChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Setor atual */}
                        <SelectItem value={setorId}>
                          {data?.setor?.nome || 'Setor atual'} (atual)
                        </SelectItem>
                        {/* Outros setores */}
                        {todosSetores
                          .filter(s => s.id !== setorId)
                          .map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Atendente destino */}
                  {transferSetorDestino && (
                    <div>
                      <Label>Transferir para</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Selecione um atendente ou deixe na fila para distribuição automática
                      </p>
                      {loadingTransferAtendentes ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <Select value={transferringTo} onValueChange={setTransferringTo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um atendente" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Opção para enviar à fila */}
                            {transferSetorDestino !== setorId && (
                              <SelectItem value="__fila__">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                                  <span>Deixar na fila (distribuição automática)</span>
                                </div>
                              </SelectItem>
                            )}
                            {/* Lista de atendentes */}
                            {(transferSetorDestino === setorId ? atendentes : transferAtendentesDestino)
                              .filter((a: any) => {
                                if (transferSetorDestino === setorId) {
                                  return a.id !== selectedTicket?.colaborador_id
                                }
                                return true
                              })
                              .map((a: any) => {
                                const online = isTransferAtendenteOnline(a)
                                return (
                                  <SelectItem key={a.id} value={a.id}>
                                    <div className="flex items-center gap-2">
                                      <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
                                      {a.nome}
                                      {!online && <span className="text-xs text-muted-foreground">(offline)</span>}
                                    </div>
                                  </SelectItem>
                                )
                              })}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Aviso se nenhum atendente disponível no setor destino */}
                      {!loadingTransferAtendentes && transferSetorDestino !== setorId && transferAtendentesDestino.length === 0 && (
                        <div className="mt-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                          <AlertCircle className="inline-block mr-2 h-4 w-4" />
                          Nenhum atendente neste setor. O ticket ficará na fila.
                        </div>
                      )}

                      {!loadingTransferAtendentes && transferSetorDestino === setorId &&
                        atendentes.filter((a: any) => a.id !== selectedTicket?.colaborador_id).length === 0 && (
                        <div className="mt-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                          <AlertCircle className="inline-block mr-2 h-4 w-4" />
                          Nenhum outro atendente disponível neste setor.
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={transferTicket}
                    disabled={!transferSetorDestino || (transferSetorDestino === setorId && !transferringTo)}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Confirmar Transferência
                  </Button>
                </div>
              )}

              {/* Info Tab */}
              {conversationTab === 'info' && (
                <div className="p-4 space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-muted-foreground">Cliente</Label>
                      <p className="font-medium">{selectedTicket.clientes?.nome || 'Não informado'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Telefone</Label>
                      <p className="font-medium">{selectedTicket.clientes?.telefone || 'Não informado'}</p>
                    </div>
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
                      <p className="font-medium">
                        {selectedTicket.criado_em ? new Date(selectedTicket.criado_em).toLocaleString('pt-BR') : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
