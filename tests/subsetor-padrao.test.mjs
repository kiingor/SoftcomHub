import assert from 'node:assert/strict'
import test from 'node:test'
import { escolherSubsetorPadrao } from '../lib/subsetor-padrao.ts'

const todos = (...ids) => new Set(ids)

test('prefere Suporte quando existe — é o destino do trabalho não classificado', () => {
  const escolhido = escolherSubsetorPadrao(
    [{ id: 'fin', nome: 'Financeiro' }, { id: 'sup', nome: 'Suporte' }, { id: 'pri', nome: 'Prime' }],
    todos('fin', 'sup', 'pri'),
  )
  assert.equal(escolhido, 'sup')
})

test('reconhece o nome com caixa, acento e espaço sobrando', () => {
  for (const nome of ['SUPORTE', ' Suporte ', 'suporté']) {
    assert.equal(
      escolherSubsetorPadrao([{ id: 'a', nome: 'Prime' }, { id: 'b', nome }], todos('a', 'b')),
      'b',
      `não reconheceu "${nome}"`,
    )
  }
})

test('setor com um subsetor só usa ele, mesmo sem se chamar Suporte', () => {
  // Financeiro Matriz, Ouvidoria Matriz e Comercial Matriz são exatamente isto.
  assert.equal(escolherSubsetorPadrao([{ id: 'fin', nome: 'Financeiro' }], todos('fin')), 'fin')
})

test('NÃO escolhe subsetor sem atendente vinculado — o caso do Kenobi', () => {
  // Lá os 4 atendentes não têm vínculo nenhum. Preencher "Suporte" faria os
  // tickets mirarem um subsetor vazio e caírem no fallback: pior que hoje.
  assert.equal(
    escolherSubsetorPadrao([{ id: 'sup', nome: 'Suporte' }], new Set()),
    null,
  )
})

test('com Suporte vazio e outro subsetor atendido, não desvia para o outro', () => {
  // Mandar para Financeiro porque Suporte está vazio seria inventar roteamento.
  assert.equal(
    escolherSubsetorPadrao(
      [{ id: 'sup', nome: 'Suporte' }, { id: 'fin', nome: 'Financeiro' }],
      todos('fin'),
    ),
    null,
  )
})

test('vários subsetores e nenhum Suporte: não adivinha', () => {
  assert.equal(
    escolherSubsetorPadrao(
      [{ id: 'a', nome: 'Financeiro' }, { id: 'b', nome: 'Ouvidoria' }],
      todos('a', 'b'),
    ),
    null,
  )
})

test('Suporte inativo não vira padrão; sobra um ativo e é ele', () => {
  // Desativar "Suporte" deixa o setor com um subsetor efetivo — mesmo caso do
  // Financeiro Matriz. O que não pode é o inativo ser escolhido.
  assert.equal(
    escolherSubsetorPadrao(
      [{ id: 'sup', nome: 'Suporte', ativo: false }, { id: 'fin', nome: 'Financeiro' }],
      todos('sup', 'fin'),
    ),
    'fin',
  )
})

test('Suporte inativo com dois outros ativos: volta a não adivinhar', () => {
  assert.equal(
    escolherSubsetorPadrao(
      [
        { id: 'sup', nome: 'Suporte', ativo: false },
        { id: 'fin', nome: 'Financeiro' },
        { id: 'ouv', nome: 'Ouvidoria' },
      ],
      todos('sup', 'fin', 'ouv'),
    ),
    null,
  )
})

test('um ativo e um inativo: o ativo é o padrão', () => {
  assert.equal(
    escolherSubsetorPadrao(
      [{ id: 'velho', nome: 'Antigo', ativo: false }, { id: 'fin', nome: 'Financeiro', ativo: true }],
      todos('fin'),
    ),
    'fin',
  )
})

test('setor sem subsetor cadastrado devolve null', () => {
  assert.equal(escolherSubsetorPadrao([], todos()), null)
})

test('ausência de `ativo` conta como ativo', () => {
  // O cadastro antigo pode não trazer a coluna; tratar como inativo esvaziaria
  // o padrão de setores que funcionam hoje.
  assert.equal(escolherSubsetorPadrao([{ id: 'sup', nome: 'Suporte' }], todos('sup')), 'sup')
})
