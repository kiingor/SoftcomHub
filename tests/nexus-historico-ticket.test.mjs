import assert from 'node:assert/strict'
import test from 'node:test'
import {
  JANELA_HISTORICO_HORAS,
  TOLERANCIA_CONTEXTO_NEXUS_MS,
  calcularJanelaHistoricoTicket,
  calcularInicioJanelaHistoricoIso,
  selecionarIdsContextoNexusOrfao,
  pertenceAoContextoDoTicket,
  selecionarInicioHumanoDoTicket,
} from '../lib/nexus-historico-ticket.ts'

const HORA_EM_MS = 60 * 60 * 1000

function msg(id, remetente, enviado_em, ticket_id = null) {
  return { id, remetente, enviado_em, ticket_id }
}

test('cruzamento de meia-noite: órfã do Nexus antes da 00h ainda entra na janela do ticket aberto logo depois', () => {
  // Ticket aberto às 00h30; a conversa do bot foi 23h00 do dia anterior — em
  // "hoje desde meia-noite" isso sumia. Relativo ao criado_em, está a 1h30
  // dentro da janela de 24h.
  const ticketCriadoEm = '2026-08-03T00:30:00.000Z'
  const mensagens = [msg('m1', 'bot-nexus', '2026-08-02T23:00:00.000Z')]

  const ids = selecionarIdsContextoNexusOrfao(mensagens, ticketCriadoEm)

  assert.equal(ids.has('m1'), true)
})

test('limite de 24h: mensagem exatamente no início da janela entra, um ms antes fica de fora', () => {
  const ticketCriadoEm = '2026-08-03T12:00:00.000Z'
  const janela = calcularJanelaHistoricoTicket(ticketCriadoEm)
  assert.equal(janela.inicioMs, new Date(ticketCriadoEm).getTime() - JANELA_HISTORICO_HORAS * HORA_EM_MS)

  const noLimite = msg('m1', 'cliente-nexus', new Date(janela.inicioMs).toISOString())
  const forDoLimite = msg('m2', 'cliente-nexus', new Date(janela.inicioMs - 1).toISOString())

  const ids = selecionarIdsContextoNexusOrfao([noLimite, forDoLimite], ticketCriadoEm)

  assert.equal(ids.has('m1'), true)
  assert.equal(ids.has('m2'), false)
})

test('tolerância de 5min pós-criação: mensagem no limite entra, além dele fica de fora — só para classificar contexto Nexus', () => {
  const ticketCriadoEm = '2026-08-03T12:00:00.000Z'
  const janela = calcularJanelaHistoricoTicket(ticketCriadoEm)
  assert.equal(janela.fimContextoMs, new Date(ticketCriadoEm).getTime() + TOLERANCIA_CONTEXTO_NEXUS_MS)

  const noLimite = msg('m1', 'bot-nexus', new Date(janela.fimContextoMs).toISOString())
  const alemDoLimite = msg('m2', 'bot-nexus', new Date(janela.fimContextoMs + 1).toISOString())

  const ids = selecionarIdsContextoNexusOrfao([noLimite, alemDoLimite], ticketCriadoEm)

  assert.equal(ids.has('m1'), true)
  assert.equal(ids.has('m2'), false)
})

test('isolamento entre dois tickets do mesmo cliente: cada ticket só reclassifica órfãs dentro da própria janela', () => {
  const ticketA = { id: 'ticket-a', criado_em: '2026-08-01T10:00:00.000Z' }
  const ticketB = { id: 'ticket-b', criado_em: '2026-08-03T10:00:00.000Z' }

  // Órfã próxima da criação do ticket A, muito antes da janela do ticket B (2 dias antes).
  const orfaProximaDeA = msg('orfa-1', 'bot-nexus', '2026-08-01T09:00:00.000Z')

  const idsParaA = selecionarIdsContextoNexusOrfao([orfaProximaDeA], ticketA.criado_em)
  const idsParaB = selecionarIdsContextoNexusOrfao([orfaProximaDeA], ticketB.criado_em)

  assert.equal(idsParaA.has('orfa-1'), true)
  assert.equal(idsParaB.has('orfa-1'), false)

  // Mensagem já vinculada ao ticket A nunca conta como contexto do ticket B.
  const vinculadaAoA = msg('m-a', 'colaborador', ticketA.criado_em, ticketA.id)
  assert.equal(pertenceAoContextoDoTicket(vinculadaAoA, ticketA.id, idsParaA), true)
  assert.equal(pertenceAoContextoDoTicket(vinculadaAoA, ticketB.id, idsParaB), false)
})

test('resposta tardia do bot-nexus já ligada ao ticket: continua no contexto do ticket mas não vira o início humano', () => {
  const ticketId = 'ticket-1'
  const ticketCriadoEm = '2026-08-03T12:00:00.000Z'

  const respostaTardia = msg('m-tardia', 'bot-nexus', '2026-08-03T14:30:00.000Z', ticketId) // 2h30 depois, bem fora dos 5min
  const primeiraHumana = msg('m-humana', 'colaborador', '2026-08-03T15:00:00.000Z', ticketId)
  const mensagensOrdenadas = [respostaTardia, primeiraHumana]

  const idsOrfaos = selecionarIdsContextoNexusOrfao(mensagensOrdenadas, ticketCriadoEm)

  // Já tem ticket_id === ticketId, então pertence ao contexto mesmo fora da tolerância de 5min.
  assert.equal(pertenceAoContextoDoTicket(respostaTardia, ticketId, idsOrfaos), true)

  // Mas o início humano pula a mensagem do Nexus e ancora na primeira mensagem que não é dele.
  assert.equal(selecionarInicioHumanoDoTicket(mensagensOrdenadas, ticketId), 'm-humana')
})

test('ticket sem mensagem humana ainda: início humano fica indefinido, sem lançar erro', () => {
  const ticketId = 'ticket-1'
  const mensagensOrdenadas = [
    msg('m1', 'cliente-nexus', '2026-08-03T11:00:00.000Z'),
    msg('m2', 'bot-nexus', '2026-08-03T11:05:00.000Z', ticketId),
  ]

  assert.equal(selecionarInicioHumanoDoTicket(mensagensOrdenadas, ticketId), undefined)
})

test('timestamp inválido do ticket não lança erro e trata como sem contexto Nexus conhecido', () => {
  assert.equal(calcularJanelaHistoricoTicket('data-invalida'), null)
  assert.equal(calcularJanelaHistoricoTicket(null), null)
  assert.equal(calcularJanelaHistoricoTicket(undefined), null)
  assert.equal(calcularJanelaHistoricoTicket(''), null)

  const mensagens = [msg('m1', 'bot-nexus', '2026-08-03T11:00:00.000Z')]
  const ids = selecionarIdsContextoNexusOrfao(mensagens, 'data-invalida')
  assert.equal(ids.size, 0)

  // A query precisa de um piso, mesmo sem criado_em confiável: cai para agora - 24h.
  const agora = new Date('2026-08-03T12:00:00.000Z')
  const inicioIso = calcularInicioJanelaHistoricoIso('data-invalida', agora)
  assert.equal(inicioIso, new Date(agora.getTime() - JANELA_HISTORICO_HORAS * HORA_EM_MS).toISOString())
})

test('timestamp inválido em uma mensagem individual não derruba a classificação das demais', () => {
  const ticketCriadoEm = '2026-08-03T12:00:00.000Z'
  const mensagens = [
    msg('valida', 'bot-nexus', '2026-08-03T11:00:00.000Z'),
    msg('invalida', 'bot-nexus', 'nao-e-uma-data'),
  ]

  const ids = selecionarIdsContextoNexusOrfao(mensagens, ticketCriadoEm)

  assert.equal(ids.has('valida'), true)
  assert.equal(ids.has('invalida'), false)
})

test('calcularInicioJanelaHistoricoIso usa criado_em - 24h quando o ticket tem timestamp válido', () => {
  const ticketCriadoEm = '2026-08-03T12:00:00.000Z'
  const inicioIso = calcularInicioJanelaHistoricoIso(ticketCriadoEm)
  assert.equal(inicioIso, new Date(new Date(ticketCriadoEm).getTime() - JANELA_HISTORICO_HORAS * HORA_EM_MS).toISOString())
})
