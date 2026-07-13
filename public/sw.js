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

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = (event.notification.data && event.notification.data.url) || '/dashboard'
  let url = `${self.location.origin}/dashboard`
  try {
    const targetUrl = new URL(requestedUrl, self.location.origin)
    if (targetUrl.origin === self.location.origin) url = targetUrl.href
  } catch {
    // Mantém o fallback interno para payloads inválidos.
  }

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
