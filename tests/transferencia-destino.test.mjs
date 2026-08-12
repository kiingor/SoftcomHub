import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isFilaBloqueada,
  podeConfirmarDestino,
  resolverDestinoTransferencia,
} from '../lib/transferencia-destino.ts'
import { bloquearDevolucao } from '../lib/transbordo-marca.ts'
import { hasSupervisorScope } from '../lib/transfer-authorization.ts'

const SETOR = 'setor-servicedesk'
const OUTRO_SETOR = 'setor-financeiro'
const PRIME = 'subsetor-prime'
const SUPORTE = 'subsetor-suporte'

const ticketNoPrime = { setorId: SETOR, subsetorId: PRIME }

const pedido = (extra) => ({
  temSetorExplicito: false,
  temSubsetorExplicito: false,
  ...extra,
})

test('corpo sem setor e sem subsetor mantém onde o ticket já está', () => {
  assert.deepEqual(
    resolverDestinoTransferencia(ticketNoPrime, pedido({})),
    { setorId: SETOR, subsetorId: PRIME },
  )
})

test('mudar de setor sem dizer o subsetor cai na fila sem subsetor do destino', () => {
  // Subsetor pertence a um setor: carregar o do Prime para o Financeiro
  // apontaria para uma fila que não existe lá.
  assert.deepEqual(
    resolverDestinoTransferencia(ticketNoPrime, pedido({
      setorId: OUTRO_SETOR,
      temSetorExplicito: true,
    })),
    { setorId: OUTRO_SETOR, subsetorId: null },
  )
})

test('subsetor explícito manda, inclusive quando é null', () => {
  assert.deepEqual(
    resolverDestinoTransferencia(ticketNoPrime, pedido({
      subsetorId: SUPORTE,
      temSubsetorExplicito: true,
    })),
    { setorId: SETOR, subsetorId: SUPORTE },
  )
  assert.deepEqual(
    resolverDestinoTransferencia(ticketNoPrime, pedido({
      subsetorId: null,
      temSubsetorExplicito: true,
    })),
    { setorId: SETOR, subsetorId: null },
  )
})

test('repetir o setor atual explicitamente não é mudar de setor', () => {
  // `hasExplicitSetor` com o mesmo id preserva o subsetor: a tela sempre manda
  // o setor, e sem isso toda transferência dentro do setor perderia a fila.
  assert.deepEqual(
    resolverDestinoTransferencia(ticketNoPrime, pedido({
      setorId: SETOR,
      temSetorExplicito: true,
    })),
    { setorId: SETOR, subsetorId: PRIME },
  )
})

test('devolução implícita — sem informar subsetor — também é barrada', () => {
  // É o caminho da API direta: só `ticket_id` no corpo. O destino resolvido é o
  // subsetor atual, que é a fila de origem do transbordo. Sem resolver antes, o
  // bloqueio olharia para `null` e deixaria passar.
  const marca = { recebidoEm: '2026-08-12T13:00:00.000Z', subsetorOrigemId: PRIME, hops: 1 }
  const destino = resolverDestinoTransferencia(ticketNoPrime, pedido({}))
  const devolucao = { subsetorId: destino.subsetorId, colaboradorId: null }

  const atendenteComum = hasSupervisorScope(
    { id: 'colab-1', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [SETOR] },
    SETOR,
  )
  assert.equal(bloquearDevolucao(marca, devolucao, atendenteComum), true)

  // O mesmo atalho na mão do supervisor do setor passa — o bloqueio é de
  // permissão, não de forma da requisição.
  const supervisor = hasSupervisorScope(
    { id: 'sup-1', isMaster: false, canSeeAllTickets: true, linkedSetorIds: [SETOR] },
    SETOR,
  )
  assert.equal(bloquearDevolucao(marca, devolucao, supervisor), false)
})

test('a fila bloqueada é só a do subsetor escolhido', () => {
  assert.equal(isFilaBloqueada(PRIME, PRIME), true)
  assert.equal(isFilaBloqueada(SUPORTE, PRIME), false)
  // Nenhuma seleção não casa com nada — nem com "nenhum bloqueio".
  assert.equal(isFilaBloqueada(undefined, undefined), false)
  assert.equal(isFilaBloqueada(null, null), false)
  assert.equal(isFilaBloqueada(PRIME, undefined), false)
})

test('o botão só liga com subsetor escolhido', () => {
  assert.equal(podeConfirmarDestino({ subsetorSelecionadoId: null, modo: 'queue' }), false)
  assert.equal(podeConfirmarDestino({ subsetorSelecionadoId: PRIME, modo: 'queue' }), true)
})

test('fila bloqueada desliga o botão no modo fila', () => {
  assert.equal(
    podeConfirmarDestino({
      subsetorSelecionadoId: PRIME,
      modo: 'queue',
      subsetorComFilaBloqueada: PRIME,
    }),
    false,
  )
  // Outra fila do mesmo setor continua aberta.
  assert.equal(
    podeConfirmarDestino({
      subsetorSelecionadoId: SUPORTE,
      modo: 'queue',
      subsetorComFilaBloqueada: PRIME,
    }),
    true,
  )
})

test('para supervisor a fila de origem nem chega bloqueada na tela', () => {
  // O WorkDesk só monta `filaBloqueada` quando quem está olhando não pode
  // devolver; para supervisor e master o campo vem vazio, e a fila fica ligada.
  // Este teste é o contrato entre aquela decisão e este componente.
  const ator = (extra) => hasSupervisorScope(
    { id: 'x', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [SETOR], ...extra },
    SETOR,
  )
  const filaBloqueadaNaTela = (podeDevolver) => (podeDevolver ? undefined : PRIME)

  for (const podeDevolver of [ator({ canSeeAllTickets: true }), ator({ isMaster: true })]) {
    assert.equal(podeDevolver, true)
    assert.equal(
      podeConfirmarDestino({
        subsetorSelecionadoId: PRIME,
        modo: 'queue',
        subsetorComFilaBloqueada: filaBloqueadaNaTela(podeDevolver),
      }),
      true,
    )
  }

  // E o atendente comum continua com a fila desligada.
  assert.equal(ator({}), false)
  assert.equal(
    podeConfirmarDestino({
      subsetorSelecionadoId: PRIME,
      modo: 'queue',
      subsetorComFilaBloqueada: filaBloqueadaNaTela(ator({})),
    }),
    false,
  )
})

test('atendente nomeado do subsetor bloqueado continua liberando o botão', () => {
  // Dá dono ao ticket em vez de devolvê-lo a uma fila vazia — é a saída, não o
  // problema.
  assert.equal(
    podeConfirmarDestino({
      subsetorSelecionadoId: PRIME,
      modo: 'attendant',
      atendenteSelecionadoId: 'atendente-do-prime',
      subsetorComFilaBloqueada: PRIME,
    }),
    true,
  )
  // Mas sem escolher quem, não.
  assert.equal(
    podeConfirmarDestino({
      subsetorSelecionadoId: PRIME,
      modo: 'attendant',
      atendenteSelecionadoId: null,
      subsetorComFilaBloqueada: PRIME,
    }),
    false,
  )
})
