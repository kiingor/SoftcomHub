import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  describeUnexpectedError,
  redactSensitiveText,
  sanitizeDatabaseError,
  sanitizeEvolutionProviderError,
  sanitizeWhatsAppProviderError,
} from '../lib/provider-error.ts'

test('keeps the WhatsApp availability signal without exposing the phone number', () => {
  const details = sanitizeEvolutionProviderError({
    error: 'Bad Request',
    response: {
      message: [{ exists: false, number: '5511999999999' }],
    },
  }, 400)

  assert.deepEqual(details, {
    status: 400,
    response: {
      message: [{ exists: false }],
    },
  })
})

test('redacts credentials and phone numbers from provider messages', () => {
  const details = sanitizeEvolutionProviderError({
    message: 'token=super-secret API key: abc123 para +55 11 99999-9999',
  }, 400)

  assert.equal(details.status, 400)
  assert.match(details.message ?? '', /token=\[oculto\]/i)
  assert.match(details.message ?? '', /API key=\[oculto\]/i)
  assert.match(details.message ?? '', /\[número ocultado\]/)
  assert.doesNotMatch(details.message ?? '', /super-secret|abc123|99999/)
})

test('prefers a useful provider error over a generic Bad Request message', () => {
  const details = sanitizeEvolutionProviderError({
    message: 'Bad Request',
    error: 'Invalid message content',
  }, 400)

  assert.equal(details.message, 'Invalid message content')
})

// Allowlist: um campo novo do provedor não pode vazar só por ninguém ter
// lembrado de removê-lo.
test('drops every provider field outside the allowlist', () => {
  const details = sanitizeEvolutionProviderError({
    status: 401,
    error: 'Unauthorized',
    apikey: 'fake-evolution-apikey',
    headers: { apikey: 'fake-evolution-apikey', authorization: 'Bearer abc.def' },
    number: '5511999999999',
    request: {
      url: 'https://whatsapi.example.com/message/sendText/inst-01',
      body: { number: '5511999999999', text: 'conteúdo da conversa do cliente' },
    },
    response: {
      message: [{ exists: false, number: '5511999999999', jid: '5511999999999@s.whatsapp.net' }],
    },
  }, 401)

  assert.deepEqual(details, {
    status: 401,
    message: 'Unauthorized',
    response: { message: [{ exists: false }] },
  })
  assert.doesNotMatch(
    JSON.stringify(details),
    /fake-evolution-apikey|5511999999999|whatsapi|conteúdo da conversa/,
  )
})

test('hides the provider URL, with or without the scheme', () => {
  const comEsquema = sanitizeEvolutionProviderError({
    message: 'Falha ao contatar https://whatsapi.example.com/message/sendText/inst-01',
  }, 502)
  const semEsquema = sanitizeEvolutionProviderError({
    message: 'timeout em whatsapi.example.com/instance/connectionState/inst-01',
  }, 504)

  assert.match(comEsquema.message ?? '', /\[url ocultada\]/)
  assert.match(semEsquema.message ?? '', /\[url ocultada\]/)
  assert.doesNotMatch(comEsquema.message ?? '', /whatsapi|https|inst-01/)
  assert.doesNotMatch(semEsquema.message ?? '', /whatsapi|inst-01/)
})

test('hides the WhatsApp JID, which carries the phone number', () => {
  const details = sanitizeEvolutionProviderError({
    message: 'The number 5511999999999@s.whatsapp.net is not registered',
  }, 400)

  assert.match(details.message ?? '', /\[contato ocultado\]/)
  assert.doesNotMatch(details.message ?? '', /5511999999999|whatsapp\.net/)
})

test('hides credentials echoed back in JSON or header form', () => {
  const details = sanitizeEvolutionProviderError({
    message: '{"headers":{"apikey":"fake-evolution-apikey","Authorization":"Bearer abc.def"}}',
  }, 401)

  assert.match(details.message ?? '', /apikey=\[oculto\]/i)
  assert.doesNotMatch(details.message ?? '', /fake-evolution-apikey|abc\.def/)
})

test('redacts compound keys, quoted secrets and Basic authorization values', () => {
  const redacted = redactSensitiveText([
    'whatsapp_token=fake-token-value',
    'client_secret=fake-client-secret',
    'service_role_key=fake-service-role-key',
    'password="secret with spaces"',
    '{"authorization":"Basic dGVzdDp0ZXN0"}',
    'invalid apikey fake-evolution-key',
  ].join('; '))

  assert.doesNotMatch(
    redacted,
    /fake-token-value|fake-client-secret|fake-service-role-key|secret with spaces|dGVzdDp0ZXN0|fake-evolution-key/,
  )
  assert.match(redacted, /whatsapp_token=\[oculto\]/i)
  assert.match(redacted, /client_secret=\[oculto\]/i)
  assert.match(redacted, /service_role_key=\[oculto\]/i)
  assert.match(redacted, /password=\[oculto\]/i)
  assert.match(redacted, /authorization=\[oculto\]/i)
  assert.match(redacted, /apikey=\[oculto\]/i)
})

test('hides a bare JWT with no keyword announcing it', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    + '.eyJzdWIiOiIxMjM0NTY3ODkwIn0'
    + '.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
  const details = sanitizeEvolutionProviderError({ message: `invalid ${jwt}` }, 401)

  assert.match(details.message ?? '', /\[token oculto\]/)
  assert.doesNotMatch(details.message ?? '', /eyJ/)
})

test('caps the provider message so it cannot become a payload dump', () => {
  const details = sanitizeEvolutionProviderError({ message: 'a'.repeat(900) }, 400)

  assert.equal(details.message?.length, 500)
})

test('returns only the status when the provider answers with a non-object', () => {
  assert.deepEqual(sanitizeEvolutionProviderError('Internal Server Error', 500), { status: 500 })
  assert.deepEqual(sanitizeEvolutionProviderError(null, 500), { status: 500 })
  assert.deepEqual(sanitizeEvolutionProviderError([{ message: 'boom' }], 500), { status: 500 })
})

// A redação também alimenta `erro_envio`, que o WorkDesk exibe — a mensagem
// precisa continuar dizendo ao atendente o que aconteceu.
test('leaves the operational failure messages readable', () => {
  for (const texto of [
    'Erro ao enviar mensagem via EvolutionAPI',
    'Dispositivo offline. A instância não está conectada ao WhatsApp.',
    'A instância informada não pertence ao setor atual do ticket',
    'A URL do arquivo não é permitida para envio',
    'O ticket mudou de setor durante o envio',
  ]) {
    assert.equal(redactSensitiveText(texto), texto)
  }
})

test('keeps the Meta error code while hiding the phone it echoes back', () => {
  const details = sanitizeWhatsAppProviderError({
    error: {
      message: '(#131030) Recipient phone number not in allowed list: 5511999999999',
      type: 'OAuthException',
      code: 131030,
      fbtrace_id: 'AbCdEfGhIjK',
      error_data: { details: 'Add 5511999999999 to the allowed list' },
    },
  }, 400)

  assert.equal(details.status, 400)
  assert.equal(details.error?.code, 131030)
  assert.equal(details.error?.type, 'OAuthException')
  assert.equal(details.error?.fbtrace_id, 'AbCdEfGhIjK')
  assert.match(details.error?.message ?? '', /\[número ocultado\]/)
  // `error_data` é onde a Meta repete o destinatário — fica fora da allowlist.
  assert.doesNotMatch(JSON.stringify(details), /5511999999999|error_data/)
})

test('returns only the status when Meta answers without an error object', () => {
  assert.deepEqual(sanitizeWhatsAppProviderError({}, 500), { status: 500 })
  assert.deepEqual(sanitizeWhatsAppProviderError(null, 502), { status: 502 })
})

test('drops the PostgREST detail that repeats the rejected row', () => {
  const details = sanitizeDatabaseError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "clientes_telefone_key"',
    details: 'Key (telefone)=(5511999999999) already exists.',
    hint: null,
  })

  assert.deepEqual(details, {
    code: '23505',
    message: 'duplicate key value violates unique constraint "clientes_telefone_key"',
  })
})

test('never returns an empty database failure', () => {
  assert.deepEqual(sanitizeDatabaseError(null), { message: 'Erro não identificado na persistência' })
  assert.deepEqual(sanitizeDatabaseError('boom'), { message: 'Erro não identificado na persistência' })
})

test('describes an unexpected error by class, without the URL it carries', () => {
  const erro = new TypeError('fetch failed para https://whatsapi.example.com/message/sendText/inst-01')

  assert.equal(describeUnexpectedError(erro, 'reserva'), 'TypeError: fetch failed para [url ocultada]')
  assert.equal(describeUnexpectedError('não é um Error', 'reserva'), 'reserva')
})

const lerRota = (caminho) => [
  caminho,
  readFileSync(fileURLToPath(new URL(`../${caminho}`, import.meta.url)), 'utf8'),
]

// As três rotas que falam com um provedor de mensageria.
const ROTAS_DE_ENVIO = [
  lerRota('app/api/evolution/send/route.ts'),
  lerRota('app/api/evolution/dispatch/route.ts'),
  lerRota('app/api/whatsapp/dispatch/route.ts'),
  lerRota('app/api/tickets/disparo-externo/route.ts'),
]

test('no send route hands the raw provider payload to a response or a log', () => {
  // O payload bruto traz `key.remoteJid` (o telefone do cliente) e o eco da
  // mensagem enviada. Só o que passou por um sanitizador pode sair da rota.
  for (const [nome, fonte] of ROTAS_DE_ENVIO) {
    for (const bruto of ['evolutionData', 'whatsappData']) {
      assert.doesNotMatch(fonte, new RegExp(`^\\s*${bruto},\\s*$`, 'm'), nome)
      assert.doesNotMatch(fonte, new RegExp(`:\\s*${bruto}\\b`), nome)
      assert.doesNotMatch(
        fonte,
        new RegExp(`console\\.(?:log|warn|error|info|debug)\\([^)]*${bruto}`),
        nome,
      )
    }
  }
})

test('every `details` returned by a send route comes from a sanitizer', () => {
  const sanitizados = new Set(['failure', 'providerDetails'])
  for (const [nome, fonte] of ROTAS_DE_ENVIO) {
    for (const [, valor] of fonte.matchAll(/\bdetails:\s*([A-Za-z0-9_.?]+)/g)) {
      assert.ok(sanitizados.has(valor), `${nome} devolve details: ${valor}, que não é sanitizado`)
    }
  }
})

test('no send route logs a raw PostgREST error', () => {
  for (const [nome, fonte] of ROTAS_DE_ENVIO) {
    assert.doesNotMatch(fonte, /JSON\.stringify\(\w*[Ee]rror\)/, nome)
  }
})

test('no send route prints the client phone when the provider canonicalizes it', () => {
  for (const [nome, fonte] of ROTAS_DE_ENVIO) {
    assert.doesNotMatch(
      fonte,
      /console\.log\([^)]*\$\{(?:formattedPhone|canonicalPhone|waId|remoteJid|clientePhone)\}/,
      nome,
    )
  }
})

test('the send route redacts what it persists into erro_envio', () => {
  const [, fonte] = ROTAS_DE_ENVIO[0]
  assert.match(fonte, /error:\s*redactSensitiveText\(/)
})
