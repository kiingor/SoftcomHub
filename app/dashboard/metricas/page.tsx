'use client'

import React, { useState, useMemo, useEffect, useCallback } from "react"
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
import { useDashboardData } from '@/lib/hooks/use-data'
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

const COLORS = ['#F97316', '#FB923C', '#FDBA74', '#FBC02D', '#FDBA74', '#FB923C', '#F97316', '#22D3EE', '#818CF8', '#84CC16', '#FFD54F', '#FFF176']

const ITEMS_PER_PAGE = 10

export default function MetricasPage() {
  const { data: dashboardData, isLoading: loadingDash } = useDashboardData()
  const colaborador = dashboardData?.colaborador ?? null
  const setoresAcessiveis = dashboardData?.setores ?? []
  const setorIdsAcessiveis = useMemo(() => setoresAcessiveis.map((s: any) => s.id), [setoresAcessiveis])
  const [dateFilter, setDateFilter] = useState('30')
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [setorFilter, setSetorFilter] = useState<string>('all')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('all')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<{id: string, nome: string}[]>([])
  const [metrics, setMetrics] = useState<MetricCard[]>([
    { title: 'Tempo Médio 1ª Resposta', value: '0 min', description: 'Tempo até primeira resposta', icon: Timer, color: 'bg-primary' },
    { title: 'Tempo Médio Resolução', value: '0 min', description: 'Tempo para encerrar ticket', icon: Clock, color: 'bg-accent' },
    { title: 'Tickets Recebidos', value: '0', description: 'Total no período', icon: Ticket, color: 'bg-secondary' },
    { title: 'Tickets Encerrados', value: '0', description: 'Encerrados no período', icon: CheckCircle, color: 'bg-muted' },
  ])
  const [ticketsBySetor, setTicketsBySetor] = useState<TicketsBySetor[]>([])
  const [ticketsByColaborador, setTicketsByColaborador] = useState<TicketsByColaborador[]>([])
  const [ticketsByPDV, setTicketsByPDV] = useState<{ pdv: string; count: number }[]>([])
  const [ticketsByCliente, setTicketsByCliente] = useState<{ cliente: string; count: number }[]>([])
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([])
  const [loading, setLoading] = useState(false)

  // Chart pagination state
  const [setorPage, setSetorPage] = useState(0)
  const [colaboradorPage, setColaboradorPage] = useState(0)
  const [pdvPage, setPdvPage] = useState(0)
  const [clientePage, setClientePage] = useState(0)

  // Chart internal filter state
  const [chartSetorFilter, setChartSetorFilter] = useState<string>('all')
  const [chartColaboradorFilter, setChartColaboradorFilter] = useState<string>('all')

  // Fetch all colaboradores for the filter dropdown
  const [allColaboradores, setAllColaboradores] = useState<{id: string, nome: string}[]>([])

  // Fetch subsetores when setor filter changes
  useEffect(() => {
    async function fetchSubsetores() {
      const supabase = createClient()
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
  }, [setorFilter, colaborador, setorIdsAcessiveis])

  // Fetch colaboradores for filter
  useEffect(() => {
    async function fetchColaboradores() {
      const supabase = createClient()
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
  }, [setorFilter, colaborador, setorIdsAcessiveis])

  // Reset chart pages when data changes
  useEffect(() => { setSetorPage(0) }, [ticketsBySetor.length])
  useEffect(() => { setColaboradorPage(0) }, [ticketsByColaborador.length])

  const fetchMetrics = useCallback(async () => {
    if (setorIdsAcessiveis.length === 0) return

    const supabase = createClient()
    const { from: filterDate, to: filterDateTo } = getDateCutoffs(dateFilter, customRange)
    const filterSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsAcessiveis

    const periodLabel =
      dateFilter === 'today' ? 'hoje'
      : dateFilter === 'all' ? 'todo o período'
      : dateFilter === 'custom' ? 'período selecionado'
      : `últimos ${dateFilter} dias`

    setLoading(true)
    try {
      // ─── 2 parallel queries instead of 7 sequential ───
      // Query 1: KPI counts via Supabase aggregate (no pagination needed)
      // Query 2: All ticket data for charts in ONE paginated fetch

      // KPI queries (head count, fast)
      const [totalResult, closedResult] = await Promise.all([
        buildRangeQuery(supabase, 'tickets', '*', filterSetorIds, filterDate, filterDateTo)
          .select('*', { count: 'exact', head: true }),
        buildRangeQuery(supabase, 'tickets', '*', filterSetorIds, filterDate, filterDateTo)
          .eq('status', 'encerrado')
          .select('*', { count: 'exact', head: true }),
      ])

      const totalTickets = totalResult.count || 0
      const closedTickets = closedResult.count || 0

      // For time averages, fetch ONLY the 2 date columns needed (not full rows)
      // and use a larger page size to reduce round trips
      const allTicketData = await fetchAllTicketData(supabase, filterSetorIds, filterDate, filterDateTo)

      // Compute KPIs from aggregated data
      let avgFirstResponse = 0
      let avgResolution = 0
      const sectorCounts: Record<string, number> = {}
      const colaboradorCounts: Record<string, number> = {}
      const pdvCounts: Record<string, number> = {}
      const clienteCounts: Record<string, number> = {}
      const dailyCounts: Record<string, number> = {}

      for (const t of allTicketData) {
        // First response time
        if (t.status === 'encerrado' && t.primeira_resposta_em && t.criado_em) {
          const created = new Date(t.criado_em).getTime()
          const firstResp = new Date(t.primeira_resposta_em).getTime()
          avgFirstResponse += (firstResp - created) / (1000 * 60)
        }
        // Resolution time
        if (t.status === 'encerrado' && t.encerrado_em && t.criado_em) {
          const created = new Date(t.criado_em).getTime()
          const closed = new Date(t.encerrado_em).getTime()
          avgResolution += (closed - created) / (1000 * 60)
        }

        // Sector count
        const sectorName = t.setor_nome || 'Sem setor'
        sectorCounts[sectorName] = (sectorCounts[sectorName] || 0) + 1

        // Colaborador count (encerrados only)
        if (t.status === 'encerrado' && t.colaborador_nome) {
          colaboradorCounts[t.colaborador_nome] = (colaboradorCounts[t.colaborador_nome] || 0) + 1
        }

        // PDV count
        const pdvName = t.pdv || 'Sem PDV'
        pdvCounts[pdvName] = (pdvCounts[pdvName] || 0) + 1

        // Cliente count
        const clienteName = t.cliente_nome || 'Desconhecido'
        clienteCounts[clienteName] = (clienteCounts[clienteName] || 0) + 1

        // Daily volume
        if (t.criado_em) {
          const d = new Date(t.criado_em)
          const day = String(d.getDate()).padStart(2, '0')
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const dateKey = `${day}/${month}`
          dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1
        }
      }

      const firstRespCount = allTicketData.filter(t => t.status === 'encerrado' && t.primeira_resposta_em && t.criado_em).length
      const resolutionCount = allTicketData.filter(t => t.status === 'encerrado' && t.encerrado_em && t.criado_em).length

      if (firstRespCount > 0) avgFirstResponse = Math.round(avgFirstResponse / firstRespCount)
      if (resolutionCount > 0) avgResolution = Math.round(avgResolution / resolutionCount)

      const formatTime = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours}h ${mins}m`
      }

      setMetrics([
        { title: 'Tempo Médio 1ª Resposta', value: formatTime(avgFirstResponse), description: `Tempo médio em ${periodLabel}`, icon: Timer, color: 'bg-primary' },
        { title: 'Tempo Médio Resolução', value: formatTime(avgResolution), description: `Tempo médio em ${periodLabel}`, icon: Clock, color: 'bg-accent' },
        { title: 'Tickets Recebidos', value: String(totalTickets), description: `Recebidos em ${periodLabel}`, icon: Ticket, color: 'bg-secondary' },
        { title: 'Tickets Encerrados', value: String(closedTickets), description: `Encerrados em ${periodLabel}`, icon: CheckCircle, color: 'bg-muted' },
      ])

      setTicketsBySetor(
        Object.entries(sectorCounts)
          .map(([setor, count]) => ({ setor, count }))
          .sort((a, b) => b.count - a.count)
      )

      setTicketsByColaborador(
        Object.entries(colaboradorCounts)
          .map(([colaborador, count]) => ({ colaborador, count }))
          .sort((a, b) => b.count - a.count)
      )

      setTicketsByPDV(
        Object.entries(pdvCounts)
          .map(([pdv, count]) => ({ pdv, count }))
          .sort((a, b) => b.count - a.count)
      )

      setTicketsByCliente(
        Object.entries(clienteCounts)
          .map(([cliente, count]) => ({ cliente, count }))
          .sort((a, b) => b.count - a.count)
      )

      const sortedDates = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => {
          const [dayA, monthA] = a.date.split('/').map(Number)
          const [dayB, monthB] = b.date.split('/').map(Number)
          if (monthA !== monthB) return monthA - monthB
          return dayA - dayB
        })
      setDailyVolume(sortedDates)

    } catch (error) {
      console.error('Erro ao buscar métricas:', error)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, customRange, setorFilter, setorIdsAcessiveis])

  // Optimized: single paginated fetch with minimal columns
  async function fetchAllTicketData(supabase: any, setorIds: string[], fromDate: string | null, toDate: string | null) {
    const PAGE_SIZE = 1000
    let all: Array<{
      criado_em: string | null
      primeira_resposta_em: string | null
      encerrado_em: string | null
      status: string | null
      colaborador_nome: string | null
      setor_nome: string | null
      pdv: string | null
      cliente_nome: string | null
    }> = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('tickets')
        .select('criado_em, primeira_resposta_em, encerrado_em, status, colaboradores:colaborador_id(nome), setores:setor_id(nome), clientes:cliente_id(nome, PDV)')
        .in('setor_id', setorIds)
        .order('criado_em', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (fromDate) query = query.gte('criado_em', fromDate)
      if (toDate) query = query.lte('criado_em', toDate)

      const { data } = await query

      if (data && data.length > 0) {
        for (const row of data) {
          all.push({
            criado_em: row.criado_em,
            primeira_resposta_em: row.primeira_resposta_em,
            encerrado_em: row.encerrado_em,
            status: row.status,
            colaborador_nome: row.colaboradores?.nome ?? null,
            setor_nome: row.setores?.nome ?? null,
            pdv: row.clientes?.PDV ?? null,
            cliente_nome: row.clientes?.nome ?? null,
          })
        }
        offset += PAGE_SIZE
        hasMore = data.length === PAGE_SIZE
      } else {
        hasMore = false
      }
    }
    return all
  }

  function buildRangeQuery(supabase: any, table: string, columns: string, setorIds: string[], fromDate: string | null, toDate: string | null) {
    let q = supabase.from(table).select(columns).in('setor_id', setorIds)
    if (fromDate) q = q.gte('criado_em', fromDate)
    if (toDate) q = q.lte('criado_em', toDate)
    return q
  }

  useEffect(() => {
    if (colaborador && setorIdsAcessiveis.length > 0) {
      fetchMetrics()
    }
  }, [colaborador, setorIdsAcessiveis.length, fetchMetrics])

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

  // Paginated data for Tickets por PDV
  const pdvTotalPages = Math.max(1, Math.ceil(ticketsByPDV.length / ITEMS_PER_PAGE))
  const paginatedTicketsByPDV = useMemo(() => {
    const start = pdvPage * ITEMS_PER_PAGE
    return ticketsByPDV.slice(start, start + ITEMS_PER_PAGE)
  }, [ticketsByPDV, pdvPage])

  // Paginated data for Tickets por Cliente
  const clienteTotalPages = Math.max(1, Math.ceil(ticketsByCliente.length / ITEMS_PER_PAGE))
  const paginatedTicketsByCliente = useMemo(() => {
    const start = clientePage * ITEMS_PER_PAGE
    return ticketsByCliente.slice(start, start + ITEMS_PER_PAGE)
  }, [ticketsByCliente, clientePage])

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

  const isLoading = loadingDash || loading

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
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="glass-card-elevated rounded-2xl border-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))
          : metrics.map((metric, index) => (
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
            ))
        }
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

      {/* Tickets por PDV + Tickets por Cliente — Side by Side */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Tickets por PDV */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="glass-card-elevated rounded-2xl border-0">
            <CardHeader>
              <CardTitle className="text-foreground">Tickets por PDV</CardTitle>
              <CardDescription>Distribuição por ponto de venda</CardDescription>
            </CardHeader>
            <CardContent>
              {paginatedTicketsByPDV.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(200, paginatedTicketsByPDV.length * 40)}>
                    <BarChart data={paginatedTicketsByPDV} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs fill-muted-foreground" />
                      <YAxis dataKey="pdv" type="category" width={100} className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => [`${value} tickets`, 'Quantidade']}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {paginatedTicketsByPDV.map((_, index) => (
                          <Cell key={`cell-pdv-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {pdvTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                      <Button variant="outline" size="sm" disabled={pdvPage === 0} onClick={() => setPdvPage(p => p - 1)}>Anterior</Button>
                      <span>{pdvPage + 1} / {pdvTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={pdvPage >= pdvTotalPages - 1} onClick={() => setPdvPage(p => p + 1)}>Próximo</Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">Nenhum dado de PDV disponível</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tickets por Cliente */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="glass-card-elevated rounded-2xl border-0">
            <CardHeader>
              <CardTitle className="text-foreground">Tickets por Cliente</CardTitle>
              <CardDescription>Clientes que mais abrem tickets</CardDescription>
            </CardHeader>
            <CardContent>
              {paginatedTicketsByCliente.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(200, paginatedTicketsByCliente.length * 40)}>
                    <BarChart data={paginatedTicketsByCliente} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs fill-muted-foreground" />
                      <YAxis dataKey="cliente" type="category" width={100} className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => [`${value} tickets`, 'Quantidade']}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {paginatedTicketsByCliente.map((_, index) => (
                          <Cell key={`cell-cli-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {clienteTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                      <Button variant="outline" size="sm" disabled={clientePage === 0} onClick={() => setClientePage(p => p - 1)}>Anterior</Button>
                      <span>{clientePage + 1} / {clienteTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={clientePage >= clienteTotalPages - 1} onClick={() => setClientePage(p => p + 1)}>Próximo</Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">Nenhum dado disponível</div>
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
