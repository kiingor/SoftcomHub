import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canUseLegacyChannelFallback,
  isConfiguredLegacyEvolutionChannel,
  isConfiguredLegacyWhatsappChannel,
  isTicketReplySenderAllowed,
  readResponseBodyWithLimit,
  resolvePersistedRecipient,
  resolveReplyQuote,
  selectAuthorizedTicketChannel,
  selectOutboundChannelEvidence,
  selectRequestedActiveChannel,
  validateOutboundMediaUrl,
} from '../lib/message-send-target.ts'
import {
  OUVIDORIA_MATRIZ_SECTOR_ID,
  SERVICE_DESK_MATRIZ_SECTOR_ID,
  resolveSharedChannelOwnerId,
} from '../lib/nexus-channel-resolution.ts'

test('uses the ticket phone and accepts equivalent Brazilian formatting', () => {
  const result = resolvePersistedRecipient(
    '(15) 99999-1234',
    '55 15 99999-1234',
  )

  assert.deepEqual(result, { ok: true, phone: '5515999991234' })
})

test('rejects a recipient phone that differs from the ticket client', () => {
  const result = resolvePersistedRecipient(
    '(15) 99999-1234',
    '(11) 98888-4321',
  )

  assert.equal(result.ok, false)
  assert.equal(result.code, 'RECIPIENT_MISMATCH')
})

test('never falls back to another active channel when an identifier was requested', () => {
  const channels = [
    { id: 'channel-a', identifier: 'instance-a' },
    { id: 'channel-b', identifier: 'instance-b' },
  ]

  const selected = selectRequestedActiveChannel(
    channels,
    'instance-from-another-sector',
    (channel) => channel.identifier,
  )

  assert.equal(selected, null)
})

test('allows replies to converted Nexus history but rejects unrelated senders', () => {
  assert.equal(isTicketReplySenderAllowed('cliente'), true)
  assert.equal(isTicketReplySenderAllowed('colaborador'), true)
  assert.equal(isTicketReplySenderAllowed('cliente-nexus'), true)
  assert.equal(isTicketReplySenderAllowed('bot-nexus'), true)
  assert.equal(isTicketReplySenderAllowed('sistema'), false)
  assert.equal(isTicketReplySenderAllowed('supervisor'), false)
})

test('legacy fallback is available only when no modern configuration exists', () => {
  assert.equal(canUseLegacyChannelFallback([]), true)
  assert.equal(canUseLegacyChannelFallback([{ ativo: false }]), false)
})

test('recognizes only unambiguous, configured legacy provider channels', () => {
  assert.equal(isConfiguredLegacyWhatsappChannel({
    canal: 'whatsapp',
    phone_number_id: 'phone-id',
    whatsapp_token: null,
  }, 'global-token'), true)
  assert.equal(isConfiguredLegacyWhatsappChannel({
    canal: 'evolution_api',
    phone_number_id: 'phone-id',
    whatsapp_token: 'wrong-provider-token',
  }, null), false)
  assert.equal(isConfiguredLegacyEvolutionChannel({
    canal: null,
    instancia: 'legacy-instance',
    phone_number_id: null,
    evolution_base_url: 'https://evolution.example.test',
    evolution_api_key: 'api-key',
  }), true)
  assert.equal(isConfiguredLegacyEvolutionChannel({
    canal: 'evolution_api',
    instancia: null,
    phone_number_id: 'legacy-phone-id',
    evolution_base_url: 'https://evolution.example.test',
    evolution_api_key: 'api-key',
  }), true)
  assert.equal(isConfiguredLegacyEvolutionChannel({
    canal: 'whatsapp',
    instancia: null,
    phone_number_id: 'legacy-instance',
    evolution_base_url: 'https://evolution.example.test',
    evolution_api_key: 'api-key',
  }), false)
})

const serviceDeskChannel = {
  id: 'service-desk-channel',
  sectorId: SERVICE_DESK_MATRIZ_SECTOR_ID,
  identifier: 'shared-phone-id',
}
const ouvidoriaChannel = {
  id: 'ouvidoria-channel',
  sectorId: OUVIDORIA_MATRIZ_SECTOR_ID,
  identifier: 'shared-phone-id',
}

function selectAuthorizedChannel({
  current = [],
  active = [],
  evidence = [],
  requested = 'historical-phone-id',
} = {}) {
  return selectAuthorizedTicketChannel({
    currentActiveChannels: current,
    matchingActiveChannels: active,
    historicalEvidence: evidence,
    requestedIdentifier: requested,
    getIdentifier: (channel) => channel.identifier,
    getOwnerId: (channel) => channel.sectorId,
    resolveOwnerId: resolveSharedChannelOwnerId,
  })
}

test('allows an active historical channel proven by an inbound client message', () => {
  const historical = {
    id: 'historical-channel',
    sectorId: 'previous-sector',
    identifier: 'historical-phone-id',
  }

  const selected = selectAuthorizedChannel({
    active: [historical],
    evidence: [{
      sender: 'cliente',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: 'provider-message-1',
    }],
  })

  assert.equal(selected, historical)
})

test('accepts linked cliente-nexus history as trusted inbound channel evidence', () => {
  const historical = {
    id: 'nexus-historical-channel',
    sectorId: 'previous-nexus-sector',
    identifier: 'historical-phone-id',
  }

  const selected = selectAuthorizedChannel({
    active: [historical],
    evidence: [{
      sender: 'cliente-nexus',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: 'provider-nexus-message-1',
    }],
  })

  assert.equal(selected, historical)
})

test('does not accept bot-nexus history as inbound client evidence', () => {
  const selected = selectAuthorizedChannel({
    active: [{
      id: 'nexus-bot-channel',
      sectorId: 'previous-nexus-sector',
      identifier: 'historical-phone-id',
    }],
    evidence: [{
      sender: 'bot-nexus',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: 'provider-nexus-bot-message-1',
    }],
  })

  assert.equal(selected, null)
})

test('rejects an arbitrary active channel without ticket history', () => {
  const selected = selectAuthorizedChannel({
    active: [{
      id: 'unrelated-channel',
      sectorId: 'unrelated-sector',
      identifier: 'historical-phone-id',
    }],
  })

  assert.equal(selected, null)
})

test('does not accept the newly inserted collaborator message as channel evidence', () => {
  const selected = selectAuthorizedChannel({
    active: [{
      id: 'attacker-selected-channel',
      sectorId: 'unrelated-sector',
      identifier: 'historical-phone-id',
    }],
    evidence: [{
      sender: 'colaborador',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: 'forged-provider-message',
    }],
  })

  assert.equal(selected, null)
})

test('a fala do cliente prova o canal mesmo sem id do provedor — caso do transbordo', () => {
  // Quando a fila de uma franquia fica sem atendente, o ticket passa para o
  // ServiceDesk mas o cliente continua falando pela instância de origem, que o
  // novo setor não possui. As mensagens do Evolution costumam chegar sem
  // `whatsapp_message_id`; exigi-lo deixava o atendente sem conseguir responder.
  const selected = selectAuthorizedChannel({
    active: [{
      id: 'historical-channel',
      sectorId: 'previous-sector',
      identifier: 'historical-phone-id',
    }],
    evidence: [{
      sender: 'cliente',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: null,
    }],
  })

  assert.equal(selected?.id, 'historical-channel')
})

test('só a fala do CLIENTE prova o canal — é o que sustenta a regra sem o id do provedor', () => {
  for (const sender of ['colaborador', 'supervisor', 'sistema', 'bot', null]) {
    assert.equal(
      selectAuthorizedChannel({
        active: [{
          id: 'historical-channel',
          sectorId: 'previous-sector',
          identifier: 'historical-phone-id',
        }],
        evidence: [{ sender, channelIdentifier: 'historical-phone-id', providerMessageId: null }],
      }),
      null,
      `remetente ${sender} não pode autorizar canal de outro setor`,
    )
  }
})

test('a evidência não vale para um canal diferente do pedido', () => {
  const selected = selectAuthorizedChannel({
    active: [{
      id: 'historical-channel',
      sectorId: 'previous-sector',
      identifier: 'historical-phone-id',
    }],
    evidence: [{
      sender: 'cliente',
      channelIdentifier: 'outro-canal',
      providerMessageId: null,
    }],
  })

  assert.equal(selected, null)
})

test('rejects historical evidence when the channel is no longer active', () => {
  const selected = selectAuthorizedChannel({
    evidence: [{
      sender: 'cliente',
      channelIdentifier: 'historical-phone-id',
      providerMessageId: 'provider-message-1',
    }],
  })

  assert.equal(selected, null)
})

test('selects the Service Desk owner for the shared Service Desk/Ouvidoria channel', () => {
  const selected = selectAuthorizedChannel({
    current: [ouvidoriaChannel],
    active: [ouvidoriaChannel, serviceDeskChannel],
    requested: 'shared-phone-id',
  })

  assert.equal(selected, serviceDeskChannel)
})

test('fails closed when an active identifier has an unknown ownership collision', () => {
  const selected = selectAuthorizedChannel({
    current: [serviceDeskChannel],
    active: [
      serviceDeskChannel,
      ouvidoriaChannel,
      {
        id: 'third-channel',
        sectorId: 'third-sector',
        identifier: 'shared-phone-id',
      },
    ],
    requested: 'shared-phone-id',
  })

  assert.equal(selected, null)
})

const kenobiChannel = {
  id: 'kenobi-channel',
  sectorId: 'kenobi',
  identifier: 'shared-phone-id',
}
const kenobiFilialChannel = {
  id: 'kenobi-filial-channel',
  sectorId: 'kenobi-filial',
  identifier: 'shared-phone-id',
}

test('canal compartilhado responde pelo setor do próprio ticket', () => {
  // Caso #97049 no Kenobi: o número está cadastrado em dois setores e nenhum é o
  // par ServiceDesk/Ouvidoria, então o dono saía null e o envio morria em
  // CHANNEL_MISMATCH mesmo com o canal ativo no setor do ticket.
  const selected = selectAuthorizedTicketChannel({
    currentActiveChannels: [kenobiChannel],
    matchingActiveChannels: [kenobiChannel, kenobiFilialChannel],
    historicalEvidence: [],
    requestedIdentifier: 'shared-phone-id',
    getIdentifier: (channel) => channel.identifier,
    getOwnerId: (channel) => channel.sectorId,
    resolveOwnerId: (ownerIds) => resolveSharedChannelOwnerId(ownerIds, 'kenobi'),
  })

  assert.equal(selected, kenobiChannel)
})

test('o setor preferido não substitui a prova de que o canal é da conversa', () => {
  const selected = selectAuthorizedTicketChannel({
    currentActiveChannels: [],
    matchingActiveChannels: [kenobiChannel, kenobiFilialChannel],
    historicalEvidence: [{
      sender: 'colaborador',
      channelIdentifier: 'shared-phone-id',
      providerMessageId: null,
    }],
    requestedIdentifier: 'shared-phone-id',
    getIdentifier: (channel) => channel.identifier,
    getOwnerId: (channel) => channel.sectorId,
    resolveOwnerId: (ownerIds) => resolveSharedChannelOwnerId(ownerIds, 'kenobi'),
  })

  assert.equal(selected, null)
})

test('o canal de saída sai da última fala do cliente, não da última mensagem', () => {
  // Caso #97049: o n8n grava toda mensagem bot-nexus com o phone_number_id fixo
  // do Financeiro Matriz. Usando "última mensagem, qualquer remetente", a tela
  // pedia esse número e a rota recusava com CHANNEL_MISMATCH.
  const selected = selectOutboundChannelEvidence([
    { remetente: 'bot-nexus', phone_number_id: '958565544008403' },
    { remetente: 'colaborador', phone_number_id: '958565544008403' },
    { remetente: 'cliente-nexus', phone_number_id: 'canal-de-entrada' },
  ])

  assert.equal(selected?.phone_number_id, 'canal-de-entrada')
})

test('sem fala do cliente, cai na última mensagem do ATENDENTE', () => {
  // Ticket nascido de disparo: não existe prova de canal nenhuma, então manter o
  // comportamento antigo é melhor do que travar o envio. Mas só vale remetente
  // que de fato saiu por um canal.
  const selected = selectOutboundChannelEvidence([
    { remetente: 'sistema', phone_number_id: 'ruido' },
    { remetente: 'colaborador', phone_number_id: 'canal-do-disparo' },
  ])

  assert.equal(selected?.phone_number_id, 'canal-do-disparo')
  assert.equal(selectOutboundChannelEvidence([]), null)
  assert.equal(
    selectOutboundChannelEvidence([{ remetente: 'sistema', phone_number_id: 'ruido' }]),
    null,
  )
})

test('nota interna do supervisor NÃO decide o canal de saída', () => {
  // Ticket #162396, 12/08/2026: o supervisor deixou uma nota interna e o
  // WorkDesk passou a responder pelo pni dela. As 29 notas dos últimos 30 dias
  // foram gravadas com o número do Financeiro Matriz por default da coluna, e
  // nota interna nunca sai por canal nenhum — não pode servir de prova.
  const selected = selectOutboundChannelEvidence([
    { remetente: 'supervisor', phone_number_id: '958565544008403' },
    { remetente: 'colaborador', phone_number_id: 'canal-de-verdade' },
    { remetente: 'cliente', phone_number_id: 'canal-de-entrada' },
  ])

  assert.equal(selected?.phone_number_id, 'canal-de-entrada')
})

test('só a nota do supervisor não serve de prova nenhuma', () => {
  assert.equal(
    selectOutboundChannelEvidence([
      { remetente: 'supervisor', phone_number_id: '958565544008403' },
    ]),
    null,
  )
})

test('bot não decide o canal nem quando é a única mensagem além do sistema', () => {
  // O n8n grava 100% das bot-nexus com identificador fixo.
  for (const remetente of ['bot', 'bot-nexus']) {
    assert.equal(
      selectOutboundChannelEvidence([{ remetente, phone_number_id: '958565544008403' }]),
      null,
      `${remetente} não pode virar prova de canal`,
    )
  }
})

test('allows public HTTPS media and blocks local or private destinations', () => {
  assert.equal(
    validateOutboundMediaUrl(
      'https://example.public.blob.vercel-storage.com/workdesk/file.pdf',
    ).ok,
    true,
  )
  assert.equal(validateOutboundMediaUrl('https://example.com/file.pdf').ok, false)
  assert.equal(
    validateOutboundMediaUrl(
      'https://example.public.blob.vercel-storage.com.evil.test/file.pdf',
    ).ok,
    false,
  )
  assert.equal(validateOutboundMediaUrl('http://example.com/file.pdf').ok, false)
  assert.equal(validateOutboundMediaUrl('https://localhost/file.pdf').ok, false)
  assert.equal(validateOutboundMediaUrl('https://127.0.0.1/file.pdf').ok, false)
  assert.equal(validateOutboundMediaUrl('https://192.168.1.20/file.pdf').ok, false)
  assert.equal(validateOutboundMediaUrl('https://[::1]/file.pdf').ok, false)
})

test('reads a streamed media response only up to the configured byte limit', async () => {
  const withinLimit = new Response(new Uint8Array([1, 2, 3, 4]))
  const tooLarge = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.enqueue(new Uint8Array([4, 5, 6]))
      controller.close()
    },
  }))

  const accepted = await readResponseBodyWithLimit(withinLimit, 4)
  const rejected = await readResponseBodyWithLimit(tooLarge, 5)

  assert.equal(accepted?.byteLength, 4)
  assert.equal(rejected, null)
})

test('rejects media immediately when content-length exceeds the limit', async () => {
  const response = new Response(new Uint8Array([1]), {
    headers: { 'content-length': '100' },
  })

  const result = await readResponseBodyWithLimit(response, 10)

  assert.equal(result, null)
})

test('quotes the parent message when it carries a provider id', () => {
  const result = resolveReplyQuote({ whatsapp_message_id: 'wamid.ABC' })

  assert.deepEqual(result, { providerMessageId: 'wamid.ABC', motivoSemQuote: null })
})

// A citação é enfeite; a mensagem é o que importa. Reprovar o envio por causa
// dela deixava o atendente sem responder o cliente — e como o retry reenvia a
// mesma citação, a mensagem encalhava em "falhou" para sempre. Era a maior fonte
// de falha de envio do sistema: 43 das 76 medidas em 29/07/2026.
//
// Os três casos abaixo cobrem os três motivos. Nenhum pode devolver erro.

test('envia sem quote quando o pai não tem id do provedor', () => {
  // Mensagens do Nexus (cliente-nexus/bot-nexus) nunca têm whatsapp_message_id.
  const result = resolveReplyQuote({ whatsapp_message_id: null })

  assert.deepEqual(result, { providerMessageId: null, motivoSemQuote: 'sem-id-do-provedor' })
})

test('envia sem quote quando o pai não está no ticket', () => {
  const result = resolveReplyQuote(null)

  assert.deepEqual(result, { providerMessageId: null, motivoSemQuote: 'mensagem-nao-encontrada' })
})

test('envia sem quote quando a própria consulta do pai falhou', () => {
  // Falha transitória de banco não pode custar a resposta ao cliente.
  const result = resolveReplyQuote({ whatsapp_message_id: 'wamid.ABC' }, true)

  assert.deepEqual(result, { providerMessageId: null, motivoSemQuote: 'consulta-falhou' })
})

test('nenhum caminho de citação reprova o envio', () => {
  const casos = [
    resolveReplyQuote({ whatsapp_message_id: 'wamid.ABC' }),
    resolveReplyQuote({ whatsapp_message_id: null }),
    resolveReplyQuote(null),
    resolveReplyQuote(undefined),
    resolveReplyQuote({ whatsapp_message_id: 'wamid.ABC' }, true),
  ]
  for (const caso of casos) {
    assert.equal('ok' in caso, false, 'resolveReplyQuote não devolve mais reprovação')
    assert.equal('code' in caso, false, 'não há mais código de erro de citação')
  }
})
