import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
  SEM_MARCA_TRANSBORDO,
} from '../lib/transbordo-marca.ts'
import { hasSupervisorScope } from '../lib/transfer-authorization.ts'
import { escolherDestino } from '../lib/distribuicao-fila.ts'

const SETOR = 'setor-servicedesk'
const PRIME = 'subsetor-prime'
const SUPORTE = 'subsetor-suporte'
const TRANSBORDO_EM = '2026-08-12T13:00:00.000Z'

const marcaViva = { recebidoEm: TRANSBORDO_EM, subsetorOrigemId: PRIME, hops: 1 }

// Quem pode dispensar o bloqueio sai de `hasSupervisorScope` — a mesma função
// que a rota usa. Os testes compõem as duas peças em vez de assumir o booleano,
// porque é a composição que a produção executa.
const ATENDENTE_COMUM = { id: 'colab-1', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [SETOR] }
const SUPERVISOR_DO_SETOR = { id: 'sup-1', isMaster: false, canSeeAllTickets: true, linkedSetorIds: [SETOR] }
const SUPERVISOR_DE_OUTRO_SETOR = { id: 'sup-2', isMaster: false, canSeeAllTickets: true, linkedSetorIds: ['setor-financeiro'] }
const MASTER = { id: 'master-1', isMaster: true, canSeeAllTickets: false, linkedSetorIds: [] }

const podeAutorizar = (ator) => hasSupervisorScope(ator, SETOR)

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
    is(coluna, valor) { atual.filtros.push(['is', coluna, valor]); return encadeia },
    not(coluna, operador, valor) { atual.filtros.push(['not', coluna, operador, valor]); return encadeia },
    select(colunas) { atual.select = colunas; return encadeia },
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

test('atendente comum não devolve para a fila de origem', () => {
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(isDevolucaoParaOrigem(marcaViva, devolucao), true)
  assert.equal(bloquearDevolucao(marcaViva, devolucao, podeAutorizar(ATENDENTE_COMUM)), true)
})

test('responder ao cliente NÃO libera mais a devolução', () => {
  // O coração da mudança. A primeira versão da regra destravava assim que o
  // atendente falasse com o cliente — e o ticket voltava para a mesma fila
  // vazia, uma resposta depois. Hoje o bloqueio não tem prazo: nada que o
  // atendente faça no ticket muda a resposta, só quem ele é.
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  const horasDepois = { recebidoEm: '2026-08-12T06:00:00.000Z', subsetorOrigemId: PRIME, hops: 1 }

  assert.equal(bloquearDevolucao(marcaViva, devolucao, podeAutorizar(ATENDENTE_COMUM)), true)
  assert.equal(bloquearDevolucao(horasDepois, devolucao, podeAutorizar(ATENDENTE_COMUM)), true)
})

test('supervisor do setor de origem devolve para a fila', () => {
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(bloquearDevolucao(marcaViva, devolucao, podeAutorizar(SUPERVISOR_DO_SETOR)), false)
})

test('master devolve para a fila, mesmo sem vínculo com o setor', () => {
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(bloquearDevolucao(marcaViva, devolucao, podeAutorizar(MASTER)), false)
})

test('supervisor de outro setor não passa por cima — permissão é por vínculo', () => {
  // `can_see_all_tickets` é permissão de enxergar, não procuração sobre a fila
  // de um setor onde ele não trabalha.
  const devolucao = { subsetorId: PRIME, colaboradorId: null }
  assert.equal(bloquearDevolucao(marcaViva, devolucao, podeAutorizar(SUPERVISOR_DE_OUTRO_SETOR)), true)
})

test('transferir para outro destino continua permitido', () => {
  const comum = podeAutorizar(ATENDENTE_COMUM)
  // Outro subsetor do mesmo setor…
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: SUPORTE, colaboradorId: null }, comum), false)
  // …e outro setor, que sempre chega com outro subsetor.
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: 'subsetor-de-outro-setor', colaboradorId: null }, comum), false)
})

test('entregar a um atendente nomeado do subsetor de origem continua permitido', () => {
  // É o oposto do problema: o ticket ganha dono em vez de voltar para a fila
  // vazia. Bloquear isso puniria a saída legítima — e é a saída que sobra para
  // o atendente comum, já que a fila agora depende de supervisor.
  assert.equal(
    bloquearDevolucao(
      marcaViva,
      { subsetorId: PRIME, colaboradorId: 'atendente-do-prime' },
      podeAutorizar(ATENDENTE_COMUM),
    ),
    false,
  )
})

test('ticket sem marca — os antigos e os do período antes da migration — transferem como hoje', () => {
  for (const marca of [null, undefined, SEM_MARCA_TRANSBORDO]) {
    assert.equal(
      bloquearDevolucao(marca, { subsetorId: PRIME, colaboradorId: null }, podeAutorizar(ATENDENTE_COMUM)),
      false,
    )
  }
})

test('destino sem subsetor nunca é devolução, mesmo com marca viva', () => {
  // "Fila do setor" (sem subsetor) é outro destino. Casar `null` com `null`
  // travaria a transferência de ticket que nem tem subsetor de origem.
  const comum = podeAutorizar(ATENDENTE_COMUM)
  assert.equal(bloquearDevolucao(marcaViva, { subsetorId: null, colaboradorId: null }, comum), false)
  assert.equal(
    bloquearDevolucao(
      { recebidoEm: TRANSBORDO_EM, subsetorOrigemId: null, hops: 1 },
      { subsetorId: null, colaboradorId: null },
      comum,
    ),
    false,
  )
})

test('o aviso da tela nomeia a fila de origem', () => {
  const ticket = {
    subsetor_id: PRIME,
    transbordo_recebido_em: TRANSBORDO_EM,
    transbordo_subsetor_origem_id: PRIME,
    transbordo_subsetor_hops: 1,
  }
  const subsetores = [{ id: PRIME, nome: 'Prime' }, { id: SUPORTE, nome: 'Suporte' }]

  // O aviso descreve o transbordo e para por aí: quem pode devolver é decisão
  // de permissão, e a tela a resolve com `hasSupervisorScope`.
  assert.deepEqual(descreverTransbordoRecebido(ticket, subsetores), {
    subsetorOrigemId: PRIME,
    nomeOrigem: 'Prime',
    vezes: 1,
  })
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
  )
  assert.equal(aviso.vezes, 3)
})

test('sem marca não há aviso — ticket comum, ticket antigo e período antes da migration', () => {
  const semColunas = { subsetor_id: PRIME, subsetores: { nome: 'Prime' } }
  assert.equal(descreverTransbordoRecebido(semColunas, []), null)
  assert.equal(descreverTransbordoRecebido(null, []), null)
  // Marca pela metade também não vira aviso.
  assert.equal(
    descreverTransbordoRecebido({ transbordo_recebido_em: TRANSBORDO_EM }, []),
    null,
  )
  assert.equal(
    descreverTransbordoRecebido({ transbordo_subsetor_origem_id: PRIME }, []),
    null,
  )
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

test('cenário do caso: Prime vazio → Suporte recebe → só supervisor devolve', () => {
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
  assert.equal(bloquearDevolucao(marca, devolucao, podeAutorizar(ATENDENTE_COMUM)), true)

  // 4. Ele atende o cliente e tenta de novo. Continua barrado: a fila do Prime
  //    não ganhou atendente por causa disso, e era só isso que o bloqueio
  //    protegia. O que sobra para ele são as saídas que não reiniciam o ciclo.
  assert.equal(bloquearDevolucao(marca, devolucao, podeAutorizar(ATENDENTE_COMUM)), true)
  assert.equal(
    bloquearDevolucao(marca, { subsetorId: PRIME, colaboradorId: 'tecnico-do-prime' }, podeAutorizar(ATENDENTE_COMUM)),
    false,
  )

  // 5. O supervisor do setor olha as duas filas e decide devolver mesmo assim.
  assert.equal(bloquearDevolucao(marca, devolucao, podeAutorizar(SUPERVISOR_DO_SETOR)), false)
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

  // Sem marca, transferir para a fila do Prime é uma transferência qualquer —
  // atendente comum inclusive.
  assert.equal(
    bloquearDevolucao(
      SEM_MARCA_TRANSBORDO,
      { subsetorId: PRIME, colaboradorId: null },
      podeAutorizar(ATENDENTE_COMUM),
    ),
    false,
  )
})
