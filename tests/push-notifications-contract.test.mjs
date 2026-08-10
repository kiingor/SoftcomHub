import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function source(path) {
  return readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
}

test('a ativação busca a chave VAPID no servidor e preserva o gesto do clique', () => {
  const hook = source('lib/use-push-notifications.ts')

  assert.match(hook, /fetch\('\/api\/push\/config'/)
  assert.ok(
    hook.indexOf('Notification.requestPermission()') < hook.indexOf("navigator.serviceWorker.register('/sw.js')"),
  )

  const configRoute = source('app/api/push/config/route.ts')
  assert.match(configRoute, /auth\.auth\.getUser\(\)/)
  assert.match(configRoute, /process\.env\.VAPID_PUBLIC_KEY/)
  assert.match(configRoute, /process\.env\.VAPID_PRIVATE_KEY/)
})

test('o clique do Web Push aguarda a navegação e o Dashboard mostra os avisos internos', () => {
  const serviceWorker = source('public/sw.js')
  assert.match(serviceWorker, /return client\.navigate\(url\)\.then/)

  const dashboardHeader = source('components/dashboard/dashboard-header.tsx')
  assert.match(dashboardHeader, /<NotificacoesPanel/)

  const notificationsPanel = source('components/workdesk/notificacoes-panel.tsx')
  assert.match(notificationsPanel, /ticket_id\?: string \| null/)
  assert.match(notificationsPanel, /router\.push\(target\)/)
})

test('a notification without a target opens a dialog with its full message', () => {
  const notificationsPanel = source('components/workdesk/notificacoes-panel.tsx')

  assert.match(notificationsPanel, /if \(!target\) \{\s*openNotificationDetails\(notificacao\)/)
  assert.match(notificationsPanel, /openNotificationDetails\(newNotificationData\)/)
  assert.match(notificationsPanel, /<DialogContent className="[^"]*sm:max-w-md[^"]*">/)
  assert.match(notificationsPanel, /whitespace-pre-wrap break-words/)
})
