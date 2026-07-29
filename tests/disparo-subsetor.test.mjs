import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
      resolvedPath = `${resolvedPath}.ts`
    }
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const { escolherSubsetorDoCriador } = await import('../lib/disparo-processor.ts')

test('herda o subsetor quando o criador tem exatamente um no setor', () => {
  assert.equal(escolherSubsetorDoCriador(['sub-suporte']), 'sub-suporte')
})

test('não adivinha quando o criador está em mais de um subsetor', () => {
  // Preencher aqui seria escolher o roteamento no lugar do gestor.
  assert.equal(escolherSubsetorDoCriador(['sub-suporte', 'sub-financeiro']), null)
})

test('o mesmo subsetor repetido continua sendo escolha única', () => {
  assert.equal(escolherSubsetorDoCriador(['sub-suporte', 'sub-suporte']), 'sub-suporte')
})

test('criador sem vínculo deixa o ticket como era antes', () => {
  assert.equal(escolherSubsetorDoCriador([]), null)
  assert.equal(escolherSubsetorDoCriador([null, undefined]), null)
})
