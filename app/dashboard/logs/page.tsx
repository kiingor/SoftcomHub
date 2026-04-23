'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Trash2,
  Globe,
  User,
  Clock,
  CheckCircle2,
  X,
  Search,
  MessageSquare,
  ExternalLink,
  Code2,
  Info,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ErrorLog {
  id: string
  tela: string
  rota: string
  log: string
  componente: string | null
  usuario_id: string | null
  usuario_nome: string | null
  navegador: string | null
  metadata: Record<string, unknown>
  resolvido: boolean
  criado_em: string
}

const PAGE_SIZE = 50

function parseBrowser(ua: string | null): string {
  if (!ua) return ''
  const b = ua.toLowerCase()
  if (b.includes('edg/')) return 'Edge'
  if (b.includes('chrome')) return 'Chrome'
  if (b.includes('firefox')) return 'Firefox'
  if (b.includes('safari')) return 'Safari'
  return 'Navegador'
}

// Atalhos de período para o filtro de data
type Preset = 'all' | 'today' | '24h' | '7d' | '30d' | 'custom'

function presetToRange(preset: Preset): { from: string; to: string } {
  if (preset === 'all' || preset === 'custom') return { from: '', to: '' }
  const now = new Date()
  const toIso = (d: Date) => {
    // datetime-local format: YYYY-MM-DDTHH:mm
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  if (preset === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    return { from: toIso(start), to: toIso(now) }
  }
  if (preset === '24h') {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return { from: toIso(start), to: toIso(now) }
  }
  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return { from: toIso(start), to: toIso(now) }
  }
  if (preset === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { from: toIso(start), to: toIso(now) }
  }
  return { from: '', to: '' }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTela, setFilterTela] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('pendente')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro de data e hora
  const [datePreset, setDatePreset] = useState<Preset>('all')
  const [dateFrom, setDateFrom] = useState<string>('') // formato datetime-local
  const [dateTo, setDateTo] = useState<string>('')

  // Paginação
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Contadores globais (independentes dos filtros)
  const [globalCounts, setGlobalCounts] = useState<{ pending: number; resolved: number }>({ pending: 0, resolved: 0 })
  const [availableTelas, setAvailableTelas] = useState<string[]>([])

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  )

  // Debounce do search (400ms) para evitar queries a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400)
    return () => clearTimeout(t)
  }, [searchTerm])

  // Quando troca o preset, atualiza dateFrom/dateTo (exceto 'custom')
  useEffect(() => {
    if (datePreset === 'custom') return
    const { from, to } = presetToRange(datePreset)
    setDateFrom(from)
    setDateTo(to)
    setPage(1)
  }, [datePreset])

  // Ao mudar filtros, volta para a 1ª página
  useEffect(() => { setPage(1) }, [filterTela, filterStatus, debouncedSearch, dateFrom, dateTo])

  const applyFilters = useCallback((q: any) => {
    if (filterTela !== 'all') q = q.eq('tela', filterTela)
    if (filterStatus === 'resolvido') q = q.eq('resolvido', true)
    else if (filterStatus === 'pendente') q = q.eq('resolvido', false)

    if (dateFrom) {
      const fromIso = new Date(dateFrom).toISOString()
      q = q.gte('criado_em', fromIso)
    }
    if (dateTo) {
      const toIso = new Date(dateTo).toISOString()
      q = q.lte('criado_em', toIso)
    }

    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().replace(/[%,]/g, ' ')
      // Busca em múltiplas colunas (log, tela, rota, componente, usuario_nome)
      q = q.or(`log.ilike.%${term}%,tela.ilike.%${term}%,rota.ilike.%${term}%,componente.ilike.%${term}%,usuario_nome.ilike.%${term}%`)
    }

    return q
  }, [filterTela, filterStatus, dateFrom, dateTo, debouncedSearch])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('error_logs')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(from, to)

    q = applyFilters(q)

    const { data, count, error } = await q
    if (!error) {
      setLogs(data || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [supabase, page, applyFilters])

  // Contadores globais — não mudam com filtros de tela/data/busca (só refletem resolvido/pendente)
  const fetchGlobalCounts = useCallback(async () => {
    const [pending, resolved] = await Promise.all([
      supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolvido', false),
      supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolvido', true),
    ])
    setGlobalCounts({
      pending: pending.count || 0,
      resolved: resolved.count || 0,
    })
  }, [supabase])

  // Lista de telas disponíveis para o filtro — carrega uma vez
  const fetchAvailableTelas = useCallback(async () => {
    const { data } = await supabase
      .from('error_logs')
      .select('tela')
      .limit(5000)
    const telas = [...new Set((data || []).map(l => l.tela))].sort()
    setAvailableTelas(telas)
  }, [supabase])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => {
    fetchGlobalCounts()
    fetchAvailableTelas()
  }, [fetchGlobalCounts, fetchAvailableTelas])

  const toggleResolvido = async (id: string, currentValue: boolean) => {
    const res = await fetch('/api/logs/error', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolvido: !currentValue }),
    })
    if (res.ok) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, resolvido: !currentValue } : l))
      setGlobalCounts(prev => ({
        pending: prev.pending + (currentValue ? 1 : -1),
        resolved: prev.resolved + (currentValue ? -1 : 1),
      }))
      toast.success(!currentValue ? 'Marcado como resolvido' : 'Reaberto')
    }
  }

  const deleteLog = async (id: string) => {
    setDeletingId(id)
    const res = await fetch(`/api/logs/error?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      const deletedLog = logs.find(l => l.id === id)
      setLogs(prev => prev.filter(l => l.id !== id))
      setTotalCount(c => Math.max(0, c - 1))
      if (deletedLog) {
        setGlobalCounts(prev => ({
          pending: prev.pending + (deletedLog.resolvido ? 0 : -1),
          resolved: prev.resolved + (deletedLog.resolvido ? -1 : 0),
        }))
      }
      toast.success('Log removido')
    }
    setDeletingId(null)
  }

  const clearResolved = async () => {
    const res = await fetch('/api/logs/error?clearResolved=true', { method: 'DELETE' })
    if (res.ok) {
      fetchLogs()
      fetchGlobalCounts()
      toast.success('Logs resolvidos removidos')
    }
  }

  const clearAllFilters = () => {
    setFilterTela('all')
    setFilterStatus('pendente')
    setSearchTerm('')
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, totalCount)
  const hasActiveDate = !!dateFrom || !!dateTo

  const getTicketId = (log: ErrorLog): string | null =>
    (log.metadata?.ticketId as string) || null

  const getLogPreview = (text: string) =>
    text.split('\n')[0].replace(/^\w+Error:\s*/, '').slice(0, 110)

  return (
    <div className="space-y-6">

      {/* Header — padrão do dashboard */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Bug className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Log de Erros</h1>
            <p className="text-muted-foreground">Erros capturados automaticamente da plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-semibold text-destructive">{globalCounts.pending} pendentes</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">{globalCounts.resolved} resolvidos</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardContent className="pt-6 space-y-3">
          {/* Linha 1: tela / status / período preset / busca */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

            <Select value={filterTela} onValueChange={setFilterTela}>
              <SelectTrigger className="w-[180px] h-9 text-sm bg-background">
                <SelectValue placeholder="Todas as telas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as telas</SelectItem>
                {availableTelas.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-9 text-sm bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as Preset)}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-background">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por erro, tela, rota, componente ou usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-background"
              />
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchGlobalCounts() }} disabled={loading} className="h-9 text-xs gap-1.5">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Atualizar
              </Button>
              {globalCounts.resolved > 0 && (
                <Button
                  variant="outline" size="sm" onClick={clearResolved}
                  className="h-9 text-xs gap-1.5 text-destructive hover:text-destructive border-destructive/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar resolvidos
                </Button>
              )}
            </div>
          </div>

          {/* Linha 2: range de data/hora (sempre visível — edição direta liga o preset 'custom') */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground pl-6">De</span>
            <Input
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setDatePreset('custom') }}
              className="w-[215px] h-9 text-sm bg-background"
            />
            <span className="text-xs font-medium text-muted-foreground">até</span>
            <Input
              type="datetime-local"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setDatePreset('custom') }}
              className="w-[215px] h-9 text-sm bg-background"
            />

            {(hasActiveDate || searchTerm || filterTela !== 'all' || filterStatus !== 'pendente') && (
              <Button
                variant="ghost" size="sm" onClick={clearAllFilters}
                className="h-9 text-xs gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}

            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {totalCount > 0
                ? <>Mostrando <strong className="text-foreground">{showingFrom}–{showingTo}</strong> de <strong className="text-foreground">{totalCount}</strong></>
                : <>Nenhum resultado</>}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-1.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <RefreshCw className="h-7 w-7 animate-spin opacity-40" />
            <p className="text-sm">Carregando...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Bug className="h-8 w-8 text-muted-foreground/25" />
            </div>
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Nenhum log encontrado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Ajuste os filtros ou aguarde novos erros</p>
            </div>
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedId === log.id
            const ticketId = getTicketId(log)
            const isDeleting = deletingId === log.id
            const browser = parseBrowser(log.navegador)

            return (
              <div
                key={log.id}
                className={cn(
                  'rounded-xl border transition-all',
                  log.resolvido
                    ? 'bg-muted/15 border-border/30 opacity-60'
                    : 'bg-card border-border',
                  isExpanded && !log.resolvido && 'border-destructive/25 shadow-sm'
                )}
              >
                {/* Linha principal */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Dot */}
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    log.resolvido ? 'bg-green-500' : 'bg-destructive'
                  )} />

                  {/* Info clicável */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted border border-border/60 text-muted-foreground uppercase tracking-wide">
                        {log.tela}
                      </span>
                      {log.componente && (
                        <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-0.5">
                          <Code2 className="h-3 w-3" />{log.componente}
                        </span>
                      )}
                      {log.usuario_nome && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <User className="h-3 w-3" />{log.usuario_nome}
                        </span>
                      )}
                      {ticketId && (
                        <span className="text-[10px] text-blue-500 flex items-center gap-0.5 font-medium">
                          <MessageSquare className="h-3 w-3" />ticket vinculado
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-foreground/75 truncate font-mono leading-tight">
                      {getLogPreview(log.log)}
                    </p>
                  </div>

                  {/* Ações sempre visíveis */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-[11px] text-muted-foreground/70 tabular-nums hidden sm:block"
                      title={format(new Date(log.criado_em), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    >
                      {formatDistanceToNow(new Date(log.criado_em), { addSuffix: true, locale: ptBR })}
                    </span>

                    {/* Marcar resolvido (toggle) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleResolvido(log.id, log.resolvido) }}
                      title={log.resolvido ? 'Reabrir' : 'Marcar como resolvido'}
                      className={cn(
                        'h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
                        log.resolvido
                          ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:text-green-600 hover:bg-green-500/10'
                      )}
                    >
                      {log.resolvido ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    </button>

                    {/* Delete sempre visível */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLog(log.id) }}
                      disabled={isDeleting}
                      title="Excluir log"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      {isDeleting
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </button>

                    {/* Expandir */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/40">

                    {/* Meta rápida */}
                    <div className="flex items-center gap-4 pt-3 flex-wrap">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <code className="font-mono">{log.rota}</code>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {format(new Date(log.criado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                      </span>
                      {browser && (
                        <span className="text-[11px] text-muted-foreground">{browser}</span>
                      )}
                    </div>

                    {/* Vínculo com ticket */}
                    {ticketId && (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-blue-500/8 border border-blue-500/20">
                        <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            Erro ocorrido enquanto o usuário atendia o ticket
                          </p>
                          <code className="text-[11px] font-mono text-blue-500/80">{ticketId}</code>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(ticketId).catch(() => {})
                            toast.info('ID copiado — busque no Workdesk para ver a conversa')
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Copiar ID
                        </button>
                      </div>
                    )}

                    {/* Stack trace */}
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Bug className="h-3 w-3" /> Stack trace
                      </p>
                      <pre className="text-xs font-mono bg-zinc-950 text-zinc-100 dark:bg-[#111] rounded-lg px-4 py-3 overflow-x-auto max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words leading-5">
                        {log.log}
                      </pre>
                    </div>

                    {/* Contexto / metadata */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                          <Info className="h-3 w-3" /> Contexto
                        </p>
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg px-4 py-3 overflow-x-auto max-h-[160px] overflow-y-auto whitespace-pre-wrap text-foreground/80 leading-5">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Botões de ação no expanded */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); toggleResolvido(log.id, log.resolvido) }}
                        className={cn(
                          "h-8 text-xs gap-1.5",
                          log.resolvido
                            ? "variant-outline"
                            : "bg-green-600 hover:bg-green-700 text-white border-0"
                        )}
                        variant={log.resolvido ? 'outline' : 'default'}
                      >
                        {log.resolvido
                          ? <><X className="h-3.5 w-3.5" />Reabrir</>
                          : <><Check className="h-3.5 w-3.5" />Marcar resolvido</>
                        }
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={(e) => { e.stopPropagation(); deleteLog(log.id) }}
                        disabled={isDeleting}
                        className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Paginação */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            Página <strong className="text-foreground">{page}</strong> de <strong className="text-foreground">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(1)}
              disabled={page <= 1 || loading}
              className="h-8 text-xs gap-1.5 hidden sm:flex"
            >
              Primeira
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8 text-xs gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 text-xs gap-1.5"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || loading}
              className="h-8 text-xs gap-1.5 hidden sm:flex"
            >
              Última
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
