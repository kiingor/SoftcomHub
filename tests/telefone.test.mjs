import assert from 'node:assert/strict'
import test from 'node:test'
import { telefoneSemDDI } from '../lib/telefone.ts'

test('remove o 55 de celular e de fixo', () => {
  assert.equal(telefoneSemDDI('5583999999999'), '83999999999') // 55 + DDD + 9 dígitos
  assert.equal(telefoneSemDDI('558399999999'), '8399999999')   // 55 + DDD + 8 dígitos
})

test('número já sem DDI volta intacto', () => {
  assert.equal(telefoneSemDDI('83999999999'), '83999999999')
  assert.equal(telefoneSemDDI('8399999999'), '8399999999')
})

test('ignora máscara e espaços', () => {
  assert.equal(telefoneSemDDI('+55 (83) 99999-9999'), '83999999999')
  assert.equal(telefoneSemDDI(' 55 83 9999-9999 '), '8399999999')
})

test('não corta quando o resto não é um número nacional válido', () => {
  // DDD 55 é de Santa Maria/RS: cortar aqui destruiria o número.
  assert.equal(telefoneSemDDI('5599999999'), '5599999999')   // 10 dígitos, já é nacional
  assert.equal(telefoneSemDDI('55123'), '55123')             // curto demais
  assert.equal(telefoneSemDDI('551234567890123'), '551234567890123') // longo demais
})

test('vazio e nulo devolvem string vazia, sem quebrar', () => {
  assert.equal(telefoneSemDDI(''), '')
  assert.equal(telefoneSemDDI(null), '')
  assert.equal(telefoneSemDDI(undefined), '')
  assert.equal(telefoneSemDDI('abc'), '')
})
