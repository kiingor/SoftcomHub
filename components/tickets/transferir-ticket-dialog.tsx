'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, Check, ChevronRight, Layers, Loader2, Ticket as TicketIcon, User, Users } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { logError } from '@/lib/error-logger'
import { isTransferTargetAvailable } from '@/lib/transfer-authorization'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// Valor sentinela de "nada escolhido". Precisa ser diferente de string vazia
// porque o Radix Select trata '' como "sem valor" e reexibe o placeholder.
const UNSELECTED_TRANSFER_VALUE = 'all'


export interface TransferSetor {
  id: string
  nome: string
}

export interface TransferSubsetor {
  id: string
  nome: string
  setor_id: string
  setor_nome: string
}

export interface TransferAtendente {
  id: string
  nome: string
  is_online: boolean
  ativo: boolean
  pausa_atual_id?: string | null
  last_heartbeat?: string | null
  handlesSubsetor: boolean
}

type TransferDestinationMode = 'queue' | 'attendant'

/**
 * Fila indisponível como destino — hoje só o caso #97066: o ticket chegou por
 * transbordo e ainda não foi atendido, então voltar para a fila que o cedeu só
 * reinicia o ciclo. Vem de fora porque quem sabe se o atendente já respondeu é
 * a tela que carregou as mensagens; o servidor refaz a checagem por conta.
 */
export interface TransferFilaBloqueada {
  subsetorId: string
  /** Texto curto exibido na opção desabilitada. */
  motivo: string
}

interface TransferDestinoRow {
  setor_destino_id: string
  setores: TransferSetor | TransferSetor[] | null
}

/** Ticket mínimo que o diálogo precisa conhecer para montar os destinos. */
export interface TransferableTicket {
  id: string
  setor_id: string | null
  subsetor_id?: string | null
  setores?: { nome?: string | null } | null
}

export interface TransferirTicketFormProps {
  /** Quando falso, o formulário não carrega destinos nem mantém estado. */
  active: boolean
  /** Sem callback, o botão Cancelar não aparece (uso embutido em aba). */
  onCancel?: () => void
  ticket: TransferableTicket | null
  /** Quem está transferindo: é excluído da lista de destinos e assina o log. */
  colaborador?: { id?: string | null; nome?: string | null } | null
  /** Identifica a origem nos logs de erro (ex.: 'WorkDesk', 'Monitoramento'). */
  tela: string
  /** Fila que não pode receber este ticket agora. Ver {@link TransferFilaBloqueada}. */
  filaBloqueada?: TransferFilaBloqueada | null
  /**
   * Chamado logo antes do POST, para a tela aplicar remoção otimista.
   * Se a transferência falhar, `onTransferError` é chamado para desfazer.
   */
  onTransferStart?: (ticketId: string) => void
  onTransferSuccess?: (info: { ticketId: string; queued: boolean; subsetorNome?: string | null }) => void
  onTransferError?: (ticketId: string) => void
}

/**
 * Fluxo de transferência em três passos (setor → subsetor → destino final),
 * sem casca. O WorkDesk consome via {@link TransferirTicketDialog}; as telas de
 * monitoramento embutem direto numa aba.
 */
export function TransferirTicketForm({
  active,
  onCancel,
  ticket,
  colaborador,
  tela,
  filaBloqueada,
  onTransferStart,
  onTransferSuccess,
  onTransferError,
}: TransferirTicketFormProps) {
  const supabase = useMemo(() => createClient(), [])

  const [setores, setSetores] = useState<TransferSetor[]>([])
  const [subsetoresTransferencia, setSubsetoresTransferencia] = useState<TransferSubsetor[]>([])
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<TransferAtendente[]>([])
  const [destinationMode, setDestinationMode] = useState<TransferDestinationMode>('queue')
  const [selectedSetor, setSelectedSetor] = useState(UNSELECTED_TRANSFER_VALUE)
  const [selectedSubsetor, setSelectedSubsetor] = useState(UNSELECTED_TRANSFER_VALUE)
  const [selectedAtendente, setSelectedAtendente] = useState(UNSELECTED_TRANSFER_VALUE)
  const [transferLoading, setTransferLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [attendantsLoading, setAttendantsLoading] = useState(false)
  const [offlineConfirmOpen, setOfflineConfirmOpen] = useState(false)
  const [offlineTarget, setOfflineTarget] = useState<{ id: string; nome: string; pausa?: boolean } | null>(null)

  const loadRequestIdRef = useRef(0)
  const atendentesRequestIdRef = useRef(0)

  const colaboradorId = colaborador?.id ?? undefined
  const colaboradorNome = colaborador?.nome ?? undefined

  // Usa a MESMA função que /api/tickets/transferir usa no servidor. Uma cópia
  // local aqui já causou o problema que isto corrige: a tela dizia "online",
  // o servidor recusava com 409, e tentar de novo repetia o erro. Além de
  // ativo/online/fora de pausa/heartbeat fresco, ela descarta heartbeat no
  // futuro (clock skew), caso que a cópia local deixava passar.
  const isAtendenteOnline = useCallback((atendente?: TransferAtendente): boolean => {
    return isTransferTargetAvailable(atendente)
  }, [])

  const fetchAtendentes = useCallback(async (
    setorId: string,
    subsetorId: string | null,
    excludeColaboradorId?: string,
  ): Promise<TransferAtendente[]> => {
    const { data: colaboradoresSetores, error: setorLinksError } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', setorId)

    if (setorLinksError) throw setorLinksError
    if (!colaboradoresSetores?.length) return []

    const colaboradorIds = colaboradoresSetores.map((item) => item.colaborador_id)
    let colaboradoresQuery = supabase
      .from('colaboradores')
      .select('id, nome, is_online, ativo, pausa_atual_id, last_heartbeat')
      .in('id', colaboradorIds)
      .eq('ativo', true)

    if (excludeColaboradorId) {
      colaboradoresQuery = colaboradoresQuery.neq('id', excludeColaboradorId)
    }

    const [colaboradoresResult, subsetorLinksResult] = await Promise.all([
      colaboradoresQuery,
      supabase
        .from('colaboradores_subsetores')
        .select('colaborador_id, subsetor_id')
        .eq('setor_id', setorId)
        .in('colaborador_id', colaboradorIds),
    ])

    if (colaboradoresResult.error) throw colaboradoresResult.error
    if (subsetorLinksResult.error) throw subsetorLinksResult.error

    const subsetoresByColaborador = new Map<string, string[]>()
    for (const link of subsetorLinksResult.data ?? []) {
      const subsetorIds = subsetoresByColaborador.get(link.colaborador_id) ?? []
      subsetorIds.push(link.subsetor_id)
      subsetoresByColaborador.set(link.colaborador_id, subsetorIds)
    }

    return (colaboradoresResult.data ?? [])
      .map((atendente): TransferAtendente => ({
        ...atendente,
        handlesSubsetor: isExactSubsetorMatch(
          subsetorId,
          subsetoresByColaborador.get(atendente.id) ?? [],
        ),
      }))
      .sort((a, b) =>
        Number(b.handlesSubsetor) - Number(a.handlesSubsetor) || a.nome.localeCompare(b.nome),
      )
  }, [supabase])

  const resetForm = useCallback(() => {
    atendentesRequestIdRef.current += 1
    setDestinationMode('queue')
    setSelectedSetor(UNSELECTED_TRANSFER_VALUE)
    setSelectedSubsetor(UNSELECTED_TRANSFER_VALUE)
    setSelectedAtendente(UNSELECTED_TRANSFER_VALUE)
    setAtendentesDisponiveis([])
    setSetores([])
    setSubsetoresTransferencia([])
    setAttendantsLoading(false)
    setOfflineConfirmOpen(false)
    setOfflineTarget(null)
  }, [])

  // Carrega destinos ao abrir. Fica num efeito (e não no clique de quem abre)
  // para que as duas telas só precisem alternar `open`.
  useEffect(() => {
    if (!active) {
      loadRequestIdRef.current += 1
      resetForm()
      setDataLoading(false)
      setTransferLoading(false)
      return
    }

    const setorOrigemId = ticket?.setor_id
    if (!setorOrigemId) return

    const requestId = ++loadRequestIdRef.current
    resetForm()
    setSelectedSetor(setorOrigemId)
    setSelectedSubsetor(ticket?.subsetor_id || UNSELECTED_TRANSFER_VALUE)
    setTransferLoading(false)
    setDataLoading(true)

    const carregar = async () => {
      try {
        const { data: destinosData, error: destinosError } = await supabase
          .from('setor_destinos_transferencia')
          .select('setor_destino_id, setores:setor_destino_id(id, nome)')
          .eq('setor_origem_id', setorOrigemId)

        if (destinosError) throw destinosError

        const destinosRows = (destinosData ?? []) as unknown as TransferDestinoRow[]
        const setoresDestinoMap = new Map<string, TransferSetor>()
        destinosRows.forEach((destino) => {
          const setorItems = Array.isArray(destino.setores) ? destino.setores : [destino.setores]
          setorItems.filter((setor): setor is TransferSetor => Boolean(setor)).forEach((setor) => {
            setoresDestinoMap.set(setor.id, setor)
          })
        })
        const setoresDestino = [...setoresDestinoMap.values()].sort((a, b) =>
          a.nome.localeCompare(b.nome),
        )
        const setorIdsComSubsetores = [...new Set([
          setorOrigemId,
          ...setoresDestino.map((setor) => setor.id),
        ])]

        const [subsetoresResult, atendentesAtuais] = await Promise.all([
          supabase
            .from('subsetores')
            .select('id, nome, setor_id')
            .in('setor_id', setorIdsComSubsetores)
            .eq('ativo', true)
            .order('nome'),
          fetchAtendentes(setorOrigemId, ticket?.subsetor_id ?? null, colaboradorId),
        ])

        if (subsetoresResult.error) throw subsetoresResult.error
        if (requestId !== loadRequestIdRef.current) return

        const setorNomePorId = new Map<string, string>([
          [setorOrigemId, ticket?.setores?.nome || 'Setor atual'],
          ...setoresDestino.map((setor) => [setor.id, setor.nome] as [string, string]),
        ])
        const subsetores = (subsetoresResult.data ?? [])
          .map((subsetor) => ({
            ...subsetor,
            setor_nome: setorNomePorId.get(subsetor.setor_id) || 'Setor',
          }))
          .sort((a, b) =>
            a.setor_nome.localeCompare(b.setor_nome) || a.nome.localeCompare(b.nome),
          )

        setSetores(setoresDestino)
        setSubsetoresTransferencia(subsetores)
        setAtendentesDisponiveis(atendentesAtuais)
      } catch (err) {
        if (requestId === loadRequestIdRef.current) {
          console.error('Error loading transfer data:', err)
          toast.error('Não foi possível carregar os destinos de transferência')
        }
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setDataLoading(false)
        }
      }
    }

    void carregar()
    // `ticket` é lido só na abertura — reagir a cada mudança de referência
    // recarregaria a lista no meio do preenchimento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ticket?.id, ticket?.setor_id, ticket?.subsetor_id])

  const loadAtendentes = useCallback(async (setorId: string, subsetorValue: string) => {
    const requestId = ++atendentesRequestIdRef.current
    setAtendentesDisponiveis([])
    if (subsetorValue === UNSELECTED_TRANSFER_VALUE) {
      setAttendantsLoading(false)
      return
    }

    setAttendantsLoading(true)
    try {
      const atendentes = await fetchAtendentes(setorId, subsetorValue, colaboradorId)
      if (requestId === atendentesRequestIdRef.current) {
        setAtendentesDisponiveis(atendentes)
      }
    } catch (error) {
      if (requestId === atendentesRequestIdRef.current) {
        console.error('Error loading transfer attendants:', error)
        toast.error('Não foi possível carregar os atendentes compatíveis')
      }
    } finally {
      if (requestId === atendentesRequestIdRef.current) {
        setAttendantsLoading(false)
      }
    }
  }, [colaboradorId, fetchAtendentes])

  const sectorOptions = useMemo(() => {
    const options = new Map(setores.map((setor) => [setor.id, setor]))
    if (ticket?.setor_id) {
      options.set(ticket.setor_id, {
        id: ticket.setor_id,
        nome: ticket.setores?.nome || 'Setor atual',
      })
    }
    return [...options.values()].sort((a, b) => {
      if (a.id === ticket?.setor_id) return -1
      if (b.id === ticket?.setor_id) return 1
      return a.nome.localeCompare(b.nome)
    })
  }, [setores, ticket?.setor_id, ticket?.setores?.nome])

  const subsetorOptions = useMemo(
    () => subsetoresTransferencia.filter((subsetor) => subsetor.setor_id === selectedSetor),
    [selectedSetor, subsetoresTransferencia],
  )

  const compatibleAttendants = useMemo(
    () => atendentesDisponiveis.filter((atendente) => atendente.handlesSubsetor),
    [atendentesDisponiveis],
  )

  const selectedTransferSubsetor = subsetoresTransferencia.find(
    (subsetor) => subsetor.id === selectedSubsetor && subsetor.setor_id === selectedSetor,
  )
  const selectedTransferSector = sectorOptions.find((setor) => setor.id === selectedSetor)
  const selectedTransferAttendant = compatibleAttendants.find(
    (atendente) => atendente.id === selectedAtendente,
  )
  const hasSelectedSector = selectedSetor !== UNSELECTED_TRANSFER_VALUE
  const hasSelectedSubsetor = Boolean(selectedTransferSubsetor)
  const onlineCompatibleAttendants = compatibleAttendants.filter(isAtendenteOnline)
  // Só a FILA deste subsetor está fechada. Entregar a um atendente nomeado dele
  // continua valendo — é o que tira o ticket do ciclo em vez de reiniciá-lo.
  const filaDoSubsetorBloqueada = Boolean(
    filaBloqueada && selectedTransferSubsetor?.id === filaBloqueada.subsetorId,
  )
  const isDestinationReady = hasSelectedSubsetor && (
    destinationMode === 'queue'
      ? !filaDoSubsetorBloqueada
      : Boolean(selectedTransferAttendant)
  )

  const handleSetorChange = (setorId: string) => {
    const currentSubsetor = subsetoresTransferencia.find(
      (subsetor) => subsetor.setor_id === setorId && subsetor.id === ticket?.subsetor_id,
    )
    const nextSubsetorValue = currentSubsetor?.id ?? UNSELECTED_TRANSFER_VALUE

    setSelectedSetor(setorId)
    setSelectedSubsetor(nextSubsetorValue)
    setSelectedAtendente(UNSELECTED_TRANSFER_VALUE)
    setDestinationMode('queue')
    setOfflineConfirmOpen(false)
    setOfflineTarget(null)
    void loadAtendentes(setorId, nextSubsetorValue)
  }

  const handleSubsetorChange = (subsetorValue: string) => {
    setSelectedSubsetor(subsetorValue)
    setSelectedAtendente(UNSELECTED_TRANSFER_VALUE)
    setDestinationMode('queue')
    setOfflineConfirmOpen(false)
    setOfflineTarget(null)
    void loadAtendentes(selectedSetor, subsetorValue)
  }

  const executeTransfer = async (allowUnavailable = false) => {
    if (!ticket) return

    const setorDestinoId = hasSelectedSector ? selectedSetor : undefined
    const subsetorDestino = selectedTransferSubsetor
    const subsetorDestinoId = subsetorDestino?.id
    const atendenteDestino = destinationMode === 'attendant' ? selectedTransferAttendant : null
    const atendenteDestinoId = atendenteDestino?.id ?? null

    if (!setorDestinoId) {
      toast.error('Selecione um setor de destino')
      return
    }
    if (!subsetorDestinoId) {
      toast.error('Selecione um subsetor')
      return
    }
    if (destinationMode === 'attendant' && !atendenteDestinoId) {
      toast.error('Selecione um atendente compatível')
      return
    }

    const ticketId = ticket.id
    setTransferLoading(true)
    onTransferStart?.(ticketId)
    onCancel?.()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const res = await fetch('/api/tickets/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          setor_id: setorDestinoId,
          subsetor_id: subsetorDestinoId,
          colaborador_id: atendenteDestinoId,
          from_colaborador_nome: colaboradorNome || 'Desconhecido',
          from_setor_nome: ticket.setores?.nome || 'Desconhecido',
          allow_unavailable: allowUnavailable,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const result = await res.json()

      if (!res.ok) {
        logError({
          tela,
          error: `Falha ao transferir ticket (${res.status}): ${result.error || 'desconhecido'}`,
          componente: 'TransferirTicketDialog',
          metadata: { type: 'transfer_error', status: res.status, ticketId, error: result.error },
        })
        // A disponibilidade do atendente mudou entre a confirmação no client e o
        // servidor revalidar agora — em vez de forçar silenciosamente, pede pra tentar de novo.
        toast.error(
          result.code === 'TARGET_UNAVAILABLE'
            ? 'A disponibilidade do atendente mudou. Selecione o destino novamente para confirmar.'
            : (result.error || 'Erro ao transferir ticket'),
        )
        onTransferError?.(ticketId)
        return
      }

      if (!result.queued && atendenteDestino) {
        toast.success(`Ticket transferido para ${atendenteDestino.nome}`)
      } else if (subsetorDestino || result.subsetor_nome) {
        toast.success(`Ticket enviado para a fila do subsetor ${result.subsetor_nome || subsetorDestino?.nome}`)
      } else {
        toast.info('Ticket transferido para a fila do setor')
      }

      onTransferSuccess?.({
        ticketId,
        queued: Boolean(result.queued),
        subsetorNome: result.subsetor_nome || subsetorDestino?.nome || null,
      })
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        toast.error('Transferência demorou demais. O ticket pode ter sido transferido — atualize a página.')
      } else {
        console.warn('Error transferring ticket:', err)
        logError({
          tela,
          error: err,
          componente: 'TransferirTicketDialog',
          metadata: { type: 'transfer_network_error', ticketId },
        })
        toast.error('Erro ao transferir ticket. Tente novamente.')
      }
      onTransferError?.(ticketId)
    } finally {
      setTransferLoading(false)
    }
  }

  // Antes de transferir: se o atendente de destino estiver indisponível, pede
  // confirmação. Caso contrário (online ou "deixar na fila"), transfere direto.
  const attemptTransfer = () => {
    const target = destinationMode === 'attendant' ? selectedTransferAttendant : null
    if (target && !isAtendenteOnline(target)) {
      setOfflineTarget({ id: target.id, nome: target.nome, pausa: Boolean(target.pausa_atual_id) })
      setOfflineConfirmOpen(true)
      return
    }
    void executeTransfer()
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
          {dataLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Carregando destinos…
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[min(65vh,34rem)] overscroll-contain">
                <div className="space-y-5 px-5 py-4">
                  <fieldset className="space-y-3">
                    <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                        {hasSelectedSector ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : '1'}
                      </span>
                      Setor de destino
                    </legend>
                    {sectorOptions.length === 0 ? (
                      // Lista vazia só acontece quando o ticket chega sem
                      // `setor_id` — o carregamento aborta e o campo ficava em
                      // branco, sem erro, sem explicação. Dizer isso em texto.
                      <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Não foi possível identificar o setor deste atendimento, então
                        não há destinos para listar. Reabra a conversa; se continuar,
                        avise o suporte.
                      </p>
                    ) : (
                    <Select value={selectedSetor} onValueChange={handleSetorChange}>
                      <SelectTrigger id="transfer-setor" className="h-11 w-full" aria-label="Setor de destino">
                        <SelectValue placeholder="Escolha um setor…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectorOptions.map((setor) => (
                          <SelectItem key={setor.id} value={setor.id}>
                            <span className="flex items-center gap-2">
                              <span>{setor.nome}</span>
                              {setor.id === ticket?.setor_id && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  Atual
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    )}
                  </fieldset>

                  {hasSelectedSector && (
                    <fieldset className="space-y-3">
                      <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          hasSelectedSubsetor
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {hasSelectedSubsetor
                            ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            : '2'}
                        </span>
                        Subsetor
                      </legend>
                      <Select
                        value={selectedTransferSubsetor?.id ?? ''}
                        onValueChange={handleSubsetorChange}
                        disabled={subsetorOptions.length === 0}
                      >
                        <SelectTrigger id="transfer-subsetor" className="h-11 w-full" aria-label="Subsetor de destino">
                          <SelectValue placeholder="Escolha um subsetor…" />
                        </SelectTrigger>
                        <SelectContent>
                          {subsetorOptions.map((subsetor) => (
                            <SelectItem key={subsetor.id} value={subsetor.id}>
                              {subsetor.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {subsetorOptions.length === 0 ? (
                        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                          Nenhum subsetor ativo neste setor.
                        </p>
                      ) : (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          A escolha define a prioridade e quais atendentes são compatíveis.
                        </p>
                      )}
                    </fieldset>
                  )}

                  {hasSelectedSubsetor && (
                    <fieldset className="space-y-3">
                      <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                          3
                        </span>
                        Destino final
                      </legend>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          aria-pressed={destinationMode === 'queue'}
                          disabled={filaDoSubsetorBloqueada}
                          onClick={() => {
                            setDestinationMode('queue')
                            setSelectedAtendente(UNSELECTED_TRANSFER_VALUE)
                            setOfflineConfirmOpen(false)
                            setOfflineTarget(null)
                          }}
                          className={cn(
                            'min-h-24 touch-manipulation rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            filaDoSubsetorBloqueada
                              ? 'cursor-not-allowed border-dashed border-border bg-muted/40 opacity-70'
                              : destinationMode === 'queue'
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-background hover:bg-muted/50',
                          )}
                        >
                          <span className="flex items-start">
                            <span className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-md',
                              filaDoSubsetorBloqueada
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-primary/10 text-primary',
                            )}>
                              <TicketIcon className="h-4 w-4" aria-hidden="true" />
                            </span>
                          </span>
                          <span className={cn(
                            'mt-3 block text-sm font-medium',
                            filaDoSubsetorBloqueada ? 'text-muted-foreground' : 'text-foreground',
                          )}>
                            Fila do subsetor
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {filaDoSubsetorBloqueada
                              ? 'Indisponível para este atendimento.'
                              : 'Mantém a prioridade e distribui automaticamente.'}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={destinationMode === 'attendant'}
                          onClick={() => setDestinationMode('attendant')}
                          className={cn(
                            'min-h-24 touch-manipulation rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            destinationMode === 'attendant'
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-background hover:bg-muted/50',
                          )}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
                              <User className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {onlineCompatibleAttendants.length} online
                            </Badge>
                          </span>
                          <span className="mt-3 block text-sm font-medium text-foreground">
                            Atendente específico
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            Mostra apenas quem atende este subsetor.
                          </span>
                        </button>
                      </div>

                      {filaDoSubsetorBloqueada && (
                        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                          {filaBloqueada?.motivo}
                        </p>
                      )}

                      {destinationMode === 'attendant' && (
                        <div className="space-y-2">
                          <Label htmlFor="transfer-atendente">Atendente compatível</Label>
                          <Select
                            value={selectedTransferAttendant?.id ?? ''}
                            onValueChange={setSelectedAtendente}
                            disabled={attendantsLoading || compatibleAttendants.length === 0}
                          >
                            <SelectTrigger id="transfer-atendente" className="h-11 w-full">
                              <SelectValue placeholder={
                                attendantsLoading
                                  ? 'Carregando atendentes…'
                                  : 'Escolha um atendente…'
                              } />
                            </SelectTrigger>
                            <SelectContent>
                              {compatibleAttendants.map((atendente) => {
                                const online = isAtendenteOnline(atendente)
                                const status = atendente.pausa_atual_id
                                  ? 'Em pausa'
                                  : online ? 'Online' : 'Offline'
                                return (
                                  <SelectItem key={atendente.id} value={atendente.id}>
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          'h-2 w-2 shrink-0 rounded-full',
                                          online ? 'bg-green-500' : 'bg-muted-foreground',
                                        )}
                                        aria-hidden="true"
                                      />
                                      <span>{atendente.nome}</span>
                                      <span className="text-xs text-muted-foreground">· {status}</span>
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>

                          {attendantsLoading && (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                              Buscando atendentes compatíveis…
                            </p>
                          )}
                          {!attendantsLoading && compatibleAttendants.length === 0 && (
                            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                              Nenhum atendente compatível. Envie para a fila para manter a prioridade.
                            </p>
                          )}
                          {selectedTransferAttendant && !isAtendenteOnline(selectedTransferAttendant) && (
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                              Este atendente está offline. A confirmação será solicitada antes da transferência.
                            </p>
                          )}
                        </div>
                      )}
                    </fieldset>
                  )}

                  {hasSelectedSubsetor && (
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3" aria-live="polite">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Destino selecionado
                      </p>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 break-words text-sm font-medium text-foreground">
                        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>{selectedTransferSector?.nome}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>{selectedTransferSubsetor?.nome}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <span>
                          {destinationMode === 'attendant'
                            ? selectedTransferAttendant?.nome ?? 'Selecione um atendente'
                            : 'Fila automática'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={transferLoading}
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={attemptTransfer}
                  disabled={!isDestinationReady || transferLoading}
                  className="gap-2"
                >
                  {transferLoading && (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  )}
                  {transferLoading
                    ? 'Transferindo…'
                    : destinationMode === 'attendant' && selectedTransferAttendant
                      ? `Transferir para ${selectedTransferAttendant.nome}`
                      : 'Enviar para a fila'}
                </Button>
              </div>
            </>
          )}
      </div>

      {/* Confirmação: transferir para atendente offline ou em pausa */}
      <AlertDialog open={offlineConfirmOpen} onOpenChange={setOfflineConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {offlineTarget?.pausa ? '⚠️ Transferir para atendente em pausa?' : '⚠️ Transferir para atendente offline?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{offlineTarget?.nome}</strong> está {offlineTarget?.pausa ? 'em pausa' : 'offline'} no
              momento. O ticket será atribuído a ele(a) e aparecerá na lista dele(a) no WorkDesk. Deseja
              transferir mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOfflineConfirmOpen(false)
                void executeTransfer(true)
              }}
            >
              Transferir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export type TransferirTicketDialogProps =
  Omit<TransferirTicketFormProps, 'active' | 'onCancel'> & {
    open: boolean
    onOpenChange: (open: boolean) => void
  }

/** O mesmo fluxo em diálogo — usado pelo WorkDesk. */
export function TransferirTicketDialog({ open, onOpenChange, ...formProps }: TransferirTicketDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-balance">
            <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
            Transferir Ticket
          </DialogTitle>
          <DialogDescription>
            Defina o setor, o subsetor e quem deve receber o atendimento.
          </DialogDescription>
        </DialogHeader>
        <TransferirTicketForm
          {...formProps}
          active={open}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
