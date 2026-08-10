'use client'

import { useCallback, useEffect, useState } from 'react'

const PUSH_STATE_EVENT = 'softcomhub:push-state-change'
let subscriptionSync: Promise<void> | null = null

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    // A resposta pode não ter JSON; nesse caso usa a mensagem segura de fallback.
  }

  return fallback
}

function syncSubscription(subscription: PushSubscription): Promise<void> {
  if (!subscriptionSync) {
    subscriptionSync = fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await responseError(response, 'Não foi possível salvar as notificações neste navegador.'),
          )
        }
      })
      .finally(() => {
        subscriptionSync = null
      })
  }
  return subscriptionSync
}

async function getVapidPublicKey(): Promise<string> {
  const response = await fetch('/api/push/config', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(
      await responseError(response, 'Não foi possível preparar as notificações neste momento.'),
    )
  }

  const body = (await response.json()) as { publicKey?: unknown }
  if (typeof body.publicKey !== 'string' || !body.publicKey.trim()) {
    throw new Error('A configuração de notificações está inválida.')
  }

  return body.publicKey
}

async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  if (!response.ok) throw new Error('Falha ao remover subscription')
}

async function removeSubscription(subscription: PushSubscription): Promise<void> {
  await removeSubscriptionFromServer(subscription)
  await subscription.unsubscribe()
}

export async function unsubscribeCurrentBrowser(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  if (!subscription) return

  await removeSubscription(subscription)
  window.dispatchEvent(new Event(PUSH_STATE_EVENT))
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function subscriptionUsesVapidPublicKey(subscription: PushSubscription, key: string) {
  const currentKey = subscription.options.applicationServerKey
  if (!currentKey) return false

  const expectedKey = urlBase64ToUint8Array(key)
  const currentBytes = new Uint8Array(currentKey)
  if (currentBytes.length !== expectedKey.length) return false

  for (let index = 0; index < expectedKey.length; index++) {
    if (currentBytes[index] !== expectedKey[index]) return false
  }

  return true
}

function subscribeWithVapidKey(registration: ServiceWorkerRegistration, key: string) {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
  })
}

async function getOrReplaceSubscription(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription()
  if (!existing || subscriptionUsesVapidPublicKey(existing, key)) {
    return existing || subscribeWithVapidKey(registration, key)
  }

  await removeSubscription(existing)
  return subscribeWithVapidKey(registration, key)
}

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'

/**
 * Gerencia o ciclo de vida da Web Push subscription deste navegador:
 * registra o service worker, pede permissão, assina o PushManager e
 * persiste/remove a subscription no backend.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState>('default')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const refreshState = useCallback(async () => {
    if (!supported) {
      setState('unsupported')
      setReady(true)
      return
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (!sub) {
        setState(Notification.permission as PushState)
        return
      }

      const key = await getVapidPublicKey()
      if (!subscriptionUsesVapidPublicKey(sub, key)) {
        setState(Notification.permission as PushState)
        return
      }

      await syncSubscription(sub)
      setState('subscribed')
    } catch {
      setState(Notification.permission as PushState)
    } finally {
      setReady(true)
    }
  }, [supported])

  useEffect(() => {
    void refreshState()
    window.addEventListener(PUSH_STATE_EVENT, refreshState)
    return () => window.removeEventListener(PUSH_STATE_EVENT, refreshState)
  }, [refreshState])

  const enable = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    try {
      // A permissão precisa ser solicitada durante o gesto de clique. Registrar o
      // service worker antes dela pode fazer alguns navegadores perderem esse gesto.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission as PushState)
        return
      }

      await navigator.serviceWorker.register('/sw.js')
      // Aguarda o SW ficar ATIVO — subscribe() falha com "no active Service
      // Worker" se chamado logo após register() (o SW ainda está instalando).
      const reg = await navigator.serviceWorker.ready
      const key = await getVapidPublicKey()

      const sub = await getOrReplaceSubscription(reg, key)

      await syncSubscription(sub)
      setState('subscribed')
      window.dispatchEvent(new Event(PUSH_STATE_EVENT))
    } finally {
      setBusy(false)
    }
  }, [supported])

  const disable = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    try {
      await unsubscribeCurrentBrowser()
      setState(Notification.permission as PushState)
    } finally {
      setBusy(false)
    }
  }, [supported])

  return { state, busy, ready, supported, enable, disable }
}
