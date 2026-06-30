'use client'

import { useCallback, useEffect, useState } from 'react'

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

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  useEffect(() => {
    if (!supported) {
      setState('unsupported')
      return
    }
    let cancelled = false
    ;(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (cancelled) return
      if (sub) setState('subscribed')
      else setState(Notification.permission as PushState)
    })()
    return () => {
      cancelled = true
    }
  }, [supported])

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

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error('Falha ao salvar subscription')
      setState('subscribed')
    } finally {
      setBusy(false)
    }
  }, [supported])

  const disable = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState(Notification.permission as PushState)
    } finally {
      setBusy(false)
    }
  }, [supported])

  return { state, busy, supported, enable, disable }
}
