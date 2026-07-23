import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatNexusAttendanceType,
  getNexusConversationScopeKey,
  getNexusMessageActorLabel,
  getNexusMessagePhase,
  isMissingSupabaseRelation,
  isNexusRelevantMessage,
  matchesNexusTicketConversationFilter,
  mergeNexusTicketTimeline,
  shouldStartNewNexusSession,
} from '../lib/nexus-monitoring.ts'

test('cliente-nexus/bot-nexus always count as Nexus, with or without a ticket', () => {
  assert.equal(isNexusRelevantMessage('cliente-nexus', null), true)
  assert.equal(isNexusRelevantMessage('cliente-nexus', 'ticket-1'), true)
  assert.equal(isNexusRelevantMessage('bot-nexus', null), true)
  assert.equal(isNexusRelevantMessage('bot-nexus', 'ticket-1'), true)
})

test('a plain "cliente" only counts as Nexus while there is no ticket yet — never sweeps in normal human-attendance messages', () => {
  assert.equal(isNexusRelevantMessage('cliente', null), true)
  assert.equal(isNexusRelevantMessage('cliente', 'ticket-1'), false)
})

test('"bot" (different system) and "colaborador" never count as Nexus, regardless of ticket', () => {
  assert.equal(isNexusRelevantMessage('bot', null), false)
  assert.equal(isNexusRelevantMessage('bot', 'ticket-1'), false)
  assert.equal(isNexusRelevantMessage('colaborador', null), false)
  assert.equal(isNexusRelevantMessage(null, null), false)
})

test('identifies the Nexus and human phases of a conversation', () => {
  // Remetentes com sufixo -nexus são sempre fase Nexus, com ou sem ticket.
  assert.equal(getNexusMessagePhase('cliente-nexus'), 'nexus')
  assert.equal(getNexusMessagePhase('cliente-nexus', 'ticket-1'), 'nexus')
  assert.equal(getNexusMessagePhase('bot-nexus'), 'nexus')
  assert.equal(getNexusMessagePhase('bot-nexus', 'ticket-1'), 'nexus')
  assert.equal(getNexusMessagePhase('colaborador'), 'human')
  assert.equal(getNexusMessagePhase('integracao-externa'), 'human')
})

test('a plain "cliente" remetente (n8n tagging inconsistency) is Nexus phase only while there is no ticket yet', () => {
  assert.equal(getNexusMessagePhase('cliente', null), 'nexus')
  // Once a ticket exists, the same remetente means a normal human-attendance message.
  assert.equal(getNexusMessagePhase('cliente', 'ticket-1'), 'human')
})

test('"bot" (no -nexus suffix) is a different bot/system, never treated as Nexus phase', () => {
  assert.equal(getNexusMessagePhase('bot'), 'human')
  assert.equal(getNexusMessagePhase('bot', null), 'human')
  assert.equal(getNexusMessagePhase('bot', 'ticket-1'), 'human')
})

test('labels known actors and formats an unknown sender', () => {
  assert.equal(getNexusMessageActorLabel('cliente-nexus'), 'Cliente · Nexus')
  assert.equal(getNexusMessageActorLabel('bot-nexus'), 'Nexus IA')
  // 'bot' is a different system — must NOT be labeled as Nexus IA.
  assert.equal(getNexusMessageActorLabel('bot'), 'Bot')
  assert.equal(getNexusMessageActorLabel('cliente'), 'Cliente')
  assert.equal(getNexusMessageActorLabel('colaborador'), 'Colaborador')
  assert.equal(getNexusMessageActorLabel('integracao_externa'), 'Integracao externa')
})

test('formats an attendance type slug and ignores empty values', () => {
  assert.equal(formatNexusAttendanceType('notas_nfe_nfce'), 'Notas NF-e / NFC-e')
  assert.equal(formatNexusAttendanceType('mdfe'), 'MDF-e')
  assert.equal(formatNexusAttendanceType('  suporte-tecnico  '), 'Suporte tecnico')
  assert.equal(formatNexusAttendanceType(''), null)
  assert.equal(formatNexusAttendanceType('   '), null)
  assert.equal(formatNexusAttendanceType(null), null)
})

test('filters Nexus tickets by conversation stage', () => {
  assert.equal(matchesNexusTicketConversationFilter('em_atendimento', 'em_conversa'), true)
  assert.equal(matchesNexusTicketConversationFilter('encerrado', 'em_conversa'), false)
  assert.equal(matchesNexusTicketConversationFilter('encerrado', 'finalizado'), true)
  assert.equal(matchesNexusTicketConversationFilter('aberto', 'finalizado'), false)
  assert.equal(matchesNexusTicketConversationFilter('avaliar', 'em_conversa'), false)
  assert.equal(matchesNexusTicketConversationFilter(null, 'all'), true)
})

test('merges messages without duplicates and orders the unified timeline', () => {
  const firstNexusMessage = {
    id: 'nexus-1',
    enviado_em: '2026-07-22T10:00:00.000Z',
    remetente: 'cliente-nexus',
    conteudo: 'Preciso de ajuda',
  }
  const duplicatedNexusMessage = {
    ...firstNexusMessage,
    ticket_id: 'ticket-1',
  }
  const botMessage = {
    id: 'nexus-2',
    enviado_em: '2026-07-22T10:01:00.000Z',
    remetente: 'bot-nexus',
    conteudo: 'Vou abrir um ticket',
  }
  const collaboratorMessage = {
    id: 'human-1',
    enviado_em: '2026-07-22T10:02:00.000Z',
    remetente: 'colaborador',
    conteudo: 'Olá, vou continuar seu atendimento',
  }

  const timeline = mergeNexusTicketTimeline(
    [botMessage, firstNexusMessage],
    [collaboratorMessage, duplicatedNexusMessage],
  )

  assert.deepEqual(
    timeline.map((message) => message.id),
    ['nexus-1', 'nexus-2', 'human-1'],
  )
  assert.strictEqual(timeline[0], firstNexusMessage)
  assert.strictEqual(timeline[2], collaboratorMessage)
})

test('keeps the same client isolated by sector', () => {
  const supportKey = getNexusConversationScopeKey('support', 'client-1', '5515999999999', 'message-1')
  const salesKey = getNexusConversationScopeKey('sales', 'client-1', '5515999999999', 'message-1')

  assert.notEqual(supportKey, salesKey)
  assert.equal(supportKey, 'support::5515999999999')
})

test('starts a new session after a ticket but keeps null-to-ticket conversion together', () => {
  const base = { hasCurrentSession: true, gapMs: 1_000, maxGapMs: 60_000 }

  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: null, incomingTicketId: 'ticket-1' }), false)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: 'ticket-1' }), false)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: null }), true)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: 'ticket-2' }), true)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: null, incomingTicketId: null, gapMs: 61_000 }), true)
})

test('recognizes a missing optional Supabase relation without swallowing other errors', () => {
  assert.equal(isMissingSupabaseRelation({
    code: 'PGRST205',
    message: "Could not find the table 'public.nexus_ocorrencias' in the schema cache",
  }, 'nexus_ocorrencias'), true)
  assert.equal(isMissingSupabaseRelation({ code: '42501', message: 'permission denied' }, 'nexus_ocorrencias'), false)
  assert.equal(isMissingSupabaseRelation({ code: 'PGRST205', message: 'missing another_table' }, 'nexus_ocorrencias'), false)
})
