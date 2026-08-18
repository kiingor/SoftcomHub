import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAiEndpointUrl,
  DEFAULT_CUSTOM_AI_CHAT_MODEL,
  DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL,
  DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
  OMNIROUTE_BASE_URL,
  resolverModeloDeChat,
  resolverModeloDeTranscricao,
  resolverProvedorDeChat,
  usaProvedorProprio,
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

// --- resolverProvedorDeChat: o combo dedicado da análise ---

const SETOR_OPENAI = { openai_ativo: true, openai_api_key: 'sk-do-setor' }

test('o combo dedicado ganha do setor e cai no OmniRoute por padrão', () => {
  const provedor = resolverProvedorDeChat(SETOR_OPENAI, { ANALISE_IA_API_KEY: 'sk-do-combo' })

  assert.deepEqual(provedor, {
    url: `${OMNIROUTE_BASE_URL}/chat/completions`,
    apiKey: 'sk-do-combo',
    modelo: DEFAULT_CUSTOM_AI_CHAT_MODEL,
    origem: 'combo',
  })
})

test('o combo aceita URL e modelo próprios', () => {
  const provedor = resolverProvedorDeChat(null, {
    ANALISE_IA_API_KEY: 'sk-do-combo',
    ANALISE_IA_BASE_URL: 'https://gateway.example/v2',
    ANALISE_IA_MODEL: 'cx/outro-modelo',
  })

  assert.equal(provedor.url, 'https://gateway.example/v2/chat/completions')
  assert.equal(provedor.modelo, 'cx/outro-modelo')
})

test('chave do combo em branco não conta como configurada', () => {
  assert.equal(resolverProvedorDeChat(null, { ANALISE_IA_API_KEY: '   ' }), null)
  assert.equal(resolverProvedorDeChat(SETOR_OPENAI, { ANALISE_IA_API_KEY: '' }).origem, 'setor')
})

test('sem combo, degrada para a config do setor', () => {
  assert.deepEqual(resolverProvedorDeChat(SETOR_OPENAI, {}), {
    url: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'sk-do-setor',
    modelo: 'gpt-4o-mini',
    origem: 'setor',
  })
})

test('setor com provedor próprio usa a URL e o modelo customizados', () => {
  const provedor = resolverProvedorDeChat({
    ...SETOR_OPENAI,
    openai_url_personalizada: true,
    openai_base_url: 'https://proprio.example/v1',
  }, {})

  assert.equal(provedor.url, 'https://proprio.example/v1/chat/completions')
  assert.equal(provedor.modelo, DEFAULT_CUSTOM_AI_CHAT_MODEL)
})

test('setor com o switch desligado, sem chave ou inexistente não resolve nada', () => {
  assert.equal(resolverProvedorDeChat({ ...SETOR_OPENAI, openai_ativo: false }, {}), null)
  assert.equal(resolverProvedorDeChat({ openai_ativo: true, openai_api_key: null }, {}), null)
  assert.equal(resolverProvedorDeChat(null, {}), null)
})

test('setor marcado como personalizado mas sem base_url cai na OpenAI', () => {
  const provedor = resolverProvedorDeChat({
    ...SETOR_OPENAI,
    openai_url_personalizada: true,
    openai_base_url: '',
  }, {})

  assert.equal(provedor.url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(provedor.modelo, 'gpt-4o-mini')
})

// ─── escolha de modelo por setor (caso #97520) ───────────────────────────────

const SETOR_GATEWAY = {
  openai_ativo: true,
  openai_api_key: 'sk-do-setor',
  openai_url_personalizada: true,
  openai_base_url: 'https://proprio.example/v1',
}

test('sem escolha, cada provedor tem seu próprio modelo padrão', () => {
  assert.equal(resolverModeloDeChat(SETOR_OPENAI), 'gpt-4o-mini')
  assert.equal(resolverModeloDeChat(SETOR_GATEWAY), DEFAULT_CUSTOM_AI_CHAT_MODEL)
  assert.equal(resolverModeloDeTranscricao(SETOR_OPENAI), 'whisper-1')
  assert.equal(resolverModeloDeTranscricao(SETOR_GATEWAY), DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL)
})

test('o padrão de transcrição do gateway não é o da OpenAI', () => {
  // 'whisper-1' no gateway volta 400 "No credentials for provider: openai" —
  // era o modelo fixo da rota e o motivo de a transcrição nunca ter funcionado lá.
  assert.notEqual(DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL, DEFAULT_OPENAI_TRANSCRIPTION_MODEL)
  assert.equal(DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL, 'groq/whisper-large-v3')
})

test('o modelo escolhido no setor vence o padrão', () => {
  assert.equal(
    resolverModeloDeChat({ ...SETOR_GATEWAY, openai_modelo_chat: 'anthropic/claude-sonnet-5' }),
    'anthropic/claude-sonnet-5',
  )
  assert.equal(
    resolverModeloDeTranscricao({ ...SETOR_GATEWAY, openai_modelo_transcricao: 'groq/whisper-large-v3-turbo' }),
    'groq/whisper-large-v3-turbo',
  )
})

test('modelo em branco ou só espaço equivale a não escolher', () => {
  assert.equal(resolverModeloDeChat({ ...SETOR_OPENAI, openai_modelo_chat: '   ' }), 'gpt-4o-mini')
  assert.equal(resolverModeloDeChat({ ...SETOR_OPENAI, openai_modelo_chat: null }), 'gpt-4o-mini')
  assert.equal(resolverModeloDeTranscricao({ ...SETOR_GATEWAY, openai_modelo_transcricao: '' }), DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL)
})

test('o modelo do setor também vale para o provedor de chat resolvido', () => {
  const provedor = resolverProvedorDeChat({ ...SETOR_GATEWAY, openai_modelo_chat: 'cx/gpt-6' }, {})
  assert.equal(provedor.modelo, 'cx/gpt-6')
  assert.equal(provedor.origem, 'setor')
})

test('o combo dedicado ignora o modelo escolhido no setor', () => {
  // A análise do supervisor é igual em todo setor — quem manda é a env.
  const provedor = resolverProvedorDeChat(
    { ...SETOR_GATEWAY, openai_modelo_chat: 'cx/gpt-6' },
    { ANALISE_IA_API_KEY: 'sk-combo', ANALISE_IA_MODEL: 'cx/gpt-5.4' },
  )
  assert.equal(provedor.origem, 'combo')
  assert.equal(provedor.modelo, 'cx/gpt-5.4')
})

test('usaProvedorProprio exige o switch E a URL', () => {
  assert.equal(usaProvedorProprio(SETOR_GATEWAY), true)
  assert.equal(usaProvedorProprio({ ...SETOR_GATEWAY, openai_base_url: '  ' }), false)
  assert.equal(usaProvedorProprio({ ...SETOR_GATEWAY, openai_url_personalizada: false }), false)
  assert.equal(usaProvedorProprio(null), false)
})

test('monta o endpoint de catálogo de modelos a partir da mesma base', () => {
  assert.equal(
    buildAiEndpointUrl('https://proprio.example/v1/chat/completions', 'models'),
    'https://proprio.example/v1/models',
  )
})
