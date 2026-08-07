import assert from 'node:assert/strict'
import test from 'node:test'
import { migrarLayoutRoteamentoV7 } from '../lib/relatorio-layout.ts'

const roteamentoLegado = { i: 'roteamento', x: 10, y: 9, w: 2, h: 4 }

test('migra apenas o slot padrão legado do card de roteamento', () => {
  const rank = { i: 'rankAtendente', x: 0, y: 11, w: 6, h: 7, minW: 4 }
  const tabela = { i: 'tabela', x: 0, y: 24, w: 12, h: 7 }
  const layout = [rank, roteamentoLegado, tabela]

  const migrado = migrarLayoutRoteamentoV7(layout)

  assert.deepEqual(migrado, [
    rank,
    { i: 'roteamento', x: 6, y: 18, w: 6, h: 6 },
    tabela,
  ])
  assert.equal(migrado[0], rank)
  assert.equal(migrado[2], tabela)
})

test('preserva os demais cartões e procura posição livre para evitar colisões', () => {
  const personalizado = { i: 'volume', x: 6, y: 18, w: 6, h: 7 }
  const layout = [roteamentoLegado, personalizado]

  const migrado = migrarLayoutRoteamentoV7(layout)

  assert.deepEqual(migrado, [
    { i: 'roteamento', x: 6, y: 25, w: 6, h: 6 },
    personalizado,
  ])
  assert.equal(migrado[1], personalizado)
})

test('não altera um card de roteamento já personalizado e é idempotente', () => {
  const layoutPersonalizado = [
    { i: 'roteamento', x: 0, y: 4, w: 4, h: 5 },
    { i: 'tabela', x: 0, y: 9, w: 12, h: 7 },
  ]

  const semMudanca = migrarLayoutRoteamentoV7(layoutPersonalizado)
  const migrado = migrarLayoutRoteamentoV7([roteamentoLegado])

  assert.deepEqual(semMudanca, layoutPersonalizado)
  assert.equal(semMudanca[0], layoutPersonalizado[0])
  assert.deepEqual(migrarLayoutRoteamentoV7(migrado), migrado)
})
