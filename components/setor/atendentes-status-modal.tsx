'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, History } from 'lucide-react'

const HEARTBEAT_STALE_MS = 2 * 60 * 1000

export interface AtendenteStatusInput {
  id: string
  nome: string | null
  is_online?: boolean | null
  ativo?: boolean | null
  pausa_atual_id?: string | null
  last_heartbeat?: string | null
}

export function isAtendenteOnline(c: AtendenteStatusInput): boolean {
  if (!c.is_online || !c.ativo || c.pausa_atual_id) return false
  if (!c.last_heartbeat) return false
  return Date.now() - new Date(c.last_heartbeat).getTime() < HEARTBEAT_STALE_MS
}

export function getAtendenteStatus(c: AtendenteStatusInput): 'online' | 'pausa' | 'offline' {
  if (c.pausa_atual_id) return 'pausa'
  if (isAtendenteOnline(c)) return 'online'
  return 'offline'
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'sem registro'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

const STATUS_COLORS = {
  online: { dot: 'bg-green-500', label: 'Online', text: 'text-green-700 dark:text-green-400' },
  pausa: { dot: 'bg-amber-500', label: 'Pausa', text: 'text-amber-700 dark:text-amber-400' },
  offline: { dot: 'bg-gray-400', label: 'Offline', text: 'text-gray-600 dark:text-gray-400' },
} as const

export function AtendentesStatusModal({
  open,
  onOpenChange,
  atendentes,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  atendentes: AtendenteStatusInput[]
}) {
  const [historicoFor, setHistoricoFor] = useState<AtendenteStatusInput | null>(null)

  const sorted = [...atendentes].sort((a, b) => {
    const sa = getAtendenteStatus(a)
    const sb = getAtendenteStatus(b)
    const order = { online: 0, pausa: 1, offline: 2 }
    if (order[sa] !== order[sb]) return order[sa] - order[sb]
    return (a.nome || '').localeCompare(b.nome || '')
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Status dos atendentes</DialogTitle>
            <DialogDescription>
              Online = entrou no workdesk e heartbeat dos últimos 2 minutos, sem pausa.
              Browser fechado por mais de 2 minutos sem clicar &quot;offline&quot; aparece como Offline.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum atendente vinculado a este setor.
              </p>
            ) : (
              <ul className="divide-y">
                {sorted.map((a) => {
                  const status = getAtendenteStatus(a)
                  const c = STATUS_COLORS[status]
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.nome || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className={c.text}>{c.label}</span>
                          {' • última atividade '}
                          {formatRelativeTime(a.last_heartbeat)}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setHistoricoFor(a)}>
                        <History className="h-3.5 w-3.5 mr-1" />
                        Histórico
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {historicoFor && (
        <HistoricoStatusModal
          atendente={historicoFor}
          onClose={() => setHistoricoFor(null)}
        />
      )}
    </>
  )
}

interface DispLog {
  id: string
  status: string
  timestamp: string
}

function describeLog(status: string): { label: string; state: string; dot: string } {
  if (status === 'online') return { label: 'Ficou online', state: 'online', dot: 'bg-green-500' }
  if (status === 'offline') return { label: 'Ficou offline', state: 'offline', dot: 'bg-gray-400' }
  if (status.startsWith('pausa')) {
    const nome = status.replace(/^pausa[:\s]*/, '').trim()
    return {
      label: nome ? `Entrou em pausa (${nome})` : 'Entrou em pausa',
      state: nome ? `em pausa (${nome})` : 'em pausa',
      dot: 'bg-amber-500',
    }
  }
  return { label: status, state: status, dot: 'bg-gray-400' }
}

function HistoricoStatusModal({
  atendente,
  onClose,
}: {
  atendente: AtendenteStatusInput
  onClose: () => void
}) {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [logs, setLogs] = useState<DispLog[]>([])
  const [previousLog, setPreviousLog] = useState<DispLog | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const start = new Date(`${date}T00:00:00`).toISOString()
      const end = new Date(`${date}T23:59:59.999`).toISOString()
      const [diaResult, anteriorResult] = await Promise.all([
        supabase
          .from('disponibilidade_logs')
          .select('id, status, timestamp')
          .eq('colaborador_id', atendente.id)
          .gte('timestamp', start)
          .lte('timestamp', end)
          .order('timestamp', { ascending: false }),
        // Último evento antes do início do dia, pra dar contexto quando o dia está vazio
        // ou pra mostrar de qual estado o atendente vinha
        supabase
          .from('disponibilidade_logs')
          .select('id, status, timestamp')
          .eq('colaborador_id', atendente.id)
          .lt('timestamp', start)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (!cancelled) {
        setLogs((diaResult.data as DispLog[]) || [])
        setPreviousLog((anteriorResult.data as DispLog) || null)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [atendente.id, date, supabase])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico — {atendente.nome || '—'}</DialogTitle>
          <DialogDescription>
            Selecione um dia para ver todos os eventos de status registrados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />

          {!loading && previousLog && (
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Estado vindo do dia anterior:</span>{' '}
              {(() => {
                const d = describeLog(previousLog.status)
                const t = new Date(previousLog.timestamp)
                return (
                  <>
                    {d.state} desde{' '}
                    {t.toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </>
                )
              })()}
            </div>
          )}

          <div className="rounded-lg border flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Sem eventos registrados nesse dia.</p>
                {previousLog && (
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-[280px]">
                    O atendente continuou {describeLog(previousLog.status).state} sem nenhuma transição neste dia.
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y">
                {logs.map((l) => {
                  const desc = describeLog(l.status)
                  const t = new Date(l.timestamp)
                  return (
                    <li key={l.id} className="flex items-center gap-3 p-2.5 text-sm">
                      <span className={`h-2 w-2 rounded-full ${desc.dot} shrink-0`} />
                      <span className="flex-1">
                        {desc.label} às{' '}
                        <span className="font-medium">
                          {t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>{' '}
                        de{' '}
                        <span className="font-medium">
                          {t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
