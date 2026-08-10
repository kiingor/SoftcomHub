'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const EMPTY_SETOR_IDS: string[] = []

interface Notificacao {
  id: string
  remetente_id: string
  setor_id: string | null
  destinatario_id: string | null
  titulo: string
  mensagem: string
  tipo?: string | null
  ticket_id?: string | null
  url?: string | null
  criado_em: string
  remetente?: {
    nome: string
  }
  setor?: {
    nome: string
  }
  lida?: boolean
}

interface NotificacoesPanelProps {
  colaboradorId: string
  setorIds?: string[]
}

function notificationTarget(notificacao: Notificacao): string | null {
  if (notificacao.ticket_id) {
    return '/workdesk?ticket=' + encodeURIComponent(notificacao.ticket_id)
  }

  const url = notificacao.url?.trim()
  if (!url || !url.startsWith('/') || url.startsWith('//')) return null

  return url
}

export function NotificacoesPanel({
  colaboradorId,
  setorIds = EMPTY_SETOR_IDS,
}: NotificacoesPanelProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [showNewNotification, setShowNewNotification] = useState(false)
  const [newNotificationData, setNewNotificationData] = useState<Notificacao | null>(null)
  const popupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const receivedNotificationIdsRef = useRef(new Set<string>())

  const setorIdsKey = Array.from(new Set(setorIds.filter(Boolean))).sort().join(',')
  const activeSetorIds = useMemo(
    () => new Set(setorIdsKey ? setorIdsKey.split(',') : []),
    [setorIdsKey],
  )

  const fetchNotificacoes = useCallback(async () => {
    const filters = ['destinatario_id.eq.' + colaboradorId]
    if (setorIdsKey) filters.unshift('setor_id.in.(' + setorIdsKey + ')')

    const { data, error } = await supabase
      .from('notificacoes')
      .select('*, remetente:colaboradores!notificacoes_remetente_id_fkey(nome), setor:setores(nome)')
      .or(filters.join(','))
      .order('criado_em', { ascending: false })
      .limit(50)

    if (error) {
      console.warn('[NotificacoesPanel] Falha ao buscar notificações:', error)
      return
    }

    const { data: lidas, error: lidasError } = await supabase
      .from('notificacoes_lidas')
      .select('notificacao_id')
      .eq('colaborador_id', colaboradorId)

    if (lidasError) {
      console.warn('[NotificacoesPanel] Falha ao buscar notificações lidas:', lidasError)
      return
    }

    const lidasIds = new Set(lidas?.map((l) => l.notificacao_id) || [])
    const notificacoesComLida = (data || []).map((notificacao: Notificacao) => ({
      ...notificacao,
      lida: lidasIds.has(notificacao.id),
    }))

    setNotificacoes(notificacoesComLida)
    setUnreadCount(notificacoesComLida.filter((notificacao) => !notificacao.lida).length)
  }, [colaboradorId, setorIdsKey, supabase])

  const markAsRead = useCallback(async (notificacaoId: string) => {
    const notificacao = notificacoes.find((item) => item.id === notificacaoId)
    if (notificacao?.lida) return true

    const { error } = await supabase.from('notificacoes_lidas').upsert({
      notificacao_id: notificacaoId,
      colaborador_id: colaboradorId,
    })

    if (error) {
      console.warn('[NotificacoesPanel] Falha ao marcar notificação como lida:', error)
      return false
    }

    setNotificacoes((previous) =>
      previous.map((item) => (
        item.id === notificacaoId ? { ...item, lida: true } : item
      )),
    )
    if (!notificacao?.lida) {
      setUnreadCount((previous) => Math.max(0, previous - 1))
    }

    return true
  }, [colaboradorId, notificacoes, supabase])

  const handleNotificationClick = useCallback(async (notificacao: Notificacao) => {
    const markedAsRead = await markAsRead(notificacao.id)
    if (!markedAsRead) return

    const target = notificationTarget(notificacao)
    if (!target) return

    setIsOpen(false)
    setShowNewNotification(false)
    router.push(target)
  }, [markAsRead, router])

  const handlePopupClick = useCallback(async () => {
    if (!newNotificationData) return

    setShowNewNotification(false)
    const markedAsRead = await markAsRead(newNotificationData.id)
    if (!markedAsRead) return

    const target = notificationTarget(newNotificationData)
    if (target) {
      setIsOpen(false)
      router.push(target)
      return
    }

    // Sem ticket ou rota associada, a pessoa vê a lista e o aviso já fica lido.
    setIsOpen(true)
  }, [markAsRead, newNotificationData, router])

  useEffect(() => {
    void fetchNotificacoes()
  }, [fetchNotificacoes])

  useEffect(() => () => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current)
  }, [])

  useEffect(() => {
    type RealtimeInsertPayload = { new: Notificacao }

    const handleInsert = async (payload: RealtimeInsertPayload) => {
      const newNotif = payload.new
      const isForMe =
        (newNotif.setor_id && activeSetorIds.has(newNotif.setor_id)) ||
        newNotif.destinatario_id === colaboradorId

      if (!isForMe || newNotif.remetente_id === colaboradorId) return
      if (receivedNotificationIdsRef.current.has(newNotif.id)) return

      receivedNotificationIdsRef.current.add(newNotif.id)
      if (receivedNotificationIdsRef.current.size > 200) {
        receivedNotificationIdsRef.current.clear()
        receivedNotificationIdsRef.current.add(newNotif.id)
      }

      const { data: remetente } = await supabase
        .from('colaboradores')
        .select('nome')
        .eq('id', newNotif.remetente_id)
        .maybeSingle()

      setNewNotificationData({
        ...newNotif,
        remetente: remetente || undefined,
        lida: false,
      })
      setShowNewNotification(true)

      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current)
      popupTimeoutRef.current = setTimeout(() => {
        setShowNewNotification(false)
      }, 5000)

      void fetchNotificacoes()
    }

    const channel = supabase.channel('notificacoes-realtime-' + colaboradorId)

    if (setorIdsKey) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: 'setor_id=in.(' + setorIdsKey + ')',
        },
        handleInsert,
      )
    }

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: 'destinatario_id=eq.' + colaboradorId,
      },
      handleInsert,
    )

    let retryTimer: ReturnType<typeof setTimeout> | null = null
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[NotificacoesPanel] Subscription error:', status, error)
        retryTimer = setTimeout(() => {
          void supabase.removeChannel(channel)
        }, 5000)
      }
    })

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      void supabase.removeChannel(channel)
    }
  }, [activeSetorIds, colaboradorId, fetchNotificacoes, setorIdsKey, supabase])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Agora'
    if (minutes < 60) return String(minutes) + 'm'
    if (hours < 24) return String(hours) + 'h'
    return String(days) + 'd'
  }

  return (
    <>
      {showNewNotification && newNotificationData && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="glass-card flex max-w-sm items-start gap-3 rounded-xl border-0 p-4">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() => {
                void handlePopupClick()
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {newNotificationData.titulo || 'Nova notificação'}
                </p>
                <p className="text-xs text-muted-foreground">
                  De: {newNotificationData.remetente?.nome || 'Desconhecido'}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">
                  {newNotificationData.mensagem}
                </p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setShowNewNotification(false)}
              aria-label="Fechar notificação"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Abrir notificações"
            title="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 rounded-2xl border-0 p-0 glass-dropdown" align="end">
          <div className="flex items-center justify-between border-b border-border p-3">
            <h3 className="text-sm font-semibold">Notificações</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} não lida{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            {notificacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell className="mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notificacoes.map((notif) => (
                  <button
                    key={notif.id}
                    type="button"
                    className={cn(
                      'block w-full p-3 text-left transition-colors hover:bg-accent/50',
                      !notif.lida && 'bg-primary/5',
                    )}
                    onClick={() => {
                      void handleNotificationClick(notif)
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          notif.lida ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-foreground">
                            {notif.titulo || 'Sem título'}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatTime(notif.criado_em)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          De: {notif.remetente?.nome || 'Desconhecido'}
                          {notif.setor && ' • ' + notif.setor.nome}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {notif.mensagem}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </>
  )
}
