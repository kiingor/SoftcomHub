'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
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
  /**
   * `colaboradores.pausa_atual_id` como o layout o conhece — o ponteiro, não a
   * pausa. Serve de gatilho de sincronia: ver o efeito abaixo. Opcional porque
   * o painel também é montado sem ele em components/workdesk/workdesk-sidebar.tsx.
   */
  pausaAtualId?: string | null
}

export function DisponibilidadePanel({
  colaboradorId,
  isOnline,
  onStatusChange,
  setorIds = [],
  pausaAtualId = null,
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

  // Cross-tab sync: the workdesk layout already subscribes to `colaboradores` UPDATE
  // for this same id and propagates `is_online` down via the `isOnline` prop. When that
  // prop flips (another tab/session toggled status or started/ended a pause), refetch
  // pause state & logs. This removes the duplicate realtime channel this panel used to open.
  //
  // ── POR QUE `pausaAtualId` TAMBÉM ENTRA (caso #97218) ───────────────────────
  // Só com `isOnline` a sincronia tem buracos, porque nem toda mudança de pausa
  // mexe em `is_online`:
  //
  //   • supervisão coloca em pausa quem JÁ estava offline — `is_online`
  //     continua false, e o painel seguia mostrando "Offline";
  //   • supervisão marca offline quem estava EM PAUSA — `is_online` já era
  //     false, e o painel seguia mostrando "Ausente" com o cronômetro correndo.
  //
  // O ponteiro muda nos dois casos, e o evento de realtime que o carrega já é
  // entregue hoje (a tabela está publicada; medido). Isto não abre consulta
  // nova nem faz polling: reage a um evento que já chega, e as duas leituras
  // abaixo só acontecem quando o estado muda de fato — algumas vezes por dia.
  useEffect(() => {
    fetchPausaAtual()
    fetchLogs()
  }, [isOnline, pausaAtualId, fetchPausaAtual, fetchLogs])

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
    //
    // A resposta é conferida: a rota passou a RECUSAR ponteiro que não seja de
    // instância própria e aberta. Engolir a recusa deixava o pior dos estados —
    // instância inserida, ponteiro não gravado (a órfã), e a tela dizendo
    // "em pausa" para alguém que o resto do sistema vê disponível.
    //
    // Os dois modos de falha NÃO são o mesmo. Um HTTP não-2xx é falha
    // CONFIRMADA: o servidor decidiu e não gravou o ponteiro, então compensar é
    // seguro. Já uma exceção do fetch é resultado DESCONHECIDO — quer dizer que
    // o cliente não recebeu resposta, não que o servidor não processou. Se o
    // POST chegou e só a resposta se perdeu, compensar às cegas encerraria
    // justamente a instância que o servidor acabou de apontar.
    const abortarPausa = async (motivo: string) => {
      const { error: rollbackError } = await supabase
        .from('pausas_colaboradores')
        .update({ fim: new Date().toISOString() })
        .eq('id', pausaColaboradorData.id)
        .is('fim', null)

      // A compensação pode falhar também (rede, RLS, banco fora). O id vai para
      // o log porque é ele que alguém precisa para fechar a linha na mão — mas
      // sem afirmar que ficou órfã: daqui não dá para saber se a linha seguiu
      // aberta nem se o ponteiro existe.
      if (rollbackError) {
        console.error(
          `[pausa] não deu para encerrar a instância ${pausaColaboradorData.id} após falha; pode ter ficado aberta:`,
          rollbackError,
        )
      }
      toast.error(rollbackError ? `${motivo} (verifique seu status)` : motivo)
      fetchPausaAtual()
      setSelectedPausa('')
      setLoading(false)
    }

    try {
      const res = await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, isOnline: false, pausaAtualId: pausaColaboradorData.id }),
      })

      if (!res.ok) {
        const erro = await res.json().catch(() => null)
        console.error('Error updating colaborador:', erro)
        await abortarPausa(erro?.error || 'Não foi possível entrar em pausa')
        return
      }
    } catch (err) {
      console.error('Error updating colaborador:', err)

      // Reconcilia antes de compensar: se o ponteiro já é o desta instância, o
      // POST foi aplicado e só a resposta se perdeu — encerrar aqui criaria o
      // ponteiro-para-pausa-encerrada de graça.
      const { data: reconciliado, error: reconciliacaoError } = await supabase
        .from('colaboradores')
        .select('pausa_atual_id')
        .eq('id', colaboradorId)
        .maybeSingle()

      // Releitura falhada NÃO é "ponteiro diferente": é continuar sem saber. A
      // política segue sendo compensar, mas o log tem que separar as duas —
      // senão ninguém consegue distinguir depois, no pior cenário, se a
      // instância foi encerrada porque não vingou ou porque não deu para
      // conferir que ela tinha vingado.
      if (reconciliacaoError) {
        console.error(
          `[pausa] não deu para reconciliar a instância ${pausaColaboradorData.id}; resultado do POST ficou desconhecido:`,
          reconciliacaoError,
        )
      }

      if (reconciliado?.pausa_atual_id !== pausaColaboradorData.id) {
        // Ponteiro é outro, é nulo, ou a releitura falhou. Compensar é o lado
        // menos ruim na ambiguidade: garante que esta instância não fica aberta
        // para sempre somando no relatório de produtividade. NÃO garante o
        // status da pessoa — a compensação só mexe em `pausas_colaboradores`;
        // `is_online` fica como o servidor tiver deixado.
        await abortarPausa('Não foi possível entrar em pausa — verifique a conexão')
        return
      }
      // Chegou ao servidor. Segue pelo caminho de sucesso.
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

  const goOfflineFromPausa = async () => {
    if (!pausaAtual) return
    setLoading(true)

    // End the pause
    await supabase.from('pausas_colaboradores').update({ fim: new Date().toISOString() }).eq('id', pausaAtual.id)

    // Update colaborador via API - go OFFLINE and clear pausa
    try {
      await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, isOnline: false, pausaAtualId: null }),
      })
    } catch (err) {
      console.error('Error updating colaborador:', err)
    }

    // Create log entry
    await supabase.from('disponibilidade_logs').insert({
      colaborador_id: colaboradorId,
      status: 'offline',
    })

    onStatusChange(false)
    fetchLogs()
    fetchPausaAtual()
    setLoading(false)
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

  // Em pausa, a própria pausa atual sai da lista: o seletor serve para TROCAR,
  // e reescolher a mesma só zeraria o cronômetro.
  const pausasDisponiveis = pausaAtual
    ? pausas.filter((pausa) => pausa.id !== pausaAtual.pausa_id)
    : pausas

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

          {/* If in pause, show return button and offline button */}
          {pausaAtual ? (
            <div className="flex flex-col gap-2">
              <Button onClick={endPausa} disabled={loading} className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Play className="h-4 w-4" />
                {loading ? 'Retornando...' : 'Voltar ao Atendimento'}
              </Button>
              <Button
                onClick={goOfflineFromPausa}
                disabled={loading}
                className="w-full gap-2 bg-gray-600 hover:bg-gray-700 text-white"
              >
                <Power className="h-4 w-4" />
                {loading ? 'Alterando...' : 'Ficar Offline'}
              </Button>
            </div>
          ) : (
            /* Toggle Button */
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
          )}

          {/* Seletor de pausa — disponível nos TRÊS estados.
              Offline: quem chega e já vai almoçar não precisa ficar online só
              para poder pausar, evitando receber ticket nesse intervalo.
              Em pausa: trocar de pausa não exige mais passar por "Voltar ao
              Atendimento", que colocava a pessoa online e elegível a ticket no
              meio do caminho. `startPausa` já encerra a pausa anterior e grava
              is_online=false, então os dois casos usam o mesmo fluxo. */}
          {pausasDisponiveis.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <Coffee className="h-4 w-4" />
                {pausaAtual ? 'Trocar de pausa' : 'Entrar em pausa'}
              </p>
              <div className="flex gap-2">
                <Select value={selectedPausa} onValueChange={setSelectedPausa}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={pausaAtual ? 'Selecione a nova pausa...' : 'Selecione a pausa...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {pausasDisponiveis.map((pausa) => (
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
                  aria-label={pausaAtual ? 'Trocar de pausa' : 'Entrar em pausa'}
                  className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                >
                  <Coffee className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
