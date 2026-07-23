import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SEND_CLAIM_STALE_MS,
  claimPersistedMessageSend,
  completePersistedMessageSend,
  persistAcceptedLegacyMessage,
  reconcilePendingMessageSend,
} from '../lib/message-send-claim.ts'

function createMessageStore(initialRows) {
  const rows = new Map(initialRows.map((row) => [row.id, { ...row }]))

  function matches(row, filters) {
    return filters.every((filter) => {
      if (filter.type === 'eq') return row[filter.column] === filter.value
      if (filter.type === 'in') return filter.values.includes(row[filter.column])
      if (filter.type === 'lt') {
        return String(row[filter.column] || '') < String(filter.value)
      }
      if (filter.type === 'gte') {
        return String(row[filter.column] || '') >= String(filter.value)
      }
      return false
    })
  }

  return {
    rows,
    from(table) {
      assert.equal(table, 'mensagens')
      const filters = []
      let update = null
      const query = {
        select() {
          return query
        },
        update(values) {
          update = values
          return query
        },
        eq(column, value) {
          filters.push({ type: 'eq', column, value })
          return query
        },
        in(column, values) {
          filters.push({ type: 'in', column, values })
          return query
        },
        is(column, value) {
          filters.push({ type: 'eq', column, value })
          return query
        },
        lt(column, value) {
          filters.push({ type: 'lt', column, value })
          return query
        },
        gte(column, value) {
          filters.push({ type: 'gte', column, value })
          return query
        },
        async maybeSingle() {
          const row = [...rows.values()].find((candidate) => matches(candidate, filters))
          if (!row) return { data: null, error: null }
          if (update) Object.assign(row, update)
          return { data: { ...row }, error: null }
        },
      }
      return query
    },
  }
}

function pendingMessage(overrides = {}) {
  return {
    id: 'message-1',
    ticket_id: 'ticket-1',
    remetente: 'colaborador',
    status_envio: 'pendente',
    whatsapp_message_id: null,
    envio_tentativa_id: null,
    envio_tentativa_em: null,
    enviado_em: new Date().toISOString(),
    ...overrides,
  }
}

test('claims a new persisted message exactly once', async () => {
  const store = createMessageStore([pendingMessage()])

  const [first, second] = await Promise.all([
    claimPersistedMessageSend(store, 'ticket-1', 'message-1'),
    claimPersistedMessageSend(store, 'ticket-1', 'message-1'),
  ])

  const results = [first, second]
  assert.equal(results.filter((result) => result.ok && result.kind === 'claimed').length, 1)
  assert.equal(
    results.filter((result) => !result.ok && result.code === 'MESSAGE_SEND_IN_PROGRESS').length,
    1,
  )
  assert.equal(store.rows.get('message-1').status_envio, 'enviando')
})

test('claims a recent legacy null-status message exactly once', async () => {
  const store = createMessageStore([
    pendingMessage({ status_envio: null }),
  ])

  const [first, second] = await Promise.all([
    claimPersistedMessageSend(store, 'ticket-1', 'message-1'),
    claimPersistedMessageSend(store, 'ticket-1', 'message-1'),
  ])

  const results = [first, second]
  assert.equal(results.filter((result) => result.ok && result.kind === 'claimed').length, 1)
  assert.equal(
    results.filter((result) => !result.ok && result.code === 'MESSAGE_SEND_IN_PROGRESS').length,
    1,
  )
  assert.equal(store.rows.get('message-1').status_envio, 'enviando')
  assert.equal(typeof store.rows.get('message-1').envio_tentativa_id, 'string')
})

test('rejects a legacy null-status message outside the compatibility window', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: null,
      enviado_em: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    }),
  ])

  const initialClaim = await claimPersistedMessageSend(
    store,
    'ticket-1',
    'message-1',
  )
  const retryClaim = await claimPersistedMessageSend(
    store,
    'ticket-1',
    'message-1',
    true,
  )

  assert.equal(initialClaim.ok, false)
  assert.equal(initialClaim.code, 'MESSAGE_NOT_RETRYABLE')
  assert.equal(retryClaim.ok, false)
  assert.equal(retryClaim.code, 'MESSAGE_NOT_RETRYABLE')
  assert.equal(store.rows.get('message-1').status_envio, null)
  assert.equal(store.rows.get('message-1').envio_tentativa_id, null)
})

test('does not treat a recent null-status message as an explicit retry', async () => {
  const store = createMessageStore([
    pendingMessage({ status_envio: null }),
  ])

  const result = await claimPersistedMessageSend(
    store,
    'ticket-1',
    'message-1',
    true,
  )

  assert.equal(result.ok, false)
  assert.equal(result.code, 'MESSAGE_NOT_RETRYABLE')
  assert.equal(store.rows.get('message-1').status_envio, null)
})

test('only retry:true can claim failed or indeterminate messages', async () => {
  const failedStore = createMessageStore([
    pendingMessage({ status_envio: 'falhou' }),
  ])

  const implicitRetry = await claimPersistedMessageSend(
    failedStore,
    'ticket-1',
    'message-1',
  )
  const explicitRetry = await claimPersistedMessageSend(
    failedStore,
    'ticket-1',
    'message-1',
    true,
  )

  assert.equal(implicitRetry.ok, false)
  assert.equal(implicitRetry.code, 'MESSAGE_NOT_RETRYABLE')
  assert.equal(explicitRetry.ok, true)
  assert.equal(explicitRetry.kind, 'claimed')
})

test('rejects cross-ticket and non-collaborator message ids', async () => {
  const crossTicketStore = createMessageStore([pendingMessage()])
  const clientStore = createMessageStore([
    pendingMessage({ remetente: 'cliente' }),
  ])

  const crossTicket = await claimPersistedMessageSend(
    crossTicketStore,
    'ticket-2',
    'message-1',
  )
  const clientMessage = await claimPersistedMessageSend(
    clientStore,
    'ticket-1',
    'message-1',
  )

  assert.equal(crossTicket.ok, false)
  assert.equal(crossTicket.code, 'MESSAGE_NOT_FOUND')
  assert.equal(clientMessage.ok, false)
  assert.equal(clientMessage.code, 'MESSAGE_NOT_FOUND')
  assert.equal(crossTicketStore.rows.get('message-1').status_envio, 'pendente')
  assert.equal(clientStore.rows.get('message-1').status_envio, 'pendente')
})

test('returns an idempotent success for an already sent message', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: 'enviado',
      whatsapp_message_id: 'provider-123',
    }),
  ])

  const result = await claimPersistedMessageSend(store, 'ticket-1', 'message-1')

  assert.deepEqual(result, {
    ok: true,
    kind: 'already_sent',
    providerMessageId: 'provider-123',
    status_envio: 'enviado',
  })
})

test('provider id wins over a stale pending status after schema fallback', async () => {
  const store = createMessageStore([
    pendingMessage({ whatsapp_message_id: 'provider-from-legacy-send' }),
  ])

  const result = await claimPersistedMessageSend(store, 'ticket-1', 'message-1')

  assert.deepEqual(result, {
    ok: true,
    kind: 'already_sent',
    providerMessageId: 'provider-from-legacy-send',
    status_envio: 'enviado',
  })
  assert.equal(store.rows.get('message-1').status_envio, 'enviado')
})

test('reconcile normalizes a provider-accepted pending message to sent', async () => {
  const store = createMessageStore([
    pendingMessage({ whatsapp_message_id: 'provider-from-cache-stale-send' }),
  ])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    status_envio: 'enviado',
  })
  assert.equal(store.rows.get('message-1').status_envio, 'enviado')
})

test('only the matching attempt can complete a claimed send', async () => {
  const store = createMessageStore([pendingMessage()])
  const claim = await claimPersistedMessageSend(store, 'ticket-1', 'message-1')
  assert.equal(claim.ok, true)
  assert.equal(claim.kind, 'claimed')

  const stale = await completePersistedMessageSend(
    store,
    { ...claim.attempt, attemptId: 'another-attempt' },
    { status: 'enviado', providerMessageId: 'provider-1' },
  )
  const completed = await completePersistedMessageSend(
    store,
    claim.attempt,
    { status: 'enviado', providerMessageId: 'provider-1' },
  )

  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'MESSAGE_STATUS_PERSIST_FAILED')
  assert.equal(completed.ok, true)
  assert.equal(store.rows.get('message-1').status_envio, 'enviado')
  assert.equal(store.rows.get('message-1').whatsapp_message_id, 'provider-1')
  assert.equal(store.rows.get('message-1').envio_tentativa_id, null)
})

test('reconcile changes pending to indeterminate without sending', async () => {
  const store = createMessageStore([pendingMessage()])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    status_envio: 'indeterminado',
  })
})

test('reconcile preserves a fresh in-progress claim', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: 'enviando',
      envio_tentativa_id: 'attempt-1',
      envio_tentativa_em: new Date().toISOString(),
    }),
  ])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: false,
    status_envio: 'enviando',
  })
})

test('reconcile marks an in-progress row without claim metadata as indeterminate', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: 'enviando',
      envio_tentativa_id: null,
      envio_tentativa_em: null,
    }),
  ])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    status_envio: 'indeterminado',
  })
  assert.equal(store.rows.get('message-1').envio_tentativa_id, null)
  assert.equal(store.rows.get('message-1').envio_tentativa_em, null)
})

test('reconcile marks malformed claim metadata as indeterminate', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: 'enviando',
      envio_tentativa_id: 'attempt-1',
      envio_tentativa_em: 'not-a-date',
    }),
  ])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    status_envio: 'indeterminado',
  })
})

test('reconcile marks an abandoned claim as indeterminate', async () => {
  const store = createMessageStore([
    pendingMessage({
      status_envio: 'enviando',
      envio_tentativa_id: 'attempt-1',
      envio_tentativa_em: new Date(
        Date.now() - SEND_CLAIM_STALE_MS - 60_000,
      ).toISOString(),
    }),
  ])

  const result = await reconcilePendingMessageSend(
    store,
    'ticket-1',
    'message-1',
  )

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    status_envio: 'indeterminado',
  })
  assert.equal(store.rows.get('message-1').envio_tentativa_id, null)
})

test('persists an automatic provider-accepted message as sent', async () => {
  const inserted = []
  const client = {
    from(table) {
      assert.equal(table, 'mensagens')
      return {
        insert(payload) {
          inserted.push(payload)
          return {
            select() {
              return {
                async single() {
                  return { data: { id: 'message-auto', ...payload }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  const result = await persistAcceptedLegacyMessage(client, {
    ticketId: 'ticket-1',
    clientId: 'client-1',
    content: 'Atendimento finalizado',
    type: 'texto',
    channel: 'whatsapp',
    providerMessageId: 'provider-auto-1',
  })

  assert.equal(result.ok, true)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].status_envio, 'enviado')
  assert.equal(inserted[0].whatsapp_message_id, 'provider-auto-1')
  assert.equal(inserted[0].remetente, 'colaborador')
})

test('automatic accepted message falls back only when status schema is unavailable', async () => {
  const inserted = []
  let call = 0
  const client = {
    from() {
      return {
        insert(payload) {
          inserted.push(payload)
          return {
            select() {
              return {
                async single() {
                  call += 1
                  if (call === 1) {
                    return {
                      data: null,
                      error: { code: 'PGRST204', message: 'schema cache stale' },
                    }
                  }
                  return { data: { id: 'legacy-message', ...payload }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  const result = await persistAcceptedLegacyMessage(client, {
    ticketId: 'ticket-1',
    content: 'Atendimento finalizado',
    type: 'texto',
    channel: 'discord',
    providerMessageId: 'provider-auto-2',
  })

  assert.equal(result.ok, true)
  assert.equal(result.schemaFallback, true)
  assert.equal(inserted.length, 2)
  assert.equal(inserted[0].status_envio, 'enviado')
  assert.equal('status_envio' in inserted[1], false)
  assert.equal(inserted[1].whatsapp_message_id, 'provider-auto-2')
})
