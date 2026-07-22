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

test('does not apply the exception to only one member plus another sector', () => {
  assert.equal(
    resolveSharedChannelOwnerId([
      SERVICE_DESK_MATRIZ_SECTOR_ID,
      'sales',
    ]),
    null,
  )
})
