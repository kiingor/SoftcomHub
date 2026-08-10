'use client'

import { useEffect, useState } from 'react'
import { BellRing, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type PushState, usePushNotifications } from '@/lib/use-push-notifications'

function getPromptCopy(state: PushState) {
  if (state === 'denied') {
    return {
      title: 'Libere as notificações no navegador',
      description:
        'Clique no cadeado ao lado do endereço do site, escolha Notificações e marque Permitir. Depois volte aqui para concluir a ativação.',
      button: 'Verificar ativação',
    }
  }

  if (state === 'granted') {
    return {
      title: 'Conclua a ativação das notificações',
      description:
        'Seu navegador já permite notificações. Falta vincular este dispositivo para receber novas mensagens e avisos internos.',
      button: 'Concluir ativação',
    }
  }

  return {
    title: 'Ative as notificações do navegador',
    description:
      'Para não perder novas mensagens, transferências e avisos internos, permita as notificações deste navegador.',
    button: 'Ativar notificações',
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível ativar as notificações. Tente novamente.'
}

export function PushActivationPrompt() {
  const { state, busy, ready, supported, enable } = usePushNotifications()
  const [error, setError] = useState<string | null>(null)
  const [promptRequired, setPromptRequired] = useState(true)
  const isOpen = promptRequired && ready && supported && state !== 'subscribed'
  const copy = getPromptCopy(state)
  const Icon = state === 'denied' ? Settings2 : BellRing

  useEffect(() => {
    if (state === 'subscribed') setPromptRequired(false)
  }, [state])

  async function activateNotifications() {
    setError(null)

    try {
      await enable()
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="overscroll-contain sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="items-center text-center sm:items-start sm:text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="text-balance">{copy.title}</DialogTitle>
          <DialogDescription className="text-pretty">{copy.description}</DialogDescription>
        </DialogHeader>

        {state === 'denied' && (
          <ol className="space-y-1.5 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <li>1. Abra as permissões do site no navegador.</li>
            <li>2. Altere Notificações para Permitir.</li>
            <li>3. Volte e clique em “Verificar ativação”.</li>
          </ol>
        )}

        {error && (
          <p className="text-sm text-destructive" role="status" aria-live="polite">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            className="w-full gap-2 sm:w-auto"
            onClick={activateNotifications}
            disabled={busy}
            aria-busy={busy}
          >
            <BellRing className="h-4 w-4" />
            {busy ? 'Ativando…' : copy.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
