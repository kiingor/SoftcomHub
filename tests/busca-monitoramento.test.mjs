import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alvoDeBuscaDoTicket,
  correspondeAoTermo,
  normalizarTermoBusca,
} from '../lib/busca-monitoramento.ts'

const casa = (alvo, valor) => correspondeAoTermo(alvo, normalizarTermoBusca(valor))

const ticket = {
  id: '7c9e1a20-1111-2222-3333-444455556666',
  numero: 97049,
  clientes: { nome: 'Maria Souza', telefone: '5511988887777' },
  setores: { nome: 'Financeiro Matriz' },
}

test('termo vazio não filtra nada', () => {
  assert.equal(normalizarTermoBusca(''), null)
  assert.equal(normalizarTermoBusca('   '), null)
  assert.equal(normalizarTermoBusca(null), null)
  assert.equal(normalizarTermoBusca(undefined), null)
  assert.equal(correspondeAoTermo(alvoDeBuscaDoTicket(ticket), null), true)
})

test('"#" solto ainda não é uma busca — é alguém começando a digitar #97049', () => {
  assert.equal(normalizarTermoBusca('#'), null)
  assert.equal(casa(alvoDeBuscaDoTicket(ticket), '#'), true)
})

test('caso #96944: o número casa exato, com # e com espaços sobrando', () => {
  const alvo = alvoDeBuscaDoTicket(ticket)
  assert.equal(casa(alvo, '97049'), true)
  assert.equal(casa(alvo, '#97049'), true)
  assert.equal(casa(alvo, '  #97049  '), true)
  assert.equal(casa(alvo, ' 97049'), true)
})

test('o número também casa por prefixo e por trecho', () => {
  const alvo = alvoDeBuscaDoTicket(ticket)
  assert.equal(casa(alvo, '970'), true)
  assert.equal(casa(alvo, '#970'), true)
  assert.equal(casa(alvo, '704'), true)
  assert.equal(casa(alvo, '97050'), false)
})

test('contato casa sem diferenciar caixa e sem espaços nas pontas', () => {
  const alvo = alvoDeBuscaDoTicket(ticket)
  assert.equal(casa(alvo, 'maria'), true)
  assert.equal(casa(alvo, 'SOUZA'), true)
  assert.equal(casa(alvo, '  Maria Souza  '), true)
  assert.equal(casa(alvo, 'joana'), false)
})

test('telefone casa com máscara, sem máscara e sem o DDI', () => {
  const alvo = alvoDeBuscaDoTicket(ticket)
  assert.equal(casa(alvo, '5511988887777'), true)
  assert.equal(casa(alvo, '11988887777'), true)
  assert.equal(casa(alvo, '(11) 98888-7777'), true)
  assert.equal(casa(alvo, '98888'), true)
  assert.equal(casa(alvo, '11977776666'), false)
})

test('setor casa — é o que a aba Nexus já permitia e as outras não', () => {
  assert.equal(casa(alvoDeBuscaDoTicket(ticket), 'financeiro'), true)
})

test('ticket sem número cai no prefixo do id, que é o que a tela mostra', () => {
  const alvo = alvoDeBuscaDoTicket({ ...ticket, numero: null })
  assert.equal(alvo.numero, '7c9e1a20')
  assert.equal(casa(alvo, '7c9e1a20'), true)
  assert.equal(casa(alvo, '7C9E'), true)
})

test('ticket sem cliente nem setor não quebra e não casa por engano', () => {
  const alvo = alvoDeBuscaDoTicket({ id: 'abc12345', numero: 12 })
  assert.deepEqual(alvo, { numero: 12, contato: null, telefone: null, setor: null })
  assert.equal(casa(alvo, '12'), true)
  assert.equal(casa(alvo, 'maria'), false)
})

test('contato cai no telefone quando o cliente não tem nome', () => {
  const alvo = alvoDeBuscaDoTicket({
    id: 'abc12345',
    numero: 1,
    clientes: { nome: null, telefone: '5511988887777' },
  })
  assert.equal(alvo.contato, '5511988887777')
  assert.equal(casa(alvo, '11988887777'), true)
})

test('conversa do Nexus não tem número e ainda assim é buscável', () => {
  const conversa = { contato: 'Joao Lima', telefone: '5531977776666', setor: 'Suporte Filial' }
  assert.equal(casa(conversa, 'joao'), true)
  assert.equal(casa(conversa, '(31) 97777-6666'), true)
  assert.equal(casa(conversa, 'suporte'), true)
  assert.equal(casa(conversa, '#97049'), false)
})

test('o termo é normalizado uma vez só e reaproveitado nas listas', () => {
  const termo = normalizarTermoBusca('  #97049 ')
  assert.deepEqual(termo, { texto: '#97049', numero: '97049', digitos: '97049' })
  assert.equal(correspondeAoTermo(alvoDeBuscaDoTicket(ticket), termo), true)
})
