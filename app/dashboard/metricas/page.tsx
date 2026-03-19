'use client'

import { useEffect } from "react"

import React, { useState, useMemo } from "react"
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, Ticket, Timer } from 'lucide-react'
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

export default function MetricasPage() {
  const supabase = createClient()
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const setorIdsAcessiveis = setoresAcessiveis.map((s: any) => s.id)
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

  React.useEffect(() => {
    if (colaborador && (colaborador.is_master || setorIdsAcessiveis.length > 0)) {
      fetchMetrics()
    }
  }, [dateFilter, customRange, setorFilter, subsetorFilter, colaborador, setorIdsAcessiveis.length])

  async function fetchMetrics() {
    if (!colaborador?.is_master && setorIdsAcessiveis.length === 0) return

    // Calculate date range for filter
    const { from: filterDate, to: filterDateTo } = getDateCutoffs(dateFilter, customRange)

    // Determine which setor IDs to filter by
    // Sempre filtra pelos setores acessíveis (mesmo para masters) para consistência com monitoramento
    const filterSetorIds = setorFilter !== 'all'
      ? [setorFilter]
      : (setorIdsAcessiveis.length > 0 ? setorIdsAcessiveis : null)

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
      if (filterSetorIds) firstResponseQuery = firstResponseQuery.in('setor_id', filterSetorIds)
      if (filterDate) firstResponseQuery = firstResponseQuery.gte('criado_em', filterDate)
      if (filterDateTo) firstResponseQuery = firstResponseQuery.lte('criado_em', filterDateTo)
      const { data: firstResponseData } = await firstResponseQuery

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
      if (filterSetorIds) resolutionQuery = resolutionQuery.in('setor_id', filterSetorIds)
      if (filterDate) resolutionQuery = resolutionQuery.gte('encerrado_em', filterDate)
      if (filterDateTo) resolutionQuery = resolutionQuery.lte('encerrado_em', filterDateTo)
      const { data: resolutionData } = await resolutionQuery

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
      let totalQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
      if (filterSetorIds) totalQuery = totalQuery.in('setor_id', filterSetorIds)
      if (filterDate) totalQuery = totalQuery.gte('criado_em', filterDate)
      if (filterDateTo) totalQuery = totalQuery.lte('criado_em', filterDateTo)
      const { count: totalTickets } = await totalQuery

      // Fetch tickets encerrados no período selecionado
      let closedQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'encerrado')
      if (filterSetorIds) closedQuery = closedQuery.in('setor_id', filterSetorIds)
      if (filterDate) closedQuery = closedQuery.gte('encerrado_em', filterDate)
      if (filterDateTo) closedQuery = closedQuery.lte('encerrado_em', filterDateTo)
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
      if (filterSetorIds) ticketQuery = ticketQuery.in('setor_id', filterSetorIds)
      if (filterDate) ticketQuery = ticketQuery.gte('criado_em', filterDate)
      if (filterDateTo) ticketQuery = ticketQuery.lte('criado_em', filterDateTo)

      const { data: sectorData } = await ticketQuery

      if (sectorData) {
        const sectorCounts: Record<string, number> = {}
        sectorData.forEach((ticket: any) => {
          const sectorName = ticket.setores?.nome || 'Sem setor'
          sectorCounts[sectorName] = (sectorCounts[sectorName] || 0) + 1
        })
        setTicketsBySetor(
          Object.entries(sectorCounts).map(([setor, count]) => ({ setor, count }))
        )
      }

      // Fetch tickets by collaborator
      let colaboradorQuery = supabase
        .from('tickets')
        .select('colaborador_id, colaboradores(nome)')
        .eq('status', 'encerrado')
        .not('colaborador_id', 'is', null)
      if (filterSetorIds) colaboradorQuery = colaboradorQuery.in('setor_id', filterSetorIds)
      if (filterDate) colaboradorQuery = colaboradorQuery.gte('encerrado_em', filterDate)
      if (filterDateTo) colaboradorQuery = colaboradorQuery.lte('encerrado_em', filterDateTo)

      const { data: colaboradorData } = await colaboradorQuery

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
      if (filterSetorIds) dailyQuery = dailyQuery.in('setor_id', filterSetorIds)
      if (filterDate) dailyQuery = dailyQuery.gte('criado_em', filterDate)
      if (filterDateTo) dailyQuery = dailyQuery.lte('criado_em', filterDateTo)

      const { data: dailyData } = await dailyQuery

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
            <CardHeader>
              <CardTitle className="text-foreground">Tickets por Setor</CardTitle>
              <CardDescription>Distribuição de tickets por departamento</CardDescription>
            </CardHeader>
            <CardContent>
              {ticketsBySetor.length > 0 ? (
                <ChartContainer
                  config={{
                    count: {
                      label: 'Tickets',
                      color: '#F97316',
                    },
                  }}
                  className="w-full"
                  style={{ height: Math.max(300, ticketsBySetor.length * 40 + 60) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[...ticketsBySetor].sort((a, b) => a.count - b.count)}
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
                        {[...ticketsBySetor].sort((a, b) => a.count - b.count).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
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
            <CardHeader>
              <CardTitle className="text-foreground">Atendimentos por Colaborador</CardTitle>
              <CardDescription>Tickets encerrados por cada colaborador</CardDescription>
            </CardHeader>
            <CardContent>
              {ticketsByColaborador.length > 0 ? (
                <ChartContainer
                  config={{
                    count: {
                      label: 'Tickets',
                      color: '#F97316',
                    },
                  }}
                  className="w-full"
                  style={{ height: Math.max(300, ticketsByColaborador.length * 36 + 60) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ticketsByColaborador}
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
                        {ticketsByColaborador.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Daily Volume Chart */}
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
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyVolume} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#666', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: '#666' }} />
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
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
