import assert from 'node:assert/strict'
import test from 'node:test'
import { ordenarTicketsPorFila } from '../lib/ticket-fifo.ts'

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
