import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  getWhatsAppProviderAcceptance,
  mapWhatsAppProviderError,
} from '../lib/whatsapp-provider-error.ts'

test('requires a Meta message id for provider acceptance', () => {
  const result = getWhatsAppProviderAcceptance({
    contacts: [{ wa_id: '5511000000000' }],
  })

  assert.deepEqual(result, {
    messageId: null,
    hasValidatedRecipient: false,
  })
})

test('keeps a validated wa_id as a boolean signal only', () => {
  const result = getWhatsAppProviderAcceptance({
    contacts: [{ wa_id: '5511000000000' }],
    messages: [{ id: 'wamid.accepted-message' }],
  })

  assert.deepEqual(result, {
    messageId: 'wamid.accepted-message',
    hasValidatedRecipient: true,
  })
  assert.doesNotMatch(JSON.stringify(result), /5511000000000/)
})

test('does not treat an invalid wa_id as a resolved recipient', () => {
  const result = getWhatsAppProviderAcceptance({
    contacts: [{ wa_id: 'invalid-recipient-reference' }],
    messages: [{ id: 'wamid.accepted-message' }],
  })

  assert.equal(result.messageId, 'wamid.accepted-message')
  assert.equal(result.hasValidatedRecipient, false)
})

test('maps known Meta recipient, window, content and channel failures', () => {
  assert.deepEqual(
    mapWhatsAppProviderError({ error: { code: 131026 } }, 400),
    {
      code: 'WHATSAPP_RECIPIENT_UNAVAILABLE',
      error: 'O destinatario esta indisponivel para receber mensagens neste canal.',
      status: 400,
    },
  )
  assert.deepEqual(
    mapWhatsAppProviderError({ error: { code: 131047 } }, 400),
    {
      code: 'WHATSAPP_24H_WINDOW_EXPIRED',
      error: 'A janela de 24 horas expirou. Envie um template aprovado para retomar o contato.',
      status: 400,
    },
  )
  assert.deepEqual(
    mapWhatsAppProviderError({ error: { code: 131051 } }, 400),
    {
      code: 'WHATSAPP_CONTENT_INVALID',
      error: 'O conteudo da mensagem nao e aceito pelo WhatsApp Oficial.',
      status: 400,
    },
  )
  assert.deepEqual(
    mapWhatsAppProviderError({ error: { code: 190 } }, 401),
    {
      code: 'WHATSAPP_TOKEN_INVALID',
      error: 'O token do WhatsApp Oficial esta invalido ou expirado.',
      status: 401,
    },
  )
  assert.deepEqual(
    mapWhatsAppProviderError(null, 403),
    {
      code: 'WHATSAPP_CHANNEL_UNAUTHORIZED',
      error: 'O canal Oficial nao tem permissao para enviar mensagens.',
      status: 403,
    },
  )
  assert.deepEqual(
    mapWhatsAppProviderError({ error: { code: 133010 } }, 400),
    {
      code: 'WHATSAPP_CHANNEL_UNAVAILABLE',
      error: 'O canal Oficial esta indisponivel ou nao esta configurado na Meta.',
      status: 400,
    },
  )
})

test('classifies a generic invalid-parameter recipient error without exposing it', () => {
  const failure = mapWhatsAppProviderError({
    error: {
      code: 100,
      message: 'Invalid recipient phone number: 5511000000000 https://provider.example/token',
    },
  }, 400)

  assert.deepEqual(failure, {
    code: 'WHATSAPP_RECIPIENT_INVALID',
    error: 'O numero do destinatario e invalido para o WhatsApp Oficial.',
    status: 400,
  })
  assert.doesNotMatch(JSON.stringify(failure), /5511000000000|provider\.example|token/)
})

test('the send route reports acceptance separately from delivery and never logs raw provider data', () => {
  const route = readFileSync(
    fileURLToPath(new URL('../app/api/whatsapp/send/route.ts', import.meta.url)),
    'utf8',
  )

  assert.match(route, /mapWhatsAppProviderError/)
  assert.match(route, /getWhatsAppProviderAcceptance/)
  assert.match(route, /providerAccepted:\s*true/)
  assert.match(route, /deliveryConfirmed:\s*false/)
  assert.doesNotMatch(route, /console\.(?:log|warn|error|info|debug)\([^)]*whatsappData/)
  assert.doesNotMatch(route, /details:\s*whatsappData/)
  assert.doesNotMatch(route, /whatsappData\.contacts/)
  assert.doesNotMatch(route, /error:\s*(?:result|completion)\.error/)
  assert.doesNotMatch(route, /error:\s*error instanceof Error \? error\.message/)
})
