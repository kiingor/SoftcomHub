import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atendenteJaRespondeu,
  bloquearDevolucao,
  carregarMarcaTransbordo,
  efeitoDaAtribuicao,
  isDevolucaoParaOrigem,
  isRecebidoPorTransbordo,
  lerMarcaTransbordo,
  limparMarcaTransbordo,
  marcarTransbordoRecebido,
  registrarOrigemDaAtribuicao,
  respondeuDepoisDoTransbordo,
  SEM_MARCA_TRANSBORDO,
} from '../lib/transbordo-marca.ts'

const PRIME = 'subsetor-prime'
const SUPORTE = 'subsetor-suporte'
const TRANSBORDO_EM = '2026-08-12T13:00:00.000Z'

const marcaViva = { recebidoEm: TRANSBORDO_EM, subsetorOrigemId: PRIME, hops: 1 }

/**
 * Supabase falso: registra as consultas montadas e devolve o que for pedido.
 * `erro` simula o PostgREST recusando a consulta — que é exatamente o que
 * acontece enquanto a migration não é aplicada no Studio.
 */
function fakeSupabase({ linhas = [{ id: 't1' }], erro = null } = {}) {
  const chamadas = []
  let atual = null

  const encadeia = {
    eq(coluna, valor) { atual.filtros.push(['eq', coluna, valor]); return encadeia },
    gte(coluna, valor) { atual.filtros.push(['gte', coluna, valor]); return encadeia },
    is(coluna, valor) { atual.filtros.push(['is', coluna, valor]); return encadeia },
    not(coluna, operador, valor) { atual.filtros.push(['not', coluna, operador, valor]); return encadeia },
    select(colunas) { atual.select = colunas; return encadeia },
    limit(n) {
      atual.limit = n
      return Promise.resolve({ data: erro ? null : linhas, error: erro })
    },
    maybeSingle() {
      return Promise.resolve({ data: erro ? null : (linhas[0] ?? null), error: erro })
    },
  }

  return {
    chamadas,
    from(tabela) {
      atual = { tabela, filtros: [], update: null, select: null }
      chamadas.push(atual)
      return {
        select(colunas) { atual.select = colunas; return encadeia },
        update(valores) { atual.update = valores; return encadeia },
      }
    },
  }
}

test('ticket sem as colunas — antes da migration — é lido como sem marca', () => {
  // Requisito de deploy: o código sobe antes de a coluna existir. Nesse
  // intervalo a marca é ausente e tudo se comporta como hoje.
  assert.deepEqual(lerMarcaTransbordo({ id: 't1', status: 'aberto' }), SEM_MARCA_TRANSBORDO)
  assert.deepEqual(lerMarcaTransbordo(null), SEM_MARCA_TRANSBORDO)
  assert.equal(isRecebidoPorTransbordo(lerMarcaTransbordo({})), false)
})

test('meia marca não é marca: falta a fila de origem ou o instante', () => {
  assert.equal(isRecebidoPorTransbordo({ recebidoEm: TRANSBORDO_EM, subsetorOrigemId: null, hops: 1 }), false)
  assert.equal(isRecebidoPorTransbordo({ recebidoEm: null, subsetorOrigemId: PRIME, hops: 1 }), false)
  assert.equal(isRecebidoPorTransbordo(marcaViva), true)
})

test('atribuição por transbordo marca; pelo próprio subsetor, não', () => {
  assert.equal(efeitoDaAtribuicao('transbordo', PRIME), 'marcar')
  assert.equal(efeitoDaAtribuicao('proprio', PRIME), 'limpar')
  assert.equal(efeitoDaAtribuicao('ninguem', PRIME), 'limpar')
  // Ticket sem subsetor não tem fila de origem para onde ser devolvido.
  assert.equal(efeitoDaAtribuicao('transbordo', null), 'limpar')
})

test('a atribuição pelo próprio subsetor apaga marca velha de um ciclo anterior', async () => {
  const sb = fakeSupabase()
  await registrarOrigemDaAtribuicao(sb, 'ticket-1', 'proprio', PRIME)

  const [limpeza] = sb.chamadas
  assert.equal(limpeza.tabela, 'tickets')
  assert.deepEqual(limpeza.update, {
    transbordo_recebido_em: null,
    transbordo_subsetor_origem_id: null,
  })
  // O filtro deixa o banco decidir se há o que escrever: na atribuição comum,
  // nenhuma linha é tocada.
  assert.ok(limpeza.filtros.some(([op, coluna]) => op === 'not' && coluna === 'transbordo_recebido_em'))
  // Os hops NÃO são zerados — medem cobertura crônica ao longo da vida do ticket.
  assert.equal('transbordo_subsetor_hops' in limpeza.update, false)
})

test('a atribuição por transbordo grava origem, instante e soma um hop', async () => {
  const sb = fakeSupabase({ linhas: [{ transbordo_subsetor_hops: 2 }] })
  const marcou = await marcarTransbordoRecebido(sb, 'ticket-1', PRIME, TRANSBORDO_EM)

  assert.equal(marcou, true)
  const escrita = sb.chamadas.at(-1)
  assert.deepEqual(escrita.update, {
    transbordo_recebido_em: TRANSBORDO_EM,
    transbordo_subsetor_origem_id: PRIME,
    transbordo_subsetor_hops: 3,
  })
})

test('devolução imediata para a fila de origem é recusada', () => {
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(isDevolucaoParaOrigem(marcaViva, devolucao), true)
  assert.equal(bloquearDevolucao(marcaViva, devolucao, false), true)
})

test('transferir para outro destino continua permitido', () => {
  // Outro subsetor do mesmo setor…
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: SUPORTE, colaboradorId: null }, false), false)
  // …e outro setor, que sempre chega com outro subsetor.
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: 'subsetor-de-outro-setor', colaboradorId: null }, false), false)
})

test('entregar a um atendente nomeado do subsetor de origem continua permitido', () => {
  // É o oposto do problema: o ticket ganha dono em vez de voltar para a fila
  // vazia. Bloquear isso puniria a saída legítima.
  assert.equal(
    bloquearDevolucao(marcaViva, { subsetorId: PRIME, colaboradorId: 'atendente-do-prime' }, false),
    false,
  )
})

test('depois de responder ao cliente, a devolução passa', () => {
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: PRIME, colaboradorId: null }, true), false)
})

test('ticket sem marca — os antigos e os do período antes da migration — transferem como hoje', () => {
  for (const marca of [null, undefined, SEM_MARCA_TRANSBORDO]) {
    assert.equal(bloquearDevolucao(marca, { subsetorId: PRIME, colaboradorId: null }, false), false)
  }
})

test('só mensagem de atendente depois do transbordo conta como atendimento', () => {
  const antes = { remetente: 'colaborador', enviado_em: '2026-08-12T12:59:00.000Z' }
  const notaInterna = { remetente: 'supervisor', enviado_em: '2026-08-12T13:05:00.000Z' }
  // A própria transferência grava uma mensagem 'sistema' — ela não pode
  // liberar a devolução seguinte.
  const doSistema = { remetente: 'sistema', enviado_em: '2026-08-12T13:05:00.000Z' }
  const doCliente = { remetente: 'cliente', enviado_em: '2026-08-12T13:06:00.000Z' }
  const resposta = { remetente: 'colaborador', enviado_em: '2026-08-12T13:07:00.000Z' }

  assert.equal(respondeuDepoisDoTransbordo([antes, notaInterna, doSistema, doCliente], TRANSBORDO_EM), false)
  assert.equal(respondeuDepoisDoTransbordo([antes, resposta], TRANSBORDO_EM), true)
  assert.equal(respondeuDepoisDoTransbordo([resposta], null), false)
  assert.equal(respondeuDepoisDoTransbordo(null, TRANSBORDO_EM), false)
})

test('a resposta conta pelo instante, não pelo texto da data', () => {
  // O banco devolve `+00:00` e a marca é gravada com `Z`. Comparadas como
  // string, `...13:00:30+00:00` fica ANTES de `...13:00:00.000Z` e a resposta
  // do atendente seria ignorada.
  const respostaComOffset = { remetente: 'colaborador', enviado_em: '2026-08-12T13:00:30+00:00' }
  assert.equal(respondeuDepoisDoTransbordo([respostaComOffset], TRANSBORDO_EM), true)

  const anteriorComOffset = { remetente: 'colaborador', enviado_em: '2026-08-12T12:59:30+00:00' }
  assert.equal(respondeuDepoisDoTransbordo([anteriorComOffset], TRANSBORDO_EM), false)
})

test('a checagem no servidor procura resposta de atendente a partir do transbordo', async () => {
  const sb = fakeSupabase({ linhas: [] })
  assert.equal(await atendenteJaRespondeu(sb, 'ticket-1', TRANSBORDO_EM), false)

  const [consulta] = sb.chamadas
  assert.equal(consulta.tabela, 'mensagens')
  assert.deepEqual(consulta.filtros, [
    ['eq', 'ticket_id', 'ticket-1'],
    ['eq', 'remetente', 'colaborador'],
    ['gte', 'enviado_em', TRANSBORDO_EM],
  ])
  assert.equal(consulta.limit, 1)
})

test('consulta recusada libera a transferência em vez de barrar quem tem direito', async () => {
  const sb = fakeSupabase({ erro: { message: 'timeout' } })
  assert.equal(await atendenteJaRespondeu(sb, 'ticket-1', TRANSBORDO_EM), true)
})

test('coluna ausente não derruba nada: leitura vira sem marca, escrita vira falso', async () => {
  const erro = { message: 'column tickets.transbordo_recebido_em does not exist' }

  assert.deepEqual(await carregarMarcaTransbordo(fakeSupabase({ erro }), 't1'), SEM_MARCA_TRANSBORDO)
  assert.equal(await marcarTransbordoRecebido(fakeSupabase({ erro }), 't1', PRIME), false)
  assert.equal(await limparMarcaTransbordo(fakeSupabase({ erro }), 't1'), false)
})

test('a leitura da marca não toca em nenhuma coluna fora das três novas', async () => {
  // As colunas ficam isoladas nesta consulta de propósito: incluí-las num
  // `select` existente faria o PostgREST recusar a consulta inteira enquanto a
  // migration não fosse aplicada.
  const sb = fakeSupabase({ linhas: [{ transbordo_recebido_em: TRANSBORDO_EM, transbordo_subsetor_origem_id: PRIME, transbordo_subsetor_hops: 1 }] })
  const marca = await carregarMarcaTransbordo(sb, 'ticket-1')

  assert.deepEqual(marca, marcaViva)
  assert.equal(
    sb.chamadas[0].select,
    'transbordo_recebido_em, transbordo_subsetor_origem_id, transbordo_subsetor_hops',
  )
})
