import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPrimeCliente, formatSistemaCliente, isClientePrime } from '../lib/cliente-softcom.ts'

test('normaliza a caixa do sistema — os dois formatos do banco viram o mesmo rótulo', () => {
  assert.equal(formatSistemaCliente('SOFTSHOP'), 'Softshop')
  assert.equal(formatSistemaCliente('Softshop'), 'Softshop')
  assert.equal(formatSistemaCliente('SOFTCOMSHOP'), 'Softcomshop')
  assert.equal(formatSistemaCliente('Softcomshop'), 'Softcomshop')
  assert.equal(formatSistemaCliente('SOFTMOV'), 'Softmov')
  assert.equal(formatSistemaCliente('MEU CARRINHO'), 'Meu Carrinho')
})

test('sistema sem valor retorna null para o chamador decidir o placeholder', () => {
  assert.equal(formatSistemaCliente(null), null)
  assert.equal(formatSistemaCliente(undefined), null)
  assert.equal(formatSistemaCliente(''), null)
  assert.equal(formatSistemaCliente('   '), null)
})

test('um sistema desconhecido não some da tela — cai em title case', () => {
  assert.equal(formatSistemaCliente('SISTEMA NOVO'), 'Sistema Novo')
  assert.equal(formatSistemaCliente('  softpdv  '), 'Softpdv')
})

test('prime lê a string "true"/"false" que o banco realmente grava', () => {
  assert.equal(isClientePrime('true'), true)
  assert.equal(isClientePrime('false'), false)
  assert.equal(formatPrimeCliente('true'), 'Sim')
  assert.equal(formatPrimeCliente('false'), 'Não')
})

test('prime sem informação é "—", nunca "Não" — ausência não é negação', () => {
  assert.equal(isClientePrime(null), null)
  assert.equal(isClientePrime(undefined), null)
  assert.equal(isClientePrime(''), null)
  assert.equal(formatPrimeCliente(null), '—')
  assert.equal(formatPrimeCliente(undefined), '—')
  assert.equal(formatPrimeCliente(''), '—')
})

test('prime aceita boolean e variações de texto, caso a coluna mude de tipo', () => {
  assert.equal(isClientePrime(true), true)
  assert.equal(isClientePrime(false), false)
  assert.equal(isClientePrime('TRUE'), true)
  assert.equal(isClientePrime(' Sim '), true)
  assert.equal(isClientePrime('não'), false)
  assert.equal(isClientePrime('1'), true)
  assert.equal(isClientePrime('0'), false)
})

test('valor inesperado em prime não vira "Sim" por acidente', () => {
  assert.equal(isClientePrime('talvez'), null)
  assert.equal(formatPrimeCliente('talvez'), '—')
})
