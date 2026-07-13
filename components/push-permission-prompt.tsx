'use client'

import { useState } from 'react'
import { BellRing, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/lib/use-push-notifications'
import { toast } from 'sonner'

export function PushPermissionPrompt() {
  const { state, busy, ready, supported, enable } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)

  if (!ready || !supported || dismissed || state === 'subscribed') return null

  const blocked = state === 'denied'

  async function handleEnable() {
    try {
      await enable()
      if (Notification.permission !== 'granted') {
        toast.error(
          Notification.permission === 'denied'
            ? 'Permissão bloqueada. Libere as notificações nas configurações do site.'
            : 'A permissão não foi concedida.',
        )
        return
      }
      toast.success('Notificações ativadas neste navegador')
    } catch {
      toast.error('Não foi possível ativar as notificações')
    }
  }

  return (
    <aside
      aria-live="polite"
      aria-label="Ativar notificações"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-xl border border-border bg-card p-4 shadow-xl sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Ative os avisos do SoftcomHub</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {blocked
              ? 'As notificações estão bloqueadas neste navegador. Libere a permissão nas configurações do site para receber os avisos.'
              : 'Receba alertas de novas mensagens e de instâncias desconectadas, mesmo quando esta aba não estiver aberta.'}
          </p>
          {!blocked && (
            <Button className="mt-3 gap-2" size="sm" onClick={handleEnable} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              {busy ? 'Ativando...' : 'Permitir notificações'}
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
