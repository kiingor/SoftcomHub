'use client'

import { useCallback, useEffect, useState } from 'react'

const PUSH_STATE_EVENT = 'softcomhub:push-state-change'
let subscriptionSync: Promise<Response> | null = null

function syncSubscription(subscription: PushSubscription): Promise<Response> {
  if (!subscriptionSync) {
    subscriptionSync = fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    }).finally(() => {
      subscriptionSync = null
    })
  }
  return subscriptionSync
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

  const response = await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  if (!response.ok) throw new Error('Falha ao remover subscription')

  await subscription.unsubscribe()
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

      const response = await syncSubscription(sub)
      setState(response.ok ? 'subscribed' : (Notification.permission as PushState))
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
      await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission as PushState)
        return
      }
      // Aguarda o SW ficar ATIVO — subscribe() falha com "no active Service
      // Worker" se chamado logo após register() (o SW ainda está instalando).
      const reg = await navigator.serviceWorker.ready
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente')

      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as any,
        }))

      const res = await syncSubscription(sub)
      if (!res.ok) throw new Error('Falha ao salvar subscription')
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
