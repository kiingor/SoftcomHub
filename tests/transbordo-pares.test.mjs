import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estaPresenteNoSetor,
  montarParesDeTransbordo,
  normalizarNomeSubsetor,
  HEARTBEAT_STALE_MS,
} from '../lib/transbordo-pares.ts'

const PRIME = 'sub-prime'
const SUPORTE = 'sub-suporte'
const SETOR = 'setor-1'
const AGORA_MS = Date.parse('2026-08-13T15:00:00.000Z')

const colaboradorPresente = (extra = {}) => ({
  is_online: true,
  ativo: true,
  last_heartbeat: new Date(AGORA_MS - 1_000).toISOString(),
  setores_ativos_sessao: [SETOR],
  ...extra,
})

test('monta exatamente dois pares quando Prime e Suporte existem', () => {
  assert.equal(montarParesDeTransbordo(PRIME, SUPORTE).length, 2)
})

test('o par incondicional vai do Suporte para o Prime', () => {
  const [parSuporte, parPrime] = montarParesDeTransbordo(PRIME, SUPORTE)

  assert.deepEqual(parSuporte, { de: SUPORTE, para: PRIME })
  assert.equal(parPrime.de, PRIME)
  assert.equal(parPrime.somenteSemAtendentePresente, true)
})

test('o par Prime para Suporte ignora a fila do socorrista', () => {
  const [, parPrime] = montarParesDeTransbordo(PRIME, SUPORTE)

  assert.equal(parPrime.ignoraFilaDoSocorrista, true)
})

test('o par Suporte para Prime não traz flags condicionais', () => {
  const [parSuporte] = montarParesDeTransbordo(PRIME, SUPORTE)

  assert.equal('somenteSemAtendentePresente' in parSuporte, false)
  assert.equal('ignoraFilaDoSocorrista' in parSuporte, false)
})

test('não monta pares sem o id do Prime', () => {
  assert.deepEqual(montarParesDeTransbordo(null, SUPORTE), [])
})

test('não monta pares sem o id do Suporte', () => {
  assert.deepEqual(montarParesDeTransbordo(PRIME, null), [])
})

test('não monta pares quando ambos os ids são ausentes', () => {
  assert.deepEqual(montarParesDeTransbordo(null, undefined), [])
})

test('não monta pares quando qualquer id é uma string vazia', () => {
  assert.deepEqual(montarParesDeTransbordo('', SUPORTE), [])
  assert.deepEqual(montarParesDeTransbordo(PRIME, ''), [])
})

test('considera presente quem está online, ativo, com heartbeat fresco e setor ativo', () => {
  assert.equal(estaPresenteNoSetor(colaboradorPresente(), SETOR, AGORA_MS), true)
})

test('atendente em pausa continua presente', () => {
  const colaborador = colaboradorPresente({ pausa_atual_id: 'pausa-1' })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), true)
})

test('atendente offline não está presente', () => {
  const colaborador = colaboradorPresente({ is_online: false })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('atendente inativo não está presente', () => {
  const colaborador = colaboradorPresente({ ativo: false })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('heartbeat mais velho que o limite não conta como presença', () => {
  const colaborador = colaboradorPresente({
    last_heartbeat: new Date(AGORA_MS - HEARTBEAT_STALE_MS - 1).toISOString(),
  })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('heartbeat exatamente no limite não conta como presença', () => {
  const colaborador = colaboradorPresente({
    last_heartbeat: new Date(AGORA_MS - HEARTBEAT_STALE_MS).toISOString(),
  })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('heartbeat um milissegundo mais novo que o limite conta como presença', () => {
  const colaborador = colaboradorPresente({
    last_heartbeat: new Date(AGORA_MS - HEARTBEAT_STALE_MS + 1).toISOString(),
  })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), true)
})

test('heartbeat nulo não conta como presença', () => {
  const colaborador = colaboradorPresente({ last_heartbeat: null })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('heartbeat inválido não conta como presença', () => {
  const colaborador = colaboradorPresente({ last_heartbeat: 'não-é-uma-data' })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('atendente sem o setor pedido na sessão não está presente nele', () => {
  const colaborador = colaboradorPresente({ setores_ativos_sessao: ['outro-setor'] })

  assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
})

test('setores ativos fora do formato de array não contam como presença', () => {
  for (const setoresAtivos of [null, SETOR, { setor: SETOR }]) {
    const colaborador = colaboradorPresente({ setores_ativos_sessao: setoresAtivos })
    assert.equal(estaPresenteNoSetor(colaborador, SETOR, AGORA_MS), false)
  }
})

test('colaborador ausente não está presente', () => {
  assert.equal(estaPresenteNoSetor(null, SETOR, AGORA_MS), false)
  assert.equal(estaPresenteNoSetor(undefined, SETOR, AGORA_MS), false)
})

test('normaliza variações de caixa e espaços de Prime', () => {
  assert.equal(normalizarNomeSubsetor('Prime'), 'prime')
  assert.equal(normalizarNomeSubsetor(' PRIME '), 'prime')
  assert.equal(normalizarNomeSubsetor('prime'), 'prime')
})

test('remove acentos do nome do subsetor', () => {
  assert.equal(normalizarNomeSubsetor('Suporté'), 'suporte')
})

test('normaliza nome ausente como string vazia', () => {
  assert.equal(normalizarNomeSubsetor(null), '')
  assert.equal(normalizarNomeSubsetor(undefined), '')
})

test('preserva o nome completo de Suporte Chat para não ativar a regra do Suporte', () => {
  assert.equal(normalizarNomeSubsetor('Suporte Chat'), 'suporte chat')
})
