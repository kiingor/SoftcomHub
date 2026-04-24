'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Search,
  User,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
  Megaphone,
  History,
} from 'lucide-react'

interface Cliente {
  id: string
  nome: string | null
  telefone: string | null
  CNPJ: string | null
  Registro: string | null
}

interface TicketLite {
  id: string
  numero: number
  criado_em: string
  encerrado_em: string | null
  status: 'aberto' | 'em_atendimento' | 'avaliar' | 'encerrado'
  colaboradores: { nome: string } | null
}

interface Mensagem {
  id: string
  ticket_id: string
  remetente: string
  conteudo: string
  tipo: string
  enviado_em: string
}

const TICKETS_PER_PAGE = 5
const SEARCH_LIMIT = 25

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function HistoricoClienteSection({ setorId }: { setorId: string }) {
  const supabase = createClient()

  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [matches, setMatches] = useState<Cliente[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [page, setPage] = useState(1)
  const [totalTickets, setTotalTickets] = useState(0)
  const [tickets, setTickets] = useState<TicketLite[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const h = setTimeout(() => setQDebounced(q), 400)
    return () => clearTimeout(h)
  }, [q])

  useEffect(() => {
    if (!qDebounced.trim() || cliente) {
      setMatches([])
      return
    }
    let cancelled = false
    const search = async () => {
      setMatchesLoading(true)
      const digits = qDebounced.replace(/\D/g, '')
      const filters: string[] = [`nome.ilike.%${qDebounced}%`]
      if (digits.length > 0) {
        filters.push(`telefone.ilike.%${digits}%`)
        filters.push(`CNPJ.ilike.%${digits}%`)
      }
      filters.push(`Registro.ilike.%${qDebounced}%`)
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, telefone, CNPJ, Registro')
        .or(filters.join(','))
        .order('nome', { ascending: true, nullsFirst: false })
        .limit(SEARCH_LIMIT)
      if (!cancelled) setMatches(data || [])
      setMatchesLoading(false)
    }
    search()
    return () => {
      cancelled = true
    }
  }, [qDebounced, cliente, supabase])

  const fetchHistorico = useCallback(async () => {
    if (!cliente) return
    setLoading(true)
    try {
      const { count } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', cliente.id)
        .eq('setor_id', setorId)
      setTotalTickets(count || 0)

      const from = (page - 1) * TICKETS_PER_PAGE
      const to = from + TICKETS_PER_PAGE - 1

      const { data: tkts } = await supabase
        .from('tickets')
        .select('id, numero, criado_em, encerrado_em, status, colaboradores(nome)')
        .eq('cliente_id', cliente.id)
        .eq('setor_id', setorId)
        .order('criado_em', { ascending: false })
        .range(from, to)

      const ticketsList = (tkts as unknown as TicketLite[]) || []
      setTickets(ticketsList)

      if (ticketsList.length === 0) {
        setMensagens([])
        return
      }

      const ids = ticketsList.map((t) => t.id)
      const { data: msgs } = await supabase
        .from('mensagens')
        .select('id, ticket_id, remetente, conteudo, tipo, enviado_em')
        .in('ticket_id', ids)
        .order('enviado_em', { ascending: true })

      setMensagens((msgs as Mensagem[]) || [])
    } finally {
      setLoading(false)
    }
  }, [cliente, page, setorId, supabase])

  useEffect(() => {
    if (cliente) fetchHistorico()
  }, [cliente, fetchHistorico])

  const msgsByTicket = useMemo(() => {
    const map = new Map<string, Mensagem[]>()
    for (const m of mensagens) {
      if (!map.has(m.ticket_id)) map.set(m.ticket_id, [])
      map.get(m.ticket_id)!.push(m)
    }
    return map
  }, [mensagens])

  const totalPages = Math.max(1, Math.ceil(totalTickets / TICKETS_PER_PAGE))

  const handlePickCliente = (c: Cliente) => {
    setCliente(c)
    setPage(1)
    setQ('')
    setMatches([])
  }

  const handleClearCliente = () => {
    setCliente(null)
    setTickets([])
    setMensagens([])
    setTotalTickets(0)
    setPage(1)
  }

  return (
    <Card className="glass-card-elevated rounded-2xl border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico por Cliente
          </CardTitle>
          {cliente && (
            <Button variant="ghost" size="sm" onClick={handleClearCliente}>
              <X className="h-3.5 w-3.5 mr-1" /> Trocar cliente
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-2">
        {!cliente && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente por nome, telefone, CNPJ ou Registro..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>

            {qDebounced.trim() && (
              <div className="rounded-lg border max-h-[360px] overflow-y-auto">
                {matchesLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>
                ) : matches.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full text-left p-3 hover:bg-accent/50 transition flex items-center gap-3"
                          onClick={() => handlePickCliente(c)}
                        >
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {c.nome || <span className="text-muted-foreground">sem nome</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate font-mono">
                              {[c.CNPJ, c.Registro, c.telefone].filter(Boolean).join(' • ') || '—'}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!qDebounced.trim() && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Digite algo na busca acima para encontrar um cliente.
              </div>
            )}
          </div>
        )}

        {cliente && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center gap-3 min-w-0">
                <User className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {cliente.nome || 'Sem nome'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate font-mono">
                    {[cliente.CNPJ, cliente.Registro, cliente.telefone].filter(Boolean).join(' • ') ||
                      '—'}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="whitespace-nowrap">
                {totalTickets} ticket{totalTickets === 1 ? '' : 's'}
              </Badge>
            </div>

            {loading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Este cliente nunca foi atendido neste setor.
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-background/40 max-h-[640px] overflow-y-auto p-4 space-y-6">
                  {tickets.map((t) => {
                    const msgs = msgsByTicket.get(t.id) || []
                    return (
                      <div key={t.id} className="space-y-2">
                        <TicketStartSeparator ticket={t} />
                        {msgs.length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-2">
                            (sem mensagens registradas)
                          </p>
                        ) : (
                          msgs.map((m) => <MessageBubble key={m.id} msg={m} />)
                        )}
                        <TicketEndSeparator ticket={t} />
                      </div>
                    )
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || loading}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Separators ──────────────────────────────────────────────────

function TicketStartSeparator({ ticket }: { ticket: TicketLite }) {
  const atendente = ticket.colaboradores?.nome || '—'
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-dashed border-emerald-500/40" />
      <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Ticket #{ticket.numero} — iniciado {formatDateTime(ticket.criado_em)} por {atendente}
        </span>
      </div>
      <div className="flex-1 border-t border-dashed border-emerald-500/40" />
    </div>
  )
}

function TicketEndSeparator({ ticket }: { ticket: TicketLite }) {
  if (ticket.status !== 'encerrado' && ticket.status !== 'avaliar') {
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 border-t border-dashed border-amber-500/40" />
        <div className="flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5" />
          <span>Ticket #{ticket.numero} — ainda em andamento</span>
        </div>
        <div className="flex-1 border-t border-dashed border-amber-500/40" />
      </div>
    )
  }
  const dataFim = ticket.encerrado_em
    ? formatDateTime(ticket.encerrado_em)
    : 'aguardando avaliação'
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-dashed border-red-500/40" />
      <div className="flex items-center gap-2 text-[11px] font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Ticket #{ticket.numero} — encerrado {dataFim}</span>
      </div>
      <div className="flex-1 border-t border-dashed border-red-500/40" />
    </div>
  )
}

// ─── Message bubble ──────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Mensagem }) {
  if (msg.remetente === 'sistema') {
    return (
      <div className="flex justify-center">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] max-w-[90%]',
            msg.conteudo.startsWith('Transferido')
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
              : 'bg-muted/80 border-border text-muted-foreground',
          )}
        >
          {msg.conteudo.startsWith('Transferido') ? (
            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          ) : (
            <Megaphone className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{msg.conteudo}</span>
          <span className="shrink-0 ml-1 opacity-60">{formatTime(msg.enviado_em)}</span>
        </div>
      </div>
    )
  }

  const isCliente = msg.remetente === 'cliente'
  const isBot = msg.remetente === 'bot'
  return (
    <div className={cn('flex', isCliente ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm',
          isCliente ? 'bg-muted' : isBot ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-primary text-primary-foreground',
        )}
      >
        <p className="whitespace-pre-wrap">{msg.conteudo}</p>
        <p className={cn('text-[10px] mt-1', isCliente ? 'text-muted-foreground' : 'opacity-70')}>
          {formatTime(msg.enviado_em)}
        </p>
      </div>
    </div>
  )
}
