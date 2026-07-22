import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return {
        url: 'data:text/javascript,export default {}',
        shortCircuit: true,
      }
    }
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
      resolvedPath = `${resolvedPath}.ts`
    }
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const {
  NexusSessionLinkValidationError,
  NexusSessionTicketClaimConflictError,
  linkPreparedNexusSessionToTicket,
} = await import('../lib/server/nexus-message-linking.ts')

class MessageQuery {
  constructor(messages) {
    this.messages = messages
    this.operation = 'select'
    this.filters = []
    this.values = null
    this.returning = false
    this.options = null
  }

  select(_columns, options) {
    if (this.operation === 'update') this.returning = true
    this.options = options || null
    return this
  }

  update(values) {
    this.operation = 'update'
    this.values = values
    return this
  }

  in(column, values) {
    const allowed = new Set(values)
    this.filters.push((row) => allowed.has(row[column]))
    return this
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  is(column, value) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  maybeSingle() {
    return this.execute().then((result) => ({
      ...result,
      data: Array.isArray(result.data) ? result.data[0] || null : result.data,
    }))
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async execute() {
    const rows = [...this.messages.values()].filter((row) => (
      this.filters.every((filter) => filter(row))
    ))

    if (this.operation === 'update') {
      for (const row of rows) Object.assign(row, this.values)
      return {
        data: this.returning ? rows.map((row) => ({ ...row })) : null,
        error: null,
      }
    }

    return {
      data: this.options?.head ? null : rows.map((row) => ({ ...row })),
      error: null,
      count: this.options?.count === 'exact' ? rows.length : null,
    }
  }
}

function createSupabase(initialMessages) {
  const messages = new Map(initialMessages.map((message) => [message.id, { ...message }]))
  return {
    messages,
    from(table) {
      assert.equal(table, 'mensagens')
      return new MessageQuery(messages)
    },
  }
}

const messageIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
]
const firstTicketId = '20000000-0000-4000-8000-000000000001'
const secondTicketId = '20000000-0000-4000-8000-000000000002'

test('atomically gives the complete Nexus session to only one concurrent ticket', async () => {
  const supabase = createSupabase(messageIds.map((id) => ({ id, ticket_id: null })))

  const results = await Promise.allSettled([
    linkPreparedNexusSessionToTicket({ supabase, messageIds, ticketId: firstTicketId }),
    linkPreparedNexusSessionToTicket({ supabase, messageIds, ticketId: secondTicketId }),
  ])

  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  assert.equal(fulfilled.length, 1)
  assert.equal(fulfilled[0].value, messageIds.length)
  assert.equal(rejected.length, 1)
  assert.ok(rejected[0].reason instanceof NexusSessionTicketClaimConflictError)

  const winnerTicketId = rejected[0].reason.winnerTicketId
  assert.ok([firstTicketId, secondTicketId].includes(winnerTicketId))
  assert.deepEqual(
    [...supabase.messages.values()].map((message) => message.ticket_id),
    messageIds.map(() => winnerTicketId),
  )
})

test('does not touch pending messages when the session already has another winner', async () => {
  const supabase = createSupabase([
    { id: messageIds[0], ticket_id: secondTicketId },
    { id: messageIds[1], ticket_id: null },
    { id: messageIds[2], ticket_id: null },
  ])

  await assert.rejects(
    linkPreparedNexusSessionToTicket({ supabase, messageIds, ticketId: firstTicketId }),
    (error) => (
      error instanceof NexusSessionTicketClaimConflictError
      && error.winnerTicketId === secondTicketId
    ),
  )
  assert.deepEqual(
    [...supabase.messages.values()].map((message) => message.ticket_id),
    [secondTicketId, null, null],
  )
})

test('rejects a legacy split session before claiming its first pending message', async () => {
  const supabase = createSupabase([
    { id: messageIds[0], ticket_id: null },
    { id: messageIds[1], ticket_id: firstTicketId },
    { id: messageIds[2], ticket_id: secondTicketId },
  ])

  await assert.rejects(
    linkPreparedNexusSessionToTicket({ supabase, messageIds, ticketId: firstTicketId }),
    NexusSessionLinkValidationError,
  )
  assert.equal(supabase.messages.get(messageIds[0]).ticket_id, null)
})

test('completes an interrupted link when retrying with the winning ticket', async () => {
  const supabase = createSupabase([
    { id: messageIds[0], ticket_id: firstTicketId },
    { id: messageIds[1], ticket_id: null },
    { id: messageIds[2], ticket_id: null },
  ])

  const linkedCount = await linkPreparedNexusSessionToTicket({
    supabase,
    messageIds,
    ticketId: firstTicketId,
  })

  assert.equal(linkedCount, messageIds.length)
  assert.deepEqual(
    [...supabase.messages.values()].map((message) => message.ticket_id),
    messageIds.map(() => firstTicketId),
  )
})
