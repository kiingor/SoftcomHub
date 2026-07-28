/**
 * Lista telefones que aparecem em mais de um cadastro de cliente.
 *
 * Nem todo caso é erro. Uma empresa costuma ter mais de uma pessoa entrando em
 * contato, e como não existe separação entre "quem falou" e "qual empresa", os
 * dois viram cadastros distintos. O que este diagnóstico faz é separar os casos
 * em que os nomes são IGUAIS (duplicata provável, candidata a fusão) dos casos
 * em que são DIFERENTES (provavelmente pessoas distintas da mesma empresa).
 *
 * Somente leitura — não altera nada.
 *
 * Uso:
 *   node --use-system-ca scripts/diag-clientes-telefone-duplicado.mjs
 *   node --use-system-ca scripts/diag-clientes-telefone-duplicado.mjs --iguais
 *   node --use-system-ca scripts/diag-clientes-telefone-duplicado.mjs --csv > dup.csv
 *
 * O `--use-system-ca` é obrigatório: a rede corporativa intercepta TLS.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const SO_IGUAIS = args.has('--iguais')
const SO_DIFERENTES = args.has('--diferentes')
const CSV = args.has('--csv')

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

const env = carregarEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** O PostgREST corta em 1.000 linhas sem avisar; só o laço de páginas traz tudo. */
async function todasAsLinhas(tabela, colunas, configurar = (query) => query) {
  const linhas = []
  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await configurar(supabase.from(tabela).select(colunas))
      .order('id', { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999)
    if (error) throw error
    if (!data?.length) break
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

/** Últimos 11 dígitos: ignora DDI, formatação e o 9 opcional já gravado. */
function chaveTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos.slice(-11) : null
}

function normalizarNome(nome) {
  return String(nome || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
}

const clientes = await todasAsLinhas('clientes', 'id, nome, telefone', (query) => query.not('telefone', 'is', null))
const tickets = await todasAsLinhas('tickets', 'id, cliente_id, criado_em')

const ticketsPorCliente = new Map()
for (const ticket of tickets) {
  if (!ticket.cliente_id) continue
  const atual = ticketsPorCliente.get(ticket.cliente_id) || { total: 0, ultimo: null }
  atual.total += 1
  if (!atual.ultimo || ticket.criado_em > atual.ultimo) atual.ultimo = ticket.criado_em
  ticketsPorCliente.set(ticket.cliente_id, atual)
}

const porTelefone = new Map()
for (const cliente of clientes) {
  const chave = chaveTelefone(cliente.telefone)
  if (!chave) continue
  const grupo = porTelefone.get(chave) || []
  grupo.push(cliente)
  porTelefone.set(chave, grupo)
}

const duplicados = [...porTelefone.entries()]
  .filter(([, grupo]) => grupo.length > 1)
  .map(([telefone, grupo]) => {
    const nomes = new Set(grupo.map((cliente) => normalizarNome(cliente.nome)))
    return { telefone, grupo, mesmoNome: nomes.size === 1 }
  })

const iguais = duplicados.filter((item) => item.mesmoNome)
const diferentes = duplicados.filter((item) => !item.mesmoNome)

if (CSV) {
  console.log('telefone,classificacao,cliente_id,nome,tickets,ultimo_ticket')
  for (const { telefone, grupo, mesmoNome } of duplicados) {
    for (const cliente of grupo) {
      const uso = ticketsPorCliente.get(cliente.id) || { total: 0, ultimo: '' }
      const nome = `"${String(cliente.nome || '').replace(/"/g, '""')}"`
      console.log(`${telefone},${mesmoNome ? 'nome_igual' : 'nome_diferente'},${cliente.id},${nome},${uso.total},${uso.ultimo || ''}`)
    }
  }
  process.exit(0)
}

console.log(`clientes com telefone preenchido: ${clientes.length}`)
console.log(`telefones em mais de um cadastro: ${duplicados.length}`)
console.log(`  nome igual     (duplicata provável, candidata a fusão): ${iguais.length}`)
console.log(`  nome diferente (provável outra pessoa da mesma empresa): ${diferentes.length}`)

const mostrar = SO_IGUAIS ? iguais : SO_DIFERENTES ? diferentes : duplicados
const rotulo = SO_IGUAIS ? 'NOME IGUAL' : SO_DIFERENTES ? 'NOME DIFERENTE' : 'TODOS'
console.log(`\n=== ${rotulo} — ${mostrar.length} caso(s) ===`)
console.log('Ordenado por uso: os que têm mais ticket aparecem primeiro.\n')

const comUso = mostrar
  .map((item) => ({
    ...item,
    uso: item.grupo.reduce((soma, cliente) => soma + (ticketsPorCliente.get(cliente.id)?.total || 0), 0),
  }))
  .sort((primeiro, segundo) => segundo.uso - primeiro.uso)

for (const { telefone, grupo, mesmoNome, uso } of comUso.slice(0, 60)) {
  console.log(`${telefone}  ${mesmoNome ? '[nome igual]' : '[nome diferente]'}  ${uso} ticket(s) no total`)
  for (const cliente of grupo) {
    const info = ticketsPorCliente.get(cliente.id) || { total: 0, ultimo: null }
    const ultimo = info.ultimo ? info.ultimo.slice(0, 10) : 'nunca'
    console.log(`   ${String(info.total).padStart(4)} tickets · último ${ultimo} · ${cliente.id.slice(0, 8)} · ${cliente.nome || '(sem nome)'}`)
  }
  console.log()
}

if (comUso.length > 60) console.log(`... e mais ${comUso.length - 60}. Use --csv para a lista completa.`)
