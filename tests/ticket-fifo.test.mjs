import assert from 'node:assert/strict'
import test from 'node:test'
import { chaveDaFila, ordenarTicketsPorFila, percorrerFilasEmOrdem } from '../lib/ticket-fifo.ts'

const ticket = (id, criado_em) => ({ id, criado_em })

test('distribui os tickets 1 a 5 do mais antigo para o mais recente', () => {
  const filaDevolvidaEmOrdemInversa = [
    ticket('ticket-5', '2026-07-31T11:30:05.000Z'),
    ticket('ticket-4', '2026-07-31T11:30:04.000Z'),
    ticket('ticket-3', '2026-07-31T11:30:03.000Z'),
    ticket('ticket-2', '2026-07-31T11:30:02.000Z'),
    ticket('ticket-1', '2026-07-31T11:30:01.000Z'),
  ]

  const fila = ordenarTicketsPorFila(filaDevolvidaEmOrdemInversa)

  assert.deepEqual(fila.map(({ id }) => id), [
    'ticket-1',
    'ticket-2',
    'ticket-3',
    'ticket-4',
    'ticket-5',
  ])
})

test('desempata tickets criados no mesmo instante pelo id', () => {
  const fila = ordenarTicketsPorFila([
    ticket('ticket-c', '2026-07-31T11:30:00.000Z'),
    ticket('ticket-a', '2026-07-31T11:30:00.000Z'),
    ticket('ticket-b', '2026-07-31T11:30:00.000Z'),
  ])

  assert.deepEqual(fila.map(({ id }) => id), ['ticket-a', 'ticket-b', 'ticket-c'])
})

// ---------------------------------------------------------------------------
// A vaga é de quem está na frente — regra de `percorrerFilasEmOrdem`.
// ---------------------------------------------------------------------------

const naFila = (id, criado_em, setor_id = 'setor-a', subsetor_id = 'suporte') => ({
  id,
  criado_em,
  setor_id,
  subsetor_id,
})

const lotado = { success: false, queueSaturated: true }
const atribuido = { success: true }

test('separa as filas por setor e por subsetor', () => {
  assert.equal(chaveDaFila(naFila('t', 'x', 'setor-a', 'suporte')), 'setor-a|suporte')
  assert.notEqual(
    chaveDaFila(naFila('t', 'x', 'setor-a', 'prime')),
    chaveDaFila(naFila('t', 'x', 'setor-a', 'suporte')),
  )
  assert.notEqual(
    chaveDaFila(naFila('t', 'x', 'setor-b', 'suporte')),
    chaveDaFila(naFila('t', 'x', 'setor-a', 'suporte')),
  )
  assert.equal(chaveDaFila({ id: 't', criado_em: 'x', setor_id: null, subsetor_id: null }), 'sem-setor|sem-subsetor')
})

test('tenta do mais antigo para o mais novo', async () => {
  const tentados = []
  await percorrerFilasEmOrdem(
    [naFila('novo', '2026-08-26T12:00:03.000Z'), naFila('velho', '2026-08-26T12:00:01.000Z')],
    async (ticket) => { tentados.push(ticket.id); return atribuido },
  )

  assert.deepEqual(tentados, ['velho', 'novo'])
})

test('quando o primeiro fica sem vaga, ninguém atrás dele é tentado', async () => {
  const tentados = []
  const { aguardando } = await percorrerFilasEmOrdem(
    [
      naFila('esperando-ha-mais-tempo', '2026-08-26T12:00:01.000Z'),
      naFila('chegou-depois', '2026-08-26T12:00:02.000Z'),
      naFila('acabou-de-chegar', '2026-08-26T12:00:03.000Z'),
    ],
    async (ticket) => { tentados.push(ticket.id); return lotado },
  )

  // Era aqui que o ticket recém-criado levava a vaga do que esperava há uma hora.
  assert.deepEqual(tentados, ['esperando-ha-mais-tempo'])
  assert.deepEqual(aguardando.map(({ id }) => id), ['chegou-depois', 'acabou-de-chegar'])
})

test('a fila travada não trava as outras — cada subsetor tem seus atendentes', async () => {
  const tentados = []
  await percorrerFilasEmOrdem(
    [
      naFila('suporte-1', '2026-08-26T12:00:01.000Z', 'setor-a', 'suporte'),
      naFila('suporte-2', '2026-08-26T12:00:02.000Z', 'setor-a', 'suporte'),
      naFila('prime-1', '2026-08-26T12:00:03.000Z', 'setor-a', 'prime'),
      naFila('outro-setor-1', '2026-08-26T12:00:04.000Z', 'setor-b', 'suporte'),
    ],
    async (ticket) => { tentados.push(ticket.id); return lotado },
  )

  assert.deepEqual(tentados, ['suporte-1', 'prime-1', 'outro-setor-1'])
})

test('atribuir o primeiro libera o próximo a tentar a vaga seguinte', async () => {
  const tentados = []
  const { aguardando } = await percorrerFilasEmOrdem(
    [
      naFila('primeiro', '2026-08-26T12:00:01.000Z'),
      naFila('segundo', '2026-08-26T12:00:02.000Z'),
      naFila('terceiro', '2026-08-26T12:00:03.000Z'),
    ],
    async (ticket) => { tentados.push(ticket.id); return ticket.id === 'primeiro' ? atribuido : lotado },
  )

  assert.deepEqual(tentados, ['primeiro', 'segundo'])
  assert.deepEqual(aguardando.map(({ id }) => id), ['terceiro'])
})

test('falha que esperar não resolve NÃO segura a fila — senão o transbordo nunca alcança os de trás', async () => {
  const tentados = []
  const { aguardando } = await percorrerFilasEmOrdem(
    [
      naFila('primeiro', '2026-08-26T12:00:01.000Z'),
      naFila('segundo', '2026-08-26T12:00:02.000Z'),
    ],
    // 'Ninguém online no setor' e 'ninguém pode atender este subsetor' chegam sem
    // queueSaturated: os dois casos precisam que TODOS os tickets sejam avaliados
    // para virarem candidatos ao transbordo de setor.
    async (ticket) => { tentados.push(ticket.id); return { success: false } },
  )

  assert.deepEqual(tentados, ['primeiro', 'segundo'])
  assert.deepEqual(aguardando, [])
})

test('devolve o resultado de cada ticket que chegou a ser tentado', async () => {
  const { resultados } = await percorrerFilasEmOrdem(
    [naFila('primeiro', '2026-08-26T12:00:01.000Z'), naFila('segundo', '2026-08-26T12:00:02.000Z')],
    async (ticket) => ({ success: false, queueSaturated: true, motivo: ticket.id }),
  )

  assert.equal(resultados.size, 1)
  assert.equal(resultados.get('primeiro').motivo, 'primeiro')
  assert.equal(resultados.has('segundo'), false)
})

test('tentados + aguardando cobre a fila inteira, sem sobra nem repetição', async () => {
  // As estatísticas do processador dependem disto: todo ticket da fila precisa
  // sair com um resultado, senão `ticketsAssigned + ticketsSkipped` deixa de
  // fechar com o tamanho da fila.
  const fila = [
    naFila('a', '2026-08-26T12:00:01.000Z', 'setor-a', 'suporte'),
    naFila('b', '2026-08-26T12:00:02.000Z', 'setor-a', 'suporte'),
    naFila('c', '2026-08-26T12:00:03.000Z', 'setor-a', 'prime'),
    naFila('d', '2026-08-26T12:00:04.000Z', 'setor-b', null),
    naFila('e', '2026-08-26T12:00:05.000Z', 'setor-b', null),
  ]

  const { resultados, aguardando } = await percorrerFilasEmOrdem(fila, async () => lotado)

  const cobertos = [...resultados.keys(), ...aguardando.map(({ id }) => id)].sort()
  assert.deepEqual(cobertos, ['a', 'b', 'c', 'd', 'e'])
  assert.equal(resultados.size + aguardando.length, fila.length)
})
