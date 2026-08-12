import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OUVIDORIA_MATRIZ_SECTOR_ID,
  resolveSharedChannelOwnerId,
  SERVICE_DESK_MATRIZ_SECTOR_ID,
} from '../lib/nexus-channel-resolution.ts'

test('keeps a channel with a single owner', () => {
  assert.equal(
    resolveSharedChannelOwnerId(['single-owner']),
    'single-owner',
  )
})

test('selects ServiceDesk as owner of the channel shared with Ouvidoria', () => {
  assert.equal(
    resolveSharedChannelOwnerId([
      SERVICE_DESK_MATRIZ_SECTOR_ID,
      OUVIDORIA_MATRIZ_SECTOR_ID,
    ]),
    SERVICE_DESK_MATRIZ_SECTOR_ID,
  )
})

test('keeps every other shared channel ambiguous', () => {
  assert.equal(
    resolveSharedChannelOwnerId(['support', 'finance']),
    null,
  )
  assert.equal(
    resolveSharedChannelOwnerId([
      SERVICE_DESK_MATRIZ_SECTOR_ID,
      OUVIDORIA_MATRIZ_SECTOR_ID,
      'third-owner',
    ]),
    null,
  )
})

test('o setor do ticket ganha quando está entre os donos do canal', () => {
  // Caso Kenobi: número compartilhado por dois setores fora do par ServiceDesk/
  // Ouvidoria devolvia null e derrubava o envio com CHANNEL_MISMATCH, mesmo com
  // o canal cadastrado no próprio setor do ticket.
  assert.equal(
    resolveSharedChannelOwnerId(['kenobi', 'kenobi-filial'], 'kenobi'),
    'kenobi',
  )
  assert.equal(
    resolveSharedChannelOwnerId(
      [SERVICE_DESK_MATRIZ_SECTOR_ID, OUVIDORIA_MATRIZ_SECTOR_ID],
      OUVIDORIA_MATRIZ_SECTOR_ID,
    ),
    OUVIDORIA_MATRIZ_SECTOR_ID,
  )
})

test('setor do ticket fora dos donos não desempata nada', () => {
  // Sem coluna de canal principal em setor_canais, um número dividido entre dois
  // setores estranhos ao ticket segue ambíguo — falha fechado de propósito.
  assert.equal(
    resolveSharedChannelOwnerId(['kenobi', 'kenobi-filial'], 'outro-setor'),
    null,
  )
  assert.equal(
    resolveSharedChannelOwnerId(['kenobi', 'kenobi-filial'], null),
    null,
  )
})

test('does not apply the exception to only one member plus another sector', () => {
  assert.equal(
    resolveSharedChannelOwnerId([
      SERVICE_DESK_MATRIZ_SECTOR_ID,
      'sales',
    ]),
    null,
  )
})
