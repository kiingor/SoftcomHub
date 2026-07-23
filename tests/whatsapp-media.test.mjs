import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMime } from '../lib/whatsapp-media.ts'

test('infers certificate MIME from a persisted media URL when the type is generic', () => {
  assert.equal(
    resolveMime('application/octet-stream', 'https://blob.example/workdesk/ticket/certificado.cer?token=abc'),
    'application/pkix-cert',
  )
  assert.equal(
    resolveMime('', 'https://blob.example/workdesk/ticket/certificado.p12'),
    'application/x-pkcs12',
  )
})

test('infers XML MIME from a persisted media URL when the type is generic', () => {
  assert.equal(
    resolveMime('application/x-empty', 'https://blob.example/workdesk/ticket/nota.xml'),
    'application/xml',
  )
})
