'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Clock3,
  Headset,
  Loader2,
  LockKeyhole,
  Send,
  UserCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

type ManagerSupportRole = 'attendant' | 'manager'
type ManagerSupportStatus = 'pendente' | 'ativo' | 'encerrado' | 'cancelado'
type ManagerSupportStage = 'idle' | 'requesting' | 'waiting' | 'active' | 'taken' | 'expired' | 'error'

interface ManagerSupportRecord {
  id: string
  ticket_id: string
  setor_id: string
  atendente_id: string
  atendente_nome: string
  solicitante_id: string
  gestor_id: string | null
  gestor_nome: string | null
  origem: 'atendente' | 'gestor'
  status: ManagerSupportStatus
  motivo: string | null
  solicitado_em: string
  aceito_em: string | null
  encerrado_em: string | null
  encerrado_por_id: string | null
  atualizado_em: string
}

interface ManagerSupportMessage {
  id: string
  apoio_id: string
  autor_id: string
  autor_nome: string
  conteudo: string
  criado_em: string
}

interface ManagerSupportSnapshot {
  role: ManagerSupportRole
  canParticipate: boolean
  support: ManagerSupportRecord | null
  messages: ManagerSupportMessage[]
}

interface ManagerSupportProps {
  ticketId: string
  ticketNumber?: number | string | null
  autoOpenSupportId?: string | null
  className?: string
}

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error || fallback
}

function formatMessageTime(value: string) {
  return MESSAGE_TIME_FORMATTER.format(new Date(value))
}

export function ManagerSupport({
  ticketId,
  ticketNumber,
  autoOpenSupportId = null,
  className,
}: ManagerSupportProps) {
  const supabase = useMemo(() => createClient(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<ManagerSupportSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<'request' | 'accept' | 'close' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [requestedSupportId, setRequestedSupportId] = useState(autoOpenSupportId)
  const loadedRef = useRef(false)
  const fetchSequenceRef = useRef(0)
  const autoOpenedSupportRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchSupport = useCallback(async () => {
    const sequence = ++fetchSequenceRef.current
    if (!loadedRef.current) setIsLoading(true)

    try {
      const supportQuery = requestedSupportId
        ? `?apoioId=${encodeURIComponent(requestedSupportId)}`
        : ''
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/apoio-gestor${supportQuery}`,
        { cache: 'no-store' },
      )
      if (!response.ok) {
        throw new Error(await responseError(response, 'Não foi possível carregar o apoio interno.'))
      }

      const data = await response.json() as ManagerSupportSnapshot
      if (sequence !== fetchSequenceRef.current) return

      setSnapshot({
        ...data,
        messages: [...(data.messages || [])].sort(
          (left, right) => new Date(left.criado_em).getTime() - new Date(right.criado_em).getTime(),
        ),
      })
      setError(null)
      loadedRef.current = true
    } catch (fetchError) {
      if (sequence !== fetchSequenceRef.current) return
      setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar o apoio interno.')
    } finally {
      if (sequence === fetchSequenceRef.current) setIsLoading(false)
    }
  }, [requestedSupportId, ticketId])

  useEffect(() => {
    setRequestedSupportId(autoOpenSupportId)
  }, [autoOpenSupportId, ticketId])

  useEffect(() => {
    loadedRef.current = false
    setSnapshot(null)
    setError(null)
    setMessage('')
    void fetchSupport()
  }, [fetchSupport])

  useEffect(() => {
    if (!autoOpenSupportId) return

    const autoOpenKey = `${ticketId}:${autoOpenSupportId}`
    if (autoOpenedSupportRef.current === autoOpenKey) return

    autoOpenedSupportRef.current = autoOpenKey
    setIsOpen(true)
  }, [autoOpenSupportId, ticketId])

  useEffect(() => {
    const channel = supabase
      .channel(`manager-support-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_apoios_gestor',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          void fetchSupport()
        },
      )

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void fetchSupport()
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchSupport, supabase, ticketId])

  const supportId = snapshot?.support?.id
  useEffect(() => {
    if (!supportId) return

    const channel = supabase
      .channel(`manager-support-messages-${supportId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_apoio_mensagens',
          filter: `apoio_id=eq.${supportId}`,
        },
        () => {
          void fetchSupport()
        },
      )

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void fetchSupport()
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchSupport, supportId, supabase])

  useEffect(() => {
    if (!isOpen) return
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [isOpen, snapshot?.messages.length])

  const support = snapshot?.support
  const isFinished = support?.status === 'encerrado' || support?.status === 'cancelado'
  const matchesRequestedSupport = !requestedSupportId || support?.id === requestedSupportId
  const isExpiredDeepLink = Boolean(
    requestedSupportId && snapshot && (!matchesRequestedSupport || !support || isFinished),
  )
  const stage: ManagerSupportStage = pendingAction === 'request'
    ? 'requesting'
    : error && !snapshot
      ? 'error'
      : isExpiredDeepLink
        ? 'expired'
        : !support || isFinished
          ? 'idle'
          : support.status === 'pendente'
            ? 'waiting'
            : snapshot?.canParticipate
              ? 'active'
              : 'taken'

  const role = snapshot?.role
  const canParticipate = Boolean(snapshot?.canParticipate)
  const isManager = role === 'manager'
  const displayTicket = ticketNumber !== null && ticketNumber !== undefined
    ? `#${ticketNumber}`
    : 'selecionado'
  const actionBusy = pendingAction !== null
  const canRequest = stage === 'idle' && canParticipate
  const hasSelectedSupport = Boolean(support?.id && matchesRequestedSupport)
  const canAccept = stage === 'waiting' && isManager && canParticipate && hasSelectedSupport
  const canClose = ((stage === 'waiting' && !isManager) || stage === 'active')
    && canParticipate
    && hasSelectedSupport
  const shouldHideTrigger = !isLoading && Boolean(snapshot) && !canParticipate && !support

  const updateSupport = async (action: 'request' | 'accept' | 'close') => {
    const isRequest = action === 'request'
    const selectedSupportId = support?.id
    if (!isRequest && (!selectedSupportId || !matchesRequestedSupport)) return

    setPendingAction(action)
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/apoio-gestor`, {
        method: isRequest ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: isRequest ? undefined : JSON.stringify({ action, apoioId: selectedSupportId }),
      })
      if (!response.ok) {
        const message = await responseError(response, 'Não foi possível alterar o apoio interno.')
        if (response.status === 409) await fetchSupport()
        throw new Error(message)
      }

      await fetchSupport()
      if (action === 'accept') toast.success('Apoio aceito. O chat interno está aberto.')
      if (action === 'close') {
        toast.success(support?.status === 'pendente' ? 'Pedido de apoio cancelado.' : 'Apoio encerrado.')
      }
    } catch (actionError) {
      const actionMessage = actionError instanceof Error
        ? actionError.message
        : 'Não foi possível alterar o apoio interno.'
      setError(actionMessage)
      toast.error(actionMessage)
    } finally {
      setPendingAction(null)
    }
  }

  const sendMessage = async () => {
    const content = message.trim()
    if (!content || !support || support.status !== 'ativo' || !matchesRequestedSupport) return

    setPendingAction('send')
    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/apoio-gestor/mensagens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apoioId: support.id, conteudo: content }),
        },
      )
      if (!response.ok) {
        throw new Error(await responseError(response, 'Não foi possível enviar a mensagem.'))
      }

      setMessage('')
      await fetchSupport()
    } catch (sendError) {
      const sendErrorMessage = sendError instanceof Error
        ? sendError.message
        : 'Não foi possível enviar a mensagem.'
      setError(sendErrorMessage)
      toast.error(sendErrorMessage)
    } finally {
      setPendingAction(null)
    }
  }

  const triggerLabel = stage === 'requesting'
    ? 'Solicitando apoio'
    : stage === 'waiting'
      ? isManager ? 'Apoio solicitado' : 'Aguardando gestor'
      : stage === 'active'
        ? 'Apoio ativo'
        : stage === 'taken'
          ? 'Apoio em andamento'
          : stage === 'expired'
            ? 'Apoio encerrado'
            : stage === 'error'
              ? 'Apoio indisponível'
              : !canParticipate && snapshot
                ? 'Apoio indisponível'
                : isManager ? 'Iniciar apoio' : 'Chamar gestor'

  const TriggerIcon = stage === 'requesting' || isLoading
    ? Loader2
    : stage === 'waiting'
      ? Clock3
      : stage === 'active'
        ? UserCheck
        : stage === 'taken'
          ? Check
          : stage === 'expired'
            ? Check
            : stage === 'error'
              ? CircleAlert
              : Headset

  return (
    <>
      {!shouldHideTrigger && (
        <Button
          type="button"
          variant={stage === 'active' ? 'secondary' : 'outline'}
          size="sm"
          className={cn(
            'h-11 min-w-11 touch-manipulation gap-1.5 bg-transparent px-2 transition-colors md:h-9 md:px-3',
            stage === 'active' && 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
            stage === 'waiting' && 'border-amber-500/40 text-amber-700 dark:text-amber-300',
            className,
          )}
          onClick={() => {
            setRequestedSupportId(null)
            setIsOpen(true)
          }}
          aria-label={`${triggerLabel} no ticket ${displayTicket}`}
          title={triggerLabel}
        >
          <TriggerIcon
            className={cn(
              'h-4 w-4',
              (stage === 'requesting' || isLoading) && 'animate-spin motion-reduce:animate-none',
            )}
            aria-hidden="true"
          />
          <span className="hidden md:inline">{triggerLabel}</span>
        </Button>
      )}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) setRequestedSupportId(null)
          if (open) void fetchSupport()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(88vh,720px)] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden overscroll-contain p-0 sm:max-w-lg"
        >
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle className="flex items-center gap-2 text-balance text-base">
              <Headset className="h-4 w-4 text-primary" aria-hidden="true" />
              Apoio interno · Ticket {displayTicket}
            </DialogTitle>
            <DialogDescription>
              Conversa reservada entre atendente e gestor.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-11 w-11 touch-manipulation transition-colors"
              aria-label="Fechar apoio interno"
              title="Fechar apoio interno"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DialogClose>

          <div className="flex items-start gap-2 border-b bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-100">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p><strong>Chat privado.</strong> O cliente não recebe nem visualiza estas mensagens.</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="border-b px-4 py-3"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {isLoading && !snapshot ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Carregando apoio…
                </p>
              ) : stage === 'requesting' ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {isManager ? 'Iniciando o apoio…' : 'Avisando os gestores…'}
                </p>
              ) : stage === 'error' ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 touch-manipulation transition-colors"
                    onClick={() => void fetchSupport()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : stage === 'expired' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Este apoio não está mais disponível</p>
                    <p className="text-xs text-muted-foreground">
                      A notificação pertence a uma sessão encerrada ou substituída. Nenhuma ação será aplicada ao apoio atual.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 shrink-0 touch-manipulation transition-colors"
                    onClick={() => setRequestedSupportId(null)}
                  >
                    Ver apoio atual
                  </Button>
                </div>
              ) : stage === 'idle' ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {!canParticipate
                      ? 'Apoio indisponível para este perfil'
                      : isManager
                        ? 'Inicie um apoio para este atendimento'
                        : 'Precisa de orientação ou intervenção?'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {!canParticipate
                      ? isManager
                        ? 'Peça a um administrador para incluir você no grupo Gestor deste setor.'
                        : 'Somente o responsável atual pelo ticket pode solicitar apoio.'
                      : isManager
                        ? 'O atendente será avisado e o chat interno ficará disponível imediatamente.'
                        : 'Todos os gestores configurados serão avisados; o primeiro que aceitar entra no chat.'}
                  </p>
                </div>
              ) : stage === 'waiting' ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    Aguardando um gestor aceitar
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pedido enviado por {support?.atendente_nome || 'atendente'}.
                  </p>
                </div>
              ) : stage === 'active' ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                    Apoio ativo com {support?.gestor_nome || 'gestor'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {support?.atendente_nome || 'Atendente'} e {support?.gestor_nome || 'gestor'} participam deste chat.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Apoio já assumido</p>
                  <p className="text-xs text-muted-foreground">
                    {support?.gestor_nome || 'Outro gestor'} já está apoiando {support?.atendente_nome || 'o atendente'}.
                  </p>
                </div>
              )}
              {error && snapshot && (
                <p className="mt-2 text-xs text-destructive">{error}</p>
              )}
            </div>

            {support?.status === 'ativo' && canParticipate && (
              <>
                <ScrollArea className="min-h-[180px] flex-1 overscroll-contain bg-muted/20 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
                  <div
                    className="space-y-3 p-4"
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions text"
                    aria-label="Mensagens do apoio interno"
                  >
                    {snapshot?.messages.length ? snapshot.messages.map((item) => {
                      const currentParticipantId = isManager ? support.gestor_id : support.atendente_id
                      const isOwn = item.autor_id === currentParticipantId
                      return (
                        <div
                          key={item.id}
                          className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
                        >
                          <div className={cn(
                            'max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm',
                            isOwn ? 'bg-primary text-primary-foreground' : 'border bg-background',
                          )}>
                            <p className={cn(
                              'mb-1 break-words text-[10px] font-medium',
                              isOwn ? 'text-primary-foreground/75' : 'text-muted-foreground',
                            )}>
                              {item.autor_nome || (isOwn ? 'Você' : 'Participante')}
                            </p>
                            <p className="whitespace-pre-wrap break-words leading-5">{item.conteudo}</p>
                            <p className={cn(
                              'mt-1 text-right text-[10px]',
                              isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}>
                              {formatMessageTime(item.criado_em)}
                            </p>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted-foreground">
                        <EmptySupportIcon />
                        <p className="text-sm">O chat interno está pronto.</p>
                        <p className="text-xs">Envie a primeira mensagem para iniciar o apoio.</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="flex items-end gap-2 border-t p-3">
                  <Textarea
                    name="manager-support-message"
                    autoComplete="off"
                    enterKeyHint="send"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        void sendMessage()
                      }
                    }}
                    maxLength={5000}
                    placeholder="Mensagem privada para o apoio…"
                    aria-label="Mensagem privada para o apoio"
                    className="min-h-11 max-h-28 resize-none"
                    disabled={actionBusy}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-11 w-11 shrink-0 touch-manipulation transition-colors"
                    onClick={() => void sendMessage()}
                    disabled={!message.trim() || actionBusy}
                    aria-label="Enviar mensagem privada"
                  >
                    {pendingAction === 'send'
                      ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      : <Send className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </>
            )}
          </div>

          {(canRequest || canAccept || canClose) && (
            <DialogFooter className="border-t px-4 py-3 sm:justify-between">
              {canRequest && (
                <Button
                  type="button"
                  onClick={() => void updateSupport('request')}
                  disabled={actionBusy}
                  className="min-h-11 touch-manipulation transition-colors sm:ml-auto"
                >
                  {pendingAction === 'request'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    : <Headset className="mr-2 h-4 w-4" aria-hidden="true" />}
                  {isManager ? 'Iniciar apoio' : 'Chamar gestor'}
                </Button>
              )}
              {canAccept && (
                <Button
                  type="button"
                  onClick={() => void updateSupport('accept')}
                  disabled={actionBusy}
                  className="min-h-11 touch-manipulation transition-colors sm:ml-auto"
                >
                  {pendingAction === 'accept'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    : <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Aceitar apoio
                </Button>
              )}
              {canClose && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void updateSupport('close')}
                  disabled={actionBusy}
                  className="min-h-11 touch-manipulation transition-colors sm:ml-auto"
                >
                  {pendingAction === 'close' && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                  {stage === 'waiting' ? 'Cancelar pedido' : 'Encerrar apoio'}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function EmptySupportIcon() {
  return (
    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
      <Headset className="h-4 w-4 text-primary" aria-hidden="true" />
    </div>
  )
}
