import assert from 'node:assert/strict'
import test from 'node:test'
import { marcarSaidaDaFila } from '../lib/ticket-assignment-stamp.ts'

/** Supabase falso que registra a consulta montada e devolve o que for pedido. */
function fakeSupabase({ linha = { id: 't1' }, erro = null } = {}) {
  const chamada = { update: null, filtros: [] }
  const encadeia = {
    eq(coluna, valor) { chamada.filtros.push(['eq', coluna, valor]); return encadeia },
    is(coluna, valor) { chamada.filtros.push(['is', coluna, valor]); return encadeia },
    select() { return encadeia },
    maybeSingle() { return Promise.resolve({ data: erro ? null : linha, error: erro }) },
  }
  return {
    chamada,
    from(tabela) {
      chamada.tabela = tabela
      return {
        update(valores) { chamada.update = valores; return encadeia },
      }
    },
  }
}

test('grava a hora da saída da fila no ticket certo', async () => {
  const sb = fakeSupabase()
  const marcou = await marcarSaidaDaFila(sb, 'ticket-1', '2026-07-28T12:00:00.000Z')

  assert.equal(marcou, true)
  assert.equal(sb.chamada.tabela, 'tickets')
  assert.deepEqual(sb.chamada.update, { atribuido_em: '2026-07-28T12:00:00.000Z' })
  assert.deepEqual(sb.chamada.filtros, [
    ['eq', 'id', 'ticket-1'],
    ['is', 'atribuido_em', null],
  ])
})

test('só grava quando ainda está vazio — é a regra, não otimização', async () => {
  // Sem o `is(atribuido_em, null)`, cada transferência reescreveria a marcação e
  // o tempo de fila encolheria sozinho até virar zero.
  const sb = fakeSupabase()
  await marcarSaidaDaFila(sb, 'ticket-1')

  assert.ok(
    sb.chamada.filtros.some(([op, coluna, valor]) => op === 'is' && coluna === 'atribuido_em' && valor === null),
    'a condição de "ainda não marcado" precisa estar na consulta',
  )
})

test('ticket já marcado não é considerado nova saída da fila', async () => {
  // Nenhuma linha volta quando a condição não casa — é o caso da transferência
  // de um ticket que já tinha atendente.
  const sb = fakeSupabase({ linha: null })
  assert.equal(await marcarSaidaDaFila(sb, 'ticket-1'), false)
})

test('falha ao gravar não derruba a atribuição', async () => {
  // O ticket já é do atendente neste ponto. Perder a marcação custa um ponto do
  // relatório, não o atendimento — mas não pode lançar.
  const sb = fakeSupabase({ erro: { message: 'coluna ausente' } })
  assert.equal(await marcarSaidaDaFila(sb, 'ticket-1'), false)
})

test('usa o instante recebido, para o chamador poder fixar o relógio', async () => {
  const sb = fakeSupabase()
  await marcarSaidaDaFila(sb, 'ticket-1', '2026-01-01T00:00:00.000Z')
  assert.deepEqual(sb.chamada.update, { atribuido_em: '2026-01-01T00:00:00.000Z' })
})
