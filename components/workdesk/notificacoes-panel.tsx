'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface Notificacao {
  id: string
  remetente_id: string
  setor_id: string | null
  destinatario_id: string | null
  titulo: string
  mensagem: string
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
  setorIds: string[]
}

export function NotificacoesPanel({ colaboradorId, setorIds }: NotificacoesPanelProps) {
  const supabase = createClient()
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [showNewNotification, setShowNewNotification] = useState(false)
  const [newNotificationData, setNewNotificationData] = useState<Notificacao | null>(null)

  // Fetch notificacoes
  const fetchNotificacoes = useCallback(async () => {
    if (setorIds.length === 0) return

    // Get notifications for this user (either to their setores or directly to them)
    const { data } = await supabase
      .from('notificacoes')
      .select('*, remetente:colaboradores!notificacoes_remetente_id_fkey(nome), setor:setores(nome)')
      .or(`setor_id.in.(${setorIds.join(',')}),destinatario_id.eq.${colaboradorId}`)
      .order('criado_em', { ascending: false })
      .limit(50)

    if (data) {
      // Check which ones are read
      const { data: lidas } = await supabase
        .from('notificacoes_lidas')
        .select('notificacao_id')
        .eq('colaborador_id', colaboradorId)

      const lidasIds = new Set(lidas?.map((l) => l.notificacao_id) || [])

      const notificacoesComLida = data.map((n) => ({
        ...n,
        lida: lidasIds.has(n.id),
      }))

      setNotificacoes(notificacoesComLida)
      setUnreadCount(notificacoesComLida.filter((n) => !n.lida).length)
    }
  }, [supabase, colaboradorId, setorIds])

  // Mark as read
  const markAsRead = async (notificacaoId: string) => {
    await supabase.from('notificacoes_lidas').upsert({
      notificacao_id: notificacaoId,
      colaborador_id: colaboradorId,
    })

    setNotificacoes((prev) =>
      prev.map((n) => (n.id === notificacaoId ? { ...n, lida: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  // Initial fetch
  useEffect(() => {
    if (setorIds.length > 0) {
      fetchNotificacoes()
    }
  }, [fetchNotificacoes, setorIds])

  // Real-time subscription for new notifications
  useEffect(() => {
    if (setorIds.length === 0) return

    // Server-side filtering: only receive notifications for my setores OR directed to me.
    // Uses two subscriptions on the same channel since Supabase accepts only one filter per .on().
    const handleInsert = async (payload: any) => {
      const newNotif = payload.new as Notificacao

      // Re-check client-side (filter may have widened match; also dedupe)
      const isForMe =
        (newNotif.setor_id && setorIds.includes(newNotif.setor_id)) ||
        newNotif.destinatario_id === colaboradorId

      // Don't show notification if I sent it
      if (isForMe && newNotif.remetente_id !== colaboradorId) {
            // Fetch remetente name
            const { data: remetenteData } = await supabase
              .from('colaboradores')
              .select('nome')
              .eq('id', newNotif.remetente_id)
              .single()

            const notifComRemetente = {
              ...newNotif,
              remetente: remetenteData,
              lida: false,
            }

            setNewNotificationData(notifComRemetente)
            setShowNewNotification(true)

            // Auto hide after 5 seconds
            setTimeout(() => {
              setShowNewNotification(false)
            }, 5000)

            // Refresh list
            fetchNotificacoes()
          }
        }

    const channel = supabase.channel('notificacoes-realtime')

    // Filter 1: notifications sent to any of my setores
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `setor_id=in.(${setorIds.join(',')})`,
      },
      handleInsert
    )

    // Filter 2: notifications directed specifically to me
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `destinatario_id=eq.${colaboradorId}`,
      },
      handleInsert
    )

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[NotificacoesPanel] Subscription error: ${status}`, err)
        setTimeout(() => supabase.removeChannel(channel), 5000)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, setorIds, colaboradorId, fetchNotificacoes])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Agora'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    return `${days}d`
  }

  return (
    <>
      {/* New Notification Popup */}
      {showNewNotification && newNotificationData && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div
            className="glass-card rounded-xl border-0 p-4 max-w-sm cursor-pointer hover:brightness-105 transition-all"
            onClick={() => {
              setShowNewNotification(false)
              setIsOpen(true)
              markAsRead(newNotificationData.id)
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {newNotificationData.titulo || 'Nova notificação'}
                </p>
                <p className="text-xs text-muted-foreground">
                  De: {newNotificationData.remetente?.nome || 'Desconhecido'}
                </p>
                <p className="text-sm text-foreground mt-1 line-clamp-2">
                  {newNotificationData.mensagem}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowNewNotification(false)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Bell */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 glass-dropdown rounded-2xl border-0" align="end">
          <div className="flex items-center justify-between border-b border-border p-3">
            <h3 className="font-semibold text-sm">Notificações</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} não lida{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            {notificacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notificacoes.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      'p-3 cursor-pointer hover:bg-accent/50 transition-colors',
                      !notif.lida && 'bg-primary/5'
                    )}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={cn(
                          'mt-1 h-2 w-2 rounded-full shrink-0',
                          notif.lida ? 'bg-transparent' : 'bg-primary'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground truncate">
                            {notif.titulo || 'Sem título'}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatTime(notif.criado_em)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          De: {notif.remetente?.nome || 'Desconhecido'}
                          {notif.setor && ` • ${notif.setor.nome}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notif.mensagem}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </>
  )
}
