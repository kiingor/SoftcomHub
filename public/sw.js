/* Service Worker — Web Push (instância desconectada + nova mensagem) */

// Garante que uma versão nova do SW assuma rápido (sem precisar fechar todas as abas).
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }

  const title = data.title || 'SoftcomHub'
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    // Alertas de instância exigem ação (ficam fixos); mensagens somem sozinhas.
    requireInteraction: data.type === 'instancia',
    icon: '/workdesk-icon-192.png',
    badge: '/workdesk-icon-192.png',
    data: { url: data.url || '/dashboard' },
  }

  event.waitUntil(
    (async () => {
      // Notificação de mensagem: se o atendente já está com o WorkDesk em foco,
      // não notifica — ele já vê a mensagem chegar no chat (evita spam).
      if (data.type === 'mensagem') {
        const clientsList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        const workdeskFocado = clientsList.some(
          (c) => c.focused && typeof c.url === 'string' && c.url.includes('/workdesk'),
        )
        if (workdeskFocado) return
      }
      await self.registration.showNotification(title, options)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
      }),
  )
})
