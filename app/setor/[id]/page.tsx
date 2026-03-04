'use client'

import { useRef } from "react"

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { DateRange } from 'react-day-picker'
import { DatePeriodFilter, getDateCutoffs } from '@/components/date-period-filter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { Send, Hash, Check } from 'lucide-react'
import { DisparoLogsSection } from '@/components/disparo-logs-section'

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
    { id: 'atendentes', name: 'Atendentes', icon: Users, description: 'Gerencie os atendentes do setor' },
    { id: 'horarios', name: 'Horários de atendimento', icon: Clock, description: 'Defina dias e horários disponíveis' },
    { id: 'pausas', name: 'Pausas', icon: Coffee, description: 'Gerencie os tipos de pausas dos atendentes' },
    { id: 'configuracoes', name: 'Configurações', icon: Settings, description: 'Configurações do setor' },
    { id: 'disparo_logs', name: 'Log de Disparos', icon: Megaphone, description: 'Historico de disparos realizados', whatsappOnly: true },
  ]

// Fetcher function
async function fetchSetorData(setorId: string) {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  // Date range for reports (last 90 days to support all filter options)
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

const [setorRes, ticketsAtivosRes, ticketsHojeRes, ticketsRelatorioRes, colaboradoresRes, horariosRes, permissoesRes, pausasRes] = await Promise.all([
    supabase.from('setores').select('*').eq('id', setorId).single(),
    // Tickets ativos (aberto ou em_atendimento)
    supabase.from('tickets').select('*, numero, colaboradores(nome), clientes(nome, telefone)').eq('setor_id', setorId).in('status', ['aberto', 'em_atendimento']),
    // Tickets de hoje (para estatisticas)
    supabase.from('tickets').select('id, numero, status, criado_em, primeira_resposta_em, encerrado_em, atribuido_em').eq('setor_id', setorId).gte('criado_em', startOfDay),
    // Tickets para relatorio (ultimos 90 dias, incluindo encerrados)
    supabase.from('tickets').select('*, numero, colaboradores(nome), clientes(nome, telefone)').eq('setor_id', setorId).gte('criado_em', ninetyDaysAgo).order('criado_em', { ascending: false }).limit(500),
    supabase.from('colaboradores_setores').select('colaborador_id, subsetor_id, colaboradores(id, nome, email, is_online, ativo, permissao_id, pausa_atual_id), subsetores(id, nome)').eq('setor_id', setorId),
    supabase.from('horarios_atendimento').select('*').eq('setor_id', setorId).order('dia_semana'),
    supabase.from('permissoes').select('*'),
    supabase.from('pausas').select('*').eq('setor_id', setorId).order('nome'),
  ])

  const ticketsAtivos = ticketsAtivosRes.data || []
  const ticketsHoje = ticketsHojeRes.data || []
  const ticketsRelatorio = ticketsRelatorioRes.data || []
  const atendentesSetor = colaboradoresRes.data || []
  const atendentes = atendentesSetor.map((as: any) => ({
    ...as.colaboradores,
    subsetor_id: as.subsetor_id,
    subsetor_nome: as.subsetores?.nome || null,
  })).filter(Boolean)

  // Calculate stats
  const ticketsNaFila = ticketsAtivos.filter((t: any) => t.status === 'aberto')
  const ticketsEmAtendimento = ticketsAtivos.filter((t: any) => t.status === 'em_atendimento')
  const ticketsFinalizadosHoje = ticketsHoje.filter((t: any) => t.status === 'encerrado')
  const atendentesOnline = atendentes.filter((c: any) => c.is_online && c.ativo && !c.pausa_atual_id)
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
// Relatorio data
    ticketsRelatorio,
    relatorioStats: calculateRelatorioStats(ticketsRelatorio, formatMs),
    // Pausas
    pausas: pausasRes.data || [],
  }
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

  // Tickets por atendente
  const ticketsPorAtendente: Record<string, { nome: string; count: number }> = {}
  for (const ticket of tickets) {
    if (ticket.colaboradores?.nome) {
      const nome = ticket.colaboradores.nome
      if (!ticketsPorAtendente[nome]) {
        ticketsPorAtendente[nome] = { nome, count: 0 }
      }
      ticketsPorAtendente[nome].count++
    }
  }

  return {
    totalRecebidos: tickets.length,
    totalResolvidos: ticketsEncerrados.length,
    tempoMedioPrimeiraResposta: formatMs(tempoMedioPrimeiraResposta),
    tempoMedioResolucao: formatMs(tempoMedioResolucao),
    ticketsPorAtendente: Object.values(ticketsPorAtendente).sort((a, b) => b.count - a.count),
    taxaResolucao: tickets.length > 0 ? Math.round((ticketsEncerrados.length / tickets.length) * 100) : 0,
  }
}

// Get icon component by name
function getIconComponent(iconName: string | null) {
  if (!iconName) return MessageCircle
  const found = AVAILABLE_ICONS.find((i) => i.name === iconName)
  return found ? found.icon : MessageCircle
}

export default function SetorPage() {
  const params = useParams()
  const router = useRouter()
  const setorId = params.id as string
  const [isPending, startTransition] = useTransition()
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)
  const [activeSection, setActiveSection] = useState('monitoramento')
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [searchTerm, setSearchTerm] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string>('all')
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [, setTick] = useState(0) // Force re-render for time updates
  const [dateFilter, setDateFilter] = useState('today')
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [saving, setSaving] = useState(false)
  const [hasUnsavedConfig, setHasUnsavedConfig] = useState(false)

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
  const [notificationForm, setNotificationForm] = useState({
    destinatario: 'todos', // 'todos' or colaborador id
    titulo: '',
    mensagem: '',
  })
  const [sendingNotification, setSendingNotification] = useState(false)

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
  webhook_url: '',
  webhook_eventos: [] as string[],
  tempo_espera_minutos: 10,
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
  const [todosSetores, setTodosSetores] = useState<{ id: string; nome: string }[]>([])
  const [tiposAtendimentoSetor, setTiposAtendimentoSetor] = useState<Record<string, string | null>>({
    suporte: null,
    ouvidoria: null,
    financeiro: null,
    implantacao: null,
    comercial: null,
  })
  const [savingTiposAtendimento, setSavingTiposAtendimento] = useState(false)

  // Distribuição de tickets state
  const [distributionConfig, setDistributionConfig] = useState({
    max_tickets_per_agent: 10,
    auto_assign_enabled: true,
  })
  const [savingDistribution, setSavingDistribution] = useState(false)
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
  const [editingAtendenteSubsetorId, setEditingAtendenteSubsetorId] = useState<string | null>(null)
  const [atendenteForm, setAtendenteForm] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    subsetor_id: '' as string,
  })
  const [savingAtendente, setSavingAtendente] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [existingColaborador, setExistingColaborador] = useState<any>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [atendenteToDelete, setAtendenteToDelete] = useState<{ id: string; nome: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Conversation slide-out state
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [conversationMessages, setConversationMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [conversationTab, setConversationTab] = useState<'atendimento' | 'transferir' | 'info'>('atendimento')
  const [transferringTo, setTransferringTo] = useState<string>('')

  const { data, isLoading, mutate } = useSWR(
    setorId ? ['setor-detail', setorId] : null,
    () => fetchSetorData(setorId),
    { revalidateOnFocus: false, refreshInterval: 5000 }
  )

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

    const colaboradoresChannel = supabase
      .channel('setor-colaboradores-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'colaboradores',
        },
        () => {
          mutate()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ticketsChannel)
      supabase.removeChannel(colaboradoresChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId])

  const setor = data?.setor
  const stats = data?.stats || { total: 0, naFila: 0, emAtendimento: 0, finalizadosHoje: 0, tempoMaximoFila: '00:00:00', tempoMaximoResposta: '00:00:00', mediaTicketsPorAtendente: 0 }
  const atendentesStats = data?.atendentesStats || { online: 0, pausa: 0, invisivel: 0 }
  const ticketsHoje = data?.ticketsHoje || { perdidos: 0, abandonados: 0, finalizados: 0, fechados: 0 }
  const temposHoje = data?.temposHoje || { tempoMedioEspera: '00:00:00', tempoMedioResposta: '00:00:00', tempoMedioPrimeiraResposta: '00:00:00', tempoMedioAtendimento: '00:00:00' }
  const tickets = data?.tickets || []
  const ticketsRelatorioRaw = data?.ticketsRelatorio || []

  // Filter relatorio tickets based on dateFilter
  const ticketsRelatorio = useMemo(() => {
    const { from, to } = getDateCutoffs(dateFilter, customRange)
    if (!from) return ticketsRelatorioRaw

    return ticketsRelatorioRaw.filter((t: any) => {
      const d = new Date(t.criado_em)
      if (d < new Date(from)) return false
      if (to && d > new Date(to)) return false
      return true
    })
  }, [ticketsRelatorioRaw, dateFilter, customRange])

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
        webhook_url: setor.webhook_url || '',
        webhook_eventos: setor.webhook_eventos || [],
        tempo_espera_minutos: setor.tempo_espera_minutos ?? 10,
      })
      fetchTemplates()
      fetchCanais()
      fetchTodosSetores()
      fetchTiposAtendimento()
      fetchSubsetores()
      fetchDistributionConfig()
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
      .select('id, nome')
      .order('nome')
    if (data) setTodosSetores(data)
  }

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
    if (!startDate) return '00:00:00'
    const start = new Date(startDate).getTime()
    const end = endDate ? new Date(endDate).getTime() : Date.now()
    const diffMs = Math.max(0, end - start)
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || t.status === 'aberto')
      .filter((t: any) => {
        if (atendenteFilter !== 'all' && t.colaborador_id !== atendenteFilter) return false
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      .map((t: any) => ({
        id: t.id,
        numero: t.id.slice(0, 8),
        // Tempo na fila = criado_em → atribuido_em (tempo aguardando atendente)
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'  // atribuído mas sem registro de atribuido_em
            : formatDuration(t.criado_em, null), // ainda na fila
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        // Tempo de atendimento = atribuido_em → agora (ou criado_em como fallback)
        tempoAtendimento: t.colaborador_id ? formatDuration(t.atribuido_em || t.criado_em, null) : '00:00:00',
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: setor?.nome || '',
        atendente: t.colaboradores?.nome || null,
        prioridade: t.prioridade,
        status: t.status,
        criado_em: t.criado_em,
        primeira_resposta_em: t.primeira_resposta_em,
        colaborador_id: t.colaborador_id,
      }))
  }, [tickets, searchTerm, setor, atendenteFilter])

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
        numero: t.id.slice(0, 8),
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        fila: setor?.cor || '',
        prioridade: t.prioridade,
        status: t.status,
        clientes: t.clientes,
      }))
  }, [tickets, searchTerm, setor])

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/login')
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
      setShowNotificationModal(false)
    } catch (error: any) {
      console.error('Error sending notification:', error)
      toast.error('Erro ao enviar notificação')
    } finally {
      setSendingNotification(false)
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
  webhook_url: configForm.webhook_url || null,
  webhook_eventos: configForm.webhook_eventos.length > 0 ? configForm.webhook_eventos : null,
  tempo_espera_minutos: configForm.tempo_espera_minutos || 10,
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
    if (data) setCanais(data as Canal[])
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

      toast.success('Roteamento de atendimento salvo com sucesso!')
    } catch (error) {
      console.error('Error saving tipos atendimento:', error)
      toast.error('Erro ao salvar roteamento de atendimento')
    } finally {
      setSavingTiposAtendimento(false)
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
    setEditingAtendenteSubsetorId(null)
    setAtendenteForm({ nome: '', email: '', senha: '', confirmarSenha: '', subsetor_id: '' })
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
    // Fetch current subsetor_id for this atendente in this setor
    const { data: colabSetor, error: colabSetorError } = await supabase
      .from('colaboradores_setores')
      .select('subsetor_id')
      .eq('colaborador_id', atendente.id)
      .eq('setor_id', setorId)
      .single()
    
    const subsetorId = colabSetor?.subsetor_id || ''
    setEditingAtendenteSubsetorId(colabSetor?.subsetor_id || null)
    setAtendenteForm({
      nome: atendente.nome || '',
      email: atendente.email || '',
      senha: '',
      confirmarSenha: '',
      subsetor_id: subsetorId,
    })
    setExistingColaborador(null)
    setIsAtendenteModalOpen(true)
  }

  const saveAtendente = async () => {
      if (!atendenteForm.nome || !atendenteForm.email) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    // If adding existing colaborador to this setor
    if (!editingAtendente && existingColaborador && !existingColaborador.alreadyInThisSetor) {
      setSavingAtendente(true)
      try {
        // Just add to colaboradores_setores
        const { error } = await supabase.from('colaboradores_setores').insert({
          colaborador_id: existingColaborador.id,
          setor_id: setorId,
          subsetor_id: atendenteForm.subsetor_id || null,
        })

        if (error) throw error
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

    setSavingAtendente(true)
    try {
      if (editingAtendente) {
        // Update existing atendente
        const { error } = await supabase
          .from('colaboradores')
          .update({ nome: atendenteForm.nome })
          .eq('id', editingAtendente.id)

        if (error) throw error

        // Update subsetor - always update to ensure correct value
        // Convert empty string to null for proper comparison and storage
        const newSubsetorId = atendenteForm.subsetor_id && atendenteForm.subsetor_id !== '' 
          ? atendenteForm.subsetor_id 
          : null
        
        // Use upsert to handle both insert and update cases
        // The table has a unique constraint on (colaborador_id, setor_id)
        const { data: upsertData, error: subsetorError } = await supabase
          .from('colaboradores_setores')
          .upsert({
            colaborador_id: editingAtendente.id,
            setor_id: setorId,
            subsetor_id: newSubsetorId
          }, { 
            onConflict: 'colaborador_id,setor_id',
            ignoreDuplicates: false 
          })
          .select()
        
        if (subsetorError) {
          console.error('[v0] Error upserting subsetor:', subsetorError)
          // Don't throw - try alternative approach
          // If upsert fails, it might be RLS blocking the operation
          // We'll show a warning but not fail the entire save
          toast.error('Erro ao atualizar subsetor. Verifique as permissões.')
        }

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
            subsetor_id: atendenteForm.subsetor_id || null,
          })

        if (linkError) throw linkError

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

  // Open conversation slide-out
  const openConversation = async (ticket: any) => {
    setSelectedTicket(ticket)
    setConversationTab('atendimento')
    setLoadingMessages(true)
    
    try {
      const { data: messages, error } = await supabase
        .from('mensagens')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('enviado_em', { ascending: true })
      
      if (error) {
        toast.error('Erro ao carregar mensagens')
      } else {
        setConversationMessages(messages || [])
      }
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
  }

  // Transfer ticket to another attendant
  const transferTicket = async () => {
    if (!transferringTo || !selectedTicket) return
    
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ colaborador_id: transferringTo })
        .eq('id', selectedTicket.id)

      if (error) throw error

      // Insert system message in chat for transfer visibility
      const fromColabName = atendentes.find((a: any) => a.id === selectedTicket.colaborador_id)?.nome || 'Sem atendente'
      const toColabName = atendentes.find((a: any) => a.id === transferringTo)?.nome || 'Desconhecido'
      const setorNome = data?.setor?.nome || 'Setor'

      await supabase.from('mensagens').insert({
        ticket_id: selectedTicket.id,
        cliente_id: selectedTicket.cliente_id,
        remetente: 'sistema',
        conteudo: `Transferido de ${fromColabName} - ${setorNome} >> ${toColabName} - ${setorNome}`,
        tipo: 'texto',
        enviado_em: new Date().toISOString(),
      })
      
      toast.success('Ticket transferido com sucesso!')
      setTransferringTo('')
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
            className="flex items-center gap-3 text-foreground hover:text-primary transition-all cursor-pointer select-none active:scale-[0.98]"
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
                    'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left text-sm transition-all cursor-pointer select-none active:scale-[0.98]',
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
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold">Monitoramento de atendimento</h1>
                  <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">Ao vivo</span>
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
                <Card className="glass-card-elevated rounded-2xl border-0 border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Atendimentos em tempo real
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-6 gap-3 text-center">
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-foreground">{stats.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-orange-500">{stats.naFila}</p>
                        <p className="text-xs text-muted-foreground">Na fila</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-primary">{stats.emAtendimento}</p>
                        <p className="text-xs text-muted-foreground">Em atend.</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-green-500">{stats.finalizadosHoje}</p>
                        <p className="text-xs text-muted-foreground">Finalizados</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm lg:text-lg font-bold text-foreground whitespace-nowrap">{stats.tempoMaximoFila}</p>
                        <p className="text-xs text-muted-foreground">Max. fila</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm lg:text-lg font-bold text-foreground whitespace-nowrap">{stats.tempoMaximoResposta}</p>
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
                        <p className="text-xl lg:text-2xl font-bold text-foreground">{atendentesStats.online}</p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          <p className="text-xs text-muted-foreground">Online</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-foreground">{atendentesStats.pausa}</p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          <p className="text-xs text-muted-foreground">Pausa</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl lg:text-2xl font-bold text-foreground">{atendentesStats.invisivel}</p>
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
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Atendimento hoje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground">{temposHoje.tempoMedioEspera}</p>
                      <p className="text-xs text-muted-foreground">Tempo med. espera</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground">{temposHoje.tempoMedioResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo med. resposta</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground">{temposHoje.tempoMedioPrimeiraResposta}</p>
                      <p className="text-xs text-muted-foreground">Tempo med. 1a resp.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-foreground">{temposHoje.tempoMedioAtendimento}</p>
                      <p className="text-xs text-muted-foreground">Tempo med. atend.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

{/* Status dos tickets hoje */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Status dos tickets hoje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-red-500">{ticketsHoje.perdidos}</p>
                      <p className="text-xs text-muted-foreground">Perdidos</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-orange-500">{ticketsHoje.abandonados}</p>
                      <p className="text-xs text-muted-foreground">Abandonados</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-green-500">{ticketsHoje.finalizados}</p>
                      <p className="text-xs text-muted-foreground">Finalizados</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-blue-500">{ticketsHoje.fechados}</p>
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
            <Card className="glass-card-elevated rounded-2xl border-0">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Monitoramento detalhado</CardTitle>
                  <div className="flex items-center gap-2">
                    <Popover open={filtrosOpen} onOpenChange={setFiltrosOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "gap-2 bg-transparent",
                            atendenteFilter !== 'all' && "border-primary text-primary"
                          )}
                        >
                          <Filter className="h-4 w-4" />
                          Filtros
                          {atendenteFilter !== 'all' && (
                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atendente</p>
                          <div className="space-y-1">
                            <button
                              onClick={() => { setAtendenteFilter('all'); setFiltrosOpen(false) }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                                atendenteFilter === 'all' && "font-medium text-primary"
                              )}
                            >
                              <Check className={cn("h-3.5 w-3.5", atendenteFilter !== 'all' && "invisible")} />
                              Todos os atendentes
                            </button>
                            {atendentes
                              .filter((a: any) => a.ativo)
                              .map((a: any) => (
                                <button
                                  key={a.id}
                                  onClick={() => { setAtendenteFilter(a.id); setFiltrosOpen(false) }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                                    atendenteFilter === a.id && "font-medium text-primary"
                                  )}
                                >
                                  <Check className={cn("h-3.5 w-3.5", atendenteFilter !== a.id && "invisible")} />
                                  <span className={cn(
                                    "h-2 w-2 rounded-full shrink-0",
                                    a.is_online && !a.pausa_atual_id ? "bg-green-500" : a.pausa_atual_id ? "bg-yellow-500" : "bg-gray-400"
                                  )} />
                                  {a.nome}
                                </button>
                              ))
                            }
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
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
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
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
                    </button>
                    <button
                      onClick={() => setActiveTab('filas')}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
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
                            <TableHead className="text-xs">Tempo na fila</TableHead>
                            <TableHead className="text-xs">Tempo de 1ª resposta</TableHead>
                            <TableHead className="text-xs">Tempo de atendimento</TableHead>
                            <TableHead className="text-xs">Ticket</TableHead>
                            <TableHead className="text-xs">Contato</TableHead>
                            <TableHead className="text-xs">Fila</TableHead>
                            <TableHead className="text-xs">Atendente</TableHead>
                            <TableHead className="text-xs w-[80px]">Ações</TableHead>
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
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                              </TableRow>
                            ))
                          ) : ticketsEmAndamento.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-2 h-8 w-8" />
                                  <p>Nenhum atendimento no momento</p>
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
                                  <TableCell className="font-mono text-xs text-foreground">{ticket.tempoNaFila}</TableCell>
                                  <TableCell>
                                    {aguardandoResposta ? (
                                      <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                        <Clock className="mr-1 h-3 w-3" />
                                        Aguardando...
                                      </Badge>
                                    ) : (
                                      <span className="font-mono text-xs text-foreground">{ticket.tempoPrimeiraResposta || '00:00:00'}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-foreground">{ticket.tempoAtendimento}</TableCell>
                                  <TableCell className="text-xs text-foreground font-mono">#{ticket.numero}</TableCell>
                                  <TableCell className="text-xs text-foreground">
                                    <div className="flex items-center gap-1">
                                      <User className="h-3 w-3 text-muted-foreground" />
                                      {ticket.contato}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-foreground">{ticket.fila || setor?.nome}</TableCell>
                                  <TableCell className="text-xs text-foreground">{ticket.atendente || '-'}</TableCell>
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
                            <TableHead className="text-xs">Tempo na fila</TableHead>
                            <TableHead className="text-xs">Ticket</TableHead>
                            <TableHead className="text-xs">Contato</TableHead>
                            <TableHead className="text-xs">Fila</TableHead>
                            <TableHead className="text-xs">Prioridade</TableHead>
                            <TableHead className="text-xs w-[80px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                              </TableRow>
                            ))
                          ) : ticketsAguardando.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <AlertCircle className="mb-2 h-8 w-8" />
                                  <p>Nenhum ticket aguardando atendimento</p>
                                  <p className="text-xs mt-1">Tickets só são atribuídos quando há atendentes online</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            ticketsAguardando.map((ticket: any) => (
                              <TableRow key={ticket.id} className="bg-yellow-50/50 dark:bg-yellow-950/20">
                                <TableCell className="font-mono text-xs">
                                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                    <Clock className="mr-1 h-3 w-3" />
                                    Aguardando...
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-foreground font-mono">#{ticket.numero}</TableCell>
                                <TableCell className="text-xs text-foreground">
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3 text-muted-foreground" />
                                    {ticket.clientes?.nome || ticket.clientes?.telefone || 'Desconhecido'}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-foreground">{setor?.nome}</TableCell>
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
                            <TableHead className="text-xs">Atendente</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs text-center">Tickets em atendimento</TableHead>
                            <TableHead className="text-xs text-center">Finalizados hoje</TableHead>
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
                              </TableRow>
                            ))
                          ) : atendentes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <Users className="mb-2 h-8 w-8" />
                                  <p>Nenhum atendente cadastrado neste setor</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            atendentes.map((atendente: any) => {
                              const ticketsDoAtendente = tickets.filter(
                                (t: any) => t.colaborador_id === atendente.id && t.status === 'em_atendimento'
                              ).length
                              const isOnPause = !!atendente.pausa_atual_id
                              const statusDisplay = isOnPause
                                ? { color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400', label: 'Ausente' }
                                : atendente.is_online
                                  ? { color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', label: 'Online' }
                                  : { color: 'bg-gray-400', textColor: 'text-muted-foreground', label: 'Offline' }
                              return (
                                <TableRow key={atendente.id}>
                                  <TableCell className="font-medium">{atendente.nome}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className={cn('h-2 w-2 rounded-full', statusDisplay.color)} />
                                      <span className={cn('text-xs', statusDisplay.textColor)}>{statusDisplay.label}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center font-medium">{ticketsDoAtendente}</TableCell>
                                  <TableCell className="text-center font-medium">0</TableCell>
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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Relatorios de Atendimento</h1>
              </div>
              <DatePeriodFilter
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                customRange={customRange}
                onCustomRangeChange={setCustomRange}
                showToday={true}
                triggerClassName="w-44"
              />
            </div>

            {/* KPIs - Clean minimal design */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
              {/* Tempo médio 1a resposta */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tempo médio 1a resposta</p>
                      <p className="text-xl lg:text-2xl font-semibold tracking-tight">{relatorioStats.tempoMedioPrimeiraResposta}</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                      <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tempo médio resolução */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tempo médio resolução</p>
                      <p className="text-xl lg:text-2xl font-semibold tracking-tight">{relatorioStats.tempoMedioResolucao}</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tickets recebidos */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tickets recebidos</p>
                      <p className="text-xl lg:text-2xl font-semibold tracking-tight">{relatorioStats.totalRecebidos}</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tickets resolvidos */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Tickets resolvidos</p>
                      <p className="text-xl lg:text-2xl font-semibold tracking-tight">{relatorioStats.totalResolvidos}</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                      <UserCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Taxa de resolução */}
              <Card className="glass-card-elevated rounded-2xl border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">Taxa de resolução</p>
                      <p className="text-xl lg:text-2xl font-semibold tracking-tight">{relatorioStats.taxaResolucao}%</p>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tickets por atendente */}
            <Card className="glass-card-elevated rounded-2xl border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Tickets por atendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {relatorioStats.ticketsPorAtendente.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento registrado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {relatorioStats.ticketsPorAtendente.map((atendente: { nome: string; count: number }, index: number) => (
                      <div key={atendente.nome} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{atendente.nome}</span>
                            <span className="text-sm text-muted-foreground">{atendente.count} tickets</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(100, (atendente.count / Math.max(...relatorioStats.ticketsPorAtendente.map((a: { count: number }) => a.count))) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Últimos atendimentos */}
            <Card className="glass-card-elevated rounded-2xl border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Últimos atendimentos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2">
                {ticketsRelatorio.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nenhum ticket encontrado no período</p>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border/50">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                        <TableRow>
                          <TableHead className="text-xs font-medium pl-4">Ticket</TableHead>
                          <TableHead className="text-xs font-medium">Cliente</TableHead>
                          <TableHead className="text-xs font-medium">Atendente</TableHead>
                          <TableHead className="text-xs font-medium">Status</TableHead>
                          <TableHead className="text-xs font-medium">Data</TableHead>
                          <TableHead className="text-xs font-medium w-[60px] pr-4">Ações</TableHead>
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
        </div>
      )}

      {/* Atendentes Section */}
      {activeSection === 'atendentes' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Atendentes</h1>
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
                <Card key={i} className="p-4">
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
              <Card className="glass-card-elevated rounded-2xl border-0 p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold">Nenhum atendente cadastrado</h3>
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
              atendentes.map((atendente: any) => {
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
                  <Card key={atendente.id} className="transition-shadow hover:shadow-md">
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
                          </div>

                          {/* Filas/Setor */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Setor / Subsetor</p>
                            <p className="text-sm truncate">
                              {setor?.nome}
                              {atendente.subsetor_nome && (
                                <span className="text-muted-foreground"> / {atendente.subsetor_nome}</span>
                              )}
                            </p>
                          </div>

                          {/* Tickets Simultâneos */}
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Tickets em atendimento</p>
                            <p className="text-sm font-medium">{ticketsDoAtendente}</p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="hidden lg:flex items-center gap-2">
                          <div className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            atendente.is_online 
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              atendente.is_online ? "bg-green-500" : "bg-gray-400"
                            )} />
                            {atendente.is_online ? 'Online' : 'Offline'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
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
            <h1 className="text-xl font-bold">Horários de Atendimento</h1>
            <p className="text-muted-foreground">
              Defina quais dias e horários seus atendentes estarão disponíveis
            </p>
          </div>
          <Button onClick={saveHorarios} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Horários'}
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-2xl border-0">
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
            <h1 className="text-xl font-bold">Pausas</h1>
            <p className="text-muted-foreground">
              Configure os tipos de pausas disponíveis para os atendentes
            </p>
          </div>
          <Button onClick={openNewPausa}>
            <Coffee className="mr-2 h-4 w-4" />
            Nova Pausa
          </Button>
        </div>

        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="p-0">
            {pausas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Coffee className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <h3 className="font-medium">Nenhuma pausa cadastrada</h3>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Configurações do Setor</h1>
            <p className="text-muted-foreground">
              Personalize as informações e aparência do setor
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedConfig && !saving && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Alterações não salvas
              </span>
            )}
            <Button onClick={saveConfig} disabled={saving} className={cn(hasUnsavedConfig && !saving && "ring-2 ring-amber-500/40")}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : 'Salvar Configurações'}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic info */}
          <Card className="glass-card-elevated rounded-2xl border-0">
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

            </CardContent>
          </Card>

          {/* Aparencia - Preview + Cor + Icone compacto */}
          <Card className="glass-card-elevated rounded-2xl border-0">
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
        <Card className="glass-card-elevated rounded-2xl border-0">
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
                    onValueChange={(value) => setTiposAtendimentoSetor((prev) => ({ ...prev, [tipo.key]: value === 'none' ? null : value }))}
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
            <div className="flex justify-end pt-2">
              <Button onClick={saveTiposAtendimento} disabled={savingTiposAtendimento}>
                {savingTiposAtendimento ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Configuracoes'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Row 1: Subsetores + Tempo de Espera */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Subsetores */}
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
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
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
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

        {/* Row 2: Distribuição de Tickets + Mensagem de Finalização */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Distribuição de Tickets */}
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 shrink-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Distribuição de Tickets
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure como os tickets são distribuídos automaticamente entre os atendentes.
                </p>
              </div>
              <Button size="sm" onClick={saveDistributionConfig} disabled={savingDistribution}>
                {savingDistribution ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : 'Salvar'}
              </Button>
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
                  onCheckedChange={(checked) =>
                    setDistributionConfig((prev) => ({ ...prev, auto_assign_enabled: checked }))
                  }
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
                  onChange={(e) =>
                    setDistributionConfig((prev) => ({
                      ...prev,
                      max_tickets_per_agent: parseInt(e.target.value) || 10,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Máximo de tickets ativos simultâneos por atendente. Atendentes que atingirem esse limite não receberão novos tickets automaticamente.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mensagem de Finalização */}
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
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

        {/* Canais de Atendimento */}
        <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[420px]">
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
                           canal.tipo === 'evolution_api' ? (canal.evolution_api_key ? '****' + canal.evolution_api_key.slice(-4) : '-') :
                           (canal.discord_guild_id || '-')}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={canal.ativo}
                            onCheckedChange={() => toggleCanalAtivo(canal)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
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

        {/* Row 3: Templates de Mensagem + Webhooks */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Templates de Mensagem */}
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
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
          <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle>Webhooks</CardTitle>
              <p className="text-sm text-muted-foreground">Dispare notificações para sistemas externos quando eventos ocorrerem neste setor.</p>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label>Eventos</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary"
                      checked={configForm.webhook_eventos.includes('ticket_encerrado')}
                      onChange={(e) => {
                        setConfigForm((prev) => ({
                          ...prev,
                          webhook_eventos: e.target.checked
                            ? [...prev.webhook_eventos, 'ticket_encerrado']
                            : prev.webhook_eventos.filter((ev) => ev !== 'ticket_encerrado'),
                        }))
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">Ticket Encerrado</p>
                      <p className="text-[11px] text-muted-foreground">
                        Dispara quando um ticket é finalizado. Envia dados do ticket, cliente, canal e horários.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook_url">URL do Webhook</Label>
                <Input
                  id="webhook_url"
                  placeholder="https://exemplo.com/webhook"
                  value={configForm.webhook_url}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, webhook_url: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  URL que receberá um POST com os dados do evento em JSON.
                </p>
              </div>
              {configForm.webhook_eventos.length > 0 && !configForm.webhook_url && (
                <p className="text-sm text-amber-600 bg-amber-950/20 border border-amber-800/30 p-2 rounded-md">
                  Você selecionou eventos mas não informou a URL do webhook.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zona de Perigo */}
        <Card className="glass-card-elevated rounded-2xl border-0 border-destructive/50">
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
      </div>
    )}

    {activeSection === 'disparo_logs' && (
      <DisparoLogsSection setorId={setorId} />
    )}
  </main>
</div>

      {/* Delete Atendente Confirmation Dialog */}
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
      <Dialog open={isCanalModalOpen} onOpenChange={setIsCanalModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCanal ? 'Editar Canal' : 'Novo Canal'}</DialogTitle>
            <DialogDescription>
              Configure um canal de atendimento para este setor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="canal-nome">Nome do Canal</Label>
              <Input
                id="canal-nome"
                placeholder="Ex: WhatsApp Vendas"
                value={canalForm.nome}
                onChange={(e) => setCanalForm((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={canalForm.tipo}
                onValueChange={(value: 'whatsapp' | 'evolution_api' | 'discord') => setCanalForm((prev) => ({ ...prev, tipo: value }))}
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

            <div className="space-y-2">
              <Label htmlFor="canal-instancia">Instancia</Label>
              <Input
                id="canal-instancia"
                placeholder="Ex: instancia-01"
                value={canalForm.instancia}
                onChange={(e) => setCanalForm((prev) => ({ ...prev, instancia: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Identificador da instancia utilizada neste canal.</p>
            </div>

            {/* WhatsApp fields */}
            {canalForm.tipo === 'whatsapp' && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">WhatsApp - Configuracoes</p>
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
                      <SelectItem value="pt_BR">Portugues (Brasil) - pt_BR</SelectItem>
                      <SelectItem value="pt">Portugues - pt</SelectItem>
                      <SelectItem value="en_US">Ingles (EUA) - en_US</SelectItem>
                      <SelectItem value="en">Ingles - en</SelectItem>
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
                    onChange={(e) => setCanalForm((prev) => ({ ...prev, max_disparos_dia: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            )}

            {/* EvolutionAPI fields */}
            {canalForm.tipo === 'evolution_api' && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">EvolutionAPI - Configuracoes</p>
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input
                    placeholder="https://sua-instancia.evolution-api.com"
                    value={canalForm.evolution_base_url}
                    onChange={(e) => setCanalForm((prev) => ({ ...prev, evolution_base_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder="Sua API Key..."
                    value={canalForm.evolution_api_key}
                    onChange={(e) => setCanalForm((prev) => ({ ...prev, evolution_api_key: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Discord fields */}
            {canalForm.tipo === 'discord' && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">Discord - Configuracoes</p>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCanalModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCanal} disabled={savingCanal}>
              {savingCanal ? 'Salvando...' : editingCanal ? 'Salvar' : 'Criar Canal'}
            </Button>
          </DialogFooter>
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
                  <SelectItem value="Financeiro">Financeiro</SelectItem>
                  <SelectItem value="Ouvidoria">Ouvidoria</SelectItem>
                  <SelectItem value="Jornada Cliente">Jornada Cliente</SelectItem>
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
                </div>

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

            {/* Subsetor selection - always visible if there are subsetores */}
            {subsetores.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="atendente-subsetor">Subsetor (opcional)</Label>
                <Select
                  value={atendenteForm.subsetor_id || 'none'}
                  onValueChange={(value) => setAtendenteForm((prev) => ({ ...prev, subsetor_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um subsetor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Setor geral)</SelectItem>
                    {subsetores.filter(s => s.ativo).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se selecionado, o atendente so recebera tickets direcionados a este subsetor.
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

      {/* Conversation Slide-out Panel */}
      {selectedTicket && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm" 
            onClick={closeConversation}
          />
          
          {/* Panel */}
          <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Ticket #{selectedTicket.numero}</h2>
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
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                            msg.remetente === 'cliente' ? "justify-start" : "justify-end"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                              msg.remetente === 'cliente'
                                ? "bg-muted"
                                : msg.remetente === 'bot'
                                ? "bg-blue-100 dark:bg-blue-900/30"
                                : "bg-primary text-primary-foreground"
                            )}
                          >
                            <p>{msg.conteudo}</p>
                            <p className={cn(
                              "text-[10px] mt-1",
                              msg.remetente === 'cliente' ? "text-muted-foreground" : "opacity-70"
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
                  <div>
                    <Label>Transferir para</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Selecione um atendente online para transferir este ticket
                    </p>
                    <Select value={transferringTo} onValueChange={setTransferringTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um atendente" />
                      </SelectTrigger>
                      <SelectContent>
                        {atendentes
                          .filter((a: any) => a.is_online && a.id !== selectedTicket.colaborador_id)
                          .map((atendente: any) => (
                            <SelectItem key={atendente.id} value={atendente.id}>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                {atendente.nome}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {atendentes.filter((a: any) => a.is_online && a.id !== selectedTicket.colaborador_id).length === 0 && (
                    <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                      <AlertCircle className="inline-block mr-2 h-4 w-4" />
                      Nenhum outro atendente online disponível para transferência.
                    </div>
                  )}

                  <Button 
                    className="w-full" 
                    onClick={transferTicket}
                    disabled={!transferringTo}
                  >
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
                        {new Date(selectedTicket.created_at).toLocaleString('pt-BR')}
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
      <Dialog open={showNotificationModal} onOpenChange={setShowNotificationModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Enviar Aviso
            </DialogTitle>
            <DialogDescription>
              Envie uma notificação para os colaboradores do setor
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
