import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// Mesmo gancho de `disparo-subsetor.test.mjs`: sem ele o `@/lib/phone` de
// avaliacao-pendente.ts não resolve fora do bundler.
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

const { encerrarAvaliacaoPendente } = await import('../lib/avaliacao-pendente.ts')
const { variantesDeTelefoneBR } = await import('../lib/phone.ts')

// ─── variantes do mesmo aparelho ────────────────────────────────────────────

test('o mesmo WhatsApp com e sem o nono dígito — caso real de 04/09/2026', () => {
  // #183439 gravou o cliente sem o 9; #183657, com. Mesmo aparelho.
  assert.deepEqual(variantesDeTelefoneBR('5583988330154'), ['5583988330154', '558388330154'])
  assert.deepEqual(variantesDeTelefoneBR('558388330154'), ['558388330154', '5583988330154'])
})

test('aceita o número sem DDI e devolve as duas formas com DDI', () => {
  assert.deepEqual(variantesDeTelefoneBR('(83) 98833-0154'), ['5583988330154', '558388330154'])
})

test('fixo não ganha nono dígito', () => {
  // Fixo começa em 2–5: 3234-5678 não é celular sem o 9.
  assert.deepEqual(variantesDeTelefoneBR('558332345678'), ['558332345678'])
})

test('DDD 55 não é confundido com o DDI', () => {
  assert.deepEqual(variantesDeTelefoneBR('55999998888'), ['5555999998888', '555599998888'])
})

test('entrada vazia ou impossível não inventa variante', () => {
  assert.deepEqual(variantesDeTelefoneBR(''), [])
  assert.deepEqual(variantesDeTelefoneBR(null), [])
  assert.deepEqual(variantesDeTelefoneBR(undefined), [])
  assert.deepEqual(variantesDeTelefoneBR('123'), ['123'])
})

// ─── encerramento da avaliação ──────────────────────────────────────────────

function fakeSupabase({ clientes = [], tickets = [], errors = {} } = {}) {
  const updates = []
  const mensagens = []

  const api = {
    updates,
    mensagens,
    from(tabela) {
      const filtros = {}
      let modo = 'select'
      let valores = null

      const query = {
        select() {
          modo = 'select'
          return query
        },
        update(novos) {
          modo = 'update'
          valores = novos
          return query
        },
        insert(linhas) {
          mensagens.push(...(Array.isArray(linhas) ? linhas : [linhas]))
          return Promise.resolve({ data: null, error: errors[`${tabela}:insert`] || null })
        },
        in(coluna, lista) {
          filtros[coluna] = lista
          return query
        },
        eq(coluna, valor) {
          filtros[coluna] = valor
          return query
        },
        limit(teto) {
          filtros.__limit = teto
          return query
        },
        then(resolve) {
          if (modo === 'update') {
            updates.push({ tabela, valores, filtros })
            return Promise.resolve({
              data: null,
              error: errors[`${tabela}:update`] || null,
            }).then(resolve)
          }
          if (errors[tabela]) {
            return Promise.resolve({ data: null, error: errors[tabela] }).then(resolve)
          }
          if (tabela === 'clientes') {
            const achados = clientes
              .filter((c) => (filtros.telefone || []).includes(c.telefone))
              .map((c) => ({ id: c.id }))
            return Promise.resolve({ data: achados, error: null }).then(resolve)
          }
          if (tabela === 'tickets') {
            const achados = tickets.filter(
              (t) =>
                (filtros.cliente_id || []).includes(t.cliente_id) &&
                t.status === filtros.status,
            )
            return Promise.resolve({ data: achados, error: null }).then(resolve)
          }
          throw new Error(`tabela inesperada: ${tabela}`)
        },
      }
      return query
    },
  }
  return api
}

const CLIENTES = [
  { id: 'sem-nove', telefone: '558388330154' },
  { id: 'com-nove', telefone: '5583988330154' },
]

test('acha a avaliação do cadastro sem o nono dígito disparando pelo com — o caso #183657', async () => {
  const sb = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      {
        id: 't-183439',
        numero: 183439,
        setor_id: 'servicedesk',
        status: 'avaliar',
        cliente_id: 'sem-nove',
        encerrado_em: '2026-09-04T14:11:12Z',
      },
    ],
  })

  const encerrados = await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste')

  assert.deepEqual(encerrados, [{ id: 't-183439', numero: 183439, setor_id: 'servicedesk' }])
  assert.equal(sb.updates.length, 1)
  assert.deepEqual(sb.updates[0].valores, { status: 'encerrado' })
  assert.deepEqual(sb.updates[0].filtros.id, ['t-183439'])
})

test('preserva o encerrado_em que já existia — o n8n move para avaliar depois de encerrar', async () => {
  const sb = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      {
        id: 't-1',
        numero: 1,
        setor_id: 's',
        status: 'avaliar',
        cliente_id: 'com-nove',
        encerrado_em: '2026-09-04T14:11:12Z',
      },
    ],
  })

  await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste')

  assert.equal(Object.hasOwn(sb.updates[0].valores, 'encerrado_em'), false)
})

test('carimba encerrado_em só em quem chegou sem a marca', async () => {
  const sb = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      { id: 't-marcado', numero: 1, setor_id: 's', status: 'avaliar', cliente_id: 'com-nove', encerrado_em: '2026-09-04T14:11:12Z' },
      { id: 't-sem-marca', numero: 2, setor_id: 's', status: 'avaliar', cliente_id: 'com-nove', encerrado_em: null },
    ],
  })

  await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste')

  const semMarca = sb.updates.find((u) => u.filtros.id.includes('t-sem-marca'))
  const marcado = sb.updates.find((u) => u.filtros.id.includes('t-marcado'))
  assert.ok(semMarca.valores.encerrado_em)
  assert.equal(Object.hasOwn(marcado.valores, 'encerrado_em'), false)
})

test('deixa o rastro na conversa de cada ticket encerrado', async () => {
  const sb = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      { id: 't-1', numero: 1, setor_id: 's', status: 'avaliar', cliente_id: 'com-nove', encerrado_em: '2026-09-04T14:11:12Z' },
    ],
  })

  await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste')

  assert.equal(sb.mensagens.length, 1)
  assert.equal(sb.mensagens[0].ticket_id, 't-1')
  assert.equal(sb.mensagens[0].remetente, 'sistema')
  assert.match(sb.mensagens[0].conteudo, /Avaliação encerrada automaticamente/)
})

test('ticket em outro status não é tocado', async () => {
  const sb = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      { id: 't-1', numero: 1, setor_id: 's', status: 'em_atendimento', cliente_id: 'com-nove', encerrado_em: null },
      { id: 't-2', numero: 2, setor_id: 's', status: 'encerrado', cliente_id: 'com-nove', encerrado_em: '2026-09-04T14:11:12Z' },
    ],
  })

  assert.deepEqual(await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste'), [])
  assert.equal(sb.updates.length, 0)
  assert.equal(sb.mensagens.length, 0)
})

test('cliente desconhecido não gera consulta de ticket nem escrita', async () => {
  const sb = fakeSupabase({ clientes: [], tickets: [] })
  assert.deepEqual(await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste'), [])
  assert.equal(sb.updates.length, 0)
})

test('telefone impossível não chega no banco', async () => {
  const sb = fakeSupabase({ clientes: CLIENTES })
  assert.deepEqual(await encerrarAvaliacaoPendente(sb, '', 'teste'), [])
  assert.equal(sb.updates.length, 0)
})

test('erro no banco não derruba o disparo', async () => {
  const sb = fakeSupabase({ clientes: CLIENTES, errors: { tickets: { code: '42P01' } } })
  assert.deepEqual(await encerrarAvaliacaoPendente(sb, '5583988330154', 'teste'), [])

  const sbUpdate = fakeSupabase({
    clientes: CLIENTES,
    tickets: [
      { id: 't-1', numero: 1, setor_id: 's', status: 'avaliar', cliente_id: 'com-nove', encerrado_em: '2026-09-04T14:11:12Z' },
    ],
    errors: { 'tickets:update': { code: '23514' } },
  })
  assert.deepEqual(await encerrarAvaliacaoPendente(sbUpdate, '5583988330154', 'teste'), [])
})

test('sobrevive a um supabase que explode', async () => {
  const explosivo = {
    from() {
      throw new Error('conexão perdida')
    },
  }
  assert.deepEqual(await encerrarAvaliacaoPendente(explosivo, '5583988330154', 'teste'), [])
})
