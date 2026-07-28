/**
 * Procura os dois padrões de consulta que já falharam calados neste projeto.
 *
 * 1. ERRO DESCARTADO — `const { data } = await supabase...` sem olhar `error`.
 *    Quando a consulta é recusada, `data` vem nulo e a tela abre vazia sem
 *    nada no console. Foi assim que o modal de detalhes em Dashboard → Tickets
 *    ficou meses sem mostrar log nem mensagem, e assim que o histórico do
 *    WorkDesk abria em branco.
 *
 * 2. LEITURA SEM TETO — `.select()` sem `.single()`, `.limit()`, `.range()` nem
 *    o helper de paginação. O PostgREST corta em 1.000 linhas e NÃO avisa, o
 *    que já produziu quatro bugs distintos: avaliações somando zero, dias
 *    zerados no gráfico de pico, histórico de conversa mostrando as mensagens
 *    mais antigas em vez das recentes, e contagem errada na distribuição.
 *
 * Não acessa o banco — é análise de texto, roda em qualquer lugar.
 *
 * Uso:
 *   node scripts/check-supabase-usage.mjs
 *   node scripts/check-supabase-usage.mjs --erros
 *   node scripts/check-supabase-usage.mjs --teto
 *   node scripts/check-supabase-usage.mjs --baseline   (grava o estado atual)
 *
 * Com `.supabase-usage-baseline.json` presente, só falha em ocorrência NOVA —
 * assim dá para barrar regressão sem precisar limpar as 171 antigas primeiro.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const GRAVAR_BASELINE = args.has('--baseline')
const SO_ERROS = args.has('--erros')
const SO_TETO = args.has('--teto')
const ARQUIVO_BASELINE = '.supabase-usage-baseline.json'

const arquivos = execSync('git ls-files "app/*.ts" "app/*.tsx" "lib/*.ts" "components/*.tsx"', {
  encoding: 'utf8',
}).split('\n').filter(Boolean)

/** Percorre a cadeia a partir de `.from(`, parando ao sair do embrulho. */
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

const achados = []

for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, 'utf8')
  let indice = 0

  while ((indice = texto.indexOf('.from(', indice)) !== -1) {
    const inicio = indice
    const cadeia = extrairCadeia(texto, inicio)
    indice = inicio + 6

    const tabela = (cadeia.match(/^\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/i) || [])[1]
    if (!tabela || !cadeia.includes('.select(')) continue

    const linha = texto.slice(0, inicio).split('\n').length
    const antes = texto.slice(Math.max(0, inicio - 400), inicio)
    const chave = `${arquivo}:${tabela}`

    // 1. Erro descartado — só vale para quem desestrutura na hora. Dentro de um
    // helper de paginação o erro já é tratado lá, então não conta.
    const dentroDeHelper = /loadRowsByPages|loadRowsByValues|scanMessageMetadata|todasAsLinhas/.test(antes)
    const desestrutura = /const\s*\{[^}]*\}\s*=\s*await\s*$/.test(antes.replace(/\s+$/, '') + ' ')
      || /const\s*\{[^}]*\}\s*=\s*await\s*[\s\S]{0,80}$/.test(antes)
    const olhaErro = /\berror\b/.test(antes.slice(-200)) || /\.throwOnError\(/.test(cadeia)
    if (!SO_TETO && desestrutura && !olhaErro && !dentroDeHelper) {
      achados.push({ tipo: 'erro-descartado', chave, arquivo, linha, tabela })
    }

    // 2. Leitura sem teto.
    const limitado = /\.(single|maybeSingle|range)\(/.test(cadeia)
      || /head:\s*true/.test(cadeia)
      || /\.limit\(\s*\d+\s*\)/.test(cadeia)
    if (!SO_ERROS && !limitado && !dentroDeHelper) {
      achados.push({ tipo: 'leitura-sem-teto', chave, arquivo, linha, tabela })
    }
  }
}

const porTipo = (tipo) => achados.filter((a) => a.tipo === tipo)

if (GRAVAR_BASELINE) {
  const baseline = {}
  for (const achado of achados) {
    baseline[achado.tipo] = baseline[achado.tipo] || {}
    baseline[achado.tipo][achado.chave] = (baseline[achado.tipo][achado.chave] || 0) + 1
  }
  writeFileSync(ARQUIVO_BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  console.log(`baseline gravado em ${ARQUIVO_BASELINE}`)
  console.log(`  erro descartado:  ${porTipo('erro-descartado').length}`)
  console.log(`  leitura sem teto: ${porTipo('leitura-sem-teto').length}`)
  process.exit(0)
}

console.log(`consultas analisadas em ${arquivos.length} arquivos`)
console.log(`  erro descartado:  ${porTipo('erro-descartado').length}`)
console.log(`  leitura sem teto: ${porTipo('leitura-sem-teto').length}`)

if (!existsSync(ARQUIVO_BASELINE)) {
  console.log(`\nSem ${ARQUIVO_BASELINE}. Rode com --baseline para congelar o estado atual`)
  console.log('e passar a barrar apenas ocorrência nova.')
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(ARQUIVO_BASELINE, 'utf8'))
const atual = {}
for (const achado of achados) {
  atual[achado.tipo] = atual[achado.tipo] || {}
  atual[achado.tipo][achado.chave] = (atual[achado.tipo][achado.chave] || 0) + 1
}

const novos = []
for (const [tipo, porChave] of Object.entries(atual)) {
  for (const [chave, quantidade] of Object.entries(porChave)) {
    const antes = baseline[tipo]?.[chave] || 0
    if (quantidade > antes) {
      const exemplos = achados.filter((a) => a.tipo === tipo && a.chave === chave).slice(-(quantidade - antes))
      novos.push({ tipo, chave, antes, agora: quantidade, exemplos })
    }
  }
}

if (novos.length === 0) {
  console.log('\n✓ nenhuma ocorrência nova além do baseline')
  process.exit(0)
}

console.log(`\n✗ ${novos.length} regressão(ões) — padrão que já causou bug aqui:\n`)
for (const item of novos) {
  const rotulo = item.tipo === 'erro-descartado'
    ? 'erro da consulta descartado (a tela abre vazia sem avisar)'
    : 'leitura sem teto (o PostgREST corta em 1.000 sem avisar)'
  console.log(`  ${item.chave} — ${rotulo}`)
  console.log(`     era ${item.antes}, agora ${item.agora}`)
  for (const exemplo of item.exemplos) console.log(`     ${exemplo.arquivo}:${exemplo.linha}`)
  console.log()
}
process.exit(1)
