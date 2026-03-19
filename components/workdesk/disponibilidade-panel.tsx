'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Circle, Power, History, ChevronDown, ChevronUp, Coffee, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DisponibilidadeLog {
  id: string
  colaborador_id: string
  status: string
  timestamp: string
}

interface Pausa {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  setor_id: string
}

interface PausaColaborador {
  id: string
  pausa_id: string
  inicio: string
  pausas: Pausa
}

interface DisponibilidadePanelProps {
  colaboradorId: string
  isOnline: boolean
  onStatusChange: (newStatus: boolean) => void
  setorIds?: string[]
}

export function DisponibilidadePanel({
  colaboradorId,
  isOnline,
  onStatusChange,
  setorIds = [],
}: DisponibilidadePanelProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<DisponibilidadeLog[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [pausas, setPausas] = useState<Pausa[]>([])
  const [pausaAtual, setPausaAtual] = useState<PausaColaborador | null>(null)
  const [selectedPausa, setSelectedPausa] = useState<string>('')
  const [, setTick] = useState(0) // For timer updates

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('disponibilidade_logs')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .order('timestamp', { ascending: false })
      .limit(5)

    if (data) {
      setLogs(data)
    }
  }, [supabase, colaboradorId])

  const fetchPausas = useCallback(async () => {
    if (!setorIds || setorIds.length === 0) {
      return
    }
    // Fetch pausas from ALL setores the colaborador belongs to
    const { data } = await supabase
      .from('pausas')
      .select('*')
      .in('setor_id', setorIds)
      .eq('ativo', true)
      .order('nome')

    if (data) {
      // Group by name to avoid duplicates (same pause name in different setores)
      const uniquePausas = data.reduce((acc: Pausa[], pausa) => {
        if (!acc.find((p) => p.nome === pausa.nome)) {
          acc.push(pausa)
        }
        return acc
      }, [])
      setPausas(uniquePausas)
    }
  }, [supabase, setorIds])

  const fetchPausaAtual = useCallback(async () => {
    const { data } = await supabase
      .from('pausas_colaboradores')
      .select('*, pausas(*)')
      .eq('colaborador_id', colaboradorId)
      .is('fim', null)
      .order('inicio', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setPausaAtual(data[0] as PausaColaborador)
    } else {
      setPausaAtual(null)
    }
  }, [supabase, colaboradorId])

  useEffect(() => {
    fetchLogs()
    fetchPausas()
    fetchPausaAtual()
  }, [fetchLogs, fetchPausas, fetchPausaAtual])

  // Real-time subscription to sync status across all sessions/browsers
  useEffect(() => {
    const channel = supabase
      .channel(`colaborador-disponibilidade-${colaboradorId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'colaboradores',
          filter: `id=eq.${colaboradorId}`,
        },
        (payload) => {
          const newData = payload.new as any
          // Update parent component with new status
          onStatusChange(newData.is_online)
          // Refresh pause status
          fetchPausaAtual()
          fetchLogs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [colaboradorId, supabase, onStatusChange, fetchPausaAtual, fetchLogs])

  // Timer for pause duration
  useEffect(() => {
    if (pausaAtual) {
      const interval = setInterval(() => setTick((t) => t + 1), 1000)
      return () => clearInterval(interval)
    }
  }, [pausaAtual])

  const toggleStatus = async () => {
    setLoading(true)
    const newStatus = !isOnline

    // If going online, first end any active pause
    if (newStatus && pausaAtual) {
      await endPausa()
    }

    // Update colaborador status via API (bypassa RLS)
    try {
      const res = await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, isOnline: newStatus, pausaAtualId: null }),
      })
      const result = await res.json()
      if (!res.ok) {
        console.error('Error updating status:', result.error)
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('Error updating status:', err)
      setLoading(false)
      return
    }

    // Create log entry
    const { error: logError } = await supabase.from('disponibilidade_logs').insert({
      colaborador_id: colaboradorId,
      status: newStatus ? 'online' : 'offline',
    })

    if (logError) {
      console.error('Error creating log:', logError)
    }

    onStatusChange(newStatus)
    fetchLogs()
    fetchPausaAtual()

    // If coming online, process the ticket queue
    if (newStatus) {
      fetch('/api/tickets/process-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId }),
      }).catch(console.error)
    }

    setLoading(false)
  }

  const startPausa = async (pausaId: string) => {
    if (!pausaId) return
    setLoading(true)

    // Find the pausa to get its setor_id
    const pausaToUse = pausas.find((p) => p.id === pausaId)
    if (!pausaToUse) {
      console.error('Pausa not found')
      setLoading(false)
      return
    }

    // End any existing pause first
    if (pausaAtual) {
      await supabase.from('pausas_colaboradores').update({ fim: new Date().toISOString() }).eq('id', pausaAtual.id)
    }

    // Create new pause record with setor_id and get the inserted ID
    const { data: pausaColaboradorData, error: pausaError } = await supabase
      .from('pausas_colaboradores')
      .insert({
        colaborador_id: colaboradorId,
        pausa_id: pausaId,
        setor_id: pausaToUse.setor_id,
      })
      .select('id')
      .single()

    if (pausaError || !pausaColaboradorData) {
      console.error('Error starting pause:', pausaError)
      setLoading(false)
      return
    }

    // Update colaborador via API (bypassa RLS) - set offline and pausa_atual_id
    try {
      await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, isOnline: false, pausaAtualId: pausaColaboradorData.id }),
      })
    } catch (err) {
      console.error('Error updating colaborador:', err)
    }

    // Create log entry
    await supabase.from('disponibilidade_logs').insert({
      colaborador_id: colaboradorId,
      status: `pausa:${pausaToUse.nome}`,
    })

    onStatusChange(false)
    fetchLogs()
    fetchPausaAtual()
    setSelectedPausa('')
    setLoading(false)
  }

  const endPausa = async () => {
    if (!pausaAtual) return
    setLoading(true)

    // End the pause
    await supabase.from('pausas_colaboradores').update({ fim: new Date().toISOString() }).eq('id', pausaAtual.id)

    // Update colaborador via API (bypassa RLS) - go online and clear pausa
    try {
      await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, isOnline: true, pausaAtualId: null }),
      })
    } catch (err) {
      console.error('Error updating colaborador:', err)
    }

    // Create log entry
    await supabase.from('disponibilidade_logs').insert({
      colaborador_id: colaboradorId,
      status: 'online',
    })

    onStatusChange(true)
    fetchLogs()
    fetchPausaAtual()
    setLoading(false)

    // Process ticket queue
    fetch('/api/tickets/process-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colaboradorId }),
    }).catch(console.error)
  }

  const getPauseDuration = () => {
    if (!pausaAtual) return ''
    const start = new Date(pausaAtual.inicio)
    const now = new Date()
    const diff = now.getTime() - start.getTime()
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Determine current status
  const currentStatus = pausaAtual ? 'pausa' : isOnline ? 'online' : 'offline'
  const statusLabel = pausaAtual ? `Ausente - ${pausaAtual.pausas.nome}` : isOnline ? 'Online' : 'Offline'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-full transition-all',
            currentStatus === 'online' && 'bg-green-100 text-green-700 hover:bg-green-200',
            currentStatus === 'offline' && 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            currentStatus === 'pausa' && 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          )}
        >
          <motion.div
            animate={{
              scale: currentStatus === 'online' ? [1, 1.2, 1] : 1,
            }}
            transition={{
              duration: 2,
              repeat: currentStatus === 'online' ? Number.POSITIVE_INFINITY : 0,
              repeatType: 'loop',
            }}
          >
            {currentStatus === 'pausa' ? (
              <Coffee className="h-3.5 w-3.5" />
            ) : (
              <Circle
                className={cn('h-3 w-3 fill-current', currentStatus === 'online' ? 'text-green-500' : 'text-gray-400')}
              />
            )}
          </motion.div>
          <span className="text-sm font-medium truncate max-w-[120px]">{statusLabel}</span>
          {pausaAtual && <span className="text-xs font-mono opacity-75">{getPauseDuration()}</span>}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 glass-dropdown rounded-2xl border-0" align="end">
        <div className="p-4">
          {/* Status Display */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center',
                  currentStatus === 'online' && 'bg-green-100',
                  currentStatus === 'offline' && 'bg-gray-100',
                  currentStatus === 'pausa' && 'bg-amber-100'
                )}
                animate={{
                  boxShadow:
                    currentStatus === 'online'
                      ? ['0 0 0 0 rgba(34, 197, 94, 0.4)', '0 0 0 10px rgba(34, 197, 94, 0)']
                      : currentStatus === 'pausa'
                        ? ['0 0 0 0 rgba(245, 158, 11, 0.4)', '0 0 0 10px rgba(245, 158, 11, 0)']
                        : 'none',
                }}
                transition={{
                  duration: 1.5,
                  repeat: currentStatus !== 'offline' ? Number.POSITIVE_INFINITY : 0,
                  repeatType: 'loop',
                }}
              >
                {currentStatus === 'pausa' ? (
                  <Coffee className="h-6 w-6 text-amber-600" />
                ) : (
                  <Circle className={cn('h-6 w-6 fill-current', currentStatus === 'online' ? 'text-green-500' : 'text-gray-400')} />
                )}
              </motion.div>
              <div>
                <p className="text-sm text-muted-foreground">Seu status</p>
                <p className="text-lg font-semibold text-foreground">{statusLabel}</p>
                {pausaAtual && (
                  <p className="text-sm text-amber-600 font-mono">
                    Em pausa ha {getPauseDuration()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* If in pause, show return button */}
          {pausaAtual ? (
            <Button onClick={endPausa} disabled={loading} className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
              <Play className="h-4 w-4" />
              {loading ? 'Retornando...' : 'Voltar ao Atendimento'}
            </Button>
          ) : (
            <>
              {/* Toggle Button */}
              <Button
                onClick={toggleStatus}
                disabled={loading}
                className={cn(
                  'w-full gap-2 transition-all',
                  isOnline ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
                )}
              >
                <Power className="h-4 w-4" />
                {loading ? 'Alterando...' : isOnline ? 'Ficar Offline' : 'Ficar Online'}
              </Button>

              {/* Pause selector - only show when online and has pausas */}
              {isOnline && pausas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                    <Coffee className="h-4 w-4" />
                    Entrar em pausa
                  </p>
                  <div className="flex gap-2">
                    <Select value={selectedPausa} onValueChange={setSelectedPausa}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione a pausa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pausas.map((pausa) => (
                          <SelectItem key={pausa.id} value={pausa.id}>
                            {pausa.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => startPausa(selectedPausa)}
                      disabled={!selectedPausa || loading}
                      variant="outline"
                      className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    >
                      <Coffee className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* History Toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 w-full mt-4 pt-4 border-t border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-4 w-4" />
            <span>Historico recente</span>
            {showHistory ? (
              <ChevronUp className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-auto" />
            )}
          </button>

          {/* History List */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-2">
                  {logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">Nenhum registro encontrado</p>
                  ) : (
                    logs.map((log) => {
                      const isPausa = log.status.startsWith('pausa:')
                      const statusText = isPausa
                        ? `Entrou em pausa (${log.status.replace('pausa:', '')})`
                        : log.status === 'online'
                          ? 'Ficou online'
                          : 'Ficou offline'
                      return (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2 text-sm"
                        >
                          {isPausa ? (
                            <Coffee className="h-3 w-3 text-amber-500" />
                          ) : (
                            <Circle
                              className={cn('h-2 w-2 fill-current', log.status === 'online' ? 'text-green-500' : 'text-gray-400')}
                            />
                          )}
                          <span className="text-muted-foreground">
                            {statusText} as {format(new Date(log.timestamp), "HH:mm 'de' dd/MM", { locale: ptBR })}
                          </span>
                        </motion.div>
                      )
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  )
}
