import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeTicketSend } from '../lib/ticket-send-auth.ts'

function fakeSupabase({ ticket, actor, sectorLinks = [], errors = {} }) {
  return {
    from(table) {
      const filters = {}
      const query = {
        select() {
          return query
        },
        eq(column, value) {
          filters[column] = value
          return query
        },
        async maybeSingle() {
          if (errors[table]) return { data: null, error: errors[table] }
          if (table === 'tickets') return { data: ticket, error: null }
          if (table === 'colaboradores') return { data: actor, error: null }
          throw new Error(`unexpected maybeSingle table: ${table}`)
        },
        then(resolve) {
          if (table !== 'colaboradores_setores') {
            return Promise.reject(new Error(`unexpected list table: ${table}`)).then(resolve)
          }
          const result = errors[table]
            ? { data: null, error: errors[table] }
            : {
                data: sectorLinks.filter(
                  (link) => link.colaborador_id === filters.colaborador_id,
                ),
                error: null,
              }
          return Promise.resolve(result).then(resolve)
        },
      }
      return query
    },
  }
}

const activeActor = {
  id: 'colab-1',
  ativo: true,
  is_master: false,
  setor_id: null,
  permissoes: null,
}

const activeTicket = {
  id: 't1',
  status: 'em_atendimento',
  colaborador_id: 'colab-1',
  setor_id: 'setor-a',
}

test('rejects an inactive collaborator', async () => {
  const supabase = fakeSupabase({
    ticket: activeTicket,
    actor: { ...activeActor, ativo: false },
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.deepEqual(result, {
    ok: false,
    status: 403,
    code: 'COLLABORATOR_INACTIVE',
    error: 'Colaborador não autorizado',
  })
})

test('rejects when the ticket does not exist', async () => {
  const supabase = fakeSupabase({ ticket: null, actor: activeActor })

  const result = await authorizeTicketSend(supabase, 'ticket-x', 'user@softcom.com')

  assert.equal(result.ok, false)
  assert.equal(result.code, 'TICKET_NOT_FOUND')
})

test('rejects when the ticket is already closed', async () => {
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, status: 'encerrado' },
    actor: activeActor,
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, false)
  assert.equal(result.code, 'TICKET_NOT_ACTIVE')
})

test('allows the active ticket owner', async () => {
  const supabase = fakeSupabase({ ticket: activeTicket, actor: activeActor })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, true)
  assert.equal(result.actor.id, activeActor.id)
})

test('allows a master in every sector', async () => {
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, colaborador_id: 'another-user' },
    actor: { ...activeActor, id: 'master-1', is_master: true },
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, true)
  assert.equal(result.actor.isMaster, true)
})

test('allows a supervisor only in a linked sector', async () => {
  const supervisor = {
    ...activeActor,
    id: 'supervisor-1',
    permissoes: { can_see_all_tickets: true },
  }
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, colaborador_id: 'another-user' },
    actor: supervisor,
    sectorLinks: [{ colaborador_id: supervisor.id, setor_id: activeTicket.setor_id }],
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, true)
})

test('rejects a supervisor outside linked sectors', async () => {
  const supervisor = {
    ...activeActor,
    id: 'supervisor-1',
    permissoes: [{ can_see_all_tickets: true }],
  }
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, colaborador_id: 'another-user' },
    actor: supervisor,
    sectorLinks: [{ colaborador_id: supervisor.id, setor_id: 'setor-b' }],
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, false)
  assert.equal(result.code, 'SUPERVISOR_OUT_OF_SCOPE')
})

test('allows a supervisor through the legacy actor sector', async () => {
  const supervisor = {
    ...activeActor,
    id: 'supervisor-1',
    setor_id: activeTicket.setor_id,
    permissoes: { can_see_all_tickets: true },
  }
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, colaborador_id: 'another-user' },
    actor: supervisor,
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, true)
})

test('fails closed when supervisor sector lookup fails', async () => {
  const supabase = fakeSupabase({
    ticket: { ...activeTicket, colaborador_id: 'another-user' },
    actor: {
      ...activeActor,
      id: 'supervisor-1',
      permissoes: { can_see_all_tickets: true },
    },
    errors: { colaboradores_setores: { message: 'database unavailable' } },
  })

  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')

  assert.equal(result.ok, false)
  assert.equal(result.code, 'SEND_AUTH_CHECK_FAILED')
})
