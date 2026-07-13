'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/lib/use-push-notifications'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Liga/desliga as notificações Web Push deste navegador. A subscription é por
 * dispositivo e vinculada ao colaborador logado.
 *
 * variant:
 *  - 'icon' (padrão): só o ícone, para a barra do topo.
 *  - 'full': botão largo com rótulo.
 *  - 'menu': item estilizado para dropdown (menu do perfil), com estado on/off.
 */
export function PushToggle({
  variant = 'icon',
  className,
}: {
  variant?: 'icon' | 'full' | 'menu'
  className?: string
}) {
  const { state, busy, supported, enable, disable } = usePushNotifications()

  // Evita hydration mismatch: o suporte a push só existe no cliente, então
  // servidor e primeiro render do cliente devem renderizar igual (null).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !supported) return null

  const subscribed = state === 'subscribed'

  async function onClick() {
    try {
      if (subscribed) {
        await disable()
        toast.success('Notificações desativadas')
      } else {
        await enable()
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          toast.error(
            Notification.permission === 'denied'
              ? 'Permissão bloqueada no navegador. Libere nas configurações do site.'
              : 'A permissão de notificações não foi concedida.',
          )
        } else {
          toast.success('Notificações ativadas')
        }
      }
    } catch {
      toast.error('Não foi possível alterar as notificações')
    }
  }

  if (variant === 'menu') {
    // Botão simples (NÃO usar Radix Switch aqui — conflita com o DropdownMenu).
    // O "interruptor" é só visual; o clique no botão inteiro faz o toggle.
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={subscribed}
        aria-label={subscribed ? 'Desativar notificações' : 'Ativar notificações'}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5',
          subscribed ? 'text-primary font-medium' : 'text-foreground',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          {subscribed ? (
            <BellRing className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4 text-muted-foreground" />
          )}
          {subscribed ? 'Notificações ativas' : 'Ativar notificações'}
        </span>
        <span
          aria-hidden
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
            subscribed ? 'bg-primary' : 'bg-muted-foreground/30',
            busy && 'opacity-50',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
              subscribed ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    )
  }

  if (variant === 'full') {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={busy}
        className={cn('w-full justify-start gap-3', subscribed && 'text-primary', className)}
      >
        {subscribed ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {subscribed ? 'Notificações ativas' : 'Ativar notificações'}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={busy}
      aria-label={subscribed ? 'Desativar notificações' : 'Ativar notificações'}
      title={subscribed ? 'Notificações ativas' : 'Ativar notificações'}
      className={className}
    >
      {subscribed ? (
        <BellRing className="h-5 w-5 text-primary" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
    </Button>
  )
}
