import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeTicketSend } from '../lib/ticket-send-auth.ts'

// Fake mínimo do client Supabase — só o suficiente pra exercitar
// authorizeTicketSend, que só usa .from(table).select().eq().maybeSingle().
function fakeSupabase({ ticket, actor }) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table === 'tickets') return { data: ticket, error: null }
                  if (table === 'colaboradores') return { data: actor, error: null }
                  throw new Error(`unexpected table: ${table}`)
                },
              }
            },
          }
        },
      }
    },
  }
}

test('rejects when the ticket does not exist', async () => {
  const supabase = fakeSupabase({ ticket: null, actor: { id: 'colab-1', is_master: false, permissoes: null } })
  const result = await authorizeTicketSend(supabase, 'ticket-x', 'user@softcom.com')
  assert.deepEqual(result, { ok: false, status: 404, error: 'Ticket não encontrado' })
})

test('rejects when the ticket is not active (already closed)', async () => {
  const supabase = fakeSupabase({
    ticket: { id: 't1', status: 'encerrado', colaborador_id: 'colab-1', setor_id: 'setor-a' },
    actor: { id: 'colab-1', is_master: false, permissoes: null },
  })
  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')
  assert.equal(result.ok, false)
  assert.equal(result.status, 409)
})

test('allows the ticket owner to send/retry a message', async () => {
  const supabase = fakeSupabase({
    ticket: { id: 't1', status: 'em_atendimento', colaborador_id: 'colab-1', setor_id: 'setor-a' },
    actor: { id: 'colab-1', is_master: false, permissoes: null },
  })
  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')
  assert.equal(result.ok, true)
})

test('rejects a colaborador who is neither the owner, master, nor a supervisor', async () => {
  const supabase = fakeSupabase({
    ticket: { id: 't1', status: 'aberto', colaborador_id: 'someone-else', setor_id: 'setor-a' },
    actor: { id: 'colab-1', is_master: false, permissoes: null },
  })
  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')
  assert.deepEqual(result, { ok: false, status: 403, error: 'Você não está autorizado a enviar mensagens para este ticket' })
})

test('allows master regardless of ticket ownership', async () => {
  const supabase = fakeSupabase({
    ticket: { id: 't1', status: 'aberto', colaborador_id: 'someone-else', setor_id: 'setor-a' },
    actor: { id: 'master-1', is_master: true, permissoes: null },
  })
  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')
  assert.equal(result.ok, true)
})

test('allows a supervisor (can_see_all_tickets) regardless of ticket ownership', async () => {
  const supabase = fakeSupabase({
    ticket: { id: 't1', status: 'aberto', colaborador_id: 'someone-else', setor_id: 'setor-a' },
    actor: { id: 'supervisor-1', is_master: false, permissoes: { can_see_all_tickets: true } },
  })
  const result = await authorizeTicketSend(supabase, 't1', 'user@softcom.com')
  assert.equal(result.ok, true)
})
