import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atendenteJaRespondeu,
  bloquearDevolucao,
  carregarMarcaTransbordo,
  descreverTransbordoRecebido,
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
import { escolherDestino } from '../lib/distribuicao-fila.ts'

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

test('a atribuição por transbordo estampa a marca pelo mesmo caminho', async () => {
  const sb = fakeSupabase({ linhas: [{ transbordo_subsetor_hops: 0 }] })
  await registrarOrigemDaAtribuicao(sb, 'ticket-1', 'transbordo', PRIME)

  const escrita = sb.chamadas.at(-1)
  assert.equal(escrita.tabela, 'tickets')
  assert.deepEqual(Object.keys(escrita.update).sort(), [
    'transbordo_recebido_em',
    'transbordo_subsetor_hops',
    'transbordo_subsetor_origem_id',
  ])
  assert.equal(escrita.update.transbordo_subsetor_origem_id, PRIME)
  assert.equal(escrita.update.transbordo_subsetor_hops, 1)
  assert.ok(
    Number.isFinite(Date.parse(escrita.update.transbordo_recebido_em)),
    'o instante do transbordo precisa ser uma data válida',
  )
  assert.deepEqual(escrita.filtros, [['eq', 'id', 'ticket-1']])
})

test('ticket sem subsetor não é marcado, e nem consulta o banco à toa', async () => {
  // Não existe fila de origem para onde devolver — marcar seria inventar uma.
  const sb = fakeSupabase()
  assert.equal(await marcarTransbordoRecebido(sb, 'ticket-1', null), false)
  assert.equal(sb.chamadas.length, 0)
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

test('o segundo transbordo troca a origem e não herda a marca do primeiro', async () => {
  // O ticket foi socorrido pelo Suporte, voltou para a fila e foi socorrido de
  // novo — desta vez saindo do Suporte. Quem manda é o ciclo atual.
  const sb = fakeSupabase({ linhas: [{ transbordo_subsetor_origem_id: PRIME, transbordo_subsetor_hops: 1 }] })
  await marcarTransbordoRecebido(sb, 'ticket-1', SUPORTE, '2026-08-12T15:00:00.000Z')

  assert.deepEqual(sb.chamadas.at(-1).update, {
    transbordo_recebido_em: '2026-08-12T15:00:00.000Z',
    transbordo_subsetor_origem_id: SUPORTE,
    transbordo_subsetor_hops: 2,
  })
})

test('hops ilegível não vira NaN nem número negativo', () => {
  // A coluna é INT NOT NULL DEFAULT 0, mas a leitura não pode explodir com o
  // que vier — inclusive `undefined`, antes da migration.
  assert.equal(lerMarcaTransbordo({ transbordo_subsetor_hops: null }).hops, 0)
  assert.equal(lerMarcaTransbordo({ transbordo_subsetor_hops: -3 }).hops, 0)
  assert.equal(lerMarcaTransbordo({ transbordo_subsetor_hops: 'dois' }).hops, 0)
  assert.equal(lerMarcaTransbordo({ transbordo_subsetor_hops: '2' }).hops, 2)
  assert.equal(lerMarcaTransbordo({ transbordo_subsetor_hops: 2.7 }).hops, 2)
})

test('ticket inexistente devolve sem marca em vez de quebrar', async () => {
  const sb = fakeSupabase({ linhas: [] })
  assert.deepEqual(await carregarMarcaTransbordo(sb, 'ticket-que-sumiu'), SEM_MARCA_TRANSBORDO)
})

test('limpar devolve true quando havia marca e false quando não havia', async () => {
  assert.equal(await limparMarcaTransbordo(fakeSupabase({ linhas: [{ id: 't1' }] }), 't1'), true)
  // Nenhuma linha casou com o filtro — o ticket não tinha marca.
  assert.equal(await limparMarcaTransbordo(fakeSupabase({ linhas: [] }), 't1'), false)
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

test('destino sem subsetor nunca é devolução, mesmo com marca viva', () => {
  // "Fila do setor" (sem subsetor) é outro destino. Casar `null` com `null`
  // travaria a transferência de ticket que nem tem subsetor de origem.
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: null, colaboradorId: null }, false), false)
  assert.equal(
    bloquearDevolucao(
      { recebidoEm: TRANSBORDO_EM, subsetorOrigemId: null, hops: 1 },
      { subsetorId: null, colaboradorId: null },
      false,
    ),
    false,
  )
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

test('o aviso da tela nomeia a fila de origem e diz se já pode transferir', () => {
  const ticket = {
    subsetor_id: PRIME,
    transbordo_recebido_em: TRANSBORDO_EM,
    transbordo_subsetor_origem_id: PRIME,
    transbordo_subsetor_hops: 1,
  }
  const subsetores = [{ id: PRIME, nome: 'Prime' }, { id: SUPORTE, nome: 'Suporte' }]

  assert.deepEqual(descreverTransbordoRecebido(ticket, subsetores, []), {
    subsetorOrigemId: PRIME,
    nomeOrigem: 'Prime',
    vezes: 1,
    jaRespondeu: false,
  })

  const depoisDeResponder = descreverTransbordoRecebido(
    ticket,
    subsetores,
    [{ remetente: 'colaborador', enviado_em: '2026-08-12T13:10:00.000Z' }],
  )
  assert.equal(depoisDeResponder.jaRespondeu, true)
})

test('sem a fila de origem na lista, o aviso cai no embed do próprio ticket', () => {
  // O transbordo não muda o subsetor do ticket: ele continua sendo o do Prime,
  // só que atendido por alguém do Suporte.
  const aviso = descreverTransbordoRecebido(
    {
      subsetor_id: PRIME,
      subsetores: { nome: 'Prime' },
      transbordo_recebido_em: TRANSBORDO_EM,
      transbordo_subsetor_origem_id: PRIME,
    },
    [],
    [],
  )
  assert.equal(aviso.nomeOrigem, 'Prime')
})

test('sem nome em lugar nenhum o aviso continua, só que sem o nome', () => {
  const aviso = descreverTransbordoRecebido(
    {
      subsetor_id: SUPORTE,
      subsetores: { nome: 'Suporte' },
      transbordo_recebido_em: TRANSBORDO_EM,
      transbordo_subsetor_origem_id: PRIME,
    },
    [],
    [],
  )
  assert.equal(aviso.nomeOrigem, null)
  assert.equal(aviso.subsetorOrigemId, PRIME)
})

test('o aviso conta as vezes, para o atendente ver que já é reincidência', () => {
  const aviso = descreverTransbordoRecebido(
    {
      transbordo_recebido_em: TRANSBORDO_EM,
      transbordo_subsetor_origem_id: PRIME,
      transbordo_subsetor_hops: 3,
    },
    [],
    [],
  )
  assert.equal(aviso.vezes, 3)
})

test('sem marca não há aviso — ticket comum, ticket antigo e período antes da migration', () => {
  const semColunas = { subsetor_id: PRIME, subsetores: { nome: 'Prime' } }
  assert.equal(descreverTransbordoRecebido(semColunas, [], []), null)
  assert.equal(descreverTransbordoRecebido(null, [], []), null)
  // Marca pela metade também não vira aviso.
  assert.equal(
    descreverTransbordoRecebido({ transbordo_recebido_em: TRANSBORDO_EM }, [], []),
    null,
  )
  assert.equal(
    descreverTransbordoRecebido({ transbordo_subsetor_origem_id: PRIME }, [], []),
    null,
  )
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

test('achando uma resposta do atendente, a checagem no servidor libera', async () => {
  const sb = fakeSupabase({ linhas: [{ id: 'mensagem-1' }] })
  assert.equal(await atendenteJaRespondeu(sb, 'ticket-1', TRANSBORDO_EM), true)
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

// ─── O caso #97066 de ponta a ponta ────────────────────────────────────────
// A distribuição decide, a atribuição estampa, a transferência consulta. Os
// testes acima cobrem cada peça; estes dois amarram o percurso inteiro, do
// jeito que o caso descreve.

const tecnico = (id, subsetorIds) => ({
  id, subsetorIds, recebidosHoje: 0, ticketsAbertos: 0,
})

test('cenário do caso: Prime vazio → Suporte recebe → devolução travada até responder', () => {
  // 1. Ninguém no Prime; o Suporte tem vaga e a própria fila vazia.
  const destino = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [tecnico('tecnico-do-suporte', [SUPORTE])],
    subsetoresComFila: [PRIME],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(destino.origem, 'transbordo')
  assert.equal(destino.fila[0].id, 'tecnico-do-suporte')

  // 2. A atribuição estampa a marca.
  assert.equal(efeitoDaAtribuicao(destino.origem, PRIME), 'marcar')
  const marca = { recebidoEm: TRANSBORDO_EM, subsetorOrigemId: PRIME, hops: 1 }

  // 3. O atendente do Suporte tenta devolver para a fila do Prime — que
  //    continua vazia. É aqui que o ticket voltava.
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(bloquearDevolucao(marca, devolucao, false), true)

  // 4. Ele responde ao cliente. A devolução deixa de ser reflexa.
  const jaAtendeu = respondeuDepoisDoTransbordo(
    [{ remetente: 'colaborador', enviado_em: '2026-08-12T13:04:00.000Z' }],
    marca.recebidoEm,
  )
  assert.equal(jaAtendeu, true)
  assert.equal(bloquearDevolucao(marca, devolucao, jaAtendeu), false)
})

test('cenário de controle: com técnico no Prime nada disso acontece', () => {
  // Mesmo ticket, mesma fila — só que o Prime tem quem atenda.
  const destino = escolherDestino({
    subsetorDoTicket: PRIME,
    candidatos: [tecnico('tecnico-do-prime', [PRIME]), tecnico('tecnico-do-suporte', [SUPORTE])],
    subsetoresComFila: [PRIME],
    subsetoresComTransbordo: [PRIME, SUPORTE],
    maxTicketsAbertos: 5,
  })
  assert.equal(destino.origem, 'proprio')
  assert.equal(efeitoDaAtribuicao(destino.origem, PRIME), 'limpar')

  // Sem marca, transferir para a fila do Prime é uma transferência qualquer.
  assert.equal(
    bloquearDevolucao(SEM_MARCA_TRANSBORDO, { subsetorId: PRIME, colaboradorId: null }, false),
    false,
  )
})
