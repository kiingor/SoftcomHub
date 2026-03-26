'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
  Trash2,
  Monitor,
  Globe,
  User,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTela, setFilterTela] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

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

    if (filterTela !== 'all') {
      query = query.eq('tela', filterTela)
    }
    if (filterStatus === 'resolvido') {
      query = query.eq('resolvido', true)
    } else if (filterStatus === 'pendente') {
      query = query.eq('resolvido', false)
    }

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }, [supabase, filterTela, filterStatus])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const toggleResolvido = async (id: string, currentValue: boolean) => {
    const res = await fetch('/api/logs/error', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolvido: !currentValue }),
    })
    if (res.ok) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, resolvido: !currentValue } : l))
      toast.success(!currentValue ? 'Marcado como resolvido' : 'Marcado como pendente')
    }
  }

  const deleteLog = async (id: string) => {
    const res = await fetch(`/api/logs/error?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLogs(prev => prev.filter(l => l.id !== id))
      toast.success('Log removido')
    }
  }

  const clearResolved = async () => {
    const res = await fetch('/api/logs/error?clearResolved=true', { method: 'DELETE' })
    if (res.ok) {
      setLogs(prev => prev.filter(l => !l.resolvido))
      toast.success('Logs resolvidos removidos')
    }
  }

  // Filtro por busca
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

  // Telas únicas para filtro
  const uniqueTelas = [...new Set(logs.map(l => l.tela))].sort()

  const pendingCount = logs.filter(l => !l.resolvido).length
  const resolvedCount = logs.filter(l => l.resolvido).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Bug className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Logs de Erros</h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento de erros da plataforma
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {pendingCount} pendentes
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {resolvedCount} resolvidos
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterTela} onValueChange={setFilterTela}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Todas as telas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as telas</SelectItem>
              {uniqueTelas.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="resolvido">Resolvidos</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar no log..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-[250px] h-9"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            Atualizar
          </Button>
          {resolvedCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearResolved} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar resolvidos
            </Button>
          )}
        </div>
      </div>

      {/* Logs List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bug className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum log encontrado</p>
            <p className="text-sm mt-1">Os erros da plataforma aparecerão aqui automaticamente.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedId === log.id
            return (
              <div
                key={log.id}
                className={cn(
                  'border rounded-xl transition-all',
                  log.resolvido
                    ? 'bg-muted/30 border-muted opacity-70'
                    : 'bg-card border-border'
                )}
              >
                {/* Row Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-xl"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    log.resolvido ? 'bg-green-500' : 'bg-destructive'
                  )} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                        <Monitor className="h-3 w-3 mr-1" />
                        {log.tela}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                        <Globe className="h-3 w-3 mr-1" />
                        {log.rota}
                      </Badge>
                      {log.usuario_nome && (
                        <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                          <User className="h-3 w-3 mr-1" />
                          {log.usuario_nome}
                        </Badge>
                      )}
                      {log.componente && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {log.componente}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground mt-1 truncate font-mono">
                      {log.log.split('\n')[0].slice(0, 120)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(log.criado_em), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Log completo
                      </p>
                      <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words">
                        {log.log}
                      </pre>
                    </div>

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Metadata
                        </p>
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {log.navegador && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Navegador
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{log.navegador}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        variant={log.resolvido ? 'outline' : 'default'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleResolvido(log.id, log.resolvido)
                        }}
                        className="gap-1"
                      >
                        {log.resolvido ? (
                          <>
                            <X className="h-3.5 w-3.5" />
                            Reabrir
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Marcar como resolvido
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteLog(log.id)
                        }}
                        className="text-destructive hover:text-destructive gap-1"
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
