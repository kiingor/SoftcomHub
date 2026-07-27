import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ids = ['1361d405-b464-4a7d-8959-60cbd524a33c','a7ecae9e-e8e3-466e-927a-0f8c832508d7','ab929652-6d8c-4998-83a9-acaeb35ac13c','bc71b0d2-ebe7-4d79-b8bc-96e96a9c2ab0','e61ca63e-74e1-410f-a321-cdc42173f546','f0563e0f-9a13-4cca-96ac-567399229af1','b235f3e3-f24f-4fc6-a61a-39654bbc3013','b42f8d76-bc0f-4599-9647-fa24e26867d1']
const { data, error } = await sb.from('ticket_logs').select('ticket_id, tipo, descricao, criado_em').in('ticket_id', ids).order('criado_em', {ascending:true})
if (error) { console.error(error.message); process.exit(1) }
for (const id of ids) {
  console.log(`\n--- ${id} ---`)
  const rows = data.filter(l => l.ticket_id === id)
  if (rows.length === 0) console.log('  (nenhum log)')
  rows.forEach(l => console.log(`  ${l.tipo}: ${l.descricao} (${l.criado_em})`))
}
