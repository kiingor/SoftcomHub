import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizarAtendenteBot, resolverAtendenteBotDoWebhook } from '../lib/webhook-atendente.ts'

test('envia o bot Nexus registrado na última resposta', () => {
  const atendenteBot = resolverAtendenteBotDoWebhook([
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Comercial' },
    { remetente: 'cliente-nexus' },
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Financeiro' },
  ])

  assert.equal(atendenteBot, 'Nexus Financeiro')
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
    { remetente: 'bot-nexus', atendente_bot: 'Nexus Financeiro' },
    { remetente: 'bot-nexus' },
  ])

  assert.equal(atendenteBot, 'Nexus Financeiro')
})

test('aceita apenas identificações de bot com nome válido', () => {
  assert.equal(normalizarAtendenteBot('  Nexus Cobrança  '), 'Nexus Cobrança')
  assert.equal(normalizarAtendenteBot({ nome: 'Nexus Cobrança' }), null)
})
