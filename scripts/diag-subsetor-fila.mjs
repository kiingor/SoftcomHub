// Diagnóstico SOMENTE LEITURA: o ticket está sem subsetor no banco, ou a tela
// é que não resolve o nome? A coluna "Fila" cai em "Sem subsetor" nos dois
// casos, então só o dado responde.
//
//   node --use-system-ca scripts/diag-subsetor-fila.mjs <setor_id> [numero...]
//
// O `--use-system-ca` é obrigatório: o proxy corporativo intercepta o TLS e o
// fetch do Node falha sem ele.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
  const par = linha.match(/^([A-Z_]+)=(.*)$/)
  if (par && !process.env[par[1]]) process.env[par[1]] = par[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const [setorId, ...numeros] = process.argv.slice(2)
if (!setorId) {
  console.error('uso: node --use-system-ca scripts/diag-subsetor-fila.mjs <setor_id> [numero...]')
  process.exit(1)
}

const { data: subsetores, error: erroSubsetores } = await supabase
  .from('subsetores')
  .select('id, nome, ativo')
  .eq('setor_id', setorId)
if (erroSubsetores) throw erroSubsetores

console.log(`\nSubsetores cadastrados no setor (${subsetores.length}):`)
for (const s of subsetores) console.log(`  ${s.id}  ${s.nome}${s.ativo === false ? '  [INATIVO]' : ''}`)

let query = supabase
  .from('tickets')
  .select('numero, id, status, subsetor_id, colaborador_id, criado_em')
  .eq('setor_id', setorId)
  .in('status', ['aberto', 'em_atendimento'])
  .order('criado_em', { ascending: false })
  .limit(200)
if (numeros.length > 0) query = query.in('numero', numeros.map(Number))

const { data: tickets, error: erroTickets } = await query
if (erroTickets) throw erroTickets

const nomePorId = new Map(subsetores.map((s) => [s.id, s.nome]))
let semSubsetor = 0
let orfaos = 0

console.log(`\nTickets ativos analisados: ${tickets.length}`)
for (const t of tickets) {
  if (!t.subsetor_id) {
    semSubsetor++
    if (numeros.length > 0) console.log(`  #${t.numero}  subsetor_id = NULL  (o ticket nasceu sem subsetor)`)
    continue
  }
  if (!nomePorId.has(t.subsetor_id)) {
    orfaos++
    console.log(`  #${t.numero}  subsetor_id = ${t.subsetor_id}  ÓRFÃO — não pertence a este setor`)
    continue
  }
  if (numeros.length > 0) console.log(`  #${t.numero}  ${nomePorId.get(t.subsetor_id)}`)
}

console.log('\nVeredito:')
console.log(`  sem subsetor no banco (subsetor_id NULL): ${semSubsetor}`)
console.log(`  com subsetor que a tela não resolve (órfão): ${orfaos}`)
console.log(`  com subsetor resolvido: ${tickets.length - semSubsetor - orfaos}`)
console.log(
  orfaos > 0
    ? '\n  -> Há órfãos: a tela ESTÁ escondendo subsetor existente.'
    : '\n  -> Sem órfãos: "Sem subsetor" reflete o dado; o ticket nasce sem subsetor.',
)
