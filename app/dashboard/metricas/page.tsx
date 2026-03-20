'use client'

import { useEffect } from "react"

import React, { useState, useMemo } from "react"
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, Ticket, Timer, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { DateRange } from 'react-day-picker'
import { DatePeriodFilter, getDateCutoffs } from '@/components/date-period-filter'

interface MetricCard {
  title: string
  value: string
  description: string
  icon: React.ElementType
  color: string
}

interface TicketsBySetor {
  setor: string
  count: number
}

interface TicketsByColaborador {
  colaborador: string
  count: number
}

interface DailyVolume {
  date: string
  count: number
}

const COLORS = ['#F97316', '#FB923C', '#FDBA74', '#FBC02D', '#F9A825', '#F57F17', '#FFD54F', '#FFEB3B', '#FFF176', '#84CC16', '#22D3EE', '#818CF8']

const ITEMS_PER_PAGE = 10

export default function MetricasPage() {
  const supabase = createClient()
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const setorIdsAcessiveis = useMemo(() => setoresAcessiveis.map((s: any) => s.id), [setoresAcessiveis])
  const [dateFilter, setDateFilter] = useState('30')
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [setorFilter, setSetorFilter] = useState<string>('all')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('all')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<{id: string, nome: string}[]>([])
  const [metrics, setMetrics] = useState<MetricCard[]>([
    { title: 'Tempo Médio 1ª Resposta', value: '0 min', description: 'Tempo até primeira resposta', icon: Timer, color: 'bg-primary' },
    { title: 'Tempo Médio Resolução', value: '0 min', description: 'Tempo para encerrar ticket', icon: Clock, color: 'bg-accent' },
    { title: 'Tickets Recebidos', value: '0', description: 'Total no mês atual', icon: Ticket, color: 'bg-secondary' },
    { title: 'Tickets Encerrados', value: '0', description: 'Encerrados no mês atual', icon: CheckCircle, color: 'bg-muted' },
  ])
  const [ticketsBySetor, setTicketsBySetor] = useState<TicketsBySetor[]>([])
  const [ticketsByColaborador, setTicketsByColaborador] = useState<TicketsByColaborador[]>([])
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([])
  const [loading, setLoading] = useState(false)

  // Chart pagination state
  const [setorPage, setSetorPage] = useState(0)
  const [colaboradorPage, setColaboradorPage] = useState(0)

  // Chart internal filter state
  const [chartSetorFilter, setChartSetorFilter] = useState<string>('all')
  const [chartColaboradorFilter, setChartColaboradorFilter] = useState<string>('all')

  // Fetch all colaboradores for the filter dropdown
  const [allColaboradores, setAllColaboradores] = useState<{id: string, nome: string}[]>([])

  React.useEffect(() => {
    async function fetchColaboradores() {
      const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsAcessiveis
      if (targetSetorIds.length === 0) return
      const { data } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id, colaboradores(id, nome)')
        .in('setor_id', targetSetorIds)
      if (data) {
        const map = new Map<string, string>()
        data.forEach((d: any) => {
          if (d.colaboradores) map.set(d.colaboradores.id, d.colaboradores.nome)
        })
        setAllColaboradores(Array.from(map.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)))
      }
    }
    if (colaborador && setorIdsAcessiveis.length > 0) {
      fetchColaboradores()
    }
  }, [setorFilter, colaborador, setorIdsAcessiveis.length, supabase])

  // Fetch subsetores when setor filter changes
  React.useEffect(() => {
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
    }
    if (colaborador && setorIdsAcessiveis.length > 0) {
      fetchSubsetores()
    }
  }, [setorFilter, colaborador, setorIdsAcessiveis.length, supabase])

  // CRITICAL FIX: Only fetch metrics when setorIdsAcessiveis is loaded (prevents counting ALL tickets)
  React.useEffect(() => {
    if (colaborador && setorIdsAcessiveis.length > 0) {
      fetchMetrics()
    }
  }, [dateFilter, customRange, setorFilter, subsetorFilter, colaborador, setorIdsAcessiveis.length])

  // Reset chart pages when data changes
  React.useEffect(() => { setSetorPage(0) }, [ticketsBySetor.length])
  React.useEffect(() => { setColaboradorPage(0) }, [ticketsByColaborador.length])

  async function fetchMetrics() {
    // Always require setorIdsAcessiveis to be loaded - prevents counting all tickets
    if (setorIdsAcessiveis.length === 0) return

    // Calculate date range for filter
    const { from: filterDate, to: filterDateTo } = getDateCutoffs(dateFilter, customRange)

    // Determine which setor IDs to filter by - ALWAYS filter by accessible setores
    const filterSetorIds = setorFilter !== 'all'
      ? [setorFilter]
      : setorIdsAcessiveis

    // Label dinâmico para as descrições dos KPIs
    const periodLabel =
      dateFilter === 'today' ? 'hoje'
      : dateFilter === 'all' ? 'todo o período'
      : dateFilter === 'custom' ? 'período selecionado'
      : `últimos ${dateFilter} dias`

    try {
      // Fetch average first response time (filtrado pelo período selecionado)
      let firstResponseQuery = supabase
        .from('tickets')
        .select('criado_em, primeira_resposta_em')
        .eq('status', 'encerrado')
        .not('primeira_resposta_em', 'is', null)
        .in('setor_id', filterSetorIds)
      if (filterDate) firstResponseQuery = firstResponseQuery.gte('criado_em', filterDate)
      if (filterDateTo) firstResponseQuery = firstResponseQuery.lte('criado_em', filterDateTo)
      const { data: firstResponseData } = await firstResponseQuery.limit(50000)

      let avgFirstResponse = 0
      if (firstResponseData && firstResponseData.length > 0) {
        const totalMinutes = firstResponseData.reduce((sum, ticket) => {
          const created = new Date(ticket.criado_em).getTime()
          const firstResponse = new Date(ticket.primeira_resposta_em).getTime()
          return sum + (firstResponse - created) / (1000 * 60)
        }, 0)
        avgFirstResponse = Math.round(totalMinutes / firstResponseData.length)
      }

      // Fetch average resolution time (filtrado pelo período selecionado)
      let resolutionQuery = supabase
        .from('tickets')
        .select('criado_em, encerrado_em')
        .eq('status', 'encerrado')
        .not('encerrado_em', 'is', null)
        .in('setor_id', filterSetorIds)
      if (filterDate) resolutionQuery = resolutionQuery.gte('criado_em', filterDate)
      if (filterDateTo) resolutionQuery = resolutionQuery.lte('criado_em', filterDateTo)
      const { data: resolutionData } = await resolutionQuery.limit(50000)

      let avgResolution = 0
      if (resolutionData && resolutionData.length > 0) {
        const totalMinutes = resolutionData.reduce((sum, ticket) => {
          const created = new Date(ticket.criado_em).getTime()
          const closed = new Date(ticket.encerrado_em).getTime()
          return sum + (closed - created) / (1000 * 60)
        }, 0)
        avgResolution = Math.round(totalMinutes / resolutionData.length)
      }

      // Fetch total tickets recebidos no período selecionado
      // Filtra por criado_em (consistente com monitoramento)
      let totalQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('setor_id', filterSetorIds)
      if (filterDate) totalQuery = totalQuery.gte('criado_em', filterDate)
      if (filterDateTo) totalQuery = totalQuery.lte('criado_em', filterDateTo)
      const { count: totalTickets } = await totalQuery

      // Fetch tickets encerrados no período selecionado
      // Filtra por criado_em + status encerrado (consistente com monitoramento)
      let closedQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'encerrado')
        .in('setor_id', filterSetorIds)
      if (filterDate) closedQuery = closedQuery.gte('criado_em', filterDate)
      if (filterDateTo) closedQuery = closedQuery.lte('criado_em', filterDateTo)
      const { count: closedTickets } = await closedQuery

      // Format times for display
      const formatTime = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours}h ${mins}m`
      }

      setMetrics([
        { title: 'Tempo Médio 1ª Resposta', value: formatTime(avgFirstResponse), description: `Tempo médio em ${periodLabel}`, icon: Timer, color: 'bg-primary' },
        { title: 'Tempo Médio Resolução', value: formatTime(avgResolution), description: `Tempo médio em ${periodLabel}`, icon: Clock, color: 'bg-accent' },
        { title: 'Tickets Recebidos', value: String(totalTickets || 0), description: `Recebidos em ${periodLabel}`, icon: Ticket, color: 'bg-secondary' },
        { title: 'Tickets Encerrados', value: String(closedTickets || 0), description: `Encerrados em ${periodLabel}`, icon: CheckCircle, color: 'bg-muted' },
      ])

      // Fetch tickets by sector
      let ticketQuery = supabase
        .from('tickets')
        .select('setor_id, setores(nome)')
        .in('setor_id', filterSetorIds)
      if (filterDate) ticketQuery = ticketQuery.gte('criado_em', filterDate)
      if (filterDateTo) ticketQuery = ticketQuery.lte('criado_em', filterDateTo)

      const { data: sectorData } = await ticketQuery.limit(50000)

      if (sectorData) {
        const sectorCounts: Record<string, number> = {}
        sectorData.forEach((ticket: any) => {
          const sectorName = ticket.setores?.nome || 'Sem setor'
          sectorCounts[sectorName] = (sectorCounts[sectorName] || 0) + 1
        })
        setTicketsBySetor(
          Object.entries(sectorCounts)
            .map(([setor, count]) => ({ setor, count }))
            .sort((a, b) => b.count - a.count)
        )
      }

      // Fetch tickets by collaborator
      let colaboradorQuery = supabase
        .from('tickets')
        .select('colaborador_id, colaboradores(nome)')
        .eq('status', 'encerrado')
        .not('colaborador_id', 'is', null)
        .in('setor_id', filterSetorIds)
      if (filterDate) colaboradorQuery = colaboradorQuery.gte('criado_em', filterDate)
      if (filterDateTo) colaboradorQuery = colaboradorQuery.lte('criado_em', filterDateTo)

      const { data: colaboradorData } = await colaboradorQuery.limit(50000)

      if (colaboradorData) {
        const colaboradorCounts: Record<string, number> = {}
        colaboradorData.forEach((ticket: any) => {
          const colaboradorName = ticket.colaboradores?.nome || 'Desconhecido'
          colaboradorCounts[colaboradorName] = (colaboradorCounts[colaboradorName] || 0) + 1
        })
        setTicketsByColaborador(
          Object.entries(colaboradorCounts)
            .map(([colaborador, count]) => ({ colaborador, count }))
            .sort((a, b) => b.count - a.count)
        )
      }

      // Fetch daily volume
      let dailyQuery = supabase
        .from('tickets')
        .select('criado_em')
        .in('setor_id', filterSetorIds)
      if (filterDate) dailyQuery = dailyQuery.gte('criado_em', filterDate)
      if (filterDateTo) dailyQuery = dailyQuery.lte('criado_em', filterDateTo)

      const { data: dailyData } = await dailyQuery.limit(50000)

      if (dailyData) {
        const dailyCounts: Record<string, number> = {}
        dailyData.forEach((ticket) => {
          const date = new Date(ticket.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          dailyCounts[date] = (dailyCounts[date] || 0) + 1
        })

        // Sort by date
        const sortedDates = Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => {
            const [dayA, monthA] = a.date.split('/').map(Number)
            const [dayB, monthB] = b.date.split('/').map(Number)
            if (monthA !== monthB) return monthA - monthB
            return dayA - dayB
          })

        setDailyVolume(sortedDates)
      }

    } catch (error) {
      console.error('Erro ao buscar métricas:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtered + paginated data for Tickets por Setor
  const filteredTicketsBySetor = useMemo(() => {
    if (chartSetorFilter === 'all') return ticketsBySetor
    return ticketsBySetor.filter(t => t.setor === chartSetorFilter)
  }, [ticketsBySetor, chartSetorFilter])

  const setorTotalPages = Math.max(1, Math.ceil(filteredTicketsBySetor.length / ITEMS_PER_PAGE))
  const paginatedTicketsBySetor = useMemo(() => {
    const start = setorPage * ITEMS_PER_PAGE
    return filteredTicketsBySetor.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredTicketsBySetor, setorPage])

  // Filtered + paginated data for Atendimentos por Colaborador
  const filteredTicketsByColaborador = useMemo(() => {
    if (chartColaboradorFilter === 'all') return ticketsByColaborador
    return ticketsByColaborador.filter(t => t.colaborador === chartColaboradorFilter)
  }, [ticketsByColaborador, chartColaboradorFilter])

  const colaboradorTotalPages = Math.max(1, Math.ceil(filteredTicketsByColaborador.length / ITEMS_PER_PAGE))
  const paginatedTicketsByColaborador = useMemo(() => {
    const start = colaboradorPage * ITEMS_PER_PAGE
    return filteredTicketsByColaborador.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredTicketsByColaborador, colaboradorPage])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Métricas
        </h1>
        <p className="text-muted-foreground">
          Acompanhe os indicadores de desempenho da operação
        </p>
      </div>

      {/* Metric Cards */}
      <motion.div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {metrics.map((metric, index) => (
          <motion.div key={metric.title} variants={itemVariants}>
            <Card className="glass-card-elevated rounded-2xl border-0 overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-foreground">{metric.title}</CardTitle>
                <div className={`rounded-lg ${metric.color} p-2`}>
                  <metric.icon className="h-4 w-4 text-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{metric.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Setor:</span>
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue placeholder="Todos os setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setoresAcessiveis.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Periodo:</span>
          <DatePeriodFilter
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            showToday={true}
          />
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets by Sector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card-elevated rounded-2xl border-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Tickets por Setor</CardTitle>
                  <CardDescription>Distribuição de tickets por departamento</CardDescription>
                </div>
                <Select value={chartSetorFilter} onValueChange={(v) => { setChartSetorFilter(v); setSetorPage(0) }}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-card border-border">
                    <SelectValue placeholder="Filtrar setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os setores</SelectItem>
                    {ticketsBySetor.map((s) => (
                      <SelectItem key={s.setor} value={s.setor}>{s.setor}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {paginatedTicketsBySetor.length > 0 ? (
                <>
                  <ChartContainer
                    config={{
                      count: {
                        label: 'Tickets',
                        color: '#F97316',
                      },
                    }}
                    className="w-full"
                    style={{ height: 400 }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...paginatedTicketsBySetor].sort((a, b) => a.count - b.count)}
                        layout="vertical"
                        margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis
                          dataKey="setor"
                          type="category"
                          tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                          width={140}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" name="Tickets" radius={[0, 6, 6, 0]} barSize={24}>
                          {[...paginatedTicketsBySetor].sort((a, b) => a.count - b.count).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Pagination */}
                  {filteredTicketsBySetor.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {setorPage * ITEMS_PER_PAGE + 1}-{Math.min((setorPage + 1) * ITEMS_PER_PAGE, filteredTicketsBySetor.length)} de {filteredTicketsBySetor.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={setorPage === 0}
                          onClick={() => setSetorPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-2">
                          {setorPage + 1}/{setorTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={setorPage >= setorTotalPages - 1}
                          onClick={() => setSetorPage(p => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tickets by Collaborator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="glass-card-elevated rounded-2xl border-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Atendimentos por Colaborador</CardTitle>
                  <CardDescription>Tickets encerrados por cada colaborador</CardDescription>
                </div>
                <Select value={chartColaboradorFilter} onValueChange={(v) => { setChartColaboradorFilter(v); setColaboradorPage(0) }}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-card border-border">
                    <SelectValue placeholder="Filtrar colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {ticketsByColaborador.map((c) => (
                      <SelectItem key={c.colaborador} value={c.colaborador}>{c.colaborador}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {paginatedTicketsByColaborador.length > 0 ? (
                <>
                  <ChartContainer
                    config={{
                      count: {
                        label: 'Tickets',
                        color: '#F97316',
                      },
                    }}
                    className="w-full"
                    style={{ height: 400 }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={paginatedTicketsByColaborador}
                        layout="vertical"
                        margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis
                          dataKey="colaborador"
                          type="category"
                          tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                          width={140}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" name="Tickets" radius={[0, 6, 6, 0]} barSize={22}>
                          {paginatedTicketsByColaborador.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Pagination */}
                  {filteredTicketsByColaborador.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {colaboradorPage * ITEMS_PER_PAGE + 1}-{Math.min((colaboradorPage + 1) * ITEMS_PER_PAGE, filteredTicketsByColaborador.length)} de {filteredTicketsByColaborador.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={colaboradorPage === 0}
                          onClick={() => setColaboradorPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-2">
                          {colaboradorPage + 1}/{colaboradorTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={colaboradorPage >= colaboradorTotalPages - 1}
                          onClick={() => setColaboradorPage(p => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Daily Volume Chart - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardHeader>
            <CardTitle className="text-foreground">Volume Diário de Tickets</CardTitle>
            <CardDescription>Quantidade de tickets criados por dia</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyVolume.length > 0 ? (
              <ChartContainer
                config={{
                  count: {
                    label: 'Tickets',
                    color: '#FBC02D',
                  },
                }}
                className="h-[400px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyVolume} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Tickets"
                      stroke="#F97316"
                      strokeWidth={3}
                      dot={{ fill: '#F97316', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#EA580C' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
