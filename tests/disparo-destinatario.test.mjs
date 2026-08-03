import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
      resolvedPath = `${resolvedPath}.ts`
    }
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const {
  interpretarVerificacaoDestinatarioEvolution,
  interpretarVerificacoesDestinatariosEvolution,
} = await import('../lib/disparo-processor.ts')

function source(file) {
  return fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')
}

test('só libera o destinatário Evolution quando o provedor confirma que ele existe', () => {
  const resultado = interpretarVerificacaoDestinatarioEvolution(
    { numbers: [{ number: '5511888888888', exists: true }] },
    '5511888888888',
  )

  assert.deepEqual(resultado, { status: 'available', telefone: '5511888888888' })
})

test('bloqueia destinatário que não existe no WhatsApp sem fornecer telefone canônico', () => {
  const resultado = interpretarVerificacaoDestinatarioEvolution(
    { numbers: [{ number: '5511888888888', exists: false }] },
    '5511888888888',
  )

  assert.deepEqual(resultado, { status: 'not_registered', telefone: null })
})

test('falha fechado quando a Evolution retorna um payload incompleto', () => {
  const resultado = interpretarVerificacaoDestinatarioEvolution(
    { numbers: [{}] },
    '5511888888888',
  )

  assert.deepEqual(resultado, { status: 'unavailable', telefone: null })
})

test('nunca desloca uma confirmação Evolution para outro destinatário do lote', () => {
  const [primeiro, inexistente, terceiro] = interpretarVerificacoesDestinatariosEvolution(
    {
      numbers: [
        { number: '5511888888888', exists: true },
        { number: '5511777777777', exists: true },
      ],
    },
    ['5511888888888', '5511999999999', '5511777777777'],
  )

  assert.deepEqual(primeiro, { status: 'available', telefone: '5511888888888' })
  assert.deepEqual(inexistente, { status: 'unavailable', telefone: null })
  assert.deepEqual(terceiro, { status: 'available', telefone: '5511777777777' })
})

test('as rotas de disparo verificam o destinatário antes de criar um ticket', () => {
  const lote = source('lib/disparo-processor.ts')
  const evolution = source('app/api/evolution/dispatch/route.ts')
  const externo = source('app/api/tickets/disparo-externo/route.ts')
  const oficial = source('app/api/whatsapp/dispatch/route.ts')

  assert.match(lote, /verificarDestinatariosEvolution\(\s*creds,\s*destinatarios\.map/)
  assert.match(evolution, /RECIPIENT_NOT_ON_WHATSAPP/)
  assert.match(externo, /RECIPIENT_NOT_ON_WHATSAPP/)
  assert.match(externo, /RECIPIENT_NOT_CONFIRMED/)
  assert.match(oficial, /getWhatsAppProviderAcceptance/)
  assert.match(oficial, /RECIPIENT_NOT_CONFIRMED/)
  assert.match(oficial, /registrarFalhaDeDisparo/)

  assert.ok(
    lote.indexOf('const verificacoes = await verificarDestinatariosEvolution')
      < lote.indexOf(".from('tickets')"),
  )
  assert.ok(
    evolution.indexOf('const verificacao = await verificarDestinatarioEvolution')
      < evolution.indexOf(".from('tickets')"),
  )
  assert.ok(
    externo.indexOf('const evolutionResponse = await fetch')
      < externo.lastIndexOf('criarEDistribuirTicket('),
  )
  assert.ok(
    externo.indexOf('let whatsappResponse = await fetch')
      < externo.lastIndexOf('criarEDistribuirTicket('),
  )
  assert.ok(
    oficial.lastIndexOf('getWhatsAppProviderAcceptance(')
      < oficial.indexOf(".from('tickets')"),
  )
})
