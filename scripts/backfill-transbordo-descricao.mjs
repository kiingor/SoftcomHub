// Backfill: reescreve descrições antigas de ticket_logs.transferencia_automatica
// inferindo origem/destino via setor_receptor_id configurado.
//
// Lógica:
//   - destino: setor atual do ticket (pode estar errado se houve múltiplos transbordos)
//   - origem: qualquer setor cujo setor_receptor_id aponta pro destino
//
// Marca cada descrição reescrita com "(inferido)" pra deixar claro que é
// retroativo e pode ter imprecisão.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log('Carregando setores e regras de transbordo…')
const { data: setores } = await sb.from('setores').select('id, nome, setor_receptor_id')
const setorById = new Map(setores.map(s => [s.id, s]))
// origem_provavel[destinoId] = [setores que têm esse como receptor]
const origensPorDestino = new Map()
for (const s of setores) {
  if (s.setor_receptor_id) {
    if (!origensPorDestino.has(s.setor_receptor_id)) origensPorDestino.set(s.setor_receptor_id, [])
    origensPorDestino.get(s.setor_receptor_id).push(s)
  }
}

console.log('Buscando logs antigos…')
const { data: logs } = await sb
  .from('ticket_logs')
  .select('id, ticket_id, descricao')
  .eq('tipo', 'transferencia_automatica')
  .not('descricao', 'ilike', 'Transbordo:%')

console.log(`${logs.length} logs antigos a processar.`)

// Agrupa por ticket_id pra fazer 1 lookup por ticket
const porTicket = new Map()
for (const l of logs) {
  if (!porTicket.has(l.ticket_id)) porTicket.set(l.ticket_id, [])
  porTicket.get(l.ticket_id).push(l)
}

console.log(`${porTicket.size} tickets distintos.`)
const ticketIds = [...porTicket.keys()]
const { data: tickets } = await sb.from('tickets').select('id, setor_id').in('id', ticketIds)
const ticketSetor = new Map(tickets.map(t => [t.id, t.setor_id]))

const APPLY = process.argv.includes('--apply')
console.log(APPLY ? '\nMODO REAL — vai atualizar o banco' : '\nDRY-RUN — nada será atualizado (passe --apply para gravar)')

let atualizados = 0
let semOrigem = 0
let semDestino = 0
const amostras = []

for (const [ticketId, ticketLogs] of porTicket) {
  const destinoId = ticketSetor.get(ticketId)
  if (!destinoId) { semDestino++; continue }
  const destinoNome = setorById.get(destinoId)?.nome || 'desconhecido'
  const origens = origensPorDestino.get(destinoId) || []
  const origemNome = origens.length === 1
    ? origens[0].nome
    : origens.length > 1
      ? origens.map(o => o.nome).join(' ou ')
      : '?'
  if (origens.length === 0) semOrigem++

  for (const log of ticketLogs) {
    const sufixo = log.descricao?.includes('hop ')
      ? log.descricao.match(/\(hop [^)]+\)/)?.[0] || ''
      : log.descricao?.includes('redistribuição')
        ? '(redistribuição retroativa)'
        : '(retroativo)'
    const nova = `Transbordo: ${origemNome} → ${destinoNome} ${sufixo}`.trim()

    if (amostras.length < 5) {
      amostras.push({ antes: log.descricao, depois: nova })
    }

    if (APPLY) {
      const { error } = await sb.from('ticket_logs').update({ descricao: nova }).eq('id', log.id)
      if (!error) atualizados++
    } else {
      atualizados++
    }
  }
}

console.log(`\n=== Amostra de mudanças ===`)
amostras.forEach((s, i) => {
  console.log(`\n[${i + 1}]`)
  console.log(`  Antes:  ${s.antes}`)
  console.log(`  Depois: ${s.depois}`)
})

console.log(`\n=== Resumo ===`)
console.log(`  ${APPLY ? 'Atualizados' : 'Seriam atualizados'}: ${atualizados}`)
console.log(`  Sem destino detectável (ticket sumiu?): ${semDestino}`)
console.log(`  Sem origem plausível (nenhum setor aponta pro destino): ${semOrigem}`)
if (!APPLY) console.log(`\n→ Pra aplicar de verdade, rode: node --use-system-ca scripts/backfill-transbordo-descricao.mjs --apply`)
