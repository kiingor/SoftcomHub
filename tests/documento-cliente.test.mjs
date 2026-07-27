import assert from 'node:assert/strict'
import test from 'node:test'
import {
  documentoVariants,
  formatDocumento,
  formatDocumentoInput,
  isDocumentoValido,
  normalizeDocumento,
  rotuloDocumento,
  tipoDocumento,
} from '../lib/documento-cliente.ts'

const CNPJ = '18944145000106'
const CPF_MEI = '24547514291' // formato do cadastro MEI real da base

test('aceita CPF de 11 dígitos — é o caso que o disparo rejeitava antes', () => {
  assert.equal(isDocumentoValido(CPF_MEI), true)
  assert.equal(tipoDocumento(CPF_MEI), 'cpf')
  assert.equal(rotuloDocumento(CPF_MEI), 'CPF')
})

test('continua aceitando CNPJ de 14 dígitos', () => {
  assert.equal(isDocumentoValido(CNPJ), true)
  assert.equal(tipoDocumento(CNPJ), 'cnpj')
  assert.equal(rotuloDocumento(CNPJ), 'CNPJ')
})

test('rejeita documento incompleto ou fora dos dois tamanhos válidos', () => {
  for (const invalido of ['', '   ', '123', '2454751429', '245475142912', '189441450001067', null, undefined]) {
    assert.equal(isDocumentoValido(invalido), false, `deveria rejeitar ${JSON.stringify(invalido)}`)
    assert.equal(tipoDocumento(invalido), null)
  }
})

test('normaliza qualquer pontuação para só dígitos', () => {
  assert.equal(normalizeDocumento('245.475.142-91'), CPF_MEI)
  assert.equal(normalizeDocumento('18.944.145/0001-06'), CNPJ)
  assert.equal(normalizeDocumento(' 245475142 91 '), CPF_MEI)
  assert.equal(normalizeDocumento(null), '')
  assert.equal(normalizeDocumento({}), '')
})

test('formata CPF e CNPJ com máscaras diferentes', () => {
  assert.equal(formatDocumento(CPF_MEI), '245.475.142-91')
  assert.equal(formatDocumento(CNPJ), '18.944.145/0001-06')
  assert.equal(formatDocumento('245.475.142-91'), '245.475.142-91')
})

test('documento fora do padrão volta como veio, sem virar lixo na tela', () => {
  // a base tem cadastros com 12 e 15 dígitos
  assert.equal(formatDocumento('374838000145'), '374838000145')
  assert.equal(formatDocumento('313333643000180'), '313333643000180')
  assert.equal(formatDocumento(null), '')
  assert.equal(formatDocumento(''), '')
})

test('a máscara de digitação migra de CPF para CNPJ ao passar de 11 dígitos', () => {
  assert.equal(formatDocumentoInput('245'), '245')
  assert.equal(formatDocumentoInput('245475'), '245.475')
  assert.equal(formatDocumentoInput('24547514291'), '245.475.142-91')
  // o 12º dígito reclassifica o documento como CNPJ
  assert.equal(formatDocumentoInput('245475142912'), '24.547.514/2912')
  assert.equal(formatDocumentoInput('18944145000106'), '18.944.145/0001-06')
})

test('a máscara de digitação nunca deixa passar mais de 14 dígitos', () => {
  assert.equal(formatDocumentoInput('189441450001069999'), '18.944.145/0001-06')
  assert.equal(normalizeDocumento(formatDocumentoInput('189441450001069999')).length, 14)
})

test('a máscara de digitação ignora letras e não trava em campo vazio', () => {
  assert.equal(formatDocumentoInput(''), '')
  assert.equal(formatDocumentoInput('abc'), '')
  assert.equal(formatDocumentoInput('24a5b4'), '245.4')
})

test('a busca no banco cobre documento gravado cru e com máscara', () => {
  assert.deepEqual(documentoVariants(CPF_MEI), [CPF_MEI, '245.475.142-91'])
  assert.deepEqual(documentoVariants(CNPJ), [CNPJ, '18.944.145/0001-06'])
  assert.deepEqual(documentoVariants(''), [])
  // documento fora do padrão não gera variante duplicada
  assert.deepEqual(documentoVariants('374838000145'), ['374838000145'])
})
