'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { DateRange } from 'react-day-picker'
import { DatePeriodFilter, getDateCutoffs } from '@/components/date-period-filter'
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
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  AlertCircle,
  Eye,
  MessageCircle,
  X,
  ArrowRightLeft,
  Megaphone,
  Loader2,
  History,
  Check,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function formatMs(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatDuration(startDate: string | null, endDate: string | Date | null) {
  if (!startDate) return '00:00:00'
  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  return formatMs(diffMs)
}

export default function MonitoramentoPage() {
  const supabase = createClient()
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const setorIdsAcessiveis = setoresAcessiveis.map((s: any) => s.id)

  const [setorFilter, setSetorFilter] = useState<string>('all')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('all')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<{id: string, nome: string}[]>([])
  const [dateFilter, setDateFilter] = useState<string>('today')
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string>('all')
  const [filtrosAtendenteOpen, setFiltrosAtendenteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [, setTick] = useState(0)

  // Conversation panel state
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [conversationMessages, setConversationMessages] = useState<any[]>([])
  const [ticketHistory, setTicketHistory] = useState<any[]>([])
  const [historyMessages, setHistoryMessages] = useState<Record<string, any[]>>({})
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [conversationTab, setConversationTab] = useState<'conversa' | 'historico'>('conversa')

  // Tick every second for live times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch subsetores when setor filter changes
  useEffect(() => {
    async function fetchSubsetores() {
      const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsAcessiveis
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
      setSubsetorFilter('all') // Reset subsetor filter when setor changes
    }
    if (colaborador && setorIdsAcessiveis.length > 0) {
      fetchSubsetores()
    }
  }, [setorFilter, colaborador, setorIdsAcessiveis.length, supabase])

  // Fetch monitoring data
  const { data, isLoading, mutate } = useSWR(
    colaborador && setorIdsAcessiveis.length > 0
      ? ['dashboard-monitoramento', setorIdsAcessiveis.join(','), setorFilter, dateFilter, customRange?.from?.toISOString(), customRange?.to?.toISOString()]
      : null,
    async () => {
      const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsAcessiveis

      // Calculate date cutoff
    const { from: dateCutoff, to: dateCutoffTo } = getDateCutoffs(dateFilter, customRange)

      // Fetch active tickets (aberto + em_atendimento) across all accessible setores
      let ticketsQuery = supabase
        .from('tickets')
        .select('*, clientes(nome, telefone), colaboradores(nome), setores(id, nome), subsetores(id, nome)')
        .in('setor_id', targetSetorIds)
        .in('status', ['aberto', 'em_atendimento'])
      const { data: ticketsAtivos } = await ticketsQuery

      // Fetch today's tickets (for stats)
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      let todayQuery = supabase
        .from('tickets')
        .select('id, status, criado_em, primeira_resposta_em, encerrado_em')
        .in('setor_id', targetSetorIds)
        .gte('criado_em', dateCutoff || startOfDay)
      if (dateCutoffTo) todayQuery = todayQuery.lte('criado_em', dateCutoffTo)
      const { data: ticketsHoje } = await todayQuery

      // Fetch atendentes across all accessible setores
      let atendentesQuery = supabase
        .from('colaboradores_setores')
        .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id)')
        .in('setor_id', targetSetorIds)
      const { data: atendentesData } = await atendentesQuery

      // Deduplicate atendentes (same person can be in multiple setores)
      const atendentesMap = new Map()
      for (const a of atendentesData || []) {
        if (a.colaboradores && !atendentesMap.has(a.colaboradores.id)) {
          atendentesMap.set(a.colaboradores.id, a.colaboradores)
        }
      }
      const atendentes = Array.from(atendentesMap.values())

      const tickets = ticketsAtivos || []
      const todayTickets = ticketsHoje || []

      // Calculate stats
      const ticketsNaFila = tickets.filter((t: any) => t.status === 'aberto')
      const ticketsEmAtendimento = tickets.filter((t: any) => t.status === 'em_atendimento')
      const ticketsFinalizados = todayTickets.filter((t: any) => t.status === 'encerrado')

      const atendentesOnline = atendentes.filter((c: any) => c.is_online && c.ativo && !c.pausa_atual_id)
      const atendentesEmPausa = atendentes.filter((c: any) => c.pausa_atual_id && c.ativo)

      // Max times
      const nowMs = Date.now()
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

      return {
        tickets,
        stats: {
          total: tickets.length,
          naFila: ticketsNaFila.length,
          emAtendimento: ticketsEmAtendimento.length,
          finalizados: ticketsFinalizados.length,
          tempoMaximoFila: formatMs(maxTempoFila),
          tempoMaximoResposta: formatMs(maxTempoResposta),
        },
        atendentesStats: {
          online: atendentesOnline.length,
          pausa: atendentesEmPausa.length,
          offline: atendentes.filter((c: any) => !c.is_online && c.ativo && !c.pausa_atual_id).length,
        },
        temposHoje: {
          tempoMedioPrimeiraResposta: formatMs(avgFirstResp),
          tempoMedioResolucao: formatMs(avgResolution),
          totalRecebidos: todayTickets.length,
          totalResolvidos: ticketsFinalizados.length,
        },
      }
    },
    { revalidateOnFocus: false, refreshInterval: 5000 },
  )

  const stats = data?.stats || { total: 0, naFila: 0, emAtendimento: 0, finalizados: 0, tempoMaximoFila: '00:00:00', tempoMaximoResposta: '00:00:00' }
  const atendentesStats = data?.atendentesStats || { online: 0, pausa: 0, offline: 0 }
  const temposHoje = data?.temposHoje || { tempoMedioPrimeiraResposta: '00:00:00', tempoMedioResolucao: '00:00:00', totalRecebidos: 0, totalResolvidos: 0 }
  const tickets = data?.tickets || []

  // Tickets em andamento
  // Lista de atendentes únicos para o filtro
  const atendentesUnicos = useMemo(() => {
    const map = new Map<string, string>()
    tickets.forEach((t: any) => {
      if (t.colaborador_id && t.colaboradores?.nome) {
        map.set(t.colaborador_id, t.colaboradores.nome)
      }
    })
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [tickets])

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || (t.status === 'aberto' && t.colaborador_id))
      .filter((t: any) => {
        // Filtro por atendente
        if (atendenteFilter !== 'all' && t.colaborador_id !== atendenteFilter) return false
        // Filtro de subsetor
        if (subsetorFilter !== 'all') {
          if (subsetorFilter === 'sem_subsetor') {
            if (t.subsetor_id) return false
          } else {
            if (t.subsetor_id !== subsetorFilter) return false
          }
        }
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        const numero = t.numero || t.id?.slice(0, 8) || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase()) || numero.includes(searchTerm)
      })
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        numero: t.numero || t.id?.slice(0, 8),
        // Tempo na fila = criado_em → atribuido_em (tempo sem atendente)
        // Se atribuido_em não foi registrado mas já tem colaborador, o dado não está disponível
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'
            : formatDuration(t.criado_em, null),
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        // Tempo de atendimento = atribuido_em (ou criado_em como fallback) → agora
        tempoAtendimento: t.colaborador_id ? formatDuration(t.atribuido_em || t.criado_em, null) : '00:00:00',
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
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
        if (subsetorFilter !== 'all') {
          if (subsetorFilter === 'sem_subsetor') {
            if (t.subsetor_id) return false
          } else {
            if (t.subsetor_id !== subsetorFilter) return false
          }
        }
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      // Aguardando não tem colaborador, então "Meus" mostra vazio (sem atribuição ainda)
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        numero: t.numero || t.id?.slice(0, 8),
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        setor: t.setores?.nome || '-',
        subsetor: t.subsetores?.nome || null,
        tempoEspera: formatDuration(t.criado_em, null),
        criado_em: t.criado_em,
      }))
  }, [tickets, searchTerm, subsetorFilter])

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
        .select('*, colaboradores(nome), setores(nome)')
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

  const dateFilterLabel = dateFilter === 'custom' && customRange?.from
    ? `${customRange.from.toLocaleDateString('pt-BR')}${customRange.to ? ' - ' + customRange.to.toLocaleDateString('pt-BR') : ''}`
    : dateFilter === 'today' ? 'Hoje' : dateFilter === 'all' ? 'Todo periodo' : `Ultimos ${dateFilter} dias`

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
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="Todos os setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setoresAcessiveis.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subsetoresDisponiveis.length > 0 && (
            <Select value={subsetorFilter} onValueChange={setSubsetorFilter}>
              <SelectTrigger className="w-44 bg-card">
                <SelectValue placeholder="Todos subsetores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos subsetores</SelectItem>
                <SelectItem value="sem_subsetor">Sem subsetor</SelectItem>
                {subsetoresDisponiveis.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DatePeriodFilter
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            showToday={true}
            triggerClassName="w-40"
          />
          <Popover open={filtrosAtendenteOpen} onOpenChange={setFiltrosAtendenteOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-2 bg-transparent",
                  atendenteFilter !== 'all' && "border-primary text-primary"
                )}
              >
                <User className="h-4 w-4" />
                {atendenteFilter !== 'all'
                  ? (atendentesUnicos.find(a => a.id === atendenteFilter)?.nome || 'Atendente')
                  : 'Atendente'
                }
                {atendenteFilter !== 'all' && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtrar por atendente</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setAtendenteFilter('all'); setFiltrosAtendenteOpen(false) }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                      atendenteFilter === 'all' && "font-medium text-primary"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5", atendenteFilter !== 'all' && "invisible")} />
                    Todos os atendentes
                  </button>
                  {atendentesUnicos.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAtendenteFilter(a.id); setFiltrosAtendenteOpen(false) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                        atendenteFilter === a.id && "font-medium text-primary"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5", atendenteFilter !== a.id && "invisible")} />
                      {a.nome}
                    </button>
                  ))}
                  {atendentesUnicos.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum atendente ativo</p>
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
                <p className="text-xl lg:text-2xl font-bold text-green-500">{stats.finalizados}</p>
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
                <p className="text-xl lg:text-2xl font-bold text-foreground">{atendentesStats.offline}</p>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-xs text-muted-foreground">Tickets recebidos ({dateFilterLabel})</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.totalRecebidos}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tickets resolvidos ({dateFilterLabel})</p>
              <p className="text-2xl font-bold text-green-500">{temposHoje.totalResolvidos}</p>
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
                      <TableHead className="text-xs">Tempo na fila</TableHead>
                      <TableHead className="text-xs">Tempo de 1a resposta</TableHead>
                      <TableHead className="text-xs">Tempo de atendimento</TableHead>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Contato</TableHead>
                      <TableHead className="text-xs">Setor / Subsetor</TableHead>
                      <TableHead className="text-xs">Atendente</TableHead>
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
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsEmAndamento.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center">
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
                            <TableCell className="text-xs text-foreground">
                              {ticket.setor}
                              {ticket.subsetor && (
                                <span className="text-muted-foreground"> / {ticket.subsetor}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-foreground">{ticket.atendente || '-'}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConversation(ticket)}>
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
                      <TableHead className="text-xs">Tempo de espera</TableHead>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Contato</TableHead>
                      <TableHead className="text-xs">Setor / Subsetor</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
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
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsAguardando.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="mb-2 h-8 w-8" />
                            <p>Nenhum ticket aguardando</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ticketsAguardando.map((ticket: any) => (
                        <TableRow key={ticket.id} className="bg-orange-50/50 dark:bg-orange-950/20">
                          <TableCell className="font-mono text-xs text-orange-600 font-medium">{ticket.tempoEspera}</TableCell>
                          <TableCell className="text-xs text-foreground font-mono">#{ticket.numero}</TableCell>
                          <TableCell className="text-xs text-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {ticket.contato}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-foreground">
                            {ticket.setor}
                            {ticket.subsetor && (
                              <span className="text-muted-foreground"> / {ticket.subsetor}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConversation(ticket)}>
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
          </div>
        </CardContent>
      </Card>

      {/* Conversation Slide-out Panel */}
      {selectedTicket && (
        <div className="fixed top-16 bottom-0 right-0 z-50 flex">
          <div className="fixed top-16 inset-x-0 bottom-0 bg-black/20 backdrop-blur-sm" onClick={closeConversation} />

          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Ticket #{selectedTicket.numero}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedTicket.contato} - {selectedTicket.setor}
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

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
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
                            {msg.url_imagem && (msg.tipo === 'imagem' || msg.media_type?.startsWith('image/')) && (
                              <img src={msg.url_imagem} alt="" className="max-w-full rounded mb-1" />
                            )}
                            <p className="break-words">{msg.conteudo}</p>
                            <p className={cn(
                              "text-[10px] mt-1",
                              msg.remetente === 'cliente' ? "text-muted-foreground" : "opacity-70"
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
                                      msg.remetente === 'cliente' ? "justify-start" : "justify-end"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "max-w-[80%] rounded px-2 py-1 text-[11px]",
                                        msg.remetente === 'cliente'
                                          ? "bg-background border"
                                          : "bg-primary/80 text-primary-foreground"
                                      )}
                                    >
                                      <p className="break-words">{msg.conteudo}</p>
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
    </div>
  )
}
