import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyNexusSessionOutcome,
  formatNexusAttendanceType,
  getNexusConversationScopeKey,
  getLatestNexusSessionMessages,
  getNexusMessageActorLabel,
  getNexusMessagePhase,
  hasNexusBotResponse,
  isNexusBotRemetente,
  resolveNexusConversationScopes,
  resolveNexusMessageSector,
  matchesNexusTicketConversationFilter,
  mergeNexusTicketTimeline,
  paginateNexusAggregates,
  shouldStartNewNexusSession,
  summarizeNexusAttendances,
} from '../lib/nexus-monitoring.ts'

test('identifies the Nexus and human phases of a conversation', () => {
  assert.equal(getNexusMessagePhase('cliente-nexus'), 'nexus')
  assert.equal(getNexusMessagePhase('bot-nexus'), 'nexus')
  assert.equal(getNexusMessagePhase('cliente'), 'human')
  assert.equal(getNexusMessagePhase('colaborador'), 'human')
  assert.equal(getNexusMessagePhase('integracao-externa'), 'human')
})

test('labels known actors and formats an unknown sender', () => {
  assert.equal(getNexusMessageActorLabel('cliente-nexus'), 'Cliente · Nexus')
  assert.equal(getNexusMessageActorLabel('bot-nexus'), 'Nexus IA')
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
  assert.equal(matchesNexusTicketConversationFilter('aberto', 'em_conversa', true), true)
  assert.equal(matchesNexusTicketConversationFilter('em_atendimento', 'em_conversa', true), true)
  assert.equal(matchesNexusTicketConversationFilter('aberto', 'em_conversa', false), false)
  assert.equal(matchesNexusTicketConversationFilter('encerrado', 'em_conversa', true), false)
  assert.equal(matchesNexusTicketConversationFilter('encerrado', 'finalizado'), true)
  assert.equal(matchesNexusTicketConversationFilter('aberto', 'finalizado'), false)
  assert.equal(matchesNexusTicketConversationFilter('avaliar', 'em_conversa'), false)
  assert.equal(matchesNexusTicketConversationFilter(null, 'all'), true)
})

test('requires a bot response only before closing a session without a ticket', () => {
  const clientOnlyMessages = [
    { remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:30:00.000Z' },
  ]

  assert.equal(hasNexusBotResponse(clientOnlyMessages), false)
  assert.equal(classifyNexusSessionOutcome({
    messages: clientOnlyMessages,
    ticketId: null,
    nowMs: Date.parse('2026-07-22T10:00:00.000Z'),
  }), null)
  assert.equal(classifyNexusSessionOutcome({
    messages: clientOnlyMessages,
    ticketId: 'ticket-1',
    nowMs: Date.parse('2026-07-22T10:00:00.000Z'),
  }), 'ticket')
})

test('identifies a converted session by ticketId after a bot response', () => {
  const messages = [
    { remetente: 'cliente-nexus', enviado_em: 'invalid-date' },
    { remetente: ' BOT-NEXUS ', enviado_em: 'invalid-date' },
  ]

  assert.equal(hasNexusBotResponse(messages), true)
  assert.equal(classifyNexusSessionOutcome({
    messages,
    ticketId: 'ticket-1',
    nowMs: Number.NaN,
  }), 'ticket')
})

test('closes a bot session without a ticket only after 25 minutes of inactivity', () => {
  const nowMs = Date.parse('2026-07-22T10:00:00.000Z')
  const messagesBeforeBoundary = [
    { remetente: 'bot-nexus', enviado_em: '2026-07-22T09:20:00.000Z' },
    { remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:35:00.001Z' },
  ]
  const messagesAtBoundary = [
    { remetente: 'bot-nexus', enviado_em: '2026-07-22T09:30:00.000Z' },
    { remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:35:00.000Z' },
  ]

  assert.equal(classifyNexusSessionOutcome({
    messages: messagesBeforeBoundary,
    ticketId: null,
    nowMs,
  }), null)
  assert.equal(classifyNexusSessionOutcome({
    messages: messagesAtBoundary,
    ticketId: null,
    nowMs,
  }), 'encerrada_sem_ticket')
})

test('does not close a session whose last message timestamp is invalid', () => {
  assert.equal(classifyNexusSessionOutcome({
    messages: [
      { remetente: 'bot-nexus', enviado_em: '2026-07-22T09:00:00.000Z' },
      { remetente: 'cliente-nexus', enviado_em: 'not-a-date' },
    ],
    ticketId: null,
    nowMs: Date.parse('2026-07-22T10:00:00.000Z'),
  }), null)
})

test('keeps only the latest live session after 25 minutes without messages', () => {
  const messages = [
    { id: 'bot-old', remetente: 'bot-nexus', enviado_em: '2026-07-22T09:00:00.000Z' },
    { id: 'client-new', remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:25:00.000Z' },
    { id: 'client-follow-up', remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:30:00.000Z' },
  ]

  assert.deepEqual(
    getLatestNexusSessionMessages(messages).map((message) => message.id),
    ['client-new', 'client-follow-up'],
  )
  assert.equal(hasNexusBotResponse(getLatestNexusSessionMessages(messages)), false)
})

test('keeps messages in the same live session below the 25-minute boundary', () => {
  const messages = [
    { id: 'bot', remetente: 'bot-nexus', enviado_em: '2026-07-22T09:00:00.000Z' },
    { id: 'client', remetente: 'cliente-nexus', enviado_em: '2026-07-22T09:24:59.999Z' },
  ]

  assert.deepEqual(
    getLatestNexusSessionMessages(messages).map((message) => message.id),
    ['bot', 'client'],
  )
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

test('keeps the same client isolated by canonical Nexus channel', () => {
  const firstChannel = getNexusConversationScopeKey(
    'support',
    'client-1',
    '5515999999999',
    'message-1',
    'channel:first',
  )
  const firstChannelAlias = getNexusConversationScopeKey(
    'support',
    'client-1',
    '5515999999999',
    'message-2',
    'channel:first',
  )
  const secondChannel = getNexusConversationScopeKey(
    'support',
    'client-1',
    '5515999999999',
    'message-3',
    'channel:second',
  )

  assert.equal(firstChannel, firstChannelAlias)
  assert.notEqual(firstChannel, secondChannel)
})

test('starts a new session after a ticket but keeps null-to-ticket conversion together', () => {
  const base = { hasCurrentSession: true, gapMs: 1_000, maxGapMs: 60_000 }

  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: null, incomingTicketId: 'ticket-1' }), false)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: 'ticket-1' }), false)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: null }), true)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: 'ticket-1', incomingTicketId: 'ticket-2' }), true)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: null, incomingTicketId: null, gapMs: 60_000 }), true)
  assert.equal(shouldStartNewNexusSession({ ...base, currentTicketId: null, incomingTicketId: null, gapMs: 61_000 }), true)
})

test('summarizes all aggregated attendances before pagination', () => {
  const attendances = [
    { desfecho: 'ticket' },
    { desfecho: 'ticket' },
    { desfecho: 'encerrada' },
    { desfecho: 'encerrada_sem_ticket' },
  ]

  assert.deepEqual(summarizeNexusAttendances(attendances), {
    total: 4,
    tickets: 2,
    encerradosSemTicket: 2,
    conversionRate: 50,
  })
  assert.deepEqual(summarizeNexusAttendances([]), {
    total: 0,
    tickets: 0,
    encerradosSemTicket: 0,
    conversionRate: 0,
  })
})

test('paginates aggregated results by 12 and normalizes the requested page', () => {
  const attendances = Array.from({ length: 25 }, (_, index) => ({ id: index + 1 }))

  const firstPage = paginateNexusAggregates(attendances, -3)
  const lastPage = paginateNexusAggregates(attendances, 99)

  assert.deepEqual(firstPage.items.map((item) => item.id), Array.from({ length: 12 }, (_, index) => index + 1))
  assert.equal(firstPage.pageIndex, 0)
  assert.equal(firstPage.pageSize, 12)
  assert.equal(firstPage.totalItems, 25)
  assert.equal(firstPage.totalPages, 3)
  assert.deepEqual(lastPage.items.map((item) => item.id), [25])
  assert.equal(lastPage.pageIndex, 2)
  assert.equal(lastPage.totalItems, firstPage.totalItems)
})

test('keeps an empty aggregate on the normalized first page', () => {
  assert.deepEqual(paginateNexusAggregates([], Number.NaN), {
    items: [],
    pageIndex: 0,
    pageSize: 12,
    totalItems: 0,
    totalPages: 1,
  })
})

// --- Setor da mensagem do bot -----------------------------------------------
// O Nexus responde sempre pelo mesmo número, que também é canal de atendimento
// de um setor. Sem esta regra, a resposta do bot cai no setor daquele canal e a
// conversa aparece duplicada no painel.

test('resposta do bot herda o setor da última fala do cliente', () => {
  const setor = resolveNexusMessageSector({
    remetente: 'bot-nexus',
    ownSector: { id: 'financeiro' },   // canal do bot
    lastClientSector: { id: 'servicedesk' },
  })
  assert.deepEqual(setor, { id: 'servicedesk' })
})

test('fala do cliente usa sempre o próprio canal, mesmo com histórico de outro setor', () => {
  const setor = resolveNexusMessageSector({
    remetente: 'cliente-nexus',
    ownSector: { id: 'ouvidoria' },
    lastClientSector: { id: 'servicedesk' },
  })
  assert.deepEqual(setor, { id: 'ouvidoria' })
})

test('bot abrindo a conversa, sem fala anterior do cliente, cai no próprio canal', () => {
  const setor = resolveNexusMessageSector({
    remetente: 'bot-nexus',
    ownSector: { id: 'financeiro' },
    lastClientSector: null,
  })
  assert.deepEqual(setor, { id: 'financeiro' })
})

test('sem setor de nenhum lado devolve null em vez de undefined', () => {
  assert.equal(resolveNexusMessageSector({ remetente: 'bot-nexus', ownSector: null, lastClientSector: null }), null)
  assert.equal(resolveNexusMessageSector({ remetente: 'cliente-nexus', ownSector: undefined, lastClientSector: null }), null)
})

test('reconhece o remetente do bot ignorando caixa e espaços', () => {
  assert.equal(isNexusBotRemetente('bot-nexus'), true)
  assert.equal(isNexusBotRemetente('  BOT-NEXUS  '), true)
  assert.equal(isNexusBotRemetente('cliente-nexus'), false)
  assert.equal(isNexusBotRemetente(null), false)
})

const SERVICEDESK = { id: 'servicedesk', channelKey: 'channel:cli' }
const FINANCEIRO = { id: 'financeiro', channelKey: 'channel:bot' }

// O bot escreve sempre pelo canal da triagem, que pertence ao Financeiro.
const scopeAdapter = {
  getId: (message) => message.id,
  getRemetente: (message) => message.remetente,
  getClienteId: (message) => message.cliente_id,
  getNormalizedPhone: (message) => message.telefone ?? null,
  resolveOwnSector: (message) => (
    message.remetente === 'bot-nexus' ? FINANCEIRO : message.canal ?? null
  ),
}

test('a conversa fica numa linha só quando o bot responde por outro canal', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '83962753000', canal: SERVICEDESK },
    { id: '2', remetente: 'bot-nexus', cliente_id: 'c1', telefone: '83962753000' },
    { id: '3', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '83962753000', canal: SERVICEDESK },
  ], scopeAdapter)

  assert.equal(scoped.length, 3)
  assert.equal(new Set(scoped.map((entry) => entry.groupKey)).size, 1)
  assert.deepEqual(scoped.map((entry) => entry.sector.id), ['servicedesk', 'servicedesk', 'servicedesk'])
  // A ordem de entrada é preservada: é ela que dá a sequência da conversa.
  assert.deepEqual(scoped.map((entry) => entry.message.id), ['1', '2', '3'])
})

test('clientes diferentes no mesmo canal não se misturam', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '8396275300', canal: SERVICEDESK },
    { id: '2', remetente: 'cliente-nexus', cliente_id: 'c2', telefone: '8399990000', canal: SERVICEDESK },
    { id: '3', remetente: 'bot-nexus', cliente_id: 'c2', telefone: '8399990000' },
  ], scopeAdapter)

  const porCliente = new Map(scoped.map((entry) => [entry.message.id, entry.groupKey]))
  assert.notEqual(porCliente.get('1'), porCliente.get('2'))
  assert.equal(porCliente.get('2'), porCliente.get('3'))
})

test('o bot que abre a conversa cai no próprio canal, sem fala anterior para herdar', () => {
  const [scoped] = resolveNexusConversationScopes([
    { id: '1', remetente: 'bot-nexus', cliente_id: 'c1', telefone: '8396275300' },
  ], scopeAdapter)

  assert.equal(scoped.sector.id, 'financeiro')
})

test('a herança acompanha o cliente quando ele muda de setor', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '8396275300', canal: SERVICEDESK },
    { id: '2', remetente: 'bot-nexus', cliente_id: 'c1', telefone: '8396275300' },
    { id: '3', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '8396275300', canal: FINANCEIRO },
    { id: '4', remetente: 'bot-nexus', cliente_id: 'c1', telefone: '8396275300' },
  ], scopeAdapter)

  assert.deepEqual(scoped.map((entry) => entry.sector.id), [
    'servicedesk', 'servicedesk', 'financeiro', 'financeiro',
  ])
})

test('mensagem sem identidade de cliente é descartada, não vira conversa própria', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: null, telefone: null, canal: SERVICEDESK },
    { id: '2', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: null, canal: SERVICEDESK },
  ], scopeAdapter)

  assert.deepEqual(scoped.map((entry) => entry.message.id), ['2'])
  assert.equal(scoped[0].clientKey, 'c1')
})

test('mensagem de canal desconhecido é descartada em vez de cair num setor qualquer', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '8396275300', canal: null },
  ], scopeAdapter)

  assert.equal(scoped.length, 0)
})

test('o telefone identifica o cliente antes do id, para o mesmo número não duplicar', () => {
  const scoped = resolveNexusConversationScopes([
    { id: '1', remetente: 'cliente-nexus', cliente_id: 'c1', telefone: '8396275300', canal: SERVICEDESK },
    { id: '2', remetente: 'bot-nexus', cliente_id: 'c2-duplicado', telefone: '8396275300' },
  ], scopeAdapter)

  assert.equal(new Set(scoped.map((entry) => entry.clientKey)).size, 1)
  assert.equal(scoped[1].sector.id, 'servicedesk')
})
