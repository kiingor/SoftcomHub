import assert from 'node:assert/strict'
import test from 'node:test'
import {
  tagsPorColaborador,
  tagsVisiveisPara,
  filtroEfetivo,
  atendenteNoFiltro,
  ticketNoFiltroDeTag,
  npsDoAtendente,
  agruparNpsPorColaborador,
  ordenarTags,
  tagsParaFiltro,
} from '../lib/tag-setor.ts'

const SERVICEDESK = 'ca1416cb'
const PITSTOP = 'bc11bc89'
const CHAT = 'tag-suporte-chat'
const PIT = 'tag-pit-stop'

const vinculo = (colaborador_id, setor_id, tag_setor_id) => ({ colaborador_id, setor_id, tag_setor_id })

// ─── tag vem do vínculo ───

test('tag do atendente vem do vínculo, não do canal', () => {
  const mapa = tagsPorColaborador([
    vinculo('ana', SERVICEDESK, CHAT),
    vinculo('bia', SERVICEDESK, PIT),
  ])
  // Mesmo canal, tags diferentes — é isso que a fusão em um canal só exige.
  assert.deepEqual(mapa.get('ana'), [CHAT])
  assert.deepEqual(mapa.get('bia'), [PIT])
})

test('vínculo sem tag não entra no índice', () => {
  const mapa = tagsPorColaborador([vinculo('ana', SERVICEDESK, null)])
  assert.equal(mapa.has('ana'), false)
})

test('mesma tag em dois canais não duplica', () => {
  const mapa = tagsPorColaborador([
    vinculo('ana', SERVICEDESK, PIT),
    vinculo('ana', PITSTOP, PIT),
  ])
  assert.deepEqual(mapa.get('ana'), [PIT])
})

test('atendente em duas operações herda as duas', () => {
  const mapa = tagsPorColaborador([
    vinculo('ana', SERVICEDESK, CHAT),
    vinculo('ana', PITSTOP, PIT),
  ])
  assert.deepEqual(mapa.get('ana'), [CHAT, PIT])
})

// ─── trava do gestor ───

test('master vê todas as tags', () => {
  assert.equal(tagsVisiveisPara([CHAT], true), null)
  assert.equal(tagsVisiveisPara([], true), null)
})

test('gestor sem tag não recebe acesso amplo por fallback', () => {
  assert.deepEqual(tagsVisiveisPara([], false), [])
})

test('canal sem tags mantém a visualização normal', () => {
  assert.equal(tagsVisiveisPara([], false, false), null)
})

test('gestor com tag fica restrito a ela', () => {
  assert.deepEqual(tagsVisiveisPara([PIT], false), [PIT])
})

test('filtro escolhido nunca amplia além da permissão', () => {
  // Gestor do Pit Stop tentando ver Suporte Chat: não passa.
  assert.deepEqual(filtroEfetivo([PIT], [CHAT]), [])
  assert.deepEqual(filtroEfetivo([PIT], [PIT]), [PIT])
})

test('sem escolha, o gestor vê exatamente o próprio recorte', () => {
  assert.deepEqual(filtroEfetivo([PIT], []), [PIT])
})

test('master sem escolha não recorta nada', () => {
  assert.deepEqual(filtroEfetivo(null, []), [])
  assert.deepEqual(filtroEfetivo(null, [CHAT]), [CHAT])
})

test('gestor de duas operações escolhendo uma vê só a escolhida', () => {
  assert.deepEqual(filtroEfetivo([CHAT, PIT], [PIT]), [PIT])
})

// ─── recorte da lista ───

test('filtro vazio não esconde ninguém', () => {
  assert.equal(atendenteNoFiltro([CHAT], []), true)
  assert.equal(atendenteNoFiltro([], []), true)
})

test('filtro ativo esconde quem não é da operação', () => {
  assert.equal(atendenteNoFiltro([CHAT], [PIT]), false)
  assert.equal(atendenteNoFiltro([CHAT, PIT], [PIT]), true)
})

test('atendente sem tag só aparece sem filtro', () => {
  assert.equal(atendenteNoFiltro([], [CHAT]), false)
})

test('fila sem atendente fica visível no monitoramento mesmo com tag ativa', () => {
  const atendentesDoSuporte = new Set(['ana'])

  assert.equal(ticketNoFiltroDeTag(null, atendentesDoSuporte), false)
  assert.equal(ticketNoFiltroDeTag(null, atendentesDoSuporte, true), true)
  assert.equal(ticketNoFiltroDeTag('ana', atendentesDoSuporte, true), true)
  assert.equal(ticketNoFiltroDeTag('bia', atendentesDoSuporte, true), false)
})

// ─── NPS ───

test('NPS soma notas e atendimentos, não faz média de médias', () => {
  const linhas = [
    { colaborador_id: 'a', tag_setor_id: CHAT, total: 40, soma_notas: 400 },
    { colaborador_id: 'a', tag_setor_id: PIT, total: 3, soma_notas: 12 },
  ]
  const geral = npsDoAtendente(linhas, [])
  assert.equal(geral.total, 43)
  // Média real 412/43 = 9.58. Média de médias daria (10+4)/2 = 7.0.
  assert.equal(geral.media.toFixed(2), '9.58')
})

test('NPS por tag isola a operação', () => {
  const linhas = [
    { colaborador_id: 'a', tag_setor_id: CHAT, total: 40, soma_notas: 400 },
    { colaborador_id: 'a', tag_setor_id: PIT, total: 3, soma_notas: 12 },
  ]
  assert.deepEqual(npsDoAtendente(linhas, [CHAT]), { media: 10, total: 40 })
  assert.deepEqual(npsDoAtendente(linhas, [PIT]), { media: 4, total: 3 })
})

test('sem nota devolve null, não zero — zero seria nota ruim', () => {
  assert.equal(npsDoAtendente([], []), null)
  const soChat = [{ colaborador_id: 'a', tag_setor_id: CHAT, total: 5, soma_notas: 45 }]
  assert.equal(npsDoAtendente(soChat, [PIT]), null)
})

test('Pit Stop sem avaliação devolve null — medido em 30/07/2026', () => {
  // Pit Stop só dispara, não recebe chat: 0 avaliações atribuíveis.
  const linhas = [{ colaborador_id: 'a', tag_setor_id: null, total: 4, soma_notas: 36 }]
  assert.equal(npsDoAtendente(linhas, [PIT]), null)
})

test('linha órfã conta no total geral mas fica fora de qualquer tag', () => {
  const linhas = [
    { colaborador_id: 'a', tag_setor_id: CHAT, total: 10, soma_notas: 90 },
    { colaborador_id: 'a', tag_setor_id: null, total: 2, soma_notas: 20 },
  ]
  assert.equal(npsDoAtendente(linhas, []).total, 12)
  assert.equal(npsDoAtendente(linhas, [CHAT]).total, 10)
})

test('agrupa as linhas da view por atendente', () => {
  const porColaborador = agruparNpsPorColaborador([
    { colaborador_id: 'a', tag_setor_id: CHAT, total: 1, soma_notas: 9 },
    { colaborador_id: 'b', tag_setor_id: PIT, total: 2, soma_notas: 14 },
    { colaborador_id: 'a', tag_setor_id: PIT, total: 3, soma_notas: 21 },
  ])
  assert.equal(porColaborador.get('a').length, 2)
  assert.equal(porColaborador.get('b').length, 1)
  assert.equal(porColaborador.has('c'), false)
})

// ─── catálogo e opções de filtro ───

test('ordena por ordem, e por nome no empate com acento do pt-BR', () => {
  const ordenadas = ordenarTags([
    { id: 'z', nome: 'Zulu', cor: '#000', ordem: 0 },
    { id: 'a', nome: 'Ávila', cor: '#000', ordem: 0 },
    { id: 'p', nome: 'Primeiro', cor: '#000', ordem: -1 },
  ])
  assert.deepEqual(ordenadas.map((t) => t.nome), ['Primeiro', 'Ávila', 'Zulu'])
})

test('opção de filtro exige tag em uso E permitida', () => {
  const catalogo = [
    { id: CHAT, nome: 'Suporte Chat', cor: '#3B82F6', ordem: 1 },
    { id: PIT, nome: 'Pit Stop', cor: '#8B5CF6', ordem: 2 },
    { id: 'nunca-usada', nome: 'Rascunho', cor: '#000', ordem: 0 },
  ]
  const vinculos = [
    vinculo('ana', SERVICEDESK, CHAT),
    vinculo('bia', SERVICEDESK, PIT),
  ]
  // Master: as duas em uso, a nunca usada fica fora.
  assert.deepEqual(
    tagsParaFiltro(catalogo, vinculos, null).map((t) => t.nome),
    ['Suporte Chat', 'Pit Stop'],
  )
  // Gestor do Pit Stop: só enxerga a dele.
  assert.deepEqual(
    tagsParaFiltro(catalogo, vinculos, [PIT]).map((t) => t.nome),
    ['Pit Stop'],
  )
})

test('ordenarTags não muta o array recebido', () => {
  const catalogo = [
    { id: 'b', nome: 'B', cor: '#000', ordem: 2 },
    { id: 'a', nome: 'A', cor: '#000', ordem: 1 },
  ]
  ordenarTags(catalogo)
  assert.equal(catalogo[0].id, 'b')
})
