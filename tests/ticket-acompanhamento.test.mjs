import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const mockedModules = {
  'next/server': moduleUrl(`
    export const NextResponse = {
      json(body, init) {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    }
  `),
  '@/lib/supabase/server': moduleUrl(`
    export async function createClient() {
      return globalThis.__acompanhamentoSessionClient
    }
  `),
  '@/lib/supabase/service': moduleUrl(`
    export function createServiceClient() {
      return globalThis.__acompanhamentoServiceClient
    }
  `),
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mockedModules[specifier]) {
      return { shortCircuit: true, url: mockedModules[specifier] }
    }

    return nextResolve(specifier, context)
  },
})

const { POST } = await import('../app/api/tickets/acompanhamento/route.ts')

function createDatabase(collaborators) {
  const rows = new Map()
  const insertCalls = []

  return {
    rows,
    insertCalls,
    from(table) {
      if (table === 'colaboradores') {
        const filters = new Map()
        const query = {
          select() {
            return query
          },
          eq(column, value) {
            filters.set(column, value)
            return query
          },
          async maybeSingle() {
            return { data: collaborators.get(filters.get('email')) ?? null, error: null }
          },
        }
        return query
      }

      assert.equal(table, 'ticket_acompanhamentos')
      const filters = new Map()
      const query = {
        insert(payload) {
          insertCalls.push({ ...payload })
          return {
            select() {
              return {
                async maybeSingle() {
                  if (rows.has(payload.ticket_id)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } }
                  }

                  const row = { ...payload }
                  rows.set(row.ticket_id, row)
                  return { data: { ...row }, error: null }
                },
              }
            },
          }
        },
        select() {
          return query
        },
        eq(column, value) {
          filters.set(column, value)
          return query
        },
        async maybeSingle() {
          const row = rows.get(filters.get('ticket_id'))
          return { data: row ? { ...row } : null, error: null }
        },
      }
      return query
    },
  }
}

async function postAcompanhamento(database, collaborator) {
  globalThis.__acompanhamentoSessionClient = {
    auth: {
      async getUser() {
        return { data: { user: { email: collaborator.email } } }
      },
    },
  }
  globalThis.__acompanhamentoServiceClient = database

  const response = await POST(new Request('http://localhost/api/tickets/acompanhamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: 'ticket-1', acompanhar: true }),
  }))

  return { body: await response.json(), status: response.status }
}

test('cria condicionalmente, repete o mesmo gestor e bloqueia outro gestor', async () => {
  const gestorA = { id: 'gestor-a', nome: 'Gestor A', email: 'a@softcom.com' }
  const gestorB = { id: 'gestor-b', nome: 'Gestor B', email: 'b@softcom.com' }
  const database = createDatabase(new Map([
    [gestorA.email, gestorA],
    [gestorB.email, gestorB],
  ]))

  const criado = await postAcompanhamento(database, gestorA)
  const repetido = await postAcompanhamento(database, gestorA)
  const conflito = await postAcompanhamento(database, gestorB)

  assert.equal(criado.status, 200)
  assert.equal(criado.body.acompanhamento.colaborador_id, gestorA.id)
  assert.equal(repetido.status, 200)
  assert.deepEqual(repetido.body.acompanhamento, criado.body.acompanhamento)
  assert.equal(conflito.status, 409)
  assert.equal(conflito.body.error, 'Outro gestor já está acompanhando este atendimento')
  assert.equal(database.rows.get('ticket-1').colaborador_id, gestorA.id)
  assert.deepEqual(database.insertCalls.map((row) => row.colaborador_id), [gestorA.id, gestorA.id, gestorB.id])
})
