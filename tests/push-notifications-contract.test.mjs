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
  assert.match(configRoute, /getVapidConfiguration/)
})

test('a configuração valida as chaves VAPID e renova inscrições antigas', () => {
  const push = source('lib/push.ts')
  const hook = source('lib/use-push-notifications.ts')

  assert.match(push, /createECDH\('prime256v1'\)/)
  assert.match(push, /As chaves VAPID não correspondem/)
  assert.match(push, /Falha ao entregar notificações/)
  assert.match(hook, /subscriptionUsesVapidPublicKey/)
  assert.match(hook, /getOrReplaceSubscription/)
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

test('the WorkDesk exposes browser push activation to its attendant', () => {
  const workdeskLayout = source('app/workdesk/layout.tsx')
  const pushToggle = source('components/push-toggle.tsx')

  assert.match(workdeskLayout, /<PushToggle\s*\/>/)
  assert.match(pushToggle, /bg-amber-500/)
})

test('new client messages also notify active administrators and supervisors', () => {
  const notifier = source('lib/notify-mensagem.ts')
  const webhook = source('app/api/whatsapp/webhook/route.ts')
  const widget = source('app/api/widget/messages/route.ts')

  assert.match(notifier, /getActiveManagementIdsForSetor/)
  assert.match(notifier, /from\('colaboradores_setores'\)/)
  assert.match(notifier, /can_see_all_tickets', true/)
  assert.match(notifier, /eq\('is_master', true\)/)
  assert.match(notifier, /getActiveManagementIdsForSetor\(service, ticket\.setor_id\)/)
  assert.match(notifier, /sendPushToColaboradores\(service, \[\.\.\.recipientIds\]/)
  assert.match(webhook, /await notifyAtendenteNovaMensagem\(/)
  assert.match(widget, /await notifyAtendenteNovaMensagem\(/)
})
