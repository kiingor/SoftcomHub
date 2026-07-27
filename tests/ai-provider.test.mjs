import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAiEndpointUrl,
  DEFAULT_CUSTOM_AI_CHAT_MODEL,
} from '../lib/ai-provider.ts'

test('uses the configured custom model by default', () => {
  assert.equal(DEFAULT_CUSTOM_AI_CHAT_MODEL, 'cx/gpt-5.4')
})

test('builds the chat endpoint from a base URL', () => {
  assert.equal(
    buildAiEndpointUrl('https://provider.example/v1/', 'chat/completions'),
    'https://provider.example/v1/chat/completions',
  )
})

test('does not duplicate an existing chat endpoint', () => {
  assert.equal(
    buildAiEndpointUrl('https://provider.example/v1/chat/completions', 'chat/completions'),
    'https://provider.example/v1/chat/completions',
  )
})

test('replaces a chat endpoint with the audio endpoint', () => {
  assert.equal(
    buildAiEndpointUrl('https://provider.example/v1/chat/completions', 'audio/transcriptions'),
    'https://provider.example/v1/audio/transcriptions',
  )
})

test('rejects unsupported protocols and URLs containing credentials', () => {
  assert.throws(() => buildAiEndpointUrl('file:///tmp/provider', 'chat/completions'))
  assert.throws(() => buildAiEndpointUrl('https://user:secret@provider.example/v1', 'chat/completions'))
})
