/**
 * Confere se toda coluna que o código usa existe de verdade no banco.
 *
 * Os dois incidentes de 28/07/2026 foram exatamente isto: código pedindo coluna
 * que não existe. O envio caía num caminho legado silencioso porque faltavam
 * `mensagens.envio_tentativa_id` e `envio_tentativa_em`; o modal de detalhes
 * abria vazio porque ordenava por `created_at`, que também não existe. Nos dois
 * casos o PostgREST recusou a consulta e o erro foi descartado — nenhum teste
 * pegaria, porque não é lógica, é contrato entre o código e o banco.
 *
 * Somente leitura. Sai com código 1 quando encontra divergência, para servir
 * de porta no CI.
 *
 * Uso:
 *   node --use-system-ca scripts/check-schema-contract.mjs
 *   node --use-system-ca scripts/check-schema-contract.mjs --verbose
 *
 * O `--use-system-ca` é obrigatório: a rede corporativa intercepta TLS.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const VERBOSE = process.argv.includes('--verbose')

/** Nomes que aparecem como coluna mas são função, literal ou contagem. */
const NAO_SAO_COLUNAS = new Set(['*', 'count', 'null', 'true', 'false'])

function carregarEnv() {
  const texto = readFileSync('.env.local', 'utf8')
  return Object.fromEntries(
    texto.split('\n')
      .filter((linha) => linha && !linha.startsWith('#') && linha.includes('='))
      .map((linha) => {
        const corte = linha.indexOf('=')
        return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

/** Divide por vírgula respeitando os parênteses dos embeds. */
function dividirNoTopo(texto) {
  const partes = []
  let profundidade = 0
  let atual = ''
  for (const caractere of texto) {
    if (caractere === '(') profundidade += 1
    if (caractere === ')') profundidade -= 1
    if (caractere === ',' && profundidade === 0) {
      partes.push(atual)
      atual = ''
      continue
    }
    atual += caractere
  }
  if (atual.trim()) partes.push(atual)
  return partes
}

/**
 * Extrai as colunas de uma string de `.select()`.
 *
 * Ignora embeds (`setores(id, nome)`) porque são relações, não colunas, e o
 * alias de embed (`origem:setor_origem_id(...)`) porque a chave estrangeira já
 * é validada pelo próprio PostgREST na hora do embed.
 */
function colunasDoSelect(texto) {
  const colunas = []
  for (const parteBruta of dividirNoTopo(texto)) {
    const parte = parteBruta.trim()
    if (!parte || parte.includes('(')) continue
    const semAlias = parte.includes(':') ? parte.slice(parte.indexOf(':') + 1) : parte
    const nome = semAlias.trim()
    if (!nome || NAO_SAO_COLUNAS.has(nome) || nome.includes('.') || nome.includes('!')) continue
    if (!/^[a-z_][a-z0-9_]*$/i.test(nome)) continue
    colunas.push(nome)
  }
  return colunas
}

/**
 * Percorre a cadeia a partir de `.from(` até ela terminar.
 *
 * A profundidade fica NEGATIVA quando a consulta está embrulhada numa chamada
 * externa — `loadRowsByPages(() => supabase.from(...))` é o caso comum aqui. O
 * `)` que fecha o embrulho aparece antes de qualquer quebra em nível zero, e
 * sem esta parada a cadeia engolia o código seguinte: era isso que fazia colunas
 * de `colaboradores` serem cobradas de `mensagens`.
 */
function extrairCadeia(texto, inicio) {
  let profundidade = 0
  let cadeia = ''
  for (let i = inicio; i < texto.length && cadeia.length < 4000; i += 1) {
    const caractere = texto[i]
    if (caractere === ')' && profundidade === 0) break
    cadeia += caractere
    if (caractere === '(') profundidade += 1
    else if (caractere === ')') profundidade -= 1
    else if (caractere === '\n' && profundidade === 0) {
      let j = i + 1
      while (j < texto.length && /\s/.test(texto[j])) j += 1
      if (texto[j] !== '.') break
    }
  }
  return cadeia
}

const arquivos = execSync('git ls-files "app/*.ts" "app/*.tsx" "lib/*.ts" "components/*.tsx"', {
  encoding: 'utf8',
}).split('\n').filter(Boolean)

/** tabela -> Map<coluna, Set<"arquivo:linha">> */
const usos = new Map()

for (const arquivo of arquivos) {
  // Arquivo listado pelo git mas ausente em disco (renomeado ou apagado
    // sem stage) não pode derrubar a verificação inteira no CI.
    if (!existsSync(arquivo)) continue
    const texto = readFileSync(arquivo, 'utf8')
  let indice = 0
  while ((indice = texto.indexOf('.from(', indice)) !== -1) {
    const cadeia = extrairCadeia(texto, indice)
    const linha = texto.slice(0, indice).split('\n').length
    const origem = `${arquivo}:${linha}`
    indice += 6

    const tabela = (cadeia.match(/^\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/i) || [])[1]
    if (!tabela) continue

    const colunas = new Set()

    for (const [, corpo] of cadeia.matchAll(/\.select\(\s*[`'"]([\s\S]*?)[`'"]/g)) {
      colunasDoSelect(corpo).forEach((coluna) => colunas.add(coluna))
    }

    // Filtros e ordenação recebem a coluna como primeiro argumento literal.
    const filtros = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|order|contains|overlaps)\(\s*['"]([a-z_][a-z0-9_]*)['"]/g
    for (const [, , coluna] of cadeia.matchAll(filtros)) colunas.add(coluna)

    if (colunas.size === 0) continue
    const doBanco = usos.get(tabela) || new Map()
    for (const coluna of colunas) {
      const origens = doBanco.get(coluna) || new Set()
      origens.add(origem)
      doBanco.set(coluna, origens)
    }
    usos.set(tabela, doBanco)
  }
}

const env = carregarEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const problemas = []
let colunasConferidas = 0

for (const [tabela, colunas] of [...usos.entries()].sort()) {
  const { error: erroTabela } = await supabase.from(tabela).select('*').limit(1)
  if (erroTabela) {
    problemas.push({
      tabela,
      coluna: null,
      motivo: erroTabela.message.slice(0, 90),
      origens: [...new Set([...colunas.values()].flatMap((o) => [...o]))].slice(0, 3),
    })
    continue
  }

  // Uma linha já revela todas as colunas — evita uma consulta por coluna, que
  // deixaria a verificação lenta demais para rodar em cada PR. Tabela vazia não
  // revela nada, então aí cai no teste individual.
  const { data: amostra } = await supabase.from(tabela).select('*').limit(1)
  const conhecidas = amostra?.[0] ? new Set(Object.keys(amostra[0])) : null

  for (const [coluna, origens] of colunas) {
    colunasConferidas += 1
    let mensagemErro = null

    if (conhecidas) {
      if (!conhecidas.has(coluna)) mensagemErro = `column ${tabela}.${coluna} does not exist`
    } else {
      const { error } = await supabase.from(tabela).select(coluna).limit(1)
      if (error) mensagemErro = error.message.slice(0, 90)
    }

    if (mensagemErro) {
      problemas.push({ tabela, coluna, motivo: mensagemErro, origens: [...origens].slice(0, 4) })
    } else if (VERBOSE) {
      console.log(`ok    ${tabela}.${coluna}`)
    }
  }
}

console.log(`tabelas referenciadas: ${usos.size} · colunas conferidas: ${colunasConferidas}`)

if (problemas.length === 0) {
  console.log('\n✓ contrato íntegro: toda coluna usada pelo código existe no banco')
  process.exit(0)
}

console.log(`\n✗ ${problemas.length} divergência(s) entre o código e o banco:\n`)
for (const problema of problemas) {
  const alvo = problema.coluna ? `${problema.tabela}.${problema.coluna}` : `tabela ${problema.tabela}`
  console.log(`  ${alvo}`)
  console.log(`     ${problema.motivo}`)
  for (const origem of problema.origens) console.log(`     usado em ${origem}`)
  console.log()
}
process.exit(1)
