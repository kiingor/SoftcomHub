import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkValues, loadRowsByPages, loadRowsByValues } from '../lib/supabase/paginate.ts'

/**
 * Query falsa: guarda os `.range()` pedidos e devolve a fatia correspondente,
 * já com o teto de 1.000 linhas por resposta que o PostgREST aplica.
 */
function fakeQuery(totalRows, { pageSize = 1000, error = null } = {}) {
  const chamadas = []
  const linhas = Array.from({ length: totalRows }, (_, index) => ({ id: index }))

  const criar = () => ({
    range(from, to) {
      chamadas.push([from, to])
      if (error) return Promise.resolve({ data: null, error })
      const limite = Math.min(to - from + 1, pageSize)
      return Promise.resolve({ data: linhas.slice(from, from + limite), error: null })
    },
  })

  return { criar, chamadas }
}

test('traz todas as linhas quando o total passa do teto de 1.000', async () => {
  const { criar, chamadas } = fakeQuery(2350)
  const linhas = await loadRowsByPages(criar)

  assert.equal(linhas.length, 2350)
  assert.deepEqual(linhas[0], { id: 0 })
  assert.deepEqual(linhas[2349], { id: 2349 })
  assert.deepEqual(chamadas, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('uma página cheia exata não encerra o laço cedo demais', async () => {
  // O caso que quebra implementações ingênuas: 1.000 linhas redondas parecem
  // "página cheia, deve ter mais". É preciso pedir a próxima e recebê-la vazia
  // para concluir que acabou — parar em 1.000 é o bug que se quer evitar.
  const { criar, chamadas } = fakeQuery(1000)
  const linhas = await loadRowsByPages(criar)

  assert.equal(linhas.length, 1000)
  assert.equal(chamadas.length, 2)
  assert.deepEqual(chamadas[1], [1000, 1999])
})

test('para na primeira página quando o resultado cabe nela', async () => {
  const { criar, chamadas } = fakeQuery(37)
  const linhas = await loadRowsByPages(criar)

  assert.equal(linhas.length, 37)
  assert.equal(chamadas.length, 1)
})

test('tabela vazia devolve lista vazia sem uma segunda requisição', async () => {
  const { criar, chamadas } = fakeQuery(0)
  assert.deepEqual(await loadRowsByPages(criar), [])
  assert.equal(chamadas.length, 1)
})

test('erro de uma página interrompe em vez de devolver resultado parcial', async () => {
  const { criar } = fakeQuery(5000, { error: new Error('falha do PostgREST') })
  await assert.rejects(() => loadRowsByPages(criar), /falha do PostgREST/)
})

test('pageSize inválido cai no padrão em vez de girar em falso', async () => {
  // range(0, -1) devolveria vazio para sempre, ou pior, laço infinito.
  for (const invalido of [0, -10, Number.NaN]) {
    const { criar, chamadas } = fakeQuery(1500)
    const linhas = await loadRowsByPages(criar, invalido)
    assert.equal(linhas.length, 1500)
    assert.deepEqual(chamadas[0], [0, 999])
  }
})

test('fatia a lista do .in() para não estourar o tamanho da URL', () => {
  const valores = Array.from({ length: 450 }, (_, index) => `id-${index}`)
  const fatias = chunkValues(valores)

  assert.deepEqual(fatias.map((fatia) => fatia.length), [200, 200, 50])
  assert.equal(fatias.flat().length, 450)
  assert.deepEqual(chunkValues([]), [])
})

test('loadRowsByValues pagina dentro de cada fatia e ordena por id', async () => {
  const pedidos = []
  const supabase = {
    from: () => ({
      select: () => ({
        in(_coluna, valores) {
          const query = {
            order(coluna) {
              pedidos.push({ valores, ordenadoPor: coluna })
              return {
                range(from, to) {
                  // 1.200 linhas por fatia: obriga a paginar dentro dela.
                  const linhas = Array.from({ length: 1200 }, (_, i) => ({ id: `${valores[0]}-${i}` }))
                  return Promise.resolve({ data: linhas.slice(from, to + 1).slice(0, 1000), error: null })
                },
              }
            },
          }
          return query
        },
      }),
    }),
  }

  const valores = Array.from({ length: 300 }, (_, index) => `v${index}`)
  const linhas = await loadRowsByValues(supabase, 'mensagens', 'id', 'ticket_id', valores)

  // 2 fatias (200 + 100), 1.200 linhas cada — sem paginar viriam 1.000 por fatia.
  assert.equal(linhas.length, 2400)
  assert.equal(pedidos.length, 4)
  assert.ok(pedidos.every((pedido) => pedido.ordenadoPor === 'id'))
})

test('loadRowsByValues remove valores repetidos antes de fatiar', async () => {
  const recebidos = []
  const supabase = {
    from: () => ({
      select: () => ({
        in(_coluna, valores) {
          recebidos.push(valores)
          return { order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }
        },
      }),
    }),
  }

  await loadRowsByValues(supabase, 'tickets', 'id', 'id', ['a', 'b', 'a', 'b', 'c'])
  assert.deepEqual(recebidos, [['a', 'b', 'c']])
})
