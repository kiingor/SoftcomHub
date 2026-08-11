import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizarAtendenteBot,
  normalizarAtendenteBotId,
  resolverAtendenteBotDoWebhook,
} from '../lib/webhook-atendente.ts'

test('envia o bot Nexus registrado na última resposta', () => {
  const atendenteBot = resolverAtendenteBotDoWebhook([
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Comercial', atendente_bot_id: 3120 },
    { remetente: 'cliente-nexus' },
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Financeiro', atendente_bot_id: 3155 },
  ])

  assert.deepEqual(atendenteBot, { id: 3155, nome: 'Nexus Financeiro' })
})

test('não confunde disparo comum com atendimento do Nexus', () => {
  const atendenteBot = resolverAtendenteBotDoWebhook([
    { remetente: 'bot' },
    { remetente: 'cliente' },
  ])

  assert.equal(atendenteBot, null)
})

test('mantém o último bot identificado quando uma mensagem posterior não tem nome', () => {
  const atendenteBot = resolverAtendenteBotDoWebhook([
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Financeiro', atendente_bot_id: 3155 },
    { remetente: 'bot-nexus' },
  ])

  assert.deepEqual(atendenteBot, { id: 3155, nome: 'Nexus Financeiro' })
})

test('nome sem id devolve id nulo em vez de herdar o id de outra mensagem', () => {
  const atendenteBot = resolverAtendenteBotDoWebhook([
    { remetente: 'bot-nexus', atendente_bot: 'Renata', atendente_bot_id: 3120 },
    { remetente: 'bot-nexus', atendente_bot: 'Heitor' },
  ])

  assert.deepEqual(atendenteBot, { id: null, nome: 'Heitor' })
})

test('aceita apenas identificações de bot com nome válido', () => {
  assert.equal(normalizarAtendenteBot('  Nexus Cobrança  '), 'Nexus Cobrança')
  assert.equal(normalizarAtendenteBot({ nome: 'Nexus Cobrança' }), null)
})

test('id do bot preserva o tipo e rejeita lixo', () => {
  assert.equal(normalizarAtendenteBotId(3161), 3161)
  assert.equal(normalizarAtendenteBotId('  3161  '), '3161')
  assert.equal(normalizarAtendenteBotId(null), null)
  assert.equal(normalizarAtendenteBotId(Number.NaN), null)
  assert.equal(normalizarAtendenteBotId({ id: 3161 }), null)
})
