import assert from 'node:assert/strict'
import test from 'node:test'
import { resolverIniciosTempoTransferencia } from '../lib/ticket-transfer-timing.ts'

const ticketBase = {
  criado_em: '2026-07-31T08:00:00.000Z',
  atribuido_em: '2026-07-31T08:00:00.000Z',
  setor_id: 'suporte',
  colaborador_id: 'edward',
}

test('reinicia o tempo do atendente sem reiniciar o tempo do mesmo setor', () => {
  const tempos = resolverIniciosTempoTransferencia(ticketBase, [
    {
      action: 'transferred',
      setor_id: 'suporte',
      previous_setor_id: 'suporte',
      colaborador_id: 'edward',
      created_at: '2026-07-31T09:00:00.000Z',
    },
  ])

  assert.equal(tempos.atendimentoAtualEm, '2026-07-31T09:00:00.000Z')
  assert.equal(tempos.setorAtualEm, '2026-07-31T08:00:00.000Z')
})

test('reinicia o tempo no setor quando a transferência muda o setor', () => {
  const tempos = resolverIniciosTempoTransferencia(
    { ...ticketBase, setor_id: 'prime' },
    [
      {
        action: 'transferred',
        setor_id: 'prime',
        previous_setor_id: 'suporte',
        colaborador_id: 'edward',
        created_at: '2026-07-31T09:00:00.000Z',
      },
    ],
  )

  assert.equal(tempos.atendimentoAtualEm, '2026-07-31T09:00:00.000Z')
  assert.equal(tempos.setorAtualEm, '2026-07-31T09:00:00.000Z')
})

test('conta o atendimento a partir da atribuição depois de uma transferência para a fila', () => {
  const tempos = resolverIniciosTempoTransferencia(
    { ...ticketBase, setor_id: 'prime' },
    [
      {
        action: 'transferred',
        setor_id: 'prime',
        previous_setor_id: 'suporte',
        colaborador_id: null,
        created_at: '2026-07-31T09:00:00.000Z',
      },
      {
        action: 'auto_assigned',
        setor_id: 'prime',
        previous_setor_id: 'prime',
        colaborador_id: 'edward',
        created_at: '2026-07-31T09:05:00.000Z',
      },
    ],
  )

  assert.equal(tempos.atendimentoAtualEm, '2026-07-31T09:05:00.000Z')
  assert.equal(tempos.setorAtualEm, '2026-07-31T09:00:00.000Z')
})

test('mantém compatibilidade com tickets antigos sem eventos estruturados', () => {
  const tempos = resolverIniciosTempoTransferencia(ticketBase, [])

  assert.equal(tempos.atendimentoAtualEm, '2026-07-31T08:00:00.000Z')
  assert.equal(tempos.setorAtualEm, '2026-07-31T08:00:00.000Z')
})
