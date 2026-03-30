'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

function parseBrowser(ua: string | null): string {
  if (!ua) return ''
  const b = ua.toLowerCase()
  if (b.includes('edg/')) return 'Edge'
  if (b.includes('chrome')) return 'Chrome'
  if (b.includes('firefox')) return 'Firefox'
  if (b.includes('safari')) return 'Safari'
  return 'Navegador'
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTela, setFilterTela] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('pendente')
  const [searchTerm, setSearchTerm] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('error_logs')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(200)

    if (filterTela !== 'all') query = query.eq('tela', filterTela)
    if (filterStatus === 'resolvido') query = query.eq('resolvido', true)
    else if (filterStatus === 'pendente') query = query.eq('resolvido', false)

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }, [supabase, filterTela, filterStatus])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const toggleResolvido = async (id: string, currentValue: boolean) => {
    const res = await fetch('/api/logs/error', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolvido: !currentValue }),
    })
    if (res.ok) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, resolvido: !currentValue } : l))
      toast.success(!currentValue ? 'Marcado como resolvido' : 'Reaberto')
    }
  }

  const deleteLog = async (id: string) => {
    setDeletingId(id)
    const res = await fetch(`/api/logs/error?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLogs(prev => prev.filter(l => l.id !== id))
      toast.success('Log removido')
    }
    setDeletingId(null)
  }

  const clearResolved = async () => {
    const res = await fetch('/api/logs/error?clearResolved=true', { method: 'DELETE' })
    if (res.ok) {
      setLogs(prev => prev.filter(l => !l.resolvido))
      toast.success('Logs resolvidos removidos')
    }
  }

  const filteredLogs = logs.filter(l => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      l.log.toLowerCase().includes(term) ||
      l.tela.toLowerCase().includes(term) ||
      l.rota.toLowerCase().includes(term) ||
      l.componente?.toLowerCase().includes(term) ||
      l.usuario_nome?.toLowerCase().includes(term)
    )
  })

  const uniqueTelas = [...new Set(logs.map(l => l.tela))].sort()
  const pendingCount = logs.filter(l => !l.resolvido).length
  const resolvedCount = logs.filter(l => l.resolvido).length

  const getTicketId = (log: ErrorLog): string | null =>
    (log.metadata?.ticketId as string) || null

  const getLogPreview = (text: string) =>
    text.split('\n')[0].replace(/^\w+Error:\s*/, '').slice(0, 110)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Bug className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Log de Erros</h1>
            <p className="text-sm text-muted-foreground">Erros capturados automaticamente da plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-semibold text-destructive">{pendingCount} pendentes</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">{resolvedCount} resolvidos</span>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-muted/30">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

        <Select value={filterTela} onValueChange={setFilterTela}>
          <SelectTrigger className="w-[165px] h-8 text-xs bg-background">
            <SelectValue placeholder="Todas as telas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as telas</SelectItem>
            {uniqueTelas.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="resolvido">Resolvidos</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar erro, tela, usuário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="h-8 text-xs gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </Button>
          {resolvedCount > 0 && (
            <Button
              variant="outline" size="sm" onClick={clearResolved}
              className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive border-destructive/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar resolvidos
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <RefreshCw className="h-7 w-7 animate-spin opacity-40" />
            <p className="text-sm">Carregando...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Bug className="h-8 w-8 text-muted-foreground/25" />
            </div>
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Nenhum log encontrado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Os erros aparecem aqui automaticamente</p>
            </div>
          </div>
        ) : (
          filteredLogs.map((log) => {
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
    </div>
  )
}
