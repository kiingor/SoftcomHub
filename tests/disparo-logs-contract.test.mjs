import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function source(path) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
}

const logWriters = [
  'app/api/whatsapp/dispatch/route.ts',
  'app/api/evolution/dispatch/route.ts',
  'app/api/tickets/disparo-externo/route.ts',
  'lib/disparo-processor.ts',
]

test('logs de disparo gravam as colunas reais do contrato', () => {
  for (const path of logWriters) {
    const file = source(path)
    assert.match(file, /colaborador_nome:/, path)
    assert.match(file, /template_name:/, path)
    assert.doesNotMatch(file, /template_usado:/, path)
  }
})

test('as leituras de disparo usam criado_em e a tela mostra os mesmos campos', () => {
  for (const path of [
    'app/api/whatsapp/dispatch/route.ts',
    'app/api/whatsapp/dispatch/count/route.ts',
    'app/api/setores/[id]/disparos/route.ts',
    'components/disparo-logs-section.tsx',
  ]) {
    const file = source(path)
    assert.match(file, /.gte\('criado_em'/, path)
  }

  const component = source('components/disparo-logs-section.tsx')
  assert.match(component, /.order\('criado_em'/)
  assert.match(component, /log\.criado_em/)
  assert.match(component, /log\.template_name/)
})

test('o dashboard usa o fluxo validado do servidor para transferir tickets', () => {
  const dashboard = source('app/dashboard/tickets/page.tsx')

  assert.match(dashboard, /from\('colaboradores_setores'\)/)
  assert.match(dashboard, /isTransferTargetAvailable/)
  assert.match(dashboard, /fetch\('\/api\/tickets\/transferir'/)
  assert.doesNotMatch(dashboard, /contains\('setor_ids'/)
  assert.match(dashboard, /\.order\('criado_em'/)
})
