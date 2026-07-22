import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getGlobalDispatcher,
  MockAgent,
  setGlobalDispatcher,
} from 'undici'
import { lookupSoftcomClientByCnpj } from '../lib/softcom-client.ts'

const CNPJ = '12345678000190'
const WEBHOOK_ORIGIN = 'https://getclient.test'
const WEBHOOK_PATH = '/webhook/getcliente'

async function withWebhookMock(configure, run, apiKey) {
  const originalDispatcher = getGlobalDispatcher()
  const originalApiKey = process.env.SOFTCOM_API_KEY
  const originalWebhookUrl = process.env.GETCLIENT_WEBHOOK_URL
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  const pool = mockAgent.get(WEBHOOK_ORIGIN)

  if (apiKey) process.env.SOFTCOM_API_KEY = apiKey
  else delete process.env.SOFTCOM_API_KEY
  process.env.GETCLIENT_WEBHOOK_URL = `${WEBHOOK_ORIGIN}${WEBHOOK_PATH}`
  configure(pool)
  setGlobalDispatcher(mockAgent)

  try {
    await run()
  } finally {
    setGlobalDispatcher(originalDispatcher)
    await mockAgent.close()

    if (originalApiKey === undefined) delete process.env.SOFTCOM_API_KEY
    else process.env.SOFTCOM_API_KEY = originalApiKey

    if (originalWebhookUrl === undefined) delete process.env.GETCLIENT_WEBHOOK_URL
    else process.env.GETCLIENT_WEBHOOK_URL = originalWebhookUrl
  }
}

function interceptWebhook(pool, replyStatus, replyBody) {
  pool.intercept({
    path: WEBHOOK_PATH,
    method: 'GET',
    body: JSON.stringify([{ cnpj: CNPJ }]),
  }).reply(replyStatus, replyBody)
}

test('uses the legacy getcliente webhook when the API key is absent', async () => {
  await withWebhookMock(
    (pool) => interceptWebhook(pool, 200, {
      id: '12345',
      nome_cliente: 'Cliente Teste',
      Cliente_Prime: 'N',
      cnpj: CNPJ,
    }),
    async () => {
      const cliente = await lookupSoftcomClientByCnpj(CNPJ)
      assert.deepEqual(cliente, {
        nome: 'Cliente Teste',
        CNPJ,
        Registro: '12345',
        PDV: null,
        telefone: null,
      })
    },
  )
})

test('returns null when the getcliente webhook reports no client', async () => {
  await withWebhookMock(
    (pool) => interceptWebhook(pool, 200, { message: 'CNPJ Não Encontrado' }),
    async () => {
      assert.equal(await lookupSoftcomClientByCnpj(CNPJ), null)
    },
  )
})

test('falls back to getcliente when Softcom Cloud is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 503 })

  try {
    await withWebhookMock(
      (pool) => interceptWebhook(pool, 200, {
        id: '12345',
        nome_cliente: 'Cliente Fallback',
        cnpj: CNPJ,
      }),
      async () => {
        const cliente = await lookupSoftcomClientByCnpj(CNPJ)
        assert.equal(cliente?.nome, 'Cliente Fallback')
      },
      'test-api-key',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('does not call getcliente when Softcom Cloud finds the client', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), new RegExp(`cnpj=${CNPJ}`))
    assert.equal(init?.headers?.['x-api-key'], 'test-api-key')
    return new Response(JSON.stringify({
      items: [{
        id: 12345,
        nome: 'Cliente Cloud',
        cnpj: CNPJ,
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await withWebhookMock(
      () => {},
      async () => {
        const cliente = await lookupSoftcomClientByCnpj(CNPJ)
        assert.equal(cliente?.nome, 'Cliente Cloud')
      },
      'test-api-key',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects a getcliente response for a different CNPJ', async () => {
  await withWebhookMock(
    (pool) => interceptWebhook(pool, 200, {
      id: '12345',
      nome_cliente: 'Outro Cliente',
      cnpj: '99999999000199',
    }),
    async () => {
      assert.equal(await lookupSoftcomClientByCnpj(CNPJ), null)
    },
  )
})

test('propagates getcliente webhook failures', async () => {
  await withWebhookMock(
    (pool) => interceptWebhook(pool, 503, { error: 'temporarily unavailable' }),
    async () => {
      await assert.rejects(
        lookupSoftcomClientByCnpj(CNPJ),
        /Webhook getcliente respondeu 503/,
      )
    },
  )
})

test('rejects oversized getcliente responses', async () => {
  await withWebhookMock(
    (pool) => interceptWebhook(pool, 200, {
      id: '12345',
      nome_cliente: 'x'.repeat(300 * 1024),
      cnpj: CNPJ,
    }),
    async () => {
      await assert.rejects(
        lookupSoftcomClientByCnpj(CNPJ),
        /Resposta externa excedeu o limite permitido/,
      )
    },
  )
})
